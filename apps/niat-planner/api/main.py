from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import json
import pandas as pd
import io
from .core.parser_calendar import parse_calendar
from .core.parser_prod import parse_prod_sequence
from .core.calculator import calculate_derived_fields
from .core.exporter import export_to_excel
from .core.exporter_content import export_content_to_excel
from .core.models import PlannerConfig

app = FastAPI(title="NIAT Planner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "Welcome to NIAT Planner API"}

@app.post("/inspect")
async def inspect_workbook(file: UploadFile = File(...)):
    try:
        content = await file.read()
        if file.filename.endswith('.csv'):
            return {"sheets": ["Default"]}
        
        xls = pd.ExcelFile(io.BytesIO(content))
        return {"sheets": xls.sheet_names}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/generate")
async def generate_niat_plan(
    calendar_file: UploadFile = File(...),
    prod_sequence_file: UploadFile = File(...),
    calendar_sheet_name: str = Form(None),
    config: str = Form(None)
):
    try:
        # 1. Parse Config
        planner_config = PlannerConfig()
        if config:
            try:
                custom_config = json.loads(config)
                # Proper pydantic update (handling nested dicts)
                planner_config = PlannerConfig(**custom_config)
            except Exception as e:
                # Fallback or log error
                print(f"Config parse error: {e}")
                pass

        # 2. Read Files
        cal_content = await calendar_file.read()
        if calendar_file.filename.endswith('.csv'):
            cal_df = pd.read_csv(io.BytesIO(cal_content))
        else:
            # If sheet_name is provided, use it, else default to first
            if calendar_sheet_name == "string" or not calendar_sheet_name:
                calendar_sheet_name = 0
            cal_df = pd.read_excel(io.BytesIO(cal_content), sheet_name=calendar_sheet_name)

        # Prod Sequence is XLS/XLSX
        prod_content = await prod_sequence_file.read()
        
        # 3. Process Logic
        # A. Parse Prod Sequence
        subject_slots, breakdown_data = parse_prod_sequence(io.BytesIO(prod_content), planner_config)
        breakdown_df = pd.DataFrame(breakdown_data)
        
        # B. Parse Calendar Base
        cal_df, cal_warnings = parse_calendar(cal_df, planner_config)
        
        # C. Calculate Derived Fields
        validation_data = calculate_derived_fields(cal_df, subject_slots, planner_config.subject_mapping)
        validation_df = pd.DataFrame(validation_data)

        
        # Add cal_warnings to validation_df if needed
        # (This can be merged with validation_data in a more sophisticated way)

        # 4. Export
        excel_out = export_to_excel(cal_df, breakdown_df, validation_df)
        
        return StreamingResponse(
            excel_out,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=NIAT_Planner_Output.xlsx"}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/export-content")
async def export_content(
    data: str = Form(...)
):
    try:
        content_data = json.loads(data)
        
        # 1. SemesterCourse
        courses = content_data.get("courses", [])
        courses_df = pd.DataFrame(courses)
        required_course_cols = [
            "semester_course_id", "title", "description", "order", 
            "semester_name", "category", "sub_category", "source_code", "credits"
        ]
        for col in required_course_cols:
            if col not in courses_df.columns:
                courses_df[col] = None
        courses_df = courses_df[required_course_cols]

        # 2. Session
        sessions = content_data.get("sessions", [])
        sessions_df = pd.DataFrame(sessions)
        required_session_cols = [
            "session_id", "session_name", "session_plan_name", "session_type", "duration_in_seconds"
        ]
        for col in required_session_cols:
            if col not in sessions_df.columns:
                sessions_df[col] = None
        sessions_df = sessions_df[required_session_cols]

        # 3. SessionResource
        resources = content_data.get("resources", [])
        resources_df = pd.DataFrame(resources)
        required_resource_cols = [
            "session_id", "resource_type", "title", "resource_url"
        ]
        for col in required_resource_cols:
            if col not in resources_df.columns:
                resources_df[col] = None
        resources_df = resources_df[required_resource_cols]

        # 4. SemesterCourseSession
        course_sessions = content_data.get("course_sessions", [])
        mapping_df = pd.DataFrame(course_sessions)
        required_mapping_cols = [
            "semester_course_id", "session_id", "order", "week_count"
        ]
        for col in required_mapping_cols:
            if col not in mapping_df.columns:
                mapping_df[col] = None
        mapping_df = mapping_df[required_mapping_cols]

        # Export
        excel_out = export_content_to_excel(courses_df, sessions_df, resources_df, mapping_df)
        
        return StreamingResponse(
            excel_out,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=Content_Export_Output.xlsx"}
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
