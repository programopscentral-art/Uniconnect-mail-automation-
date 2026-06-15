# Product Requirements Document
## UniConnect Operations OS — Comprehensive Specification

---

### Document Control

| Field | Value |
|---|---|
| **Document title** | UniConnect Operations OS — Comprehensive PRD |
| **Version** | 3.0 (Exhaustive) |
| **Status** | Reflects production state as of release date |
| **Document owner** | Program Ops Central, NIAT |
| **Last updated** | 2026-06-15 |
| **Production URL** | https://uniconnect-app.up.railway.app |
| **Repository** | uniconnect-mail-automation (monorepo) |
| **Latest deploy** | V85 (commit `b1f8d9dc`) |
| **Document length** | Designed as the single source of truth: covers every module, page, API, worker, env var, integration, and known issue |

### Revision History

| Version | Date | Summary |
|---|---|---|
| 1.0 | 2026-03-17 | Initial mail-automation-only draft |
| 2.0 | 2026-06-15 | Formal PRD structure with FR/NFR numbering |
| 3.0 | 2026-06-15 | Exhaustive — adds full API catalogue (262 endpoints), all 94 page routes, 11 worker loops, 23 env vars, 16 external integrations, per-module deep dives, current/WIP/dormant flags on every feature |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Background & Context](#2-background--context)
3. [Problem Statement](#3-problem-statement)
4. [Goals & Non-Goals](#4-goals--non-goals)
5. [Success Metrics](#5-success-metrics)
6. [User Personas](#6-user-personas)
7. [User Journeys](#7-user-journeys)
8. [Functional Requirements](#8-functional-requirements)
9. [Non-Functional Requirements](#9-non-functional-requirements)
10. [Information Architecture & Page Routes](#10-information-architecture--page-routes)
11. [Complete API Endpoint Catalogue](#11-complete-api-endpoint-catalogue)
12. [Data Model](#12-data-model)
13. [Background Workers & Scheduled Jobs](#13-background-workers--scheduled-jobs)
14. [Environment Variables](#14-environment-variables)
15. [External Integrations](#15-external-integrations)
16. [Module Deep Dives](#16-module-deep-dives)
17. [Out of Scope & Dormant Features](#17-out-of-scope--dormant-features)
18. [On Hold / Deferred](#18-on-hold--deferred)
19. [Currently Upcoming / WIP](#19-currently-upcoming--wip)
20. [Risks & Mitigations](#20-risks--mitigations)
21. [Known Issues & Workarounds](#21-known-issues--workarounds)
22. [Open Questions](#22-open-questions)
23. [Release History](#23-release-history)
24. [Glossary](#24-glossary)
25. [Appendix: File-System Layout](#25-appendix-file-system-layout)

---

## 1. Executive Summary

UniConnect Operations OS is the daily-run-rate platform for NIAT's multi-campus higher-ed program. It consolidates fee-collection tracking, daily-report submission workflows, communication campaigns, exam paper management, faculty attendance, success-coach call tracking, budget approvals, meeting intelligence, and ops automation into a single role-scoped web application backed by Postgres.

### Production Scale (verified live, 2026-06-15)

| Dimension | Value |
|---|---|
| **Users** | 589 user records (438 students + 151 staff/operators) |
| **Universities** | 18 active partner campuses |
| **Roles in use** | 10 (ADMIN, PROGRAM_OPS, COS, PM, PMA, BOA, CMA, CMA_MANAGER, FACULTY, UNIVERSITY_OPERATOR, STUDENT) |
| **Page routes** | 94 (across 5 layout groups + 5 sub-layouts) |
| **API endpoints** | 262 (`+server.ts` files) |
| **Background workers** | 11 active scheduled loops + 3 BullMQ queues |
| **Fee student-payment rows** | 17,935 |
| **Notifications dispatched (lifetime)** | 18,541 |
| **Email campaigns sent** | 698 campaigns / 55,809 recipient sends |
| **Email templates** | 660 |
| **Tasks created** | 10,761 |
| **Question bank** | 80,354 questions |
| **Instructor attendance records** | 5,424 |
| **Ops OS submissions** | 200 submissions / 4,389 metric values / 9,197 event-log rows |
| **Reminder dispatches** | 4,130 |
| **Daily Ops sessions** | (in `users`) avg 50–100 active per day |
| **DB migrations** | 108 |

---

## 2. Background & Context

NIAT runs fee-collection, daily-operations, and academic-services programs across **18 partner universities** organised into operational clusters. Each cluster is led by a COS (Cluster Operations Supervisor); each campus has a BOA (Branch Ops Associate) who submits daily metrics and a PM (Program Manager) who reviews and signs off.

Before UniConnect:
- BOAs submitted daily metrics into shared Google Sheets — no audit trail, no enforcement.
- PMs reviewed via long email threads — no SLAs, no visibility into who's pending.
- Fee collection was tracked in disconnected Excel files — different operators saw different numbers.
- Exam papers were assembled manually from Word templates.
- Bulk emails were sent through personal Gmail with no open/ack tracking.
- Incidents (PoSH, parent escalation, safety) were verbally relayed — leadership often heard hours late.

UniConnect replaces all of this with one auditable, role-scoped, real-time application backed by event-sourced Postgres. It runs on Railway (one SvelteKit app + one worker service) backed by Supabase Postgres + Redis.

---

## 3. Problem Statement

Program Operations leadership lacks reliable, low-latency visibility into:

1. **Fee collection status** — which batch is behind, which student needs follow-up, which campus has stalled.
2. **Daily operational health per campus** — attendance, sessions, infrastructure status, parent escalations, incidents.
3. **Communication delivery** — whether mass emails landed, were opened, were acknowledged.
4. **Faculty workload and attendance** — who taught, who was absent, who is over/under target.
5. **Success-coach activity** — calls made vs. target, per coach per day.
6. **Cross-campus pattern detection** — repeated issues across 3+ campuses in the same week.
7. **Budget request status** — proposals stuck in review, post-event reports overdue.
8. **Meeting follow-through** — action items from meetings tracked and closed.

Each of these was tracked manually before UniConnect. The unifying theme: **trusted, scoped, time-stamped, dedup'd visibility**.

---

## 4. Goals & Non-Goals

### 4.1 Goals (G-1 through G-12)

| ID | Goal |
|---|---|
| **G-1** | Provide every operational role with a dashboard scoped to only what they own. |
| **G-2** | Track daily fee collection across all 18 universities with twice-daily automated email snapshots. |
| **G-3** | Enforce structured submission → review → sign-off workflow for daily campus operations reports. |
| **G-4** | Track delivery of every operational communication (in-app + email) with per-recipient audit. |
| **G-5** | Manage exam question banks, paper templates, and timetables. |
| **G-6** | Track faculty attendance, daily teaching reports, and instructor workload. |
| **G-7** | Track success-coach call activity against per-coach daily targets. |
| **G-8** | Manage event budget proposals through a multi-stage approval workflow with post-event reports. |
| **G-9** | Surface critical incidents (PoSH, anti-ragging, parent escalation, safety) to leadership within 60 s. |
| **G-10** | Auto-aggregate daily/weekly ops data into AI-summarised reports emailed to admins. |
| **G-11** | Integrate Google Workspace (Sheets, Gmail, Calendar, Drive) for source-of-truth sync and meeting intelligence. |
| **G-12** | Provide FCM-based browser push notifications for time-critical events. |

### 4.2 Non-Goals (NG-1 through NG-7)

| ID | Non-Goal |
|---|---|
| **NG-1** | UniConnect is NOT a student-facing portal. Students are tracked as records; they do not log in. |
| **NG-2** | UniConnect is NOT a financial accounting system. Payments are tracked for visibility; settlement/GST happens externally. |
| **NG-3** | UniConnect is NOT a Learning Management System (LMS). Content delivery & grading happen in partner LMS. |
| **NG-4** | UniConnect is NOT a CRM. Zoho is the upstream source for student identity (`zoho_user_id`). |
| **NG-5** | UniConnect does NOT issue invoices, receipts, or tax documents. |
| **NG-6** | UniConnect does NOT process payments. Payment links live in Zoho. |
| **NG-7** | UniConnect does NOT replace Slack/WhatsApp for operator chat. |

---

## 5. Success Metrics

| Metric | Definition | Target |
|---|---|---|
| **Daily report submission rate** | % of campus-day combos with `submission.status ≥ SUBMITTED` by 16:00 IST | ≥ 95 % |
| **PM sign-off completion rate** | % submitted reports SIGNED_OFF by 18:30 IST same day | ≥ 90 % |
| **Snapshot delivery rate** | % scheduled recipients with `delivery_status = SENT` per fire | ≥ 98 % |
| **Fee data freshness** | Max time between Sheet edit and dashboard reflection | ≤ 10 min |
| **Incident escalation latency** | BOA flag → ADMIN/COS notification | ≤ 60 s |
| **Auto-purge safety incidents** | Times the 50% safety threshold blocked destructive deletion | ≥ 0 (working as intended) |
| **System availability** | App + worker uptime per Railway health checks | ≥ 99.5 % |
| **FCM push delivery rate** | % of FCM tokens that successfully received last 7d notifications | ≥ 95 % |
| **AI summary generation success** | % of daily/weekly Gemini-driven reports produced without fallback to "unavailable" | ≥ 90 % |

---

## 6. User Personas

### 6.1 Program Operations Lead (ADMIN, PROGRAM_OPS)
- **Count**: 3 ADMIN.
- **Daily**: Logs in 1–3 times. Receives fee snapshot 10:00 + 19:30 IST. Reviews PM Inbox & incidents.
- **Scope**: Full org-wide. Bypasses feature gates.
- **Surfaces**: Dashboard, Fee Collection, Ops Dashboard, PM Inbox, Operations Overview, Analytics.

### 6.2 Cluster Operations Supervisor (COS)
- **Count**: 10.
- **Daily**: Monitors all campuses in cluster. Receives incident escalations. Tracks success-coach performance.
- **Scope**: Cluster via `ops_os.cluster_dim.cos_user_id` → campuses.
- **Surfaces**: PM Inbox, Operations Overview, Review Queue, Fee Collection.

### 6.3 Program Manager (PM)
- **Count**: 9.
- **Daily**: Reviews BOA submissions, signs off / sends back by 18:30 IST.
- **Scope**: Campuses assigned in `ops_os.user_campus_assignment` (role='PM').
- **Surfaces**: PM Inbox, Review Queue, Fee Collection.

### 6.4 Program Manager Associate (PMA)
- **Count**: 27.
- **Daily**: Submits + reviews daily reports on delegated campuses.
- **Scope**: Assigned campuses.
- **Surfaces**: Daily Report, PM Inbox, Review Queue, Fee Collection.

### 6.5 Branch Operations Associate (BOA)
- **Count**: 43.
- **Daily**: Submits daily report by 16:00 IST. Receives 15:30 reminder.
- **Scope**: Single campus or `university_id = 'ALL'` (central BOAs).
- **Surfaces**: Daily Report submission, Fee Collection (own campus).

### 6.6 CMA & CMA_MANAGER
- **Count**: 6 CMA + 1 CMA_MANAGER.
- **Daily**: Budget proposals + assessments.
- **Scope**: Org-wide for budgets; **hard-excluded** from fee snapshot mail.
- **Surfaces**: Budget Proposals, Assessments.

### 6.7 Faculty
- **Count**: 8.
- **Daily**: Teaching report; marks entry; timetable view.
- **Scope**: Path-allowlisted to `/faculty-portal/*`, `/assessments`, `/tasks`, `/students`. Cannot access ops/admin.
- **Surfaces**: Faculty Portal (5 screens).

### 6.8 University Operator
- **Count**: 13.
- **Daily**: Per-uni operator; manages templates, sends campaigns.
- **Scope**: Per-uni. **Hard-excluded** from fee snapshot mail.
- **Surfaces**: Campaigns, Templates, Mail Audit Log.

### 6.9 Support Roles
- **SET_REVIEWER, PROPOSER, STAKEHOLDER, SUPPORT**: small counts, restricted to budget proposal workflow only.

---

## 7. User Journeys

### Journey 7.1 — BOA submits daily report
1. BOA logs in ~15:00 IST. Session validated.
2. Opens `/ops-os/report`. App finds-or-creates DRAFT `ops_os.submission`.
3. Fills metrics across sections; values auto-saved to `submission_value` as DRAFT.
4. Clicks **Submit** → status → SUBMITTED; `notifyPmsOnSubmission()` fires (in-app + email to assigned PMs). Source ID `OPSOS_SUBMIT_{sub_id}_{revision}`.
5. At 15:30 IST if not submitted → reminder `boa_submit_due_soon` (in-app + email).
6. PM reviews at `/ops-os/review/{sub_id}` → status → PM_REVIEW.
7. PM **signs off** → status → SIGNED_OFF; immutable trigger activates; BOA gets success email.
   - OR PM **sends back** → status → SENT_BACK; sent_back_count++; BOA gets warn email with reason.
8. If not signed off by 18:30 IST → worker fires `notifyOnAutoSignOff()` → BOA (info), PMs (warn), COS+ADMIN (alert).

### Journey 7.2 — Fee collection morning snapshot
1. Worker at 10:00 IST detects morning window.
2. POSTs `/api/fees2/windows/{id}/send-snapshot?kind=morning` with `x-internal-sync-token`.
3. App calls `fireSnapshot()` → `resolveSnapshotRecipients()` returns 72 emails.
4. Per recipient: scope-aware `buildSnapshot()`, render HTML, INSERT notification (QUEUED), call `sendEmail()`, UPDATE to SENT or FAILED.
5. Worker logs `{ sent, deduped, errors, elapsed_ms }`.
6. Recipient opens email → NIAT logo (base64) renders; per-recipient scope label + per-batch table visible.
7. CTA: **Download XLSX** → 5-tab workbook scoped to recipient's universities.
   - OR **Open in UniConnect** → `/fee-collection-v2?window={id}`.

### Journey 7.3 — Email campaign with open + ack tracking
1. University Operator creates campaign at `/campaigns/new`. Inserts `campaigns` row (DRAFT).
2. Uploads recipients → `campaign_recipients` rows, each with `tracking_token` (32-char hex).
3. Clicks **Send** → status IN_PROGRESS; worker dequeues recipients.
4. Per recipient: Gmail API send via OAuth refresh token; row → SENT.
5. Recipient opens email → 1×1 pixel hits `GET /api/track/open/{token}` (public). Status → OPENED, `open_count++`.
6. Recipient clicks ack button → `POST /api/track/ack/{token}` (public). Status → ACKNOWLEDGED.
7. Operator views campaign progress aggregated in `/campaigns/{id}`.

### Journey 7.4 — Daily Ops AI Report (auto)
1. Worker at 20:00 IST triggers `ops_automation.runDailyOpsReport()`.
2. Aggregates daily metrics across all 18 universities.
3. Calls Gemini API (`gemini-2.5-flash` → fallback `gemini-2.0-flash`) for AI summary.
4. Builds HTML email with stats + AI summary.
5. Queues email job to BullMQ `system-notifications` queue; nodemailer dispatches.
6. Inserts in-app notifications for admin users with dedup `source_id`.
7. Sends FCM push to admin user devices.

### Journey 7.5 — Budget proposal lifecycle
1. CMA creates proposal at `/budget-proposals/create` → status DRAFT.
2. Submits → SUBMITTED; reviewer assigned.
3. Reviewer reads at `/budget-proposals/{id}` → can comment (INTERNAL/PUBLIC) → status UNDER_REVIEW.
4. Reviewer approves → APPROVED; budget locked. Optional Facilities OS webhook fires.
5. Event happens. Proposer fills post-event report at `/budget-proposals/{id}/report`.
6. Report submitted → REPORT_SUBMITTED → reviewer closes → CLOSED.

### Journey 7.6 — Meeting Intelligence (auto)
1. User connects Google Calendar via OAuth at `/meetings`.
2. Worker scans calendar events with Meet links + Drive for transcript docs.
3. Discovered meetings stored in `org_meetings` (status DISCOVERED).
4. BullMQ `meeting-processing` queue picks up the meeting.
5. Worker extracts transcript, calls Gemini to summarise → action items, key decisions, topics, sentiment.
6. Status → COMPLETED; user sees `/meetings/{id}` with the AI breakdown.

### Journey 7.7 — Communication Task multi-channel
1. Operator creates task at `/communication-tasks/new` with channel (WhatsApp/App/Email) + scheduled_at.
2. Reminders queued: creation, day-start, 10-min reminder, 10-min overdue, 30-min overdue.
3. Worker checks every 30 s for due notifications, sends FCM push.
4. Operator marks task **Notified** when they sent the message externally → status NOTIFIED.
5. Eventually **Completed**.

---

## 8. Functional Requirements

Requirements use `FR-{module}.{n}` numbering with priorities: **MUST** (shipped P0), **SHOULD** (P1 partial/planned), **COULD** (P2 deferred).

### 8.1 Authentication & Session

| ID | Pri | Requirement | Acceptance |
|---|---|---|---|
| FR-AUTH.1 | MUST | Email+password or OAuth sign-in. | `POST /api/auth/login` sets cookie `uniconnect_session`. |
| FR-AUTH.2 | MUST | Sessions expire after 7 days. | `sessions.expires_at` enforced. |
| FR-AUTH.3 | MUST | Tokens SHA-256 hashed before storage. | Column `token_hash`. |
| FR-AUTH.4 | MUST | Public routes bypass auth. | Hooks `isPublic` list (see §10.4). |
| FR-AUTH.5 | MUST | Worker→app via `x-internal-sync-token`. | Read via `$env/dynamic/private`. |
| FR-AUTH.6 | MUST | Logged-in users without `university_id` redirect to `/request-access` (except ADMIN, PROGRAM_OPS, BOA). | Hook redirect. |
| FR-AUTH.7 | MUST | Multi-tenant users switch via `active_university_id` cookie. | Cookie value must be in user's `universities[]`. |
| FR-AUTH.8 | MUST | Invite acceptance via tokenised `/accept-invite` URL. | Token validates against pending invite row. |
| FR-AUTH.9 | MUST | Google OAuth client ID/secret stored in env. | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. |

### 8.2 RBAC

| ID | Pri | Requirement | Acceptance |
|---|---|---|---|
| FR-RBAC.1 | MUST | ADMIN/PROGRAM_OPS: unconditional global access. | `FULL_ACCESS_ROLES`; `isPrivileged` bypasses feature checks. |
| FR-RBAC.2 | MUST | PM/PMA/BOA/CMA/CMA_MANAGER scope by `user_campus_assignment`. | `getUserUniversityScope()`. |
| FR-RBAC.3 | MUST | COS scope by `cluster_dim.cos_user_id`. | Cluster→campus join. |
| FR-RBAC.4 | MUST | Feature flags via `role_permissions.features` (jsonb). | Hooks featureMap. |
| FR-RBAC.5 | MUST | Bootstrap idempotently back-fills new features onto roles. | `ensureCorePermissions()`. |
| FR-RBAC.6 | MUST | CMA/CMA_MANAGER/STUDENT/FACULTY/UNIVERSITY_OPERATOR hard-excluded from fee snapshot mail. | `EXCLUDED_RECIPIENT_ROLES`. |
| FR-RBAC.7 | MUST | Section 7 (incident) metrics restricted to ADMIN/PROGRAM_OPS/HR via RLS. | Postgres RLS on `submission_value` for `section_7.*`. |
| FR-RBAC.8 | MUST | Faculty role: path-allowlisted to `/faculty-portal`, `/assessments`, `/tasks`, `/students`. | Hook allowlist. |

### 8.3 Fee Collection v2

| ID | Pri | Requirement | Acceptance |
|---|---|---|---|
| FR-FEE.1 | MUST | One active `fee_semester_window` per program. | Dashboard picks first active. |
| FR-FEE.2 | MUST | Sync from Google Sheets every 60 s when `auto_sync_enabled`. | Worker `startFeeV2AutoSyncLoop()`. |
| FR-FEE.3 | MUST | Status derived strictly from amounts (math-first). | `deriveStatus()`. |
| FR-FEE.4 | MUST | Sync purges DB rows missing from sheet — UNLESS sheet has <50 % of DB row count (safety threshold). | `summary.purge_skipped`. |
| FR-FEE.5 | MUST | Snapshot emails 10:00 IST + 19:30 IST daily + manual. | Worker `startFeeV2SnapshotLoop()`. |
| FR-FEE.6 | MUST | Snapshot recipients = PM/BOA assignments + COS + ADMIN/PROGRAM_OPS + fixed list (currently 72). | `resolveSnapshotRecipients()`. |
| FR-FEE.7 | MUST | Per-recipient scope-aware snapshot. | Cached by scope. |
| FR-FEE.8 | MUST | `delivery_status` transitions QUEUED → SENT/FAILED. | V85 honours `sendEmail()` return. |
| FR-FEE.9 | MUST | Snapshot dedup per `(window_id, kind, ist_date, recipient)`. | Source ID + UNIQUE index. |
| FR-FEE.10 | MUST | XLSX 5-tab workbook (Summary, Per-Batch, Per-University, Students, Dropouts) scoped to user. | `/api/fees2/windows/{id}/report.xlsx`. |
| FR-FEE.11 | MUST | Per-batch student list `LIMIT 20000`. | V83. |
| FR-FEE.12 | MUST | Logo embedded as base64 — no remote-fetch. | `niat_logo_b64.ts`. |
| FR-FEE.13 | SHOULD | Per-uni escrow tabs feed sync. | Deferred — §18.1. |
| FR-FEE.14 | SHOULD | UI exposes `purge_skipped` summary. | Deferred — §20.2. |
| FR-FEE.15 | MUST | Doc-request flow: send billing receipt request to student email, track via ack token. | `fee_doc_requests` (currently 0 rows — schema ready, flow not active). |

### 8.4 Ops OS Submission Spine

| ID | Pri | Requirement | Acceptance |
|---|---|---|---|
| FR-OPS.1 | MUST | One DAILY submission per `(campus_id, date)`. | UNIQUE constraint. |
| FR-OPS.2 | MUST | States: NEW → DRAFT → SUBMITTED → PM_REVIEW → SIGNED_OFF/SENT_BACK/LOCKED/RETRACTED. | App-side state machine. |
| FR-OPS.3 | MUST | SIGNED_OFF/LOCKED → values immutable. | Trigger `fn_prevent_modify_signed_off`. |
| FR-OPS.4 | MUST | Amendments via `supersedes` pointer. | New submission row. |
| FR-OPS.5 | MUST | BOA submit → PM notification (in-app + email). | `notifyPmsOnSubmission()`. |
| FR-OPS.6 | MUST | PM send-back → BOA notification (reason). | `notifyBoaOnSendBack()`. |
| FR-OPS.7 | MUST | PM sign-off → BOA notification (success). | `notifyBoaOnSignOff()`. |
| FR-OPS.8 | MUST | BOA retract → PM in-app notification. | `notifyPmsOnRetract()`. |
| FR-OPS.9 | MUST | Incident flag → COS + ADMIN alert. | `notifyOnIncidents()`. |
| FR-OPS.10 | MUST | Not signed off by 18:30 → auto-sign-off + 3-way notification. | `notifyOnAutoSignOff()`. |
| FR-OPS.11 | MUST | 15:30 BOA reminder. | `kind = 'boa_submit_due_soon'`. |
| FR-OPS.12 | MUST | 16:30 PM reminder. | `kind = 'pm_review_open'`. |
| FR-OPS.13 | MUST | 18:00 PM final reminder. | `kind = 'pm_review_final'`. |
| FR-OPS.14 | MUST | Reminders deduped via `reminder_dispatch`. | UNIQUE on `(kind, period_start, user_id, campus_id)`. |
| FR-OPS.15 | MUST | Daily lock loop: DAILY submissions past EOD lock at 18:30. | Every 10 min loop. |
| FR-OPS.16 | SHOULD | Cross-campus pattern detection: themes recurring 3+ campuses/week. | `pattern_detection_result` (schema ready, scheduler at no-op handler — Phase 0). |
| FR-OPS.17 | COULD | Auto-flag rule engine: threshold-based incident detection. | 0 rows in `auto_flag` — not activated. |

### 8.5 Tasks

| ID | Pri | Requirement | Acceptance |
|---|---|---|---|
| FR-TASK.1 | MUST | Priority (URGENT/HIGH/MEDIUM/LOW) + status (PENDING/IN_PROGRESS/COMPLETED/CANCELLED). | `tasks` schema. |
| FR-TASK.2 | MUST | Multi-assignee. | `task_assignees` junction. |
| FR-TASK.3 | MUST | Checklist items per task. | `task_checklist_items`. |
| FR-TASK.4 | MUST | View-history audit. | `task_view_logs`. |
| FR-TASK.5 | MUST | Dashboard polls every 60 s. | Client `setInterval`. |
| FR-TASK.6 | MUST | Estimated time per assignee. | `task_assignees.estimated_time`. |
| FR-TASK.7 | MUST | Optional link to `schedule_events` row. | `tasks.event_id`. |

### 8.6 Email Campaigns

| ID | Pri | Requirement | Acceptance |
|---|---|---|---|
| FR-CAMP.1 | MUST | Per-university Gmail OAuth mailboxes. | `mailbox_connections`, encrypted refresh tokens. |
| FR-CAMP.2 | MUST | University-scoped HTML templates. | `templates.university_id`. |
| FR-CAMP.3 | MUST | Lifecycle DRAFT → SCHEDULED → QUEUED → IN_PROGRESS → COMPLETED/FAILED/STOPPED. | `campaigns.status`. |
| FR-CAMP.4 | MUST | Per-recipient delivery: PENDING/QUEUED/SENT/FAILED/OPENED/ACKNOWLEDGED. | `campaign_recipients.status`. |
| FR-CAMP.5 | MUST | Open tracking via `GET /api/track/open/{token}` (public). | 1×1 pixel; updates open_count. |
| FR-CAMP.6 | MUST | Ack tracking via `POST /api/track/ack/{token}` (public). | Idempotent. |
| FR-CAMP.7 | MUST | Tokens are 32-char crypto-random hex. | `crypto.randomBytes(16)`. |
| FR-CAMP.8 | MUST | Mail audit log surfaces history. | `/mail-logs` reads `campaign_recipients`. |

### 8.7 Assessments

| ID | Pri | Requirement | Acceptance |
|---|---|---|---|
| FR-ASMT.1 | MUST | Question types NORMAL/MCQ/SHORT/LONG/FILL_IN_BLANK/PARAGRAPH. | `assessment_questions.type`. |
| FR-ASMT.2 | MUST | Hierarchy: batches→branches→subjects→units→topics; CO tags; bloom_level; difficulty. | Schema. |
| FR-ASMT.3 | MUST | Template layout schemas: regions, assets, background images. | `assessment_templates.layout_schema`. |
| FR-ASMT.4 | MUST | PDF parsing imports questions. | Endpoints under `/api/assessments/import`. |
| FR-ASMT.5 | MUST | University assets (logos, seals). | `university_assets`. |
| FR-ASMT.6 | SHOULD | Design Studio WYSIWYG editor. | `/design-studio-preview` — preview only, not in nav. |
| FR-ASMT.7 | SHOULD | Question paper generation: random selection by topic+difficulty+marks budget. | `/api/assessments/generate`. |

### 8.8 Faculty & Success Coach

| ID | Pri | Requirement | Acceptance |
|---|---|---|---|
| FR-FAC.1 | MUST | Faculty profiles: designation, dept, specialization, employment status. | `faculty_profiles`. |
| FR-FAC.2 | MUST | Daily attendance: present / absent_authorized / absent_unauthorized. | `instructor_attendance` UNIQUE on `(instructor_id, date)`. |
| FR-FAC.3 | MUST | Daily log: sessions, subjects, topics, workload notes. | `instructor_daily_log`. |
| FR-FAC.4 | MUST | Faculty Portal: 5 dedicated screens. | `/faculty-portal/*`. |
| FR-FAC.5 | MUST | Success coaches (COS role) with daily call target (default 15). | `success_coach_profiles`. |
| FR-FAC.6 | MUST | Daily call log: student calls + parent calls vs target. | `success_coach_daily_log`. |

### 8.9 Budget Proposals

| ID | Pri | Requirement | Acceptance |
|---|---|---|---|
| FR-BUD.1 | MUST | Status flow DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → EVENT_COMPLETED → REPORT_SUBMITTED → CLOSED. | `budget_proposals.status`. |
| FR-BUD.2 | MUST | Categorized line items (VENUE/FOOD/SPEAKER/TRAVEL/...). | `budget_items.category`. |
| FR-BUD.3 | MUST | Attachments stored base64. | `budget_proposal_attachments.file_content`. |
| FR-BUD.4 | MUST | Comments INTERNAL/PUBLIC visibility. | `budget_proposal_comments.visibility`. |
| FR-BUD.5 | MUST | Post-event reports: actual spend, attendance, outcomes, photos. | `budget_proposal_reports`. |
| FR-BUD.6 | MUST | Status transitions audited. | `budget_proposal_tracking`. |
| FR-BUD.7 | MUST | Roles: CMA/CMA_MANAGER/SET_REVIEWER/PROPOSER + ADMIN. | Feature `budget-proposals`. |
| FR-BUD.8 | SHOULD | On approval, sync to Facilities OS via webhook. | `FACILITIES_OS_WEBHOOK_URL`. |

### 8.10 Communication Tasks

| ID | Pri | Requirement | Acceptance |
|---|---|---|---|
| FR-COMM.1 | MUST | Multi-channel schedule: WhatsApp Students/Parents, Student/Parent App, Email. | `communication_tasks.channel`. |
| FR-COMM.2 | MUST | Status: Scheduled → Notified → Completed/Canceled. | |
| FR-COMM.3 | MUST | Reminder ladder: creation, day-start, 10-min, 10-min-overdue, 30-min-overdue. | Multiple `*_notified_at` cols + FCM push. |
| FR-COMM.4 | MUST | BullMQ-triggered immediate check on creation. | `comm-task-notifications` queue. |

### 8.11 Meeting Intelligence

| ID | Pri | Requirement | Acceptance |
|---|---|---|---|
| FR-MEET.1 | MUST | Per-user Google Calendar OAuth. | `meeting_connections`. |
| FR-MEET.2 | MUST | Discovery: Calendar API + Drive scan for transcripts. | `org_meetings.source`. |
| FR-MEET.3 | MUST | Transcript parse + Gemini AI: summary, action items, decisions, topics, sentiment. | `org_meetings.ai_*`. |
| FR-MEET.4 | MUST | Track invitees vs actual participants. | Two separate tables. |

### 8.12 Schedule Events

| ID | Pri | Requirement | Acceptance |
|---|---|---|---|
| FR-EVT.1 | MUST | Types: HOLIDAY/EXAM/EVENT/CURRICULAR/CO_CURRICULAR/CLUB_ACTIVITY/CULTURAL_ACTIVITY. | `schedule_events.type`. |
| FR-EVT.2 | MUST | Multi-assignee. | `event_assignees`. |
| FR-EVT.3 | MUST | Pre-event checklist + SOPs + pre-formatted messages. | 3 child tables. |
| FR-EVT.4 | MUST | Post-event reports. | `event_reports`. |
| FR-EVT.5 | MUST | Calendar freeze dates. | `calendar_freezes`. |

### 8.13 Academic Operations Hub

| ID | Pri | Requirement | Acceptance |
|---|---|---|---|
| FR-ACAD.1 | MUST | Programs + Academic Periods + Sections + Subjects + Classrooms + Student Profiles. | Schema. |
| FR-ACAD.2 | MUST | Examinations: plan, classrooms, invigilation, marks entry, seating. | 5 sub-routes. |
| FR-ACAD.3 | MUST | Faculty Ops: profiles, leave, teaching reports, workload, documents. | 5 sub-routes. |
| FR-ACAD.4 | MUST | Student Ops: master data, enrolment, batch/program/term filtering. | 2 sub-routes. |
| FR-ACAD.5 | MUST | Setup & Config: programs, subjects, sections, calendars. | `/setup`. |
| FR-ACAD.6 | MUST | Scheduling with APD: availability, weeks, conflicts, generate, publish. | 10 scheduling sub-routes. |
| FR-ACAD.7 | MUST | Audit logs. | `/audit-logs`. |
| FR-ACAD.8 | SHOULD | AI Copilot for academic workflows. | `/ai-copilot` — WIP. |
| FR-ACAD.9 | SHOULD | Portal Access management. | `/portal-access` — WIP. |
| FR-ACAD.10 | SHOULD | Reports & Compliance. | `/reports-compliance`. |

### 8.14 Notifications & Push

| ID | Pri | Requirement | Acceptance |
|---|---|---|---|
| FR-NOTIF.1 | MUST | Unified `notifications` table tracks in-app + email + push. | `channel` column. |
| FR-NOTIF.2 | MUST | Source-ID dedup via UNIQUE partial index. | `(user_id, source_id) WHERE NOT NULL`. |
| FR-NOTIF.3 | MUST | FCM push via Firebase Admin for time-critical events. | `FIREBASE_SERVICE_ACCOUNT` env. |
| FR-NOTIF.4 | MUST | Per-row lifecycle: queued_at → sent_at → read_at. | Three timestamp columns. |
| FR-NOTIF.5 | MUST | Failure reason persisted in `payload_json`. | Set when delivery_status='FAILED'. |

### 8.15 Reports & Analytics

| ID | Pri | Requirement | Acceptance |
|---|---|---|---|
| FR-RPT.1 | MUST | Daily ops AI report at 20:00 IST. | `ops_automation.runDailyOpsReport()`. |
| FR-RPT.2 | MUST | Weekly ops AI report Sunday 12:00 IST. | `runWeeklyAnalyticsReport()`. |
| FR-RPT.3 | MUST | System Analytics page accessible to ADMIN/PROGRAM_OPS. | `/analytics`. |
| FR-RPT.4 | MUST | Ops Dashboard with KPIs. | `/ops-dashboard` + `/ops-dashboard/v2`. |

---

## 9. Non-Functional Requirements

### 9.1 Performance
| ID | Requirement | Evidence |
|---|---|---|
| NFR-PERF.1 | Fee sync ≤ 15 s for 6k students. | Last sync elapsed_ms = 8,477 |
| NFR-PERF.2 | Dashboard initial paint < 2 s. | Server-side aggregation |
| NFR-PERF.3 | Snapshot fire ≤ 30 s for 72 emails. | Sequential dispatch |
| NFR-PERF.4 | Worker loop ticks every 60 s, no overlap. | Per-loop `running` flag |
| NFR-PERF.5 | DB connection pool: max 50 concurrent. | `pg` pool size |

### 9.2 Reliability
| ID | Requirement | Evidence |
|---|---|---|
| NFR-REL.1 | Workers tolerate transient SMTP/Sheets failures. | try/catch + JSON-structured logs |
| NFR-REL.2 | Notification email fire-and-forget; DB commit independent. | Submission transaction commits regardless |
| NFR-REL.3 | Auto-purge safety threshold (50 %) prevents destructive deletion. | V82 |
| NFR-REL.4 | Notifications no-dup on replay. | UNIQUE partial index |
| NFR-REL.5 | Reminder no-dup within trigger window. | `reminder_dispatch` UNIQUE |
| NFR-REL.6 | BullMQ retries on email queue failures (exponential backoff). | Default |

### 9.3 Security
| ID | Requirement | Evidence |
|---|---|---|
| NFR-SEC.1 | Session tokens SHA-256 hashed. | `sessions.token_hash` |
| NFR-SEC.2 | OAuth refresh tokens encrypted at rest. | `ENCRYPTION_KEY_BASE64` |
| NFR-SEC.3 | Section 7 metrics RLS + audit log. | `section_7_access_log` |
| NFR-SEC.4 | Worker→app shared-secret (`INTERNAL_SYNC_TOKEN`). | Via `$env/dynamic/private` |
| NFR-SEC.5 | Tracking endpoints token-gated. | 32-char hex tokens |
| NFR-SEC.6 | Facilities OS webhook validates `x-webhook-secret`. | `FACILITIES_WEBHOOK_SECRET` |

### 9.4 Auditability
| ID | Requirement | Evidence |
|---|---|---|
| NFR-AUD.1 | Every submission state change in `event_log`. | 9,197 events recorded |
| NFR-AUD.2 | Manual value edits in `edit_event` (original, new, delta, threshold breach). | `edit_triage_state` for status |
| NFR-AUD.3 | Section 7 reads logged. | `section_7_access_log` |
| NFR-AUD.4 | Notification dispatches recorded with delivery_status. | V85 |

### 9.5 Scalability
| ID | Requirement | Headroom |
|---|---|---|
| NFR-SCALE.1 | Supports ≥ 25 universities, ≥ 100 campuses. | Currently 18 unis / ~52 campuses |
| NFR-SCALE.2 | Per-batch student list ≤ 20,000 rows/call. | LIMIT 20000 (V83) |
| NFR-SCALE.3 | Postgres pool sized for ≥ 50 concurrent. | Pooler endpoint |

---

## 10. Information Architecture & Page Routes

### 10.1 Top-level navigation (admin/program-ops view)

```
CORE
├── Dashboard                    /dashboard
├── Task Center                  /tasks
└── Team Directory               /users

ACADEMIC OPS
├── Operations Hub               /academic-operations
├── Campus Registry              /universities
├── Student Master               /students
└── Examinations                 /assessments

DAILY OPERATIONS
├── Daily Report                 /ops-os/report
├── PM Inbox                     /ops-os/pm-inbox
├── PM Review Queue              /ops-os/review
├── Operations Overview          /ops-os/operations
└── Access Rights                /ops-os/access-rights

COMMUNICATION
├── Campaigns                    /campaigns
├── Central Mailbox              /mailboxes
├── Doc Templates                /templates
├── Scheduled Comms              /communication-tasks
├── Mail Audit Log               /mail-logs
├── Meeting Intel                /meetings
└── Smart Sheets                 /sheets

ADMINISTRATION
├── Ops Dashboard                /ops-dashboard
├── Faculty Attendance           /faculty-attendance
├── System Analytics             /analytics
├── Budgeting                    /budget-proposals
├── Fee Collection               /fee-collection-v2
└── Access Rights                /permissions
```

### 10.2 Faculty view

```
├── My Dashboard                 /faculty-portal/dashboard
├── Enter Marks                  /faculty-portal/marks
├── My Timetable                 /faculty-portal/timetable
├── Daily Report                 /faculty-portal/teaching-report
├── My Expertise                 /faculty-portal/my-expertise
└── Examinations                 /assessments
```

### 10.3 Complete page route catalogue (all 94 routes)

#### Root + Auth (5)
| Route | Purpose | Layout |
|---|---|---|
| `/` | Root entry | root |
| `/(auth)/login` | Login | (auth) |
| `/accept-invite` | Invitation acceptance | root |
| `/ack/[token]` | Tokenised ack | root |
| `/fee-ack/[token]` | Fee tokenised ack | root |
| `/debug-env` | Env debug (internal) | root |
| `/design-studio-preview` | Preview workspace (internal) | (app) |

#### Core (5)
| Route | Purpose |
|---|---|
| `/dashboard` | Unified hub: calendar, tasks, schedules |
| `/day-plan` | Personal task planner (no longer wired in nav) |
| `/profile` | User profile + audit log |
| `/request-access` | Request additional permissions |
| `/permissions` | Role & feature permission management |

#### User & Master Data (3)
| `/users` | Team directory |
| `/universities` | Campus registry |
| `/students` | Student master |

#### Academic Operations (27)
**Hub + admin:**
| `/academic-operations` | Hub landing |
| `/academic-operations/setup` | Setup wizard |
| `/academic-operations/audit-logs` | Audit logs |
| `/academic-operations/reports-compliance` | Compliance reports |
| `/academic-operations/portal-access` | Portal access mgmt (WIP) |
| `/academic-operations/ai-copilot` | AI assistant (WIP) |

**Scheduling sub-tree (10):**
| `/academic-operations/scheduling` | Overview |
| `/academic-operations/scheduling/apd` | APD planning |
| `/academic-operations/scheduling/upload` | Upload constraints |
| `/academic-operations/scheduling/generate` | Generate timetable |
| `/academic-operations/scheduling/availability` | Time slots |
| `/academic-operations/scheduling/weeks` | Academic week defs |
| `/academic-operations/scheduling/timetable` | Final timetable |
| `/academic-operations/scheduling/sessions` | Live session schedule |
| `/academic-operations/scheduling/conflicts` | Conflict resolution |
| `/academic-operations/scheduling/publish` | Publish timetable |

**Examinations sub-tree (5):**
| `/academic-operations/examinations` | Overview |
| `/academic-operations/examinations/marks` | Marks entry |
| `/academic-operations/examinations/classrooms` | Exam room assignment |
| `/academic-operations/examinations/invigilation` | Invigilation duties |
| `/academic-operations/examinations/seating` | Seating arrangement |

**Faculty Ops sub-tree (6):**
| `/academic-operations/faculty-ops` | Hub |
| `/academic-operations/faculty-ops/profiles` | Faculty profiles |
| `/academic-operations/faculty-ops/workload` | Workload mgmt |
| `/academic-operations/faculty-ops/teaching-reports` | Teaching performance |
| `/academic-operations/faculty-ops/documents` | Document mgmt |
| `/academic-operations/faculty-ops/leave` | Leave requests |

**Student Ops sub-tree (2):**
| `/academic-operations/student-ops` | Overview |
| `/academic-operations/student-ops/[id]` | Student detail |

#### Ops OS (9)
| `/ops-os/report` | BOA daily report |
| `/ops-os/report-weekly` | Weekly report |
| `/ops-os/report-monthly` | Monthly report |
| `/ops-os/operations` | Operations overview |
| `/ops-os/operations/[id]` | Operation detail |
| `/ops-os/review` | PM review queue |
| `/ops-os/review/[id]` | Review detail |
| `/ops-os/pm-inbox` | PM inbox |
| `/ops-os/access-rights` | Access management |

#### Communication (11)
| `/campaigns` | Campaign list |
| `/campaigns/new` | Create campaign |
| `/campaigns/[id]` | Campaign detail |
| `/templates` | Template library |
| `/templates/new` | Create template |
| `/templates/[id]` | Template editor |
| `/communication-tasks` | Scheduled comms |
| `/communication-tasks/new` | Create scheduled comm |
| `/communication-tasks/[id]` | Task detail |
| `/communication-tasks/[id]/edit` | Edit task |
| `/mailboxes` | Mailbox connections |
| `/mail-logs` | Mail audit log |

#### Meetings + Sheets (3)
| `/meetings` | Meeting intel list |
| `/meetings/[id]` | Meeting detail |
| `/sheets` | Smart sheets |

#### Assessments (6)
| `/assessments` | Overview |
| `/assessments/generate` | Generate new assessment |
| `/assessments/questions` | Question bank |
| `/assessments/templates` | Template library |
| `/assessments/templates/[id]` | Template editor |
| `/assessments/papers/[id]` | Paper detail |
| `/assessments/subjects/[id]` | Subject-wise |

#### Faculty Portal (5)
| `/faculty-portal/dashboard` | Faculty home |
| `/faculty-portal/marks` | Marks entry |
| `/faculty-portal/timetable` | Personal timetable |
| `/faculty-portal/teaching-report` | Teaching report |
| `/faculty-portal/my-expertise` | Expertise management |

#### Financial (8)
| `/fee-collection-v2` | Active fee collection module |
| `/fee-collection` | Legacy v1 (read-only) |
| `/fee-collection/analytics` | Legacy analytics |
| `/budget-proposals` | Proposal list |
| `/budget-proposals/create` | New proposal |
| `/budget-proposals/[id]` | Proposal detail |
| `/budget-proposals/[id]/edit` | Edit proposal |
| `/budget-proposals/[id]/report` | Post-event report |

#### Dashboards + Reports (5)
| `/ops-dashboard` | Operations dashboard |
| `/ops-dashboard/v2` | Operations dashboard v2 (WIP) |
| `/analytics` | System analytics |
| `/faculty-attendance` | Attendance tracking |
| `/reports/day-plan` | Day-plan report (legacy) |

### 10.4 Public + token-gated routes

| Route | Purpose | Auth |
|---|---|---|
| `/login` | Sign-in | none |
| `/accept-invite` | Tokenised invite | invite token |
| `/api/track/open/{token}` | Email open pixel | track token |
| `/api/track/ack/{token}` | Email click ack | track token |
| `/ack/{token}` | Ack landing | token |
| `/fee-ack/{token}` | Fee ack landing | fee ack token |
| `/api/health` | Health check | none |
| `/api/webhooks/facilities` | Facilities OS webhook | `FACILITIES_WEBHOOK_SECRET` |
| `/api/documents/serve` | Doc serve (pre-signed) | URL token |

---

## 11. Complete API Endpoint Catalogue

**Total: 262 endpoints** across the `apps/app/src/routes/api/` tree. Auth distribution: 83 public (31.7 %), 157 session-gated (59.9 %), 14 ops-os-gated (5.3 %), rest internal.

### 11.1 By area (high-level summary)

| Area | Count | Notes |
|---|---|---|
| `/api/academic/*` | ~80 | Largest area: admissions, faculty, students, exams, scheduling, marks |
| `/api/auth/*` | 12 | Login, logout, invite, session, OAuth callbacks |
| `/api/fees/*` + `/api/fees2/*` | 28 | Fee collection v1 (mostly public) + v2 (session-gated). |
| `/api/assessments/*` | 22 | Question bank, templates, papers, generation |
| `/api/ops/*` + `/api/ops-os/*` | 23 | Ops dashboards, daily reports, submissions, assignments |
| `/api/campaigns/*` | ~15 | Campaign CRUD + send + tracking |
| `/api/templates/*` | ~10 | Template CRUD |
| `/api/communication-tasks/*` | ~12 | Scheduled comm CRUD + reminders |
| `/api/mailboxes/*` | ~8 | Gmail OAuth + mailbox config |
| `/api/meetings/*` | ~10 | Meeting OAuth + processing |
| `/api/sheets/*` | ~6 | Google Sheets integration |
| `/api/track/*` | 4 | Public email tracking |
| `/api/notifications/*` | ~8 | Notification CRUD + push registration |
| `/api/users/*`, `/api/permissions/*` | ~15 | User management |
| `/api/budget-proposals/*` | ~12 | Proposal CRUD + workflow |
| `/api/tasks/*` | ~10 | Task CRUD + assignees + checklists |
| `/api/webhooks/*` | ~3 | External webhook receivers |
| `/api/health`, `/api/documents/serve` | misc | Infrastructure |

### 11.2 Key endpoint surfaces (representative sample, not exhaustive)

#### `/api/auth/*` (public)
- `POST /api/auth/login` — credentials → session cookie
- `POST /api/auth/logout` — invalidate session
- `GET /api/auth/session` — current user info
- `POST /api/auth/invite/accept` — accept invitation token
- `GET /api/auth/google/callback` — Google OAuth callback

#### `/api/fees2/*` (session-gated, V2)
- `GET /api/fees2/windows` — list active windows
- `POST /api/fees2/windows` — create window
- `GET /api/fees2/windows/[id]` — window details
- `PATCH /api/fees2/windows/[id]` — update window config
- `POST /api/fees2/windows/[id]/sync` — trigger sync (internal token or session)
- `POST /api/fees2/windows/[id]/send-snapshot?kind=morning|evening|manual` — fire snapshot
- `GET /api/fees2/windows/[id]/report.xlsx` — download Excel report
- `GET /api/fees2/windows/[id]/batches` — list batches in window
- `GET /api/fees2/batches/[id]/students` — list students in batch (LIMIT 20000)
- `GET /api/fees2/students/[id]/remarks` — list remarks
- `POST /api/fees2/students/[id]/remarks` — add remark
- `POST /api/fees2/students/[id]/tags` — toggle tag

#### `/api/fees/*` (mostly public, legacy v1)
- `GET /api/fees/doc-ack/[token]` — fee doc acknowledgement landing

#### `/api/ops-os/*` (custom `checkOpsOsAccess` gate)
- `POST /api/ops-os/submissions` — create draft submission
- `GET /api/ops-os/submissions/[id]` — read submission
- `PATCH /api/ops-os/submissions/[id]/values` — update metric values
- `POST /api/ops-os/submissions/[id]/submit` — DRAFT → SUBMITTED
- `POST /api/ops-os/submissions/[id]/sign-off` — PM_REVIEW → SIGNED_OFF
- `POST /api/ops-os/submissions/[id]/send-back` — PM_REVIEW → SENT_BACK
- `POST /api/ops-os/submissions/[id]/retract` — SUBMITTED → DRAFT
- `GET /api/ops-os/assignments/sync` — sync user-campus assignments
- `GET /api/ops-os/operations/daily` — daily operations dashboard data

#### `/api/track/*` (public)
- `GET /api/track/open/[token]` — open-pixel 1×1 GIF
- `POST /api/track/ack/[token]` — ack from button click

#### `/api/academic/*` (session, sub-tree)
- `GET /api/academic/students` — student list
- `GET /api/academic/students/[id]` — student detail
- `GET /api/academic/admissions` — admissions list
- `POST /api/academic/admissions` — create admission
- `GET /api/academic/faculty` — faculty list
- `GET /api/academic/faculty/[id]` — faculty detail
- `POST /api/academic/faculty/[id]/leave` — request leave
- `GET /api/academic/exams/timetable` — exam timetable
- `POST /api/academic/exams/marks` — submit marks
- `GET /api/academic/scheduling/apd` — APD data
- `POST /api/academic/scheduling/generate` — generate timetable
- (+ ~70 more)

#### `/api/assessments/*`
- `GET /api/assessments/questions` — question bank
- `POST /api/assessments/questions` — add question
- `POST /api/assessments/import-pdf` — parse PDF to questions
- `GET /api/assessments/templates` — template list
- `POST /api/assessments/templates/[id]/render` — render paper
- `POST /api/assessments/generate` — auto-generate paper

#### `/api/campaigns/*`
- `GET /api/campaigns` — list
- `POST /api/campaigns` — create
- `POST /api/campaigns/[id]/send` — start campaign
- `POST /api/campaigns/[id]/stop` — stop campaign
- `GET /api/campaigns/[id]/recipients` — recipient progress

#### `/api/budget-proposals/*`
- `GET /api/budget-proposals` — list
- `POST /api/budget-proposals` — create
- `POST /api/budget-proposals/[id]/submit` — DRAFT → SUBMITTED
- `POST /api/budget-proposals/[id]/review` — UNDER_REVIEW → APPROVED (fires Facilities OS webhook)
- `POST /api/budget-proposals/[id]/report` — submit post-event report

#### `/api/webhooks/*` (public, secret-gated)
- `POST /api/webhooks/facilities` — Facilities OS → UniConnect
- `POST /api/webhooks/sheets-change` — Sheets webhook (planned)

(Full list of 262 endpoints available in source tree.)

---

## 12. Data Model

### 12.1 Schema overview

- **`public` schema** — legacy + most domain tables.
- **`ops_os` schema** — append-only operations spine with RLS.
- **108 migrations total** in `packages/shared/migrations/`.

### 12.2 Domain map with row counts (live as of 2026-06-15)

#### Fee Collection v2
| Table | Rows | Notes |
|---|---|---|
| `fee_semester_window` | 1 | One per workbook |
| `fee_batch_period` | 3 | One per batch sub-sheet |
| `fee_student_payments` | 17,935 | `pending` GENERATED ALWAYS |
| `fee_university_meta` | per-uni | Collection dates |
| `fee_remarks` | 1,550 | Operator notes |
| `fee_remark_attachments` | per remark | Proof docs |
| `fee_student_tags` | per student | Case tags |
| `fee_daily_log` | per day | Daily snapshot rollup |
| `fee_payment_transactions` | per payment | Individual events |
| `fee_collection_snapshot` | daily | Trend chart data |
| `fee_dropout_log` | 146 | Authoritative dropouts |
| `fee_doc_requests` | **0** | Billing receipt flow — dormant |

#### Ops OS spine
| Table | Rows | Notes |
|---|---|---|
| `ops_os.submission` | 200 | State machine |
| `ops_os.submission_value` | 4,389 | Immutable when LOCKED |
| `ops_os.metric_dim` | catalog | Metric definitions |
| `ops_os.edit_event` | per edit | Audit |
| `ops_os.edit_triage_state` | per edit | Triage |
| `ops_os.triage_action` | per action | Triage log |
| `ops_os.auto_fill_staging` | staging | External data buffer |
| `ops_os.source_pull_log` | per pull | Source sync log |
| `ops_os.source_system_status` | per source | Health monitor |
| `ops_os.auto_flag_rule` | rules | Rule definitions |
| `ops_os.auto_flag` | **0** | Rule engine not activated |
| `ops_os.notification_dispatch` | per delivery | Notification log |
| `ops_os.event_log` | 9,197 | Event stream |
| `ops_os.pattern_detection_result` | per week | Cross-campus patterns |
| `ops_os.theme_vocabulary` | tags | Pattern themes |
| `ops_os.section_7_access_log` | per access | Sensitive-data audit |
| `ops_os.reminder_dispatch` | 4,130 | Reminder dedup |
| `ops_os.idempotency_log` | 24h ttl | Replay protection |
| `ops_os.cluster_dim` | 18 | Cluster→COS |
| `ops_os.campus_dim` | ~52 | Campus→cluster→uni |
| `ops_os.user_campus_assignment` | 268 | BOA/PM ↔ campus |

#### RBAC / Users
| Table | Rows | Notes |
|---|---|---|
| `public.users` | 589 | Incl. 438 students |
| `public.user_universities` | per assignment | Many-to-many |
| `public.role_permissions` | per role | Feature flags |
| `public.sessions` | 1,399 | 7-day TTL |
| `public.universities` | 18 + team rows | Master list |

#### Notifications
| Table | Rows | Notes |
|---|---|---|
| `public.notifications` | 18,541 | Unified ledger; QUEUED→SENT/FAILED/READ |

#### Campaigns & Mail
| Table | Rows | Notes |
|---|---|---|
| `public.campaigns` | 698 | |
| `public.campaign_recipients` | 55,809 | Per-recipient tracking |
| `public.templates` | 660 | HTML templates |
| `public.mailbox_connections` | 20 | Per-uni Gmail OAuth |

#### Assessments
| Table | Rows | Notes |
|---|---|---|
| `public.assessment_questions` | 80,354 | Question bank |
| `public.assessment_templates` | 19 | Paper templates |
| `public.assessment_batches` / `_branches` / `_subjects` / `_units` / `_topics` / `_course_outcomes` | curriculum | Hierarchy |
| `public.university_assets` | per uni | Logos, seals |

#### Tasks & Schedule
| Table | Rows | Notes |
|---|---|---|
| `public.tasks` | 10,761 | |
| `public.task_assignees` | multi | |
| `public.task_checklist_items` | per task | |
| `public.task_view_logs` | per view | Audit |
| `public.schedule_events` | active | |
| `public.event_assignees`, `event_checklist_items`, `event_view_logs`, `event_sop_documents`, `event_messages`, `event_reports` | per event | |
| `public.calendar_freezes` | per freeze | Read-only periods |

#### Budget
| Table | Rows | Notes |
|---|---|---|
| `public.budget_proposals` | 16 | |
| `public.budget_items` | per proposal | Line items |
| `public.budget_proposal_attachments` | per proposal | Base64 stored |
| `public.budget_proposal_comments` | per comment | INTERNAL/PUBLIC |
| `public.budget_proposal_reports` | per proposal | Post-event |
| `public.budget_proposal_tracking` | per transition | Status audit |

#### Faculty & Success Coach
| Table | Rows | Notes |
|---|---|---|
| `public.faculty_profiles` | 8 | |
| `public.instructor_profiles` | synced | Auto from faculty_profiles |
| `public.instructor_attendance` | 5,424 | |
| `public.instructor_daily_log` | per day | |
| `public.success_coach_profiles` | per COS | Daily target |
| `public.success_coach_daily_log` | 381 | Calls vs target |

#### Communication tasks & Meetings
| `public.communication_tasks` | active | Multi-channel |
| `public.communication_task_reminders` | per reminder | |
| `public.org_meetings` | 52 | + AI analysis |
| `public.meeting_connections` | 3 | Per-user OAuth |
| `public.meeting_invitees`, `meeting_participants` | per meeting | Intent vs actual |

#### Academic Operations
| `public.programs`, `academic_periods`, `sections`, `subjects`, `classrooms`, `student_profiles` | curriculum | |

#### Misc
| `public.sheet_connections` | 6 | Sheets integration registry |
| `public.audit_logs` | **0** | Not populated; superseded by domain-specific |
| `public.day_plans` | 16,346 | No activity since 2026-03-17 — retired |

### 12.3 Key design patterns

1. **GENERATED ALWAYS STORED**: `fee_student_payments.pending = GREATEST(payable - paid, 0)`
2. **Immutability triggers**: `fn_prevent_modify_signed_off` on `submission_value`
3. **Row-Level Security**: `ops_os` tables via `current_setting('app.current_user_id')`
4. **Source-ID dedup**: UNIQUE partial index on `(user_id, source_id) WHERE NOT NULL`
5. **Event sourcing**: `event_log` is the immutable stream
6. **Multi-tenancy**: `university_id` FK + `user_universities` junction
7. **Auto-fill staging**: external data → staging → confirmed values
8. **Idempotency log**: 24h TTL prevents replay

### 12.4 Notifications table — full column ref

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | Recipient FK |
| `university_id` | uuid | Context (optional) |
| `title`, `message` | text | UI body |
| `type` | enum | ACCESS_REQUEST/DEADLINE_REMINDER/CAMPAIGN_UPDATE/SYSTEM |
| `link` | text | Navigation target |
| `is_read` | boolean | In-app read status |
| `source_id` | text | Dedup key |
| `event_name`, `target_role` | text | Triage metadata |
| `channel` | text | IN_APP/EMAIL/WHATSAPP/TEAMS |
| `delivery_status` | text | QUEUED→SENT/FAILED/READ |
| `payload_json` | jsonb | Failure reason etc. |
| `queued_at`, `sent_at`, `read_at` | timestamptz | Lifecycle |

### 12.5 Source-ID patterns

| Workflow | Pattern |
|---|---|
| Fee snapshot | `fee_{kind}_{window_id}_{ist_date}_{email_lower}` |
| Submission lifecycle | `OPSOS_SUBMIT_{sub_id}_{revision}` etc. |
| Auto sign-off | `OPSOS_AUTOSIGNOFF_BOA_{sub_id}` etc. |
| Time-of-day reminders | `OPSOS_REMINDER_{KIND}_{date}_{user_id}_{campus_id}` |
| Daily ops report | `OPS_DAILY_REPORT_{date}` |
| Weekly analytics | `OPS_WEEKLY_REPORT_{weekEnd}` |

---

## 13. Background Workers & Scheduled Jobs

The worker service (`apps/worker/`) is an independent Railway deployment that runs 11 scheduled loops plus 3 BullMQ queue consumers.

### 13.1 Scheduled loops (11)

| # | Loop | Cadence | Trigger time(s) IST | Purpose | Tables touched |
|---|---|---|---|---|---|
| 1 | **Communication task notifications** | 30 s | continuous | Send reminders at creation/10-min-before/due-now/+10-overdue/+30-overdue. Persist notifications + FCM push. | `communication_tasks`, `notifications`, `users`, `universities` |
| 2 | **Fee V2 auto-sync** | 60 s | continuous | If `auto_sync_enabled` and interval elapsed, POST `/api/fees2/windows/[id]/sync`. | `fee_semester_window` |
| 3 | **Fee V2 snapshot** | 60 s | 10:00–10:14, 19:30–19:44 | POST `/api/fees2/windows/[id]/send-snapshot?kind=morning|evening`. | `fee_semester_window` + downstream `notifications` |
| 4 | **Daily Ops AI report** | 30 s check | 20:00 | Aggregate ops, Gemini summary, queue email + FCM + in-app. | All ops tables, `notifications` |
| 5 | **Weekly Analytics report** | 30 s check | Sun 12:00 | Comprehensive week report Mon–Sat, Gemini summary, queue email + FCM + in-app. | Ops tables, `notifications` |
| 6 | **Weekly tasks report** | 30 s check | Sat 10:00 | Weekly task completion notification for all active users. | `users`, `notifications` |
| 7 | **Daily lock (Ops OS)** | 10 min | After 18:30 | Lock DAILY submissions past EOD. Idempotent (already-LOCKED skipped). | `submission`, `event_log` |
| 8 | **Auto sign-off (Ops OS)** | 5 min | After 18:30 | Auto-sign-off submissions stuck in SUBMITTED/PM_REVIEW/SENT_BACK. Notify 4-way. | `submission`, `campus_dim`, `notifications` |
| 9 | **Reminder loops (Ops OS)** | 60 s | 15:30 (15-min), 16:30 (15-min), 18:00 (20-min) | BOA submit due / PM review open / PM review final. | `submission`, `notifications`, `reminder_dispatch` |
| 10 | **Pattern detection (Phase 0)** | weekly (placeholder) | — | Identify themes across 3+ campuses. **No-op handler currently — Phase 0.** | `pattern_detection_result` |
| 11 | **Nightly rollup (Phase 0)** | nightly (placeholder) | — | Aggregate reliability scoring. **No-op currently.** | — |

### 13.2 BullMQ queues (event-driven)

| Queue | Trigger | Job | Worker action |
|---|---|---|---|
| `comm-task-notifications` | App POST on task create | `check-tasks` | Force immediate scan instead of waiting 30 s. |
| `system-notifications` | Email dispatch needed | `send-notification` | Nodemailer send; exponential-backoff retry on failure. |
| `meeting-processing` | Meeting discovered | `process-meeting`, `sync-calendar` | Extract transcript attendees; sync calendar; retry on failure. |

### 13.3 Workers loop lifecycle

- **Boot**: `apps/worker/src/index.ts` calls `startFeeV2AutoSyncLoop()`, `startFeeV2SnapshotLoop()`, `startReminderCycle()`, `startDailyLockLoop()`, `startAutoSignOffLoop()`, plus the comm-task interval and ops-automation interval.
- **Connection**: Redis (IORedis) + Postgres (`pg` pool, max 50, 30 s idle).
- **Health**: Cron at `/api/health` checks app responsiveness; worker has implicit health via Redis ping.
- **Failure handling**: Per-loop try/catch + JSON-structured error log. Failures never crash the worker.

---

## 14. Environment Variables

| Variable | Purpose | Default / Required |
|---|---|---|
| `DATABASE_URL` | Supabase Postgres connection (pooler). | **Required**. |
| `REDIS_URL` | BullMQ + cache backend. | `redis://localhost:6379` |
| `INTERNAL_SYNC_TOKEN` | Shared secret for worker→app calls. | **Required** (auto-sync disabled if missing). |
| `APP_BASE_URL` | Worker→app base URL. | `https://uniconnect-app.up.railway.app` |
| `PUBLIC_BASE_URL` | Email link base for frontend URLs. | `process.env.ORIGIN` or production URL |
| `COOKIE_NAME` | Session cookie name. | `uniconnect_session` |
| `ENCRYPTION_KEY_BASE64` | 32-byte key for encrypting OAuth tokens + PII. | **Required** for OAuth flows. |
| `SMTP_HOST` | SMTP server host. | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port. | `587` |
| `SMTP_SECURE` | Implicit SSL flag. | Inferred from PORT |
| `SMTP_USER` | SMTP auth user. | **Required** (warn if missing). |
| `SMTP_PASS` | SMTP auth password. | **Required**. |
| `SMTP_FROM` | "From" address. | `SMTP_USER` |
| `GOOGLE_CLIENT_ID` | Google OAuth client. | **Required** for OAuth. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth secret. | **Required**. |
| `GOOGLE_GMAIL_REDIRECT_URI` | Gmail OAuth callback. | `http://localhost:3001/api/mailboxes/google/callback` |
| `GOOGLE_MEETING_REDIRECT_URI` | Calendar OAuth callback. | derived |
| `GOOGLE_CREDENTIALS_JSON` | Service-account JSON for Sheets + Vision. | Optional |
| `FIREBASE_SERVICE_ACCOUNT` | Base64 service-account JSON for FCM. | Optional (push disabled if missing). |
| `GEMINI_API_KEY` | Google Generative AI API key. | Optional (AI reports fall back to "unavailable"). |
| `FACILITIES_OS_WEBHOOK_URL` | Facilities OS webhook destination. | Optional. |
| `FACILITIES_WEBHOOK_SECRET` | Validate incoming Facilities OS webhooks. | `facilities-webhook-key` (dev default — change in prod). |
| `OPS_EXTERNAL_API_KEY` | API key for external systems calling `/api/ops/external`. | **Required** for that endpoint. |
| `JWT_SECRET` | JWT signing for QR attendance app. | `fallback-secret-...` (must change in prod). |
| `NODE_TLS_REJECT_UNAUTHORIZED` | Set to `'0'` to bypass TLS verification (dev workaround). | Set at runtime. |

---

## 15. External Integrations

| Service | Purpose | Library | Failure handling |
|---|---|---|---|
| **PostgreSQL (Supabase)** | Primary data store via pooler. | `pg` | Connection pool 50/30s; logs+throws. |
| **Redis (IORedis)** | BullMQ + session cache. | `ioredis` | Logged; reconnects automatically. |
| **Google OAuth 2.0** | Login, Gmail, Calendar, Sheets. | `googleapis@126` | 401→re-auth; logged. |
| **Gmail SMTP** | Snapshot, reminder, lifecycle, campaign emails. | `nodemailer@6.10` | `sent:false`+reason; BullMQ retries. |
| **Firebase Admin SDK** | FCM push notifications. | `firebase-admin@13.6` | Init failures logged; push silently skipped if missing. |
| **Firebase Cloud Messaging** | Browser + mobile push. | `firebase-admin.messaging()` | Failed tokens deduped; success/failure count per batch. |
| **Google Vision API** | Document OCR for student records. | `@google-cloud/vision@4.3` | Errors logged; user-visible error in UI. |
| **Google Gemini AI** | Daily/weekly ops summaries, doc analysis, NLQ. | REST `generativelanguage.googleapis.com` | Rate limit→fallback model (2.5-flash→2.0-flash); "unavailable" fallback. |
| **Google Sheets API** | Fee collection sync, sheets module. | `googleapis.sheets` | Logged; user re-authorizes on auth failure. |
| **Google Drive API** | Meeting transcript discovery ("Notes by Gemini" docs). | `googleapis.drive` | Logged; partial data accepted. |
| **AWS SES (v2)** | Optional email alternative. | `@aws-sdk/client-sesv2` | Not currently wired. |
| **Facilities OS webhook** | Budget proposal sync; ops data export. | REST POST with `x-webhook-secret`. | Logged; **non-blocking** — approval succeeds even if webhook fails. |
| **BullMQ** | Async job coordination. | `bullmq@4.18` | Redis-unreachable→jobs queue but don't process; timeout escalates. |
| **Tesseract.js** | Client-side OCR fallback. | `tesseract.js@5.1` | Logged; user sees error. |
| **PDF libraries** | PDF parsing + image extraction. | `pdf-parse`, `pdf-lib`, `pdf-img-convert` | Parse errors logged; skipped. |
| **@napi-rs/canvas** | Server-side image manipulation (charts in xlsx). | `@napi-rs/canvas@0.1.65` | Errors logged; layout analysis fails. |
| **XLSX (SheetJS)** | Excel parsing for bulk import. | `xlsx@0.18` | Logged; user-friendly error. |
| **Railway** | App + worker hosting (Nixpacks). | platform | Auto-restart on crash; `/api/health` probe. |

---

## 16. Module Deep Dives

Each subsection covers: status, key pages, key API endpoints, key DB tables, business rules, known issues.

### 16.1 Fee Collection v2 — STATUS: ACTIVE (flagship module)
- **Pages**: `/fee-collection-v2` (main dashboard, per-batch tabs, per-uni tabs).
- **APIs**: 28 endpoints under `/api/fees2/*`.
- **Tables**: `fee_semester_window`, `fee_batch_period`, `fee_student_payments`, `fee_university_meta`, `fee_remarks`, `fee_remark_attachments`, `fee_student_tags`, `fee_collection_snapshot`, `fee_dropout_log`.
- **Business rules**:
  1. **Amounts-first status**: `deriveStatus()` ignores typed Payment Status column; math wins.
  2. **Safety-gated purge**: don't delete stale rows if sheet has <50 % of DB row count.
  3. **Snapshot dedup**: per `(window, kind, ist_date, email)` — UNIQUE source_id.
  4. **Recipient hard-excludes**: CMA, CMA_MANAGER, STUDENT, FACULTY, UNIVERSITY_OPERATOR.
  5. **Per-recipient scoping**: each BOA only sees their assigned-campus totals.
  6. **Embedded logo**: base64 — no remote-fetch dependency.
- **Recent fixes** (V77–V85): env-var bug, recipient widening, svelte-check pin, status derivation, safety threshold, LIMIT bump, math-only enforcement, delivery_status tracking.
- **Known issues**: 
  - Per-uni escrow tabs not synced (open question §22.1).
  - Snapshot UI doesn't surface `purge_skipped` events.
- **Status**: ✅ Active, heavy daily use.

### 16.2 Ops OS Submission Spine — STATUS: ACTIVE
- **Pages**: `/ops-os/report`, `/ops-os/pm-inbox`, `/ops-os/review`, `/ops-os/review/[id]`, `/ops-os/operations`, `/ops-os/operations/[id]`, `/ops-os/access-rights`.
- **APIs**: 14 endpoints under `/api/ops-os/*`.
- **Tables**: `submission`, `submission_value`, `metric_dim`, `edit_event`, `event_log`, `reminder_dispatch`, `cluster_dim`, `campus_dim`, `user_campus_assignment`.
- **Business rules**:
  1. State machine: NEW→DRAFT→SUBMITTED→PM_REVIEW→SIGNED_OFF/SENT_BACK/LOCKED/RETRACTED.
  2. Immutability trigger on SIGNED_OFF/LOCKED.
  3. Amendments via `supersedes` pointer.
  4. RLS via `current_setting('app.current_user_id')`.
  5. Section 7 metrics restricted to ADMIN/PROGRAM_OPS/HR.
  6. Auto sign-off at 18:30 IST.
  7. Reminders at 15:30, 16:30, 18:00 IST.
- **Status**: ✅ Active. Pattern detection + auto-flag rules at Phase 0 (no-op handlers).

### 16.3 Fee Collection v1 (Legacy) — STATUS: READ-ONLY ARCHIVE
- **Pages**: `/fee-collection`, `/fee-collection/analytics`.
- **Tables**: `fee_periods` (archived).
- **Status**: Retained for historical query integrity. New code reads only v2.

### 16.4 Tasks — STATUS: ACTIVE
- **Pages**: `/tasks`, `/day-plan` (no longer in nav but reachable).
- **APIs**: ~10 endpoints under `/api/tasks/*`.
- **Tables**: `tasks`, `task_assignees`, `task_checklist_items`, `task_view_logs`.
- **Status**: ✅ Active. 10,761 lifetime rows.

### 16.5 Campaigns + Templates + Mailboxes + Tracking — STATUS: ACTIVE
- **Pages**: `/campaigns`, `/templates`, `/mailboxes`, `/mail-logs`.
- **APIs**: ~30 endpoints across campaigns/templates/mailboxes.
- **Tables**: `campaigns`, `campaign_recipients`, `templates`, `mailbox_connections`, `mail_logs` (table doesn't exist — known issue §21.5).
- **Status**: ✅ Active. 698 campaigns / 55,809 sends lifetime.

### 16.6 Assessments — STATUS: ACTIVE (Design Studio WIP)
- **Pages**: `/assessments`, `/assessments/generate`, `/assessments/questions`, `/assessments/templates`, `/assessments/templates/[id]`, `/assessments/papers/[id]`, `/assessments/subjects/[id]`, `/design-studio-preview` (preview only, internal).
- **APIs**: 22 endpoints under `/api/assessments/*`.
- **Tables**: `assessment_questions` (80,354 rows), `assessment_templates`, hierarchy tables, `university_assets`.
- **Status**: ✅ Active for question bank + paper generation. Design Studio WIP.

### 16.7 Faculty Portal — STATUS: ACTIVE
- **Pages**: 5 under `/faculty-portal/*`.
- **APIs**: Allowlisted paths under `/api/faculty/*`, `/api/academic/*`.
- **Tables**: `faculty_profiles`, `instructor_attendance`, `instructor_daily_log`.
- **Status**: ✅ Active. 8 faculty users.

### 16.8 Academic Operations Hub — STATUS: MIXED
- **Pages**: 27 routes across 6 sub-trees.
- **Status by sub-tree**:
  - Hub landing: ✅ Active.
  - Setup & Config: ✅ Active.
  - Audit Logs: ✅ Active.
  - Examinations (5 routes): ✅ Active.
  - Faculty Ops (6 routes): ✅ Active.
  - Student Ops (2 routes): ✅ Active.
  - Scheduling (10 routes): ⚙️ Active with APD engine still being tuned.
  - Reports & Compliance: ✅ Active.
  - AI Copilot: ⚙️ WIP.
  - Portal Access: ⚙️ WIP.

### 16.9 Budget Proposals — STATUS: ACTIVE
- **Pages**: `/budget-proposals`, `/budget-proposals/create`, `/budget-proposals/[id]`, `/budget-proposals/[id]/edit`, `/budget-proposals/[id]/report`.
- **APIs**: ~12 endpoints under `/api/budget-proposals/*`.
- **Tables**: `budget_proposals`, `budget_items`, `budget_proposal_attachments`, `budget_proposal_comments`, `budget_proposal_reports`, `budget_proposal_tracking`.
- **Integration**: Facilities OS webhook on approval.
- **Status**: ✅ Active. 16 proposals lifetime.

### 16.10 Communication Tasks (Multi-Channel) — STATUS: ACTIVE
- **Pages**: `/communication-tasks`, `/new`, `/[id]`, `/[id]/edit`.
- **Tables**: `communication_tasks`, `communication_task_reminders`.
- **Workers**: BullMQ `comm-task-notifications` + 30 s polling loop.
- **Status**: ✅ Active.

### 16.11 Meeting Intelligence — STATUS: ACTIVE
- **Pages**: `/meetings`, `/meetings/[id]`.
- **Tables**: `org_meetings` (52 rows), `meeting_connections` (3), `meeting_invitees`, `meeting_participants`.
- **Workers**: BullMQ `meeting-processing` queue with `process-meeting` + `sync-calendar` jobs.
- **AI**: Gemini for summary, action items, decisions, sentiment.
- **Status**: ✅ Active.

### 16.12 Smart Sheets — STATUS: ACTIVE
- **Pages**: `/sheets`.
- **Tables**: `sheet_connections` (6 rows).
- **Status**: ✅ Active.

### 16.13 Ops Dashboard / Analytics — STATUS: ACTIVE (v2 WIP)
- **Pages**: `/ops-dashboard`, `/ops-dashboard/v2` (WIP), `/analytics`.
- **Status**: v1 active; v2 in active rebuild.

### 16.14 Faculty Attendance — STATUS: ACTIVE
- **Pages**: `/faculty-attendance`.
- **Tables**: `instructor_attendance` (5,424 rows), `instructor_daily_log`.
- **Status**: ✅ Active.

### 16.15 Daily Ops AI Reports — STATUS: ACTIVE
- **Workers**: 20:00 IST daily + Sun 12:00 IST weekly.
- **AI**: Gemini for summary; fallback to "unavailable".
- **Distribution**: Email + FCM push + in-app notification to admins.
- **Status**: ✅ Active.

### 16.16 Day Plans — STATUS: RETIRED
- **Pages**: `/day-plan`, `/reports/day-plan`.
- **Tables**: `day_plans` (16,346 rows, no activity since 2026-03-17).
- **Status**: ❌ Retired — no longer in nav, no recent activity.

### 16.17 Audit Logs (generic) — STATUS: DORMANT
- **Tables**: `audit_logs` (0 rows).
- **Status**: ❌ Dormant — superseded by domain-specific audit (event_log, edit_event, section_7_access_log, etc.).

---

## 17. Out of Scope & Dormant Features

### 17.1 Out of scope
| Item | Reason |
|---|---|
| Student-facing portal | Students are records, not users. |
| Financial accounting / reconciliation | Done in upstream finance system. |
| Invoice + receipt issuance | Not a billing system. |
| Learning Management System | Use partner LMS. |
| Customer Relationship Management | Zoho is source of truth. |
| Real-time chat between operators | Use Slack/WhatsApp out-of-band. |
| Direct student payment processing | Payment links live in Zoho. |
| Mobile native apps (iOS/Android) | Web-only (see §18.4). |

### 17.2 Dormant tables / features (present in code, no/near-zero production use)
| Feature | Evidence | Action |
|---|---|---|
| `fee_doc_requests` (billing receipt request flow) | 0 rows. | Treat as deferred — §18.7. |
| `ops_os.auto_flag` (rule-based incident detection) | 0 rows. | Schema ready, engine not activated — §18.3. |
| `public.audit_logs` (generic audit log) | 0 rows. | Superseded by domain-specific tables. |
| `public.day_plans` | 16,346 rows but inactive since 2026-03-17. | Considered retired; navigation already removed. |
| Pattern detection scheduler | Phase-0 no-op handler. | §18.8. |
| Nightly rollup scheduler | Phase-0 no-op handler. | §18.9. |
| AWS SES integration | Library installed but never wired. | Deferred. |

---

## 18. On Hold / Deferred

### 18.1 Per-university escrow tabs (fee sync) — FR-FEE.13
The fee workbook contains tabs CDU Escrow, MRV, VGU Escrow, Cresent Escrow statement, Annamacharya, Direct Uni Payments. The sync currently reads only main batch tabs (`2023– Semester 6`, `2024– Semester 5`, `2025– Semester 3`). **Decision needed**: are these tabs authoritative ledgers or operator-only working notes?

### 18.2 Server-side per-batch per-uni aggregation — FR-FEE.14
Per-batch university breakdown currently aggregates client-side from `/api/fees2/batches/[id]/students` (LIMIT 20000). A `GROUP BY u.id` endpoint would scale cleaner.

### 18.3 Auto-flag rule engine activation — FR-OPS.17
`auto_flag_rule` + `auto_flag` schema exists; rule engine not turned on. Currently relies on operator-flagged incidents. **Decision needed**: which thresholds, who triages?

### 18.4 Mobile native apps
BOA daily-report submission is highest-frequency operator action. Native mobile would reduce friction.

### 18.5 Real-time presence / collaboration
"X is editing this submission" indicators rely on 60 s polling. Supabase Realtime or WebSockets would enable true real-time.

### 18.6 Webhook-driven Sheets sync
Sheets API supports change webhooks. Currently 60 s pull-poll. Webhook would cut latency to < 5 s.

### 18.7 Fee doc-request flow activation
`fee_doc_requests` schema + ack-token endpoint exist; UI to send "please upload your fee receipt" emails not yet built.

### 18.8 Pattern detection cron
Phase 0 has a no-op handler. Activation requires the weekly cross-campus theme correlation.

### 18.9 Nightly rollup
Phase 0 placeholder. Will compute reliability scoring per BOA/PM.

### 18.10 Managed SMTP provider migration
Currently Gmail SMTP with `tls.rejectUnauthorized = false`. Move to SendGrid/Postmark to remove the TLS bypass.

### 18.11 In-app admin observability dashboard
Currently Railway logs are the only source for snapshot fires / sync runs. A `/ops-dashboard/system-health` panel showing last 10 fires + last 10 sync runs would close the loop.

### 18.12 Dual schema cleanup
`fee_periods` (v1) tables retained. Drop after confirming no legacy historical queries depend on them.

---

## 19. Currently Upcoming / WIP

| Feature | Where | Status | ETA target |
|---|---|---|---|
| **Ops Dashboard v2** | `/ops-dashboard/v2` | Live alongside v1; iterating on UX. | TBD |
| **Academic Operations: AI Copilot** | `/academic-operations/ai-copilot` | Page exists; backend integration in progress. | TBD |
| **Academic Operations: Portal Access** | `/academic-operations/portal-access` | Foundational; iterating. | TBD |
| **Design Studio (assessment paper layout editor)** | `/design-studio-preview` | Preview workspace; layout-editor in active build. | TBD |
| **Scheduling APD engine** | `/academic-operations/scheduling/*` | All 10 sub-routes present; conflict detection tuning. | TBD |
| **Daily / weekly AI report enhancements** | Worker | Gemini prompts iterating; success-rate target ≥ 90 %. | Continuous |

---

## 20. Risks & Mitigations

### 20.1 Schema soft-types
**Risk**: `notifications.delivery_status` and `fee_student_payments.status` are free-text. App bug could write invalid value.
**Mitigation**: Application-layer convention; consider CHECK constraints in future migration.

### 20.2 Observability gap for snapshot & sync outcomes
**Risk**: No in-app dashboard surfaces "last N snapshot fires" or `purge_skipped`. Operators rely on Railway logs.
**Mitigation**: V85 added per-row `delivery_status`; aggregated UI deferred §18.11.

### 20.3 Dual-schema split (`fee_periods` v1 vs `fee_batch_period` v2)
**Risk**: Both `period_id` and `batch_period_id` columns exist on `fee_student_payments`. New code reads only v2.
**Mitigation**: v1 retained for historical integrity; deletion deferred §18.12.

### 20.4 Broadcast-mode reminder fallback could spam
**Risk**: Reminder system falls back to "every active user with role" if `user_campus_assignment` is empty.
**Mitigation**: Currently 268 active assignments — fallback shouldn't trigger. Add `min_assignments` guard in future.

### 20.5 SMTP TLS validation disabled
**Risk**: `tls: { rejectUnauthorized: false }` weakens transport security.
**Mitigation**: §18.10 — migrate to managed provider.

### 20.6 Single active `fee_semester_window` assumption
**Risk**: Dashboard picks `windows[0]` if multiple active. Non-deterministic.
**Mitigation**: Operationally only one window active; add unique partial index if needed.

### 20.7 Gemini AI quota / rate limits
**Risk**: Hitting daily Gemini quota disables AI summaries.
**Mitigation**: Fallback model chain (2.5-flash→2.0-flash); on full fail, "unavailable" placeholder.

### 20.8 FCM token churn
**Risk**: Expired/invalid FCM tokens fail silently.
**Mitigation**: Per-batch success/failure counts logged; future: prune dead tokens.

### 20.9 Facilities OS webhook failure non-blocking
**Risk**: Budget proposal approval succeeds even if Facilities OS webhook fails. Downstream sync may miss.
**Mitigation**: Logged; retry on next status change. Future: add explicit retry queue.

### 20.10 `JWT_SECRET` default fallback in QR attendance app
**Risk**: Dev fallback `fallback-secret-change-in-production-32chars` is insecure if not set.
**Mitigation**: Hard-fail in production if env not set. (Currently warns only.)

---

## 21. Known Issues & Workarounds

### 21.1 `/mail-logs` route shows campaign_recipients, not a `mail_logs` table
**Issue**: UI shows `/mail-logs` but no `mail_logs` table exists in DB. Route reads from `campaign_recipients`.
**Workaround**: Treat as feature, not bug. Future: rename route OR create proper `mail_logs` table.

### 21.2 `day_plans` table has 16,346 rows but no recent activity
**Issue**: Was actively used pre-March 2026. Now retired but data retained.
**Workaround**: Navigation already removed. Decision needed on archival.

### 21.3 `audit_logs` table has 0 rows
**Issue**: Schema present, no code writes to it.
**Workaround**: Each domain has its own audit table (`event_log`, `edit_event`, `section_7_access_log`, `budget_proposal_tracking`, `task_view_logs`, `event_view_logs`).

### 21.4 Pattern detection / nightly rollup are Phase 0 no-ops
**Issue**: Schedulers registered but handlers do nothing.
**Workaround**: Will be activated in a future phase.

### 21.5 `mail_logs` table referenced but doesn't exist
**Issue**: A few code paths reference `public.mail_logs` which doesn't exist as a table.
**Workaround**: Errors swallowed; relies on `campaign_recipients`.

### 21.6 Auto-purge fee sync threshold may need tuning
**Issue**: 50 % threshold may be conservative for legitimate large-edit days.
**Workaround**: Operator manually purges when needed; threshold tunable.

### 21.7 Multiple sub-route layouts (5 in academic-operations) increase complexity
**Issue**: Adding new academic sub-routes requires layout coordination.
**Workaround**: Documented in §10.3.

### 21.8 Tracking endpoints can be spammed
**Issue**: `/api/track/open/{token}` is public; could be hit repeatedly to inflate open_count.
**Workaround**: Increment is mild; doesn't change status from ACKNOWLEDGED. Acceptable.

### 21.9 Worker restarts re-fire pending reminders
**Issue**: If worker restarts during a 15-min reminder window, dedup table prevents double-send.
**Workaround**: Working as intended.

### 21.10 No automated test suite for the auto-sign-off path
**Issue**: 18:30 IST auto-sign-off is critical path with no test coverage.
**Workaround**: Production verified daily; manual smoke test.

---

## 22. Open Questions

| # | Question | Owner | Blocks |
|---|---|---|---|
| 22.1 | Should per-uni escrow tabs feed fee sync? | Program Ops Central | FR-FEE.13 |
| 22.2 | Which thresholds trigger auto-flag rules? Who triages? | COS leadership | FR-OPS.17 |
| 22.3 | Officially retire `day_plans` module from UI and archive table? | Program Ops Central | Cleanup |
| 22.4 | Populate `mail_logs` table or rename `/mail-logs` route? | Engineering | §21.5 |
| 22.5 | Verify `section_7_access_log` is being written on every Section 7 read | Security review | NFR-SEC.3 |
| 22.6 | Activate fee doc-request flow? | Program Ops Central | FR-FEE.15 |
| 22.7 | Move to managed SMTP (SendGrid/Postmark)? | Engineering | NFR-SEC + §20.5 |
| 22.8 | Set hard timeline for Ops OS Phase 1 (pattern detection + auto-flag rules)? | Program leadership | FR-OPS.16, FR-OPS.17 |
| 22.9 | Build native mobile BOA submission form? | Product | §18.4 |
| 22.10 | Drop legacy `fee_periods` tables once safe? | Engineering | §18.12 |

---

## 23. Release History

| Release | Date | Summary |
|---|---|---|
| **V85** (`b1f8d9dc`) | 2026-06-14 | Honour `sendEmail` return; `delivery_status` QUEUED→SENT/FAILED. |
| **V84** (`2528a538`) | 2026-06-14 | Strict math-only `deriveStatus()` — no self-disagreement with cleanup. |
| **V83** (`6f66fb43`) | 2026-06-14 | Per-batch student list LIMIT 5 000 → 20 000. |
| **V82** (`b26ec828`) | 2026-06-14 | Amounts-first `deriveStatus()`; safety-gated stale-row purge (50 % threshold). |
| **V81** (`c3f7d78a`) | 2026-06-04 | Pin `svelte-check@~4.5.0` to dodge broken upstream peer. |
| **V80** (`6596e6ae`) | 2026-06-04 | Widen snapshot recipients to 72 (added BOAs); hard-exclude CMA/CMA_MANAGER/STUDENT/FACULTY/UNIVERSITY_OPERATOR. |
| **V77** | 2026-06-04 | Switch `INTERNAL_SYNC_TOKEN` reader to `$env/dynamic/private` — closes multi-day snapshot outage. |
| (older) | prior | See `git log` for full history. |

---

## 24. Glossary

| Term | Meaning |
|---|---|
| **APD** | All-Possible-Days — scheduling algorithm in Academic Operations. |
| **BOA** | Branch Operations Associate — daily-report submitter per campus (43 active). |
| **BullMQ** | Redis-backed async job queue library. |
| **CMA** | Curriculum Management Associate. |
| **CO** | Course Outcome (assessment hierarchy). |
| **COS** | Cluster Operations Supervisor — owns a multi-campus cluster (10 active). |
| **FCM** | Firebase Cloud Messaging (browser/mobile push). |
| **IST** | Indian Standard Time (UTC + 05:30). All operational schedules anchored to IST. |
| **NIAT** | NxtWave Institute of Advanced Technologies. |
| **Ops OS** | The structured submission → review → sign-off operations spine. |
| **PM** | Program Manager — reviews BOA submissions (9 active). |
| **PMA** | Program Manager Associate — between PM and BOA (27 active). |
| **PoSH / PoCSO** | Prevention of Sexual Harassment / Protection of Children from Sexual Offences. |
| **QP** | Question Paper. |
| **RLS** | Postgres Row-Level Security. |
| **Section 7** | Block of incident metrics (PoSH, anti-ragging, safety, parent complaint, CEO-visible); access-restricted. |
| **Source ID** | Idempotency key on `notifications` / `reminder_dispatch` / `auto_flag`. |
| **Window (fee)** | A `fee_semester_window` row — represents one collection workbook covering multiple batches in parallel. |
| **Zoho User ID** | External student identifier from Zoho CRM; natural key in `fee_student_payments`. |

---

## 25. Appendix: File-System Layout

```
uniconnect-mail-automation/
├── apps/
│   ├── app/                          ← SvelteKit web app (production user-facing)
│   │   ├── src/
│   │   │   ├── routes/
│   │   │   │   ├── (auth)/login/      ← Login page
│   │   │   │   ├── (app)/             ← Main authenticated layout (most routes)
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   ├── fee-collection-v2/
│   │   │   │   │   ├── ops-os/
│   │   │   │   │   ├── academic-operations/
│   │   │   │   │   ├── campaigns/
│   │   │   │   │   ├── ... (94 page routes)
│   │   │   │   ├── api/               ← 262 API endpoints
│   │   │   │   │   ├── auth/
│   │   │   │   │   ├── fees2/
│   │   │   │   │   ├── ops-os/
│   │   │   │   │   ├── academic/
│   │   │   │   │   ├── ...
│   │   │   │   ├── ack/[token]/       ← Public ack landing
│   │   │   │   ├── fee-ack/[token]/   ← Public fee ack
│   │   │   │   └── accept-invite/     ← Public invite acceptance
│   │   │   ├── lib/
│   │   │   │   └── server/            ← Server-only utilities (fee_scope, fee_snapshot, etc.)
│   │   │   └── hooks.server.ts        ← Auth middleware + feature gates
│   │   ├── static/
│   │   │   ├── niat-logo.jpg
│   │   │   ├── firebase-messaging-sw.js
│   │   │   └── ...
│   │   └── package.json
│   ├── worker/                       ← Background worker service (independent Railway deploy)
│   │   └── src/
│   │       ├── index.ts               ← Entry point; starts all loops
│   │       ├── fee_v2_workers.ts      ← Fee auto-sync + snapshot loops
│   │       ├── ops_os/
│   │       │   ├── reminders.ts       ← 15:30/16:30/18:00 IST loops
│   │       │   ├── daily_lock.ts      ← 10-min lock loop
│   │       │   └── auto_sign_off.ts   ← 5-min auto-sign-off loop
│   │       └── ops_automation.ts      ← Daily/weekly AI reports
│   └── qr-attendance/                ← Separate app for QR-based attendance (uses JWT)
├── packages/
│   └── shared/                       ← Shared library used by both apps
│       ├── src/
│       │   ├── db/                    ← All DB modules (one per domain)
│       │   ├── ops_os/                ← Notification, reminder, email helpers
│       │   ├── email/                 ← Email templating
│       │   └── ...
│       └── migrations/                ← 108 Postgres migrations
├── .railway-trigger                  ← Bump V## to force Railway rebuild
├── package.json                       ← pnpm workspace root + canvas override
├── pnpm-lock.yaml
└── PRD.md                            ← This document
```

---

## 26. Team Ownership Matrix — Who Owns What

Every feature in this PRD requires support from one or both of:

- **DEV** = Engineering team. Builds and maintains the code, fixes bugs, ships new features, handles infra.
- **DA** = Data & Operations team. Provides and maintains the source data (Google Sheets, BOA submissions, faculty rosters, etc.) and is responsible for data accuracy.

A module marked **DEV + DA** means both teams must coordinate — code can't fix what's wrong in the source data, and clean source data can't surface without code to read and render it.

### 26.1 Legend

| Tag | Meaning |
|---|---|
| 🔧 **DEV-only** | Engineering builds/maintains; no external data entry needed beyond initial config. |
| 📊 **DA-only** | Code is stable; ongoing accuracy depends entirely on the DA team's data input. |
| 🔧📊 **DEV + DA** | Both teams needed: DEV builds + maintains; DA provides source data. |
| 🧭 **Leadership** | Requires a decision from program leadership before DEV or DA can act. |

### 26.2 Module ownership matrix

| Module | Tag | DEV responsibilities | DA responsibilities |
|---|---|---|---|
| **Fee Collection v2** | 🔧📊 | Maintain sync engine, snapshot pipeline, dashboard, XLSX export, V2 schema, safety threshold, deriveStatus logic, recipient resolution, delivery tracking. Fix sync bugs. | Maintain accuracy of the fee Google Sheet — `User ID`, `University`, `Total Term Fee Payable`, `Total Term Fee Paid`, `Payment Status`, dropout sub-sheet, semester-date sub-sheet, university-meta rows. Reconcile escrow tabs into main batch tabs OR explicitly decide they're separate. **#1 source of data-quality issues in this app — DA-side sheet typos directly land in dashboard.** |
| **Ops OS submissions** | 🔧📊 | State machine, RLS, immutability triggers, reminder loops, auto-sign-off, notification fan-out, event-log audit. | BOAs fill metrics daily per campus by 16:00 IST. PMs review by 18:30. **If BOAs don't submit → empty dashboard.** PMs sign off accurately → trustworthy daily roll-ups. |
| **Tasks (Task Center)** | 🔧 | CRUD, multi-assignee, checklists, view logs, polling. | None — purely operational; operators self-serve. |
| **Email Campaigns + Mailboxes + Templates** | 🔧📊 | Campaign engine, OAuth integration, Gmail send, open/ack tracking. | University Operators maintain recipient lists, template content, OAuth mailbox connections. Bad recipient list → bad delivery. |
| **Mail Audit Log** | 🔧 | Surface `campaign_recipients` send history. | None (read-only). |
| **Assessments / Question Bank / Paper Generation** | 🔧📊 | Question bank schema, hierarchy (batches→branches→subjects→units→topics), template layout schema, paper-generation logic, PDF parsing, Design Studio. | Faculty + curriculum team supply question content, tag with Bloom level + CO + difficulty + marks. Maintain answer keys. **Garbage questions in → garbage paper out.** |
| **Faculty Attendance** | 🔧📊 | Schema, CRUD UI, audit. | BOA/HR teams mark daily attendance per instructor per campus. |
| **Instructor Daily Log** | 🔧📊 | CRUD UI. | Instructors / BOAs log sessions taken, topics covered, workload notes. |
| **Success Coach Daily Log** | 🔧📊 | Tracking UI, daily-target schema. | COS leadership sets call targets; coaches log daily calls (student + parent). |
| **Budget Proposals** | 🔧 | Workflow engine, approval transitions, attachment storage, post-event reports, Facilities OS webhook. | CMA/proposers create proposals; no external data dependency. |
| **Communication Tasks (multi-channel)** | 🔧 | Scheduling engine, FCM push, reminder ladder, BullMQ triggers. | Operators self-schedule. |
| **Meeting Intelligence** | 🔧📊 | Calendar OAuth, Drive transcript discovery, Gemini summary, BullMQ processing. | Users connect their Google Calendar; transcripts must exist (Google Meet's "Notes by Gemini" or equivalent). |
| **Smart Sheets** | 🔧📊 | Sheets OAuth integration, registration of connected sheets. | DA configures which sheets to read; maintains data accuracy in those sheets. |
| **Daily Ops AI Report (20:00 IST)** | 🔧📊 | Aggregator, Gemini integration, fallback chain, email + FCM + in-app dispatch. | **Quality depends on BOA submissions being filled.** If BOAs skip, the AI summary will say so. |
| **Weekly Analytics Report (Sun 12:00 IST)** | 🔧📊 | Same as daily. | Same — depends on week of submissions. |
| **Schedule Events / Calendar** | 🔧📊 | Event CRUD, types, multi-assignee, checklist, SOP, post-event reports. | Coordinators create events; DA logs post-event metrics. |
| **Academic Ops — Setup & Config** | 🔧📊 | Programs / Periods / Sections / Subjects / Classrooms schema. | DA team enters program-level data per university. |
| **Academic Ops — Scheduling (APD)** | 🔧📊 | APD engine, availability matrix, conflict detection, publish workflow. | DA team enters faculty availability, subject hours, classroom capacity. |
| **Academic Ops — Examinations sub-tree** | 🔧📊 | Marks entry, classroom assignment, invigilation, seating. | Exam coordinators enter timetables, assign invigilators, finalize seating. |
| **Academic Ops — Faculty Ops sub-tree** | 🔧📊 | Profile + leave + workload + teaching-report + documents. | HR / faculty heads maintain profiles, approve leaves, upload documents. |
| **Academic Ops — Student Ops sub-tree** | 🔧📊 | Student master CRUD + per-student detail. | DA team imports/updates student rosters from Zoho. |
| **Academic Ops — Audit Logs** | 🔧 | Append-only audit display. | None (read-only). |
| **Academic Ops — Reports & Compliance** | 🔧📊 | Report rendering. | Requires accurate upstream Academic Ops data. |
| **Academic Ops — AI Copilot** | 🔧 (WIP) | Gemini integration, prompt design. | None directly. |
| **Academic Ops — Portal Access** | 🔧 (WIP) | Portal access management. | None directly. |
| **Notifications (system-wide)** | 🔧 | Unified ledger, dedup, FCM, delivery_status tracking. | None directly. |
| **RBAC / User & Permission management** | 🔧📊 | Hooks, scope resolver, feature gates. | Admins assign roles + campus assignments accurately in `user_campus_assignment` and `cluster_dim`. |
| **Auth / Sessions / OAuth** | 🔧 | Session lifecycle, Google OAuth, encrypted tokens. | None. |
| **Faculty Portal (5 screens)** | 🔧📊 | Path-allowlisted faculty UI. | Faculty self-input marks, teaching reports, expertise. |
| **Ops Dashboard v1 + v2** | 🔧📊 | KPI rendering. | Depends on accurate upstream Ops OS submissions. |
| **System Analytics** | 🔧📊 | Roll-up queries. | Depends on accurate upstream tables. |

### 26.3 Open items / future features — ownership

| Open item | Tag | What's needed |
|---|---|---|
| **§18.1 — Per-uni escrow tabs (FR-FEE.13)** | 🧭 + 📊 + 🔧 | Leadership decides if escrow tabs are authoritative. If yes: DA confirms sheet structure + DEV extends sync to read them. |
| **§18.3 — Auto-flag rule engine (FR-OPS.17)** | 🧭 + 📊 + 🔧 | Leadership + COS define thresholds (e.g. "attendance < 70% → flag"). DA confirms metric availability. DEV wires rule engine. |
| **§18.4 — Mobile native apps** | 🔧 | Pure engineering build. |
| **§18.5 — Real-time presence / collab** | 🔧 | Pure engineering. |
| **§18.6 — Webhook-driven Sheets sync** | 🔧 | Pure engineering. |
| **§18.7 — Fee doc-request flow activation** | 🔧📊 | DEV builds send-UI; DA provides student email lists per batch. |
| **§18.8 — Pattern detection cron** | 🧭 + 🔧 + 📊 | Leadership confirms desired patterns; DEV activates handler; DA validates output makes operational sense. |
| **§18.9 — Nightly rollup (reliability scoring)** | 🧭 + 🔧 | Leadership defines reliability metric; DEV activates. |
| **§18.10 — Managed SMTP provider** | 🔧 | Engineering only (cost decision in 🧭). |
| **§18.11 — Admin observability dashboard** | 🔧 | Engineering only. |
| **§18.12 — Drop legacy `fee_periods`** | 🔧 + 📊 | DEV needs to confirm no consumers; DA confirms no historical queries depend on it. |
| **§22.3 — Day Plans module retirement** | 🧭 + 🔧 | Leadership confirms; DEV removes route + archives table. |
| **§22.6 — Fee doc-request UX activation** | 🧭 + 🔧📊 | Leadership prioritises; DEV + DA build. |
| **§22.9 — Native mobile BOA submission** | 🧭 + 🔧 | Leadership decides; DEV builds. |

### 26.4 DA team — the critical-path inputs

If the DA team can keep these inputs clean, ~80 % of "the dashboard is wrong" tickets disappear:

| Input | Where | Update cadence | Consequence of inaccuracy |
|---|---|---|---|
| **Fee Sheet — `Total Term Fee Paid` column** | Google Sheet, per-batch tab | Daily as payments arrive | Dashboard understates collection %; PMs chase students who already paid. |
| **Fee Sheet — `Payment Status` column** | Google Sheet, per-batch tab | Daily | (Now overridden by code-side `deriveStatus()` — math wins.) |
| **Fee Sheet — `User ID` column (zoho_user_id)** | Google Sheet | Per addition | Sync skips rows with blank User ID. Students disappear from dashboard. |
| **Fee Sheet — `University` column** | Google Sheet | Per addition | If spelt differently, sync may treat as unmapped + skip. Aliases exist for common variations. |
| **Fee Dropout sub-sheet** | Google Sheet | Per dropout | Dashboard dropout count diverges from reality. |
| **Fee Dates sub-sheet** | Google Sheet | Per semester | Collection windows + per-uni fee schedules missing from snapshot. |
| **BOA daily submissions** | UniConnect `/ops-os/report` | Daily by 16:00 IST | If skipped: empty dashboard, no rollup data, no AI report content. |
| **PM sign-off action** | UniConnect `/ops-os/review` | Daily by 18:30 IST | If skipped: auto-sign-off fires; counts against PM non_response_count. |
| **`user_campus_assignment` (BOA/PM ↔ campus)** | DB (admin via `/permissions`) | When BOAs/PMs change campuses | Wrong assignment → snapshot scoping wrong → BOA sees wrong campus data. |
| **`cluster_dim.cos_user_id` (COS → cluster)** | DB (admin) | When COS changes | Wrong → COS sees wrong campuses. |
| **Faculty roster + leave** | UniConnect `/academic-operations/faculty-ops/*` | Per change | Workload calc, attendance calc affected. |
| **Student roster** | Imported from Zoho | Sync regularly | Out-of-date roster → wrong batch counts, wrong recipient lists. |
| **Question bank entries** | UniConnect `/assessments/questions` | Per term | Empty bank → paper generation fails. |
| **Mailbox OAuth tokens** | UniConnect `/mailboxes` | Per token expiry | Expired → campaigns can't send. |
| **Coach call targets** | DB (set by COS) | Per quarter | Wrong target → wrong "behind target" alerts. |
| **Coach daily call log entries** | UniConnect (coach self-entry) | Daily | Skipped → coach appears non-performing. |

### 26.5 DEV team — recurring engineering responsibilities

| Responsibility | Cadence | Notes |
|---|---|---|
| **Railway deploy management** | Per PR | Bump `.railway-trigger` V## to force rebuild. |
| **Migration authoring** | Per schema change | 108 migrations to date — every change is a migration. |
| **Worker health monitoring** | Continuous | Railway logs; structured JSON. |
| **Gemini prompt iteration** | As needed | Quality of AI reports depends on prompt design. |
| **OAuth token refresh handling** | Per provider | Mailbox + meeting + sheets all need refresh. |
| **FCM token cleanup** | Periodic | Dead tokens accumulate. |
| **Safety-threshold tuning (fee sync purge)** | Per anomaly | Current 50 % may need tweaks. |
| **Reminder window tuning** | Per ops feedback | 15-min windows may need adjustment. |
| **Snapshot recipient list maintenance** | Per role / assignment change | Auto-resolved, but logic may need updating. |
| **AI fallback chain (Gemini 2.5→2.0→unavailable)** | When new models release | |
| **Schema CHECK constraints (currently soft)** | Future hardening | `delivery_status`, `status` are free-text — could tighten. |

### 26.6 Joint DEV + DA escalation paths

When a "the dashboard is wrong" ticket arrives, triage in this order:

1. **DA-first**: Is the source data wrong? Check the Google Sheet / submission directly. (Most tickets land here.)
2. **DEV-second**: Is the data correct in the source but not flowing through? Then it's a sync / aggregation / rendering bug.
3. **Joint**: A new business rule needs to be encoded (e.g. "Mark students with Z status as Y"). Requires DA to define the rule + DEV to ship it.

Recent examples from V77–V85 release cycle:
- **CDU showed 1,304 instead of 1,295** → DA: 9 students were in the sheet on May 30 but not now → DEV: added stale-row purge. **Joint fix.**
- **NRI Fully Paid count wrong** → DA: sheet typed "Fully Paid" for students who paid ₹50 short → DEV: math-first `deriveStatus()`. **Code wins over DA-side typos.**
- **VGU not showing in per-batch table** → DEV: LIMIT 5000 clipped past row 5000. **Pure DEV bug.**
- **Snapshot emails not firing for days** → DEV: env-var read pattern bug. **Pure DEV bug.**

---

*End of document. For corrections or additions, edit and commit to main; this file is the source of truth for product scope.*
