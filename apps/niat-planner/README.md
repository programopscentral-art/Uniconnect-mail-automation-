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

## Configuration (Production)

The frontend requires an environment variable to communicate with the Python backend in production.

- **Variable**: `VITE_NIAT_API_URL`
- **Example**: `https://niat-planner-api.up.railway.app`
- **Default**: `http://localhost:8000` (used if variable is missing)

### Railway Deployment

1. **Backend**:
   - Create a new service from `apps/niat-planner`.
   - Set start command: `uvicorn api.main:app --host 0.0.0.0 --port $PORT`
2. **Frontend**:
   - Add `VITE_NIAT_API_URL` to your UniConnect App service settings.

## Config Framework

The system uses a config-driven parsing strategy (defined in `api/core/default_config.py`) that supports:
- **Header Aliases**: Map varied university headers to canonical fields.
- **Auto-Detection**: Heuristics to find the correct input sheet.
- **Validation Policy**: Rules for blocking errors vs ignorable warnings.
- **Slot Strategies**: Configurable logic for forward-filling and column identification.

