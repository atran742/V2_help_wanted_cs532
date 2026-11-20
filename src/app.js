(function () {
  "use strict";

  const {
    cloneInitialState,
    getDemoUser,
    ROLE_LABELS,
    NAV_ITEMS,
    calculateGpa,
    checkEligibility,
    courseById,
    studentById,
    gradePoints,
  } = window.SignMeUpData;
  const { dateTime } = window.SignMeUpUtils;
  const STORAGE_KEY = "signmeup-prototype-state-v2";
  const root = document.getElementById("root");
  let state = loadState();
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
    gradeEndOfSemester: true,
    reportType: "student",
    reportStudent: "",
    reportDepartment: "CS",
    reportCourse: "",
    showHelp: false,
    userForm: { name: "", username: "", password: "", role: "student" },
    resetUser: "",
    resetPassword: "",
  };

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : cloneInitialState();
    } catch (error) {
      console.error("Could not load saved SignMeUp data; using demo data.", error);
      return cloneInitialState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error("Could not save SignMeUp data.", error);
      showToast("Changes could not be saved in this browser.", "error");
    }
  }

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
    return state.users.find((user) => user.id === session.id) || session;
  }

  function activeStudentId() {
    const user = currentUser();
    return activeRole() === "student" && state.students.some((student) => student.id === user.id)
      ? user.id
      : state.students[0]?.id || "";
  }

  function audit(action) {
    state.auditLog.unshift({
      id: Date.now(),
      userId: currentUser().id,
      action,
      at: new Date().toISOString(),
    });
    saveState();
  }

  function mutate(action, update) {
    update();
    audit(action);
    render();
    showToast(action);
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

  function render() {
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
    const demos = [
      ["Student", "student@example.edu", "student123"],
      ["Faculty", "faculty@example.edu", "faculty123"],
      ["Advisor", "advisor@example.edu", "advisor123"],
      ["Admin", "admin@example.edu", "admin123"],
    ];
    return `<main class="login-shell">
      <section class="login-brand"><div><p class="wordmark">College <span>SignMeUp</span></p><p class="tagline">University portal</p></div>
        <div class="login-copy"><p class="eyebrow">One connected campus workspace</p><h1>Your next chapter starts here.</h1><p>Register for classes, track degree progress, maintain student records, and support faculty workflows from one browser-based workspace.</p></div>
        <div class="login-metrics"><div><strong>5</strong><span>subsystems</span></div><div><strong>24/7</strong><span>web access</span></div><div><strong>1</strong><span>shared record</span></div></div></section>
      <section class="login-panel"><div class="login-card"><p class="eyebrow">Demo access</p><h2>Sign in to SignMeUp</h2><p class="muted">Choose a demo account or enter its credentials.</p>
        ${ui.error ? `<div class="alert alert-error" role="alert">${escapeHtml(ui.error)}</div>` : ""}
        <form data-form="login" class="form-stack"><label for="login-name">Student ID or campus email</label><input id="login-name" name="username" data-focus="login-name" value="${escapeHtml(ui.loginName)}" autocomplete="username" required>
        <label for="login-password">Password</label><div class="password-wrap"><input id="login-password" name="password" data-focus="login-password" type="${ui.showPassword ? "text" : "password"}" value="${escapeHtml(ui.loginPassword)}" autocomplete="current-password" required>
        <button type="button" class="inline-button" data-action="toggle-password">${ui.showPassword ? "Hide" : "Show"}</button></div><button class="button button-primary" type="submit">Sign in</button></form>
        <div class="divider"><span>Demo accounts</span></div><div class="demo-grid">${demos.map(([label, username, password]) => `<button type="button" class="demo-account" data-action="demo-login" data-username="${username}" data-password="${password}"><strong>${label}</strong><span>${username}</span></button>`).join("")}</div>
        <p class="muted small">This offline prototype stores data in this browser only. It is not a production authentication system.</p></div></section></main>`;
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
      <div class="sidebar-bottom"><div class="secure-note"><span>●</span><div><strong>Local demo workspace</strong><small>Changes stay in this browser</small></div></div><button type="button" class="signout" data-action="signout">Sign out</button></div></aside>
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
    return `<div class="page-stack"><div class="welcome-row"><div><p class="eyebrow">${new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</p><h2>Good morning, ${escapeHtml(user.name.split(" ")[0])}.</h2><p class="muted">Your ${escapeHtml(ROLE_LABELS[activeRole()].toLowerCase())} workspace is ready.</p></div><div class="welcome-actions">${button("Print this display", "print", "secondary")}${button("Reset demo data", "reset", "ghost")}</div></div>
      <div class="metric-grid"><div class="metric-card metric-maroon"><span>Registered courses</span><strong>${student?.currentEnrollment.length ?? 0}</strong><small>${student ? `${student.currentEnrollment.reduce((sum, item) => sum + item.units, 0)} credits this term` : "Shared workspace"}</small></div><div class="metric-card metric-blue"><span>Available seats</span><strong>${seats}</strong><small>Across all departments</small></div><div class="metric-card metric-green"><span>Student GPA</span><strong>${student ? calculateGpa(student) : "—"}</strong><small>Current calculated GPA</small></div><div class="metric-card metric-gold"><span>Audit events</span><strong>${state.auditLog.length}</strong><small>Logged workspace actions</small></div></div>
      <div class="dashboard-grid">${panel("Start with a task", `<div class="quick-action-grid">${quick.map(([id, title, description]) => `<button type="button" class="quick-action" data-action="navigate" data-page="${id}"><span class="quick-arrow">↗</span><strong>${title}</strong><span>${description}</span></button>`).join("")}</div>`, "Quick access")}
      ${panel("System status", `<div class="status-list"><div><span class="status-dot green"></span> Browser prototype <strong>Ready</strong></div><div><span class="status-dot green"></span> Local persistence <strong>Enabled</strong></div><div><span class="status-dot gold"></span> PostgreSQL integration <strong>Not used by this page</strong></div></div><p class="panel-footnote">The prototype stores changes in this browser using local storage.</p>`, "Operational overview")}</div>
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
      return `<article class="course-card"><div class="course-card-main"><div class="course-title-row"><span class="course-code">${course.id}</span>${status(eligibility.eligible ? "Eligible" : "Review rules", eligibility.eligible ? "success" : "error")}</div><h3>${escapeHtml(course.title)}</h3><p>${escapeHtml(course.description)}</p><div class="course-meta"><span>${course.department} · ${course.units} units</span><span>${escapeHtml(course.schedule)}</span><span>${course.seats} seats left</span></div>${eligibility.eligible ? "" : `<details class="eligibility-details"><summary>Why registration is blocked</summary><ul>${eligibility.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></details>`}</div><button class="button button-primary" data-action="register" data-course="${course.id}" ${eligibility.eligible ? "" : "disabled"}>${eligibility.eligible ? "Register" : "Unavailable"}</button></article>`;
    }).join("");
    const schedule = student?.currentEnrollment.length
      ? `<div class="schedule-list">${student.currentEnrollment.map((item) => `<div class="schedule-row"><div><strong>${item.courseId}</strong><span>${escapeHtml(item.title)}</span><small>${escapeHtml(item.schedule)} · ${item.units} units</small></div><button type="button" class="button button-danger button-sm" data-action="drop-course" data-course="${item.courseId}">Cancel</button></div>`).join("")}</div>`
      : empty("Schedule is empty", "Select an eligible offering to register one course at a time.");
    const reportStudentId = role === "student" ? activeStudentId() : (ui.regReportStudent || activeStudentId());
    const reportDepartmentCourses = state.courses.filter((course) => (ui.regReportDepartment === "all" || course.department === ui.regReportDepartment) && (ui.regReportType !== "available" || course.seats > 0));
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
  data-help-requirements="A valid date must be entered."
  data-help-description="The student's date of birth, used for identification and student records."
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
    const outlineMajor = state.majors.find((item) => item.id === outline?.majorId);
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
      body = `<label class="inline-select">Select Student <select data-change="major-student">${selectable.map((item) => `<option value="${item.id}" ${item.id === studentId ? "selected" : ""}>${escapeHtml(item.name)} (${item.id})</option>`).join("")}</select></label>${!student || !outline || !outlineMajor ? empty("No approved outline", "This student does not currently have a major outline.") : `<div class="record-summary">${info("Student", student.name)}${info("Major", outlineMajor.title)}${info("Approved by", outline.approvedBy)}${info("Last approved", outline.lastApproved)}</div><div class="outline-list"><h3>Selected major courses</h3>${outline.entries.map((entry) => `<div class="outline-row"><div><strong>${entry.courseId}</strong><span>${escapeHtml(courseById(state, entry.courseId)?.title || "Course not in catalog")}</span><small>Status date: ${entry.statusDate}</small></div>${canEdit ? `<select data-change="outline-status" data-course="${entry.courseId}" data-student="${studentId}">${["approved", "dropped", "waived"].map((s) => `<option ${entry.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>` : status(entry.status, entry.status === "approved" ? "success" : "warning")}</div>`).join("")}</div>${canEdit ? `<div class="form-stack"><h3>Add a course to the outline</h3><select data-change="outline-course"><option value="">Select a course</option>${[...outlineMajor.requiredCourses, ...outlineMajor.electiveCourses].filter((id) => !outline.entries.some((entry) => entry.courseId === id)).map((id) => `<option value="${id}">${id} — ${escapeHtml(courseById(state, id)?.title)}</option>`).join("")}</select>${button("Add course", "outline-add")}${button("Approve major outline", "outline-approve")}</div>` : ""}`}`;
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
    const record = state.grades[course.id] || { generalComment: "", students: [] };
    const rows = [...record.students];
    state.students.filter((student) => student.currentEnrollment.some((item) => item.courseId === course.id)).forEach((student) => {
      if (!rows.some((row) => row.studentId === student.id)) rows.push({ studentId: student.id, registrationType: "letter", grade: "", note: "" });
    });
    const tableRows = rows.map((row) => `<tr><td><strong>${escapeHtml(studentById(state, row.studentId)?.name || row.studentId)}</strong><small>${row.studentId}</small></td><td><select data-change="grade-type" data-student="${row.studentId}" data-course="${course.id}">${["letter", "credit/no credit", "audit"].map((type) => `<option ${row.registrationType === type ? "selected" : ""}>${type}</option>`).join("")}</select></td><td><select data-change="grade-value" data-student="${row.studentId}" data-course="${course.id}"><option value="">Select</option>${(row.registrationType === "letter" ? ["A", "B", "C", "D", "F"] : row.registrationType === "credit/no credit" ? ["CR", "NC"] : ["AU"]).map((grade) => `<option ${row.grade === grade ? "selected" : ""}>${grade}</option>`).join("")}</select></td><td><input data-input="grade-note" data-student="${row.studentId}" data-course="${course.id}" value="${escapeHtml(row.note || "")}" placeholder="Optional note"></td><td><small>${row.updatedAt ? dateTime(row.updatedAt) : "Not entered"}<br>${escapeHtml(row.updatedBy || "—")}</small></td><td><button type="button" class="button button-primary button-sm" data-action="save-grade" data-student="${row.studentId}" data-course="${course.id}" ${row.grade ? "" : "disabled"}>Save</button></td></tr>`).join("");
    return `<div class="page-stack"><div class="intro-row"><div><p class="eyebrow">GRADE subsystem</p><h2>Maintain course grades</h2><p class="muted">Enter a letter, credit/no credit, or audit grade, and keep notes on updates.</p></div><div class="legend"><label class="check-label"><input type="checkbox" data-change="grade-period" ${ui.gradeEndOfSemester ? "checked" : ""}> End-of-semester period</label>${button("Print grade sheet", "print", "secondary")}</div></div>${panel("Course selection", `<div class="filter-row"><label class="inline-select">Course <select data-change="grade-course">${courses.map((item) => `<option value="${item.id}" ${item.id === course.id ? "selected" : ""}>${item.id} · ${escapeHtml(item.title)}</option>`).join("")}</select></label>${status(`${course.department} · ${course.schedule} · ${course.units} units`, "info")}</div>`, "Primary instructor access")}${panel("Student grade sheet", `<div class="table-wrap"><table class="grades-table"><thead><tr><th>Student</th><th>Registration type</th><th>Grade</th><th>Student note</th><th>Last update</th><th></th></tr></thead><tbody>${tableRows}</tbody></table></div>${rows.length ? "" : empty("No enrolled students", "Students registered for this course will appear here.")}`, `${course.id} · ${escapeHtml(course.instructor)}`)}<div class="two-column-layout">${panel("General course comment", `<textarea data-input="grade-comment" data-focus="grade-comment">${escapeHtml(ui.gradeComment ?? record.generalComment)}</textarea>${button("Save comment", "save-comment")}`, "Not linked to a student")}${panel("Grade access rules", "<ul class=\"rule-list\"><li>Normal faculty updates are allowed at the end of semester.</li><li>Administrators have special update privileges.</li><li>Every update stores the updater and timestamp.</li><li>Student notes stay separate from the general comment.</li></ul>", "CG04")}</div></div>`;
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
    return `<div class="page-stack"><div class="intro-row"><div><p class="eyebrow">Framework administration</p><h2>Authorized users</h2><p class="muted">Create local demo accounts and reset passwords.</p></div>${status("Admin only", "warning")}</div><div class="two-column-layout">${panel("Create authorized user", `<form data-form="new-user" class="form-stack">${field("User name", form.name, "name", "text", true)}${field("Campus email", form.username, "username", "email", true)}${field("Initial password", form.password, "password", "password", true)}<label class="form-field"><span>Role</span><select name="role">${["student", "faculty", "advisor", "admin"].map((role) => `<option value="${role}" ${form.role === role ? "selected" : ""}>${ROLE_LABELS[role]}</option>`).join("")}</select></label><button class="button button-primary">Create user</button></form>`, "SF03–SF04")}${panel("Reset password", `<form data-form="reset-password" class="form-stack"><label class="form-field"><span>User</span><select name="userId">${state.users.map((user) => `<option value="${user.id}" ${ui.resetUser === user.id ? "selected" : ""}>${escapeHtml(user.name)} · ${user.id}</option>`).join("")}</select></label>${field("Replacement password", ui.resetPassword, "password", "password", true)}<button class="button button-primary">Reset password</button></form>`, "SF07")}</div>${panel("User access report", `<div class="table-wrap"><table><thead><tr><th>Name</th><th>Employee / student ID</th><th>Role</th><th>Access areas</th></tr></thead><tbody>${state.users.map((user) => `<tr><td><strong>${escapeHtml(user.name)}</strong><small>${escapeHtml(user.username)}</small></td><td>${user.id}</td><td>${status(ROLE_LABELS[user.role], "info")}</td><td>${escapeHtml(user.access.join(", ") || "Not assigned")}</td></tr>`).join("")}</tbody></table></div>`, `${state.users.length} authorized users`, button("Print report", "print", "secondary"))}</div>`;
  }

  function renderHelp() {
    const topics = [
      ["Workspace navigation", "Use the left navigation to move between subsystems. Your role determines which screens are available."],
      ["Registration eligibility", "Course cards explain blocked conditions, including prerequisites, seats, major or minor, graduate acceptance, schedule conflicts, and the 18-credit cap."],
      ["Student records", "Student records include personal data, completed courses, transfer credit, current enrollment, GPA, and chronological notes."],
      ["Reports and printing", "Open Reports, choose a report type, review the preview, and select Print preview or Export CSV."],
      ["Demo data", "This standalone prototype stores data in browser local storage. Do not use real or sensitive information."],
    ];
    return `<div class="page-stack"><div class="intro-row"><div><p class="eyebrow">Context-sensitive help</p><h2>How can we help?</h2><p class="muted">This help center covers system functions, screens, and data fields.</p></div>${status(`Current screen: ${NAV_ITEMS.find((item) => item.id === page)?.label || "Help"}`, "info")}</div><div class="help-grid">${topics.map(([title, text]) => `<article class="help-card"><span class="help-card-icon">?</span><h3>${title}</h3><p>${text}</p></article>`).join("")}</div>${panel("Field reference", "<div class=\"table-wrap\"><table><thead><tr><th>Field</th><th>Required</th><th>Meaning</th></tr></thead><tbody><tr><td>Campus email / ID</td><td>Yes</td><td>Assigned identifier for a demo account.</td></tr><tr><td>Course ID</td><td>Yes</td><td>Unique course identifier used by registration and reports.</td></tr><tr><td>Registration type</td><td>Yes</td><td>Determines valid grade values.</td></tr><tr><td>Status date</td><td>Yes</td><td>Date an outline action was entered.</td></tr></tbody></table></div>")}</div>`;
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



  function registerCourse(courseId) {
    const studentId = activeRole() === "student" ? activeStudentId() : (ui.regStudent || activeStudentId());
    const result = checkEligibility(state, studentId, courseId, { requireOutline: ui.outlineOnly });
    if (!result.eligible) return showToast(result.reasons[0], "error");
    const course = courseById(state, courseId);
    const student = studentById(state, studentId);
    mutate(`Registered ${studentId} for ${courseId}`, () => {
      student.currentEnrollment.push({ courseId, title: course.title, units: course.units, schedule: course.schedule, semester: "Fall 2026" });
      course.seats -= 1;
    });
  }

  function updateOutline(action, courseId, value) {
    if (!["admin", "advisor"].includes(activeRole())) return showToast("You are not authorized to modify this outline.", "error");
    const studentId = ui.majorStudent || activeStudentId();
    const outline = state.outlines[studentId];
    if (!outline) return;
    mutate(`Updated major outline for ${studentId}`, () => {
      const now = new Date().toISOString();
      if (action === "add" && courseId && !outline.entries.some((item) => item.courseId === courseId)) {
        outline.entries.push({ courseId, status: "approved", statusDate: now.slice(0, 10), approvedBy: currentUser().id });
        outline.history.unshift({ courseId, action: "course_added", from: null, to: "approved", changedBy: currentUser().id, changedAt: now });
      } else if (action === "status") {
        const entry = outline.entries.find((item) => item.courseId === courseId);
        if (entry && entry.status !== value) {
          const previous = entry.status;
          entry.status = value;
          entry.statusDate = now.slice(0, 10);
          entry.approvedBy = currentUser().id;
          outline.history.unshift({ courseId, action: "status_changed", from: previous, to: value, changedBy: currentUser().id, changedAt: now });
        }
      } else if (action === "approve") {
        outline.approvedBy = currentUser().id;
        outline.lastApproved = now.slice(0, 10);
        outline.history.unshift({ courseId: null, action: "outline_approved", from: null, to: "approved", changedBy: currentUser().id, changedAt: now });
      }
    });
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
      const row = state.grades[target.dataset.course]?.students.find((item) => item.studentId === target.dataset.student);
      if (row) row.note = target.value;
    }
    if (target.closest("[data-form='record']")) ui.recordDraft[target.name] = target.type === "checkbox" ? target.checked : target.value;
    if (target.closest("[data-form='new-user']")) ui.userForm[target.name] = target.value;
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
    if (kind === "reg-report-type") { ui.regReportType = target.value; ui.regGenerated = false; }
    if (kind === "reg-report-student") { ui.regReportStudent = target.value; ui.regGenerated = false; }
    if (kind === "reg-report-department") { ui.regReportDepartment = target.value; ui.regGenerated = false; }
    if (kind === "record-report-details") ui.recordReportDetails = target.checked;
    if (kind === "record-report-scope") ui.recordReportScope = target.value;
    if (kind === "faculty-department") ui.facultyDepartment = target.value;
    if (kind === "grade-course") { ui.gradeCourse = target.value; ui.gradeComment = state.grades[target.value]?.generalComment || ""; }
    if (kind === "grade-period") ui.gradeEndOfSemester = target.checked;
    if (kind === "grade-type" || kind === "grade-value") {
      const record = state.grades[target.dataset.course] || (state.grades[target.dataset.course] = { generalComment: "", students: [] });
      let row = record.students.find((item) => item.studentId === target.dataset.student);
      if (!row) { row = { studentId: target.dataset.student, registrationType: "letter", grade: "", note: "" }; record.students.push(row); }
      if (kind === "grade-type") { row.registrationType = target.value; row.grade = ""; }
      else row.grade = target.value;
    }
    if (kind === "report-student") ui.reportStudent = target.value;
    if (kind === "report-course") ui.reportCourse = target.value;
    if (kind === "report-department") ui.reportDepartment = target.value;
    if (kind === "outline-course") ui.outlineCourse = target.value;
    render();
  });

  root.addEventListener("submit", (event) => {
    const form = event.target;
    const values = Object.fromEntries(new FormData(form));
    event.preventDefault();
    if (form.dataset.form === "login") {
      const user = getDemoUser(state, values.username, values.password);
      if (!user) { ui.error = "The demo credentials were not recognized. Choose an account below and try again."; render(); return; }
      session = user;
      page = "dashboard";
      ui.error = "";
      state.auditLog.unshift({ id: Date.now(), userId: user.id, action: "Signed in", at: new Date().toISOString() });
      saveState();
      render();
    } else if (form.dataset.form === "record") {
      const student = studentById(state, ui.recordStudent || activeStudentId());
      if (!values.name?.trim() || !values.major?.trim()) return showToast("Student name and major are required.", "error");
      mutate(`Updated student record ${student.id}`, () => Object.assign(student, { name: values.name.trim(), telephone: values.telephone, address: values.address, dateOfBirth: values.dateOfBirth, major: values.major.trim(), minor: values.minor, graduateAccepted: form.elements.graduateAccepted.checked }));
      ui.editingRecord = false;
      ui.recordDraft = {};
    } else if (form.dataset.form === "note") {
      const student = studentById(state, ui.recordStudent || activeStudentId());
      if (values.note?.trim()) mutate(`Added a protected note to student ${student.id}`, () => student.notes.push({ id: `N${Date.now()}`, text: values.note.trim(), createdAt: new Date().toISOString(), employeeId: currentUser().id }));
      ui.noteDraft = "";
    } else if (form.dataset.form === "new-user") {
      if (!values.name.trim() || !values.username.trim() || !values.password) return showToast("Name, email, password, and role are required.", "error");
      const id = values.role === "student" ? `S${Date.now().toString().slice(-4)}` : `U${Date.now().toString().slice(-4)}`;
      mutate(`Created authorized user ${values.username}`, () => {
        state.users.push({ id, username: values.username.trim(), password: values.password, name: values.name.trim(), role: values.role, title: ROLE_LABELS[values.role], access: [] });
        if (values.role === "student") state.students.push({ id, name: values.name.trim(), telephone: "", address: "", dateOfBirth: "", major: "", minor: "", graduateAccepted: false, completedCourses: [], transferCourses: [], currentEnrollment: [], notes: [] });
      });
      ui.userForm = { name: "", username: "", password: "", role: "student" };
    } else if (form.dataset.form === "reset-password") {
      if (values.password.trim()) mutate(`Reset password for ${values.userId}`, () => { const user = state.users.find((item) => item.id === values.userId); if (user) user.password = values.password; });
      ui.resetPassword = "";
      ui.resetUser = values.userId;
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


  root.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "navigate") { page = target.dataset.page; }
    else if (action === "toggle-help") {
      ui.showHelp = !ui.showHelp;
    }
    else if (action === "signout") { session = null; ui.error = ""; }
    else if (action === "dismiss-toast") toast = null;
    else if (action === "toggle-password") ui.showPassword = !ui.showPassword;
    else if (action === "demo-login") { ui.loginName = target.dataset.username; ui.loginPassword = target.dataset.password; ui.error = ""; }
    else if (action === "print") { window.print(); return; }
    else if (action === "reset") { if (window.confirm("Reset the browser prototype data to its original demo state?")) { state = cloneInitialState(); saveState(); } }
    else if (action.startsWith("major-tab:")) ui.majorTab = action.split(":")[1];
    else if (action === "register") { registerCourse(target.dataset.course); return; }
    else if (action === "drop-course") {
      const studentId = activeRole() === "student" ? activeStudentId() : (ui.regStudent || activeStudentId());
      mutate(`Canceled registration for ${target.dataset.course}`, () => {
        const student = studentById(state, studentId);
        const course = courseById(state, target.dataset.course);
        student.currentEnrollment = student.currentEnrollment.filter((item) => item.courseId !== target.dataset.course);
        if (course) course.seats += 1;
      });
      return;
    } else if (action === "toggle-record-edit") {
      ui.editingRecord = !ui.editingRecord;
      if (ui.editingRecord) ui.recordDraft = { ...studentById(state, ui.recordStudent || activeStudentId()) };
    } else if (action === "outline-add") { updateOutline("add", ui.outlineCourse); ui.outlineCourse = ""; }
    else if (action === "outline-approve") updateOutline("approve");
    else if (action === "open-record-report") ui.showRecordReport = true;
    else if (action === "close-record-report") ui.showRecordReport = false;
    else if (action === "generate-reg-report") ui.regGenerated = true;
    else if (action === "close-reg-report") ui.regGenerated = false;
    else if (action === "save-grade") {
      const courseId = target.dataset.course;
      const record = state.grades[courseId];
      const row = record?.students.find((item) => item.studentId === target.dataset.student);
      if (!row?.grade) return;
      if (activeRole() !== "admin" && !ui.gradeEndOfSemester) return showToast("Grade entry is restricted until the end of the semester.", "error");
      mutate(`Updated ${courseId} grade for ${row.studentId}`, () => { row.updatedBy = currentUser().id; row.updatedAt = new Date().toISOString(); });
      return;
    } else if (action === "save-comment") {
      const courseId = ui.gradeCourse || state.courses[0]?.id;
      mutate(`Updated ${courseId} course comment`, () => { (state.grades[courseId] ||= { students: [] }).generalComment = ui.gradeComment; });
      return;
    } else if (action === "report-type") ui.reportType = target.dataset.type;
    else if (action === "export-csv") { exportCsv(); return; }
    render();
  });

  render();
})();
