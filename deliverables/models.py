"""
AstroHealth Edge OS — Deliverable 2: Strict Pydantic Telemetry & Protocol Schemas
=================================================================================
Defines validated JSON payload contracts for the offline FastAPI edge server.
"""

from __future__ import annotations

from typing import List, Literal
from pydantic import BaseModel, Field


class VitalTelemetry(BaseModel):
    """Incoming physiological vitals packet from crew biometric wearables."""

    sensor_id: str = Field(..., min_length=1, description="Unique wearable/sensor ID")
    timestamp: float = Field(..., ge=0, description="Unix or mission elapsed timestamp (s)")
    heart_rate: float = Field(..., ge=0.0, le=250.0, description="Heart rate in bpm (0-250)")
    spo2: float = Field(..., ge=0.0, le=100.0, description="Blood oxygen saturation % (0-100)")


class RadiationTelemetry(BaseModel):
    """Incoming cabin or EVA dosimeter telemetry packet."""

    sensor_id: str = Field(..., min_length=1, description="Dosimeter sensor identifier")
    timestamp: float = Field(..., ge=0, description="Unix or mission elapsed timestamp (s)")
    proton_flux: float = Field(..., ge=0.0, description="Solar proton flux in pfu")


class SelfAssessmentTelemetry(BaseModel):
    """Astronaut manual medical self-check packet (cuff BP, glucometer, thermometer)."""

    systolic_bp: int = Field(118, ge=60, le=220, description="Systolic blood pressure (mmHg)")
    diastolic_bp: int = Field(76, ge=40, le=140, description="Diastolic blood pressure (mmHg)")
    blood_sugar_mg_dl: int = Field(94, ge=30, le=400, description="Capillary blood glucose (mg/dL)")
    body_temp_c: float = Field(36.8, ge=33.0, le=42.0, description="Core body temperature (°C)")


class ActionableProtocol(BaseModel):
    """Autonomous physical, radiation, metabolic, or mental countermeasure checklist."""

    hazard: str = Field(..., min_length=1, description="Identified physiological, radiation, or mental hazard")
    severity: Literal["WARNING", "CRITICAL"] = Field(
        ..., description="Alert severity tier: WARNING or CRITICAL"
    )
    checklist: List[str] = Field(
        ..., min_length=1, description="Ordered actionable steps for astronauts"
    )
