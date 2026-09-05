/** Queue analytics.
 *
 * Everything is computed from the live queue the clinicians are reading, so this page and the triage
 * page can never disagree. Risk and reliability stay on separate tiles and separate encodings.
 */
import { useEffect, useMemo, useState } from "react";
import { api } from "@/api/client";
import type { Observation } from "@/api/types";
import { BandDistribution, RiskByPatient, WaitVersusRisk } from "@/components/charts/QueueCharts";
import { VitalsTrend } from "@/components/charts/PatientCharts";
import {
  EmptyState, SectionLabel, StatTile, minutesLabel, percent, reliabilityBand,
} from "@/components/clinical";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { QueueState } from "@/hooks/useQueue";

function Panel({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="paper-card p-6">
      <SectionLabel>{title}</SectionLabel>
      <p className="mt-1 text-[13px] text-ink-3">{hint}</p>
      {children}
    </section>
  );
}

export function AnalyticsPage({ queue }: { queue: QueueState }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [observations, setObservations] = useState<Observation[]>([]);

  const items = queue.patients;
  const selected = items.find((item) => item.patient_id === selectedId) ?? items[0] ?? null;
  const selectedPatientId = selected?.patient_id;

  useEffect(() => {
    if (!selectedPatientId) return;
    let cancelled = false;
    api.patient(selectedPatientId)
      .then((detail) => !cancelled && setObservations(detail.observations))
      .catch(() => !cancelled && setObservations([]));
    return () => { cancelled = true; };
  }, [selectedPatientId]);

  const summary = useMemo(() => {
    if (!items.length) return null;
    const risks = items.map((item) => item.deterioration_risk);
    return {
      tracked: items.length,
      highestRisk: Math.max(...risks),
      highestRiskPatient: items.reduce((worst, item) => (item.deterioration_risk > worst.deterioration_risk ? item : worst)).patient_id,
      longestWait: Math.max(...items.map((item) => item.minutes_waiting)),
      longestWaitPatient: items.reduce((slowest, item) => (item.minutes_waiting > slowest.minutes_waiting ? item : slowest)).patient_id,
      lowReliability: items.filter((item) => item.uncertainty.is_low_confidence).length,
      timeCritical: items.filter((item) => item.time_sensitivity === "HIGH").length,
    };
  }, [items]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Tracked patients" value={summary?.tracked ?? 0}
          foot={summary ? `${summary.timeCritical} flagged time critical` : "Queue is empty"} />
        <StatTile label="Highest deterioration risk" value={summary ? percent(summary.highestRisk) : "—"}
          foot={summary?.highestRiskPatient} tone={summary && summary.highestRisk >= 0.8 ? "crit" : "muted"} />
        <StatTile label="Longest wait" value={summary ? minutesLabel(summary.longestWait) : "—"}
          foot={summary?.longestWaitPatient} />
        <StatTile label="Low prediction reliability" value={summary?.lowReliability ?? 0}
          tone={summary?.lowReliability ? "warn" : "ok"}
          foot={summary?.lowReliability
            ? "Reassessment recommended; rank unchanged"
            : "Every estimate above the reliability threshold"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Deterioration risk by patient"
          hint="Highest first. Select a bar to change the patient shown in the trend panel.">
          <RiskByPatient items={items} selectedId={selected?.patient_id ?? null} onSelect={setSelectedId} />
        </Panel>

        <Panel title="Waiting time against risk"
          hint="Two measures on two axes — a patient in the upper right has both waited and deteriorated.">
          <WaitVersusRisk items={items} selectedId={selected?.patient_id ?? null} onSelect={setSelectedId} />
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel title="Protocol band distribution"
          hint="Where the queue sits across the bands that drive ranking.">
          <BandDistribution items={items} />
        </Panel>

        <Panel title="Observation trend"
          hint={selected ? `${selected.patient_id} — each vital on its own scale.` : "Select a patient to see their series."}>
          {selected ? (
            <VitalsTrend observations={observations} />
          ) : (
            <div className="mt-4"><EmptyState title="No patient selected" hint="Pick a patient from either chart above." /></div>
          )}
        </Panel>
      </div>

      <section className="paper-card overflow-hidden">
        <div className="p-6 pb-4">
          <SectionLabel>Queue detail</SectionLabel>
          <p className="mt-1 text-[13px] text-ink-3">
            The same numbers as the charts, as a table — for exact values and for screen readers.
          </p>
        </div>
        {items.length ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rank</TableHead>
                  <TableHead>Patient</TableHead>
                  <TableHead>Band</TableHead>
                  <TableHead className="text-right">Deterioration risk</TableHead>
                  <TableHead className="text-right">Prediction reliability</TableHead>
                  <TableHead className="text-right">Data completeness</TableHead>
                  <TableHead className="text-right">Waiting</TableHead>
                  <TableHead>Time sensitivity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...items].sort((a, b) => a.global_rank - b.global_rank).map((item) => (
                  <TableRow key={item.patient_id}>
                    <TableCell className="tnum">{item.global_rank}</TableCell>
                    <TableCell className="font-mono font-medium">{item.patient_id}</TableCell>
                    <TableCell className="tnum">{item.protocol_band}</TableCell>
                    <TableCell className="text-right font-medium tnum">{percent(item.deterioration_risk)}</TableCell>
                    <TableCell className="text-right tnum">
                      {reliabilityBand(item.prediction_reliability)} · {percent(item.prediction_reliability)}
                    </TableCell>
                    <TableCell className="text-right tnum">{percent(item.data_completeness)}</TableCell>
                    <TableCell className="text-right tnum">{minutesLabel(item.minutes_waiting)}</TableCell>
                    <TableCell>{item.time_sensitivity === "HIGH" ? "High" : "Moderate"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="px-6 pb-6">
            <EmptyState title="Queue is empty" hint="Register a patient or restore the demo cohort from Settings." />
          </div>
        )}
      </section>
    </div>
  );
}
