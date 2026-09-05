"""Canonical scenario numbers, and nothing else.

`case-facts.md` states the rule these constants exist to honour: every number that appears in the
dashboard, the deck, or an answer to a judge comes from that file; anything else is either derived
with its derivation shown, or invented. Keeping the scalars here gives the code one place to point
at, so a figure cannot drift between the backend and the deck.

This module holds no logic. Ratios and policy parameters that are *not* case facts live beside the
code that applies them, labelled as the demo parameters they are.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))

# Baseline, before tonight (case-facts.md §2).
BASELINE_NIGHT_SHORTAGE_PCT = 21
BASELINE_ICU_OCCUPANCY_PCT = 93

# Tonight (case-facts.md §3). The 21% chronic figure and the 24% strike figure compound; they are
# never added, and neither is a scaling factor applied to an observed headcount.
STRIKE_STAFF_UNAVAILABLE_PCT = 24
STRIKE_STAFF_AVAILABLE_PCT = 76
STRIKE_START = datetime(2026, 9, 4, 19, 0, tzinfo=IST)
STRIKE_END = datetime(2026, 9, 5, 6, 0, tzinfo=IST)

DENGUE_ARRIVAL_UPLIFT_PCT = 35
FIRE_CASUALTIES = 84
FIRE_ARRIVAL_WINDOW_MIN = 40
FIRE_HOSPITALS = 4

# A pinned instant inside the strike window. The plan is evaluated here by default rather than at
# wall-clock now(): the demo must not silently reopen every corridor because it is run in the
# morning, which would delete the named-infeasibility output the scenario exists to show.
SCENARIO_NOW = datetime(2026, 9, 4, 21, 10, tzinfo=IST)
