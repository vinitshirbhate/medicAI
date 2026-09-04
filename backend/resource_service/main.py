"""Independently deployable resource API for Sundara Command."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from resource_service.routing import NetworkPlanRequest, recommendation, transfer_plan
from resource_service.store import get_hospital, list_incidents, resource_state, save_hospital, save_incident, setup_database
from shared.contracts import HospitalResource, NetworkEvent, ResourceRecommendationRequest


@asynccontextmanager
async def lifespan(_: FastAPI):
    setup_database()
    yield


app = FastAPI(title="Sundara Command Resource Service", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "resource-service"}


@app.get("/resources")
def resources():
    return resource_state()


@app.get("/resources/hospitals/{hospital_id}")
def hospital_resource(hospital_id: str):
    return get_hospital(hospital_id)


@app.put("/resources/hospitals/{hospital_id}")
def update_hospital_resource(hospital_id: str, payload: HospitalResource):
    if hospital_id != payload.hospital_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail="hospital_id path and payload must match")
    return save_hospital(payload)


@app.get("/incidents")
def incidents():
    return list_incidents()


@app.post("/incidents", status_code=201)
def create_incident(payload: NetworkEvent):
    return save_incident(payload)


@app.post("/network/plan")
def network_plan(payload: NetworkPlanRequest):
    return transfer_plan(payload)


@app.post("/recommendations/resource")
def resource_recommendation(payload: ResourceRecommendationRequest):
    return recommendation(payload)
