# SignMeUp

An application which will help students and staff nagivate course registration, student records, class information, faculty information, and student grades

## Developed by the 'Help Wanted Team'

```
Project Manager: Isha Shekhar

Configuration Manager: Elijah Uy

Software Manager: Amy Tran

Database Manager: Natalie Petersen

Test Manager: Justin Ogden

Software Developer: Anirudh Jha
```

## File Structure

```
SignMeUp/
├── index.html
├── src/
│   ├── app.js
│   ├── data.js
│   ├── index.css
│   └── utils.js
├── backend/
│   ├── server.js
│   └── config/db.js
└── database/
    └── cs532_databasescript.sql
```

## Systems Architecture

![alt text](docs/Systems_architecture/Sw_arch_532.png)

## Quick start

The browser app loads records from the PostgreSQL API. Start the API and serve the project root over HTTP (for example, with the VS Code Live Server extension).

Create a repository-root `.env` file containing your PostgreSQL connection string:

```text
DATABASE_URL=your_postgresql_connection_string
```

```powershell
cd .\backend
npm install
npm start
```

Open the served `index.html` in a browser and sign in with an authorized database account. The frontend defaults to `http://localhost:3000` for the API. To use another API address, set `window.SIGNMEUP_API_BASE_URL` before `src/api.js` is loaded. Legacy database roles such as `Administrator` and `Professor` are normalized to the application’s `admin` and `faculty` roles. API sessions use bearer tokens and expire after eight hours or when the server restarts.

The app loads data using authenticated GET requests and persists supported changes through the write endpoints below. Login (`POST /api/authorizedusers/login`) and the health checks (`GET /health`, `GET /health/database`) do not require authentication. `GET /api/authorizedusers` is admin-only. Other API operations require a bearer token; writes also enforce role and record-level checks.

- Students: `/api/students` (`/students` remains as an alias), `/api/student-notes`, `/api/transcripts`, `/api/transfer-courses`
- Registration: `/api/departments`, `/api/courses`, `/api/prerequisites`, `/api/classes`, `/api/enrollments`
- Majors: `/api/majors`, `/api/major-courses`, `/api/major-advisors`, `/api/approved-outlines`, `/api/outline-entries`, `/api/outline-history`
- Faculty: `/api/faculty`, `/api/faculty-teaching-departments`, `/api/qualified-faculty`
- Grades: `/api/grades`, `/api/course-comments`
- System: `/api/audit`, `/api/subsystems`, `/api/subsystem-access`

Supported writes:

- Admin-only `POST /api/courses` adds a catalog course; `POST /api/classes` adds a scheduled offering for an existing course.
- Admin-only `POST /api/departments`, `/api/prerequisites`, `/api/majors`, `/api/major-courses`, `/api/major-advisors`, `/api/faculty`, `/api/faculty-teaching-departments`, `/api/qualified-faculty`, `/api/transcripts`, and `/api/transfer-courses` power the Academic Setup screen.
- `PUT /api/students/:studentId`; `POST /api/students/:studentId/notes`
- `POST /api/enrollments`; `DELETE /api/enrollments/:studentId/:classId`
- `POST /api/approved-outlines`; `PUT /api/approved-outlines/:outlineId/approve`
- `POST /api/outline-entries`; `PUT /api/outline-entries/:outlineId/:courseId`
- `PUT /api/grades/:classId/:studentId`; `PUT /api/course-comments/:classId`
- `POST /api/authorizedusers/create`; `PUT /api/authorizedusers/:accountNumber/password`; `DELETE /api/authorizedusers/:accountNumber`

New course IDs use the selected department code and a manually entered 3-digit number, separated by a space (for example, `CS 532`).

The database script in `database/cs532_databasescript.sql` creates the subsystem schemas and tables for a new PostgreSQL database.

See `docs/requirements/Implementation status.md` for the requirement-to-feature mapping and the remaining deployment boundaries.