(function () {
  "use strict";

  const {
    ROLE_LABELS,
    NAV_ITEMS,
    calculateGpa,
    checkEligibility,
    courseById,
    studentById,
    gradePoints,
  } = window.SignMeUpData;
  const { dateTime } = window.SignMeUpUtils;
  const root = document.getElementById("root");
  let state = null;
  let apiError = "";
  let session = null;
  let page = "dashboard";
  let toast = null;
  const ui = {
    loginName: "",
    loginPassword: "",
    showPassword: false,
    error: "",
    regStudent: "",
    regQuery: "",
    regDepartment: "all",
    eligibleOnly: false,
    outlineOnly: false,
    regReportType: "schedule",
    regReportStudent: "",
    regReportDepartment: "all",
    regGenerated: false,
    recordStudent: "",
    editingRecord: false,
    recordDraft: {},
    noteDraft: "",
    showRecordReport: false,
    showGradeSheet: false,
    recordReportDetails: true,
    recordReportScope: "all",
    majorTab: "catalog",
    majorId: "",
    majorStudent: "",
    majorReport: "required",
    facultyQuery: "",
    facultyDepartment: "all",
    gradeCourse: "",
    gradeComment: null,
    reportType: "student",
    reportStudent: "",
    reportDepartment: "CS",
    reportCourse: "",
    showHelp: false,
    userForm: { name: "", username: "", password: "", role: "student", dateOfBirth: "", major: "", minor: "" },
    courseForm: { courseNumber: "", title: "", units: "", description: "", departmentCode: "", courseLevel: "lower" },
    classForm: { courseId: "", scheduleNumber: "", instructorId: "", semesterStart: "", semesterEnd: "", meetingTime: "", location: "", capacity: "" },
    academicSetup: {},
    resetUser: "",
    resetPassword: "",
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character]);
  }

  function button(label, action, variant = "primary", extra = "") {
    return `<button type="button" class="button button-${variant}" data-action="${escapeHtml(action)}" ${extra}>${label}</button>`;
  }

  function panel(title, body, eyebrow = "", actions = "") {
    return `<section class="panel"><div class="panel-heading"><div>${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ""}<h2>${title}</h2></div>${actions ? `<div class="panel-actions">${actions}</div>` : ""}</div>${body}</section>`;
  }

  function status(text, tone = "neutral") {
    return `<span class="status status-${tone}">${escapeHtml(text)}</span>`;
  }

  
function field(
  label,
  value,
  name,
  type = "text",
  required = false,
  help = {}
) {
  const helpTitle = help.title || label;
  const helpRequired = help.required || (required ? "Required" : "Optional");
  const helpRequirements = help.requirements || (
    required ? "This field must be completed." : "This field is optional."
  );
  const helpDescription = help.description || `Enter the ${label.toLowerCase()}.`;

  return `
    <label class="form-field">
      <span>
        ${label}${required ? " <em>Required</em>" : ""}
      </span>

      <input
        name="${name}"
        type="${type}"
        value="${escapeHtml(value)}"
        ${required ? "required" : ""}
        data-help-title="${escapeHtml(helpTitle)}"
        data-help-required="${escapeHtml(helpRequired)}"
        data-help-requirements="${escapeHtml(helpRequirements)}"
        data-help-description="${escapeHtml(helpDescription)}"
      >
    </label>
  `;
}


  function info(label, value) {
    return `<div class="info-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
  }

  function empty(title, text) {
    return `<div class="empty-state"><div class="empty-icon">◌</div><h3>${title}</h3><p>${text}</p></div>`;
  }

  function activeRole() {
    return session.previewRole || session.role;
  }

  function currentUser() {
    return state?.users.find((user) => user.id === session.id) || session;
  }

  function activeStudentId() {
    const user = currentUser();
    if (activeRole() === "student") {
      return state.students.some((student) => student.id === user.studentId)
        ? user.studentId
        : "";
    }
    return state.students[0]?.id || "";
  }

  function showToast(message, tone = "success") {
    toast = { message, tone };
    render();
    window.setTimeout(() => {
      if (toast?.message === message) {
        toast = null;
        render();
      }
    }, 3500);
  }

  async function refreshData() {
    if (!session) {
      state = null;
      render();
      return false;
    }
    state = null;
    apiError = "";
    render();
    try {
      state = await window.SignMeUpApi.loadState(session.token, session.role === "admin");
    } catch (error) {
      console.error("Could not load SignMeUp data from the API.", error);
      apiError = error.message;
    }
    render();
    return state !== null;
  }

  async function persist(action, operation) {
    try {
      await operation();
      const loaded = await refreshData();
      if (loaded) showToast(action);
      else showToast(`${action}, but the latest data could not be loaded: ${apiError}`, "error");
      return true;
    } catch (error) {
      console.error(`Could not ${action.toLowerCase()}.`, error);
      showToast(error.message, "error");
      return false;
    }
  }

  function render() {
    if (!state) {
      if (!session) {
        root.innerHTML = renderLogin();
        return;
      }
      root.innerHTML = apiError
        ? `<main class="login-shell"><section class="login-panel"><div class="login-card"><h1>Database connection failed</h1><p class="muted">${escapeHtml(apiError)}</p><button type="button" class="button button-primary" data-action="retry-load">Retry</button><button type="button" class="button button-secondary" data-action="signout">Sign out</button></div></section></main>`
        : '<main class="login-shell"><section class="login-panel"><div class="login-card"><h1>Connecting to SignMeUp</h1><p class="muted">Loading records from the database…</p></div></section></main>';
      return;
    }
    const focused = document.activeElement;
    const focusKey = focused?.getAttribute("data-focus");
    const selection = focused && "selectionStart" in focused
      ? [focused.selectionStart, focused.selectionEnd]
      : null;
    root.innerHTML = session ? renderShell() : renderLogin();
    if (focusKey) {
      const next = root.querySelector(`[data-focus="${CSS.escape(focusKey)}"]`);
      if (next) {
        next.focus();
        if (selection && next.setSelectionRange) next.setSelectionRange(...selection);
      }
    }
  }

  function renderLogin() {
    return `<main class="login-shell">
      <section class="login-brand"><div><p class="wordmark">College <span>SignMeUp</span></p><p class="tagline">University portal</p></div>
        <div class="login-copy"><p class="eyebrow">One connected campus workspace</p><h1>Your next chapter starts here.</h1><p>Register for classes, track degree progress, maintain student records, and support faculty workflows from one browser-based workspace.</p></div>
        <div class="login-metrics"><div><strong>5</strong><span>subsystems</span></div><div><strong>24/7</strong><span>web access</span></div><div><strong>1</strong><span>shared record</span></div></div></section>
      <section class="login-panel"><div class="login-card"><p class="eyebrow">Database access</p><h2>Sign in to SignMeUp</h2><p class="muted">Use your authorized campus account.</p>
        ${ui.error ? `<div class="alert alert-error" role="alert">${escapeHtml(ui.error)}</div>` : ""}
        <form data-form="login" class="form-stack"><label for="login-name">Campus email</label><input id="login-name" name="username" data-input="login-name" data-focus="login-name" value="${escapeHtml(ui.loginName)}" autocomplete="username" required>
        <label for="login-password">Password</label><div class="password-wrap"><input id="login-password" name="password" data-input="login-password" data-focus="login-password" type="${ui.showPassword ? "text" : "password"}" value="${escapeHtml(ui.loginPassword)}" autocomplete="current-password" required>
        <button type="button" class="inline-button" data-action="toggle-password">${ui.showPassword ? "Hide" : "Show"}</button></div><button class="button button-primary" type="submit">Sign in</button></form>
        <p class="muted small">Your sign-in is verified by the SignMeUp API. Sessions expire after eight hours or when the API restarts.</p></div></section></main>`;
  }

  function renderShell() {
    const user = currentUser();
    const role = activeRole();
    const nav = NAV_ITEMS.filter((item) => item.roles.includes(role));
    const active = nav.find((item) => item.id === page);
    if (!active) page = "dashboard";
    const currentPage = nav.find((item) => item.id === page) || nav[0];
    const title = currentPage?.label || "Overview";
    return `<div class="app-shell"><aside class="sidebar"><div class="sidebar-brand"><span class="brand-mark">S</span><div><strong>SignMeUp</strong><small>University portal</small></div></div>
      <div class="sidebar-section-label">Workspace</div><nav aria-label="Primary navigation">${nav.map((item) => `<button type="button" class="nav-item ${page === item.id ? "active" : ""}" data-action="navigate" data-page="${item.id}"><span class="nav-icon">${item.icon}</span>${item.label}</button>`).join("")}</nav>
      <div class="sidebar-bottom"><div class="secure-note"><span>●</span><div><strong>Connected workspace</strong><small>Changes save to the database</small></div></div><button type="button" class="signout" data-action="signout">Sign out</button></div></aside>
      <main class="main-shell"><header class="topbar"><div><p class="breadcrumb">SignMeUp / ${title}</p><h1>${title}</h1></div><div class="topbar-actions">
      ${session.role === "admin" ? `<label class="view-as">View as <select data-change="preview-role">${["admin", "student", "faculty", "advisor"].map((item) => `<option value="${item}" ${role === item ? "selected" : ""}>${ROLE_LABELS[item]}</option>`).join("")}</select></label>` : ""}
      <button
  type="button"
  class="help-button"
  data-action="toggle-help"
  aria-label="Toggle help panel"
>
  ?
</button><div class="profile-chip"><span class="avatar">${escapeHtml(user.name?.slice(0, 1))}</span><div><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(ROLE_LABELS[role])}</small></div></div></div></header>
      <div class="workspace-layout">
  <main class="content-area">
    ${renderPage()}
  </main>

  ${ui.showHelp ? renderContextHelp() : ""}
</div></main>${toast ? `<div class="toast toast-${toast.tone}" role="status"><span>${toast.tone === "error" ? "!" : "✓"}</span>${escapeHtml(toast.message)}<button type="button" data-action="dismiss-toast">×</button></div>` : ""}</div>`;
  }

  function renderPage() {
    return ({
      dashboard: renderDashboard,
      registration: renderRegistration,
      records: renderRecords,
      majors: renderMajors,
      faculty: renderFaculty,
      grades: renderGrades,
      "course-management": renderCourseManagement,
      "academic-setup": renderAcademicSetup,
      reports: renderReports,
      users: renderUsers,
      help: renderHelp,
    }[page] || renderDashboard)();
  }

  function renderDashboard() {
    const user = currentUser();
    const student = studentById(state, activeStudentId());
    const seats = state.courses.reduce((total, item) => total + item.seats, 0);
    const quick = activeRole() === "student"
      ? [["registration", "Register for classes", "Browse upcoming offerings and check eligibility."], ["records", "Open my record", "Review courses, notes, and GPA."], ["majors", "View my major plan", "See approved courses and completion status."]]
      : [["records", "Review student records", "Open student information."], ["reports", "Open reports", "Preview and print operational reports."], ["faculty", "Search directory", "Find faculty and course information."]];
    const activity = state.auditLog.length
      ? `<div class="activity-list">${state.auditLog.slice(0, 6).map((item) => `<div class="activity-row"><span class="activity-icon">✓</span><div><strong>${escapeHtml(item.action)}</strong><small>${escapeHtml(item.userId)} · ${dateTime(item.at)}</small></div></div>`).join("")}</div>`
      : empty("No activity yet", "Actions you take in this session will appear here.");
    return `<div class="page-stack"><div class="welcome-row"><div><p class="eyebrow">${new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</p><h2>Good morning, ${escapeHtml(user.name.split(" ")[0])}.</h2><p class="muted">Your ${escapeHtml(ROLE_LABELS[activeRole()].toLowerCase())} workspace is ready.</p></div><div class="welcome-actions">${button("Print this display", "print", "secondary")}${button("Reload database data", "refresh-data", "ghost")}</div></div>
      <div class="metric-grid"><div class="metric-card metric-maroon"><span>Registered courses</span><strong>${student?.currentEnrollment.length ?? 0}</strong><small>${student ? `${student.currentEnrollment.reduce((sum, item) => sum + item.units, 0)} credits this term` : "Shared workspace"}</small></div><div class="metric-card metric-blue"><span>Available seats</span><strong>${seats}</strong><small>Across all departments</small></div><div class="metric-card metric-green"><span>Student GPA</span><strong>${student ? calculateGpa(student) : "—"}</strong><small>Current calculated GPA</small></div><div class="metric-card metric-gold"><span>Audit events</span><strong>${state.auditLog.length}</strong><small>Logged workspace actions</small></div></div>
      <div class="dashboard-grid">${panel("Start with a task", `<div class="quick-action-grid">${quick.map(([id, title, description]) => `<button type="button" class="quick-action" data-action="navigate" data-page="${id}"><span class="quick-arrow">↗</span><strong>${title}</strong><span>${description}</span></button>`).join("")}</div>`, "Quick access")}
      ${panel("System status", `<div class="status-list"><div><span class="status-dot green"></span> Browser application <strong>Ready</strong></div><div><span class="status-dot green"></span> PostgreSQL API <strong>Connected</strong></div><div><span class="status-dot green"></span> Database writes <strong>Enabled</strong></div></div><p class="panel-footnote">Records and supported changes are stored in PostgreSQL.</p>`, "Operational overview")}</div>
      ${panel("Recent activity", activity, "Audit trail", button("Print", "print", "ghost"))}</div>`;
  }

  function renderRegistration() {
    const role = activeRole();
    const studentId = role === "student" ? activeStudentId() : (ui.regStudent || activeStudentId());
    const student = studentById(state, studentId);
    const departments = [...new Set(state.courses.map((course) => course.department))];
    const courses = state.courses.filter((course) => {
      const matches = `${course.id} ${course.title} ${course.description}`.toLowerCase().includes(ui.regQuery.toLowerCase());
      const dept = ui.regDepartment === "all" || course.department === ui.regDepartment;
      const eligibility = checkEligibility(state, studentId, course.id, { requireOutline: ui.outlineOnly });
      return matches && dept && (!ui.eligibleOnly || eligibility.eligible);
    });
    const cards = courses.map((course) => {
      const eligibility = checkEligibility(state, studentId, course.id, { requireOutline: ui.outlineOnly });
      const offeringStatus = course.classId ? `${course.seats} seats left` : "No scheduled offering";
      const schedule = course.schedule || (course.classId ? "Schedule not specified" : "Not scheduled");
      return `<article class="course-card"><div class="course-card-main"><div class="course-title-row"><span class="course-code">${course.id}</span>${status(eligibility.eligible ? "Eligible" : "Review rules", eligibility.eligible ? "success" : "error")}</div><h3>${escapeHtml(course.title)}</h3><p>${escapeHtml(course.description)}</p><div class="course-meta"><span>${course.department} · ${course.units} units</span><span>${escapeHtml(schedule)}</span><span>${offeringStatus}</span></div>${eligibility.eligible ? "" : `<details class="eligibility-details"><summary>Why registration is blocked</summary><ul>${eligibility.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></details>`}</div><button class="button button-primary" data-action="register" data-course="${course.id}" ${eligibility.eligible && course.classId ? "" : "disabled"}>${eligibility.eligible && course.classId ? "Register" : "Unavailable"}</button></article>`;
    }).join("");
    const schedule = student?.currentEnrollment.length
      ? `<div class="schedule-list">${student.currentEnrollment.map((item) => `<div class="schedule-row"><div><strong>${item.courseId}</strong><span>${escapeHtml(item.title)}</span><small>${escapeHtml(item.schedule)} · ${item.units} units</small></div><button type="button" class="button button-danger button-sm" data-action="drop-course" data-class="${item.classId}">Cancel</button></div>`).join("")}</div>`
      : empty("Schedule is empty", "Select an eligible offering to register one course at a time.");
    const reportStudentId = role === "student" ? activeStudentId() : (ui.regReportStudent || activeStudentId());
    const reportDepartmentCourses = state.courses.filter((course) => (ui.regReportDepartment === "all" || course.department === ui.regReportDepartment) && (ui.regReportType !== "available" || (course.classId && course.seats > 0)));
    const reportCourses = ui.regReportType === "schedule" ? (studentById(state, reportStudentId)?.currentEnrollment || []) : reportDepartmentCourses;
    const reportForm = `<div class="form-grid"><label class="form-field"><span>Report type</span><select data-change="reg-report-type"><option value="schedule" ${ui.regReportType === "schedule" ? "selected" : ""}>Student Schedule</option><option value="department" ${ui.regReportType === "department" ? "selected" : ""}>Department Course Listing</option><option value="available" ${ui.regReportType === "available" ? "selected" : ""}>Available Courses</option></select></label>${ui.regReportType === "schedule" && role !== "student" ? `<label class="form-field"><span>Student</span><select data-change="reg-report-student">${state.students.map((item) => `<option value="${item.id}" ${item.id === reportStudentId ? "selected" : ""}>${escapeHtml(item.name)} (${item.id})</option>`).join("")}</select></label>` : ""}${ui.regReportType !== "schedule" ? `<label class="form-field"><span>Department</span><select data-change="reg-report-department"><option value="all" ${ui.regReportDepartment === "all" ? "selected" : ""}>All departments</option>${departments.map((dept) => `<option value="${dept}" ${ui.regReportDepartment === dept ? "selected" : ""}>${dept}</option>`).join("")}</select></label>` : ""}<div class="full-span">${button("Generate report", "generate-reg-report")}</div></div>`;
    const reportOverlay = ui.regGenerated ? `<div class="report-preview-overlay"><div class="report-preview-window"><div class="report-toolbar"><div><p class="eyebrow">REG subsystem</p><h2>${ui.regReportType === "schedule" ? "Student Schedule Report" : ui.regReportType === "available" ? "Available Courses Report" : "Department Course Listing"}</h2><p class="muted">${ui.regReportType === "schedule" ? escapeHtml(studentById(state, reportStudentId)?.name || "") : escapeHtml(ui.regReportDepartment === "all" ? "All Departments" : `Department: ${ui.regReportDepartment}`)}</p></div>${button("Close", "close-reg-report", "ghost")}</div><div class="report-document">${courseTable("Course information", reportCourses)}</div><div class="report-preview-actions">${button("Close Preview", "close-reg-report", "secondary")}${button("Print Report", "print")}</div></div></div>` : "";
    return `<div class="page-stack"><div class="intro-row"><div><p class="eyebrow">REG subsystem</p><h2>Build an upcoming schedule</h2><p class="muted">Courses are checked against prerequisites, seats, major/minor rules, approved outlines, conflicts, and the 18-credit limit.</p></div><div class="legend">${status("Eligible", "success")} ${status("Needs attention", "error")}</div></div>${panel("Schedule reports", reportForm, "REG report generation")}
      <div class="two-column-layout"><div class="wide-column">${panel("Course offerings", `<div class="filter-row">${role !== "student" ? `<label class="inline-select">Student <select data-change="reg-student">${state.students.map((item) => `<option value="${item.id}" ${studentId === item.id ? "selected" : ""}>${escapeHtml(item.name)} (${item.id})</option>`).join("")}</select></label>` : ""}<label class="search-input"><span>⌕</span><input placeholder="Search course ID or title" value="${escapeHtml(ui.regQuery)}" data-input="reg-query" data-focus="reg-query"></label><select data-change="reg-department"><option value="all">All departments</option>${departments.map((dept) => `<option ${ui.regDepartment === dept ? "selected" : ""}>${dept}</option>`).join("")}</select><label class="check-label"><input type="checkbox" data-change="eligible-only" ${ui.eligibleOnly ? "checked" : ""}> Eligible only</label><label class="check-label"><input type="checkbox" data-change="outline-only" ${ui.outlineOnly ? "checked" : ""}> Approved outline</label></div><div class="course-list">${cards || empty("No matching offerings", "Try a different search or filter.")}</div>`, "Fall 2026")}</div>
      <div class="side-column">${panel("Current schedule", schedule, student ? `${escapeHtml(student.name)} · ${student.id}` : "Student record required", student ? status(`${student.currentEnrollment.reduce((sum, item) => sum + item.units, 0)} / 18 credits`, "info") : "")}${panel("Eligibility rules", "<ul class=\"rule-list\"><li>Prerequisites must be completed.</li><li>Upper-division courses must match the major or minor.</li><li>Graduate courses require graduate acceptance.</li><li>Seats, conflicts, and the 18-credit cap are checked.</li></ul>", "How registration works")}</div></div>${reportOverlay}</div>`;
  }

  function courseTable(title, courses, transfer = false) {
    return `<div class="course-table-block"><h3>${escapeHtml(title)}</h3>${courses.length ? `<div class="table-wrap"><table><thead><tr><th>Course</th><th>Title</th><th>Semester</th><th>Units</th><th>Grade</th>${transfer ? "<th>University</th>" : ""}</tr></thead><tbody>${courses.map((item) => `<tr><td><strong>${escapeHtml(item.courseId || item.id)}</strong></td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.semester || "Fall 2026")}</td><td>${escapeHtml(item.units)}</td><td>${escapeHtml(item.grade || "—")}</td>${transfer ? `<td>${escapeHtml(item.university)} · ${escapeHtml(item.location)}</td>` : ""}</tr>`).join("")}</tbody></table></div>` : '<p class="muted small">No course entries.</p>'}</div>`;
  }

  function renderRecords() {
    const role = activeRole();
    const studentId = role === "student" ? activeStudentId() : (ui.recordStudent || activeStudentId());
    const student = studentById(state, studentId);
    if (!student) return panel("Student records", empty("Student record required", "Add a student record before continuing."), "ER subsystem");
    const editable = role === "admin" || role === "advisor";
    const draft = ui.recordDraft;
    const details = ui.editingRecord
      ? `<form data-form="record" class="form-grid">
      ${field(
  "Student name",
  draft.name ?? student.name,
  "name",
  "text",
  true,
  {
    required: "Required",
    requirements: "Enter the student's full name.",
    description: "The student's name used for identification and academic records."
  }
)}
      ${field("Telephone", draft.telephone ?? student.telephone, "telephone")}${field("Address", draft.address ?? student.address, "address")}
      ${field(
  "Date of Birth",
  draft.dateOfBirth ?? student.dateOfBirth,
  "dateOfBirth",
  "date",
  true,
  {
    required: "Required",
    requirements: "A valid date must be entered.",
    description: "The student's date of birth, used for identification and student records."
  }
)}
>${field("Major", draft.major ?? student.major, "major", "text", true)}${field("Minor", draft.minor ?? student.minor, "minor")}<label class="check-label full-span"><input name="graduateAccepted" type="checkbox" ${draft.graduateAccepted ?? student.graduateAccepted ? "checked" : ""}> Accepted into graduate program</label><div class="full-span"><button class="button button-primary">Save record</button></div></form>`
      : `<div class="record-summary">${info("Student ID", student.id)}${info("Telephone", student.telephone || "Not provided")}${info("Address", student.address || "Not provided")}${info("Date of birth", student.dateOfBirth || "Not provided")}${info("Major", student.major || "Not provided")}${info("Minor", student.minor || "Not provided")}${info("GPA", calculateGpa(student))}${info("Graduate status", student.graduateAccepted ? "Accepted" : "Not accepted")}</div>`;
    const noteList = student.notes?.length
      ? [...student.notes].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map((item) => `<div class="note-item"><p>${escapeHtml(item.text)}</p><span class="muted small">Posted by Employee ${escapeHtml(item.employeeId)} · ${dateTime(item.createdAt)}</span></div>`).join("")
      : '<p class="muted small">No protected notes available.</p>';
    const reportOverlay = ui.showRecordReport ? `<div class="report-preview-overlay"><div class="report-preview-window"><div class="report-toolbar"><div><p class="eyebrow">ER subsystem</p><h2>Student Record Report</h2><p class="muted">${escapeHtml(student.name)} · ${student.id}</p></div>${button("Close", "close-record-report", "ghost")}</div><div class="report-options"><h3>Report options</h3><label class="check-label"><input type="checkbox" data-change="record-report-details" ${ui.recordReportDetails ? "checked" : ""}> Include detailed course information</label>${ui.recordReportDetails ? `<div class="report-scope-options"><label class="check-label"><input type="radio" name="record-course-scope" data-change="record-report-scope" value="current" ${ui.recordReportScope === "current" ? "checked" : ""}> Current university courses only</label><label class="check-label"><input type="radio" name="record-course-scope" data-change="record-report-scope" value="all" ${ui.recordReportScope === "all" ? "checked" : ""}> All universities, including transfer courses</label></div>` : ""}</div><div class="report-document"><div class="record-summary">${info("Student ID", student.id)}${info("Name", student.name)}${info("Telephone", student.telephone || "Not provided")}${info("Address", student.address || "Not provided")}${info("Major", student.major || "Not provided")}${info("Overall GPA", calculateGpa(student))}</div>${ui.recordReportDetails ? `${courseTable("Completed at this university", student.completedCourses)}${ui.recordReportScope === "all" ? courseTable("Completed at another university", student.transferCourses, true) : ""}${courseTable("Current enrollment", student.currentEnrollment)}` : ""}<h3>Protected notes</h3>${noteList}</div><div class="report-preview-actions">${button("Close Preview", "close-record-report", "secondary")}${button("Print Report", "print")}</div></div></div>` : "";
    return `<div class="page-stack"><div class="intro-row"><div><p class="eyebrow">ER subsystem</p><h2>Electronic student records</h2><p class="muted">General information, course completion, transfer credit, current enrollment, GPA, and append-only notes.</p></div>${role !== "student" ? `<label class="inline-select">Student <select data-change="record-student">${state.students.map((item) => `<option value="${item.id}" ${student.id === item.id ? "selected" : ""}>${escapeHtml(item.name)} (${item.id})</option>`).join("")}</select></label>` : ""}</div>
      <div class="record-layout"><div class="wide-column">${panel(escapeHtml(student.name), details, `Student ID ${student.id}`, `${button("Generate report", "open-record-report", "secondary")}${editable ? button(ui.editingRecord ? "Cancel edit" : "Edit record", "toggle-record-edit") : ""}`)}${panel("Course history", courseTable("Completed at this university", student.completedCourses) + courseTable("Completed at another university", student.transferCourses, true), "Current university and transfer credit")}${panel("Current enrollment", courseTable("Upcoming semester", student.currentEnrollment), "Current registration")}</div>
      <div class="side-column">${panel("Protected notes", `${["faculty", "advisor", "admin"].includes(role) ? `<form data-form="note"><textarea name="note" data-focus="note-draft" data-input="note-draft" placeholder="Add a formal student note">${escapeHtml(ui.noteDraft)}</textarea><button class="button button-primary" data-note-submit ${ui.noteDraft.trim() ? "" : "disabled"}>Add note</button></form>` : '<p class="muted small">You can view notes posted by authorized campus employees.</p>'}<div class="notes-list">${noteList}</div><p class="panel-footnote">Notes cannot be deleted. Each entry records the time and employee ID.</p>`, "Chronological and append-only")}</div></div>${reportOverlay}</div>`;
  }

  function renderMajors() {
    const role = activeRole();
    const major = state.majors.find((item) => item.id === (ui.majorId || state.majors[0]?.id));
    const studentId = role === "student" ? activeStudentId() : (ui.majorStudent || activeStudentId());
    const student = studentById(state, studentId);
    const outline = state.outlines[studentId];
    const outlineMajor = state.majors.find((item) => item.id === (outline?.majorId || student?.major));
    const selectable = role === "student"
      ? state.students.filter((item) => item.id === activeStudentId())
      : role === "advisor"
        ? state.students.filter((item) => state.majors.find((m) => m.id === (state.outlines[item.id]?.majorId || item.major))?.advisors.includes(currentUser().id))
        : state.students;
    const canEdit = role === "admin" || role === "advisor";
    const majorCourseTable = (title, ids) => `<div class="course-table-block"><h3>${title}</h3><div class="table-wrap"><table><thead><tr><th>Course ID</th><th>Course Title</th><th>Units</th></tr></thead><tbody>${ids.map((id) => {
      const course = courseById(state, id);
      return `<tr><td>${escapeHtml(id)}</td><td>${escapeHtml(course?.title || "Course not found")}</td><td>${escapeHtml(course?.units ?? "—")}</td></tr>`;
    }).join("")}</tbody></table></div></div>`;
    let body = "";
    if (ui.majorTab === "catalog") {
      body = major ? `<label class="inline-select">Select Major <select data-change="major-id">${state.majors.map((item) => `<option value="${item.id}" ${item.id === major.id ? "selected" : ""}>${escapeHtml(item.title)} (${item.id})</option>`).join("")}</select></label><div class="record-summary">${info("Major ID", major.id)}${info("Major Title", major.title)}${info("Department", major.department)}${info("Required Units", major.requiredUnits)}</div>${majorCourseTable("Required courses", major.requiredCourses)}${majorCourseTable("Elective courses", major.electiveCourses)}<h3>Major advisors</h3>${major.advisors.map((id) => `<p>${escapeHtml(state.faculty.find((item) => item.id === id)?.name || id)}</p>`).join("")}${button("Print major requirements", "print", "secondary")}` : empty("No majors", "No major catalog entries are available.");
    } else if (ui.majorTab === "outlines") {
      const outlineBody = !student
        ? empty("Student record required", "Add a student record before creating an outline.")
        : !outline || !outlineMajor
          ? `${empty("No approved outline", "This student does not currently have a major outline.")}${canEdit && outlineMajor ? button("Create outline", "outline-create") : ""}`
          : `<div class="record-summary">${info("Student", student.name)}${info("Major", outlineMajor.title)}${info("Approved by", outline.approvedBy)}${info("Last approved", outline.lastApproved)}</div><div class="outline-list"><h3>Selected major courses</h3>${outline.entries.map((entry) => `<div class="outline-row"><div><strong>${entry.courseId}</strong><span>${escapeHtml(courseById(state, entry.courseId)?.title || "Course not in catalog")}</span><small>Status date: ${entry.statusDate}</small></div>${canEdit ? `<select data-change="outline-status" data-course="${entry.courseId}" data-outline="${outline.id}">${["approved", "dropped", "waived"].map((s) => `<option ${entry.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>` : status(entry.status, entry.status === "approved" ? "success" : "warning")}</div>`).join("")}</div>${canEdit ? `<div class="form-stack"><h3>Add a course to the outline</h3><select data-change="outline-course"><option value="">Select a course</option>${[...outlineMajor.requiredCourses, ...outlineMajor.electiveCourses].filter((id) => !outline.entries.some((entry) => entry.courseId === id)).map((id) => `<option value="${id}">${id} — ${escapeHtml(courseById(state, id)?.title)}</option>`).join("")}</select>${button("Add course", "outline-add")}${button("Approve major outline", "outline-approve")}</div>` : ""}`;
      body = `<label class="inline-select">Select Student <select data-change="major-student">${selectable.map((item) => `<option value="${item.id}" ${item.id === studentId ? "selected" : ""}>${escapeHtml(item.name)} (${item.id})</option>`).join("")}</select></label>${outlineBody}`;
    } else {
      const completed = student?.completedCourses.filter((course) => major?.requiredCourses.includes(course.courseId)) || [];
      const canView = role === "admin" || (role === "student" && studentId === activeStudentId()) || (role === "advisor" && outlineMajor?.advisors.includes(currentUser().id));
      let reportContent = "";
      if (ui.majorReport === "required" && major) {
        reportContent = majorCourseTable(`Required courses — ${major.title}`, major.requiredCourses);
      } else if (!canView) {
        reportContent = empty("Access restricted", "You are not authorized to view this student's private major report.");
      } else if (ui.majorReport === "completed") {
        reportContent = `<h3>Completed required courses — ${escapeHtml(student?.name)}</h3>${completed.length ? `<ul>${completed.map((course) => `<li>${escapeHtml(course.courseId)} — ${escapeHtml(course.title)} · Grade: ${escapeHtml(course.grade)}</li>`).join("")}</ul>` : "<p>No required courses have been completed.</p>"}`;
      } else if (ui.majorReport === "status") {
        reportContent = `<h3>Major outline status</h3>${outline?.entries.map((entry) => `<div class="outline-row"><div><strong>${entry.courseId}</strong><span>${escapeHtml(courseById(state, entry.courseId)?.title || "Course not in catalog")}</span><small>Completion: ${student?.completedCourses.some((course) => course.courseId === entry.courseId) ? "Completed" : "Not completed"}</small></div>${status(entry.status, entry.status === "approved" ? "success" : "warning")}</div>`).join("") || "<p>No approved outline.</p>"}`;
      } else if (ui.majorReport === "history") {
        reportContent = `<h3>Outline change history</h3>${outline?.history.length ? `<div class="history-list">${outline.history.map((item) => `<div class="history-item"><strong>${escapeHtml(item.courseId || "Entire outline")}</strong><span>${escapeHtml(item.action || "status_changed")}: ${escapeHtml(item.from || "—")} → ${escapeHtml(item.to || "—")}</span><small>${dateTime(item.changedAt)} · ${escapeHtml(item.changedBy)}</small></div>`).join("")}</div>` : "<p>No outline changes have been recorded.</p>"}`;
      }
      body = `<label class="inline-select">Select Report <select data-change="major-report">${[["required", "Required courses by major"], ["completed", "Completed required courses"], ["status", "Student outline status"], ["history", "Outline change history"]].map(([value, label]) => `<option value="${value}" ${ui.majorReport === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label class="inline-select">Select Major <select data-change="major-id">${state.majors.map((item) => `<option value="${item.id}" ${major?.id === item.id ? "selected" : ""}>${escapeHtml(item.title)}</option>`).join("")}</select></label>${ui.majorReport !== "required" ? `<label class="inline-select">Select Student <select data-change="major-student">${selectable.map((item) => `<option value="${item.id}" ${item.id === studentId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label>` : ""}${reportContent}${button("Print report", "print", "secondary")}`;
    }
    const tabs = [["catalog", "Major Catalog"], ["outlines", "Student Outlines"], ["reports", "Reports"]];
    return `<div class="page-stack"><div class="intro-row"><div><p class="eyebrow">MAJOR</p><h2>Major course requirements</h2><p class="muted">View academic requirements, maintain student outlines, and generate progress reports.</p></div></div><div class="filter-row">${tabs.map(([id, label]) => button(label, `major-tab:${id}`, ui.majorTab === id ? "primary" : "secondary")).join("")}</div>${panel(ui.majorTab === "catalog" ? "Academic major catalog" : ui.majorTab === "outlines" ? "Student major outlines" : "Major requirements reports", body, ui.majorTab === "catalog" ? "MA01" : ui.majorTab === "outlines" ? "MA02" : "MA03")}</div>`;
  }

  function renderFaculty() {
    const departments = [...new Set(state.courses.map((item) => item.department))];
    const matches = (value) => {
      const pattern = ui.facultyQuery.trim().split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
      return !pattern || new RegExp(pattern, "i").test(String(value ?? ""));
    };
    const faculty = state.faculty.filter((item) => (ui.facultyDepartment === "all" || item.department === ui.facultyDepartment) && (matches(item.id) || matches(item.name)));
    const courses = state.courses.filter((item) => (ui.facultyDepartment === "all" || item.department === ui.facultyDepartment) && (matches(item.id) || matches(item.title)));
    const facultyHtml = faculty.map((item) => `<article class="directory-card"><div class="directory-avatar">${escapeHtml(item.name.slice(0, 1))}</div><div><strong>${escapeHtml(item.name)}</strong><span>${item.id} · ${escapeHtml(item.position)}</span><small>${item.department} · Office ${escapeHtml(item.office)} · ${escapeHtml(item.telephone)}</small><small>Office hours: ${escapeHtml(item.officeHours)}</small><p>Authorized courses: ${escapeHtml(item.qualifiedCourses.join(", "))}</p></div></article>`).join("");
    const courseHtml = courses.map((item) => `<article class="directory-card course-directory"><div class="course-code large">${item.id}</div><div><strong>${escapeHtml(item.title)}</strong><span>${item.department} · ${item.units} units · ${item.level}</span><small>${escapeHtml(item.description)}</small><small>Prerequisites: ${escapeHtml(item.prerequisites.join(", ") || "None")}</small><p>Qualified faculty: ${escapeHtml(state.faculty.filter((facultyItem) => facultyItem.qualifiedCourses.includes(item.id)).map((facultyItem) => facultyItem.name).join(", ") || "Not assigned")}</p></div></article>`).join("");
    return `<div class="page-stack"><div class="intro-row"><div><p class="eyebrow">FCI subsystem</p><h2>Faculty and course information</h2><p class="muted">Search by faculty ID, name, course ID, or title. Use * for wildcard searches.</p></div>${status("Wildcard search enabled", "info")}</div>${panel("Directory search", `<div class="filter-row"><label class="search-input wide"><span>⌕</span><input placeholder="Try Smith, U2001, CS*, or Algorithms" value="${escapeHtml(ui.facultyQuery)}" data-input="faculty-query" data-focus="faculty-query"></label><select data-change="faculty-department"><option value="all">All departments</option>${departments.map((item) => `<option ${ui.facultyDepartment === item ? "selected" : ""}>${item}</option>`).join("")}</select></div>`, "FC04")}<div class="two-column-layout">${panel("Faculty matches", `<div class="directory-list">${facultyHtml || empty("No faculty matches", "Try a different identifier or wildcard.")}</div>`, `${faculty.length} results`)}${panel("Course matches", `<div class="directory-list">${courseHtml || empty("No course matches", "Try a different course ID or title.")}</div>`, `${courses.length} results`)}</div></div>`;
  }

  function renderGrades() {
    const role = activeRole();
    const courses = state.courses.filter((item) => role === "admin" || item.instructorId === currentUser().id);
    const courseId = courses.some((item) => item.id === ui.gradeCourse) ? ui.gradeCourse : courses[0]?.id;
    const course = courseById(state, courseId);
    if (!course) return panel("Course grades", empty("No grade courses available", "No courses are assigned to this faculty account."), "GRADE subsystem");
    const gradePeriodOpen = Boolean(course.semesterEnd && Date.parse(`${course.semesterEnd}T23:59:59Z`) <= Date.now());
    const canSaveGrades = role === "admin" || gradePeriodOpen;
    const gradePeriodLabel = role === "admin"
      ? "Administrator grade access"
      : gradePeriodOpen
        ? "End-of-semester grade entry open"
        : course.semesterEnd
          ? `Grade entry opens after ${course.semesterEnd}`
          : "Grade entry unavailable: semester end date is not set";
    const record = state.grades[course.id] || { generalComment: "", students: [] };
    const rows = record.students.filter((row) => row.classId === course.classId);
    state.students.filter((student) => student.currentEnrollment.some((item) => item.classId === course.classId)).forEach((student) => {
      if (!rows.some((row) => row.studentId === student.id)) {
        const enrollment = student.currentEnrollment.find((item) => item.classId === course.classId);
        rows.push({
          classId: course.classId,
          studentId: student.id,
          registrationType: enrollment?.registrationType || "letter",
          grade: "",
          note: "",
        });
      }
    });
    const offering = (state.classOfferings || []).find((item) => item.id === course.classId);
    const departmentName = state.departments?.[course.department];
    const heldDates = offering?.semesterStart && offering?.semesterEnd ? `${offering.semesterStart} – ${offering.semesterEnd}` : "";
    const sheetRows = rows.map((row) => `<tr><td>${escapeHtml(studentById(state, row.studentId)?.name || row.studentId)}</td><td>${escapeHtml(row.studentId)}</td><td>${escapeHtml(row.registrationType || "letter")}</td><td>${escapeHtml(row.grade || "Not entered")}</td></tr>`).join("");
    const gradeSheet = ui.showGradeSheet ? `<div class="report-preview-overlay"><div class="report-preview-window"><div class="report-toolbar"><div><p class="eyebrow">GRADE subsystem</p><h2>Grade Sheet</h2><p class="muted">${course.id} · ${escapeHtml(course.title)}</p></div>${button("Close", "close-grade-sheet", "ghost")}</div><div class="report-document"><h2>Grade Sheet: ${course.id} · ${escapeHtml(course.title)}</h2><div class="record-summary">${info("Course ID", course.id)}${info("Department", departmentName ? `${course.department} · ${departmentName}` : course.department || "Not provided")}${info("Schedule number", offering?.scheduleNumber || "Not provided")}${info("Days and time", course.schedule || "Not provided")}${info("Semester dates", heldDates || "Not provided")}${info("Instructor", course.instructor || "Not assigned")}${info("Units", String(course.units ?? ""))}</div><table><thead><tr><th>Student</th><th>Student ID</th><th>Registration type</th><th>Grade</th></tr></thead><tbody>${sheetRows || '<tr><td colspan="4">No students are enrolled in this course.</td></tr>'}</tbody></table><p class="muted small">Generated ${dateTime(new Date().toISOString())}</p></div><div class="report-preview-actions">${button("Close Preview", "close-grade-sheet", "secondary")}${button("Print Grade Sheet", "print")}</div></div></div>` : "";
    const statsFor = (courseList) => {
      const courseIds = new Set(courseList.map((item) => item.id));
      const classIds = new Set((state.classOfferings || []).filter((item) => courseIds.has(item.courseId)).map((item) => item.id));
      const records = new Map();
      courseList.forEach((item) => (state.grades[item.id]?.students || []).forEach((row) => records.set(`${row.classId}|${row.studentId}`, row.grade || "")));
      state.students.forEach((student) => (student.currentEnrollment || []).forEach((item) => {
        const key = `${item.classId}|${student.id}`;
        if (classIds.has(item.classId) && !records.has(key)) records.set(key, "");
      }));
      const grades = [...records.values()];
      const letters = grades.filter((grade) => gradePoints(grade) !== null);
      const percent = (letter) => letters.length ? `${Math.round((100 * letters.filter((grade) => grade === letter).length) / letters.length)}%` : "—";
      return {
        registered: grades.length,
        passing: grades.filter((grade) => ["A", "B", "C", "CR"].includes(grade)).length,
        average: letters.length ? (letters.reduce((sum, grade) => sum + gradePoints(grade), 0) / letters.length).toFixed(2) : "—",
        percent,
      };
    };
    const statScopes = [
      ["This course", statsFor([course])],
      [`Department (${course.department || "—"})`, statsFor(state.courses.filter((item) => item.department === course.department))],
      ["University", statsFor(state.courses)],
    ];
    const statRow = (label, value) => `<tr><td>${label}</td>${statScopes.map(([, stats]) => `<td>${escapeHtml(String(value(stats)))}</td>`).join("")}</tr>`;
    const statsPanel = panel("Grade statistics", `<div class="table-wrap"><table><thead><tr><th>Statistic</th>${statScopes.map(([label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead><tbody>${statRow("Registered students", (stats) => stats.registered)}${statRow("Completed with a passing grade (A–C or CR)", (stats) => stats.passing)}${statRow("Average grade (A–F, 4.0 scale)", (stats) => stats.average)}${["A", "B", "C", "D", "F"].map((letter) => statRow(`Received ${letter} (of letter grades)`, (stats) => stats.percent(letter))).join("")}</tbody></table></div>`, "CG07–CG09");
    const updaterName = (userId) => !userId ? "—"
      : (state.faculty || []).find((person) => person.id === userId)?.name
        || (state.users || []).find((user) => user.id === userId)?.name
        || (session?.id === userId ? session.name : `Account ${userId}`);
    const changedByOther = (row) => Boolean(row.updatedBy && course.instructorId && row.updatedBy !== course.instructorId);
    const tableRows = rows.map((row) => `<tr><td><strong>${escapeHtml(studentById(state, row.studentId)?.name || row.studentId)}</strong><small>${row.studentId}</small></td><td><select data-change="grade-type" data-class="${row.classId || course.classId}" data-student="${row.studentId}" data-course="${course.id}">${["letter", "credit/no credit", "audit"].map((type) => `<option ${row.registrationType === type ? "selected" : ""}>${type}</option>`).join("")}</select></td><td><select data-change="grade-value" data-class="${row.classId || course.classId}" data-student="${row.studentId}" data-course="${course.id}"><option value="">Select</option>${(row.registrationType === "letter" ? ["A", "B", "C", "D", "F"] : row.registrationType === "credit/no credit" ? ["CR", "NC"] : ["AU"]).map((grade) => `<option ${row.grade === grade ? "selected" : ""}>${grade}</option>`).join("")}</select></td><td><input data-input="grade-note" data-class="${row.classId || course.classId}" data-student="${row.studentId}" data-course="${course.id}" value="${escapeHtml(row.note || "")}" placeholder="Optional note"></td><td><small>${row.updatedAt ? dateTime(row.updatedAt) : "Not entered"}<br>${escapeHtml(updaterName(row.updatedBy))}</small>${changedByOther(row) ? status("Not the instructor", "warning") : ""}</td><td><button type="button" class="button button-primary button-sm" data-action="save-grade" data-class="${row.classId || course.classId}" data-student="${row.studentId}" data-course="${course.id}" ${row.grade && canSaveGrades ? "" : "disabled"}>Save</button></td></tr>`).join("");
    return `<div class="page-stack"><div class="intro-row"><div><p class="eyebrow">GRADE subsystem</p><h2>Maintain course grades</h2><p class="muted">Enter a letter, credit/no credit, or audit grade, and keep notes on updates.</p></div><div class="legend">${status(gradePeriodLabel, canSaveGrades ? "success" : "warning")}${button("Print grade sheet", "open-grade-sheet", "secondary")}</div></div>${panel("Course selection", `<div class="filter-row"><label class="inline-select">Course <select data-change="grade-course">${courses.map((item) => `<option value="${item.id}" ${item.id === course.id ? "selected" : ""}>${item.id} · ${escapeHtml(item.title)}</option>`).join("")}</select></label>${status(`${course.department} · ${course.schedule} · ${course.units} units`, "info")}</div>`, "Primary instructor access")}${panel("Student grade sheet", `<div class="table-wrap"><table class="grades-table"><thead><tr><th>Student</th><th>Registration type</th><th>Grade</th><th>Student note</th><th>Last update</th><th></th></tr></thead><tbody>${tableRows}</tbody></table></div>${rows.length ? "" : empty("No enrolled students", "Students registered for this course will appear here.")}`, `${course.id} · ${escapeHtml(course.instructor)}`)}<div class="two-column-layout">${panel("General course comment", `<textarea data-input="grade-comment" data-focus="grade-comment">${escapeHtml(ui.gradeComment ?? record.generalComment)}</textarea>${button("Save comment", "save-comment")}`, "Not linked to a student")}${panel("Grade access rules", "<ul class=\"rule-list\"><li>Faculty grade updates are allowed only after the class semester ends.</li><li>Administrators have special update privileges.</li><li>Every update stores the updater and timestamp.</li><li>Student notes stay separate from the general comment.</li></ul>", "CG04")}</div>${statsPanel}${gradeSheet}</div>`;
  }

  function renderReports() {
    const studentId = ui.reportStudent || activeStudentId();
    const courseId = ui.reportCourse || state.courses[0]?.id;
    const department = ui.reportDepartment || "CS";
    const student = studentById(state, studentId);
    const courses = state.courses.filter((item) => ui.reportType !== "department" || item.department === department);
    const rows = courses.flatMap((item) => (state.grades[item.id]?.students || []).map((row) => ({ ...row, course: item })));
    let preview;
    if (ui.reportType === "student") {
      preview = student
        ? `<div class="print-report"><div class="report-header"><h3>${escapeHtml(student.name)}</h3><p>${student.id} · ${student.major}</p><strong>GPA ${calculateGpa(student)}</strong></div><div class="report-summary-grid">${info("Telephone", student.telephone || "Not provided")}${info("Address", student.address || "Not provided")}${info("Date of birth", student.dateOfBirth || "Not provided")}${info("Graduate status", student.graduateAccepted ? "Accepted" : "Not accepted")}</div>${courseTable("Completed courses", [...student.completedCourses, ...student.transferCourses])}${courseTable("Current enrollment", student.currentEnrollment)}</div>`
        : empty("Student record required", "Select a student with a complete record.");
    } else {
      const selectedCourses = ui.reportType === "course" ? courses.filter((item) => item.id === courseId) : courses;
      const selectedRows = ui.reportType === "course" ? rows.filter((row) => row.course.id === courseId) : rows;
      const counts = { A: 0, B: 0, C: 0, D: 0, F: 0 };
      selectedRows.forEach((row) => { if (counts[row.grade] !== undefined) counts[row.grade] += 1; });
      const letterRows = selectedRows.filter((row) => gradePoints(row.grade) !== null);
      const average = letterRows.length ? (letterRows.reduce((sum, row) => sum + gradePoints(row.grade), 0) / letterRows.length).toFixed(2) : "0.00";
      preview = `<div class="print-report"><div class="report-header"><h3>${ui.reportType === "course" ? escapeHtml(courseById(state, courseId)?.title || courseId) : ui.reportType === "department" ? `${escapeHtml(department)} department statistics` : "University-wide statistics"}</h3><p>${selectedCourses.length} course offering(s)</p><strong>Average ${average}</strong></div><div class="stats-grid">${info("Registrations", selectedRows.length)}${info("Passing", selectedRows.filter((row) => ["A", "B", "C", "CR"].includes(row.grade)).length)}${info("Average grade", average)}${info("A / B / C / D / F", `${counts.A} / ${counts.B} / ${counts.C} / ${counts.D} / ${counts.F}`)}</div>${selectedCourses.map((item) => `<p>${item.id} · ${escapeHtml(item.title)} · ${item.units} units · ${escapeHtml(item.schedule)}</p>`).join("")}</div>`;
    }
    const controls = `<div class="report-tabs">${[["student", "Student record"], ["course", "Course statistics"], ["department", "Department statistics"], ["university", "University statistics"]].map(([type, label]) => `<button type="button" class="${ui.reportType === type ? "active" : ""}" data-action="report-type" data-type="${type}">${label}</button>`).join("")}</div><div class="filter-row report-filters">${ui.reportType === "student" ? `<label class="inline-select">Student <select data-change="report-student">${state.students.filter((item) => activeRole() !== "student" || item.id === activeStudentId()).map((item) => `<option value="${item.id}" ${item.id === studentId ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label>` : ""}${ui.reportType === "course" ? `<label class="inline-select">Course <select data-change="report-course">${state.courses.map((item) => `<option value="${item.id}" ${item.id === courseId ? "selected" : ""}>${item.id} · ${escapeHtml(item.title)}</option>`).join("")}</select></label>` : ""}${ui.reportType === "department" ? `<label class="inline-select">Department <select data-change="report-department">${[...new Set(state.courses.map((item) => item.department))].map((item) => `<option ${department === item ? "selected" : ""}>${item}</option>`).join("")}</select></label>` : ""}</div>`;
    return `<div class="page-stack"><div class="intro-row"><div><p class="eyebrow">Reporting center</p><h2>Preview and print reports</h2><p class="muted">Reports remain on this workstation until you choose print or CSV export.</p></div><div class="legend">${button("Print preview", "print", "secondary")}${button("Export CSV", "export-csv", "ghost")}</div></div>${panel("Report selection", controls, "RP01")}${panel("Report preview", preview, `${ui.reportType[0].toUpperCase()}${ui.reportType.slice(1)} report`, "", "report-preview")}</div>`;
  }

  function renderUsers() {
    const form = ui.userForm;
    const studentFields = form.role === "student"
      ? `<div data-student-fields>${field("Date of Birth", form.dateOfBirth, "dateOfBirth", "date", true)}${field("Major", form.major, "major", "text", true)}${field("Minor", form.minor, "minor")}</div>`
      : "";
    return `<div class="page-stack"><div class="intro-row"><div><p class="eyebrow">Framework administration</p><h2>Authorized users</h2><p class="muted">Create accounts, reset passwords, and remove accounts that are no longer needed.</p></div>${status("Admin only", "warning")}</div><div class="two-column-layout">${panel("Create authorized user", `<form data-form="new-user" class="form-stack">${field("User name", form.name, "name", "text", true)}${field("Campus email", form.username, "username", "email", true)}${field("Initial password", form.password, "password", "password", true)}<label class="form-field"><span>Role</span><select name="role" data-change="new-user-role">${["student", "faculty", "advisor", "admin"].map((role) => `<option value="${role}" ${form.role === role ? "selected" : ""}>${ROLE_LABELS[role]}</option>`).join("")}</select></label>${studentFields}<button class="button button-primary">Create user</button></form>`, "SF03–SF04")}${panel("Reset password", `<form data-form="reset-password" class="form-stack"><label class="form-field"><span>User</span><select name="userId">${state.users.map((user) => `<option value="${user.id}" ${ui.resetUser === user.id ? "selected" : ""}>${escapeHtml(user.name)} · ${user.id}</option>`).join("")}</select></label>${field("Replacement password", ui.resetPassword, "password", "password", true)}<button class="button button-primary">Reset password</button></form>`, "SF07")}</div>${panel("User access report", `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Account ID</th><th>Role</th><th>Access areas</th><th></th></tr></thead><tbody>${state.users.map((user) => `<tr><td><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.username)}</small></td><td>${user.id}${user.studentId ? `<small>Student ${user.studentId}</small>` : ""}</td><td>${status(ROLE_LABELS[user.role] || user.role, "info")}</td><td>${escapeHtml(user.access.join(", ") || "Not assigned")}</td><td>${user.id === session.id ? status("Current account") : button("Delete", "delete-user", "danger", `data-user="${user.id}"`)}</td></tr>`).join("")}</tbody></table></div>`, `${state.users.length} authorized users`, button("Print report", "print", "secondary"))}</div>`;
  }

  function renderCourseManagement() {
    const courseForm = ui.courseForm;
    const classForm = ui.classForm;
    const departments = Object.entries(state.departments).sort(([left], [right]) => left.localeCompare(right));
    const courseIdPreview = courseForm.departmentCode
      ? `${courseForm.departmentCode} ${courseForm.courseNumber || "###"}`
      : "Select a department and enter a 3-digit number";
    const courseOptions = state.courses.map((course) =>
      `<option value="${course.id}" ${classForm.courseId === course.id ? "selected" : ""}>${course.id} · ${escapeHtml(course.title)}</option>`,
    ).join("");
    const courseRows = state.courses.map((course) => {
      const offerings = state.classOfferings.filter((item) => item.courseId === course.id);
      return `<tr><td><strong>${course.id}</strong></td><td>${escapeHtml(course.title)}</td><td>${escapeHtml(course.department)}</td><td>${course.units}</td><td>${escapeHtml(course.level)}</td><td>${offerings.length}</td></tr>`;
    }).join("");
    const offeringRows = state.classOfferings.map((offering) => {
      const course = courseById(state, offering.courseId);
      return `<tr><td><strong>${escapeHtml(offering.scheduleNumber)}</strong></td><td>${offering.courseId} · ${escapeHtml(course?.title || "Course not found")}</td><td>${escapeHtml(offering.semesterStart)} – ${escapeHtml(offering.semesterEnd)}</td><td>${escapeHtml(offering.meetingTime)}</td><td>${escapeHtml(offering.location)}</td><td>${escapeHtml(offering.instructor || "Unassigned")}</td><td>${offering.capacity}</td></tr>`;
    }).join("");
    return `<div class="page-stack">
      <div class="intro-row"><div><p class="eyebrow">Catalog administration</p><h2>Course management</h2><p class="muted">Add catalog courses, then create one or more scheduled class offerings so students can register.</p></div>${status("Admin only", "warning")}</div>
      <div class="two-column-layout">
        ${panel("Add course to catalog", `<form data-form="new-course" class="form-stack">
          <label class="form-field"><span>3-digit course number <em>Required</em></span><input name="courseNumber" type="text" inputmode="numeric" pattern="[0-9]{2}[1-9]|[1-9][0-9]{2}" maxlength="3" placeholder="532" value="${escapeHtml(courseForm.courseNumber)}" required></label>
          ${field("Course title", courseForm.title, "title", "text", true)}
          <label class="form-field"><span>Units <em>Required</em></span><input name="units" type="number" min="1" step="1" value="${escapeHtml(courseForm.units)}" required></label>
          <label class="form-field"><span>Description</span><textarea name="description">${escapeHtml(courseForm.description)}</textarea></label>
          <label class="form-field"><span>Department <em>Required</em></span><select name="departmentCode" data-change="course-department" required><option value="">Select department</option>${departments.map(([code, name]) => `<option value="${escapeHtml(code)}" ${courseForm.departmentCode === code ? "selected" : ""}>${escapeHtml(code)} · ${escapeHtml(name)}</option>`).join("")}</select></label>
          <p class="muted small">Course ID preview: <strong data-course-id-preview>${escapeHtml(courseIdPreview)}</strong>. Numbers must be 001–999.</p>
          <label class="form-field"><span>Course level <em>Required</em></span><select name="courseLevel" data-change="course-level">${["lower", "upper", "graduate"].map((level) => `<option value="${level}" ${courseForm.courseLevel === level ? "selected" : ""}>${level[0].toUpperCase()}${level.slice(1)} division</option>`).join("")}</select></label>
          <button class="button button-primary">Add course</button>
        </form>`, "Catalog record")}
        ${panel("Add class offering", `<form data-form="new-class" class="form-stack">
          <label class="form-field"><span>Course <em>Required</em></span><select name="courseId" data-change="offering-course" ${state.courses.length ? "required" : "disabled"}><option value="">Select a course</option>${courseOptions}</select></label>
          ${field("Schedule number", classForm.scheduleNumber, "scheduleNumber", "text", true)}
          <label class="form-field"><span>Instructor</span><select name="instructorId" data-change="offering-instructor"><option value="">Unassigned</option>${state.faculty.map((item) => `<option value="${item.id}" ${classForm.instructorId === item.id ? "selected" : ""}>${escapeHtml(item.name)} · ${item.id}</option>`).join("")}</select></label>
          ${field("Semester start", classForm.semesterStart, "semesterStart", "date", true)}
          ${field("Semester end", classForm.semesterEnd, "semesterEnd", "date", true)}
          ${field("Meeting time", classForm.meetingTime, "meetingTime", "text", true)}
          ${field("Location", classForm.location, "location", "text", true)}
          <label class="form-field"><span>Capacity <em>Required</em></span><input name="capacity" type="number" min="0" step="1" value="${escapeHtml(classForm.capacity)}" required></label>
          <button class="button button-primary" ${state.courses.length ? "" : "disabled"}>Add offering</button>
          ${state.courses.length ? "" : '<p class="muted small">Add a catalog course before creating an offering.</p>'}
        </form>`, "Registration schedule")}
      </div>
      ${panel("Course catalog", `<div class="table-wrap"><table><thead><tr><th>Course ID</th><th>Title</th><th>Department</th><th>Units</th><th>Level</th><th>Offerings</th></tr></thead><tbody>${courseRows || '<tr><td colspan="6">No courses are in the catalog.</td></tr>'}</tbody></table></div>`, `${state.courses.length} courses`)}
      ${panel("Scheduled offerings", `<div class="table-wrap"><table><thead><tr><th>Schedule number</th><th>Course</th><th>Semester</th><th>Meeting time</th><th>Location</th><th>Instructor</th><th>Capacity</th></tr></thead><tbody>${offeringRows || '<tr><td colspan="7">No class offerings are scheduled.</td></tr>'}</tbody></table></div>`, `${state.classOfferings.length} offerings`)}
    </div>`;
  }

  function renderAcademicSetup() {
    const departments = Object.entries(state.departments).sort(([left], [right]) => left.localeCompare(right));
    const facultyAccounts = state.users.filter((user) => user.role === "faculty");
    const advisorAccounts = state.users.filter((user) => user.role === "advisor");
    const unprofiledFaculty = facultyAccounts.filter((user) =>
      !state.faculty.some((faculty) => faculty.id === user.accountNumber),
    );
    const formValue = (formName, name) => ui.academicSetup[formName]?.[name] || "";
    const input = (formName, name, label, type = "text", attrs = "") =>
      `<label class="form-field"><span>${escapeHtml(label)} <em>Required</em></span><input name="${name}" type="${type}" value="${escapeHtml(formValue(formName, name))}" ${attrs} required></label>`;
    const select = (formName, name, label, options) =>
      `<label class="form-field"><span>${escapeHtml(label)} <em>Required</em></span><select name="${name}" required><option value="">Select ${escapeHtml(label.toLowerCase())}</option>${options.map(([value, text]) => `<option value="${escapeHtml(value)}" ${formValue(formName, name) === value ? "selected" : ""}>${escapeHtml(text)}</option>`).join("")}</select></label>`;
    const form = (formName, fields, submitLabel) =>
      `<form data-form="${formName}" class="form-stack">${fields}<button class="button button-primary">${escapeHtml(submitLabel)}</button></form>`;
    const departmentOptions = departments.map(([code, name]) => [code, `${code} · ${name}`]);
    const courseOptions = state.courses.map((course) => [course.id, `${course.id} · ${course.title}`]);
    const majorOptions = state.majors.map((major) => [major.id, `${major.id} · ${major.title}`]);
    const facultyOptions = state.faculty.map((faculty) => [faculty.id, `${faculty.name} · ${faculty.id}`]);
    const studentOptions = state.students.map((student) => [student.id, `${student.name} · ${student.id}`]);
    const advisorOptions = advisorAccounts.map((user) => [user.accountNumber, `${user.name} · ${user.accountNumber}`]);
    const facultyAccountOptions = unprofiledFaculty.map((user) => [user.accountNumber, `${user.name} · ${user.accountNumber}`]);
    const prerequisites = state.courses.flatMap((course) =>
      course.prerequisites.map((id) => [course.id, id]),
    );
    const majorCourses = state.majors.flatMap((major) => [
      ...major.requiredCourses.map((courseId) => [major.id, courseId, "required"]),
      ...major.electiveCourses.map((courseId) => [major.id, courseId, "elective"]),
    ]);
    const majorAdvisors = state.majors.flatMap((major) =>
      major.advisors.map((id) => [major.id, state.users.find((user) => user.id === id)?.name || id]),
    );
    const teachingDepartments = state.faculty.flatMap((faculty) =>
      faculty.teachingDepartments.map((code) => [faculty.name, code]),
    );
    const qualifiedFaculty = state.faculty.flatMap((faculty) =>
      faculty.qualifiedCourses.map((courseId) => [faculty.name, courseId]),
    );
    const transcriptRows = state.students.flatMap((student) =>
      student.completedCourses.map((item) => [student.name, item.courseId, item.semester, item.grade]),
    );
    const transferRows = state.students.flatMap((student) =>
      student.transferCourses.map((item) => [student.name, item.courseId, item.university, item.semester]),
    );
    const table = (headers, rows, emptyMessage) =>
      `<div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.length
        ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${headers.length}">${escapeHtml(emptyMessage)}</td></tr>`}</tbody></table></div>`;

    return `<div class="page-stack">
      <div class="intro-row"><div><p class="eyebrow">Admin-only catalog and records</p><h2>Academic setup</h2><p class="muted">Maintain departments, prerequisites, major requirements, faculty assignments, and academic history.</p></div>${status("Admin only", "warning")}</div>
      <div class="two-column-layout">
        ${panel("Departments", `${form("setup-department", `${input("setup-department", "departmentCode", "Department code", "text", 'maxlength="26" pattern="[A-Za-z0-9-]+"')}${input("setup-department", "departmentName", "Department name", "text", 'maxlength="160"')}`, "Add department")}${table(["Code", "Department"], departments.map(([code, name]) => [code, name]), "No departments.")}`, "Registration catalog")}
        ${panel("Course prerequisites", `${form("setup-prerequisite", `${select("setup-prerequisite", "courseId", "Course", courseOptions)}${select("setup-prerequisite", "prerequisiteId", "Prerequisite", courseOptions)}`, "Add prerequisite")}${table(["Course", "Prerequisite"], prerequisites, "No prerequisites.")}`, "Registration rules")}
        ${panel("Major catalog", `${form("setup-major", `${input("setup-major", "majorId", "Major ID", "text", 'maxlength="30"')}${input("setup-major", "majorTitle", "Major title", "text", 'maxlength="160"')}${select("setup-major", "departmentCode", "Department", departmentOptions)}${input("setup-major", "requiredUnits", "Required units", "number", 'min="1" step="1"')}`, "Add major")}${table(["ID", "Major", "Department", "Required units"], state.majors.map((major) => [major.id, major.title, major.department, major.requiredUnits]), "No majors.")}`, "Degree catalog")}
        ${panel("Major course requirements", `${form("setup-major-course", `${select("setup-major-course", "majorId", "Major", majorOptions)}${select("setup-major-course", "courseId", "Course", courseOptions)}<label class="form-field"><span>Requirement type <em>Required</em></span><select name="courseType" required><option value="required" ${formValue("setup-major-course", "courseType") !== "elective" ? "selected" : ""}>Required</option><option value="elective" ${formValue("setup-major-course", "courseType") === "elective" ? "selected" : ""}>Elective</option></select></label>`, "Add major course")}${table(["Major", "Course", "Type"], majorCourses, "No major course requirements.")}`, "Degree structure")}
        ${panel("Major advisors", `${form("setup-major-advisor", `${select("setup-major-advisor", "majorId", "Major", majorOptions)}${select("setup-major-advisor", "employeeNumber", "Advisor account", advisorOptions)}`, "Assign advisor")}${table(["Major", "Advisor"], majorAdvisors, "No major advisors assigned.")}`, "Advisor access")}
        ${panel("Faculty profiles", `${form("setup-faculty", `${select("setup-faculty", "facultyId", "Faculty account", facultyAccountOptions)}${input("setup-faculty", "name", "Display name", "text", 'maxlength="200"')}${input("setup-faculty", "positionTitle", "Position title", "text", 'maxlength="160"')}${select("setup-faculty", "assignedDepartment", "Assigned department", departmentOptions)}${input("setup-faculty", "officeTelephone", "Office telephone", "text", 'maxlength="40"')}${input("setup-faculty", "officeNumber", "Office number", "text", 'maxlength="80"')}${input("setup-faculty", "officeHours", "Office hours", "text", 'maxlength="160"')}`, "Add faculty profile")}${table(["Faculty", "Title", "Department"], state.faculty.map((faculty) => [faculty.name, faculty.position, faculty.department]), "No faculty profiles. Create a faculty account first.")}`, "Faculty directory")}
        ${panel("Faculty teaching departments", `${form("setup-teaching-department", `${select("setup-teaching-department", "facultyId", "Faculty", facultyOptions)}${select("setup-teaching-department", "departmentCode", "Department", departmentOptions)}`, "Add teaching department")}${table(["Faculty", "Department"], teachingDepartments, "No teaching departments assigned.")}`, "Department assignments")}
        ${panel("Qualified faculty", `${form("setup-qualified-faculty", `${select("setup-qualified-faculty", "facultyId", "Faculty", facultyOptions)}${select("setup-qualified-faculty", "courseId", "Course", courseOptions)}`, "Qualify faculty")}${table(["Faculty", "Course"], qualifiedFaculty, "No faculty course qualifications.")}`, "Course assignments")}
        ${panel("Transcript entries", `${form("setup-transcript", `${select("setup-transcript", "studentId", "Student", studentOptions)}${select("setup-transcript", "courseId", "Course", courseOptions)}${input("setup-transcript", "semesterCompleted", "Semester completed", "text", 'maxlength="60"')}${input("setup-transcript", "grade", "Grade", "text", 'maxlength="10"')}`, "Add transcript entry")}${table(["Student", "Course", "Semester", "Grade"], transcriptRows, "No transcript entries.")}`, "Completed coursework")}
        ${panel("Transfer credit", `${form("setup-transfer", `${select("setup-transfer", "studentId", "Student", studentOptions)}${select("setup-transfer", "courseId", "Equivalent course", courseOptions)}${input("setup-transfer", "universityName", "University", "text", 'maxlength="200"')}${input("setup-transfer", "universityLocation", "University location", "text", 'maxlength="200"')}${input("setup-transfer", "semesterCompleted", "Semester completed", "text", 'maxlength="60"')}${input("setup-transfer", "units", "Units", "number", 'min="1" step="1"')}${input("setup-transfer", "grade", "Grade", "text", 'maxlength="10"')}`, "Add transfer credit")}${table(["Student", "Equivalent course", "University", "Semester"], transferRows, "No transfer credit records.")}`, "External coursework")}
      </div>
    </div>`;
  }

  async function saveAcademicSetup(formName, values) {
    const operations = {
      "setup-department": [
        `Added department ${values.departmentCode}`,
        () => window.SignMeUpApi.createDepartment({
          departmentCode: values.departmentCode.trim(),
          departmentName: values.departmentName.trim(),
        }, session.token),
      ],
      "setup-prerequisite": [
        `Added prerequisite ${values.prerequisiteId} for ${values.courseId}`,
        () => window.SignMeUpApi.createPrerequisite({
          courseId: values.courseId,
          prerequisiteId: values.prerequisiteId,
        }, session.token),
      ],
      "setup-major": [
        `Added major ${values.majorId}`,
        () => window.SignMeUpApi.createMajor({
          majorId: values.majorId.trim(),
          majorTitle: values.majorTitle.trim(),
          departmentCode: values.departmentCode,
          requiredUnits: values.requiredUnits,
        }, session.token),
      ],
      "setup-major-course": [
        `Added course ${values.courseId} to major ${values.majorId}`,
        () => window.SignMeUpApi.createMajorCourse(values, session.token),
      ],
      "setup-major-advisor": [
        `Assigned advisor ${values.employeeNumber} to major ${values.majorId}`,
        () => window.SignMeUpApi.addMajorAdvisor(values, session.token),
      ],
      "setup-faculty": [
        `Added faculty profile for ${values.facultyId}`,
        () => window.SignMeUpApi.createFacultyProfile({
          ...values,
          name: values.name.trim(),
          positionTitle: values.positionTitle.trim(),
        }, session.token),
      ],
      "setup-teaching-department": [
        `Assigned ${values.departmentCode} teaching department to faculty ${values.facultyId}`,
        () => window.SignMeUpApi.addFacultyTeachingDepartment(values, session.token),
      ],
      "setup-qualified-faculty": [
        `Qualified faculty ${values.facultyId} for ${values.courseId}`,
        () => window.SignMeUpApi.addQualifiedFaculty(values, session.token),
      ],
      "setup-transcript": [
        `Added transcript entry for student ${values.studentId}`,
        () => window.SignMeUpApi.addTranscriptEntry({
          ...values,
          semesterCompleted: values.semesterCompleted.trim(),
          grade: values.grade.trim(),
        }, session.token),
      ],
      "setup-transfer": [
        `Added transfer credit for student ${values.studentId}`,
        () => window.SignMeUpApi.addTransferCourse({
          ...values,
          universityName: values.universityName.trim(),
          universityLocation: values.universityLocation.trim(),
          semesterCompleted: values.semesterCompleted.trim(),
          grade: values.grade.trim(),
        }, session.token),
      ],
    };
    const operation = operations[formName];
    if (!operation) return;
    const saved = await persist(operation[0], operation[1]);
    if (saved) ui.academicSetup[formName] = {};
  }

  function renderHelp() {
    const topics = [
      ["Workspace navigation", "Use the left navigation to move between subsystems. Your role determines which screens are available."],
      ["Registration eligibility", "Course cards explain blocked conditions, including prerequisites, seats, major or minor, graduate acceptance, schedule conflicts, and the 18-credit cap."],
      ["Student records", "Student records include personal data, completed courses, transfer credit, current enrollment, GPA, and chronological notes."],
      ["Course management", "Administrators can add catalog courses and schedule class offerings from Course Management."],
      ["Academic setup", "Administrators can configure departments, course prerequisites, majors, faculty assignments, and student course history."],
      ["Reports and printing", "Open Reports, choose a report type, review the preview, and select Print preview or Export CSV."],
      ["Database data", "Records and supported changes are loaded from and saved to the SignMeUp API."],
    ];
    return `<div class="page-stack"><div class="intro-row"><div><p class="eyebrow">Context-sensitive help</p><h2>How can we help?</h2><p class="muted">This help center covers system functions, screens, and data fields.</p></div>${status(`Current screen: ${NAV_ITEMS.find((item) => item.id === page)?.label || "Help"}`, "info")}</div><div class="help-grid">${topics.map(([title, text]) => `<article class="help-card"><span class="help-card-icon">?</span><h3>${title}</h3><p>${text}</p></article>`).join("")}</div>${panel("Field reference", "<div class=\"table-wrap\"><table><thead><tr><th>Field</th><th>Required</th><th>Meaning</th></tr></thead><tbody><tr><td>Campus email / ID</td><td>Yes</td><td>Email address associated with an authorized database account.</td></tr><tr><td>Course ID</td><td>Yes</td><td>Unique course identifier used by registration and reports.</td></tr><tr><td>Registration type</td><td>Yes</td><td>Determines valid grade values.</td></tr><tr><td>Status date</td><td>Yes</td><td>Date an outline action was entered.</td></tr></tbody></table></div>")}</div>`;
  }



function renderContextHelp() {
  const screenHelp = {
    dashboard: {
      title: "Dashboard",
      description: "View your dashboard and access the features available to your assigned role."
    },
    registration: {
      title: "Course Registration",
      description: "Search course offerings, review eligibility, and register for available courses."
    },
    records: {
      title: "Electronic Student Records",
      description: "View student information, academic history, enrollment, GPA, and protected notes."
    },
    majors: {
      title: "Major Requirements",
      description: "Review major and minor requirements and their associated courses."
    },
    faculty: {
      title: "Faculty Information",
      description: "View and manage faculty and course information."
    },
    grades: {
      title: "Course Grades",
      description: "View and manage course grades according to your assigned permissions."
    },
    "course-management": {
      title: "Course Management",
      description: "Add courses to the catalog and create scheduled class offerings."
    },
    "academic-setup": {
      title: "Academic Setup",
      description: "Maintain the reference data and academic records used by registration, majors, and faculty screens."
    },
    reports: {
      title: "Reports",
      description: "Generate, review, and print available system reports."
    },
    users: {
      title: "User Management",
      description: "Manage user accounts, roles, and access permissions."
    },
    help: {
      title: "Help Center",
      description: "Find documentation and instructions for using SignMeUp."
    }
  };

  const currentHelp = screenHelp[page] || screenHelp.dashboard;

  return `
    <aside class="context-help-panel">
      <div class="context-help-search">
        <input
          type="search"
          placeholder="Search help..."
          aria-label="Search help"
        >
      </div>
      <div class="context-help-content">

        <h2 id="context-help-title">
          ${currentHelp.title}
        </h2>

        <span id="context-help-required" class="help-required">
          Select a field
        </span>

        <h3>Field Requirements</h3>
        <p id="context-help-requirements">
          Click or tab into a field to view its requirements.
        </p>

        <h3>Description</h3>
        <p id="context-help-description">
          ${currentHelp.description}
        </p>

        <button
          type="button"
          class="context-help-link"
          data-action="navigate"
          data-page="help"
        >
          View Screen Help
        </button>

      </div>

      <div class="context-help-footer">
        ${activeRole() === "admin"
          ? button("Edit Documentation", "edit-help", "primary")
          : ""}
      </div>

    </aside>
  `;
}



  async function registerCourse(courseId) {
    const studentId = activeRole() === "student" ? activeStudentId() : (ui.regStudent || activeStudentId());
    const result = checkEligibility(state, studentId, courseId, { requireOutline: ui.outlineOnly });
    if (!result.eligible) return showToast(result.reasons[0], "error");
    const course = courseById(state, courseId);
    if (!course?.classId) return showToast("There is no scheduled class for this course.", "error");
    await persist(`Registered ${studentId} for ${courseId}`, () => window.SignMeUpApi.createEnrollment({
      studentId,
      classId: course.classId,
      registrationType: "letter",
      requireOutline: ui.outlineOnly,
    }, session.token));
  }

  async function updateOutline(action, courseId, value) {
    if (!["admin", "advisor"].includes(activeRole())) return showToast("You are not authorized to modify this outline.", "error");
    const studentId = ui.majorStudent || activeStudentId();
    const outline = state.outlines[studentId];
    if (action === "create") {
      const student = studentById(state, studentId);
      if (!student?.major) return showToast("A student major is required to create an outline.", "error");
      return persist(`Created major outline for ${studentId}`, () => window.SignMeUpApi.createOutline({
        studentId,
        majorId: student.major,
      }, session.token));
    }
    if (!outline) return showToast("No outline exists for this student.", "error");
    if (action === "add") {
      if (!courseId) return showToast("Select a course to add.", "error");
      return persist(`Added ${courseId} to the outline`, () => window.SignMeUpApi.addOutlineEntry({
        outlineId: outline.id,
        courseId,
      }, session.token));
    }
    if (action === "status") {
      return persist(`Updated major outline for ${studentId}`, () => window.SignMeUpApi.updateOutlineEntry(
        outline.id,
        courseId,
        value,
        session.token,
      ));
    }
    if (action === "approve") {
      return persist(`Approved major outline for ${studentId}`, () => window.SignMeUpApi.approveOutline(outline.id, session.token));
    }
  }

  function csvCell(value) {
    let text = String(value ?? "");
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportCsv() {
    const type = ui.reportType;
    const rows = [];
    if (type === "student") {
      const student = studentById(state, ui.reportStudent || activeStudentId());
      rows.push(["Student ID", "Name", "Course", "Semester", "Units", "Grade"]);
      (student?.completedCourses || []).forEach((course) => rows.push([student.id, student.name, course.courseId, course.semester, course.units, course.grade]));
    } else {
      rows.push(["Course", "Department", "Student ID", "Grade"]);
      state.courses.filter((course) => type !== "department" || course.department === ui.reportDepartment).forEach((course) => {
        (state.grades[course.id]?.students || []).forEach((row) => rows.push([course.id, course.department, row.studentId, row.grade]));
      });
    }
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = `signmeup-${type}-report.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function updateSearchResults(kind) {
  // Generate the updated page HTML without replacing the current page.
  const template = document.createElement("template");
  template.innerHTML = renderShell();

  if (kind === "reg-query") {
    const newResults = template.content.querySelector(".course-list");
    const currentResults = root.querySelector(".course-list");

    if (newResults && currentResults) {
      currentResults.innerHTML = newResults.innerHTML;
    }
  }

  if (kind === "faculty-query") {
    const newLists = template.content.querySelectorAll(".directory-list");
    const currentLists = root.querySelectorAll(".directory-list");

    // Update faculty matches and course matches.
    newLists.forEach((newList, index) => {
      if (currentLists[index]) {
        currentLists[index].innerHTML = newList.innerHTML;
      }
    });
  }
}

  root.addEventListener("input", (event) => {
    const target = event.target;
    const kind = target.dataset.input;
    if (kind === "login-name") ui.loginName = target.value;
    if (kind === "login-password") ui.loginPassword = target.value;
    if (kind === "reg-query") ui.regQuery = target.value;
    if (kind === "faculty-query") ui.facultyQuery = target.value;
    if (kind === "note-draft") ui.noteDraft = target.value;
    if (kind === "grade-comment") ui.gradeComment = target.value;
    if (kind === "grade-note") {
      const row = state.grades[target.dataset.course]?.students.find((item) =>
        item.classId === target.dataset.class && item.studentId === target.dataset.student,
      );
      if (row) row.note = target.value;
    }
    if (target.closest("[data-form='record']")) ui.recordDraft[target.name] = target.type === "checkbox" ? target.checked : target.value;
    if (target.closest("[data-form='new-user']")) ui.userForm[target.name] = target.value;
    if (target.closest("[data-form='new-course']")) {
      ui.courseForm[target.name] = target.value;
      const preview = root.querySelector("[data-course-id-preview]");
      if (preview) {
        preview.textContent = ui.courseForm.departmentCode
          ? `${ui.courseForm.departmentCode} ${ui.courseForm.courseNumber || "###"}`
          : "Select a department and enter a 3-digit number";
      }
    }
    if (target.closest("[data-form='new-class']")) ui.classForm[target.name] = target.value;
    const setupForm = target.closest("form[data-form^='setup-']");
    if (setupForm) {
      ui.academicSetup[setupForm.dataset.form] ||= {};
      ui.academicSetup[setupForm.dataset.form][target.name] = target.value;
    }
    if (target.name === "password" && target.closest("[data-form='reset-password']")) ui.resetPassword = target.value;
    if (kind === "note-draft") {
      const submit = root.querySelector("[data-note-submit]");
      if (submit) submit.disabled = !ui.noteDraft.trim();
    }
    if (kind === "reg-query" || kind === "faculty-query") {
      updateSearchResults(kind);
    }
  });


  root.addEventListener("change", (event) => {
    const target = event.target;
    const kind = target.dataset.change;
    if (
      target.matches('input[data-input="reg-query"]') ||
      target.matches('input[data-input="faculty-query"]')
    ) {
      render();
      return;
    }
    if (kind === "preview-role") { session.previewRole = target.value; page = "dashboard"; }
    if (kind === "reg-student") ui.regStudent = target.value;
    if (kind === "reg-department") ui.regDepartment = target.value;
    if (kind === "eligible-only") ui.eligibleOnly = target.checked;
    if (kind === "outline-only") ui.outlineOnly = target.checked;
    if (kind === "record-student") { ui.recordStudent = target.value; ui.editingRecord = false; ui.recordDraft = {}; }
    if (kind === "major-id") ui.majorId = target.value;
    if (kind === "major-student") ui.majorStudent = target.value;
    if (kind === "major-report") ui.majorReport = target.value;
    if (kind === "outline-status") updateOutline("status", target.dataset.course, target.value);
    if (kind === "new-user-role") ui.userForm.role = target.value;
    if (kind === "course-department") ui.courseForm.departmentCode = target.value;
    if (kind === "course-level") ui.courseForm.courseLevel = target.value;
    const setupForm = target.closest("form[data-form^='setup-']");
    if (setupForm) {
      ui.academicSetup[setupForm.dataset.form] ||= {};
      ui.academicSetup[setupForm.dataset.form][target.name] = target.value;
    }
    if (kind === "offering-course") ui.classForm.courseId = target.value;
    if (kind === "offering-instructor") ui.classForm.instructorId = target.value;
    if (kind === "reg-report-type") { ui.regReportType = target.value; ui.regGenerated = false; }
    if (kind === "reg-report-student") { ui.regReportStudent = target.value; ui.regGenerated = false; }
    if (kind === "reg-report-department") { ui.regReportDepartment = target.value; ui.regGenerated = false; }
    if (kind === "record-report-details") ui.recordReportDetails = target.checked;
    if (kind === "record-report-scope") ui.recordReportScope = target.value;
    if (kind === "faculty-department") ui.facultyDepartment = target.value;
    if (kind === "grade-course") { ui.gradeCourse = target.value; ui.gradeComment = state.grades[target.value]?.generalComment || ""; }
    if (kind === "grade-type" || kind === "grade-value") {
      const record = state.grades[target.dataset.course] || (state.grades[target.dataset.course] = { generalComment: "", students: [] });
      let row = record.students.find((item) =>
        item.classId === target.dataset.class && item.studentId === target.dataset.student,
      );
      if (!row) {
        row = {
          classId: courseById(state, target.dataset.course)?.classId,
          studentId: target.dataset.student,
          registrationType: "letter",
          grade: "",
          note: "",
        };
        record.students.push(row);
      }
      if (kind === "grade-type") { row.registrationType = target.value; row.grade = ""; }
      else row.grade = target.value;
    }
    if (kind === "report-student") ui.reportStudent = target.value;
    if (kind === "report-course") ui.reportCourse = target.value;
    if (kind === "report-department") ui.reportDepartment = target.value;
    if (kind === "outline-course") ui.outlineCourse = target.value;
    render();
  });

  root.addEventListener("submit", async (event) => {
    const form = event.target;
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    if (form.dataset.form === "login") {
      try {
        const response = await window.SignMeUpApi.login(values.username, values.password);
        const user = response.user;
        session = {
          id: String(user.AccountNumber),
          accountNumber: String(user.AccountNumber),
          studentId: user.StudentID == null ? "" : String(user.StudentID),
          username: user.Email,
          name: user.UserName,
          role: window.SignMeUpApi.normalizeRole(user.AccountType),
          token: response.token,
        };
        page = "dashboard";
        ui.loginPassword = "";
        ui.error = "";
        await refreshData();
      } catch (error) {
        console.error("Could not sign in to SignMeUp.", error);
        ui.error = error.message;
        render();
      }
    } else if (form.dataset.form === "record") {
      const student = studentById(state, ui.recordStudent || activeStudentId());
      if (!student || !values.name?.trim() || !values.major?.trim()) return showToast("Student name and major are required.", "error");
      const saved = await persist(`Updated student record ${student.id}`, () => window.SignMeUpApi.updateStudent(student.id, {
        name: values.name.trim(),
        telephone: values.telephone,
        address: values.address,
        dateOfBirth: values.dateOfBirth,
        major: values.major.trim(),
        minor: values.minor,
        graduateAccepted: form.elements.graduateAccepted.checked,
      }, session.token));
      if (saved) {
        ui.editingRecord = false;
        ui.recordDraft = {};
      }
    } else if (form.dataset.form === "note") {
      const student = studentById(state, ui.recordStudent || activeStudentId());
      if (!student || !values.note?.trim()) return;
      const saved = await persist(`Added a protected note to student ${student.id}`, () => window.SignMeUpApi.addStudentNote(
        student.id,
        values.note.trim(),
        session.token,
      ));
      if (saved) ui.noteDraft = "";
    } else if (form.dataset.form === "new-user") {
      if (!values.name.trim() || !values.username.trim() || !values.password || !values.role) {
        return showToast("Name, email, password, and role are required.", "error");
      }
      if (values.role === "student" && (!values.dateOfBirth || !values.major?.trim())) {
        return showToast("Student accounts require a date of birth and major.", "error");
      }
      const saved = await persist(`Created authorized user ${values.username}`, () => window.SignMeUpApi.createUser({
        name: values.name.trim(),
        username: values.username.trim(),
        password: values.password,
        accountType: values.role,
        dateOfBirth: values.dateOfBirth,
        major: values.major?.trim(),
        minor: values.minor?.trim(),
      }, session.token));
      if (saved) {
        ui.userForm = { name: "", username: "", password: "", role: "student", dateOfBirth: "", major: "", minor: "" };
      }
    } else if (form.dataset.form === "reset-password") {
      if (!values.password?.trim()) return showToast("Enter a replacement password.", "error");
      const saved = await persist(`Reset password for ${values.userId}`, () => window.SignMeUpApi.updatePassword(
        values.userId,
        values.password,
        session.token,
      ));
      if (saved) {
        ui.resetPassword = "";
        ui.resetUser = values.userId;
      }
    } else if (form.dataset.form === "new-course") {
      if (!values.courseNumber || !values.title?.trim() || !values.units || !values.departmentCode) {
        return showToast("A 3-digit course number, title, units, and department are required.", "error");
      }
      const courseId = `${values.departmentCode} ${values.courseNumber}`;
      const saved = await persist(`Added course ${courseId}`, () => window.SignMeUpApi.createCourse({
        courseNumber: values.courseNumber,
        title: values.title.trim(),
        units: values.units,
        description: values.description?.trim() || "",
        departmentCode: values.departmentCode,
        courseLevel: values.courseLevel,
      }, session.token));
      if (saved) {
        ui.courseForm = { courseNumber: "", title: "", units: "", description: "", departmentCode: "", courseLevel: "lower" };
      }
    } else if (form.dataset.form === "new-class") {
      if (!values.courseId || !values.scheduleNumber?.trim() || !values.semesterStart || !values.semesterEnd ||
        !values.meetingTime?.trim() || !values.location?.trim() || values.capacity === "") {
        return showToast("Course, schedule number, semester dates, meeting time, location, and capacity are required.", "error");
      }
      const saved = await persist(`Added offering ${values.scheduleNumber}`, () => window.SignMeUpApi.createClassOffering({
        courseId: values.courseId,
        scheduleNumber: values.scheduleNumber.trim(),
        instructorId: values.instructorId || "",
        semesterStart: values.semesterStart,
        semesterEnd: values.semesterEnd,
        meetingTime: values.meetingTime.trim(),
        location: values.location.trim(),
        capacity: values.capacity,
      }, session.token));
      if (saved) {
        ui.classForm = { courseId: "", scheduleNumber: "", instructorId: "", semesterStart: "", semesterEnd: "", meetingTime: "", location: "", capacity: "" };
      }
    } else if (form.dataset.form.startsWith("setup-")) {
      await saveAcademicSetup(form.dataset.form, values);
    }
    render();
  });



root.addEventListener("focusin", (event) => {
  const field = event.target.closest("[data-help-title]");

  if (!field) return;

  const title = root.querySelector("#context-help-title");
  const required = root.querySelector("#context-help-required");
  const requirements = root.querySelector("#context-help-requirements");
  const description = root.querySelector("#context-help-description");

  if (title) title.textContent = field.dataset.helpTitle;
  if (required) required.textContent = field.dataset.helpRequired;
  if (requirements) requirements.textContent = field.dataset.helpRequirements;
  if (description) description.textContent = field.dataset.helpDescription;
});


  root.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "navigate") { page = target.dataset.page; }
    else if (action === "toggle-help") {
      ui.showHelp = !ui.showHelp;
    }
    else if (action === "signout") {
      session = null;
      state = null;
      apiError = "";
      ui.error = "";
      ui.loginName = "";
      ui.loginPassword = "";
      ui.showPassword = false;
    }
    else if (action === "dismiss-toast") toast = null;
    else if (action === "toggle-password") ui.showPassword = !ui.showPassword;
    else if (action === "print") { window.print(); return; }
    else if (action === "refresh-data" || action === "retry-load") { refreshData(); return; }
    else if (action.startsWith("major-tab:")) ui.majorTab = action.split(":")[1];
    else if (action === "register") { await registerCourse(target.dataset.course); return; }
    else if (action === "drop-course") {
      const studentId = activeRole() === "student" ? activeStudentId() : (ui.regStudent || activeStudentId());
      await persist(`Canceled registration for ${studentId}`, () => window.SignMeUpApi.deleteEnrollment(
        studentId,
        target.dataset.class,
        session.token,
      ));
      return;
    } else if (action === "toggle-record-edit") {
      ui.editingRecord = !ui.editingRecord;
      if (ui.editingRecord) ui.recordDraft = { ...studentById(state, ui.recordStudent || activeStudentId()) };
    } else if (action === "outline-create") {
      await updateOutline("create");
      return;
    } else if (action === "outline-add") {
      const saved = await updateOutline("add", ui.outlineCourse);
      if (saved) ui.outlineCourse = "";
      return;
    } else if (action === "outline-approve") {
      await updateOutline("approve");
      return;
    }
    else if (action === "open-record-report") ui.showRecordReport = true;
    else if (action === "open-grade-sheet") ui.showGradeSheet = true;
    else if (action === "close-grade-sheet") ui.showGradeSheet = false;
    else if (action === "close-record-report") ui.showRecordReport = false;
    else if (action === "generate-reg-report") ui.regGenerated = true;
    else if (action === "close-reg-report") ui.regGenerated = false;
    else if (action === "save-grade") {
      const courseId = target.dataset.course;
      const record = state.grades[courseId];
      const row = record?.students.find((item) =>
        item.classId === target.dataset.class && item.studentId === target.dataset.student,
      );
      if (!row?.grade) return;
      const course = courseById(state, courseId);
      if (activeRole() !== "admin" && (!course?.semesterEnd || Date.parse(`${course.semesterEnd}T23:59:59Z`) > Date.now())) {
        return showToast("Grade entry is restricted until the end of the semester.", "error");
      }
      await persist(`Updated ${courseId} grade for ${row.studentId}`, () => window.SignMeUpApi.saveGrade(
        target.dataset.class,
        row.studentId,
        { registrationType: row.registrationType, grade: row.grade, note: row.note || "" },
        session.token,
      ));
      return;
    } else if (action === "save-comment") {
      const course = courseById(state, ui.gradeCourse || state.courses[0]?.id);
      if (!course?.classId) return showToast("No class is selected for this course comment.", "error");
      await persist(`Updated ${course.id} course comment`, () => window.SignMeUpApi.saveCourseComment(
        course.classId,
        ui.gradeComment ?? state.grades[course.id]?.generalComment ?? "",
        session.token,
      ));
      return;
    } else if (action === "delete-user") {
      if (!window.confirm("Delete this authorized account? This cannot be undone.")) return;
      const deleted = await persist(`Deleted authorized user ${target.dataset.user}`, () => window.SignMeUpApi.deleteUser(
        target.dataset.user,
        session.token,
      ));
      if (deleted && ui.resetUser === target.dataset.user) ui.resetUser = "";
      return;
    } else if (action === "report-type") ui.reportType = target.dataset.type;
    else if (action === "export-csv") { exportCsv(); return; }
    render();
  });

  refreshData();
})();
