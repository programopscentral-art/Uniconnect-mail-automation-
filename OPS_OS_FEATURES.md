# UniConnect Ops OS — Feature Reference

**Document scope.** Exhaustive, inch-by-inch reference for the 5 operations-side features:

1. **Ops Dashboard** (`/ops-dashboard` + `/ops-dashboard/v2`)
2. **Daily Report** (`/ops-os/report`) — the BOA submission form
3. **PM Inbox** (`/ops-os/pm-inbox`)
4. **PM Review Queue** (`/ops-os/review` + `/ops-os/review/[id]`)
5. **Operations Overview** (`/ops-os/operations` + `/ops-os/operations/[id]`)

For high-level product context see [PRD.md](PRD.md). This doc is the engineering / training reference — every metric, every endpoint, every state, every notification.

---

## 0. How the 5 features fit together

These five surfaces implement one workflow: **a campus's daily operational health flows from BOA → PM → Locked**, with COS and ADMIN watching from above.

```
 ┌────────────────┐
 │ Daily Report   │  BOA fills in 8 sections of metrics, submits.
 │ /ops-os/report │
 └───────┬────────┘
         │   notifyPmsOnSubmission()
         ▼
 ┌────────────────┐    ┌──────────────────────┐
 │ PM Inbox       │    │ PM Review Queue      │   PM reads the form, signs off
 │ /ops-os/       │ →  │ /ops-os/review[/{id}]│   OR sends back with a reason.
 │ pm-inbox       │    └──────────┬───────────┘
 └────────────────┘               │
                                  │   notifyBoaOnSignOff() / notifyBoaOnSendBack()
                                  ▼
                       ┌──────────────────────┐
                       │ Operations Overview  │   COS + Admin watch the
                       │ /ops-os/operations   │   day's network-wide health.
                       └──────────────────────┘

       Above all of this:
       ┌──────────────────────┐
       │ Ops Dashboard (v1+v2)│   KPI analytics; rolls submission data into
       │ /ops-dashboard[/v2]  │   daily / weekly / monthly views with AI summaries.
       └──────────────────────┘
```

**Three workers enforce the cadence:**
- 15:30 IST — `boa_submit_due_soon` reminder (BOAs without a SUBMITTED row).
- 16:30 IST — `pm_review_open` reminder (PMs with reports waiting).
- 18:00 IST — `pm_review_final` reminder (last-call before auto-sign-off).
- 18:30 IST — **Auto-sign-off**: any SUBMITTED / PM_REVIEW row that's still open gets system-closed; PM non-response counter increments.
- 18:30+ IST — **Daily lock**: SIGNED_OFF rows become LOCKED (immutable).

---

## 1. Daily Report — `/ops-os/report`

The BOA's daily submission form. The single most operationally critical page in the app.

### 1.1 Purpose & user

- **User:** BOA (Branch Operations Associate) for one campus. PMA users are auto-assigned a BOA role and submit on the same form. ADMIN / PROGRAM_OPS can also submit when filling in on behalf of a campus.
- **Cadence:** Once per campus per day, by 16:00 IST.
- **Outcome:** One `ops_os.submission` row per (campus_id, period_start=today, cadence=DAILY), with values populated in `ops_os.submission_value`.

### 1.2 Page layout

Top of page:
- **Campus picker** (if user is assigned to >1 campus).
- **Day-Type toggle**: "Is the campus operating today?" Yes / No.
  - If **No** (holiday): all 8 sections collapse; only a `holiday_reason` text box remains; Submit button label changes to "Submit holiday notice".
- **Submission status badge**: NEW / DRAFT / SUBMITTED / PM_REVIEW / SENT_BACK / SIGNED_OFF / LOCKED / RETRACTED.
- **Sent-back banner** (if status = SENT_BACK): shows reason code + reason text.

Then 8 numbered sections (see §1.3) plus a reserved Section 9 for the PM remark.

Footer (sticky):
- **Submit for PM review** button — disabled until all required fields filled.
- **Retract (Xm XXs)** button — visible only if status = SUBMITTED and within 30 min of submitted_at and PM hasn't acted yet.
- **Missing list** — shows up to 2 of the first missing fields and "+N more" if there's a backlog.

### 1.3 Form sections — every metric

**Pre-section: Day type**

| Metric ID | Label | Type | Required | Source |
|---|---|---|---|---|
| `daily.day_type.is_holiday` | Is campus operating today? | boolean | false | manual |
| `daily.day_type.holiday_reason` | Holiday reason (optional) | text | false | manual |

**Section 2 — Attendance Heartbeat**

| Metric ID | Label | Type | Req. | Source |
|---|---|---|---|---|
| `daily.attendance.present` | Students present | numeric | ✓ | auto 16:00 |
| `daily.attendance.total_enrolled` | Students total | numeric | ✓ | auto 16:00 |
| `daily.faculty.present` | Faculty present | numeric | ✓ | auto 16:00 |
| `daily.faculty.expected` | Faculty total | numeric | ✓ | auto 16:00 |
| `daily.attendance.success_coaches_present` | Success coaches present | numeric | ✓ | auto 16:00 |
| `daily.attendance.success_coaches_total` | Success coaches total | numeric | ✓ | auto 16:00 |
| `daily.attendance.program_ops_present` | Program ops present | numeric | ✓ | auto 16:00 |
| `daily.attendance.program_ops_total` | Program ops total | numeric | ✓ | auto 16:00 |
| `daily.attendance.absent_authorized` | Absent — authorised | numeric | ✓ | manual |
| `daily.attendance.absent_unauthorized` | Absent — unauthorised | numeric | ✓ | manual |

**Section 3 — Academic Delivery**

| Metric ID | Label | Type | Req. | Source |
|---|---|---|---|---|
| `daily.academic.sessions_conducted` | Classes held | numeric | ✓ | auto 16:00 |
| `daily.academic.sessions_scheduled` | Classes scheduled | numeric | ✓ | auto 16:00 |
| `daily.academic.cancellation_reason` | Sessions cancelled — primary reason | enum (faculty_absent / infra_issue / holiday / student_absence / other) | — | manual |
| `daily.academic.cancellation_notes` | Cancellation notes | text | ✓ if reason=other | manual |

**Section 4 — Faculty Status**

| Metric ID | Label | Type | Req. | Source |
|---|---|---|---|---|
| `daily.faculty.absent_count` | Faculty absent today | numeric | ✓ | auto 16:00 |
| `daily.faculty.replacement_assigned` | Replacement assigned | enum (yes / partial / no) | — | manual |
| `daily.faculty.absences_exceeding_sop` | Absences exceeding 2-day SOP | numeric | ✓ | manual |
| `daily.faculty.substitution_notes` | Substitution notes | text | — | manual |

**Section 5 — Infrastructure Check** (banner: "Visual check from your 9 AM walk-through. All manual.")

| Metric ID | Label | Type | Req. | Source |
|---|---|---|---|---|
| `daily.infra.wifi_status` | Wi-Fi / ISP / bandwidth | enum (ok / degraded / down) | ✓ | manual |
| `daily.infra.av_status` | TV / AV in classrooms | enum (ok / partial / down) | ✓ | manual |
| `daily.infra.av_notes` | AV notes | text | — | manual |
| `daily.infra.cleanliness_status` | Cleanliness | enum (ok / issues) | ✓ | manual |
| `daily.infra.cleanliness_notes` | Cleanliness notes | text | — | manual |
| `daily.infra.electricity_status` | Electricity / UPS / generator | enum (ok / backup_engaged / down) | ✓ | manual |
| `daily.infra.power_status` | Power (main supply) | enum (normal / outage_brief / outage_extended / unstable) | ✓ | manual |
| `daily.infra.water_status` | Water | enum (normal / intermittent / unavailable) | ✓ | manual |
| `daily.infra.connectivity_status` | Connectivity (campus network) | enum (normal / degraded / down) | ✓ | manual |
| `daily.infra.open_issues` | Other open infra issues | text | — | manual |

**Section 6 — Student-Facing Operations**

| Metric ID | Label | Type | Req. | Source |
|---|---|---|---|---|
| `daily.student_ops.hostel_issues_count` | Hostel issues | numeric | ✓ | auto |
| `daily.student_ops.transport_incidents_count` | Transport incidents | numeric | ✓ | auto |
| `daily.student_ops.escalations_opened` | Escalations opened | numeric | ✓ | auto |
| `daily.student_ops.escalations_closed` | Escalations closed | numeric | ✓ | auto |
| `daily.student_ops.mess_status` | Mess service | enum (served / delayed / not_served) | ✓ | manual |
| `daily.student_ops.transport_status` | Transport | enum (normal / delayed / partial / unavailable) | ✓ | manual |
| `daily.student_ops.other_notes` | Other notes | text | — | manual |

**Section 7 — Incidents & Safety** *(access-restricted; banner: "Each Yes auto-routes to HR + designated owner. Be specific. Do not name parties.")*

| Metric ID | Label | Type | Req. | Source |
|---|---|---|---|---|
| `daily.incidents.posh_pocso` | PoSH / PoCSO concern | boolean | ✓ | manual |
| `daily.incidents.posh_pocso_text` | Context | text | ✓ if true | manual |
| `daily.incidents.anti_ragging` | Anti-ragging / bullying | boolean | ✓ | manual |
| `daily.incidents.anti_ragging_text` | Context | text | ✓ if true | manual |
| `daily.incidents.safety_on_campus` | Safety incident on campus | boolean | ✓ | manual |
| `daily.incidents.safety_text` | Context | text | ✓ if true | manual |
| `daily.incidents.parent_complaint` | Parent complaint escalated | boolean | ✓ | manual |
| `daily.incidents.parent_complaint_text` | Context | text | ✓ if true | manual |
| `daily.incidents.ceo_visible` | CEO-visible incident | boolean | ✓ | manual |
| `daily.incidents.ceo_visible_text` | Context | text | ✓ if true | manual |
| `daily.incidents.count` | Total incident count today | numeric | ✓ | manual |
| `daily.incidents.summary` | Aggregate incident summary | text | ✓ if count > 0 | manual |

**Section 8 — BOA Remark**

| Metric ID | Label | Type | Req. | Source |
|---|---|---|---|---|
| `daily.remark.boa` | Additional context for PM | text | — | manual |

**Section 9 — PM Remark (read-only for BOA)**

Populated by PM at sign-off (see §3). The BOA sees a placeholder: "Reserved for PM. Submit your sections first — PM completes this at review."

### 1.4 Submission state machine

```
NEW ──first PATCH──▶ DRAFT
                     │
                     │ POST /submit
                     ▼
                  SUBMITTED ──30-min retract window──▶ DRAFT
                     │
                     │ (PM opens detail; status remains SUBMITTED;
                     │  some queries treat it as PM_REVIEW)
                     ▼
                  PM_REVIEW
                  ┌──┴──┬─────────────┐
   POST /sign-off │     │ POST/send-back│  18:30 IST timeout (system)
                  ▼     ▼               ▼
            SIGNED_OFF  SENT_BACK     SIGNED_OFF (auto_signed_off=true)
                  │       │
        EOD lock  │       │ BOA edits + POST /submit
                  ▼       ▼
              LOCKED   SUBMITTED (revision++)
```

**Allowed transitions:**
- NEW → DRAFT — on first value PATCH.
- DRAFT / NEW / SENT_BACK → SUBMITTED — via `POST /api/ops-os/submissions/{id}/submit`.
- SUBMITTED → DRAFT — via `POST /retract` within 30 min AND no PM action yet.
- SUBMITTED / PM_REVIEW → SIGNED_OFF — via `POST /sign-off` (PM).
- SUBMITTED / PM_REVIEW / SENT_BACK → SENT_BACK — via `POST /send-back` (PM); `sent_back_count++`.
- SUBMITTED / PM_REVIEW → SIGNED_OFF (auto) — by 18:30 IST worker; `auto_signed_off=true`; non-response counter increments.
- SIGNED_OFF → LOCKED — by EOD lock worker (`fn_prevent_modify_signed_off` trigger then blocks any value write).

### 1.5 APIs called from the page

| Method + Path | Trigger | Body | Effect |
|---|---|---|---|
| `+page.server.ts load()` | Page load / campus switch | — | Resolves user's campus, finds-or-creates today's submission, loads all `submission_value` rows. |
| `PATCH /api/ops-os/submissions/{id}/values/{metric_id}` | Field blur (debounced 700 ms; also fires immediately on blur) | `{ value, value_type, idempotency_key }` | Upserts the value; bumps status NEW → DRAFT; if prior was `source_kind='auto_fill'` and new differs by ≥ threshold, inserts `edit_event` + `edit_triage_state`. |
| `POST /api/ops-os/submissions/{id}/submit` | Click "Submit for PM review" | `{ idempotency_key }` | Validates all required filled. Transitions to SUBMITTED. Emits `submission.submitted` event. Fires `notifyPmsOnSubmission()` + `notifyOnIncidents()` if any Section 7 flag is true. |
| `POST /api/ops-os/submissions/{id}/retract` | Click "Retract (Xm XXs)" | `{ idempotency_key }` | Allowed only if status=SUBMITTED, within 30 min, no PM event in `event_log`. Returns 409 with reason (`wrong_status` / `window_closed` / `pm_already_reviewing`) otherwise. Status → DRAFT; `submitted_at`/`submitted_by` cleared. Fires `notifyPmsOnRetract()`. |

### 1.6 Auto-save behaviour

- Every field blur → PATCH (debounced 700 ms; raw blur bypasses debounce).
- Idempotency key: `boa.save.{submission_id}.{metric_id}.{Date.now()}`.
- First successful PATCH transitions NEW → DRAFT.
- UI shows "Saved" badge for 3 s after each success; "Save failed — {reason}" on failure.
- Refresh-safe: reload page → values re-hydrate from DB.

### 1.7 Validation rules

- **If `is_holiday = true`:** validation skipped entirely; only `daily.day_type.holiday_reason` (optional) and submit are available.
- **Otherwise:**
  - All metrics marked `is_required = true` must be set.
  - For each yes-no in Section 7 set to `true`, its `_text` follow-up must be non-empty.
  - If `daily.incidents.count > 0`, `daily.incidents.summary` must be non-empty.
  - `daily.academic.cancellation_notes` required only when `daily.academic.cancellation_reason = 'other'`.
- Validation is frontend-only (the Submit button is disabled until clean). Server `transitionToSubmitted()` does not re-validate.

### 1.8 Retraction flow

Window = 30 minutes after `submitted_at`. Conditions checked server-side:

1. `status = SUBMITTED`.
2. `now() - submitted_at ≤ 30 min`.
3. No event in `ops_os.event_log` of type `submission.signed_off` or `submission.sent_back` for this submission.

If any check fails → HTTP 409 with `reason ∈ {wrong_status, window_closed, pm_already_reviewing}`.

### 1.9 Auto-sign-off (18:30 IST)

Worker loop (`apps/worker/src/ops_os/auto_sign_off.ts`, every 5 min):

```sql
SELECT submission_id FROM ops_os.submission
 WHERE cadence = 'DAILY'
   AND period_end = today
   AND status IN ('SUBMITTED', 'PM_REVIEW')
   AND signed_off_at IS NULL
   AND now()::time AT TIME ZONE 'Asia/Kolkata' >= '18:30';
```

Per row:
1. `transitionToAutoSignedOff()` — status → SIGNED_OFF, `auto_signed_off = true`, `signed_off_by = NULL`, `pm_remark = "Auto-signed-off — PM did not respond"`, `is_late_sign_off = true`.
2. `UPDATE ops_os.user_campus_assignment SET non_response_count = non_response_count + 1, last_non_response_at = NOW() WHERE campus_id = ... AND role = 'PM' AND revoked_at IS NULL`.
3. `notifyOnAutoSignOff()` — three-way notification (BOA info / PMs warn / COS+ADMIN alert).

### 1.10 Notifications fired

| Trigger | Helper | Recipients | Source ID |
|---|---|---|---|
| BOA submit | `notifyPmsOnSubmission` | Assigned PMs + ADMIN opt-in | `OPSOS_SUBMIT_{sub_id}_{revision}` |
| Any Section 7 boolean = true | `notifyOnIncidents` | Cluster COS + all ADMIN/PROGRAM_OPS | `OPSOS_INCIDENT_{sub_id}` |
| BOA retract | `notifyPmsOnRetract` | Assigned PMs (in-app only) | `OPSOS_RETRACT_{sub_id}_{revision}` |
| Auto sign-off | `notifyOnAutoSignOff` | BOA (info) + PMs (warn) + COS/ADMIN (alert) | `OPSOS_AUTOSIGNOFF_{role}_{sub_id}[_{uid}]` |

### 1.11 Reminders BOA receives

- **`boa_submit_due_soon`** at 15:30 IST (15-min window). Title: "Daily report due in 30 min · {campus}". Sent to BOAs whose submission for today is NEW / DRAFT / SENT_BACK. Dedup via `ops_os.reminder_dispatch (kind, period_start, recipient_user_id, campus_id)`.

### 1.12 Edge cases

- **First load of the day:** server-side `findCurrentSubmission()` returns nothing → `createSubmission()` inserts a NEW row atomically. Race-safe via UNIQUE on `(campus_id, cadence, period_start, period_end, revision)`.
- **Already submitted:** all inputs `disabled`. Retract button visible only inside the 30-min window. Submit button hidden.
- **Holiday day:** sections collapse; submit label changes to "Submit holiday notice"; validation skipped; PM sees a HOLIDAY badge.
- **Sent-back resubmit:** same submission row is reused; `sent_back_count` stays on the new revision; banner with reason shows until BOA edits + resubmits.
- **Concurrent edits in two tabs:** each PATCH is its own idempotency key. Last write wins on conflict (`ON CONFLICT DO UPDATE`).
- **Threshold breach:** if BOA overwrites an `auto_fill` value by more than the metric's `threshold_value`, an `edit_event` row is inserted with `threshold_breach = true`, opening an `edit_triage_state` for review.

### 1.13 Tables read / written

**Written:** `ops_os.submission`, `ops_os.submission_value`, `ops_os.event_log`, `ops_os.edit_event`, `ops_os.edit_triage_state`, `ops_os.user_campus_assignment.non_response_count` (auto-sign-off only), `public.notifications`, `ops_os.reminder_dispatch`.

**Read:** `ops_os.campus_dim`, `ops_os.user_campus_assignment`, `ops_os.metric_dim`, `public.users`.

---

## 2. PM Inbox — `/ops-os/pm-inbox`

The PM's morning landing page. Curated view of "what needs your attention today".

### 2.1 Purpose & users

- **Primary:** PM, PMA (campus-scoped), COS (cluster-scoped), ADMIN / PROGRAM_OPS (global).
- **Read-only.** All sign-off / send-back actions happen in the Review Queue detail page.
- **Habit:** open in the morning, scan tiles, click into anything needing action.

### 2.2 UI layout

**Header card** — "What needs your attention" • "Across N campuses you cover" • today's date • Refresh button.

**Five summary tiles:**

| Tile | Color | What |
|---|---|---|
| **Awaiting your decision** | Blue | Count of submissions in SUBMITTED / PM_REVIEW. Sub-line: "Oldest: Xh ago" with color coding (<2 h green, 2-4 h amber, ≥4 h red). |
| **Sent back · waiting on BOA** | Amber | Count of SENT_BACK submissions awaiting BOA resubmit. |
| **Missing today** | Gray | Count of campuses without a SUBMITTED row for today. |
| **Signed off this week** | Emerald | Productivity counter; sub-line "Avg review: Xm" (PM's mean review time this week). |
| **Non-responses this month** | Red if >0, else gray | Count of auto-sign-offs against this PM (from `user_campus_assignment.non_response_count`). |

**Reminders banner** — shows if the PM received any reminder notifications today.

**Awaiting your decision table:**

| Column | Source |
|---|---|
| Campus | `campus_dim.display_name` + `code` |
| Period | `submission.period_start` |
| Submitted | absolute time |
| Waiting | relative; color age-coded |
| Action | "Review →" link to `/ops-os/review/{id}` |

Empty state: "🎉 Nothing waiting on you right now."

**Missing today** — table of campuses with NO_SUBMISSION / DRAFT / NEW for today.

**Sent back, waiting on BOA** — conditional table (only renders if count > 0). Columns: Campus / Period / Reason / Send-backs (count) / Sent back (relative time).

### 2.3 Filters & controls

- No date picker — defaults to today (IST).
- No campus filter — implicit by role:
  - PM/PMA → `user_campus_assignment` (role=PM, revoked_at IS NULL).
  - COS → cluster campuses via `cluster_dim.cos_user_id`.
  - ADMIN/PROGRAM_OPS → all active campuses.
- Refresh button — triggers `invalidateAll()`.

### 2.4 APIs

Single server-side load via `+page.server.ts` (no client fetches):

1. Resolve campus IDs (per-role logic above).
2. `listSubmissions()` filtered to `cadence='DAILY'`, `period_start=today`, scoped campus_ids.
3. Aggregates computed inline:
   - Avg review time → join on `event_log` for `submission.submitted` and `submission.signed_off`, this week.
   - Non-response count → sum of `user_campus_assignment.non_response_count` for current user.
   - Signed-off count → submissions where `signed_off_by = user_id`, this week.
   - Reminder count → `reminder_dispatch` rows for today.

### 2.5 Tables read

`ops_os.submission`, `ops_os.campus_dim`, `ops_os.user_campus_assignment`, `ops_os.cluster_dim`, `ops_os.event_log`, `ops_os.reminder_dispatch`, `public.users` (fallback for university derivation).

### 2.6 Linkage

| Click | Goes to |
|---|---|
| Row in "Awaiting your decision" | `/ops-os/review/{submission_id}` (detail + action) |
| Row in "Sent back" | `/ops-os/review/{submission_id}` (read-only until BOA resubmits) |
| "Go to full queue →" | `/ops-os/review` (full filterable queue) |
| "Review assignment" (if any auto-sign-offs) | `/ops-os/access-rights` |

---

## 3. PM Review Queue — `/ops-os/review` + `/ops-os/review/[id]`

The PM's main work surface — the queue list **and** the detail page where sign-off / send-back actually happen.

### 3.1 List page (`/ops-os/review`)

#### 3.1.1 UI layout

Header card with title "PM Review — Submissions awaiting decision" and Refresh button.

**Four summary tiles:**

| Tile | Color | Counts |
|---|---|---|
| **In view** | Gray | Total rows matching current filters |
| **Awaiting you** | Blue | SUBMITTED + PM_REVIEW + SENT_BACK |
| **Sent back · waiting on BOA** | Amber | SENT_BACK only |
| **Late submissions** | Red | `is_late_submission OR is_late_sign_off` |

**Filter row:**

1. **View dropdown**: "Awaiting me (SUBMITTED / IN REVIEW / SENT BACK)" [default] OR "All submissions".
2. **Date dropdown**: "Today {date}" [default] / "Last 7 days" / "All dates" / "Custom date…".
3. **Custom date picker** — appears when "Custom date…" selected.
4. **Campus dropdown** — only if user has ≥2 campuses.

URL params: `?status=&scope=&date=&campus=`. Changing any filter calls `goto()` + `invalidateAll()`.

**Queue table** columns:

| Column | Notes |
|---|---|
| Campus | name + code |
| Status | Badge color-coded by status (blue=SUBMITTED/IN REVIEW, amber=SENT BACK, green=SIGNED OFF, violet=LOCKED, gray=NEW/DRAFT) |
| Period | `period_start` |
| Submitted | Relative time |
| Send-backs | Count; amber highlight if >0 |
| Rev | Revision number (v1, v2, …) |
| Action | "Review →" (if actionable) OR "View" (if read-only) |

Row click → `/ops-os/review/{submission_id}` (only if actionable; read-only rows get the "View" affordance).

Late indicator — small "late" pill appended to the status badge for `is_late_submission` rows.

Empty states:
- "Awaiting me" + zero rows → "🎉 Queue is clear — No submissions are awaiting your decision."
- "All submissions" + zero rows → "No submissions match the current filters."

#### 3.1.2 Filters

| Filter | Values |
|---|---|
| **status** | `awaiting_me` (default) → SUBMITTED + PM_REVIEW + SENT_BACK; `all` → everything |
| **scope** | `today` (default) / `7d` / `all` / `custom` |
| **date** | YYYY-MM-DD (only when `scope=custom`) |
| **campus** | `all` (default) or specific UUID |

#### 3.1.3 APIs & tables

Server-side load only:

1. Resolve campus IDs by role (same logic as PM Inbox).
2. `listSubmissions({ cadence: 'DAILY', statuses, campus_id, period_start_from, period_start_to })`.

Tables read: `ops_os.submission`, `ops_os.campus_dim`, `ops_os.user_campus_assignment`.

### 3.2 Detail page (`/ops-os/review/[id]`)

This is **the** page where PMs sign off / send back.

#### 3.2.1 Header

- Title: "PM Review · DAILY|WEEKLY|MONTHLY".
- Campus name + code; status badge + late indicator on the right.
- Period start.
- Four quick-stats tiles: Submitted (time) · Revision (vN) · Send-backs (count) · Signed off (time).

#### 3.2.2 Contextual status banner (one of)

| Condition | Banner |
|---|---|
| Action available (SUBMITTED / PM_REVIEW) | Blue: "Awaiting your decision — Review the fields below, then sign off or send back at the bottom." |
| Status = DRAFT / NEW | Gray: "BOA is still drafting — This submission has not been handed off to PM yet." |
| Status = SENT_BACK | Amber: "Waiting for BOA to re-submit — You already sent this back." |
| Status = SIGNED_OFF | Green: "Already signed off — No further PM action required." |
| Status = LOCKED | Green: "Locked — period closed — This submission is sealed and immutable." |
| Status = RETRACTED | Gray: "Retracted by BOA — The BOA pulled this submission back." |

#### 3.2.3 Conditional secondary banners

- **Holiday banner** (if `daily.day_type.is_holiday = true`): "🏖 Campus marked today as a HOLIDAY · {reason}".
- **Incidents banner** (if any Section 7 boolean = true OR `daily.incidents.count > 0`): "⚠ Incidents flagged today — Read Section 7 carefully before signing off."
- **Previous PM remark** (if `submission.pm_remark` populated): Green block with the remark text.
- **Sent-back banner** (if status = SENT_BACK): Amber, shows `sent_back_reason_code` + `sent_back_reason_text`.

#### 3.2.4 Data sections — read-only view of the 8 BOA sections

Same 8 sections from §1.3 displayed read-only. Each section card shows:

- Section header (Section X, title).
- Field name + value rendered by type (pair / pills / yes-no / text).
- Section 6 (Incidents) gets a red border if any flag is set.

If holiday flag is set, sections collapse and a "Holiday — no data filled" placeholder appears.

#### 3.2.5 Sticky decision footer (only if `canAct = true`)

Pinned to bottom of viewport, blurred dark background, blue top border.

**Neutral state:** "Decision required" + two buttons:
- **Send back** (amber)
- **Sign off →** (emerald, primary)

**Sign-off state** (after clicking "Sign off →"):
- Textarea labeled "PM remark (required, visible in audit log)".
- Placeholder: "e.g. Verified incident handling, infra cleared, counts reconciled."
- "Confirm sign-off" disabled until `pm_remark.trim().length > 0`.
- "Cancel" returns to neutral.

**Send-back state** (after clicking "Send back"):
- Dropdown: `missing_field` (default) / `data_inconsistency` / `needs_clarification` / `other`.
- Optional textarea (required only if reason = `other`).
- "Confirm send-back" disabled until validation passes.

#### 3.2.6 Actions

**Sign-off:** `POST /api/ops-os/submissions/{id}/sign-off`

```json
{
  "pm_remark": "...",
  "idempotency_key": "pm.signoff.{submission_id}.{timestamp}"
}
```

Server effects: `transitionToSignedOff()` — sets status, signed_off_by, signed_off_at, pm_remark. Emits `submission.signed_off`. Calls `notifyBoaOnSignOff()`.

**Send-back:** `POST /api/ops-os/submissions/{id}/send-back`

```json
{
  "reason_code": "missing_field" | "data_inconsistency" | "needs_clarification" | "other",
  "reason_text": "optional unless reason_code='other'",
  "idempotency_key": "pm.sendback.{submission_id}.{timestamp}"
}
```

Server effects: `transitionToSentBack()` — sets status, sent_back_reason_code, sent_back_reason_text, `sent_back_count++`. Emits `submission.sent_back`. Calls `notifyBoaOnSendBack()`.

After either action: page reloads via `invalidateAll()`. Footer hides. Banner updates. BOA gets in-app + email notification.

#### 3.2.7 Notifications fired

| Action | Helper | Recipient | Tone |
|---|---|---|---|
| Sign off | `notifyBoaOnSignOff` | BOA (`submission.submitted_by`) | Success |
| Send back | `notifyBoaOnSendBack` | BOA | Warn (with reason text) |

Source IDs: `OPSOS_SIGNOFF_{sub_id}`, `OPSOS_SENDBACK_{sub_id}_{sent_back_count}`.

#### 3.2.8 Tables read / written

**Read:** `ops_os.submission`, `ops_os.submission_value`, `ops_os.event_log`, `ops_os.campus_dim`.

**Written:** `ops_os.submission` (status + signed_off_by / sent_back_reason_*), `ops_os.event_log`, `public.notifications`.

#### 3.2.9 Role-based access

- PM / PMA: can act only on submissions for campuses they're assigned to.
- COS: can act on any submission in their cluster.
- ADMIN / PROGRAM_OPS: can act on any submission globally.
- BOA / CMA / other: 403.

#### 3.2.10 Edge cases

- **Submission not found:** 404.
- **Permission denied:** 403.
- **No values populated:** sections render "—" for missing fields.
- **Action API fails:** error message in the footer textarea area (red text).
- **Holiday with no data:** sections hidden; banners + footer remain.

---

## 4. Operations Overview — `/ops-os/operations` + `/ops-os/operations/[id]`

COS / ADMIN read-only oversight surface. Health grid (daily) + rollups (weekly / monthly).

### 4.1 List page (`/ops-os/operations`)

#### 4.1.1 Cadence tabs

Three tabs at the top — **Daily** (default) / **Weekly** / **Monthly**. URL param `?cadence=`. Changing the tab re-runs `load()` against a different aggregator (see §4.1.4).

#### 4.1.2 Header card

- **Title** + cadence-specific subtitle:
  - Daily: "Daily campus health".
  - Weekly: "Weekly campus rollup".
  - Monthly: "Monthly campus rollup".
- **Date label** (daily: full date; weekly/monthly: `{period_start} → {period_end}`).
- **Completion ring** (right side): "Signed off N / Total" with circular SVG percentage indicator.
- **Refresh button.**

#### 4.1.3 Health tiles

**Daily view (6 tiles):**

| Tile | Source |
|---|---|
| Campuses | total count |
| In flight | SUBMITTED + PM_REVIEW + SENT_BACK + DRAFT + NEW |
| No submission | rows where no submission exists for today |
| Late | `is_late_submission` OR `is_late_sign_off` |
| Incidents | `daily.incidents.count > 0` |
| Infra issue | `has_infra_issue` (any infra metric in 'down' / 'unstable' / 'unavailable') |

**Weekly / Monthly view (6 tiles):**

| Tile | Source |
|---|---|
| Campuses | total |
| Signed-off days | `days_signed_off` aggregate |
| Reporting % | `(days_submitted + days_holiday) / days_in_range * 100` |
| Late days | `days_late_submission` |
| Total incidents | sum of `daily.incidents.count` over the period |
| Send-backs | sum of `sent_back_count` |

**Auto-signed-off banner** (daily only, if `dailySummary.autoSignedOff > 0`): "{N} campus(es) auto-signed-off — PM did not respond by 6:30 PM IST. Non-response counter incremented on assigned PMs." Link: "Review assignments →".

#### 4.1.4 Filters

**Daily view:**

- Date picker (defaults today).
- Campus dropdown.
- Status dropdown: All / NO_SUBMISSION / NEW / DRAFT / SUBMITTED / SENT_BACK / SIGNED_OFF / LOCKED.
- **Late only** checkbox.
- **Incidents only** checkbox.

**Weekly view:** `← Prev week` · Week-of date input · `Next week →` · Campus dropdown.

**Monthly view:** `← Prev month` · Month-picker (YYYY-MM) · `Next month →` · Campus dropdown.

#### 4.1.5 Health grid (daily view)

| Column | Source |
|---|---|
| Health dot (leftmost) | Emerald = signed_off; amber = warn (late, missing, single non-critical); red = incident / late+missing; zinc = no data |
| Campus | `campus_dim.display_name` + `code` |
| Status | Color-coded status badge + late badge + auto badge |
| Submitted | `submitted_at` time + relative |
| Signed off | `signed_off_at` time + relative |
| Inc. (Incidents) | `daily.incidents.count` (or "—") |
| Infra | "●" if `has_infra_issue` else "—" |
| SB (Send-backs) | `sent_back_count`; amber highlight if >0 |
| PM remark preview | First 80 chars of `pm_remark`, ellipsis if longer |
| Action | "Open →" (if submission_id exists) else "—" |

Row click → `/ops-os/operations/{submission_id}` (read-only drill-down).

#### 4.1.6 Period table (weekly / monthly view)

| Column | Source |
|---|---|
| Campus | name + code |
| Reported | `days_submitted / days_in_range`; sub-row "{N} missed" if `days_no_submission > 0` |
| Signed off | count (emerald) |
| Holiday | count (amber if >0) |
| Late | count (red if >0) |
| Sessions held | `total_sessions_held / total_sessions_scheduled`; sub-row "{X}% delivered" |
| Attendance | `avg_attendance_pct` |
| Incidents | sum; badge if >0 |
| Send-backs | sum; amber if >0 |

#### 4.1.7 APIs

Server-side load only:

- Daily: `getDailyOperationsOverview({ date, campus_ids, status, late_only, incident_only })` → returns one `DailyOpsRow` per campus.
- Weekly / Monthly: `getCampusPeriodOverview({ period_start, period_end, campus_ids })` → returns aggregate per campus.
- Period helpers: `weekBoundariesFromIstDate`, `monthBoundariesFromIstDate`, `currentWeekFull`, `currentMonthToDate`.

#### 4.1.8 Tables read

`ops_os.submission`, `ops_os.submission_value` (via EXISTS subqueries for incident/infra flags), `ops_os.campus_dim`.

#### 4.1.9 Empty / error states

- Daily with no matching rows → "🔍 No campuses match the current filters."
- Weekly/monthly with no submissions yet → "No daily submissions yet for {period}. Each campus row below shows 0 / {days_in_range} until BOAs start submitting reports."

### 4.2 Drill-down page (`/ops-os/operations/[id]`)

Read-only mirror of the PM Review detail page, **without** the action footer.

- Back link to `/ops-os/operations`.
- Header (campus + period + status + late/auto badges).
- Quick-stats tiles: Submitted · Signed off · Locked · Send-backs.
- Auto-signed-off banner (if `auto_signed_off = true`): "Auto-signed-off by system — PM did not respond by the 6:30 PM IST deadline. The assigned PM's non-response counter has been incremented."
- Same conditional banners as Review detail (holiday / incidents / previous PM remark / sent-back).
- Same 8 read-only data sections.

**New: Audit timeline section.** Vertical timeline showing every `event_log` row for the submission, chronological.

- Each event: name, actor (user name or "system"), ISO timestamp.
- Consecutive `submission.field_updated` events collapsed into "×N field updates".
- Color-coded dots (emerald = signed_off, amber = sent_back, blue = submitted, violet = locked, gray = retracted).
- Labels: "Draft created", "Field updated", "Submitted for PM review", "Returned for correction", "PM signed off", "Retracted by BOA", "Superseded by amendment".
- Payload extras:
  - `submission.sent_back` → "Reason: {reason_code}".
  - `submission.signed_off` with `transition='locked'` → "Transitioned to LOCKED".

### 4.3 Role scoping (whole module)

| Role | Daily / weekly / monthly | Drill-down |
|---|---|---|
| COS | Cluster campuses only | Cluster campuses only |
| ADMIN / PROGRAM_OPS | All campuses | All campuses |
| PM / PMA | Assigned campuses | Assigned campuses |
| BOA / CMA / other | 403 | 403 |

No actions on either Operations Overview page — sign-off / send-back happens only via `/ops-os/review/[id]`.

---

## 5. Ops Dashboard — `/ops-dashboard` (v1) + `/ops-dashboard/v2`

The KPI / analytics surface. Two coexisting versions: v1 (legacy, 14 named views) and v2 (the modern unified single-page dashboard with daily/weekly/monthly toggle).

### 5.1 Purpose & users

- **Primary:** ADMIN, PROGRAM_OPS (global view), COS (cluster-scoped).
- **Read-only.** No state changes; only data viewing + report dispatch.
- **Habit:**
  - Morning: scan overnight submissions, identify low-attendance / high-incident campuses.
  - Weekly: trend & peer comparison.
  - Monthly: strategic review + budget utilisation.

### 5.2 v2 panels

| # | Panel | What it shows | Source |
|---|---|---|---|
| 1 | **Hero Ring KPI** | Concentric rings — Attendance %, Completion %, Engagement % (coach-calls vs target). DeltaChip shows period-over-period change. | `getOpsTodaySummary` / `getOpsWeekSummary` / `getOpsMonthSummary` |
| 2 | **AI Copilot** | Gemini-generated summary — health, top/bottom performers, at-risk follow-up, 3 action items. | `runGeminiInsights()` |
| 3 | **Attendance Risk** (rose) | `at_risk_total` (students below 75 %), informed count, acknowledged count as stacked bars. | `ops_daily` |
| 4 | **Cancellations & Gaps** (amber) | Session + event cancellations + instructors on leave. Shows "active %". | `ops_daily` |
| 5 | **Trend Line** (weekly/monthly only) | Day-by-day sparkline of attendance % and completion %. | `getOpsDataRange` |
| 6 | **Sessions** | Donut: Completed / Cancelled / Remaining. Collapsible details of cancellation reasons by uni; holiday badges. | `getOpsSessionsByUniversity` |
| 7 | **Student Metrics** | Bar chart: Enrolled / Attended / Absent. Micro sparkline of attendance trend. | `getOpsAttendanceByUniversity` |
| 8 | **Success Coach Engagement** | Grouped bars: Student calls vs Parent calls. Summary tiles. | `getAllCoachDataForReport` |
| 9 | **Faculty Attendance & Coaches** | Per-university accordion with detailed status table (present/absent/training/WFH/leave/half-day + topics covered). | `getAllFacultyAttendanceForReport` |
| 10 | **Events & Exams** | Two donuts — Events (planned/executed/cancelled) and Exams (planned/completed). | `ops_daily` |
| 11 | **Actions Taken** | Follow-up on at-risk: % informed, % acknowledged. | `ops_daily` |
| 12 | **Budget & Proposals** | Event proposal aggregates: requested / approved / spent; by type + by university; avg utilisation; cost per participant. | `getOpsEventBudgetIntelligence` |
| 13 | **Tickets & Operations** | Task pattern metrics — frequency, completed, on-time, overdue. | `getOpsTaskPatterns` |
| 14 | **Remarks** | Daily: qualitative remarks as-is. Weekly/Monthly: top-5 most common remarks with frequency counts. | `ops_daily.remarks` |
| 15 | **Universities Ranking** (monthly) | Top-10 universities by attendance %; previous month + trend delta. | aggregates |

### 5.3 v2 data flow

Page load sequence (parallel where possible, serial where the next call depends on the previous):

1. **Critical path** (blocks render):
   - `GET /api/ops?view=overview&date=YYYY-MM-DD` → `{ today, week, month, universities }`.
   - `GET /api/ops?view=daily-reports&dateRange={today|week|month}&date=...` → per-university rows.
   - If weekly/monthly: `GET /api/ops?view=daily-reports&dateRange={week|month}&date=...` → day-by-day for trend chart.
2. **Background** (does not block):
   - Previous-period `overview` fetch → enables DeltaChip.
   - `GET /api/ops?view=event-intelligence&date=...&range={daily|weekly|monthly}`.
   - `GET /api/ops?view=task-patterns&date=...`.
   - `GET /api/ops?view=faculty-attendance&date=...&range={daily|weekly|monthly}`.

No polling. Manual refresh button + auto re-fire on date / mode change via `$effect`.

PgBouncer-aware retry: 600 ms + 400 ms back-off on transient connection errors.

### 5.4 v2 controls

- **Mode toggle:** Daily / Weekly / Monthly.
- **Date picker:**
  - Daily: date input + ±1 day + "Today".
  - Weekly: week-of input + ±7 days; range = `weekStart → weekEnd`.
  - Monthly: month picker + ±1 month; range = year + month.
- No university filter in v2 (the per-uni accordion replaces it).

### 5.5 v2 API endpoints consumed

| Endpoint | Returns |
|---|---|
| `GET /api/ops?view=overview` | `{ today, week, month, universities, date }` |
| `GET /api/ops?view=daily-reports&dateRange=&date=` | `{ reportData, todaySummary, weekCompliance, date, dateRange }` |
| `GET /api/ops?view=event-intelligence&date=&range=` | `{ events, aggregates }` (event_proposals) |
| `GET /api/ops?view=task-patterns&date=` | `{ patterns, byTeam }` |
| `GET /api/ops?view=faculty-attendance&date=&range=` | `{ byUniversity, detail, coach: { byUniversity, detail } }` |
| `POST /api/ops/send-report` | Queues email delivery (admin only) |
| `GET /api/ops/full-report` | HTML print-friendly report |
| `GET /api/ops/view-report` | Email-inline HTML |

### 5.6 v1 vs v2

| Aspect | v1 | v2 |
|---|---|---|
| Layout | 14 separate named views (tabs) | Single page with mode toggle |
| Primary KPI | Per-metric cards | Concentric rings with central attendance |
| Period-over-period | Not surfaced | DeltaChip on every KPI |
| Trend | Per-view weekly tables | Sparkline / line chart |
| University filter | Dropdown | Accordion drill-down |
| AI summary | Available via `AIInsightCard` | Integrated into hero |
| Loading | Serial per-view fetches | Critical-path serial + background parallel |
| Mobile | Limited | Fully responsive + dark mode |
| Data sources | Same — `ops_daily`, `instructor_attendance`, `coach_call`, `event_proposals`, `task_pattern` | Same |

### 5.7 Tables read by both versions

- `ops_daily` (v1 data store: sessions, attendance, at-risk, events, exams, coach/parent calls, instructor counts, remarks).
- `ops_os.submission` + `ops_os.submission_value` (v2-aware paths read this where applicable).
- `instructor_attendance` (faculty status by day).
- `coach_call` (success-coach activity).
- `event_proposals` (budget aggregates).
- `task_pattern` (ticket / task frequency).
- `ops_os.event_log` (audit replay).

### 5.8 Role scoping

| Role | Visibility | Actions |
|---|---|---|
| ADMIN / PROGRAM_OPS | Global | Sync, clear, send-report, view all 14 v1 views |
| COS | Cluster (filtered via `withReadOnlyUserContext`) | View only |
| PM | Their university (email reports filtered) | View only |
| BOA / others | Path-allowlist may permit a narrow read | — |

### 5.9 Empty / error handling

- No data for the chosen date → "No data available for this period" placeholder in center pane.
- API 500 → exponential back-off retry (600 ms + 1000 ms + 1400 ms) up to 2 retries before throwing.
- Background fetches (event-intel, task-patterns, faculty) silently fail; their panels render with null data.
- Gemini quota exhausted or `GEMINI_API_KEY` missing → AI panel falls back to empty / "unavailable" copy.

---

## 6. Reference tables

### 6.1 Submission state machine — full transition table

| From | To | Trigger | Side effects |
|---|---|---|---|
| (none) | NEW | First `/ops-os/report` load that day | `createSubmission()` inserts row |
| NEW | DRAFT | First `PATCH /values/{metric_id}` | Status flip; no notifications |
| DRAFT / NEW / SENT_BACK | SUBMITTED | `POST /submit` | `notifyPmsOnSubmission` + `notifyOnIncidents` (if applicable); `event_log` insert |
| SUBMITTED | DRAFT | `POST /retract` (within 30 min, no PM event) | `notifyPmsOnRetract`; `submitted_at` cleared |
| SUBMITTED / PM_REVIEW | SIGNED_OFF | `POST /sign-off` | `notifyBoaOnSignOff`; `event_log` insert |
| SUBMITTED / PM_REVIEW / SENT_BACK | SENT_BACK | `POST /send-back` | `notifyBoaOnSendBack`; `sent_back_count++`; `event_log` |
| SUBMITTED / PM_REVIEW | SIGNED_OFF (auto) | 18:30 IST worker | `notifyOnAutoSignOff`; `auto_signed_off=true`; PM non_response_count++ |
| SIGNED_OFF | LOCKED | EOD lock worker | `fn_prevent_modify_signed_off` trigger activates; no further writes |

### 6.2 Notification helper reference (all in `packages/shared/src/ops_os/notifications.ts`)

| Helper | Recipients | Source-ID pattern | Tone |
|---|---|---|---|
| `notifyPmsOnSubmission` | Assigned PMs + opt-in ADMIN | `OPSOS_SUBMIT_{sub}_{rev}` | info |
| `notifyBoaOnSendBack` | Submitting BOA | `OPSOS_SENDBACK_{sub}_{count}` | warn |
| `notifyBoaOnSignOff` | Submitting BOA | `OPSOS_SIGNOFF_{sub}` | success |
| `notifyPmsOnRetract` | Assigned PMs (in-app only) | `OPSOS_RETRACT_{sub}_{rev}` | info |
| `notifyOnIncidents` | Cluster COS + ADMIN | `OPSOS_INCIDENT_{sub}` | alert |
| `notifyOnAutoSignOff` | BOA + PMs + COS + ADMIN | `OPSOS_AUTOSIGNOFF_{role}_{sub}[_{uid}]` | mixed |
| `runReminder('boa_submit_due_soon')` | BOAs without SUBMITTED row | `OPSOS_REMINDER_BOA_SUBMIT_DUE_SOON_{date}_{uid}_{campus}` | info |
| `runReminder('pm_review_open')` | PMs with reports awaiting | `OPSOS_REMINDER_PM_REVIEW_OPEN_{date}_{uid}_{campus}` | info |
| `runReminder('pm_review_final')` | PMs still pending at 18:00 | `OPSOS_REMINDER_PM_REVIEW_FINAL_{date}_{uid}_{campus}` | warn |

### 6.3 API endpoint reference

| Endpoint | Method | Auth | Purpose |
|---|---|---|---|
| `/api/ops-os/submissions` | POST | `checkOpsOsAccess('create')` | Create a draft submission |
| `/api/ops-os/submissions/{id}` | GET | `checkOpsOsAccess('view')` | Read submission row |
| `/api/ops-os/submissions/{id}/values/{metric_id}` | PATCH | `checkOpsOsAccess('edit')` | Upsert metric value (autosave) |
| `/api/ops-os/submissions/{id}/submit` | POST | `checkOpsOsAccess('submit')` | DRAFT → SUBMITTED |
| `/api/ops-os/submissions/{id}/sign-off` | POST | `checkOpsOsAccess('sign_off')` | PM_REVIEW → SIGNED_OFF |
| `/api/ops-os/submissions/{id}/send-back` | POST | `checkOpsOsAccess('send_back')` | → SENT_BACK |
| `/api/ops-os/submissions/{id}/retract` | POST | `checkOpsOsAccess('edit')` (creator only) | SUBMITTED → DRAFT (within 30 min) |
| `/api/ops-os/submissions/{id}/events` | GET | `checkOpsOsAccess('view')` | Audit timeline |
| `/api/ops-os/submissions/list` | GET | `checkOpsOsAccess('view')` | Queue listing |
| `/api/ops-os/assignments/sync` | GET | ADMIN | Sync user-campus assignments |
| `/api/ops-os/operations/daily` | GET | `checkOpsOsAccess('view')` | Org-wide daily overview rows |
| `/api/ops/overview` | GET | session | Ops Dashboard v1/v2 overview |
| `/api/ops/full-report` | GET | session or token | HTML print report |
| `/api/ops/view-report` | GET | token | Inline email HTML |
| `/api/ops/send-report` | POST | ADMIN | Queue email dispatch |

### 6.4 Tables touched by the 5 features

**Submission spine:** `ops_os.submission`, `ops_os.submission_value`, `ops_os.metric_dim`, `ops_os.event_log`, `ops_os.edit_event`, `ops_os.edit_triage_state`.

**Campus / assignments:** `ops_os.campus_dim`, `ops_os.cluster_dim`, `ops_os.user_campus_assignment`.

**Notifications & reminders:** `public.notifications`, `ops_os.reminder_dispatch`.

**Legacy / dashboard data:** `ops_daily`, `instructor_attendance`, `coach_call`, `event_proposals`, `task_pattern`.

### 6.5 RLS rules (`ops_os.*`)

All RLS policies read `current_setting('app.current_user_id')` and `current_setting('app.current_user_role')` set per-request by `withReadOnlyUserContext()` / `withWriteUserContext()` wrappers.

| Predicate | Effect |
|---|---|
| `ops_os.is_network_role()` (ADMIN / PROGRAM_OPS / COS) | Sees everything (subject to cluster filter for COS) |
| `ops_os.user_can_see_campus(p_campus_id)` | True if network role OR COS-of-cluster OR PM/BOA assigned to campus |
| `section_7.*` metrics | Additional check: `role IN ('ADMIN', 'PROGRAM_OPS', 'HR')` |

### 6.6 The PM daily-workflow — one-page summary

| Time | What PM does | Where | What system does behind the scenes |
|---|---|---|---|
| 09:00 | Opens Inbox | `/ops-os/pm-inbox` | Loads campus scope, today's submissions, aggregates |
| 10:00 | Clicks "Awaiting your decision" row | `/ops-os/review/{id}` | Loads submission + values + events |
| 10:05 | Reads 8 sections | (same page) | — |
| 10:10 | Clicks Sign off → fills remark → confirms | `POST /sign-off` | Status → SIGNED_OFF; BOA notified |
| 10:15 | OR clicks Send back → picks reason → confirms | `POST /send-back` | Status → SENT_BACK; BOA notified |
| 12:00 | Returns to Review Queue | `/ops-os/review` | Defaults to today + Awaiting me |
| 15:00 | Checks Operations Overview (if COS) | `/ops-os/operations` | Daily grid + filters |
| 16:30 | Receives `pm_review_open` reminder | email + in-app | Worker fires |
| 18:00 | Receives `pm_review_final` reminder | email + in-app | Worker fires; last call before auto-sign-off |
| 18:30 | Anything still pending → auto-sign-off | (system) | `notifyOnAutoSignOff` fires three-way; PM non_response_count++ |
| 19:00+ | EOD lock | (system) | SIGNED_OFF → LOCKED for today's submissions |

---

*End of document.*
