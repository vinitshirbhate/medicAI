"""Staffing reallocation that respects what is physically possible tonight.

The transit strike is a hard constraint here, not a dashboard label: a corridor with reachability 0
means the allocator *cannot* use those staff, not that it should prefer not to. The consequence is
that the most useful reassignment available tonight is impossible, and saying so is the deliverable.
An allocator that returns a clean optimum during a strike is less credible, not more.

Two properties make the output a realistic plan rather than a theoretical one:

* Staff already inside a building need no corridor, so within-hospital redeployment is always
  available — and it is priced, because those nurses come from somewhere.
* When staff cannot travel, the patient can. Redirecting an eligible arrival to the hospital where
  the nurses already are is the substitute for moving the nurses.

The reachability matrix constrains **staff commuting on public transit**. It does not constrain
ambulance patient transport, which is why those two statements do not contradict each other.

This module proposes; it never acts. It does not move staff and does not move patients. It also
never describes an individual: every figure is a count of a role in a unit, and unavailability is
always a property of a closed corridor, never of a person's choice. A staffing tool that reads as
surveillance loses the clinical trust the rest of the system depends on.
"""
from __future__ import annotations

import math
from datetime import datetime
from typing import Any

from case_facts import (
    BASELINE_NIGHT_SHORTAGE_PCT,
    SCENARIO_NOW,
    STRIKE_END,
    STRIKE_START,
    STRIKE_STAFF_AVAILABLE_PCT,
    STRIKE_STAFF_UNAVAILABLE_PCT,
)

POLICY_VERSION = "staffing-policy-0.1.0"

# R[origin][destination]. 0 means the allocator cannot use those staff at all.
# In deployment this arrives on the TRANSIT_DISRUPTION network event from the transit feed; it is an
# operations input, not an engineering one. The diagonal is always 1 — staff already on site need no
# corridor — and a closed corridor is symmetric, because a downed line is a physical fact.
REACHABILITY: dict[str, dict[str, int]] = {
    "SUNDARA_CENTRAL": {"SUNDARA_CENTRAL": 1, "SUNDARA_NORTH": 0},
    "SUNDARA_NORTH": {"SUNDARA_NORTH": 1, "SUNDARA_CENTRAL": 0},
}

# Demo policy parameters. These are NOT case facts: they are consistent with commonly published ED
# ratios but are not validated for Sundara, and in deployment they are a Clinical AI Safety Committee
# parameter. Every requirement built from them ships its derivation so a clinician can recompute it.
PARAMETER_SOURCE = ("Sundara demo policy parameter, not a case fact; consistent with commonly published "
                    "nurse-to-patient ratios but not validated for Sundara")
NURSE_PER_ED_BED = 1 / 4
NURSE_PER_ICU_BED = 1 / 2
DOCTOR_PER_ED_BED = 1 / 8
DOCTOR_PER_ICU_BED = 1 / 6
NURSE_PER_WAITING_BY_BAND = {1: 1.0, 2: 0.5, 3: 1 / 3, 4: 0.2, 5: 0.2}
DOCTOR_PER_WAITING_BY_BAND = {1: 0.5, 2: 0.25, 3: 1 / 6, 4: 0.1, 5: 0.1}

SURGE_NURSE_PER_ED_BED = 1 / 6  # The thinned low-acuity ratio an internal move buys, and its cost.
MINIMUM_RESERVE = 2  # Never strip a donor to exactly its own computed requirement.
MAX_INTERNAL_REDEPLOY_FRACTION = 0.10
MAX_REDIRECTS_PER_PLAN = 3
REDIRECTABLE_BANDS = (2, 3, 4, 5)  # A resuscitation in progress is never redirected.

ROLES = ("nurses", "doctors")


def corridor_open(origin: str, destination: str, *, at: datetime,
                  reachability: dict[str, dict[str, int]] | None = None) -> int:
    """1 when staff can travel origin -> destination at this instant, 0 when they cannot."""
    if origin == destination:
        return 1  # Already on site. No corridor is involved, so no strike can close it.
    if not (STRIKE_START <= at < STRIKE_END):
        return 1  # Outside the strike window the corridors reopen.
    matrix = REACHABILITY if reachability is None else reachability
    return int(matrix.get(origin, {}).get(destination, 1))


def _waiting_by_band(queue_items: list[dict[str, Any]], hospital_id: str) -> dict[int, int]:
    counts: dict[int, int] = {}
    for item in queue_items:
        if (item.get("patient") or {}).get("hospital_id") != hospital_id:
            continue
        band = item.get("protocol_band")
        if band is not None:
            counts[band] = counts.get(band, 0) + 1
    return counts


def _requirement(hospital: dict[str, Any], waiting: dict[int, int]) -> dict[str, Any]:
    """Nurses and doctors needed, with every term of the arithmetic written out."""
    ed, icu = hospital["ed"]["occupied"], hospital["icu"]["occupied"]
    nurse_terms = [
        (f"{ed} occupied ED beds x 1 nurse per 4 = {ed * NURSE_PER_ED_BED:.2f}", ed * NURSE_PER_ED_BED),
        (f"{icu} occupied ICU beds x 1 nurse per 2 = {icu * NURSE_PER_ICU_BED:.2f}", icu * NURSE_PER_ICU_BED),
    ]
    doctor_terms = [
        (f"{ed} occupied ED beds x 1 doctor per 8 = {ed * DOCTOR_PER_ED_BED:.2f}", ed * DOCTOR_PER_ED_BED),
        (f"{icu} occupied ICU beds x 1 doctor per 6 = {icu * DOCTOR_PER_ICU_BED:.2f}", icu * DOCTOR_PER_ICU_BED),
    ]
    for band in sorted(waiting):
        count = waiting[band]
        nurse_weight = NURSE_PER_WAITING_BY_BAND.get(band, 0.2) * count
        doctor_weight = DOCTOR_PER_WAITING_BY_BAND.get(band, 0.1) * count
        nurse_terms.append((f"{count} waiting band-{band} = {nurse_weight:.2f} nurses", nurse_weight))
        doctor_terms.append((f"{count} waiting band-{band} = {doctor_weight:.2f} doctors", doctor_weight))
    nurse_total = sum(value for _, value in nurse_terms)
    doctor_total = sum(value for _, value in doctor_terms)
    # One ceiling at the end: rounding each term up separately inflates the requirement.
    required_nurses, required_doctors = math.ceil(nurse_total), math.ceil(doctor_total)
    return {
        "required_nurses": required_nurses,
        "required_doctors": required_doctors,
        "ed_occupied": ed,
        "icu_occupied": icu,
        "waiting_by_band": {str(band): count for band, count in sorted(waiting.items())},
        "derivation": [text for text, _ in nurse_terms] + [f"total {nurse_total:.2f} -> {required_nurses} nurses required"]
                      + [text for text, _ in doctor_terms] + [f"total {doctor_total:.2f} -> {required_doctors} doctors required"],
        "parameter_source": PARAMETER_SOURCE,
    }


def _staff_block(staff: dict[str, Any], role: str) -> dict[str, Any]:
    """Scheduled and available, always both, never one derived from the other. The gap is the story."""
    scheduled, available = staff[role]["scheduled"], staff[role]["available"]
    gap = scheduled - available
    return {
        "scheduled": scheduled, "available": available, "gap": gap,
        "cannot_reach_site": gap,
        "local_unavailable_pct": round(gap / scheduled * 100) if scheduled else 0,
        "optimiser_input": "available",
    }


def _hospital_view(hospital: dict[str, Any], queue_items: list[dict[str, Any]]) -> dict[str, Any]:
    hospital_id = hospital["hospital_id"]
    demand = _requirement(hospital, _waiting_by_band(queue_items, hospital_id))
    staff = {role: _staff_block(hospital["staff"], role) for role in ROLES}
    shortfall, movable = {}, {}
    for role, required in (("nurses", demand["required_nurses"]), ("doctors", demand["required_doctors"])):
        available = staff[role]["available"]  # Never `scheduled`: staff who cannot reach site cannot work.
        shortfall[role] = max(0, required - available)
        movable[role] = max(0, available - required - MINIMUM_RESERVE)
    return {
        "hospital_id": hospital_id,
        "staff": staff,
        "demand": demand,
        "shortfall": {**shortfall, "basis": "required - AVAILABLE (scheduled is never an allocator input)"},
        "movable_surplus": {**movable, "reserve_held_back": MINIMUM_RESERVE},
    }


def _internal_redeployment(view: dict[str, Any], short: int, action_id: str) -> dict[str, Any] | None:
    """Move nurses already on site from general cover to the critical cohort."""
    available = view["staff"]["nurses"]["available"]
    if short <= 0 or available <= 0:
        return None
    count = min(short, math.floor(available * MAX_INTERNAL_REDEPLOY_FRACTION))
    if count <= 0:
        return None
    return {
        "action_id": action_id,
        "type": "WITHIN_HOSPITAL_REDEPLOYMENT",
        "hospital_id": view["hospital_id"],
        "role": "NURSE", "count": count,
        "from_area": "General ED cover", "to_area": "ICU and band 1-2 cohort",
        "corridor_required": False,
        "reason": "These nurses are already on site. No corridor is involved, so the strike does not constrain this move.",
        "cost": (f"General cover thins from 1 nurse per 4 beds to 1 per {round(1 / SURGE_NURSE_PER_ED_BED)} "
                 "for the strike window. The low-acuity 90th-percentile wait is expected to rise, and is "
                 "published alongside the headline rather than hidden by it."),
        "basis": "Area split derived from the current census and queue band mix, not from a per-area roster this system holds.",
        "closes_shortfall_by": {"nurses": count},
        "verb": "SUGGESTED", "requires_confirmation_by": "CHARGE_NURSE",
    }


def _redirection(view: dict[str, Any], donor: dict[str, Any], queue_items: list[dict[str, Any]],
                 remaining: int, action_id: str) -> dict[str, Any] | None:
    """Send eligible waiting patients to the hospital where the nurses already are."""
    if remaining <= 0:
        return None
    eligible = [item for item in queue_items
                if (item.get("patient") or {}).get("hospital_id") == view["hospital_id"]
                and item.get("protocol_band") in REDIRECTABLE_BANDS]
    if not eligible:
        return None
    count = min(len(eligible), MAX_REDIRECTS_PER_PLAN)
    relieved = sum(NURSE_PER_WAITING_BY_BAND.get(item["protocol_band"], 0.2) for item in eligible[:count])
    return {
        "action_id": action_id,
        "type": "PATIENT_REDIRECTION",
        "from_hospital": view["hospital_id"], "to_hospital": donor["hospital_id"],
        "patient_count": count,
        "eligibility": (f"Waiting patients in bands {', '.join(str(b) for b in REDIRECTABLE_BANDS)} eligible for "
                        "ambulance transport. A resuscitation in progress is never redirected."),
        "corridor_required": True, "corridor_open": True,
        "corridor_note": "Ambulance patient transport is not constrained by the transit strike; staff commuting is.",
        "reason": (f"Nurses at {donor['hospital_id']} cannot reach {view['hospital_id']} tonight. "
                   "The patients can travel to where the nurses already are."),
        "closes_shortfall_by": {"nurses": math.floor(relieved)},
        "verb": "SUGGESTED", "requires_confirmation_by": "CHARGE_NURSE",
    }


def _pressure() -> dict[str, Any]:
    """The chronic and the tonight-only figures, compounded and never added."""
    chronic_cover = (100 - BASELINE_NIGHT_SHORTAGE_PCT) / 100
    strike_cover = STRIKE_STAFF_AVAILABLE_PCT / 100
    effective = round(chronic_cover * strike_cover * 100)
    return {
        "chronic_baseline": {
            "label": "Chronic night-shift shortage", "pct": BASELINE_NIGHT_SHORTAGE_PCT,
            "constant": "BASELINE_NIGHT_SHORTAGE_PCT", "scope": "Every night, network-wide, before tonight",
            "used_in_allocation": False,
        },
        "tonight_additional": {
            "label": "Transit-strike unavailability", "pct": STRIKE_STAFF_UNAVAILABLE_PCT,
            "constant": "STRIKE_STAFF_UNAVAILABLE_PCT", "scope": "Tonight only, 19:00-06:00",
            "used_in_allocation": False,
        },
        "compounded": {
            "method": "multiplicative on the surviving fraction, not additive",
            "derivation": [
                f"Chronic: 100% - {BASELINE_NIGHT_SHORTAGE_PCT}% = {round(chronic_cover * 100)}% of establishment is rostered on a normal night",
                f"Strike: {STRIKE_STAFF_AVAILABLE_PCT}% of those rostered can reach their assigned hospital tonight",
                f"{chronic_cover:.2f} x {strike_cover:.2f} = {chronic_cover * strike_cover:.2f} -> {effective}% of establishment is actually at the bedside",
                f"Combined gap {100 - effective}%. {BASELINE_NIGHT_SHORTAGE_PCT} + {STRIKE_STAFF_UNAVAILABLE_PCT} = "
                f"{BASELINE_NIGHT_SHORTAGE_PCT + STRIKE_STAFF_UNAVAILABLE_PCT} is NOT used: they compound, they do not add.",
            ],
            "effective_cover_pct": effective,
            "combined_gap_pct": 100 - effective,
            "naive_sum_not_used": BASELINE_NIGHT_SHORTAGE_PCT + STRIKE_STAFF_UNAVAILABLE_PCT,
        },
        "allocation_input": "per-hospital available counts only; neither percentage multiplies any observed figure",
    }


def staffing_plan(hospitals: list[dict[str, Any]], queue_items: list[dict[str, Any]], *,
                  at: datetime | None = None, reachability: dict[str, dict[str, int]] | None = None) -> dict[str, Any]:
    """Propose a staffing plan, and name what tonight makes impossible."""
    at = at or SCENARIO_NOW
    in_window = STRIKE_START <= at < STRIKE_END
    views = [_hospital_view(hospital, queue_items) for hospital in hospitals]
    by_id = {view["hospital_id"]: view for view in views}

    # Enumerate every cross-hospital candidate on the GROSS shortfall first, then split by
    # reachability. Building the candidate before the filter is what makes a blocked transfer
    # impossible to omit silently: it must land in one list or the other.
    candidates = []
    for recipient in views:
        for donor in views:
            if donor["hospital_id"] == recipient["hospital_id"]:
                continue
            for role in ROLES:
                count = min(recipient["shortfall"][role], donor["movable_surplus"][role])
                if count > 0:
                    candidates.append({"donor": donor, "recipient": recipient, "role": role, "count": count})

    feasible: list[dict[str, Any]] = []
    infeasible: list[dict[str, Any]] = []
    next_id = 1
    for candidate in candidates:
        donor, recipient = candidate["donor"], candidate["recipient"]
        role, count = candidate["role"], candidate["count"]
        singular = role[:-1].upper()
        request = f"Reassign {count} {role} from {donor['hospital_id']} to {recipient['hospital_id']}"
        if corridor_open(donor["hospital_id"], recipient["hospital_id"], at=at, reachability=reachability):
            feasible.append({
                "action_id": f"A{next_id}", "type": "CROSS_HOSPITAL_REASSIGNMENT",
                "from_hospital": donor["hospital_id"], "to_hospital": recipient["hospital_id"],
                "role": singular, "count": count, "corridor_required": True, "corridor_open": True,
                "reason": f"Corridor {donor['hospital_id']} -> {recipient['hospital_id']} is open at this time.",
                "closes_shortfall_by": {role: count},
                "verb": "SUGGESTED", "requires_confirmation_by": "CHARGE_NURSE",
            })
        else:
            infeasible.append({
                "action_id": f"X{len(infeasible) + 1}", "request": request, "status": "IMPOSSIBLE",
                "constraint_type": "REACHABILITY", "role": singular, "count": count,
                "from_hospital": donor["hospital_id"], "to_hospital": recipient["hospital_id"],
                "reason": (f"Transit corridor {donor['hospital_id']} -> {recipient['hospital_id']} is closed for the "
                           f"19:00-06:00 strike window (reachability 0). Those {donor['movable_surplus'][role]} movable "
                           f"{role} exist and are available at {donor['hospital_id']}; they cannot physically reach "
                           f"{recipient['hospital_id']} tonight."),
                "expires_at": STRIKE_END.isoformat(),
                "alternative": None,  # filled below, never left null
            })
        next_id += 1

    # The ladder, most local first: staff already on site, then reachable transfers, then patients.
    # The per-hospital `shortfall` block keeps the ORIGINAL figure; what the ladder consumes is
    # tracked separately, so the plan can never report a closed gap beside an action closing it.
    remaining = {view["hospital_id"]: {role: view["shortfall"][role] for role in ROLES} for view in views}
    for view in views:
        action = _internal_redeployment(view, remaining[view["hospital_id"]]["nurses"], f"A{next_id}")
        if action:
            feasible.append(action)
            remaining[view["hospital_id"]]["nurses"] -= action["count"]
            next_id += 1
    for entry in infeasible:
        recipient, donor = by_id[entry["to_hospital"]], by_id[entry["from_hospital"]]
        still_short = remaining[recipient["hospital_id"]]["nurses"]
        if still_short > 0:
            action = _redirection(recipient, donor, queue_items, still_short, f"A{next_id}")
            if action:
                feasible.append(action)
                remaining[recipient["hospital_id"]]["nurses"] = max(0, still_short - action["closes_shortfall_by"]["nurses"])
                next_id += 1

    # An infeasibility always carries the best feasible thing that addresses the same gap: patients
    # sent to where the staff are, else the staff already inside the recipient's own building, else
    # a human. It is never null and never empty.
    escalation = "On-call staffing lead - agency call-in or voluntary overtime. A human decision outside this system."
    for entry in infeasible:
        recipient_id = entry["to_hospital"]
        substitute = next((action for action in feasible if action["type"] == "PATIENT_REDIRECTION"
                           and action["from_hospital"] == recipient_id), None)
        if substitute:
            entry["alternative"] = {"action_id": substitute["action_id"],
                                    "summary": f"Route {substitute['patient_count']} eligible arrivals to {substitute['to_hospital']} instead",
                                    "closes_shortfall_by": substitute["closes_shortfall_by"]}
            continue
        substitute = next((action for action in feasible if action["type"] == "WITHIN_HOSPITAL_REDEPLOYMENT"
                           and action["hospital_id"] == recipient_id), None)
        entry["alternative"] = ({"action_id": substitute["action_id"],
                                 "summary": (f"Redeploy {substitute['count']} nurses already on site at {recipient_id} "
                                             "from general cover to the critical cohort"),
                                 "closes_shortfall_by": substitute["closes_shortfall_by"]}
                                if substitute else {"action_id": None, "summary": escalation, "closes_shortfall_by": {}})

    for view in views:
        view["shortfall"]["remaining_after_plan"] = remaining[view["hospital_id"]]
    residual = {role: sum(remaining[view["hospital_id"]][role] for view in views) for role in ROLES}
    return {
        "generated_at": at.isoformat(),
        "scenario_time": at.isoformat(),
        "policy_version": POLICY_VERSION,
        "authority": {
            "verb": "SUGGESTED", "executes": False,
            "statement": ("A proposed unit-level staffing plan awaiting charge-nurse confirmation. This system does "
                          "not move staff and does not move patients. It proposes; a human decides."),
            "unit_of_recommendation": "COUNT_OF_ROLES_PER_UNIT",
            "counts_are_role_totals_not_individuals": True,
            "not_used_for": ["individual performance management", "rostering", "attendance monitoring", "staff appraisal"],
        },
        "strike_context": {
            "event_type": "TRANSIT_DISRUPTION",
            "window": {"start": STRIKE_START.isoformat(), "end": STRIKE_END.isoformat(), "timezone": "Asia/Kolkata"},
            "in_window_at_scenario_time": in_window,
            "staff_unavailable_pct": STRIKE_STAFF_UNAVAILABLE_PCT,
            "effective_availability_pct": STRIKE_STAFF_AVAILABLE_PCT,
            "source": "case-facts.md section 3",
            "applies_to": "STAFF_COMMUTE_PUBLIC_TRANSIT",
            "does_not_apply_to": "AMBULANCE_PATIENT_TRANSPORT",
            "reachability": reachability or REACHABILITY,
            "closed_corridors": [
                {"origin": origin, "destination": destination, "reachable": 0}
                for origin, row in (reachability or REACHABILITY).items()
                for destination, value in row.items()
                if value == 0 and in_window
            ],
        },
        "pressure": _pressure(),
        "hospitals": views,
        "plan": {
            "candidates_considered": len(candidates),
            "feasible_actions": feasible,
            "infeasible_actions": infeasible,
            "residual": {
                "shortfall": residual,
                "statement": _residual_statement(residual, infeasible, feasible),
                "escalate_to": escalation,
            },
        },
        "limits": [
            "Scheduled staff are never an input to this plan. Only availability is.",
            "This system does not move staff or patients; every line is a proposal awaiting human confirmation.",
            "Counts are role totals per unit. No individual is named, identified, or tracked.",
            "Unavailability is attributed to the closed corridor, never to a person.",
        ],
    }


def _residual_statement(residual: dict[str, int], infeasible: list[dict[str, Any]],
                        feasible: list[dict[str, Any]]) -> str:
    """Say what actually happened, including when nothing closed the gap."""
    outstanding = ", ".join(f"{count} {role}" for role, count in residual.items() if count)
    blocked = "; ".join(f"{entry['request']} remains impossible until 06:00" for entry in infeasible)
    if outstanding:
        opening = f"Tonight's gap does not fully close: {outstanding} still short after every feasible move."
    else:
        means = []
        if any(action["type"] == "WITHIN_HOSPITAL_REDEPLOYMENT" for action in feasible):
            means.append("thinning low-acuity cover")
        if any(action["type"] == "PATIENT_REDIRECTION" for action in feasible):
            means.append("redirecting arrivals")
        how = f", but only by {' and '.join(means)}" if means else ""
        opening = (f"Tonight's gap closes{how}. No staff were added to the network tonight; "
                   "the gap was redistributed, not solved.")
    return f"{opening} {blocked}." if blocked else opening


def infeasibility_summaries(plan: dict[str, Any]) -> list[dict[str, str]]:
    """Flatten to the four-string shape `/api/v1/resources` already publishes, so the two cannot disagree."""
    return [{
        "request": entry["request"], "status": entry["status"], "reason": entry["reason"],
        "alternative": entry["alternative"]["summary"],
    } for entry in plan["plan"]["infeasible_actions"]]
