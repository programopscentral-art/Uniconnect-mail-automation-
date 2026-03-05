import pandas as pd
import numpy as np
from typing import Dict, List, Tuple

from .models import PlannerConfig

def parse_prod_sequence(file_path: str, config: PlannerConfig) -> Tuple[Dict[str, int], List[Dict]]:
    xls = pd.ExcelFile(file_path)
    subject_slots = {}
    breakdown = []
    
    ps_config = config.prod_sequence
    
    for sheet_name in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name=sheet_name)
        
        # Identify the slot number column
        slot_col = None
        
        # Priority 1: Check primary columns/aliases
        for col_name in ps_config.slot_column_strategy.primary_columns:
            if col_name in df.columns:
                slot_col = col_name
                break
        
        # Priority 2: Support second "Topic" column if config allows
        if not slot_col and ps_config.slot_column_strategy.support_second_topic_column_as_slot:
            topic_cols = [c for c in df.columns if str(c).startswith('Topic')]
            if len(topic_cols) >= 2:
                slot_col = topic_cols[1]
            elif len(topic_cols) == 1:
                slot_col = topic_cols[0]

        # Priority 3: Fuzzy fallback
        if not slot_col:
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
        if ps_config.slot_forward_fill.enabled:
            df[slot_col] = df[slot_col].replace('', np.nan)
            
            if ps_config.slot_forward_fill.forward_fill_only_when_numeric_or_empty:
                # We still ffill everything but the "numeric" part is handled in clean_slot
                df[slot_col] = df[slot_col].ffill()
            else:
                df[slot_col] = df[slot_col].ffill()
        
        # Count unique slot numbers
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

        def clean_slot(val):
            if pd.isna(val): return None
            s = str(val).strip()
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

