# Data Contracts

**Freeze these early.** Frontend and backend are built in parallel by different people; a schema
change at hour 30 is the classic way a hackathon build dies.

Two rules govern every schema here:

1. **Missing is explicit.** Every optional clinical value carries a `*_missing` companion flag.
   `null` and `0` are different clinical facts and must stay different all the way to the model.
2. **Every value carries provenance.** `source` and `observed_at` on anything displayed. A number
   on screen without a timestamp is a liability during questioning.

---

## 1. Patient

```jsonc
{
  "patient_id": "P-1042",
  "hospital_id": "SUNDARA_CENTRAL",
  "age": 46,
  "sex": "F",
  "arrival_time": "2026-09-04T19:58:00+05:30",
  "arrival_mode": "AMBULANCE",           // AMBULANCE | WALK_IN | TRANSFER
  "is_new_patient": false,               // drives completeness and confidence
  "chief_complaint": "Shortness of breath and high fever",
  "symptoms": {
    "fever": true, "breathlessness": true, "dizziness": true,
    "chest_pain": false, "bleeding": false, "loss_of_consciousness": false
  },
  "known_conditions": {
    "dengue": "CONFIRMED",               // CONFIRMED | SUSPECTED | NO | UNKNOWN
    "diabetes": "UNKNOWN",
    "hypertension": "NO"
  },
  "previous_hospitalisation": "UNKNOWN", // YES | NO | UNKNOWN
  "pathway": "DENGUE",                   // DENGUE | BURN_SMOKE | TRAUMA | GENERAL
  "protocol_band": {
    "system": "ESI",                     // ESI | START
    "value": 2,                          // ESI 1-5, or RED|YELLOW|GREEN|BLACK
    "assigned_by": "HUMAN",              // protocol band is human/protocol authority
    "assigned_at": "2026-09-04T20:01:00+05:30"
  }
}
```

**`known_conditions` uses a four-value enum, never a boolean.** `UNKNOWN` must never collapse to
`NO` (FR-04). This is the schema-level enforcement of the case's explicit instruction that
"Unknown must not be treated as No."

**`protocol_band.assigned_by` is `HUMAN` by default.** The AI orders within the band; it does not
set it. When the AI proposes an escalation it appears as a separate object, never by mutating
this field:

```jsonc
"proposed_escalation": {
  "to_band": 1,
  "confidence": 0.71,
  "evidence": ["SpO2 declining 96->89", "RR 21->29", "platelets falling"],
  "status": "AWAITING_CONFIRMATION",     // never auto-applied
  "proposed_at": "2026-09-04T20:11:03+05:30"
}
```

---

## 2. Vitals observation

```jsonc
{
  "patient_id": "P-1042",
  "observed_at": "2026-09-04T20:10:00+05:30",
  "source": "MONITOR",                   // MONITOR | MANUAL | SIMULATED_EHR
  "heart_rate":        { "value": 128,  "missing": false },
  "systolic_bp":       { "value": 94,   "missing": false },
  "diastolic_bp":      { "value": 62,   "missing": false },
  "spo2":              { "value": 89,   "missing": false },
  "respiratory_rate":  { "value": 29,   "missing": false },
  "temperature_c":     { "value": 39.4, "missing": false },
  "gcs":               { "value": 14,   "missing": false },
  "on_supplemental_o2": false
}
```

Series are ordered lists of these. **The model receives the trajectory, not the latest value** —
the GRU consumes the sequence, so never collapse a series to its most recent point in transit.

---

## 3. Labs

```jsonc
{
  "patient_id": "P-1042",
  "observed_at": "2026-09-04T20:04:00+05:30",
  "source": "LABORATORY_SYSTEM",
  "results": {
    "haemoglobin_g_dl": { "value": 11.2,  "missing": false },
    "wbc_per_ul":       { "value": 13400, "missing": false },
    "platelets_per_ul": { "value": 82000, "missing": false },
    "lactate_mmol_l":   { "value": 3.1,   "missing": false },
    "creatinine_mg_dl": { "value": 1.4,   "missing": false },
    "haematocrit_pct":  { "value": null,  "missing": true  }
  },
  "is_stale": false,
  "age_minutes": 6
}
```

`is_stale` and `age_minutes` drive the visible degradation behaviour in
`integration-constraints.md`. Rising haematocrit with falling platelets is a WHO dengue warning
sign, so both belong in the contract even when one is missing.

---

## 4. Pathway-specific

```jsonc
// pathway == "DENGUE"
"dengue_detail": {
  "status": "CONFIRMED",
  "day_of_illness": 4,                   // critical phase is typically days 3-7
  "platelet_trend": [128000, 110000, 96000, 82000],
  "bleeding": "NONE",                    // NONE | MILD | SIGNIFICANT
  "warning_signs": {
    "persistent_vomiting": true, "abdominal_pain": true,
    "mucosal_bleeding": false, "lethargy": false,
    "fluid_accumulation": false, "liver_enlargement": "UNKNOWN"
  }
}

// pathway == "BURN_SMOKE"
"burn_detail": {
  "tbsa_pct": 32,
  "burn_locations": ["FACE", "CHEST"],   // FACE drives airway risk
  "smoke_inhalation": true,
  "exposure_duration_min": 20,
  "airway_concern": "HIGH",              // LOW | MEDIUM | HIGH
  "carbonaceous_sputum": true,
  "hoarseness": true,
  "trauma_present": false
}
```

Facial burns, carbonaceous sputum and hoarseness are the progressive-airway-risk signature — the
patient who looks acceptable now and does not in two hours. This is the burn pathway's
"AI makes the first move" case, so these fields must be first-class, not free text.

---

## 5. Assessment — the model's output

```jsonc
{
  "patient_id": "P-1042",
  "assessed_at": "2026-09-04T20:11:03+05:30",
  "initiated_by": "AI",                  // AI | HUMAN  -> first-move ledger
  "model_version": "sundara-triage-0.3.1",

  "protocol_band": 2,                    // authority: protocol
  "rank_within_band": 1,                 // authority: AI
  "global_rank": 1,

  "deterioration_risk": 0.87,            // calibrated probability
  "confidence": 0.94,
  "time_sensitivity": "HIGH",
  "data_completeness": 0.91,

  "forecast": {
    "horizon_hours": 2,
    "trajectory": ["MODERATE", "HIGH", "CRITICAL"],
    "probability": 0.87
  },

  "explanation": {
    "one_line": "SpO2 falling with rising respiratory rate and dropping platelets.",
    "contributions": [
      { "feature": "SpO2 89%",           "clinical_label": "Oxygen saturation declining", "shap": 0.22 },
      { "feature": "HR 128",             "clinical_label": "Heart rate elevated",         "shap": 0.18 },
      { "feature": "platelets_falling",  "clinical_label": "Platelet count falling",      "shap": 0.15 }
    ]
  },

  "uncertainty": {
    "is_low_confidence": false,
    "reasons": [],                       // e.g. ["No baseline SpO2", "No platelet trend"]
    "ood_flag": false,
    "ensemble_spread": 0.041
  },

  "recommended_action": {
    "primary": "Immediate clinician assessment",
    "preparation": ["Continuous SpO2 monitoring", "Prepare oxygen support", "Repeat CBC"],
    "verb": "SUGGESTED"                  // never "EXECUTE"
  }
}
```

**`deterioration_risk` and `confidence` are separate top-level fields and must never be combined
into a single displayed number.** That separation is the T+8 answer and it starts in the schema —
if they are ever multiplied together anywhere in the pipeline, criterion 3 is lost.

`initiated_by` and `model_version` are required on every assessment: the first feeds the first-move
ledger, the second is what makes the audit trail evidentially useful (BR-21).

---

## 6. Resource state

```jsonc
{
  "hospital_id": "SUNDARA_CENTRAL",
  "observed_at": "2026-09-04T20:10:00+05:30",
  "icu_beds":    { "total": 40, "occupied": 38, "available": 2 },
  "ed_beds":     { "total": 80, "occupied": 71, "available": 9 },
  "ventilators": { "total": 25, "available": 6 },
  "burn_beds":   { "total": 5,  "available": 3 },
  "oxygen_status": "NORMAL",
  "staff": {
    "doctors": { "scheduled": 22, "available": 19 },
    "nurses":  { "scheduled": 48, "available": 37 }
  },
  "holds": [
    { "resource": "ICU_BED", "patient_id": "P-1042",
      "initiated_by": "AI", "expires_at": "2026-09-04T20:26:00+05:30",
      "status": "AWAITING_CONFIRMATION" }
  ]
}
```

**`scheduled` and `available` are always both present.** Never derive one from the other, never
display only one (FR-28). The gap is the story.

---

## 7. Network event

```jsonc
{
  "event_id": "EVT-TRANSIT-01",
  "type": "TRANSIT_DISRUPTION",          // TRANSIT_DISRUPTION | MASS_CASUALTY | OUTBREAK
  "severity": "HIGH",
  "start": "2026-09-04T19:00:00+05:30",
  "expected_end": "2026-09-05T06:00:00+05:30",
  "staff_unavailable_pct": 24,
  "reachability": {
    "HOSPITAL_C": { "HOSPITAL_A": 0, "HOSPITAL_B": 1 }
  }
}
```

**`reachability` is the transit strike as a hard constraint** (FR-29). `0` means the optimiser
cannot use those staff — not that it should prefer not to. This matrix is what makes the staffing
plan realistic rather than theoretical, and it is what lets the engine name what is impossible
(FR-31).

---

## 8. Audit entry

```jsonc
{
  "seq": 41,
  "timestamp": "2026-09-04T20:14:32+05:30",
  "event_type": "OVERRIDE",              // AI_ASSESSMENT | VIEW | ACCEPT | OVERRIDE | ESCALATION_PROPOSED | HOLD
  "initiated_by": "HUMAN",
  "actor": "CHARGE_NURSE_27",
  "patient_id": "P-1042",
  "model_version": "sundara-triage-0.3.1",
  "payload": {
    "previous_rank": 1, "new_rank": 3,
    "reason_code": "BEDSIDE_ASSESSMENT_DIFFERS",
    "reason_text": "Patient more alert than data suggests",
    "reassessment_due": "2026-09-04T20:24:32+05:30"
  },
  "prev_hash": "9f2c…",
  "hash": "3a71…"                        // sha256(prev_hash + canonical(entry without hash))
}
```

**Append-only. No UPDATE, no DELETE** (NFR-10). `hash` chains to `prev_hash`, so altering any
historic entry invalidates every entry after it and is detectable by replaying the chain (FR-39).

`model_version` on the audit entry — not just on the assessment — is what lets a reviewer months
later establish which model produced the recommendation a clinician acted on. That is the
difference between a log and evidence.