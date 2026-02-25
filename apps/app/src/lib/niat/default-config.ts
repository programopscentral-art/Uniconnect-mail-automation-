export const DEFAULT_NIAT_CONFIG = {
    "calendar": {
        "sheet_auto_detect": {
            "preferred_names": ["APD 2.0", "APD2.0", "APD_2.0"],
            "preferred_contains": ["APD", "Calendar"]
        },
        "header_aliases": {
            "Universities": ["Universities", "Uni", "University Name"],
            "Start Date": ["Start Date", "StartDate", "Sem Start"],
            "End Date (Semster Last Day)": ["End Date (Semster Last Day)", "End Date", "Last Day"],
            "Saturdays off": ["Saturdays off", "Saturdays", "Weekend Off"],
            "Working days per Week": ["Working days per Week", "Working Days/Week"],
            "Number of slots per day": ["Number of slots per day", "Slots/Day"],
            "Public Holidays": ["Public Holidays", "Holidays"],
            "University Assessments Days": ["University Assessments Days", "Assessment Days"],
            "NIAT Assessments slots": ["NIAT Assessments slots", "NIAT Slots"]
        },
        "university_detection": {
            "default_university": "generic"
        }
    },
    "prod_sequence": {
        "slot_column_strategy": {
            "primary_columns": ["Topic", "Slot", "Slot No"],
            "support_second_topic_column_as_slot": true
        },
        "slot_forward_fill": {
            "enabled": true,
            "forward_fill_only_when_numeric_or_empty": true,
            "preserve_new_slot_on_change": true
        },
        "session_grouping": {
            "group_by_slot_number": true
        }
    },
    "slot_rules": {
        "practice_identification": {
            "keywords": ["MCQ Practice", "MCQ Practice I", "MCQ Practice II", "JS Coding Practice"]
        },
        "assessment_variation": {
            "allow_university_variation": true
        }
    },
    "validation_policy": {
        "error_on_missing": ["Universities", "Start Date", "End Date (Semster Last Day)"],
        "warn_on_missing": ["NIAT Assessments slots"],
        "strict_mode_default": false
    }
};
