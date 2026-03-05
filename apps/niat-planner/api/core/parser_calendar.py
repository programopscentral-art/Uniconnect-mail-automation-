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
    
    # Internal keys for configuration lookups
    col_univ = 'universities'
    col_start = 'start_date'
    col_end = 'end_date'
    col_sats = 'saturdays_off'
    col_nas = 'niat_asmt_slots'

    def normalize(s):
        """Strip all non-alphanumeric and lowercase."""
        return re.sub(r'[^a-z0-9]', '', str(s).lower())

    # Prep normalized aliases for fast lookup
    required_keys = [col_univ, col_start, col_end]
    norm_aliases = {
        key: [normalize(a) for a in config.calendar.header_aliases.get(key, [])]
        for key in config.calendar.header_aliases.keys()
    }

    def is_valid_header_row(row_vals):
        row_norm = [normalize(v) for v in row_vals]
        match_count = 0
        for key in required_keys:
            if any(a in row_norm for a in norm_aliases.get(key, [])):
                match_count += 1
        return match_count >= 2

    # Check current columns
    if not is_valid_header_row(df.columns.tolist()) or any("unnamed" in str(c).lower() for c in df.columns):
        # Scan first 50 rows for the real header
        for i in range(min(50, len(df))):
            row_vals = df.iloc[i].values
            if is_valid_header_row(row_vals):
                # found it!
                new_cols = []
                for val in row_vals:
                    v_str = str(val).strip() if pd.notna(val) else f"Unnamed_{len(new_cols)}"
                    new_cols.append(v_str)
                df.columns = new_cols
                df = df.iloc[i + 1:].reset_index(drop=True)
                break

    # Re-evaluate with final columns
    actual_cols_norm = [normalize(c) for c in df.columns]
    missing_errors = []
    for req in required_keys:
        if not any(a in actual_cols_norm for a in norm_aliases.get(req, [])):
            # Special fallback: if "End Date" is missing, check if "End" + "Date" are together? 
            # No, let's just report the missing one using its first alias
            missing_errors.append(config.calendar.header_aliases.get(req, [req])[0])
            
    if missing_errors:
        raise ValueError(f"Missing required columns: {', '.join(missing_errors)}")

    # Ultra-robust value extraction
    def get_val(row, canonical_name):
        target_norms = norm_aliases.get(canonical_name, [normalize(canonical_name)])
        for k in row.keys():
            if normalize(k) in target_norms:
                return row[k]
        return None

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
        univ_name = get_val(row, col_univ) or f'Row {idx+1}'
        
        # 1. Dates
        start_date = safe_parse_date(get_val(row, col_start))
        end_date = safe_parse_date(get_val(row, col_end))
        
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
        sat_rule = str(get_val(row, col_sats) or '0')
        non_working_sats = count_saturdays(start_date, end_date, sat_rule)
        df.at[idx, 'Total No.of Non-working Saturdays'] = non_working_sats

        # 4. Assessment Slots
        nas_val = get_val(row, col_nas)
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

