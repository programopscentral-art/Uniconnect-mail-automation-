# NIAT Planner Module

Automated NIAT slot planning and APD 2.0 generation.

## Features
- **Robust Date Parsing**: Handles `dd/mm/yyyy` and `mm/dd/yyyy`.
- **Saturday Calculation**: 
  - `Every saturday`
  - `2,4` (2nd and 4th)
  - `1,3,5` (1st, 3rd, and 5th)
  - `0` (None)
- **Automatic Slot Counting**: Forward-fills slot numbers in Prod Sequence sheets and counts unique entries.
- **Derived Fields**: Calculates Total Working Days, NIAT Working Days, Net Executional Slots, and Weeks.
- **Buffer Analysis**: Identifies if a university schedule is feasible based on subject slot requirements.
- **Professional Export**: Generates a multi-sheet Excel with frozen panes, bold headers, and conditional formatting for warnings/errors.

## Architecture
- **FastAPI**: Backend engine for data processing.
- **Pandas**: Core data engineering and math.
- **Openpyxl**: High-fidelity Excel generation and formatting.
- **SvelteKit**: Integrated UI within the UniConnect dashboard.

## Setup & Running

### Backend
1. Navigate to `apps/niat-planner`.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Start the service:
   ```bash
   uvicorn api.main:app --reload --port 8000
   ```

### Frontend
The UI is automatically integrated into the UniConnect dashboard under the "NIAT Planner" menu item.

## Input Formats

### Calendar Sheet
Expects columns:
- `Universities`
- `Start Date`
- `End Date (Semster Last Day)`
- `Saturdays off`
- `Working days per Week`
- `Number of slots per day`
- `Public Holidays` (Count)
- `University Assessments Days` (Integer or Decimal)

### Prod Sequence Workbook
Expects multiple tabs (one per subject).
- Column 1: Topic
- Column 2: Topic (This column must contain the slot numbers)
- Forward-fill logic is applied to handle blank rows/merged cells.

## Subject Mapping
Configurable via the UI to map Tab names to APD subject codes (e.g. "Web Development-2" -> "WA2").
