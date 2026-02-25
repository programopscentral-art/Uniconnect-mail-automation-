from pydantic import BaseModel
from typing import Dict, List, Optional

class PlannerConfig(BaseModel):
    subject_mapping: Dict[str, str] = {
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
    }
    default_niat_assessment_slots: int = 75
