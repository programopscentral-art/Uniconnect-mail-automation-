import pandas as pd
import numpy as np
import re
from typing import Dict, List, Tuple, Optional
from .models import PlannerConfig

def parse_full_curriculum(file_path: str) -> List[Dict]:
    """
    Parses the Prod Sequence workbook for full curriculum metadata.
    Returns a list of subjects, where each subject contains its sessions and resources.
    """
    xls = pd.ExcelFile(file_path)
    curriculum = []
    
    for sheet_name in xls.sheet_names:
        df = pd.read_excel(xls, sheet_name=sheet_name)
        
        # 1. Identify Slot Column (2nd Topic column)
        topic_cols = [c for c in df.columns if str(c).strip().lower() == 'topic']
        if len(topic_cols) < 2:
            # Fallback if names are slightly different
            topic_cols = [c for c in df.columns if 'topic' in str(c).lower()]
            
        if len(topic_cols) < 1:
            print(f"Skipping {sheet_name}: No Topic column found")
            continue
            
        # The user says 2nd Topic column contains slot numbers
        # If there's only one Topic column, it might be both name and slot? 
        # But usually there's 'Topic' (desc) and 'Topic' (slot)
        slot_col = topic_cols[1] if len(topic_cols) >= 2 else topic_cols[0]
        name_col = topic_cols[0]

        # 2. Identify other columns (fuzzy)
        def find_col(aliases):
            for c in df.columns:
                if any(a.lower() in str(c).lower() for a in aliases):
                    return c
            return None

        session_name_col = find_col(['Session Name', 'Topic']) # Fallback to name_col
        slot_type_col = find_col(['Slot Type', 'Type'])
        duration_col = find_col(['Session Duration', 'Duration'])
        unit_id_col = find_col(['Unit ID'])
        unit_links_col = find_col(['Unit Links', 'Unit Link'])
        ppt_links_col = find_col(['PPT Links', 'PPT Link'])
        session_enum_col = find_col(['Session Enum'])

        # 3. Clean and Forward Fill Slots
        df[slot_col] = df[slot_col].replace('', np.nan)
        df[slot_col] = df[slot_col].ffill()
        df = df.dropna(subset=[slot_col])

        subject_data = {
            "subject_name": sheet_name,
            "sessions": []
        }

        # 4. Group by Slot Number
        grouped = df.groupby(slot_col, sort=False)
        for slot_num, group in grouped:
            # Extract basic session data from the first row of the group
            first_row = group.iloc[0]
            
            try:
                # Clean slot number (numeric only)
                s_num_str = str(slot_num).strip()
                match = re.search(r'(\d+)', s_num_str)
                actual_slot_num = int(match.group(1)) if match else 0
            except:
                actual_slot_num = 0

            session_name = str(first_row.get(name_col, f"Session {actual_slot_num}")).strip()
            if session_name_col and session_name_col in first_row:
                cand = str(first_row[session_name_col]).strip()
                if cand and cand.lower() != 'nan':
                    session_name = cand

            duration_mins = 0
            if duration_col and duration_col in first_row:
                try:
                    val = first_row[duration_col]
                    if pd.notna(val):
                        duration_mins = float(val)
                        if np.isnan(duration_mins):
                            duration_mins = 0
                except:
                    duration_mins = 0

            session_node = {
                "slot_number": actual_slot_num,
                "session_name": session_name,
                "session_type": str(first_row.get(slot_type_col, "LECTURE")).upper(),
                "duration_in_seconds": int(duration_mins * 60) if pd.notna(duration_mins) else 0,
                "session_enum": str(first_row.get(session_enum_col, "")) if session_enum_col else "",
                "unit_id": str(first_row.get(unit_id_col, "")) if unit_id_col else "",
                "resources": []
            }

            # 5. Extract Resources (Unit Links and PPT Links)
            # We look at ALL rows in the group for links
            unit_urls = []
            ppt_urls = []
            
            for _, row in group.iterrows():
                if unit_links_col and pd.notna(row[unit_links_col]):
                    links = str(row[unit_links_col]).split('\n')
                    unit_urls.extend([l.strip() for l in links if 'http' in l])
                
                if ppt_links_col and pd.notna(row[ppt_links_col]):
                    links = str(row[ppt_links_col]).split('\n')
                    ppt_urls.extend([l.strip() for l in links if 'http' in l])

            for url in list(set(unit_urls)):
                session_node["resources"].append({
                    "resource_type": "UNIT_LINK",
                    "title": "Unit Material",
                    "resource_url": url
                })
            
            for url in list(set(ppt_urls)):
                session_node["resources"].append({
                    "resource_type": "PPT_LINK",
                    "title": "PPT Presentation",
                    "resource_url": url
                })

            subject_data["sessions"].append(session_node)
        
        curriculum.append(subject_data)
        
    return curriculum
