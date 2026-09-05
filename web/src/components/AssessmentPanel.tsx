/** The clinical explanation for one patient, and the controls that record a decision.
 *
 * Order follows the brief: who the patient is, what the engine recommends, why, what was observed,
 * what is forecast, what capacity allows — then the decision. Risk and reliability sit side by side
 * with different marks, so the eye cannot merge them into a single "AI score".
 */
import { useEffect, useState } from "react";
import { CheckCircle2, ShieldCheck, SplitSquareHorizontal } from "lucide-react";
import { ApiError, api } from "@/api/client";
import type { Observation, PatientDetail, QueueItem } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CompletenessBreakdown, RiskComposition, VitalsTrend } from "./charts/PatientCharts";
import { OverrideDialog } from "./OverrideDialog";
import {
  BandChip, EmptyState, Notice, ReliabilityTag, ReliabilityTrack, RiskTrack, SectionLabel,
  clockTime, dateTime, minutesLabel, percent, reliabilityBand, titleCase,
} from "./clinical";

const VITALS: { key: keyof Observation; label: string; unit: string; decimals: number }[] = [
  { key: "heart_rate", label: "Heart rate", unit: "bpm", decimals: 0 },
  { key: "systolic_bp", label: "Systolic", unit: "mmHg", decimals: 0 },
  { key: "diastolic_bp", label: "Diastolic", unit: "mmHg", decimals: 0 },
  { key: "spo2", label: "SpO₂", unit: "%", decimals: 0 },
  { key: "respiratory_rate", label: "Resp. rate", unit: "/min", decimals: 0 },
  { key: "temperature_c", label: "Temp.", unit: "°C", decimals: 1 },
  { key: "gcs", label: "GCS", unit: "", decimals: 0 },
];

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="pt-5">
      <Separator className="mb-5" />
      <SectionLabel className="mb-3">{label}</SectionLabel>
      {children}
    </section>
  );
}

export function AssessmentPanel({
  item, actor, onDecision,
}: { item: QueueItem | null; actor: string; onDecision: () => void }) {
  const [detail, setDetail] = useState<PatientDetail | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ tone: "ok" | "crit"; title: string; body?: string } | null>(null);

  const patientId = item?.patient_id ?? null;

  useEffect(() => {
    setDetail(null);
    setFlash(null);
    if (!patientId) return;
    let cancelled = false;
    api.patient(patientId)
      .then((response) => !cancelled && setDetail(response))
      .catch(() => !cancelled && setDetail(null)); // The panel still works from the queue item alone.
    return () => { cancelled = true; };
  }, [patientId]);

  if (!item) {
    return (
      <EmptyState
        title="No patient selected"
        hint="Choose a patient from the queue to see the evidence behind their position, the two-hour forecast, and the capacity picture."
      />
    );
  }

  const observations = detail?.observations ?? [];
  const latest = observations[observations.length - 1] ?? null;
  const lowConfidence = item.uncertainty.is_low_confidence;

  const accept = async () => {
    setBusy(true);
    try {
      const response = await api.accept(item.patient_id);
      setFlash({ tone: "ok", title: response.message });
      onDecision();
    } catch (cause) {
      setFlash({ tone: "crit", title: "Nothing was recorded", body: cause instanceof ApiError ? cause.message : String(cause) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[17px] font-medium tracking-tight">{item.patient_id}</span>
            <BandChip band={item.protocol_band} />
            <span className="rounded-full px-2 py-0.5 text-[11px] font-medium text-ink-2 tnum"
              style={{ background: "var(--surface-sunken)" }}>
              Rank {item.global_rank}
            </span>
          </div>
          <p className="mt-2 text-[13.5px] text-ink-2">
            {item.patient.age}y · {titleCase(item.patient.sex)} · {titleCase(item.patient.pathway)} pathway ·{" "}
            {item.patient.hospital_id.replace(/_/g, " ")}
          </p>
          {item.patient.chief_complaint ? (
            <p className="mt-1 text-[13.5px] text-ink-3">{item.patient.chief_complaint}</p>
          ) : null}
        </div>
        <ReliabilityTag reliability={item.prediction_reliability} />
      </div>

      {flash ? (
        <Notice tone={flash.tone} title={flash.title} className="mt-4">
          {flash.body ? <p className="mt-0.5">{flash.body}</p> : null}
        </Notice>
      ) : null}

      {lowConfidence ? (
        <Notice tone="warn" title="Prediction reliability is low — treat this estimate with caution" className="mt-4">
          <p className="mt-0.5">Rank is unchanged. Reliability gates how a recommendation is acted on, never its position.</p>
          {item.uncertainty.reasons.length ? (
            <ul className="mt-1.5 list-disc pl-4">
              {item.uncertainty.reasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          ) : null}
          {item.uncertainty.ood_flag ? (
            <p className="mt-1.5">This presentation is outside the cohort the model was tuned on.</p>
          ) : null}
        </Notice>
      ) : null}

      {/* Risk and reliability: two figures, two marks, never one number. */}
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[--radius-lg] p-4" style={{ background: "var(--surface-sunken)" }}>
          <SectionLabel>Deterioration risk</SectionLabel>
          <p className="mt-2 text-[1.9rem] leading-none font-semibold tracking-tight tnum">
            {percent(item.deterioration_risk)}
          </p>
          <div className="mt-3"><RiskTrack risk={item.deterioration_risk} /></div>
          <p className="mt-2 text-[11.5px] text-ink-3">
            Time sensitivity {titleCase(item.time_sensitivity)} · marker is the immediate-assessment threshold
          </p>
        </div>
        <div className="rounded-[--radius-lg] p-4" style={{ background: "var(--surface-sunken)" }}>
          <SectionLabel>Prediction reliability</SectionLabel>
          <p className="mt-2 text-[1.9rem] leading-none font-semibold tracking-tight tnum">
            {percent(item.prediction_reliability)}
            <span className="ml-2 text-[13px] font-medium text-ink-3">{reliabilityBand(item.prediction_reliability)}</span>
          </p>
          <div className="mt-3"><ReliabilityTrack reliability={item.prediction_reliability} /></div>
          <p className="mt-2 text-[11.5px] text-ink-3">
            Data completeness {percent(item.data_completeness)} · waiting {minutesLabel(item.minutes_waiting)}
          </p>
        </div>
      </div>

      <Notice tone={lowConfidence ? "warn" : "info"}
        title={`${titleCase(item.recommended_action.verb)}: ${item.recommended_action.primary}`} className="mt-3">
        <p className="mt-0.5">
          {item.recommended_action.preparation.length
            ? `Suggested preparation: ${item.recommended_action.preparation.join(" · ")}`
            : "No additional preparation suggested at this risk level."}
        </p>
      </Notice>

      {item.proposed_escalation ? (
        <Notice tone="crit" className="mt-3"
          title={`Escalation to band ${item.proposed_escalation.to_band} proposed — ${titleCase(item.proposed_escalation.status)}`}>
          <ul className="mt-1.5 list-disc pl-4">
            {item.proposed_escalation.evidence.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </Notice>
      ) : null}

      <Section label="How this risk figure was built">
        <RiskComposition contributions={item.explanation.contributions} total={item.deterioration_risk} />
      </Section>

      <Section label="Current observations">
        {latest ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {VITALS.map((vital) => {
                const value = (latest[vital.key] as { value: number | null } | undefined)?.value;
                return (
                  <div key={String(vital.key)} className="rounded-[--radius-md] px-3 py-2.5"
                    style={{ background: "var(--surface-sunken)" }}>
                    <p className="label-caps text-[10px]">{vital.label}</p>
                    {typeof value === "number" ? (
                      <p className="mt-1 text-[17px] font-semibold tracking-tight tnum">
                        {value.toFixed(vital.decimals)}
                        <span className="ml-0.5 text-[11px] font-medium text-ink-3">{vital.unit}</span>
                      </p>
                    ) : (
                      <p className="mt-1 text-[13px] font-medium text-ink-3">Not measured</p>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[12px] text-ink-3">
              {observations.length} observation{observations.length === 1 ? "" : "s"} · latest {clockTime(latest.observed_at)} ·
              source {titleCase(latest.source)}
              {latest.observed_at_estimated ? " · time estimated from a spoken handoff" : ""}
            </p>
          </>
        ) : (
          <p className="text-[13.5px] text-ink-2">
            Observation detail is unavailable; the assessment above used {item.observations_used} observation(s).
          </p>
        )}
      </Section>

      <Section label="Trend">
        <VitalsTrend observations={observations} />
        {item.news2.first !== null && item.news2.latest !== null ? (
          <p className="mt-3 text-[12.5px] text-ink-2">
            Aggregate vital-sign score moved <strong className="tnum">{item.news2.first} → {item.news2.latest}</strong> across
            the series, scored over the parameters measured in both observations. A rise of {item.news2.rise_points} counts as
            deterioration.
          </p>
        ) : null}
      </Section>

      <Section label="What the reliability figure is made of">
        <CompletenessBreakdown breakdown={item.completeness_breakdown} overall={item.data_completeness} />
        <p className="mt-1 text-[12.5px] text-ink-3">
          Two-hour forecast: {item.forecast.trajectory.map(titleCase).join(" → ") || "not recorded"} · ensemble spread{" "}
          <span className="tnum">{item.uncertainty.ensemble_spread.toFixed(3)}</span> (technical detail).
        </p>
      </Section>

      <Section label="Resource-aware recommendation">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 text-[13.5px]">
          <dt className="text-ink-3">Preferred</dt>
          <dd className="font-medium">{item.resource_recommendation.preferred}</dd>
          {item.resource_recommendation.constraint ? (
            <>
              <dt className="text-ink-3">Constraint</dt>
              <dd className="font-medium" style={{ color: "var(--crit-ink)" }}>{item.resource_recommendation.constraint}</dd>
            </>
          ) : null}
          {item.resource_recommendation.alternative ? (
            <><dt className="text-ink-3">Alternative</dt><dd className="font-medium">{item.resource_recommendation.alternative}</dd></>
          ) : null}
          {item.resource_recommendation.network_option ? (
            <><dt className="text-ink-3">Network</dt><dd className="font-medium">{item.resource_recommendation.network_option}</dd></>
          ) : null}
          {item.resource_recommendation.transport_feasible !== undefined ? (
            <>
              <dt className="text-ink-3">Transport</dt>
              <dd className="font-medium">{item.resource_recommendation.transport_feasible ? "Feasible" : "Not feasible"}</dd>
            </>
          ) : null}
        </dl>
      </Section>

      <Section label="Clinician decision">
        <p className="text-[12.5px] text-ink-3">
          Recorded against {actor} and written to the append-only audit chain. Assessed {dateTime(item.assessed_at)} ·
          model <span className="font-mono">{item.model_version}</span>.
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button onClick={() => void accept()} disabled={busy} className="rounded-full">
            <CheckCircle2 /> Accept recommendation
          </Button>
          <Button variant="outline" onClick={() => setOverrideOpen(true)} disabled={busy} className="rounded-full">
            <SplitSquareHorizontal /> Override
          </Button>
        </div>
        <p className="mt-3 flex items-center gap-1.5 text-[12px] text-ink-3">
          <ShieldCheck size={13} /> Advisory only — the recorded decision is yours.
        </p>
      </Section>

      {overrideOpen ? (
        <OverrideDialog
          item={item}
          actor={actor}
          onClose={() => setOverrideOpen(false)}
          onRecorded={(message) => {
            setFlash({ tone: "ok", title: message });
            setOverrideOpen(false);
            onDecision();
          }}
        />
      ) : null}
    </div>
  );
}
