DEFAULT_CONFIG = {
    "calendar": {
        "sheet_auto_detect": {
            "preferred_names": ["APD 2.0", "APD2.0", "APD_2.0"],
            "preferred_contains": ["APD", "Calendar"]
        },
        "header_aliases": {
            "universities": ["Universities", "Uni", "University Name"],
            "start_date": ["Start Date", "StartDate", "Sem Start", "Semester Start"],
            "end_date": ["End Date (Semester Last Day)", "End Date (Semster Last Day)", "End Date", "Last Day", "Semester Last Day", "Sem Last Day"],
            "saturdays_off": ["Saturdays off", "Saturdays", "Weekend Off", "Off Saturdays"],
            "days_per_week": ["Working days per Week", "Working Days/Week", "Working Days Per Week"],
            "slots_per_day": ["Number of slots per day", "Slots/Day", "Slots Per Day"],
            "holidays": ["Public Holidays", "Holidays"],
            "univ_asmt_days": ["University Assessments Days", "Assessment Days"],
            "niat_asmt_slots": ["NIAT Assessments slots", "NIAT Slots"]
        }
    },
    "prod_sequence": {
        "slot_column_strategy": {
            "primary_columns": ["Topic", "Slot", "Slot No"],
            "support_second_topic_column_as_slot": True
        },
        "slot_forward_fill": {
            "enabled": True,
            "forward_fill_only_when_numeric_or_empty": True
        },
        "session_grouping": {
            "by_slot_number": True
        }
    },
    "slot_rules": {
        "practice_identification": {
            "keywords": ["Practice", "Coding", "Quiz", "MCQ"]
        }
    },
    "validation_policy": {
        "error_on_missing": ["Universities", "Start Date", "End Date (Semester Last Day)"],
        "warn_on_missing": ["NIAT Assessments slots"],
        "strict_mode_default": False
    },
    "subject_mapping": {
        "Web Development-2": "WA2",
        "DBMS": "DBMS",
        "Data Structures": "DS",
        "Advanced English": "EA",
        "Numerical Ability": "NA",
        "Large Language Models": "LLM",
        "Physics": "Phy",
        "Chemistry": "Che",
        "Yoga": "Yoga",
        "TDP": "TDP",
        "HVS": "HVS",
        "Aptitude Skills": "AS",
        "Basic Electronics": "BE",
        "IKS": "IKS",
        "Language & Culture": "LA&C",
        "Environmental Studies": "ENV",
        "Indian Constitution": "IC",
        "Logical Ability-E": "LA-E",
        "Engineering Drawing": "ED",
        "Cloud Computing": "CC"
    },
    "default_niat_assessment_slots": 75
}
