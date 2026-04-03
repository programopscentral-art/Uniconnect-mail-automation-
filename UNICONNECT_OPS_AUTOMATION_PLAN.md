# UniConnect Operations Automation — Strategy Document

**Date**: April 2, 2026
**Prepared by**: Program Operations Central
**Status**: Planning Phase

---

## 1. THE PROBLEM

Today, operational data flows through Google Sheets. Every day, university ops teams manually fill a 30+ column spreadsheet with session counts, attendance numbers, event updates, and team activity. An admin then copies the CSV link into UniConnect's Ops Dashboard to load the data. This process is:

- **Slow** — data is always stale by the time it reaches the dashboard
- **Error-prone** — CSV parsing breaks on commas, newlines, and column shifts
- **Duplicated** — 70% of this data already exists inside UniConnect (events, tasks, communication logs, faculty records, exams)
- **Not scalable** — as we add universities, the manual effort multiplies

---

## 2. THE VISION

**Eliminate Google Sheets entirely. Make UniConnect the single source of truth.**

Every piece of operational data either gets auto-calculated from existing app activity OR captured through a focused 2-minute daily form (instead of a 30-column spreadsheet). Reports, analytics, and AI insights are generated automatically and delivered to management inboxes without anyone clicking a button.

```
BEFORE:
  Google Sheet (manual) → CSV copy → Paste URL → Click Load → View Dashboard → Click Download

AFTER:
  App activity auto-aggregated → Quick daily form (2 min) → Dashboard live → Reports auto-emailed at 6 PM
```

---

## 3. WHAT DATA ALREADY EXISTS IN UNICONNECT

These systems are already capturing data that the ops dashboard needs:

| System | What It Tracks | Ops Dashboard Metric It Feeds |
|--------|---------------|-------------------------------|
| **Schedule Events** | Events created per university with status (ACTIVE/COMPLETED), assignees, checklists | Events Planned, Events Executed, Events Cancelled |
| **Budget Proposals** | Event budgets — estimated vs actual spend, attendance, feedback, outcomes | Budget utilization, Event success metrics |
| **Tasks** | All tasks with multi-assignee tracking, start/complete timestamps, priority | Team productivity, Task completion rates |
| **Communication Tasks** | Coach calls, parent calls with completion tracking per university | Coach Calls, Parent Calls |
| **Faculty/Users** | All instructors mapped to universities, role-based access | Instructors Total per university |
| **Faculty Leave** | Leave requests with dates, approval status | Instructors on Leave |
| **Exam System** | Exam papers, exam plans with dates, seating arrangements | Exams Planned, Exams Completed |
| **Assessment Papers** | Question papers generated per subject/university | Exam activity tracking |

**Result**: ~70% of the ops dashboard data can be pulled automatically from existing tables.

---

## 4. WHAT'S NOT IN THE APP YET (Needs a Quick Daily Form)

These metrics require human judgment and can't be auto-calculated:

| Metric | Why It Needs Manual Input |
|--------|--------------------------|
| **Sessions Planned / Completed / Cancelled** | Sessions are managed in an external app (not UniConnect). Until API integration exists, ops team reports these daily. |
| **Students Enrolled / Attended** | Attendance is tracked in the external sessions app. Same as above. |
| **Cancellation Reason** | Requires context (e.g., "instructor sick", "power outage") |
| **At-Risk Students (total)** | Requires instructor judgment — not just attendance data |
| **At-Risk Students (informed)** | Whether at-risk students were contacted |
| **Parent Acknowledgments** | Whether parents responded to outreach |
| **Remarks / Observations** | Free-text daily notes about issues, wins, blockers |

**This becomes a focused daily form: 8-10 fields instead of 30+ columns in a Google Sheet.**

---

## 5. THE AUTOMATION ARCHITECTURE

### 5.1 Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     UNICONNECT APP                               │
│                                                                  │
│  AUTOMATIC (no human input)          DAILY FORM (2 min/day)     │
│  ┌────────────────────────┐         ┌────────────────────────┐  │
│  │ Events created/done    │         │ Sessions plan/done     │  │
│  │ Tasks completed/overdue│         │ Enrolled / Attended    │  │
│  │ Comm tasks completed   │         │ At-risk students       │  │
│  │ Faculty count & leave  │         │ Cancellation reasons   │  │
│  │ Exams scheduled/done   │         │ Remarks / observations │  │
│  │ Budget utilization     │         │                        │  │
│  └───────────┬────────────┘         └───────────┬────────────┘  │
│              │                                   │               │
│              └──────────┬────────────────────────┘               │
│                         ▼                                        │
│              ┌─────────────────────┐                             │
│              │  AGGREGATION ENGINE │                             │
│              │  Merges auto + form │                             │
│              │  → ops_daily_data   │                             │
│              └──────────┬──────────┘                             │
│                         │                                        │
│              ┌──────────▼──────────┐                             │
│              │    OPS DASHBOARD    │                             │
│              │  (real-time views)  │                             │
│              └──────────┬──────────┘                             │
│                         │                                        │
│         ┌───────────────┼───────────────┐                       │
│         ▼               ▼               ▼                       │
│  ┌────────────┐  ┌────────────┐  ┌────────────────┐            │
│  │  AI Report  │  │   Alerts   │  │  Email to      │            │
│  │  (Gemini)   │  │  (real-time)│  │  Management    │            │
│  └────────────┘  └────────────┘  └────────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Worker Scheduled Jobs

| Time | Job | What It Does |
|------|-----|-------------|
| Every sync | **Smart Alerts** | If attendance < 50% or sessions cancelled > 3 or missing daily form → push notification |
| 5:00 PM | **Form Reminder** | "You haven't submitted today's daily report" → push to ops teams who haven't filled the form |
| 6:00 PM | **Daily Report** | Auto-aggregate all data → Generate AI summary → Build HTML report → Email to admins |
| Sunday 10 AM | **Weekly Report** | Aggregate week's data → AI trends analysis → Email comprehensive weekly summary |
| 1st of month | **Monthly Report** | Full month overview → AI strategic recommendations → Email to senior management |

### 5.3 External API Hook (Future)

When the external sessions app is ready to send data:

```
External App → POST /api/ops/external-sync (API key auth)
             → { university, date, sessions_planned, sessions_completed, enrolled, attended }
             → Auto-updates ops_daily_data
             → Daily form no longer needs session/attendance fields
```

This is a future enhancement. The daily form handles this data until the API integration is ready.

---

## 6. ENHANCED ANALYTICS (AI-POWERED)

### 6.1 Task Intelligence

| Analysis | What It Shows | Business Value |
|----------|--------------|----------------|
| **Common Task Patterns** | Most frequently performed tasks across team and universities | Identify repetitive work → automate or streamline |
| **Unique/New Tasks** | Tasks that are novel — not matching common patterns | Spot innovation or emerging needs |
| **Completion Speed Comparison** | Person A finishes Task X in 2h, Person B takes 6h | Identify training needs, facilitate knowledge sharing |
| **Workload Distribution** | Who has too many tasks vs too few | Balance team capacity |
| **Efficiency Scoring** | Tasks completed on-time %, avg completion speed, streak | Performance benchmarking |

### 6.2 Event + Budget Intelligence

| Analysis | What It Shows |
|----------|--------------|
| **Budget Utilization** | Estimated vs actual spend per event, per university |
| **Event Success Metrics** | Actual attendance vs expected, feedback scores |
| **Problem Pattern Detection** | Which types of events face recurring issues |
| **ROI Analysis** | Cost per participant, per event category |

### 6.3 Team Intelligence

| Analysis | What It Shows |
|----------|--------------|
| **Individual Trends** | Performance trajectory over weeks/months |
| **Peer Comparison** | Side-by-side metrics for people doing similar work |
| **University Comparison** | Which campus teams are most efficient |
| **Communication Effectiveness** | Correlation between coach calls and attendance improvement |

### 6.4 Analytics Report (Auto-Generated)

A comprehensive analytics report generated weekly, containing:

1. **Team Performance Summary** — who excelled, who needs support
2. **Task Pattern Analysis** — common vs unique tasks, efficiency metrics
3. **Peer Comparison Charts** — visual side-by-side performance
4. **University Rankings** — operational efficiency by campus
5. **AI Recommendations** — specific actions for management

---

## 7. AI INTEGRATION

### 7.1 Current: Gemini AI (Recommended to Continue)

Already integrated and working for ops report insights. Recommended to expand usage.

| Use Case | Model | Cost Estimate |
|----------|-------|--------------|
| Daily ops report summary | Gemini 2.5 Flash | ~$0.002/day |
| Weekly analytics report | Gemini 2.5 Flash | ~$0.005/week |
| Monthly strategic report | Gemini 2.5 Flash | ~$0.01/month |
| Task pattern analysis | Gemini 2.5 Flash | ~$0.003/analysis |
| Natural language query (Phase 2) | Gemini 2.5 Flash | ~$0.001/query |
| **Total monthly cost** | | **$0.50 — $1.00** |

### 7.2 Why Gemini Over OpenAI

| Factor | Gemini | OpenAI |
|--------|--------|--------|
| Already integrated | Yes | No |
| Cost for our usage | ~$1/month | ~$2/month |
| Free tier available | Yes (15 RPM) | No |
| Quality for data analysis | Excellent | Slightly better |
| Speed (Flash models) | Very fast | Comparable (4o-mini) |
| Rate limits on paid | Generous | Generous |

**Decision**: Stay with Gemini. Add paid tier ($5 credit lasts 3-5 months).

### 7.3 Future: Natural Language Query Interface (Phase 2)

An AI chat interface where management can type questions like:

- "How did CDU perform last week?"
- "Which universities have the most at-risk students?"
- "Compare Zoya and Chandrakanth's task completion this month"
- "What events are planned for next week across all campuses?"

The AI queries the database, generates a natural language answer with relevant data, and presents it conversationally. This is the "one text gives entire info" vision.

---

## 8. AUTOMATED REPORTING FLOW

### Daily Report (Auto-generated at 6 PM)

```
6:00 PM IST
    │
    ▼
Worker runs aggregation for each university
    │
    ▼
Pulls auto-calculated metrics (events, tasks, comms, faculty, exams)
    │
    ▼
Merges with daily form data (sessions, attendance, at-risk)
    │
    ▼
Generates HTML report with:
    - Performance Overview KPIs
    - University Comprehensive Breakdown (table)
    - Key Observations (auto-detected alerts)
    - Team Activity & Productivity
    - Report Compliance Status
    - AI Executive Summary (8 sections)
    │
    ▼
Sends via email (SMTP) to admin distribution list
    │
    ▼
Stores in-app notification with link to full report
    │
    ▼
Push notification to admins: "Daily Ops Report ready — 96% sessions, 3 flags"
```

### Weekly Report (Sunday 10 AM)

Same flow but with:
- Week-over-week trend comparisons
- University ranking changes
- Top performers and those needing support
- AI strategic recommendations for the coming week

### Monthly Report (1st of month)

Same flow but with:
- Month-over-month trends
- Budget utilization summary across all events
- Comprehensive team analytics with peer comparisons
- AI quarterly outlook and strategic recommendations

---

## 9. COMPLIANCE & ACCOUNTABILITY

### Daily Form Submission Tracking

| Time | Action |
|------|--------|
| End of working day | Ops team fills quick daily form (2 minutes) |
| 5:00 PM | Push notification to anyone who hasn't submitted |
| 5:30 PM | Second reminder with escalation flag |
| 6:00 PM | Report generates with whatever data exists; missing forms flagged in red |
| In report | "COMPLIANCE: 14/16 universities submitted. Missing: Aurora, VGU" |

### Dashboard Visibility

- Real-time indicator: which universities have submitted today's form
- Historical compliance rate per university and per ops person
- Streak tracking: consecutive days of on-time submission

---

## 10. IMPLEMENTATION ROADMAP

### Phase 1: Foundation (Week 1-2)

| # | Task | Impact |
|---|------|--------|
| 1 | **Build auto-aggregation engine** — function that queries events, tasks, communication_tasks, faculty, exams and builds ops_daily_data rows | Eliminates ~70% of manual data entry |
| 2 | **Build quick daily form page** — focused form for session/attendance/at-risk data only | Replaces Google Sheet entirely |
| 3 | **Wire aggregation to form submission** — when form is submitted, merge with auto-data and upsert to ops_daily_data | Dashboard shows complete data |

### Phase 2: Automation (Week 2-3)

| # | Task | Impact |
|---|------|--------|
| 4 | **Add daily report worker job** — 6 PM scheduled aggregation + AI report + email delivery | No more manual report generation |
| 5 | **Add form submission reminders** — 5 PM notification for missing forms | Ensures data completeness |
| 6 | **Add smart alerts** — real-time notifications for critical thresholds | Proactive issue detection |

### Phase 3: Enhanced Analytics (Week 3-4)

| # | Task | Impact |
|---|------|--------|
| 7 | **Task pattern analysis** — common vs unique tasks, frequency analysis | Understand team work patterns |
| 8 | **Peer comparison engine** — same-task completion time comparison | Identify training/efficiency opportunities |
| 9 | **University comparison dashboard** — ranking with trends | Campus-level accountability |
| 10 | **Auto-generated analytics report** — weekly AI-powered team analysis | Management visibility into team performance |

### Phase 4: Advanced AI (Week 5+)

| # | Task | Impact |
|---|------|--------|
| 11 | **Event + budget intelligence** — ROI analysis, success metrics | Data-driven event planning |
| 12 | **Natural language query interface** — ask questions, get answers from data | Instant insights for management |
| 13 | **External API hook** — accept session/attendance data from external app | Full automation of remaining manual fields |

---

## 11. WHAT WE GET OUT OF THIS

### For Ops Teams (Daily Users)

- **2 minutes/day** instead of filling a 30-column Google Sheet
- No more CSV export/import hassles
- Real-time dashboard that's always up to date
- Clear daily checklist: fill form → done

### For Management (Report Consumers)

- **Automated daily report in inbox at 6 PM** — no asking for it
- AI-generated insights highlighting exactly what needs attention
- Week-over-week and month-over-month trends without manual compilation
- Smart alerts for critical issues — don't wait for the daily report
- Team performance analytics with actionable recommendations

### For the Organization

- **Single source of truth** — no more Google Sheet vs app discrepancies
- **Complete audit trail** — every data point traceable to who entered it and when
- **Scalable** — adding a new university means one more form user, not another spreadsheet tab
- **Data-driven decisions** — AI identifies patterns humans might miss
- **Accountability** — compliance tracking ensures everyone reports on time

### Cost

- **AI (Gemini)**: ~$1/month
- **Infrastructure**: No additional cost — runs on existing Railway deployment
- **Human time saved**: ~30 min/day across all universities × 20 working days = **~10 hours/month** of manual data entry eliminated

---

## 12. SUMMARY

| Aspect | Before (Google Sheets) | After (UniConnect Automated) |
|--------|----------------------|------------------------------|
| Data entry | 30+ columns in spreadsheet | 8-field quick form (2 min) |
| Data freshness | Hours old (manual upload) | Real-time (auto-aggregated) |
| Report generation | Manual download + share | Auto-emailed at 6 PM daily |
| AI insights | Click button, wait, sometimes fails | Auto-generated, always included |
| Analytics | Basic team view | AI-powered patterns, comparisons, recommendations |
| Compliance | No tracking | Real-time submission tracking + reminders |
| Scalability | New tab per university per day | Just works |
| Error rate | CSV parsing failures, column shifts | Zero — structured form input |
| Cost | Free (but expensive in human time) | ~$1/month AI + existing infrastructure |

---

*This document will be updated as implementation progresses.*
