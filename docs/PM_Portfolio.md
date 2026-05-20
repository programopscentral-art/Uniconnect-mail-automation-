# Product Manager Portfolio
**Karthikeya Alla** — Associate Product Manager Candidate

---

## About Me

I build tools that solve real operational problems for educational institutions. Over the past year, I have independently designed, developed, and shipped three internal products used by real teams and real students — from bulk email automation to hackathon tracking to exam mark entry automation. Each product was built by identifying a genuine pain point, designing around it, and shipping something that actually works.

---

## Product 1: UniConnect — Institutional Operations & Communication Platform

**Role:** Product Owner, Full-Stack Developer
**Organisation:** NxtWave / Partner Universities
**Status:** Live and actively used

---

### What Is It?

UniConnect is an internal enterprise platform built for NxtWave's Program Ops team and its partner universities. It centralises the most painful, manual, and fragmented processes in institutional operations — bulk student communication, academic assessment generation, event planning, budget management, team performance tracking, meeting intelligence, and daily operational reporting — into a single, multi-university platform.

The platform serves multiple roles: Program Managers, Centre of Success (COS), PMs, PMAs, University Operators, Faculty, Budget Proposers, and Admins — each seeing only what's relevant to them.

---

### The Problem Space

---

#### Problem 1: Bulk Exam Emails Were Unreliable and Untraceable

Program Ops teams sent exam-related notifications to hundreds of students manually — using personal Gmail, CC/BCC lists, and spreadsheets. The problems:

- No institutional branding, emails looked unprofessional
- No visibility into whether a student actually opened or acknowledged the email
- Sending 500+ emails from a single Gmail hit rate-limits and failed silently
- No way to retry only the students who failed; had to redo the entire batch

**What We Built:**

- **Reusable email templates** with dynamic variable substitution — `{{studentName}}`, `{{examDate}}`, `{{rollNumber}}` auto-fill from the student database. Every student gets a personalised email in a bulk send.
- **CSV-based recipient upload** — operators upload a student list; the system deduplicates, handles inconsistent column names, and maps fields automatically.
- **Gmail OAuth2 integration** — each university's Gmail is connected via Google's secure OAuth flow. Refresh tokens are AES-256 encrypted. No shared passwords.
- **BullMQ + Redis job queue** — emails are enqueued as individual background jobs. Failures retry automatically with exponential backoff. A 1,000-email campaign does not block the UI.
- **Campaign lifecycle states** — DRAFT → QUEUED → IN_PROGRESS → COMPLETED, with Stop, Resume, and Retry Failed controls at any point.
- **Email open tracking** — a transparent 1×1 pixel per email records the exact timestamp when a student opens it.
- **Acknowledgment links** — emails include a "click to acknowledge" button. Clicks are recorded per student, per campaign.

**Outcome:** Sending 500 emails dropped from 2–3 hours of manual work to under 5 minutes. Operators now see exactly who opened and who acknowledged — for the first time.

---

#### Problem 2: Exam Question Papers Took 3–4 Hours to Build

Academic teams were building question papers by hand in Word or PowerPoint — manually formatting headers, distributing marks, aligning to university branding requirements. Each university had different paper formats and there was no consistency or speed.

**What We Built:**

An **Assessment Paper Generation Engine** that turns a question bank into print-ready exam papers:

- **Structured question bank** — questions are organised by Subject → Unit → Topic → Bloom's Taxonomy Level (L1, L2, L3). Each question has: type (MCQ, Short, Long, Descriptive), marks (1–15), course outcome mapping, and an answer key.
- **University-specific templates** — pre-built paper layouts for each partner institution that match their exact format (logo, Part A/B/C structure, mark distribution, header fields).
- **4-set paper generation** — the system generates Sets A, B, C, D simultaneously. A tiered algorithm ensures:
  - No question repeats across any set (checked by question ID, text, and content hash)
  - Bloom's level and mark distribution match the template requirements exactly
  - If a pool runs dry, it falls back gracefully: relaxes course outcome → relaxes Bloom level → relaxes marks → picks any valid question as a last resort
- **Answer sheet export** — every generated paper has a corresponding answer key CSV (question ID, correct option, explanation) ready for evaluators.
- **Exam types supported** — MID1, MID2, SEMESTER, INTERNAL LAB, EXTERNAL LAB.
- **PDF export** — the rendered paper exports as a print-ready PDF using server-side canvas rendering.

**Outcome:** Exam paper generation went from 3–4 hours of manual formatting to 10–15 minutes. Four sets are generated simultaneously instead of one at a time.

---

#### Problem 3: No Centralised Student Database

Every university's student list lived in someone's personal spreadsheet. Sending an exam communication meant hunting down the latest student CSV, cleaning it, and hoping it matched the previous one.

**What We Built:**

- A **central student database per university** — imported via CSV in one click.
- Student records carry standard fields (name, email, roll number) plus a flexible metadata field for any university-specific data (fee amount, batch, branch, section, etc.).
- This metadata feeds directly into email template variables — a fee notice email pulls `{{feeAmount}}` live from the student record without any manual data entry.

---

#### Problem 4: Event Planning Had No Structure or Accountability

Teams planned academic events (exams, workshops, orientation days) informally — WhatsApp messages, personal notes, and verbal handoffs. There was no way to know who was responsible for what, or whether an event actually completed.

**What We Built:**

A **Schedule Events module** that gives every event a formal lifecycle:

- **Event types** — EXAM, EVENT, HOLIDAY — each with a title, description, start date, and end date.
- **Assignees** — events are assigned to specific team members. Each assignee gets notified automatically.
- **Checklists** — structured task lists within an event track what needs to happen before, during, and after.
- **SOP uploads** — Standard Operating Procedure documents are attached directly to the event so every assignee knows the process.
- **Post-event reports** — once an event concludes, assignees submit an outcome report (what happened, issues faced, outcomes achieved).
- **Event history** — a full archive of every event per university, with completion status, report, and audit trail.

**PM/COS Freeze Date Planning:** The day plan view cross-references upcoming events and task load to surface which days are busy and which are free — helping PMs and COS prioritise outreach and avoid overcommitting on heavy event days.

---

#### Problem 5: Budget Proposals for Events Had No Formal Workflow

When teams wanted to organise an event, budget requests were made informally — email threads, WhatsApp, verbal approvals. There was no record of what was estimated, what was approved, or what was actually spent.

**What We Built:**

A complete **Budget Proposal workflow** from creation to closure:

**Lifecycle:** DRAFT → SUBMITTED → UNDER REVIEW → APPROVED (or CHANGES REQUESTED) → EVENT COMPLETED → REPORT SUBMITTED → CLOSED

- **Proposal creation** — title, event type, proposed date, venue, expected attendance, priority (Low/Medium/High), and full description.
- **Line item budgeting** — itemised costs by category (Venue, Food, Speaker, Travel, Marketing, Miscellaneous) with quantity, unit cost, vendor name, and quotation links.
- **File attachments** — quotations, vendor documents, and supporting files attached directly to the proposal.
- **Review and comments** — reviewers add comments flagged as internal (admin-only) or public (visible to proposer). Change requests loop back to the proposer.
- **Post-event report** — once the event concludes, the proposer submits actual figures: attendance, actual spend, remaining budget, outcome summary, photos, and issues faced.
- **Audit log** — every status change, comment, and edit is logged with actor, timestamp, and previous/new value. Full traceability.
- **Budget reports** — a report view shows estimated vs. actual spend, utilisation rate, and event outcomes in one place.

**Outcome:** Finance and program leadership have a single, auditable record for every event budget — from request to post-event actuals.

---

#### Problem 6: Operational Data Was Living in a 30-Column Google Sheet

NxtWave's operations team tracked daily institutional metrics — sessions planned/completed, student attendance, at-risk students, coach calls, instructor activity — in a massive shared Google Sheet. Problems:

- Data entry took 30+ minutes per day per university
- Data was inconsistent or missing if someone forgot to update
- No alerts when things went wrong (low attendance, high cancellations)
- No weekly or monthly roll-ups — every report required manual aggregation

**What We Built:**

A full **Ops Dashboard and Automated Reporting System**:

**Auto-aggregation** — the system pulls data automatically from existing modules every day:
- Schedule Events → events planned, executed, cancelled per university
- Tasks → completion counts per university
- Communication Tasks → coach calls made per university
- Users/Faculty → headcount, on-leave count per university
- Assessment Papers → exams planned and completed

**Daily form (2 minutes)** — a short form captures only what can't be auto-computed:
- Sessions planned, completed, cancelled
- Students enrolled vs. attended
- At-risk students (total and informed count)
- Cancellation reason and remarks

**Smart Alerts (real-time, 9 AM–7 PM weekdays):**
- Attendance below 50% → immediate alert to admins
- More than 3 sessions cancelled → alert with reason
- At-risk students exist but fewer than 50% have been informed → alert flagging the follow-up gap
- Daily form not submitted by 4 PM → deadline reminder alert

**Automated Reports sent via email:**

- **Daily report (8 PM IST)** — KPI cards for sessions %, attendance %, at-risk count, and compliance ratio across all universities. University performance table with per-campus breakdown. Sent to all admins and Program Ops.
- **Form reminders (5 PM IST, weekdays)** — push notification to every ops team member who hasn't submitted their daily form. Admins notified about which universities are missing.
- **Weekly analytics report (Sunday 12 PM)** — full week aggregation, university rankings by efficiency, task pattern analysis (common vs. unique tasks), peer comparison (who completes tasks fastest), and trend analysis.
- **Monthly report (1st of month)** — month-over-month trends, budget utilisation summary, team performance rankings, and strategic observations.

**Outcome:** Daily manual data entry reduced from 30+ minutes to 2 minutes. Admins no longer need to pull data manually — reports arrive automatically every evening.

---

#### Problem 7: No Visibility Into Individual and Team Performance

Managers had no structured way to see how individual team members were performing — who was completing tasks, who was falling behind, and whether the right people were being assigned the right work.

**What We Built:**

A **Task and Individual Performance module**:

- **Task assignment** — any manager can create a task with a title, description, due date, and assignee. Assignees are notified immediately.
- **Multi-assignee support** — tasks can be assigned to multiple people simultaneously. Each person tracks their own completion independently.
- **Status tracking** — PENDING → COMPLETED → CANCELLED, with timestamp for when each transition happened.
- **Individual metrics** — per user: tasks assigned, tasks completed, completion rate %, on-time completion rate, overdue rate, and average completion time.
- **Day Plan view** — every team member sees their own tasks for today grouped by status (Pending, Completed, Overdue). Stats at the top show their daily completion score.
- **University-scoped visibility** — operators only see tasks within their university. Program Ops and Admins see across all universities.
- **Performance feeds into weekly analytics** — task completion speed and patterns are aggregated into the weekly report's peer comparison section, so leadership can see who is consistently ahead or behind.

---

#### Problem 8: Meeting Outcomes Were Never Captured

The team held Google Meet calls daily — coaching sessions, review calls, planning meetings. But nothing from these calls was recorded in a structured way. Action items lived in chat, decisions were forgotten, and there was no record of who attended.

**What We Built:**

A **Meeting Intelligence module**:

- **Google Calendar sync** — the system discovers all meetings with Google Meet links from connected calendars automatically.
- **Participant tracking** — who joined, when they joined, how long they stayed, and whether they spoke in the transcript.
- **Invitee response tracking** — accepted, declined, tentative, or no response for every invitee.
- **Transcript processing** — if a Google Doc transcript exists (from Meet's transcription feature), the system extracts the full text and processes it.
- **AI-generated meeting summary** — key points, decisions made, action items, and topics discussed are extracted automatically from the transcript.
- **Sentiment analysis** — overall meeting sentiment (Positive, Neutral, Negative) flagged from the conversation.
- **Attendance and recording storage** — attendance CSV and recording links from Google Drive are linked to the meeting record.

**Outcome:** Every meeting now has a structured record — who attended, what was decided, what the action items are — without anyone having to manually write notes.

---

#### Problem 9: Operational Data Sat in Disconnected Google Sheets

Beyond the daily ops form, teams maintained multiple Google Sheets for different purposes — student data, event tracking, budget tracking, communication logs. Getting data from those sheets into UniConnect required manual copy-paste.

**What We Built:**

A **Smart Sheets module**:

- **Google Sheets connection** — users authenticate with Google and link any Google Sheet by URL. Multiple sheets can be connected per university.
- **Tab-level sync** — individual sheet tabs can be synced separately. Headers and rows are cached in the database.
- **Auto column recognition** — the system scans headers and recognises known data patterns (student emails, names, attendance columns, etc.) and suggests import mappings automatically.
- **Direct import** — synced sheet data can be imported directly into UniConnect as students, events, tasks, ops daily data, or budget records.
- **Sharing visibility** — the system shows who the Google Sheet is currently shared with, so access management is transparent.

---

#### Problem 10: No Role-Based Access Across a Multi-University Operation

Different team members manage different universities. An operator at one campus should never see another campus's students, campaigns, or data. But admins need to see everything.

**What We Built:**

- Full **RBAC with granular roles**: Admin, Program Ops, COS, PM, PMA, CMA, University Operator, BOA, Faculty, Proposer, Reviewer, and more.
- A **user-university mapping** table assigns users to one or more universities. All data queries are scoped accordingly.
- **Invitation system** — admins invite users by email with a specific role. The invite link is time-limited and role-specific. No self-registration.
- **Access request workflow** — users can request access with a stated reason; admins approve or reject.

---

### Platform Summary

| Problem | Solution | Outcome |
|---------|----------|---------|
| Bulk exam emails were manual and untracked | Campaign system with job queue, open tracking, acknowledgment links | 500 emails in 5 min, full delivery visibility |
| Exam paper creation took 3–4 hours | Assessment engine with question bank, 4-set generation, PDF export | 10–15 min per paper, consistent formatting |
| Student data in scattered spreadsheets | Central student DB with CSV import and metadata variables | One source of truth across universities |
| Event planning was informal, no accountability | Schedule Events with assignees, checklists, SOPs, reports | Every event has an owner, a plan, and a record |
| Budget requests had no workflow | Full proposal lifecycle: submit → review → approve → report | Auditable record from estimate to actual spend |
| Daily ops data in a 30-column spreadsheet | Auto-aggregation + short daily form + automated reports | 30 min manual entry → 2 min, daily reports auto-sent |
| No visibility into individual performance | Task assignment + day plan + weekly peer comparison | Managers see who's on track, who's not |
| Meeting outcomes were lost | Meeting intelligence with calendar sync, transcripts, AI summaries | Every meeting has structured outcomes + action items |
| Disconnected Google Sheets | Smart Sheets: sync, recognise, and import into UniConnect | Data flows in from existing sheets without copy-paste |
| No access control across universities | RBAC, user-university mapping, invitations | Every user sees exactly what they should |

---

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | SvelteKit (Svelte 5), Tailwind CSS |
| Backend | SvelteKit server routes (TypeScript) |
| Database | PostgreSQL |
| Background Jobs | BullMQ + Redis |
| Email Sending | Gmail API (OAuth2) |
| Authentication | Firebase Auth + Google OAuth |
| Deployment | Railway (CI/CD, auto-deploy) |
| Reporting AI | Gemini 2.0/2.5 Flash (report generation) |
| Notifications | Firebase Cloud Messaging (push) |

---

---

## Product 2: Makers Conclave Status Tracker

**Role:** Product Owner, Full-Stack Developer
**Organisation:** NIAT (NxtWave Institute of Advanced Technologies)
**Status:** Live — embedded on niatindia.com/makers-conclave

---

### What Is It?

A self-service status portal for NIAT students participating in the Makers Conclave — a multi-phase hackathon (Written Exam → Project Proposal → Final Build). Students enter their NIAT ID and instantly see their scores, qualification status, and reviewer feedback for each phase.

---

### The Problem

During the Makers Conclave, the coordination team was flooded with messages asking "Did I qualify Phase 1?", "What was my Phase 2 score?", "Why wasn't I selected?" There was no self-service way for students to check. The team was manually responding to individual queries from hundreds of participants — unsustainable.

---

### The Solution

- **Reads directly from Google Sheets** — the coordination team updates scores in their existing spreadsheet; the portal reflects changes automatically within 1 hour. No separate database needed.
- **Consolidates two data sources** — Phase 1 (Written Test scores) and Phase 2 (Project Proposal scores from a separate tab) are merged into a single student view.
- **Detailed Phase 2 breakdown** — 5 scoring categories (Innovation, Feasibility, Impact, Clarity, HW/Tech Spec) shown with progress bars, plus reviewer feedback text.
- **Visual phase progression** — students see Phase 1 → Phase 2 → Phase 3 as a timeline. Locked phases show what they need to unlock the next phase.
- **Embedded via iframe** — CORS-enabled, embedded on the NIAT website with no login required. Students just need their NIAT ID.
- **Resilient fallback** — if Google Sheets is unreachable, last cached data is served. Zero downtime for students.

---

### Key Design Decisions

| Decision | Why |
|----------|-----|
| Google Sheets as data source | Coordinators already work in Sheets. No new tool adoption required. |
| 1-hour cache TTL | Reduces Google API calls, fast response for students, still reflects updates promptly. |
| No login required | Students just need their NIAT ID. Zero friction. |
| iFrame embed | Goes live on the existing NIAT website without rebuilding it. |

---

### Outcome

Students self-checked their status 24/7. The coordination team stopped receiving individual status queries. Non-technical coordinators updated scores in Google Sheets and the portal reflected it — no code changes required.

---

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Express.js (Node.js) |
| Data Source | Google Sheets API v4 (service account) |
| Frontend | Plain HTML, CSS, Vanilla JS |
| Deployment | Railway / Render / Vercel (any Node.js host) |

---

---

## Product 3: CDU Onex Dashboard — Automated Marks Entry Tool

**Role:** Product Owner, Full-Stack Developer
**Organisation:** Chaitanya Deemed University (CDU)
**Status:** Packaged and delivered to faculty users

---

### What Is It?

A desktop-friendly web application that automates the entry of internal exam marks into Chaitanya University's Onex portal. Faculty upload a CSV of student marks, configure the exam details, and the tool handles the rest automatically.

---

### The Problem

Faculty at CDU manually entered internal exam marks for every student into the Onex portal after each assessment cycle. For a batch of 60 students this meant:

- Login to the portal
- Select program, course, semester, mark type, and subject from nested dropdowns
- Find each student one by one
- Type 2–3 mark values per student
- Confirm a popup after each entry

This took **2–3 hours per subject per faculty member**, every exam cycle. It was repetitive, error-prone, and universally despised.

---

### The Solution

A browser automation tool that:

- **Accepts a CSV of student marks** — faculty export marks from Excel and upload. The parser handles merged cells and varied column headers from different Excel export formats.
- **Configures context once** — faculty set program, course, semester, mark type, and subject in the UI. Applied to every student automatically.
- **Automates the portal interaction** — opens a headless browser, logs into Onex, navigates to the mark entry form, and fills each student's marks automatically.
- **Handles portal quirks reliably:**
  - Onex uses non-standard Select2 dropdowns → `forceSelect()` normalises text and falls back intelligently if exact match fails
  - Mark input fields lose values if typed too fast → keys are pressed with 40ms delays using Tab navigation
  - SweetAlert2 confirmation popups → `handlePopups()` continuously scans and auto-confirms
- **Real-time log stream** — faculty see a live log of every action (which student is being processed, success/failure) via Server-Sent Events.
- **Progress bar** — visual tracker showing completed vs. pending students.
- **Resume capability** — if interrupted, re-running skips already-synced students (tracked in CSV).
- **Export** — updated CSV with sync status per student for records.

---

### Outcome

What took 2–3 hours of manual data entry per subject became a **10–15 minute automated process**. Error rate dropped to near-zero.

---

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js, React, TypeScript, Tailwind CSS |
| Browser Automation | Playwright (Chromium) |
| Backend | Next.js API Routes + Server-Sent Events |
| CSV Parsing | Custom RFC 4180 parser (handles Excel merged cells) |
| Deployment | One-click START_MAC.command and START_WINDOWS.bat |

---

---

## Summary: What I've Built and Why It Matters

| Product | Core Problem | Solution | Impact |
|---------|-------------|----------|--------|
| UniConnect | Bulk exam emails were manual, untracked, unreliable | Job-queued email system with Gmail OAuth, open + ack tracking | 500 emails in 5 min, full visibility |
| UniConnect | Exam papers took 3–4 hours to create | Question bank + 4-set generator + PDF export | 10–15 min per paper |
| UniConnect | Event planning was informal | Schedule Events with checklists, SOPs, assignees, reports | Every event has a structured record |
| UniConnect | Budget requests had no workflow | Full proposal lifecycle with line items, review, post-event report | Auditable from estimate to actuals |
| UniConnect | Daily ops data in a 30-column spreadsheet | Auto-aggregation + short form + automated daily/weekly/monthly reports | 30 min → 2 min daily, reports arrive automatically |
| UniConnect | No individual performance visibility | Task assignment, day plan, peer comparison in weekly reports | Managers see who's on track |
| UniConnect | Meeting outcomes were lost | Calendar sync, transcript processing, AI summary, attendance tracking | Every meeting has structured outcomes |
| UniConnect | Disconnected Google Sheets | Smart Sheets: sync, recognise columns, import directly | Data flows in from existing sheets |
| UniConnect | No access control across universities | RBAC, user-university mapping, invitations | Every user sees only what's theirs |
| Makers Conclave | Students flooded coordinators with status queries | Google Sheets-backed self-serve portal with phase-wise scoring | Eliminated manual query handling |
| CDU Dashboard | Faculty spent 2–3 hrs entering marks into portal | Playwright automation with smart portal handling | 10–15 min per subject, near-zero errors |

---

## What Makes Me Different

- I don't just identify problems — I build the tools to solve them.
- I think in systems: queues, fallbacks, state machines, role hierarchies, automated reports.
- I optimise for the actual user: coordinators who aren't technical, faculty who just want to go home, students who need answers at 11 PM.
- I ship. These are not prototypes — they are live, actively used tools.

---

*Portfolio prepared for Associate Product Manager application — April 2026*
