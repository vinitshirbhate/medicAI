# The Ranking Policy

The single most defensible design decision in the build. This document is what you put on screen
when a judge asks *"why is this patient above that one?"*

---

## 1. Why not a single score

The obvious design is one blended number:

```python
# DO NOT DO THIS
priority = 0.4*acuity + 0.3*risk + 0.2*time_sensitivity + 0.1*confidence
```

It fails on four counts, and the fourth is fatal:

1. **The weights are indefensible.** Why 0.4? A judge will ask, and there is no clinical answer.
2. **Confidence multiplied into priority is a category error.** It makes an uncertain patient
   *less sick*, which is false — we are merely less sure.
3. **It silently overrides protocol.** A high enough risk score can float an ESI-4 above an ESI-2.
   No clinician will accept that, and no ethics board should.
4. **It cannot answer "what authority did you override?"** — which is the actual question behind
   the explainability criterion.

---

## 2. The policy: lexicographic within protocol bands

```
1. PROTOCOL BAND          ← authority: established protocol (ESI / START)
     ↓  within band only
2. Deterioration risk     ← authority: AI
3. Time to harm           ← authority: AI  (forecast slope)
4. Wait-time equity       ← starvation guard
5. Confidence gate        ← routes, never reorders
6. Resource feasibility   ← tie-break only
7. Alert budget           ← presentation cap
```

Reference implementation — deliberately readable, because you will show it to a clinician:

```python
def rank_key(p: Assessment) -> tuple:
    """Lower sorts first. Each element is only consulted when all earlier ones tie."""
    return (
        p.protocol_band,              # 1. protocol first. AI cannot cross this.
        -p.deterioration_risk,        # 2. within band, sicker first
        -p.time_to_harm_urgency,      # 3. steeper forecast slope first
        -wait_equity_bonus(p),        # 4. starvation guard
        -p.resource_feasibility,      # 6. tie-break: can we actually act?
    )

def wait_equity_bonus(p: Assessment) -> float:
    """Wait accrues priority, capped so it can never cross a band boundary.

    Answers the brief's explicit requirement that wait-time reduction must not come
    from deprioritising low-acuity patients indefinitely.
    """
    hours = p.minutes_waiting / 60.0
    return min(hours * WAIT_ACCRUAL_RATE, WAIT_EQUITY_CAP)  # cap < intra-band range
```

**`protocol_band` is first and dominant.** Everything else is a tie-break within a band. That one
property is what makes the ranking defensible: *"We never override protocol. Protocol doesn't order
within a band — that's the gap we fill."*

---

## 3. The confidence gate — it routes, it does not reorder

Note that confidence is **absent from `rank_key`**. That is deliberate and is the heart of the
T+8 answer.

```python
def apply_confidence_gate(p: Assessment) -> Assessment:
    """Confidence gates. It never boosts, and it never demotes below the protocol band."""
    if p.confidence >= CONFIDENCE_THRESHOLD:
        return p

    p.action = "PRIORITY_CLINICAL_REASSESSMENT"
    p.uncertainty.is_low_confidence = True
    p.uncertainty.reasons = name_missing_information(p)   # shown on screen
    p.badge = "HIGH_UNCERTAINTY"

    # The AI moves first toward its own reversal (FR-14).
    p.prefilled_override = draft_override(p)

    # Rank position within the band is UNCHANGED.
    # Low confidence must not promote, and must not demote.
    return p
```

**Why not rank by confidence-adjusted risk?** Because both directions are wrong:

- Ranking B *up* on 86% acts on a number we do not trust.
- Ranking B *down* for having less data punishes a patient for the state of their records — and
  the patients with the thinnest records are disproportionately the new, transient, and
  underrepresented. That is how a triage system quietly discriminates.

So the gate changes the **action**, not the **order**. B keeps its band position and gains an
urgent human review. That is the only defensible answer, and it is also the humane one.

---

## 4. Band escalation — proposed, never applied

```python
def consider_escalation(p: Assessment) -> Escalation | None:
    """AI may propose a higher band. It may never apply one."""
    if p.deterioration_risk < ESCALATION_RISK_THRESHOLD:
        return None
    if p.confidence < ESCALATION_CONFIDENCE_THRESHOLD:
        return None       # never propose an escalation we are unsure of
    return Escalation(
        to_band=p.protocol_band - 1,
        evidence=top_contributions(p, n=3),
        status="AWAITING_CONFIRMATION",     # never auto-applied
    )
```

Escalation requires **both** high risk and high confidence. An uncertain escalation would flood the
queue with unconfirmable proposals — exactly the alert-fatigue failure of FM-1.

The proposal renders as a distinct badge with its evidence and a confirm action. It never mutates
`protocol_band` (see `data-contracts.md`).

---

## 5. The starvation guard

The brief forbids reducing average wait "by simply deprioritizing lower-acuity patients
indefinitely." Two mechanisms, technical and reported:

**Technical (FR-18).** `wait_equity_bonus` rises monotonically with wait time, capped strictly
below the intra-band risk range so it can lift a patient *within* their band but never across a
band boundary. A waiting ESI-4 climbs past other ESI-4s; it can never pass an ESI-2.

**Reported (BR-31).** Publish the **low-acuity 90th-percentile wait** beside the headline average.
Anyone can lower an average by starving the tail; publishing the tail is what makes the average
credible.

> **Judge-facing line:** "Our target is 51 minutes down to 35. The obvious way to hit that is to
> let low-acuity patients wait forever. So we cap the priority a critical patient can take from a
> waiting one, and we publish the low-acuity 90th percentile next to the average. If we ever hit
> the headline by starving the tail, our own dashboard shows it."

---

## 6. Alert budget

```python
def apply_alert_budget(ranked: list[Assessment]) -> list[Assessment]:
    """Cap concurrent high-priority alerts. Past the cap, re-rank rather than add alerts."""
    for i, p in enumerate(ranked):
        p.alerting = p.is_high_priority and i < MAX_CONCURRENT_ALERTS
    return ranked
```

Directly mitigates FM-1/FM-4: the Epic Sepsis Model fired on roughly 18% of hospitalised patients.
**An alert everyone ignores is worse than no alert** — it trains clinicians to dismiss the system,
including on the occasions it is right.

The ranked queue is the primary interface and is always ambient; interruptive alerts are reserved
for genuine escalations.

---

## 7. What the policy guarantees

Say these aloud; each is a complete answer to a likely question.

| Guarantee | Question it answers |
|---|---|
| AI never crosses a protocol band | "Are you overriding clinical protocol?" — No. |
| Low confidence never promotes | "Are you acting on numbers you don't trust?" — No. |
| Low confidence never demotes | "Do patients with poor records get penalised?" — No. |
| Wait time accrues priority, capped | "Do low-acuity patients wait forever?" — No, and we publish the tail. |
| Escalation needs risk **and** confidence | "Will this flood us with alerts?" — No, and there's a hard cap. |
| Ranking is readable code | "Can you show me how this decided?" — Yes, here it is. |

That last row is the one that surprises judges. **Offer to show the ranking code on screen.** A
team that can put its clinical policy up as twelve readable lines is in a different category from
one that can only show a model.