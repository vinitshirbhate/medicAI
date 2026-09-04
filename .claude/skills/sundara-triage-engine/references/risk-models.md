# Risk Models — Features, XGBoost, GRU

## 1. Feature schema

Every clinical feature is a **`(value, missing)` pair**. There is no path from a source to a model
that skips the missingness flag.

### Tabular — XGBoost

| Group | Features |
|---|---|
| Demographics | age, sex |
| Vitals | HR, systolic BP, diastolic BP, SpO₂, RR, temperature, GCS, on supplemental O₂ |
| Vitals derived | shock index (HR/SBP), pulse pressure, **SpO₂/RR discordance flag** |
| Labs | haemoglobin, WBC, platelets, lactate, creatinine, haematocrit |
| Dengue pathway | day of illness, platelet delta, haematocrit delta, warning-sign count, bleeding severity |
| Burn pathway | %TBSA, facial burn, inhalation, exposure duration, airway concern, carbonaceous sputum, hoarseness, **revised-Baux-style age+TBSA+inhalation composite** |
| History | comorbidity flags (4-value enum, not boolean), previous hospitalisation |
| Context | arrival mode, minutes since arrival, active outbreak, mass-casualty active |
| Completeness | per-category completeness — **feeds confidence, never risk** |
| Missingness | one `*_missing` flag per optional feature |

**Three features earn their place from the research and are worth pointing at:**

- **SpO₂/RR discordance** — reassuring saturation with a rising respiratory rate. Encodes the
  Sjoding et al. (2020) finding directly: a normal-looking SpO₂ is not reassurance when other
  respiratory signals disagree.
- **Day of illness** (dengue) — deterioration classically occurs around defervescence, roughly days
  3–7, not at peak fever. Lets the model raise concern while vitals still look acceptable. This is
  proactive capability with genuine clinical content.
- **Airway-risk composite** (burn) — facial burns + carbonaceous sputum + hoarseness predict
  progressive oedema. The patient looks acceptable now and does not in two hours.

### Sequence — GRU

Ordered series, resampled to a fixed grid, with a mask channel:

```
channels: [HR, SpO2, RR, temp, systolic_BP, platelets]  + mask per channel
window:   last 6 observations (or fewer, masked)
```

**Never collapse a series to its latest value in transit.** The model receives the trajectory.
P-1042's platelets (128K → 110K → 96K → 82K) and SpO₂ (96 → 95 → 92 → 89) are the signal; the
endpoint alone is much weaker.

---

## 2. The label — get this right or nothing else matters

```python
# The target: physiological deterioration within the horizon.
DETERIORATION = (
    icu_transfer_within_2h
    | organ_support_started_within_2h        # ventilation, vasopressors
    | sustained_vital_derangement_within_2h  # not a single spurious reading
)
```

**Never use as the label:** cost · length of stay · *"was this patient historically prioritised"*.

That last one is the seductive mistake. It is easy to obtain and it would train the model to
reproduce the triage decisions of an overloaded department — laundering existing bias into a
system that then presents it as objective. This is Obermeyer et al. (2019) in a new setting: the
model would not be biased in its features or its algorithm, but in **what it was asked to predict**,
which no explainability tooling will surface.

The target definition goes in the model card, along with the proxies you rejected and why.

---

## 3. XGBoost

```python
model = xgboost.XGBClassifier(
    n_estimators=400,
    max_depth=5,                  # shallow: SHAP stays interpretable, overfit stays low
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    eval_metric="logloss",
    missing=np.nan,               # XGBoost learns a default direction for missing
    random_state=SEED,            # determinism (NFR-06)
)
```

**`missing=np.nan` matters.** XGBoost handles missing values natively by learning a default split
direction — so pass `NaN`, never `0`, and keep the explicit `*_missing` flags as features as well.
The tree learns *where* missing values go; the flag lets it learn what missingness *means*.

`max_depth=5` is a deliberate trade: shallower trees give cleaner SHAP attributions. Explainability
is 20% and marginal AUC is not.

---

## 4. GRU

```python
class TrajectoryGRU(nn.Module):
    def __init__(self, n_channels=6, hidden=64):
        super().__init__()
        self.gru = nn.GRU(n_channels * 2, hidden, batch_first=True)  # value + mask channels
        self.head = nn.Linear(hidden, 3)   # 3 horizon buckets: now, +1h, +2h

    def forward(self, x, mask):
        h, _ = self.gru(torch.cat([x, mask], dim=-1))
        return self.head(h[:, -1])          # -> trajectory band probabilities
```

Outputs the **2-hour forecast trajectory** (`Moderate → High → Critical`) that FR-11 requires and
that criterion 1 rewards.

**GRU rather than a Temporal Fusion Transformer** for the MVP: easier to train on synthetic data,
faster to debug, and it demonstrates the same capability. A TFT is a credible "future work" answer
and a poor 48-hour choice.

**Acceptance test (FR-10):** two patients with identical current vitals but different trajectories
— one stable at HR 128, one climbing 98 → 128 — must rank differently. If they do not, the temporal
model is not contributing and you should find out at hour 20, not at judging.

---

## 5. Fusion

```python
fused = MLP([xgb_leaf_embedding, gru_hidden, text_embedding_optional]) -> risk_logit
```

Keep it shallow. The fusion layer combines representations; it is not where the modelling happens.
A deep fusion network is harder to explain and adds little on this data volume.

---

## 6. Training on synthetic data — be honest about it

`scripts/generate_synthetic_patients.py` produces the cohorts. Two disciplines:

1. **Encode real clinical relationships**, not noise. Falling platelets with rising haematocrit
   should genuinely predict deterioration in the generator, because that is the WHO dengue warning
   signature. A generator with arbitrary correlations trains a model that demonstrates nothing.
2. **Vary completeness deliberately.** New patients get sparse history. This is what makes the T+8
   twins and the uncertainty story real rather than staged.

**Say this to judges before they ask:**

> "These models are trained on synthetic data with clinically-grounded relationships. That's enough
> to demonstrate the mechanism, and it is not enough to claim clinical performance. That's exactly
> why our rollout runs shadow mode against real local data before the system displays anything —
> which is the step the Epic sepsis deployment skipped."

Volunteering the limitation converts your weakest point into evidence of judgement. A team that
claims clinical validity from synthetic data loses credibility for everything else it says.

---

## 7. Determinism

```python
SEED = 42
random.seed(SEED); np.random.seed(SEED); torch.manual_seed(SEED)
torch.use_deterministic_algorithms(True)
```

NFR-06. The demo must produce identical results every run. A queue that ranks differently in
rehearsal and on stage is unrecoverable — you will not know whether you are looking at a bug or at
the system working.