# Research Log — Citation Discipline

Under judge questioning, an unverified statistic is a liability. This log exists so that every
external claim in your deck, dashboard, and answers can be traced in seconds.

**Rule: no claim reaches a slide until its row here reads `Verified`.**

---

## Log

| ID | Claim as stated | Source | Status | Used in | Checked by / date |
|---|---|---|---|---|---|
| R-01 | Epic Sepsis Model AUC 0.63 on external validation vs 0.76–0.83 vendor-reported | Wong et al., JAMA Intern Med, 2021 | ☐ Verified | Deck slide 4; FM-1 | |
| R-02 | ESM sensitivity ~33%, PPV ~12%; alerts on ~18% of hospitalised patients | Wong et al., 2021 | ☐ Verified | Deck slide 4; alert-budget rationale | |
| R-03 | Cost-as-proxy algorithm bias; corrected targeting raises Black patients identified for extra help ~17.7% → ~46.5% | Obermeyer et al., Science, 2019 | ☐ Verified | Position paper; FM-2 | |
| R-04 | Occult hypoxemia ~3× more frequent in Black vs White patients on pulse oximetry | Sjoding et al., NEJM, 2020 | ☐ Verified | Position paper; SpO₂ corroboration rule; FM-3 | |
| R-05 | Dataset shift degrades deployed clinical models | Finlayson et al., NEJM, 2021 | ☐ Verified | OOD rationale; FM-5 | |
| R-06 | Automation bias: clinicians accept incorrect CDS recommendations, amplified by fatigue/time pressure | Goddard et al., JAMIA, 2012 | ☐ Verified | Override design; FM-6 | |
| R-07 | NEWS2 parameters and escalation thresholds | RCP NEWS2 (current edition) | ☐ Verified | Fallback score; benchmark | |
| R-08 | WHO dengue warning signs and severe-dengue criteria | WHO dengue guidelines (current) | ☐ Verified | Feature set; dengue pathway | |
| R-09 | ESI five-level definitions | ESI Implementation Handbook (current) | ☐ Verified | Authority-boundary table | |
| R-10 | START RPM thresholds and colour categories | START / SALT mass-casualty guidance | ☐ Verified | Mass-casualty section | |
| R-11 | ABA burn-centre referral criteria; revised Baux inhalation penalty | American Burn Association | ☐ Verified | Burn pathway; airway urgency | |
| R-12 | Parkland formula 4 mL × kg × %TBSA / 24 h, half in first 8 h | Standard burn resuscitation guidance | ☐ Verified | Burn pathway | |

---

## Adding a claim

```
| R-NN | <claim exactly as it will be spoken or displayed> | <author, journal/body, year> | ☐ Verified | <where used> | <initials / date> |
```

Three rules:

1. **Record the claim as it will actually be stated.** Verifying "pulse oximetry has bias" does not
   verify "three times the rate" — the number is the part that gets challenged.
2. **Log where it is used.** When a source turns out to be weaker than thought, you need to find
   every place it appears in under a minute.
3. **Prefer the primary source.** A statistic quoted from a blog post quoting a paper has a habit
   of drifting.

## Answering when you are not certain

If a judge presses on a figure you have not verified, say so:

> "That's from the Epic Sepsis Model external validation in JAMA Internal Medicine — I'm confident
> on the AUC of 0.63 and the ~18% alert rate; I'd want to check the exact PPV before quoting it."

This reads as rigour. Inventing a decimal place reads as the opposite, and once a judge catches one
fabricated number, every other number you present is discounted.

## Pre-judging check

- [ ] Every row reads `Verified`
- [ ] Every number in the deck maps to a row here or to `case-facts.md`
- [ ] No figure appears in the dashboard that is not in one of those two files
- [ ] The person presenting each claim is the person who verified it