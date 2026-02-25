import pandas as pd
import numpy as np
from typing import Dict, List, Tuple

def calculate_derived_fields(df: pd.DataFrame, subject_slots: Dict[str, int], mapping: Dict[str, str]) -> List[Dict]:
    validation_rows = []
    
    # 1. Map slots to APD columns
    mapped_slots_per_subject = {}
    for prod_tab, count in subject_slots.items():
        apd_code = mapping.get(prod_tab)
        if apd_code:
            mapped_slots_per_subject[apd_code] = count
            # Ensure column exists in DF
            if apd_code not in df.columns:
                df[apd_code] = 0
    
    # Initialize all mapping targets to 0 for these rows to avoid NaNs
    for apd_code in set(mapping.values()):
        if apd_code in df.columns:
            df[apd_code] = df[apd_code].fillna(0)
        else:
            df[apd_code] = 0
    
    for idx, row in df.iterrows():
        # Using internal keys that match parser_calendar.py and DEFAULT_CONFIG
        univ_name = row.get('universities', f'Row {idx+1}')
        row_warnings = []
        
        try:
            # Get values safely using internal canonical keys
            ph = float(row.get('holidays', 0) or 0)
            uad = float(row.get('univ_asmt_days', 0) or 0)
            spd = float(row.get('slots_per_day', 0) or 0)
            nas = float(row.get('niat_asmt_slots', 0) or 0)
            wpw = float(row.get('days_per_week', 0) or 0)
            
            non_working_sats = row.get('Total No.of Non-working Saturdays', 0)
            total_days = row.get('Total Days', 0)

            # Calculations
            # Total University Working days = Total Days - Non-working Saturdays - Public Holidays
            tuwd = total_days - non_working_sats - ph
            df.at[idx, 'Total University Working days'] = tuwd
            
            # No.of working days for NIAT = Total University Working days - University Assessments Days
            nwdn = tuwd - uad
            df.at[idx, 'No.of working days for NIAT'] = nwdn
            
            # Total NIAT slots = NIAT working days * slots per day
            tns = nwdn * spd
            df.at[idx, 'Total NIAT slots'] = tns
            
            # Net NIAT Executional slots = Total NIAT slots - NIAT Assessments slots
            nnes = tns - nas
            df.at[idx, 'Net NIAT Executional slots'] = nnes
            
            # Total NIAT Executional Days = Net NIAT Executional slots / slots per day
            nned = nnes / spd if spd > 0 else 0
            df.at[idx, 'Total NIAT Executional Days'] = nned
            
            # Net NIAT No.of weeks = Total NIAT Executional Days / working days per week
            nnnw = nned / wpw if wpw > 0 else 0
            df.at[idx, 'Net NIAT No.of weeks'] = nnnw

            # Subject Wise Slots
            total_subject_slots = 0
            for apd_code, count in mapped_slots_per_subject.items():
                if apd_code in df.columns:
                    df.at[idx, apd_code] = count
                    total_subject_slots += count
            
            df.at[idx, 'Total subject wise slots'] = total_subject_slots
            
            # Subject wise slots per week = Total subject wise slots / Net NIAT No.of weeks
            ssw = total_subject_slots / nnnw if nnnw > 0 else 0
            df.at[idx, 'Subject wise slots per week'] = ssw
            
            # Buffer Slots = Net NIAT Executional slots - Total subject wise slots
            buffer = nnes - total_subject_slots
            df.at[idx, 'Buffer Slots'] = buffer

            # Validation Status
            status = 'OK'
            if buffer < 0:
                status = 'NOT_FEASIBLE'
                row_warnings.append(f'Negative buffer: {buffer}')
            
            validation_rows.append({
                'University name': univ_name,
                'Net NIAT Executional slots': nnes,
                'Total subject wise slots': total_subject_slots,
                'Buffer Slots': buffer,
                'Status': status,
                'Warnings': "; ".join(row_warnings)
            })

        except Exception as e:
            validation_rows.append({
                'University name': univ_name,
                'Status': 'ERROR',
                'Warnings': str(e)
            })

    return validation_rows
