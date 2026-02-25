import pandas as pd
import numpy as np
from typing import Dict, List, Tuple

def parse_prod_sequence(file_path: str) -> Tuple[Dict[str, int], List[Dict]]:
    xls = pd.ExcelFile(file_path)
    subject_slots = {}
    breakdown = []
    
    for sheet_name in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name=sheet_name)
        
        # Identify the slot number column
        # instruction: "The second “Topic” column contains slot numbers (1,2,3,...)."
        # pandas will name them "Topic" and "Topic.1"
        slot_col = None
        topic_cols = [c for c in df.columns if str(c).startswith('Topic')]
        
        if len(topic_cols) >= 2:
            slot_col = topic_cols[1]
        elif len(topic_cols) == 1:
            slot_col = topic_cols[0]
            # Warning: might be the wrong one, but better than nothing
        else:
            # Fallback: look for a column that has numeric-looking data or is named something similar
            candidate = [c for c in df.columns if 'slot' in str(c).lower()]
            if candidate:
                slot_col = candidate[0]
        
        if not slot_col:
            breakdown.append({
                'tab_name': sheet_name,
                'status': 'WARNING',
                'message': 'No slot number column found'
            })
            subject_slots[sheet_name] = 0
            continue

        # Forward fill slot numbers
        df[slot_col] = df[slot_col].replace('', np.nan)
        # Convert to string to handle Mixed types then fill then convert back to numeric if possible
        df[slot_col] = df[slot_col].ffill()
        
        # Count unique slot numbers
        # Instruction: "Ignore rows that are entirely empty."
        df = df.dropna(how='all')
        
        if df[slot_col].dropna().empty:
            subject_slots[sheet_name] = 0
            breakdown.append({
                'tab_name': sheet_name,
                'total_slots': 0,
                'status': 'WARNING',
                'message': 'Empty slot column'
            })
            continue

        # Clean slot numbers (ensure numeric handles strings like "1.0" or "slot 1")
        def clean_slot(val):
            if pd.isna(val): return None
            s = str(val).strip()
            # Extract digits
            match = pd.Series([s]).str.extract('(\d+)')[0][0]
            return int(match) if pd.notna(match) else None

        unique_slots = df[slot_col].map(clean_slot).dropna().unique()
        slot_count = len(unique_slots)
        
        subject_slots[sheet_name] = slot_count
        
        breakdown.append({
            'tab_name': sheet_name,
            'total_slots': slot_count,
            'min_slot': int(min(unique_slots)) if len(unique_slots) > 0 else 0,
            'max_slot': int(max(unique_slots)) if len(unique_slots) > 0 else 0,
            'status': 'OK'
        })
        
    return subject_slots, breakdown
