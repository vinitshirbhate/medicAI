"""The staffing plan is allowed to be short of staff. It is not allowed to pretend a corridor is open,
to quietly drop a reassignment it cannot make, or to describe a person."""
from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timedelta
from pathlib import Path

import pytest

os.environ.setdefault("SUNDARA_DB_PATH", str(Path(tempfile.mkdtemp()) / "staffing-test.db"))

import case_facts  # noqa: E402
import main  # noqa: E402  - reads SUNDARA_DB_PATH at import time.
import staffing  # noqa: E402
from case_facts import IST, STRIKE_END  # noqa: E402

IN_WINDOW = case_facts.SCENARIO_NOW
AFTER_STRIKE = STRIKE_END + timedelta(hours=1)

# Forbidden at any depth: the plan is a count of roles per unit and must never become a workforce log.
BANNED = ("staff_id", "employee_id", "person_id", "staff_name", "roster_id", "shift_id",
          "attendance", "absent", "no_show", "on_strike", "union_status", "performance",
          "commute_origin", "home_address", "phone")


@pytest.fixture(autouse=True)
def database():
    main.setup()
    yield


def hospital(hospital_id, *, ed_occ, icu_occ, nurses, doctors):
    scheduled_n, available_n = nurses
    scheduled_d, available_d = doctors
    return {
        "hospital_id": hospital_id,
        "icu": {"total": icu_occ + 2, "occupied": icu_occ, "available": 2},
        "ed": {"total": ed_occ + 5, "occupied": ed_occ, "available": 5},
        "staff": {"doctors": {"scheduled": scheduled_d, "available": available_d},
                  "nurses": {"scheduled": scheduled_n, "available": available_n}},
    }


def waiting(hospital_id, band, count=1):
    return [{"protocol_band": band, "time_sensitivity": "HIGH", "minutes_waiting": 20.0,
             "patient": {"patient_id": f"P-{band}{index}", "hospital_id": hospital_id}} for index in range(count)]


SHORT = hospital("SUNDARA_CENTRAL", ed_occ=71, icu_occ=40, nurses=(48, 37), doctors=(22, 19))
DONOR = hospital("SUNDARA_NORTH", ed_occ=46, icu_occ=29, nurses=(38, 34), doctors=(18, 16))
QUEUE = waiting("SUNDARA_CENTRAL", 2, 2)


def plan(hospitals=None, queue=None, **kwargs):
    return staffing.staffing_plan(hospitals or [SHORT, DONOR], QUEUE if queue is None else queue, **kwargs)


def walk(value):
    """Every key and string in the payload, at any depth."""
    if isinstance(value, dict):
        for key, item in value.items():
            yield str(key)
            yield from walk(item)
    elif isinstance(value, list):
        for item in value:
            yield from walk(item)
    elif isinstance(value, str):
        yield value


# --- the constraint is real ------------------------------------------------------------------

def test_blocked_corridor_is_named_not_omitted() -> None:
    result = plan(at=IN_WINDOW)
    blocked = result["plan"]["infeasible_actions"]
    assert len(blocked) == 1
    entry = blocked[0]
    assert entry["from_hospital"] == "SUNDARA_NORTH" and entry["to_hospital"] == "SUNDARA_CENTRAL"
    assert entry["status"] == "IMPOSSIBLE" and entry["constraint_type"] == "REACHABILITY"
    assert "closed" in entry["reason"] and "reachability 0" in entry["reason"]
    # The candidate is built before the filter, so it must land in exactly one of the two lists.
    cross = [a for a in result["plan"]["feasible_actions"] if a["type"] == "CROSS_HOSPITAL_REASSIGNMENT"]
    assert result["plan"]["candidates_considered"] == len(cross) + len(blocked)


def test_no_proposal_crosses_a_closed_corridor() -> None:
    for matrix in ({"SUNDARA_CENTRAL": {"SUNDARA_CENTRAL": 1, "SUNDARA_NORTH": 0},
                    "SUNDARA_NORTH": {"SUNDARA_NORTH": 1, "SUNDARA_CENTRAL": 0}},
                   {"SUNDARA_CENTRAL": {"SUNDARA_CENTRAL": 1, "SUNDARA_NORTH": 1},
                    "SUNDARA_NORTH": {"SUNDARA_NORTH": 1, "SUNDARA_CENTRAL": 1}}):
        result = plan(at=IN_WINDOW, reachability=matrix)
        for action in result["plan"]["feasible_actions"]:
            if action["type"] == "CROSS_HOSPITAL_REASSIGNMENT":
                assert staffing.corridor_open(action["from_hospital"], action["to_hospital"],
                                              at=IN_WINDOW, reachability=matrix) == 1


def test_all_corridors_closed_still_yields_an_on_site_action() -> None:
    """Staff already inside a building need no corridor; a plan that offers nothing is not realistic."""
    shut = {"SUNDARA_CENTRAL": {"SUNDARA_CENTRAL": 1, "SUNDARA_NORTH": 0},
            "SUNDARA_NORTH": {"SUNDARA_NORTH": 1, "SUNDARA_CENTRAL": 0}}
    actions = plan(at=IN_WINDOW, reachability=shut)["plan"]["feasible_actions"]
    internal = [a for a in actions if a["type"] == "WITHIN_HOSPITAL_REDEPLOYMENT"]
    assert internal and all(a["corridor_required"] is False for a in internal)


def test_corridor_reopens_after_the_strike_window() -> None:
    """The proof the strike is code and not a label: the same plan changes when the window ends."""
    during = plan(at=IN_WINDOW)
    after = plan(at=AFTER_STRIKE)
    assert during["plan"]["infeasible_actions"] and not after["plan"]["infeasible_actions"]
    assert any(a["type"] == "CROSS_HOSPITAL_REASSIGNMENT" for a in after["plan"]["feasible_actions"])
    assert during["strike_context"]["in_window_at_scenario_time"] is True
    assert after["strike_context"]["in_window_at_scenario_time"] is False


def test_plan_is_deterministic() -> None:
    assert json.dumps(plan(at=IN_WINDOW), sort_keys=True) == json.dumps(plan(at=IN_WINDOW), sort_keys=True)


def test_on_site_moves_are_never_blocked_by_the_matrix() -> None:
    assert staffing.corridor_open("SUNDARA_CENTRAL", "SUNDARA_CENTRAL", at=IN_WINDOW) == 1


# --- only availability is an input -------------------------------------------------------------

def test_only_available_is_used_never_scheduled() -> None:
    inflated = hospital("SUNDARA_CENTRAL", ed_occ=71, icu_occ=40, nurses=(78, 37), doctors=(52, 19))
    baseline = plan(at=IN_WINDOW)
    changed = plan([inflated, DONOR], at=IN_WINDOW)
    for result in (baseline, changed):
        for view in result["hospitals"]:
            view["staff"] = None  # the display block is the one place `scheduled` legitimately appears
    assert json.dumps(baseline, sort_keys=True) == json.dumps(changed, sort_keys=True)


def test_scheduled_and_available_are_both_present_and_independent() -> None:
    view = plan(at=IN_WINDOW)["hospitals"][0]["staff"]["nurses"]
    assert view["scheduled"] == 48 and view["available"] == 37 and view["gap"] == 11
    assert view["optimiser_input"] == "available"
    assert view["local_unavailable_pct"] == 23  # observed locally; the 24% headline is network-wide


def test_shortfall_is_measured_against_available() -> None:
    view = plan(at=IN_WINDOW)["hospitals"][0]
    assert view["shortfall"]["nurses"] == view["demand"]["required_nurses"] - view["staff"]["nurses"]["available"]
    assert "AVAILABLE" in view["shortfall"]["basis"]


# --- the plan is honest about itself -----------------------------------------------------------

def test_every_infeasibility_carries_a_real_alternative() -> None:
    result = plan(at=IN_WINDOW)
    ids = {action["action_id"] for action in result["plan"]["feasible_actions"]}
    for entry in result["plan"]["infeasible_actions"]:
        alternative = entry["alternative"]
        assert alternative and alternative["summary"]
        assert alternative["action_id"] in ids or alternative["action_id"] is None


def test_reported_shortfall_is_the_original_not_the_leftover() -> None:
    """A plan that reports a closed gap beside an action closing it is incoherent."""
    view = plan(at=IN_WINDOW)["hospitals"][0]
    assert view["shortfall"]["nurses"] == 2
    assert view["shortfall"]["remaining_after_plan"]["nurses"] == 0


def test_internal_move_states_its_cost() -> None:
    action = next(a for a in plan(at=IN_WINDOW)["plan"]["feasible_actions"]
                  if a["type"] == "WITHIN_HOSPITAL_REDEPLOYMENT")
    assert "1 per 6" in action["cost"] and "90th-percentile" in action["cost"]
    assert "not from a per-area roster" in action["basis"]


def test_residual_statement_describes_what_actually_happened() -> None:
    result = plan(at=IN_WINDOW)
    statement = result["plan"]["residual"]["statement"]
    assert "No staff were added to the network tonight" in statement
    assert ("redirecting arrivals" in statement) == any(
        a["type"] == "PATIENT_REDIRECTION" for a in result["plan"]["feasible_actions"])


def test_requirements_carry_their_derivation() -> None:
    demand = plan(at=IN_WINDOW)["hospitals"][0]["demand"]
    assert any("71 occupied ED beds" in line for line in demand["derivation"])
    assert any("waiting band-2" in line for line in demand["derivation"])
    assert "not a case fact" in demand["parameter_source"]


# --- the plan proposes; it never acts, and never describes a person -----------------------------

def test_plan_never_claims_to_move_anyone() -> None:
    result = plan(at=IN_WINDOW)
    assert result["authority"]["executes"] is False
    assert "does not move staff" in result["authority"]["statement"]
    for action in result["plan"]["feasible_actions"]:
        assert action["verb"] == "SUGGESTED" and action["requires_confirmation_by"]
    text = json.dumps(result).lower()
    for claim in ("executed", "applied", "committed", "has been moved"):
        assert claim not in text


def test_no_person_level_fields_anywhere() -> None:
    result = plan(at=IN_WINDOW)
    # `not_used_for` is the commitment never to be those things, so it names them legitimately.
    declared = result["authority"].pop("not_used_for")
    assert {"rostering", "attendance monitoring"} <= set(declared)
    text = " ".join(walk(result)).lower()
    for banned in BANNED:
        assert banned not in text, f"{banned} would make this a workforce record"


def test_unavailability_is_attributed_to_the_corridor_not_to_people() -> None:
    result = plan(at=IN_WINDOW)
    reasons = " ".join(entry["reason"] for entry in result["plan"]["infeasible_actions"]).lower()
    assert "corridor" in reasons
    for blame in ("refused", "did not attend", "on strike", "unwilling"):
        assert blame not in reasons


# --- the two percentages compound, they do not add ----------------------------------------------

def test_21_and_24_are_not_conflated() -> None:
    pressure = plan(at=IN_WINDOW)["pressure"]
    assert pressure["chronic_baseline"]["pct"] == 21 and pressure["tonight_additional"]["pct"] == 24
    assert pressure["chronic_baseline"]["used_in_allocation"] is False
    assert pressure["compounded"]["effective_cover_pct"] == 60
    assert pressure["compounded"]["naive_sum_not_used"] == 45
    assert any("do not add" in line for line in pressure["compounded"]["derivation"])


def test_chronic_percentage_never_scales_an_allocation(monkeypatch) -> None:
    """Context, not a multiplier: changing it must not move a single count."""
    before = plan(at=IN_WINDOW)
    monkeypatch.setattr(staffing, "BASELINE_NIGHT_SHORTAGE_PCT", 35)
    after = plan(at=IN_WINDOW)
    assert before["hospitals"] == after["hospitals"]
    assert before["plan"]["feasible_actions"] == after["plan"]["feasible_actions"]
    assert before["plan"]["infeasible_actions"] == after["plan"]["infeasible_actions"]


# --- integration with the live endpoints --------------------------------------------------------

def test_seeded_night_premise_holds() -> None:
    """Locks the demo: a later ratio tweak must not silently delete the story."""
    result = staffing.staffing_plan(main.network_hospitals(), main.queue())
    central = next(v for v in result["hospitals"] if v["hospital_id"] == "SUNDARA_CENTRAL")
    north = next(v for v in result["hospitals"] if v["hospital_id"] == "SUNDARA_NORTH")
    assert central["shortfall"]["nurses"] > 0, "Central must be short for the scenario to mean anything"
    assert north["movable_surplus"]["nurses"] > 0, "North must have staff that cannot travel"
    assert result["plan"]["infeasible_actions"], "the named infeasibility is the deliverable"


def test_resources_infeasibilities_match_the_staffing_plan() -> None:
    """The capacity panel and the staffing panel cannot state different things about the same night."""
    resources = main.network_resources()
    expected = staffing.infeasibility_summaries(
        staffing.staffing_plan(main.network_hospitals(), main.queue()))
    assert resources["infeasibilities"] == expected
    for entry in resources["infeasibilities"]:
        assert set(entry) == {"request", "status", "reason", "alternative"}
        assert entry["alternative"]


def test_no_phantom_hospital_remains() -> None:
    assert "SUNDARA_EAST" not in json.dumps(main.network_resources())


def test_empty_queue_is_not_an_error() -> None:
    result = plan(queue=[], at=IN_WINDOW)
    assert result["plan"]["residual"]["statement"]
    assert result["hospitals"][0]["demand"]["waiting_by_band"] == {}


@pytest.mark.parametrize("at", [IN_WINDOW, AFTER_STRIKE])
def test_endpoint_returns_a_plan(at: datetime) -> None:
    result = main.staffing_recommendation(at=at)
    assert result["authority"]["verb"] == "SUGGESTED"
    assert result["strike_context"]["applies_to"] == "STAFF_COMMUTE_PUBLIC_TRANSIT"
    assert result["strike_context"]["does_not_apply_to"] == "AMBULANCE_PATIENT_TRANSPORT"
