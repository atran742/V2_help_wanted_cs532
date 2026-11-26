const crypto = require("node:crypto");
const express = require("express");
const cors = require("cors");
const path = require("node:path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const pool = require("./config/db");

const app = express();
const PORT = process.env.PORT || 3000;
const sessions = new Map();
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const VALID_ROLES = new Set(["student", "faculty", "advisor", "admin"]);

app.use(cors());
app.use(express.json({ limit: "100kb" }));

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRole(value) {
  const role = clean(value).toLowerCase();
  const aliases = {
    administrator: "admin",
    "system administrator": "admin",
    professor: "faculty",
    "major advisor": "advisor",
    adviser: "advisor",
  };
  return aliases[role] || (VALID_ROLES.has(role) ? role : "unknown");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedValue) {
  const [salt, expectedHex] = String(storedValue || "").split(":");
  if (!salt || !expectedHex) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function publicUser(row) {
  if (!row) return row;
  const { PasswordHash: _passwordHash, passwordhash: _passwordhash, ...safe } = row;
  return {
    ...safe,
    EmployeeNumber: safe.AccountNumber,
    UserName: safe.UserName || String(safe.Email || "").split("@")[0],
    AccountType: normalizeRole(safe.AccountType),
    JobTitle: safe.JobTitle || safe.AccountType,
  };
}

function validateCredentials(body) {
  const identifier = clean(body?.username || body?.redId || body?.email);
  const password = typeof body?.password === "string" ? body.password : "";
  if (!identifier || identifier.length > 320 || password.length < 8) {
    return { error: "A user ID/email and a password of at least 8 characters are required." };
  }
  return { identifier, password };
}

function requireAuth(...roles) {
  return (req, res, next) => {
    const authorization = req.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const session = sessions.get(token);
    if (!session || session.expiresAt <= Date.now()) {
      if (session) sessions.delete(token);
      return res.status(401).json({ error: "Authentication is required." });
    }
    if (roles.length && !roles.includes(session.role)) {
      return res.status(403).json({ error: "You are not authorized to perform this action." });
    }
    req.auth = session;
    next();
  };
}

function invalidateSessions(accountNumber, except = null) {
  for (const [token, session] of sessions) {
    if (session.accountNumber === accountNumber && session !== except) {
      sessions.delete(token);
    }
  }
}

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function recordAudit(client, auth, action) {
  await client.query(
    `INSERT INTO signmeup."TransactionAudit" ("EmployeeNumber", "Action")
     VALUES ($1, $2)`,
    [auth.accountNumber, action],
  );
}

async function createAdminRecord(req, res, resource, action, query, values) {
  try {
    const saved = await withTransaction(async (client) => {
      const result = await client.query(query, values);
      await recordAudit(client, req.auth, action);
      return result.rows[0];
    });
    return res.status(201).json(saved);
  } catch (error) {
    return databaseError(res, resource, error);
  }
}

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function validDate(value) {
  const date = clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth;
}

function recordId(value) {
  const id = typeof value === "number" && Number.isSafeInteger(value)
    ? String(value)
    : clean(value);
  return id.length > 0 && id.length <= 30 ? id : null;
}

function databaseError(res, resource, error) {
  console.error(`Failed to update ${resource}`, error);
  if (["23503", "23505", "23514", "23502"].includes(error.code)) {
    return res.status(409).json({ error: `Could not update ${resource}; check related records and values.` });
  }
  return res.status(500).json({ error: `Could not update ${resource}.` });
}

function registerGetEndpoint(path, query, resource, roles = []) {
  app.get(path, requireAuth(...roles), async (_req, res) => {
    try {
      const result = await pool.query(query);
      res.status(200).json(result.rows);
    } catch (error) {
      console.error(`Failed to retrieve ${resource}`, error);
      res.status(500).json({ error: `Could not retrieve ${resource}.` });
    }
  });
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "signmeup-api" });
});

app.get("/health/database", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Database health check failed", error);
    res.status(503).json({ status: "error", database: "unavailable" });
  }
});

const getEndpoints = [
  [
    "/api/students",
    'SELECT * FROM er."Student" ORDER BY "StudentID"',
    "students",
  ],
  ["/students", 'SELECT * FROM er."Student" ORDER BY "StudentID"', "students"],
  [
    "/api/student-notes",
    'SELECT * FROM er."StudentNote" ORDER BY "StudentID", "CreateDate"',
    "student notes",
  ],
  [
    "/api/transcripts",
    'SELECT * FROM er."Transcript" ORDER BY "StudentID", "TranscriptID"',
    "transcripts",
  ],
  [
    "/api/transfer-courses",
    `SELECT transfer.*, transfer."CourseID" AS "EquivalentCourseID", course."Units" AS "Units"
     FROM er."TransferCourse" AS transfer
     LEFT JOIN reg."Course" AS course ON course."CourseID" = transfer."CourseID"
     ORDER BY transfer."StudentID", transfer."TransferCourseID"`,
    "transfer courses",
  ],
  [
    "/api/departments",
    'SELECT * FROM reg."Department" ORDER BY "DepartmentCode"',
    "departments",
  ],
  ["/api/courses", 'SELECT * FROM reg."Course" ORDER BY "CourseID"', "courses"],
  [
    "/api/prerequisites",
    'SELECT * FROM reg."Prerequisite" ORDER BY "CourseID", "PrereqID"',
    "course prerequisites",
  ],
  ["/api/classes", 'SELECT * FROM reg."Class" ORDER BY "ClassID"', "classes"],
  [
    "/api/enrollments",
    'SELECT * FROM reg."Enrollment" ORDER BY "StudentID", "ClassID"',
    "enrollments",
  ],
  ["/api/majors", 'SELECT * FROM major."Major" ORDER BY "MajorID"', "majors"],
  [
    "/api/major-courses",
    'SELECT * FROM major."MajorCourse" ORDER BY "MajorID", "CourseID"',
    "major courses",
  ],
  [
    "/api/major-advisors",
    'SELECT * FROM major."MajorAdvisor" ORDER BY "MajorID", "EmployeeNumber"',
    "major advisors",
  ],
  [
    "/api/approved-outlines",
    'SELECT * FROM major."ApprovedOutline" ORDER BY "StudentID", "OutlineID"',
    "approved outlines",
  ],
  [
    "/api/outline-entries",
    'SELECT * FROM major."OutlineEntry" ORDER BY "OutlineID", "CourseID"',
    "outline entries",
  ],
  [
    "/api/outline-history",
    'SELECT * FROM major."OutlineHistory" ORDER BY "OutlineID", "ChangedAt"',
    "outline history",
  ],
  ["/api/faculty", 'SELECT * FROM fci."Faculty" ORDER BY "FacultyID"', "faculty"],
  [
    "/api/faculty-teaching-departments",
    'SELECT * FROM fci."FacultyTeachingDepartment" ORDER BY "FacultyID", "DepartmentCode"',
    "faculty teaching departments",
  ],
  [
    "/api/qualified-faculty",
    'SELECT * FROM fci."QualifiedFaculty" ORDER BY "FacultyID", "CourseID"',
    "faculty qualifications",
  ],
  [
    "/api/grades",
    'SELECT * FROM grade."CourseGrade" ORDER BY "ClassID", "StudentID"',
    "grades",
  ],
  [
    "/api/course-comments",
    'SELECT * FROM grade."CourseComment" ORDER BY "ClassID"',
    "course comments",
  ],
  [
    "/api/audit",
    'SELECT * FROM signmeup."TransactionAudit" ORDER BY "CreatedAt" DESC, "AuditID" DESC',
    "audit events",
  ],
  [
    "/api/subsystems",
    `SELECT "SubsystemID", "SubsystemID"::text AS "SubsystemCode",
     "SubsystemID"::text AS "SubsystemName"
     FROM signmeup."Subsystem" ORDER BY "SubsystemID"`,
    "subsystems",
  ],
  [
    "/api/subsystem-access",
    `SELECT "AccountNumber" AS "EmployeeNumber", "SubsystemID"
     FROM signmeup."SubsystemAccess" ORDER BY "AccountNumber", "SubsystemID"`,
    "subsystem access",
  ],
];

for (const [path, query, resource] of getEndpoints) {
  registerGetEndpoint(path, query, resource);
}

app.post("/api/courses", requireAuth("admin"), async (req, res) => {
  const courseNumber = clean(req.body?.courseNumber);
  const units = positiveInteger(req.body?.units);
  const title = clean(req.body?.title);
  const description = clean(req.body?.description);
  const departmentCode = clean(req.body?.departmentCode);
  const courseLevel = clean(req.body?.courseLevel);
  const courseId = `${departmentCode} ${courseNumber}`;
  if (
    !/^\d{3}$/.test(courseNumber) || Number(courseNumber) < 1 ||
    !departmentCode || departmentCode.length > 26 || /\s/.test(departmentCode) ||
    !units || !title || title.length > 200 ||
    description.length > 2000 ||
    !["lower", "upper", "graduate"].includes(courseLevel)
  ) {
    return res.status(400).json({ error: "Provide a department code, a 3-digit course number from 001 to 999, a title, positive units, and a valid course level." });
  }
  try {
    const course = await withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO reg."Course"
           ("CourseID", "Units", "Title", "Description", "DepartmentCode", "CourseLevel")
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [courseId, units, title, description, departmentCode, courseLevel],
      );
      await recordAudit(client, req.auth, `Added course ${courseId}`);
      return result.rows[0];
    });
    res.status(201).json(course);
  } catch (error) {
    databaseError(res, "course", error);
  }
});

app.post("/api/classes", requireAuth("admin"), async (req, res) => {
  const courseId = recordId(req.body?.courseId);
  const scheduleNumber = clean(req.body?.scheduleNumber);
  const instructorValue = clean(req.body?.instructorId);
  const instructorId = instructorValue ? positiveInteger(instructorValue) : null;
  const semesterStart = clean(req.body?.semesterStart);
  const semesterEnd = clean(req.body?.semesterEnd);
  const meetingTime = clean(req.body?.meetingTime);
  const location = clean(req.body?.location);
  const capacity = nonNegativeInteger(req.body?.capacity);
  if (
    !courseId || !scheduleNumber || scheduleNumber.length > 30 ||
    (instructorValue && !instructorId) ||
    !validDate(semesterStart) || !validDate(semesterEnd) || semesterEnd < semesterStart ||
    !meetingTime || meetingTime.length > 160 || !location || location.length > 160 ||
    capacity === null
  ) {
    return res.status(400).json({ error: "Provide a valid course, schedule number, semester range, meeting time, location, and non-negative capacity." });
  }
  try {
    const offering = await withTransaction(async (client) => {
      if (instructorId) {
        const instructor = await client.query(
          `SELECT "FacultyID" FROM fci."Faculty" WHERE "FacultyID" = $1`,
          [instructorId],
        );
        if (!instructor.rowCount) {
          const error = new Error("The selected instructor is not in the faculty directory.");
          error.status = 400;
          throw error;
        }
      }
      const result = await client.query(
        `INSERT INTO reg."Class"
           ("ScheduleNumber", "Instructor", "InstructorEmployeeNumber", "Semester",
            "SemesterStart", "SemesterEnd", "CourseID", "Location", "MeetingTime", "Capacity")
         VALUES ($1, $2, $3, daterange($4::date, ($5::date + 1), '[)'), $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          scheduleNumber,
          instructorId ? String(instructorId) : "Unassigned",
          instructorId,
          semesterStart,
          semesterEnd,
          courseId,
          location,
          meetingTime,
          capacity,
        ],
      );
      await recordAudit(client, req.auth, `Added class offering ${scheduleNumber} for course ${courseId}`);
      return result.rows[0];
    });
    res.status(201).json(offering);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    databaseError(res, "class offering", error);
  }
});

app.post("/api/departments", requireAuth("admin"), async (req, res) => {
  const departmentCode = clean(req.body?.departmentCode);
  const departmentName = clean(req.body?.departmentName);
  if (
    !/^[A-Za-z0-9-]{1,26}$/.test(departmentCode) ||
    !departmentName || departmentName.length > 160
  ) {
    return res.status(400).json({ error: "Provide a department code of 1 to 26 letters, numbers, or hyphens and a name of at most 160 characters." });
  }
  return createAdminRecord(
    req,
    res,
    "department",
    `Added department ${departmentCode}`,
    `INSERT INTO reg."Department" ("DepartmentCode", "DepartmentName")
     VALUES ($1, $2) RETURNING *`,
    [departmentCode, departmentName],
  );
});

app.post("/api/prerequisites", requireAuth("admin"), async (req, res) => {
  const courseId = recordId(req.body?.courseId);
  const prerequisiteId = recordId(req.body?.prerequisiteId);
  if (!courseId || !prerequisiteId || courseId === prerequisiteId) {
    return res.status(400).json({ error: "Choose two different existing courses." });
  }
  return createAdminRecord(
    req,
    res,
    "course prerequisite",
    `Added prerequisite ${prerequisiteId} for ${courseId}`,
    `INSERT INTO reg."Prerequisite" ("CourseID", "PrereqID")
     VALUES ($1, $2) RETURNING *`,
    [courseId, prerequisiteId],
  );
});

app.post("/api/majors", requireAuth("admin"), async (req, res) => {
  const majorId = clean(req.body?.majorId);
  const majorTitle = clean(req.body?.majorTitle);
  const departmentCode = clean(req.body?.departmentCode);
  const requiredUnits = positiveInteger(req.body?.requiredUnits);
  if (
    !majorId || !/^[A-Za-z0-9_-]{1,30}$/.test(majorId) || !majorTitle || majorTitle.length > 160 ||
    !departmentCode || departmentCode.length > 30 || !requiredUnits
  ) {
    return res.status(400).json({ error: "Provide a major ID, title, department, and positive required unit count." });
  }
  return createAdminRecord(
    req,
    res,
    "major",
    `Added major ${majorId}`,
    `INSERT INTO major."Major" ("MajorID", "MajorTitle", "DepartmentCode", "RequiredUnits")
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [majorId, majorTitle, departmentCode, requiredUnits],
  );
});

app.post("/api/major-courses", requireAuth("admin"), async (req, res) => {
  const majorId = recordId(req.body?.majorId);
  const courseId = recordId(req.body?.courseId);
  const courseType = clean(req.body?.courseType);
  if (!majorId || !courseId || !["required", "elective"].includes(courseType)) {
    return res.status(400).json({ error: "Choose a major, a course, and whether it is required or elective." });
  }
  return createAdminRecord(
    req,
    res,
    "major course",
    `Added ${courseType} course ${courseId} to major ${majorId}`,
    `INSERT INTO major."MajorCourse" ("MajorID", "CourseID", "CourseType")
     VALUES ($1, $2, $3) RETURNING *`,
    [majorId, courseId, courseType],
  );
});

app.post("/api/major-advisors", requireAuth("admin"), async (req, res) => {
  const majorId = recordId(req.body?.majorId);
  const employeeNumber = positiveInteger(req.body?.employeeNumber);
  if (!majorId || !employeeNumber) {
    return res.status(400).json({ error: "Choose a major and an advisor account." });
  }
  try {
    const account = await pool.query(
      `SELECT "AccountType" FROM signmeup."AuthorizedUser" WHERE "AccountNumber" = $1`,
      [employeeNumber],
    );
    if (!account.rowCount || normalizeRole(account.rows[0].AccountType) !== "advisor") {
      return res.status(400).json({ error: "The selected account must have the advisor role." });
    }
  } catch (error) {
    return databaseError(res, "major advisor", error);
  }
  return createAdminRecord(
    req,
    res,
    "major advisor",
    `Assigned advisor ${employeeNumber} to major ${majorId}`,
    `INSERT INTO major."MajorAdvisor" ("MajorID", "EmployeeNumber")
     VALUES ($1, $2) RETURNING *`,
    [majorId, employeeNumber],
  );
});

app.post("/api/faculty", requireAuth("admin"), async (req, res) => {
  const facultyId = positiveInteger(req.body?.facultyId);
  const name = clean(req.body?.name);
  const positionTitle = clean(req.body?.positionTitle);
  const officeTelephone = clean(req.body?.officeTelephone);
  const officeNumber = clean(req.body?.officeNumber);
  const officeHours = clean(req.body?.officeHours);
  const assignedDepartment = clean(req.body?.assignedDepartment);
  if (
    !facultyId || !name || name.length > 200 || !positionTitle || positionTitle.length > 160 ||
    officeTelephone.length > 40 || officeNumber.length > 80 || officeHours.length > 160 ||
    assignedDepartment.length > 30
  ) {
    return res.status(400).json({ error: "Provide a faculty account, name, position, and contact details within field limits." });
  }
  try {
    const account = await pool.query(
      `SELECT "AccountType" FROM signmeup."AuthorizedUser" WHERE "AccountNumber" = $1`,
      [facultyId],
    );
    if (!account.rowCount || normalizeRole(account.rows[0].AccountType) !== "faculty") {
      return res.status(400).json({ error: "The selected account must have the faculty role." });
    }
  } catch (error) {
    return databaseError(res, "faculty profile", error);
  }
  return createAdminRecord(
    req,
    res,
    "faculty profile",
    `Added faculty profile for account ${facultyId}`,
    `INSERT INTO fci."Faculty"
       ("FacultyID", "Name", "PositionTitle", "OfficeTelephone", "OfficeNumber", "OfficeHours", "AssignedDepartment")
     VALUES ($1, $2, $3, $4, $5, $6, NULLIF($7, '')) RETURNING *`,
    [facultyId, name, positionTitle, officeTelephone || null, officeNumber || null, officeHours || null, assignedDepartment],
  );
});

app.post("/api/faculty-teaching-departments", requireAuth("admin"), async (req, res) => {
  const facultyId = positiveInteger(req.body?.facultyId);
  const departmentCode = clean(req.body?.departmentCode);
  if (!facultyId || !departmentCode || departmentCode.length > 30) {
    return res.status(400).json({ error: "Choose a faculty member and department." });
  }
  return createAdminRecord(
    req,
    res,
    "faculty teaching department",
    `Added teaching department ${departmentCode} for faculty ${facultyId}`,
    `INSERT INTO fci."FacultyTeachingDepartment" ("FacultyID", "DepartmentCode")
     VALUES ($1, $2) RETURNING *`,
    [facultyId, departmentCode],
  );
});

app.post("/api/qualified-faculty", requireAuth("admin"), async (req, res) => {
  const facultyId = positiveInteger(req.body?.facultyId);
  const courseId = recordId(req.body?.courseId);
  if (!facultyId || !courseId) {
    return res.status(400).json({ error: "Choose a faculty member and course." });
  }
  return createAdminRecord(
    req,
    res,
    "faculty course qualification",
    `Qualified faculty ${facultyId} for course ${courseId}`,
    `INSERT INTO fci."QualifiedFaculty" ("FacultyID", "CourseID")
     VALUES ($1, $2) RETURNING *`,
    [facultyId, courseId],
  );
});

app.post("/api/transcripts", requireAuth("admin"), async (req, res) => {
  const studentId = positiveInteger(req.body?.studentId);
  const courseId = recordId(req.body?.courseId);
  const semesterCompleted = clean(req.body?.semesterCompleted);
  const grade = clean(req.body?.grade);
  if (
    !studentId || !courseId || !semesterCompleted || semesterCompleted.length > 60 ||
    !grade || grade.length > 10
  ) {
    return res.status(400).json({ error: "Choose a student and course, and enter a semester and grade." });
  }
  return createAdminRecord(
    req,
    res,
    "transcript entry",
    `Added transcript course ${courseId} for student ${studentId}`,
    `INSERT INTO er."Transcript" ("StudentID", "CourseID", "SemesterCompleted", "Grade")
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [studentId, courseId, semesterCompleted, grade],
  );
});

app.post("/api/transfer-courses", requireAuth("admin"), async (req, res) => {
  const studentId = positiveInteger(req.body?.studentId);
  const courseId = recordId(req.body?.courseId);
  const universityName = clean(req.body?.universityName);
  const universityLocation = clean(req.body?.universityLocation);
  const semesterCompleted = clean(req.body?.semesterCompleted);
  const units = positiveInteger(req.body?.units);
  const grade = clean(req.body?.grade);
  if (
    !studentId || !courseId || !universityName || universityName.length > 200 ||
    !universityLocation || universityLocation.length > 200 ||
    semesterCompleted.length > 60 || !units || grade.length > 10
  ) {
    return res.status(400).json({ error: "Provide a student, equivalent course, institution, location, positive units, and valid semester/grade details." });
  }
  return createAdminRecord(
    req,
    res,
    "transfer course",
    `Added transfer credit ${courseId} for student ${studentId}`,
    `INSERT INTO er."TransferCourse"
       ("StudentID", "CourseID", "UniversityName", "UniversityLocation", "SemesterCompleted", "Units", "Grade")
     VALUES ($1, $2, $3, $4, NULLIF($5, ''), $6, NULLIF($7, '')) RETURNING *`,
    [studentId, courseId, universityName, universityLocation, semesterCompleted, units, grade],
  );
});

app.put("/api/students/:studentId", requireAuth("admin", "advisor"), async (req, res) => {
  const studentId = positiveInteger(req.params.studentId);
  const name = clean(req.body?.name);
  const major = clean(req.body?.major);
  const dateOfBirth = clean(req.body?.dateOfBirth);
  const telephone = clean(req.body?.telephone);
  const address = clean(req.body?.address);
  const minor = clean(req.body?.minor);
  if (
    !studentId || !name || name.length > 200 ||
    !major || major.length > 30 || minor.length > 30 ||
    telephone.length > 40 || address.length > 300 ||
    !validDate(dateOfBirth)
  ) {
    return res.status(400).json({ error: "Provide a valid student ID, name, date of birth, major, and contact details within their field limits." });
  }
  try {
    const student = await withTransaction(async (client) => {
      const result = await client.query(
        `UPDATE er."Student"
         SET "Name" = $1, "Telephone" = $2, "Address" = $3, "DateOfBirth" = $4,
             "Major" = $5, "Minor" = $6, "GraduateAccepted" = $7
         WHERE "StudentID" = $8 RETURNING *`,
        [
          name,
          telephone || null,
          address || null,
          dateOfBirth,
          major,
          minor || null,
          req.body.graduateAccepted === true,
          studentId,
        ],
      );
      if (!result.rowCount) return null;
      await recordAudit(client, req.auth, `Updated student record ${studentId}`);
      return result.rows[0];
    });
    if (!student) return res.status(404).json({ error: "Student not found." });
    res.status(200).json(student);
  } catch (error) {
    databaseError(res, "student record", error);
  }
});

app.post("/api/students/:studentId/notes", requireAuth("faculty", "advisor", "admin"), async (req, res) => {
  const studentId = positiveInteger(req.params.studentId);
  const note = clean(req.body?.note);
  if (!studentId || !note || note.length > 2000) {
    return res.status(400).json({ error: "A student ID and a note of 1 to 2000 characters are required." });
  }
  try {
    const result = await withTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO er."StudentNote" ("StudentID", "Note", "EmployeeID", "CreateDate")
         VALUES ($1, $2, $3, now()) RETURNING *`,
        [studentId, note, req.auth.accountNumber],
      );
      await recordAudit(client, req.auth, `Added a protected note to student ${studentId}`);
      return inserted.rows[0];
    });
    res.status(201).json(result);
  } catch (error) {
    databaseError(res, "student note", error);
  }
});

app.post("/api/enrollments", requireAuth("student", "faculty", "advisor", "admin"), async (req, res) => {
  const studentId = positiveInteger(req.body?.studentId);
  const classId = positiveInteger(req.body?.classId);
  const registrationType = clean(req.body?.registrationType) || "letter";
  if (!studentId || !classId || !["letter", "credit/no credit", "audit"].includes(registrationType)) {
    return res.status(400).json({ error: "A valid student, class, and registration type are required." });
  }
  if (req.auth.role === "student" && req.auth.studentId !== studentId) {
    return res.status(403).json({ error: "Students can only register themselves." });
  }
  try {
    const enrollment = await withTransaction(async (client) => {
      const classResult = await client.query(
        `SELECT classRow."ClassID", classRow."CourseID", classRow."Capacity",
                classRow."MeetingTime", course."Units", course."CourseLevel",
                course."DepartmentCode"
         FROM reg."Class" AS classRow
         JOIN reg."Course" AS course ON course."CourseID" = classRow."CourseID"
         WHERE classRow."ClassID" = $1 FOR UPDATE OF classRow`,
        [classId],
      );
      const courseClass = classResult.rows[0];
      if (!courseClass) {
        const error = new Error("Class not found.");
        error.status = 404;
        throw error;
      }
      const studentResult = await client.query(
        `SELECT "Major", "Minor", "GraduateAccepted"
         FROM er."Student" WHERE "StudentID" = $1`,
        [studentId],
      );
      const student = studentResult.rows[0];
      if (!student) {
        const error = new Error("Student not found.");
        error.status = 404;
        throw error;
      }
      const enrolledResult = await client.query(
        `SELECT count(*)::integer AS "Count"
         FROM reg."Enrollment" WHERE "ClassID" = $1`,
        [classId],
      );
      if (Number(enrolledResult.rows[0].Count) >= Number(courseClass.Capacity)) {
        const error = new Error("This class has no seats available.");
        error.status = 409;
        throw error;
      }
      const missingPrerequisite = await client.query(
        `SELECT prerequisite."PrereqID"
         FROM reg."Prerequisite" AS prerequisite
         WHERE prerequisite."CourseID" = $1
           AND NOT EXISTS (
             SELECT 1 FROM er."Transcript" AS transcript
             WHERE transcript."StudentID" = $2
               AND transcript."CourseID" = prerequisite."PrereqID"
           )
         LIMIT 1`,
        [courseClass.CourseID, studentId],
      );
      if (missingPrerequisite.rowCount) {
        const error = new Error("The student has not completed all course prerequisites.");
        error.status = 409;
        throw error;
      }
      if (courseClass.CourseLevel === "upper") {
        const declaredMajors = [student.Major, student.Minor]
          .map((value) => clean(value).toLowerCase())
          .filter(Boolean);
        const majorDepartments = await client.query(
          `SELECT DISTINCT "DepartmentCode"
           FROM major."Major"
           WHERE lower(btrim("MajorID"::text)) = ANY($1::text[])
              OR lower(btrim("MajorTitle")) = ANY($1::text[])
              OR lower(btrim("DepartmentCode")) = ANY($1::text[])`,
          [declaredMajors],
        );
        const eligibleDepartments = new Set([
          ...declaredMajors,
          ...majorDepartments.rows.map((row) => clean(row.DepartmentCode).toLowerCase()),
        ]);
        if (!eligibleDepartments.has(clean(courseClass.DepartmentCode).toLowerCase())) {
          const error = new Error("Upper-division courses must match the student's major or minor.");
          error.status = 409;
          throw error;
        }
      }
      if (courseClass.CourseLevel === "graduate" && !student.GraduateAccepted) {
        const error = new Error("The student is not marked as accepted into the graduate program.");
        error.status = 409;
        throw error;
      }
      if (req.body?.requireOutline) {
        const approved = await client.query(
          `SELECT 1
           FROM major."ApprovedOutline" outline
           JOIN major."OutlineEntry" entry ON entry."OutlineID" = outline."OutlineID"
           WHERE outline."StudentID" = $1 AND entry."CourseID" = $2 AND entry."Status" = 'approved'
           LIMIT 1`,
          [studentId, courseClass.CourseID],
        );
        if (!approved.rowCount) {
          const error = new Error("The course is not on the student's approved major outline.");
          error.status = 409;
          throw error;
        }
      }
      const enrollmentSummary = await client.query(
        `SELECT COALESCE(sum(course."Units"), 0)::integer AS "Units",
                bool_or(classRow."MeetingTime" = $2) AS "ScheduleConflict"
         FROM reg."Enrollment" enrollment
         JOIN reg."Class" classRow ON classRow."ClassID" = enrollment."ClassID"
         JOIN reg."Course" course ON course."CourseID" = classRow."CourseID"
         WHERE enrollment."StudentID" = $1`,
        [studentId, courseClass.MeetingTime],
      );
      const summary = enrollmentSummary.rows[0];
      if (Number(summary.Units) + Number(courseClass.Units || 0) > 18) {
        const error = new Error("Registration would exceed the 18-credit limit.");
        error.status = 409;
        throw error;
      }
      if (courseClass.MeetingTime && courseClass.MeetingTime !== "Not specified" && summary.ScheduleConflict) {
        const error = new Error("The course conflicts with the student's existing schedule.");
        error.status = 409;
        throw error;
      }
      const inserted = await client.query(
        `INSERT INTO reg."Enrollment" ("StudentID", "ClassID", "RegistrationType")
         VALUES ($1, $2, $3) RETURNING *`,
        [studentId, classId, registrationType],
      );
      await recordAudit(client, req.auth, `Registered student ${studentId} for class ${classId}`);
      return inserted.rows[0];
    });
    res.status(201).json(enrollment);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    databaseError(res, "enrollment", error);
  }
});

app.delete("/api/enrollments/:studentId/:classId", requireAuth("student", "faculty", "advisor", "admin"), async (req, res) => {
  const studentId = positiveInteger(req.params.studentId);
  const classId = positiveInteger(req.params.classId);
  if (!studentId || !classId) return res.status(400).json({ error: "Valid student and class IDs are required." });
  if (req.auth.role === "student" && req.auth.studentId !== studentId) {
    return res.status(403).json({ error: "Students can only cancel their own registrations." });
  }
  try {
    const enrollment = await withTransaction(async (client) => {
      const result = await client.query(
        `DELETE FROM reg."Enrollment"
         WHERE "StudentID" = $1 AND "ClassID" = $2 RETURNING *`,
        [studentId, classId],
      );
      if (!result.rowCount) return null;
      await recordAudit(client, req.auth, `Canceled registration for student ${studentId}, class ${classId}`);
      return result.rows[0];
    });
    if (!enrollment) return res.status(404).json({ error: "Enrollment not found." });
    res.status(200).json(enrollment);
  } catch (error) {
    databaseError(res, "enrollment", error);
  }
});

async function canManageOutline(client, auth, outlineId) {
  const result = await client.query(
    `SELECT outline."MajorID"
     FROM major."ApprovedOutline" outline
     WHERE outline."OutlineID" = $1`,
    [outlineId],
  );
  const outline = result.rows[0];
  if (!outline) return { exists: false, allowed: false };
  if (auth.role === "admin") return { exists: true, allowed: true, majorId: outline.MajorID };
  const advisor = await client.query(
    `SELECT 1 FROM major."MajorAdvisor"
     WHERE "MajorID" = $1 AND "EmployeeNumber" = $2`,
    [outline.MajorID, auth.accountNumber],
  );
  return { exists: true, allowed: advisor.rowCount > 0, majorId: outline.MajorID };
}

app.post("/api/approved-outlines", requireAuth("admin", "advisor"), async (req, res) => {
  const studentId = positiveInteger(req.body?.studentId);
  const majorId = clean(req.body?.majorId);
  if (!studentId || !majorId) return res.status(400).json({ error: "Student and major IDs are required." });
  try {
    const outline = await withTransaction(async (client) => {
      if (req.auth.role === "advisor") {
        const advisor = await client.query(
          `SELECT 1 FROM major."MajorAdvisor"
           WHERE "MajorID" = $1 AND "EmployeeNumber" = $2`,
          [majorId, req.auth.accountNumber],
        );
        if (!advisor.rowCount) {
          const error = new Error("You are not assigned as an advisor for this major.");
          error.status = 403;
          throw error;
        }
      }
      const existing = await client.query(
        `SELECT 1 FROM major."ApprovedOutline" WHERE "StudentID" = $1 LIMIT 1`,
        [studentId],
      );
      if (existing.rowCount) {
        const error = new Error("This student already has an approved outline.");
        error.status = 409;
        throw error;
      }
      const result = await client.query(
        `INSERT INTO major."ApprovedOutline" ("StudentID", "MajorID", "ApprovedBy")
         VALUES ($1, $2, $3) RETURNING *`,
        [studentId, majorId, req.auth.accountNumber],
      );
      await recordAudit(client, req.auth, `Created major outline for student ${studentId}`);
      return result.rows[0];
    });
    res.status(201).json(outline);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    databaseError(res, "approved outline", error);
  }
});

app.post("/api/outline-entries", requireAuth("admin", "advisor"), async (req, res) => {
  const outlineId = positiveInteger(req.body?.outlineId);
  const courseId = recordId(req.body?.courseId);
  const status = clean(req.body?.status) || "approved";
  if (!outlineId || !courseId || !["approved", "dropped", "waived"].includes(status)) {
    return res.status(400).json({ error: "A valid outline, course, and status are required." });
  }
  try {
    const entry = await withTransaction(async (client) => {
      const access = await canManageOutline(client, req.auth, outlineId);
      if (!access.exists) {
        const error = new Error("Approved outline not found.");
        error.status = 404;
        throw error;
      }
      if (!access.allowed) {
        const error = new Error("You are not authorized to update this outline.");
        error.status = 403;
        throw error;
      }
      const result = await client.query(
        `INSERT INTO major."OutlineEntry" ("OutlineID", "CourseID", "Status")
         VALUES ($1, $2, $3) RETURNING *`,
        [outlineId, courseId, status],
      );
      await client.query(
        `INSERT INTO major."OutlineHistory"
           ("OutlineID", "CourseID", "Action", "PreviousStatus", "NewStatus", "ChangedBy")
         VALUES ($1, $2, 'course_added', NULL, $3, $4)`,
        [outlineId, courseId, status, req.auth.accountNumber],
      );
      await recordAudit(client, req.auth, `Added course ${courseId} to outline ${outlineId}`);
      return result.rows[0];
    });
    res.status(201).json(entry);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    databaseError(res, "outline entry", error);
  }
});

app.put("/api/outline-entries/:outlineId/:courseId", requireAuth("admin", "advisor"), async (req, res) => {
  const outlineId = positiveInteger(req.params.outlineId);
  const courseId = recordId(req.params.courseId);
  const status = clean(req.body?.status);
  if (!outlineId || !courseId || !["approved", "dropped", "waived"].includes(status)) {
    return res.status(400).json({ error: "A valid outline, course, and status are required." });
  }
  try {
    const entry = await withTransaction(async (client) => {
      const access = await canManageOutline(client, req.auth, outlineId);
      if (!access.exists) {
        const error = new Error("Approved outline not found.");
        error.status = 404;
        throw error;
      }
      if (!access.allowed) {
        const error = new Error("You are not authorized to update this outline.");
        error.status = 403;
        throw error;
      }
      const current = await client.query(
        `SELECT "Status" FROM major."OutlineEntry"
         WHERE "OutlineID" = $1 AND "CourseID" = $2 FOR UPDATE`,
        [outlineId, courseId],
      );
      if (!current.rowCount) {
        const error = new Error("Outline entry not found.");
        error.status = 404;
        throw error;
      }
      if (current.rows[0].Status === status) return current.rows[0];
      const result = await client.query(
        `UPDATE major."OutlineEntry" SET "Status" = $1, "StatusDate" = now()
         WHERE "OutlineID" = $2 AND "CourseID" = $3 RETURNING *`,
        [status, outlineId, courseId],
      );
      await client.query(
        `INSERT INTO major."OutlineHistory"
           ("OutlineID", "CourseID", "Action", "PreviousStatus", "NewStatus", "ChangedBy")
         VALUES ($1, $2, 'status_changed', $3, $4, $5)`,
        [outlineId, courseId, current.rows[0].Status, status, req.auth.accountNumber],
      );
      await recordAudit(client, req.auth, `Changed outline course ${courseId} to ${status}`);
      return result.rows[0];
    });
    res.status(200).json(entry);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    databaseError(res, "outline entry", error);
  }
});

app.put("/api/approved-outlines/:outlineId/approve", requireAuth("admin", "advisor"), async (req, res) => {
  const outlineId = positiveInteger(req.params.outlineId);
  if (!outlineId) return res.status(400).json({ error: "A valid outline ID is required." });
  try {
    const outline = await withTransaction(async (client) => {
      const access = await canManageOutline(client, req.auth, outlineId);
      if (!access.exists) {
        const error = new Error("Approved outline not found.");
        error.status = 404;
        throw error;
      }
      if (!access.allowed) {
        const error = new Error("You are not authorized to approve this outline.");
        error.status = 403;
        throw error;
      }
      const result = await client.query(
        `UPDATE major."ApprovedOutline"
         SET "ApprovedBy" = $1, "LastApproved" = now()
         WHERE "OutlineID" = $2 RETURNING *`,
        [req.auth.accountNumber, outlineId],
      );
      await client.query(
        `INSERT INTO major."OutlineHistory"
           ("OutlineID", "CourseID", "Action", "PreviousStatus", "NewStatus", "ChangedBy")
         VALUES ($1, NULL, 'outline_approved', NULL, 'approved', $2)`,
        [outlineId, req.auth.accountNumber],
      );
      await recordAudit(client, req.auth, `Approved major outline ${outlineId}`);
      return result.rows[0];
    });
    res.status(200).json(outline);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    databaseError(res, "approved outline", error);
  }
});

async function canEditClass(client, auth, classId, requireSemesterEnd = false) {
  const result = await client.query(
    `SELECT "InstructorEmployeeNumber", "SemesterEnd"
     FROM reg."Class" WHERE "ClassID" = $1`,
    [classId],
  );
  if (!result.rowCount) return { exists: false, allowed: false };
  const courseClass = result.rows[0];
  const assignedFaculty = auth.role === "faculty" &&
    Number(courseClass.InstructorEmployeeNumber) === auth.accountNumber;
  const semesterEnd = courseClass.SemesterEnd ? String(courseClass.SemesterEnd).slice(0, 10) : "";
  const semesterEnded = Boolean(
    semesterEnd && Date.parse(`${semesterEnd}T23:59:59Z`) <= Date.now(),
  );
  return {
    exists: true,
    allowed: auth.role === "admin" || (assignedFaculty && (!requireSemesterEnd || semesterEnded)),
    assignedFaculty,
    semesterEnded,
  };
}

app.put("/api/grades/:classId/:studentId", requireAuth("faculty", "admin"), async (req, res) => {
  const classId = positiveInteger(req.params.classId);
  const studentId = positiveInteger(req.params.studentId);
  const registrationType = clean(req.body?.registrationType);
  const grade = clean(req.body?.grade);
  const note = clean(req.body?.note);
  const validGrades = {
    letter: ["A", "B", "C", "D", "F"],
    "credit/no credit": ["CR", "NC"],
    audit: ["AU"],
  };
  if (!classId || !studentId || !validGrades[registrationType]?.includes(grade) || note.length > 2000) {
    return res.status(400).json({ error: "A valid class, student, registration type, and grade are required." });
  }
  try {
    const result = await withTransaction(async (client) => {
      const access = await canEditClass(client, req.auth, classId, true);
      if (!access.exists) {
        const error = new Error("Class not found.");
        error.status = 404;
        throw error;
      }
      if (!access.allowed) {
        if (access.assignedFaculty && !access.semesterEnded) {
          const error = new Error("Grades can be updated only after the class semester ends.");
          error.status = 409;
          throw error;
        }
        const error = new Error("Faculty may only update grades for their assigned classes.");
        error.status = 403;
        throw error;
      }
      const enrollment = await client.query(
        `UPDATE reg."Enrollment" SET "RegistrationType" = $1
         WHERE "ClassID" = $2 AND "StudentID" = $3`,
        [registrationType, classId, studentId],
      );
      if (!enrollment.rowCount) {
        const error = new Error("The student is not enrolled in this class.");
        error.status = 409;
        throw error;
      }
      const saved = await client.query(
        `INSERT INTO grade."CourseGrade"
           ("ClassID", "StudentID", "Grade", "GradeNote", "UpdatedBy", "UpdatedAt")
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT ("ClassID", "StudentID") DO UPDATE
         SET "Grade" = EXCLUDED."Grade", "GradeNote" = EXCLUDED."GradeNote",
             "UpdatedBy" = EXCLUDED."UpdatedBy", "UpdatedAt" = now()
         RETURNING *`,
        [classId, studentId, grade, note || null, req.auth.accountNumber],
      );
      await recordAudit(client, req.auth, `Updated grade for student ${studentId}, class ${classId}`);
      return saved.rows[0];
    });
    res.status(200).json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    databaseError(res, "course grade", error);
  }
});

app.put("/api/course-comments/:classId", requireAuth("faculty", "admin"), async (req, res) => {
  const classId = positiveInteger(req.params.classId);
  const comment = typeof req.body?.comment === "string" ? req.body.comment.trim() : null;
  if (!classId || comment === null || comment.length > 4000) {
    return res.status(400).json({ error: "A valid class and a comment of at most 4000 characters are required." });
  }
  try {
    const result = await withTransaction(async (client) => {
      const access = await canEditClass(client, req.auth, classId);
      if (!access.exists) {
        const error = new Error("Class not found.");
        error.status = 404;
        throw error;
      }
      if (!access.allowed) {
        const error = new Error("Faculty may only update comments for their assigned classes.");
        error.status = 403;
        throw error;
      }
      const saved = await client.query(
        `INSERT INTO grade."CourseComment" ("ClassID", "Comment", "UpdatedBy", "UpdatedAt")
         VALUES ($1, $2, $3, now())
         ON CONFLICT ("ClassID") DO UPDATE
         SET "Comment" = EXCLUDED."Comment", "UpdatedBy" = EXCLUDED."UpdatedBy",
             "UpdatedAt" = now()
         RETURNING *`,
        [classId, comment, req.auth.accountNumber],
      );
      await recordAudit(client, req.auth, `Updated general comment for class ${classId}`);
      return saved.rows[0];
    });
    res.status(200).json(result);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    databaseError(res, "course comment", error);
  }
});

app.post("/api/authorizedusers/create", requireAuth("admin"), async (req, res) => {
  const credentials = validateCredentials(req.body);
  if (credentials.error) return res.status(400).json({ error: credentials.error });
  const accountType = normalizeRole(req.body?.accountType || "student");
  const name = clean(req.body?.name);
  if (!VALID_ROLES.has(accountType)) {
    return res.status(400).json({ error: "A valid account type is required." });
  }
  if (!name || name.length > 160) return res.status(400).json({ error: "A user name of 1 to 160 characters is required." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(credentials.identifier)) {
    return res.status(400).json({ error: "A valid email address is required." });
  }
  if (
    accountType === "student" &&
    (!validDate(req.body?.dateOfBirth) || !clean(req.body?.major) || clean(req.body?.major).length > 30)
  ) {
    return res.status(400).json({ error: "Student accounts require a valid date of birth and major." });
  }
  try {
    const result = await withTransaction(async (client) => {
      const userResult = await client.query(
        `INSERT INTO signmeup."AuthorizedUser"
           ("Email", "PasswordHash", "AccountType", "UserName")
         VALUES ($1, $2, $3, $4)
         RETURNING "AccountNumber", "StudentID", "Email", "AccountType", "UserName"`,
        [credentials.identifier, hashPassword(credentials.password), accountType, name],
      );
      const user = userResult.rows[0];
      let student = null;
      if (accountType === "faculty") {
        await client.query(
          `INSERT INTO fci."Faculty" ("FacultyID", "Name", "PositionTitle")
           VALUES ($1, $2, 'Faculty')`,
          [user.AccountNumber, name],
        );
      }
      if (accountType === "student") {
        const studentResult = await client.query(
          `INSERT INTO er."Student"
             ("Name", "DateOfBirth", "Major", "Minor", "GraduateAccepted")
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [
            name,
            req.body.dateOfBirth,
            clean(req.body.major),
            clean(req.body.minor) || null,
            req.body.graduateAccepted === true,
          ],
        );
        student = studentResult.rows[0];
        await client.query(
          `UPDATE signmeup."AuthorizedUser" SET "StudentID" = $1 WHERE "AccountNumber" = $2`,
          [student.StudentID, user.AccountNumber],
        );
        user.StudentID = student.StudentID;
      }
      await recordAudit(client, req.auth, `Created authorized user ${credentials.identifier}`);
      return { user, student };
    });
    res.status(201).json({ user: publicUser(result.user), student: result.student });
  } catch (error) {
    databaseError(res, "authorized user", error);
  }
});

app.post("/api/authorizedusers/login", async (req, res) => {
  const credentials = validateCredentials(req.body);
  if (credentials.error) return res.status(400).json({ error: credentials.error });
  try {
    const result = await pool.query(
      `SELECT "AccountNumber", "StudentID", "Email", "PasswordHash", "AccountType", "UserName"
       FROM signmeup."AuthorizedUser" WHERE lower("Email") = lower($1) LIMIT 1`,
      [credentials.identifier],
    );
    const user = result.rows[0];
    if (!user) {
      console.warn("Login rejected: no authorized-user account matched.");
      return res.status(401).json({ error: "The user ID/email or password was not recognized." });
    }
    if (!verifyPassword(credentials.password, user.PasswordHash)) {
      console.warn("Login rejected: password did not match the stored hash.");
      return res.status(401).json({ error: "The user ID/email or password was not recognized." });
    }
    const role = normalizeRole(user.AccountType);
    if (!VALID_ROLES.has(role)) {
      return res.status(403).json({ error: "This account does not have a supported SignMeUp role." });
    }
    const token = crypto.randomBytes(32).toString("hex");
    const session = {
      accountNumber: user.AccountNumber,
      studentId: user.StudentID,
      role,
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    sessions.set(token, session);
    await pool.query(
      `INSERT INTO signmeup."TransactionAudit" ("EmployeeNumber", "Action")
       VALUES ($1, 'Signed in')`,
      [user.AccountNumber],
    );
    res.status(200).json({ token, user: publicUser(user) });
  } catch (error) {
    console.error("Failed to retrieve authorized user", error);
    res.status(500).json({ error: "Could not complete login." });
  }
});

app.get("/api/authorizedusers", requireAuth("admin"), async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT "AccountNumber", "AccountNumber" AS "EmployeeNumber",
              "StudentID", "UserName", "Email",
              "AccountType" AS "JobTitle", "AccountType"
       FROM signmeup."AuthorizedUser" ORDER BY "AccountNumber"`,
    );
    res.status(200).json(result.rows.map((row) => ({
      ...row,
      AccountType: normalizeRole(row.AccountType),
    })));
  } catch (error) {
    console.error("Failed to retrieve authorized users", error);
    res.status(500).json({ error: "Could not retrieve authorized users." });
  }
});

app.put("/api/authorizedusers/:accountNumber/password", requireAuth(), async (req, res) => {
  const accountNumber = positiveInteger(req.params.accountNumber);
  if (!accountNumber) return res.status(400).json({ error: "A valid account number is required." });
  if (req.auth.role !== "admin" && req.auth.accountNumber !== accountNumber) {
    return res.status(403).json({ error: "You are not authorized to change this password." });
  }
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (password.length < 8) return res.status(400).json({ error: "A password of at least 8 characters is required." });
  try {
    const result = await withTransaction(async (client) => {
      const updated = await client.query(
        `UPDATE signmeup."AuthorizedUser" SET "PasswordHash" = $1
         WHERE "AccountNumber" = $2 RETURNING "AccountNumber"`,
        [hashPassword(password), accountNumber],
      );
      if (!updated.rowCount) return null;
      await recordAudit(client, req.auth, `Reset password for account ${accountNumber}`);
      return updated.rows[0];
    });
    if (!result) return res.status(404).json({ error: "Authorized user not found." });
    invalidateSessions(accountNumber, req.auth);
    res.status(200).json({ accountNumber: result.AccountNumber });
  } catch (error) {
    databaseError(res, "password", error);
  }
});

app.delete("/api/authorizedusers/:accountNumber", requireAuth("admin"), async (req, res) => {
  const accountNumber = positiveInteger(req.params.accountNumber);
  if (!accountNumber) return res.status(400).json({ error: "A valid account number is required." });
  if (req.auth.accountNumber === accountNumber) {
    return res.status(400).json({ error: "You cannot delete the account you are currently using." });
  }
  try {
    const result = await withTransaction(async (client) => {
      const deleted = await client.query(
        `DELETE FROM signmeup."AuthorizedUser" WHERE "AccountNumber" = $1
         RETURNING "AccountNumber", "Email", "AccountType"`,
        [accountNumber],
      );
      if (!deleted.rowCount) return null;
      await recordAudit(client, req.auth, `Deleted authorized user ${accountNumber}`);
      return deleted.rows[0];
    });
    if (!result) return res.status(404).json({ error: "Authorized user not found." });
    invalidateSessions(accountNumber);
    res.status(200).json(result);
  } catch (error) {
    databaseError(res, "authorized user", error);
  }
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`SignMeUp API running on port ${PORT}`));
}

module.exports = app;