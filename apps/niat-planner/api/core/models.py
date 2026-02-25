from pydantic import BaseModel, Field
from typing import Dict, List, Optional
from .default_config import DEFAULT_CONFIG

class SheetAutoDetect(BaseModel):
    preferred_names: List[str] = DEFAULT_CONFIG["calendar"]["sheet_auto_detect"]["preferred_names"]
    preferred_contains: List[str] = DEFAULT_CONFIG["calendar"]["sheet_auto_detect"]["preferred_contains"]

class CalendarConfig(BaseModel):
    sheet_auto_detect: SheetAutoDetect = Field(default_factory=SheetAutoDetect)
    header_aliases: Dict[str, List[str]] = DEFAULT_CONFIG["calendar"]["header_aliases"]

class SlotColumnStrategy(BaseModel):
    primary_columns: List[str] = DEFAULT_CONFIG["prod_sequence"]["slot_column_strategy"]["primary_columns"]
    support_second_topic_column_as_slot: bool = DEFAULT_CONFIG["prod_sequence"]["slot_column_strategy"]["support_second_topic_column_as_slot"]

class SlotForwardFill(BaseModel):
    enabled: bool = DEFAULT_CONFIG["prod_sequence"]["slot_forward_fill"]["enabled"]
    forward_fill_only_when_numeric_or_empty: bool = DEFAULT_CONFIG["prod_sequence"]["slot_forward_fill"]["forward_fill_only_when_numeric_or_empty"]

class ProdSequenceConfig(BaseModel):
    slot_column_strategy: SlotColumnStrategy = Field(default_factory=SlotColumnStrategy)
    slot_forward_fill: SlotForwardFill = Field(default_factory=SlotForwardFill)

class ValidationPolicy(BaseModel):
    error_on_missing: List[str] = DEFAULT_CONFIG["validation_policy"]["error_on_missing"]
    warn_on_missing: List[str] = DEFAULT_CONFIG["validation_policy"]["warn_on_missing"]
    strict_mode_default: bool = DEFAULT_CONFIG["validation_policy"]["strict_mode_default"]

class PlannerConfig(BaseModel):
    calendar: CalendarConfig = Field(default_factory=CalendarConfig)
    prod_sequence: ProdSequenceConfig = Field(default_factory=ProdSequenceConfig)
    validation_policy: ValidationPolicy = Field(default_factory=ValidationPolicy)
    subject_mapping: Dict[str, str] = DEFAULT_CONFIG["subject_mapping"]
    default_niat_assessment_slots: int = DEFAULT_CONFIG["default_niat_assessment_slots"]

