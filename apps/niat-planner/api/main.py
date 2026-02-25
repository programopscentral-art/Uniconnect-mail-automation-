from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import StreamingResponse
import pandas as pd
import io
import json
from .core.parser_calendar import parse_calendar
from .core.parser_prod import parse_prod_sequence
from .core.calculator import calculate_derived_fields
from .core.exporter import export_to_excel
from .core.models import PlannerConfig

app = FastAPI(title="NIAT Planner API")

@app.get("/")
def read_root():
    return {"message": "Welcome to NIAT Planner API"}

@app.post("/generate")
async def generate_niat_plan(
    calendar_file: UploadFile = File(...),
    prod_sequence_file: UploadFile = File(...),
    config: str = Form(None)
):
    try:
        # 1. Parse Config
        planner_config = PlannerConfig()
        if config:
            try:
                custom_config = json.loads(config)
                if 'subject_mapping' in custom_config:
                    planner_config.subject_mapping.update(custom_config['subject_mapping'])
                if 'default_niat_assessment_slots' in custom_config:
                    planner_config.default_niat_assessment_slots = custom_config['default_niat_assessment_slots']
            except json.JSONDecodeError:
                pass

        # 2. Read Files
        # Calendar can be CSV or XLSX
        cal_content = await calendar_file.read()
        if calendar_file.filename.endswith('.csv'):
            cal_df = pd.read_csv(io.BytesIO(cal_content))
        else:
            cal_df = pd.read_excel(io.BytesIO(cal_content))

        # Prod Sequence is XLS/XLSX
        prod_content = await prod_sequence_file.read()
        prod_path = f"/tmp/{prod_sequence_file.filename}"
        # Since parser_prod uses pd.ExcelFile, we might want to save it temporarily or use BytesIO
        # pd.ExcelFile(io.BytesIO(prod_content)) works too
        
        # 3. Process Logic
        # A. Parse Prod Sequence
        subject_slots, breakdown_data = parse_prod_sequence(io.BytesIO(prod_content))
        breakdown_df = pd.DataFrame(breakdown_data)
        
        # B. Parse Calendar Base
        cal_df, cal_warnings = parse_calendar(cal_df, planner_config.default_niat_assessment_slots)
        
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
