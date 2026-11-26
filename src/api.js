(function () {
  "use strict";

  const API_BASE_URL = (window.SIGNMEUP_API_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  const ENDPOINTS = {
    students: "/api/students",
    studentNotes: "/api/student-notes",
    transcripts: "/api/transcripts",
    transferCourses: "/api/transfer-courses",
    departments: "/api/departments",
    courses: "/api/courses",
    prerequisites: "/api/prerequisites",
    classes: "/api/classes",
    enrollments: "/api/enrollments",
    majors: "/api/majors",
    majorCourses: "/api/major-courses",
    majorAdvisors: "/api/major-advisors",
    approvedOutlines: "/api/approved-outlines",
    outlineEntries: "/api/outline-entries",
    outlineHistory: "/api/outline-history",
    faculty: "/api/faculty",
    facultyTeachingDepartments: "/api/faculty-teaching-departments",
    qualifiedFaculty: "/api/qualified-faculty",
    grades: "/api/grades",
    courseComments: "/api/course-comments",
    audit: "/api/audit",
    subsystems: "/api/subsystems",
    subsystemAccess: "/api/subsystem-access",
    users: "/api/authorizedusers",
  };

  async function request(path, { method = "GET", token, body } = {}) {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      let message = `${method} ${path} failed with status ${response.status}.`;
      try {
        const errorBody = await response.json();
        if (errorBody.error) message = errorBody.error;
      } catch (error) {
        console.error(`Could not read the error response for ${method} ${path}.`, error);
      }
      throw new Error(message);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function getRows(path, token) {
    const rows = await request(path, { method: "GET", token });
    if (!Array.isArray(rows)) {
      throw new Error(`GET ${path} returned an invalid response.`);
    }
    return rows;
  }

  function id(value) {
    return value == null ? "" : String(value);
  }

  function normalizeRole(value) {
    const role = String(value || "").trim().toLowerCase();
    const aliases = {
      administrator: "admin",
      "system administrator": "admin",
      professor: "faculty",
      "major advisor": "advisor",
      adviser: "advisor",
    };
    return aliases[role] || (["student", "faculty", "advisor", "admin"].includes(role) ? role : "unknown");
  }

  function rowsBy(rows, key) {
    return rows.reduce((grouped, row) => {
      const value = id(row[key]);
      (grouped[value] ||= []).push(row);
      return grouped;
    }, {});
  }

  function localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function buildState(data) {
    const facultyById = Object.fromEntries(data.faculty.map((row) => [id(row.FacultyID), row]));
    const departments = Object.fromEntries(data.departments.map((row) => [id(row.DepartmentCode), row.DepartmentName]));
    const prereqsByCourse = rowsBy(data.prerequisites, "CourseID");
    const teachingByFaculty = rowsBy(data.facultyTeachingDepartments, "FacultyID");
    const qualificationsByFaculty = rowsBy(data.qualifiedFaculty, "FacultyID");
    const classesByCourse = rowsBy(data.classes, "CourseID");
    const classById = Object.fromEntries(data.classes.map((row) => [id(row.ClassID), row]));
    const courseById = Object.fromEntries(data.courses.map((row) => [id(row.CourseID), row]));
    const enrollmentsByClass = rowsBy(data.enrollments, "ClassID");
    const transcriptByStudent = rowsBy(data.transcripts, "StudentID");
    const transfersByStudent = rowsBy(data.transferCourses, "StudentID");
    const notesByStudent = rowsBy(data.studentNotes, "StudentID");
    const faculty = data.faculty.map((row) => ({
      id: id(row.FacultyID),
      name: row.Name,
      position: row.PositionTitle,
      telephone: row.OfficeTelephone || "",
      office: row.OfficeNumber || "",
      officeHours: row.OfficeHours || "",
      department: id(row.AssignedDepartment),
      teachingDepartments: (teachingByFaculty[id(row.FacultyID)] || []).map((item) => id(item.DepartmentCode)),
      qualifiedCourses: (qualificationsByFaculty[id(row.FacultyID)] || []).map((item) => id(item.CourseID)),
    }));
    const facultyNames = Object.fromEntries(faculty.map((row) => [row.id, row.name]));
    const today = localDateString();
    const selectOffering = (offerings) => offerings.slice().sort((left, right) => {
      const start = (row) => row.SemesterStart ? String(row.SemesterStart).slice(0, 10) : "";
      const end = (row) => row.SemesterEnd ? String(row.SemesterEnd).slice(0, 10) : "";
      const priority = (row) => {
        if (start(row) && end(row) && start(row) <= today && end(row) >= today) return 0;
        if (start(row) && start(row) > today) return 1;
        if (!start(row) || !end(row)) return 2;
        return 3;
      };
      const leftPriority = priority(left);
      const rightPriority = priority(right);
      if (leftPriority !== rightPriority) return leftPriority - rightPriority;
      const seatsLeft = (row) => Number(row.Capacity) - (enrollmentsByClass[id(row.ClassID)] || []).length;
      if (leftPriority < 2 && seatsLeft(left) !== seatsLeft(right)) {
        return seatsLeft(right) - seatsLeft(left);
      }
      if (leftPriority === 1 && start(left) !== start(right)) return start(left).localeCompare(start(right));
      if (leftPriority === 3 && end(left) !== end(right)) return end(right).localeCompare(end(left));
      return Number(left.ClassID) - Number(right.ClassID);
    })[0];
    const courses = data.courses.map((row) => {
      const courseId = id(row.CourseID);
      const courseClasses = classesByCourse[courseId] || [];
      const selectedClass = selectOffering(courseClasses);
      const enrolled = selectedClass ? (enrollmentsByClass[id(selectedClass.ClassID)] || []).length : 0;
      const instructorId = id(selectedClass?.InstructorEmployeeNumber);
      return {
        id: courseId,
        title: row.Title,
        description: row.Description || "",
        department: id(row.DepartmentCode),
        units: Number(row.Units),
        level: row.CourseLevel,
        prerequisites: (prereqsByCourse[courseId] || []).map((item) => id(item.PrereqID)),
        seats: selectedClass ? Math.max(0, Number(selectedClass.Capacity) - enrolled) : 0,
        capacity: selectedClass ? Number(selectedClass.Capacity) : 0,
        instructorId,
        instructor: facultyNames[instructorId] || "",
        schedule: selectedClass?.MeetingTime || "",
        location: selectedClass?.Location || "",
        classId: id(selectedClass?.ClassID),
        semesterEnd: selectedClass?.SemesterEnd ? String(selectedClass.SemesterEnd).slice(0, 10) : "",
      };
    });
    const coursesById = Object.fromEntries(courses.map((row) => [row.id, row]));
    const classOfferings = data.classes.map((row) => {
      const instructorId = id(row.InstructorEmployeeNumber);
      return {
        id: id(row.ClassID),
        courseId: id(row.CourseID),
        scheduleNumber: row.ScheduleNumber || "",
        instructorId,
        instructor: facultyNames[instructorId] || "",
        semesterStart: row.SemesterStart ? String(row.SemesterStart).slice(0, 10) : "",
        semesterEnd: row.SemesterEnd ? String(row.SemesterEnd).slice(0, 10) : "",
        meetingTime: row.MeetingTime || "",
        location: row.Location || "",
        capacity: Number(row.Capacity),
      };
    });
    const majorCoursesByMajor = rowsBy(data.majorCourses, "MajorID");
    const advisorsByMajor = rowsBy(data.majorAdvisors, "MajorID");
    const majors = data.majors.map((row) => {
      const links = majorCoursesByMajor[id(row.MajorID)] || [];
      return {
        id: id(row.MajorID),
        title: row.MajorTitle,
        department: id(row.DepartmentCode),
        requiredUnits: Number(row.RequiredUnits),
        requiredCourses: links.filter((item) => item.CourseType === "required").map((item) => id(item.CourseID)),
        electiveCourses: links.filter((item) => item.CourseType === "elective").map((item) => id(item.CourseID)),
        advisors: (advisorsByMajor[id(row.MajorID)] || []).map((item) => id(item.EmployeeNumber)),
      };
    });
    const majorById = Object.fromEntries(majors.map((row) => [row.id, row]));
    const outlines = {};
    for (const row of data.approvedOutlines) {
      const studentId = id(row.StudentID);
      const existing = outlines[studentId];
      if (!existing || new Date(row.LastApproved) > new Date(existing.lastApproved)) {
        outlines[studentId] = {
          id: id(row.OutlineID),
          majorId: id(row.MajorID),
          entries: [],
          approvedBy: id(row.ApprovedBy),
          lastApproved: row.LastApproved,
          history: [],
        };
      }
    }
    const outlineById = Object.fromEntries(Object.values(outlines).map((outline) => [outline.id, outline]));
    for (const row of data.outlineEntries) {
      const outline = outlineById[id(row.OutlineID)];
      if (outline) {
        outline.entries.push({
          courseId: id(row.CourseID),
          status: row.Status,
          statusDate: row.StatusDate,
          approvedBy: outline.approvedBy,
        });
      }
    }
    for (const row of data.outlineHistory) {
      const outline = outlineById[id(row.OutlineID)];
      if (outline) {
        outline.history.push({
          courseId: id(row.CourseID),
          action: row.Action || (row.PreviousStatus ? "status_changed" : "outline_approved"),
          from: row.PreviousStatus,
          to: row.NewStatus,
          changedBy: id(row.ChangedBy),
          changedAt: row.ChangedAt,
        });
      }
    }
    const students = data.students.map((row) => {
      const studentId = id(row.StudentID);
      const completedCourses = (transcriptByStudent[studentId] || []).map((item) => ({
        courseId: id(item.CourseID),
        title: coursesById[id(item.CourseID)]?.title || "",
        semester: item.SemesterCompleted,
        units: Number(coursesById[id(item.CourseID)]?.units || 0),
        grade: item.Grade,
      }));
      const transferCourses = (transfersByStudent[studentId] || []).map((item) => ({
        courseId: id(item.EquivalentCourseID),
        title: coursesById[id(item.EquivalentCourseID)]?.title || "",
        semester: item.SemesterCompleted || "",
        units: Number(item.Units),
        grade: item.Grade || "",
        university: item.UniversityName,
        location: item.UniversityLocation,
      }));
      const currentEnrollment = data.enrollments
        .filter((enrollment) => id(enrollment.StudentID) === studentId)
        .map((enrollment) => {
          const courseClass = classById[id(enrollment.ClassID)];
          const course = coursesById[id(courseClass?.CourseID)];
          return course && courseClass ? {
            courseId: course.id,
            title: course.title,
            units: course.units,
            schedule: courseClass.MeetingTime,
            semester: courseClass.SemesterStart,
            classId: id(courseClass.ClassID),
            registrationType: enrollment.RegistrationType || "letter",
          } : null;
        })
        .filter(Boolean);
      return {
        id: studentId,
        name: row.Name,
        telephone: row.Telephone || "",
        address: row.Address || "",
        dateOfBirth: row.DateOfBirth ? String(row.DateOfBirth).slice(0, 10) : "",
        major: id(row.Major),
        minor: id(row.Minor),
        graduateAccepted: Boolean(row.GraduateAccepted),
        completedCourses,
        transferCourses,
        currentEnrollment,
        notes: (notesByStudent[studentId] || []).map((item) => ({
          id: `${studentId}-${item.EmployeeID}-${item.CreateDate}`,
          text: item.Note,
          createdAt: item.CreateDate,
          employeeId: id(item.EmployeeID),
        })),
      };
    });
    const gradeRowsByCourse = {};
    for (const row of data.grades) {
      const courseClass = classById[id(row.ClassID)];
      const courseId = id(courseClass?.CourseID);
      if (!courseId) continue;
      (gradeRowsByCourse[courseId] ||= []).push({
        classId: id(row.ClassID),
        studentId: id(row.StudentID),
        registrationType: data.enrollments.find((enrollment) =>
          id(enrollment.ClassID) === id(row.ClassID) && id(enrollment.StudentID) === id(row.StudentID),
        )?.RegistrationType || "letter",
        grade: row.Grade,
        note: row.GradeNote || "",
        updatedBy: id(row.UpdatedBy),
        updatedAt: row.UpdatedAt,
      });
    }
    const grades = {};
    for (const [courseId, classRows] of Object.entries(classesByCourse)) {
      const classIds = new Set(classRows.map((row) => id(row.ClassID)));
      const commentRows = data.courseComments.filter((row) => classIds.has(id(row.ClassID)));
      grades[courseId] = {
        generalComment: commentRows[0]?.Comment || "",
        students: gradeRowsByCourse[courseId] || [],
      };
    }
    const subsystemNames = Object.fromEntries(data.subsystems.map((row) => [id(row.SubsystemID), row.SubsystemCode]));
    const accessByEmployee = rowsBy(data.subsystemAccess, "EmployeeNumber");
    const users = data.users.map((row) => ({
      id: id(row.EmployeeNumber),
      accountNumber: id(row.AccountNumber),
      studentId: id(row.StudentID),
      username: row.Email,
      name: row.UserName,
      role: normalizeRole(row.AccountType),
      title: row.JobTitle || row.AccountType,
      access: (accessByEmployee[id(row.EmployeeNumber)] || []).map((item) => subsystemNames[id(item.SubsystemID)]).filter(Boolean),
    }));
    return {
      users,
      students,
      courses,
      classOfferings,
      majors,
      outlines,
      faculty,
      grades,
      auditLog: data.audit.map((row) => ({
        id: id(row.AuditID),
        userId: id(row.EmployeeNumber),
        action: row.Action,
        at: row.CreatedAt,
      })),
      departments,
    };
  }

  async function loadState(token, includeUsers) {
    const entries = Object.entries(ENDPOINTS).filter(([name]) => includeUsers || name !== "users");
    const responses = await Promise.all(entries.map(([, path]) => getRows(path, token)));
    const data = Object.fromEntries(entries.map(([name], index) => [name, responses[index]]));
    if (!includeUsers) data.users = [];
    return buildState(data);
  }

  window.SignMeUpApi = {
    request,
    loadState,
    normalizeRole,
    login: (username, password) => request("/api/authorizedusers/login", {
      method: "POST",
      body: { username, password },
    }),
    createUser: (body, token) => request("/api/authorizedusers/create", {
      method: "POST",
      token,
      body,
    }),
    createCourse: (body, token) => request("/api/courses", {
      method: "POST",
      token,
      body,
    }),
    createClassOffering: (body, token) => request("/api/classes", {
      method: "POST",
      token,
      body,
    }),
    createDepartment: (body, token) => request("/api/departments", {
      method: "POST",
      token,
      body,
    }),
    createPrerequisite: (body, token) => request("/api/prerequisites", {
      method: "POST",
      token,
      body,
    }),
    createMajor: (body, token) => request("/api/majors", {
      method: "POST",
      token,
      body,
    }),
    createMajorCourse: (body, token) => request("/api/major-courses", {
      method: "POST",
      token,
      body,
    }),
    addMajorAdvisor: (body, token) => request("/api/major-advisors", {
      method: "POST",
      token,
      body,
    }),
    createFacultyProfile: (body, token) => request("/api/faculty", {
      method: "POST",
      token,
      body,
    }),
    addFacultyTeachingDepartment: (body, token) => request("/api/faculty-teaching-departments", {
      method: "POST",
      token,
      body,
    }),
    addQualifiedFaculty: (body, token) => request("/api/qualified-faculty", {
      method: "POST",
      token,
      body,
    }),
    addTranscriptEntry: (body, token) => request("/api/transcripts", {
      method: "POST",
      token,
      body,
    }),
    addTransferCourse: (body, token) => request("/api/transfer-courses", {
      method: "POST",
      token,
      body,
    }),
    updatePassword: (accountNumber, password, token) => request(
      `/api/authorizedusers/${encodeURIComponent(accountNumber)}/password`,
      { method: "PUT", token, body: { password } },
    ),
    deleteUser: (accountNumber, token) => request(
      `/api/authorizedusers/${encodeURIComponent(accountNumber)}`,
      { method: "DELETE", token },
    ),
    updateStudent: (studentId, body, token) => request(
      `/api/students/${encodeURIComponent(studentId)}`,
      { method: "PUT", token, body },
    ),
    addStudentNote: (studentId, note, token) => request(
      `/api/students/${encodeURIComponent(studentId)}/notes`,
      { method: "POST", token, body: { note } },
    ),
    createEnrollment: (body, token) => request("/api/enrollments", {
      method: "POST",
      token,
      body,
    }),
    deleteEnrollment: (studentId, classId, token) => request(
      `/api/enrollments/${encodeURIComponent(studentId)}/${encodeURIComponent(classId)}`,
      { method: "DELETE", token },
    ),
    createOutline: (body, token) => request("/api/approved-outlines", {
      method: "POST",
      token,
      body,
    }),
    addOutlineEntry: (body, token) => request("/api/outline-entries", {
      method: "POST",
      token,
      body,
    }),
    updateOutlineEntry: (outlineId, courseId, status, token) => request(
      `/api/outline-entries/${encodeURIComponent(outlineId)}/${encodeURIComponent(courseId)}`,
      { method: "PUT", token, body: { status } },
    ),
    approveOutline: (outlineId, token) => request(
      `/api/approved-outlines/${encodeURIComponent(outlineId)}/approve`,
      { method: "PUT", token, body: {} },
    ),
    saveGrade: (classId, studentId, body, token) => request(
      `/api/grades/${encodeURIComponent(classId)}/${encodeURIComponent(studentId)}`,
      { method: "PUT", token, body },
    ),
    saveCourseComment: (classId, comment, token) => request(
      `/api/course-comments/${encodeURIComponent(classId)}`,
      { method: "PUT", token, body: { comment } },
    ),
  };
})();
