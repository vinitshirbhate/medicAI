/** The operational landing page: the ranked queue beside the evidence for the open patient.
 *
 * Selection and sort survive a socket update, so a clinician reading one case is not moved off it
 * when someone else registers a patient.
 */
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Clock, Plus, X } from "lucide-react";
import type { QueueItem } from "@/api/types";
import { AssessmentPanel } from "@/components/AssessmentPanel";
import { IntakeForm } from "@/components/IntakeForm";
import {
  BandChip, EmptyState, Notice, ReliabilityTag, RiskTrack, SectionLabel,
  minutesLabel, percent, titleCase,
} from "@/components/clinical";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { QueueState } from "@/hooks/useQueue";

type SortKey = "priority" | "waiting" | "risk" | "band" | "name";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "priority", label: "Queue order" },
  { key: "waiting", label: "Waiting time" },
  { key: "risk", label: "Deterioration risk" },
  { key: "band", label: "Protocol band" },
  { key: "name", label: "Patient ID" },
];

function sortQueue(items: QueueItem[], key: SortKey): QueueItem[] {
  const copy = [...items];
  switch (key) {
    case "waiting": return copy.sort((a, b) => b.minutes_waiting - a.minutes_waiting);
    case "risk": return copy.sort((a, b) => b.deterioration_risk - a.deterioration_risk);
    case "band": return copy.sort((a, b) => a.protocol_band - b.protocol_band || a.global_rank - b.global_rank);
    case "name": return copy.sort((a, b) => a.patient_id.localeCompare(b.patient_id));
    default: return copy.sort((a, b) => a.global_rank - b.global_rank);
  }
}

export function DashboardPage({ queue, actor }: { queue: QueueState; actor: string }) {
  const [params, setParams] = useSearchParams();
  const [sort, setSort] = useState<SortKey>("priority");
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  const selectedId = params.get("patient");
  const rows = useMemo(() => sortQueue(queue.patients, sort), [queue.patients, sort]);
  const selected = queue.patients.find((item) => item.patient_id === selectedId) ?? null;

  // Open the first patient once, so the panel is never empty on arrival at a populated queue.
  useEffect(() => {
    if (!selectedId && rows.length) setParams({ patient: rows[0].patient_id }, { replace: true });
  }, [selectedId, rows, setParams]);

  const select = (id: string) => setParams({ patient: id }, { replace: true });

  return (
    <div className="space-y-6">
      {queue.error ? (
        <Notice tone="crit" title="The triage service is not responding">
          <p className="mt-0.5">{queue.error} — the last known queue is still shown. Use Refresh to retry.</p>
        </Notice>
      ) : null}

      {created ? (
        <Notice tone="ok" title={`${created} registered and assessed`}>
          <p className="mt-0.5">The queue updated over the live socket; the new assessment is open in the panel.</p>
        </Notice>
      ) : null}

      {intakeOpen ? (
        <section className="paper-card p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-[17px] font-semibold">Register an arrival</h2>
              <p className="mt-1 text-[13px] text-ink-3">
                The response is the initial assessment; the patient appears in the queue immediately.
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIntakeOpen(false)} aria-label="Close intake">
              <X />
            </Button>
          </div>
          <IntakeForm
            onCancel={() => setIntakeOpen(false)}
            onCreated={(assessment) => {
              setIntakeOpen(false);
              setCreated(assessment.patient_id);
              select(assessment.patient_id);
              void queue.refresh();
            }}
          />
        </section>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <section>
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <SectionLabel>Patient queue</SectionLabel>
              <p className="mt-1 text-[13px] text-ink-3">
                {rows.length} patient{rows.length === 1 ? "" : "s"} · reliability never changes rank
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={sort} onValueChange={(value) => setSort(value as SortKey)}>
                <SelectTrigger className="h-9 w-[168px] rounded-full bg-[--surface] text-[13px]" aria-label="Sort queue">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORTS.map((entry) => <SelectItem key={entry.key} value={entry.key}>{entry.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {!intakeOpen ? (
                <Button onClick={() => setIntakeOpen(true)} className="h-9 rounded-full">
                  <Plus /> Add patient
                </Button>
              ) : null}
            </div>
          </div>

          {queue.loading ? (
            <EmptyState title="Loading patient queue" hint="Fetching the live ER queue from the triage service." />
          ) : rows.length === 0 ? (
            <EmptyState title="No patients in queue"
              hint="Register an arrival above, or restore the synthetic cohort from Settings." />
          ) : (
            <ul className="space-y-2">
              {rows.map((item) => {
                const active = item.patient_id === selectedId;
                return (
                  <li key={item.patient_id}>
                    <button type="button" onClick={() => select(item.patient_id)} aria-pressed={active}
                      className={cn(
                        "focus-ring w-full rounded-[--radius-xl] border px-4 py-3.5 text-left transition-colors",
                        active ? "bg-[--surface]" : "bg-[--surface] hover:bg-[--surface-sunken]",
                      )}
                      style={{ borderColor: active ? "var(--accent)" : "var(--rule)" }}>
                      <div className="flex items-start gap-3.5">
                        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-[14px] font-semibold tnum"
                          style={{
                            background: active ? "var(--accent-wash)" : "var(--surface-sunken)",
                            color: active ? "var(--accent-ink)" : "var(--ink-2)",
                          }}>
                          {item.global_rank}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[14px] font-medium">{item.patient_id}</span>
                            <BandChip band={item.protocol_band} />
                            {item.time_sensitivity === "HIGH" ? (
                              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                style={{ background: "var(--crit-wash)", color: "var(--crit-ink)" }}>
                                Time critical
                              </span>
                            ) : null}
                            {item.uncertainty.is_low_confidence ? (
                              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                                style={{ background: "var(--warn-wash)", color: "var(--warn-ink)" }}>
                                Low reliability
                              </span>
                            ) : null}
                          </div>

                          <p className="mt-1.5 text-[13px] text-ink-2">
                            {item.patient.age}y · {titleCase(item.patient.sex)} · {titleCase(item.patient.pathway)}
                            <span className="mx-1.5 text-ink-3">·</span>
                            <span className="inline-flex items-center gap-1 text-ink-3 tnum">
                              <Clock size={11} /> {minutesLabel(item.minutes_waiting)}
                            </span>
                          </p>
                          <p className="mt-1 line-clamp-2 text-[12.5px] text-ink-3">{item.explanation.one_line}</p>
                        </div>

                        <div className="w-[128px] shrink-0 text-right">
                          <p className="text-[20px] leading-none font-semibold tracking-tight tnum">
                            {percent(item.deterioration_risk)}
                          </p>
                          <p className="mt-1 text-[10.5px] font-medium tracking-wide text-ink-3 uppercase">Risk</p>
                          <div className="mt-2"><RiskTrack risk={item.deterioration_risk} height={6} /></div>
                          <div className="mt-2 flex justify-end">
                            <ReliabilityTag reliability={item.prediction_reliability} compact />
                          </div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="paper-card p-6 xl:sticky xl:top-24">
          <SectionLabel className="mb-4">Assessment</SectionLabel>
          <AssessmentPanel item={selected} actor={actor} onDecision={() => void queue.refresh()} />
        </section>
      </div>
    </div>
  );
}
