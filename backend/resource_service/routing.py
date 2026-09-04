"""Feasibility rules for resource-aware recommendations and transfers."""
from __future__ import annotations

from pydantic import BaseModel, Field

from resource_service.store import get_hospital, list_hospitals
from shared.contracts import ResourceRecommendation, ResourceRecommendationRequest


class NetworkPlanRequest(BaseModel):
    patient_id: str = Field(min_length=1, max_length=64)
    source_hospital_id: str = Field(min_length=1, max_length=128)
    destination_hospital_id: str = Field(min_length=1, max_length=128)
    required_resource: str = Field(default="ICU", max_length=128)


def transfer_plan(request: NetworkPlanRequest) -> dict[str, str | bool | None]:
    source = get_hospital(request.source_hospital_id)
    destination = get_hospital(request.destination_hospital_id)
    if request.required_resource.upper() != "ICU":
        return {"feasible": False, "reason": "Only ICU transfer planning is available in this demo", "alternative": None}
    if destination.icu.available < 1:
        return {"feasible": False, "reason": f"No ICU bed available at {destination.hospital_id}", "alternative": "Use a high-acuity stabilization bay and reassess"}
    if source.hospital_id == "SUNDARA_EAST" and destination.hospital_id == "SUNDARA_CENTRAL":
        return {"feasible": False, "reason": "Transit corridor unavailable during strike", "alternative": "Route eligible arrival to SUNDARA_NORTH"}
    return {"feasible": True, "reason": None, "alternative": None}


def recommendation(request: ResourceRecommendationRequest) -> ResourceRecommendation:
    local = get_hospital(request.hospital_id)
    if request.deterioration_risk < 0.65:
        return ResourceRecommendation(
            **request.model_dump(exclude={"hospital_id", "deterioration_risk", "time_sensitivity", "recommended_action"}),
            preferred="ED observation",
        )

    if local.icu.available > 0:
        return ResourceRecommendation(
            **request.model_dump(exclude={"hospital_id", "deterioration_risk", "time_sensitivity", "recommended_action"}),
            preferred="ICU transfer",
            network_option=f"{local.hospital_id} has {local.icu.available} available ICU bed(s)",
            transport_feasible=True,
        )

    candidates = [hospital for hospital in list_hospitals() if hospital.hospital_id != local.hospital_id and hospital.icu.available > 0]
    if candidates:
        destination = candidates[0]
        plan = transfer_plan(
            NetworkPlanRequest(
                patient_id=request.patient_id,
                source_hospital_id=local.hospital_id,
                destination_hospital_id=destination.hospital_id,
            )
        )
        return ResourceRecommendation(
            **request.model_dump(exclude={"hospital_id", "deterioration_risk", "time_sensitivity", "recommended_action"}),
            preferred="ICU transfer",
            constraint="No ICU bed available at this hospital",
            alternative="High-acuity stabilization bay",
            network_option=f"{destination.hospital_id} has {destination.icu.available} available ICU bed(s)",
            transport_feasible=bool(plan["feasible"]),
        )
    return ResourceRecommendation(
        **request.model_dump(exclude={"hospital_id", "deterioration_risk", "time_sensitivity", "recommended_action"}),
        preferred="High-acuity stabilization bay",
        constraint="No network ICU bed currently available",
        alternative="Continue stabilisation and reassess transfer options",
        transport_feasible=False,
    )
