import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from dateutil import parser
from typing import List, Tuple, Dict
import re

def safe_parse_date(date_str):
    if pd.isna(date_str) or not str(date_str).strip():
        return None
    try:
        # Try a few common formats specifically if auto-parse is risky
        # But dateutil.parser is usually good
        return parser.parse(str(date_str), dayfirst=True)
    except:
        try:
            return parser.parse(str(date_str), dayfirst=False)
        except:
            return None

def count_saturdays(start_date: datetime, end_date: datetime, rule: str) -> int:
    if not start_date or not end_date:
        return 0
    
    total_saturdays = 0
    current_date = start_date
    
    # Normalize rule
    rule = str(rule).lower().strip()
    
    if rule == '0' or not rule:
        return 0
    
    while current_date <= end_date:
        if current_date.weekday() == 5: # Saturday
            # Calculate nth Saturday of the month
            day = current_date.day
            nth = (day - 1) // 7 + 1
            
            if rule == 'every saturday':
                total_saturdays += 1
            elif re.search(r'\b' + str(nth) + r'\b', rule):
                total_saturdays += 1
        current_date += timedelta(days=1)
        
    return total_saturdays

from .models import PlannerConfig

def parse_calendar(df: pd.DataFrame, config: PlannerConfig) -> Tuple[pd.DataFrame, List[Dict]]:
    warnings = []
    
    # Alias Resolution
    def get_val(row, canonical_name):
        aliases = config.calendar.header_aliases.get(canonical_name, [canonical_name])
        for alias in aliases:
            if alias in row:
                return row[alias]
        return row.get(canonical_name)

    # Required Column Validation
    missing_errors = []
    actual_cols = df.columns.tolist()
    
    for req in config.validation_policy.error_on_missing:
        aliases = config.calendar.header_aliases.get(req, [req])
        if not any(a in actual_cols for a in aliases):
            missing_errors.append(req)
            
    if missing_errors:
        raise ValueError(f"Missing required columns (after alias check): {', '.join(missing_errors)}")

    # Ensure necessary output columns exist or fill them
    cols_to_fill = [
        'Total No.of Non-working Saturdays', 'Total Days',
        'Total University Working days', 'No.of working days for NIAT',
        'Total NIAT slots', 'Net NIAT Executional slots',
        'Total NIAT Executional Days', 'Net NIAT No.of weeks'
    ]
    
    for col in cols_to_fill:
        if col not in df.columns:
            df[col] = np.nan

    # Process each row
    for idx, row in df.iterrows():
        univ_name = get_val(row, 'Universities') or f'Row {idx+1}'
        
        # 1. Dates
        start_date = safe_parse_date(get_val(row, 'Start Date'))
        end_date = safe_parse_date(get_val(row, 'End Date (Semster Last Day)'))
        
        if not start_date or not end_date:
            warnings.append({
                'university': univ_name,
                'field': 'Dates',
                'message': 'Invalid Start or End Date',
                'status': 'ERROR'
            })
            continue

        # 2. Total Days
        total_days = (end_date - start_date).days + 1
        df.at[idx, 'Total Days'] = total_days

        # 3. Saturdays
        sat_rule = str(get_val(row, 'Saturdays off') or '0')
        non_working_sats = count_saturdays(start_date, end_date, sat_rule)
        df.at[idx, 'Total No.of Non-working Saturdays'] = non_working_sats

        # 4. Assessment Slots
        nas_val = get_val(row, 'NIAT Assessments slots')
        if pd.isna(nas_val):
            df.at[idx, 'NIAT Assessments slots'] = config.default_niat_assessment_slots
            warnings.append({
                'university': univ_name,
                'field': 'NIAT Assessments slots',
                'message': f'Using default {config.default_niat_assessment_slots}',
                'status': 'WARNING'
            })
        else:
            df.at[idx, 'NIAT Assessments slots'] = nas_val

    return df, warnings

