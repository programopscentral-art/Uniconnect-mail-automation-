# UniConnect Ops Daily Data Entry Guide

## Overview
This sheet captures daily operational data for each university. One row = one university per day. Fill this sheet every working day and upload/sync it to the UniConnect dashboard.

---

## Sheet Headers & What to Fill

| # | Column Header | Data Type | Required? | What to Fill |
|---|--------------|-----------|-----------|--------------|
| 1 | **Date** | Date (YYYY-MM-DD) | YES | The date this data is for. Format: `2026-04-07`. Use one consistent format across all rows. |
| 2 | **University Name** | Text | YES | The exact university name. **Use the same spelling every time** — do NOT alternate between spellings (e.g. always use "Chalapathi", not sometimes "Chalapathy"). See approved list below. |
| 3 | **Sessions Planned** | Number | YES | How many teaching/lecture sessions were scheduled for the day. If it's a holiday, write `0` and put "Holiday" in the Cancellation Reason column. |
| 4 | **Sessions Completed** | Number | YES | How many of the planned sessions were actually conducted. Must be <= Sessions Planned. |
| 5 | **Sessions Cancelled** | Number | YES | How many sessions were cancelled. Sessions Planned = Sessions Completed + Sessions Cancelled (they should add up). |
| 6 | **Cancellation Reason** | Text | If cancelled | Why sessions were cancelled. Examples: "Holiday", "Faculty unavailable", "Technical issues", "University exam day", "Low attendance". Leave blank if no cancellations. |
| 7 | **Enrolled** | Number | YES | Total number of students enrolled/registered in active batches at this university. This is the total pool size, not daily attendance. |
| 8 | **Attended** | Number | YES | Number of students who actually attended sessions today. Must be <= Enrolled. Attendance % is calculated as (Attended / Enrolled) x 100. |
| 9 | **Coach Calls** | Number | YES | Total coaching/mentoring calls made by coaches to students today. Count each individual call. |
| 10 | **Parent Calls** | Number | YES | Total calls made to parents/guardians today. Count each individual call. |
| 11 | **Instructors Total** | Number | YES | Total number of instructors assigned/deployed at this university. This is the full team size. |
| 12 | **Instructors On Leave** | Number | YES | How many instructors were on leave today. Active instructors = Total - On Leave. |
| 13 | **Events Planned** | Number | YES | Number of events, workshops, webinars, or activities planned for the day. Put `0` if none. |
| 14 | **Events Executed** | Number | YES | Number of planned events that were actually conducted. Must be <= Events Planned. |
| 15 | **Events Cancelled** | Number | YES | Number of events that were cancelled. Events Planned = Events Executed + Events Cancelled + Events Pending. |
| 16 | **Exams Planned** | Number | YES | Number of exams, tests, or assessments scheduled for the day. Put `0` if none. |
| 17 | **Exams Completed** | Number | YES | Number of exams actually conducted. Must be <= Exams Planned. |
| 18 | **Post Exam Comms Sent** | Number | YES | Number of post-exam result/feedback communications sent to students (email, WhatsApp, SMS). Put `0` if no exams happened. |
| 19 | **At Risk Total** | Number | YES | Total number of students currently identified as at-risk (poor attendance, failing grades, disengaged). This is a running count, not just new ones. |
| 20 | **At Risk Informed** | Number | YES | How many at-risk students were personally contacted/informed/counselled today. Must be <= At Risk Total. |
| 21 | **Acknowledgments** | Number | YES | Number of parent acknowledgment responses received (parents confirming they received the at-risk communication). |
| 22 | **Remarks** | Text | Optional | Any additional context: special circumstances, holidays, exam periods, notable achievements, issues faced. |

---

## Approved University Names

Use EXACTLY these names. Do not create variations, abbreviations, or alternate spellings.

| Correct Name | Common Wrong Spellings (DO NOT USE) |
|-------------|-------------------------------------|
| Chalapathi | Chalapathy, CHALAPATHI, CHALAPATHY |
| Crescent | Cresent, CRESCENT, cresent |
| CIET/CITY | CITY/CIET, Ciet/City, City & Ciet |
| Yenapoya | yenapoya, YENAPOYA |

If your university is not in the dropdown list on the dashboard, contact the admin team to get it added. Do not invent new names.

---

## Rules & Validation

### Numbers must add up:
- `Sessions Completed + Sessions Cancelled <= Sessions Planned`
- `Events Executed + Events Cancelled <= Events Planned`
- `Exams Completed <= Exams Planned`
- `Attended <= Enrolled`
- `Instructors On Leave <= Instructors Total`
- `At Risk Informed <= At Risk Total`

### Zero is a valid answer:
If nothing happened in a category, put `0` — do NOT leave the cell blank. Blank cells may be misread as missing data.

### One row per university per day:
Do not create multiple rows for the same university on the same date. If you need to update, overwrite the existing row.

### Date format:
Use `YYYY-MM-DD` (e.g., `2026-04-07`). Do not use `DD/MM/YYYY` or `MM/DD/YYYY` — these will be parsed incorrectly.

### Holidays:
On holidays, set Sessions Planned = `0`, Sessions Completed = `0`, and put "Holiday" in the Cancellation Reason column. Still fill Enrolled (it doesn't change) and any other applicable fields.

---

## How This Data Is Used

| Dashboard Section | Fields Used |
|------------------|-------------|
| **Session Delivery** | Sessions Planned, Completed, Cancelled, Cancellation Reason |
| **Attendance** | Enrolled, Attended (calculates attendance %) |
| **Instructor Overview** | Instructors Total, On Leave (calculates active count) |
| **Events Tracking** | Events Planned, Executed, Cancelled (shows pending) |
| **Exam Tracking** | Exams Planned, Completed, Post Exam Comms Sent |
| **At-Risk Management** | At Risk Total, At Risk Informed, Acknowledgments |
| **Calls & Engagement** | Coach Calls, Parent Calls |
| **Weekly Email Report** | ALL fields — sent every Monday to management |
| **Monthly Email Report** | ALL fields — sent on 1st of each month |
| **University Rankings** | Calculated from session completion %, attendance %, at-risk response rate |

---

## Quick Checklist Before Uploading

- [ ] Every row has a Date in YYYY-MM-DD format
- [ ] University names match the approved list exactly
- [ ] No blank numeric cells (use 0 instead)
- [ ] Numbers add up correctly (completed + cancelled <= planned)
- [ ] Cancellation reasons filled for any cancelled sessions
- [ ] One row per university per day (no duplicates)
