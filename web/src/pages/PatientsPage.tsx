/** Every registered patient — the demographic view the queue does not carry.
 *
 * Reads `/api/v1/patients`, which is served from MongoDB when the record store is reachable and from
 * the local store otherwise. The source is named on screen rather than assumed.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, Search } from "lucide-react";
import { api } from "@/api/client";
import type { PatientSummary } from "@/api/types";
import {
  BandChip, EmptyState, Notice, SectionLabel, StatTile, clockTime, minutesLabel, percent, titleCase,
} from "@/components/clinical";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { QueueState } from "@/hooks/useQueue";

export function PatientsPage({ queue }: { queue: QueueState }) {
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [source, setSource] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [term, setTerm] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.patients();
      setPatients(response.patients);
      setSource(response.source);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Patient records unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  // A queue update means a patient was added or reassessed.
  useEffect(() => { void load(); }, [load, queue.updatedAt]);

  const assessments = useMemo(() => new Map(queue.patients.map((item) => [item.patient_id, item])), [queue.patients]);

  const rows = useMemo(() => {
    const needle = term.trim().toLowerCase();
    if (!needle) return patients;
    return patients.filter(
      (patient) =>
        patient.patient_id.toLowerCase().includes(needle) ||
        patient.chief_complaint.toLowerCase().includes(needle) ||
        patient.pathway.toLowerCase().includes(needle),
    );
  }, [patients, term]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Registered patients" value={patients.length}
          foot={source === "mongodb" ? "Record store: MongoDB Atlas" : "Record store: local SQLite fallback"}
          tone={source === "mongodb" ? "ok" : "warn"} />
        <StatTile label="New to the system" value={patients.filter((patient) => patient.is_new_patient).length}
          foot="No previous baseline, so reliability is lower by construction" />
        <StatTile label="Arrived by ambulance" value={patients.filter((patient) => patient.arrival_mode === "AMBULANCE").length}
          foot={`Of ${patients.length} registered arrivals`} />
        <StatTile label="Observations recorded" value={patients.reduce((total, patient) => total + patient.observations, 0)}
          foot="Across every patient in the record store" />
      </div>

      <section className="paper-card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 p-6 pb-4">
          <div>
            <SectionLabel>Registered patients</SectionLabel>
            <p className="mt-1 text-[13px] text-ink-3">
              Demographics, pathway detail, and the latest observation for every patient on record.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
              <Input value={term} onChange={(event) => setTerm(event.target.value)}
                placeholder="Filter by ID, complaint or pathway"
                className="h-9 w-[248px] rounded-full pl-9 text-[13px]" />
            </div>
            <Button variant="outline" className="h-9 rounded-full" onClick={() => void load()}>
              <RefreshCw /> Reload
            </Button>
          </div>
        </div>

        {error ? (
          <div className="px-6 pb-6">
            <Notice tone="crit" title="Patient records unavailable"><p className="mt-0.5">{error}</p></Notice>
          </div>
        ) : loading && !patients.length ? (
          <div className="px-6 pb-6"><EmptyState title="Loading patients" hint="Reading the patient record store." /></div>
        ) : rows.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState title="No patients match"
              hint={term ? "Clear the filter to see every registered patient." : "Register an arrival from the triage queue, or restore the demo cohort from Settings."} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Age / sex</TableHead>
                  <TableHead>Pathway</TableHead>
                  <TableHead>Chief complaint</TableHead>
                  <TableHead>Arrived</TableHead>
                  <TableHead>Latest observation</TableHead>
                  <TableHead className="text-right">Assessment</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((patient) => {
                  const assessment = assessments.get(patient.patient_id);
                  const latest = patient.latest_observation;
                  return (
                    <TableRow key={patient.patient_id}>
                      <TableCell>
                        <div className="font-mono text-[13px] font-medium">{patient.patient_id}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          <BandChip band={patient.protocol_band} />
                          {patient.is_new_patient ? (
                            <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                              style={{ background: "var(--warn-wash)", color: "var(--warn-ink)" }}>
                              New patient
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="tnum">{patient.age}y · {titleCase(patient.sex)}</TableCell>
                      <TableCell>
                        {titleCase(patient.pathway)}
                        <div className="text-[12px] text-ink-3">{patient.hospital_id.replace(/_/g, " ")}</div>
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        {patient.chief_complaint || <span className="text-ink-3">Not recorded</span>}
                      </TableCell>
                      <TableCell>
                        <span className="tnum">{clockTime(patient.arrival_time)}</span>
                        <div className="text-[12px] text-ink-3">{titleCase(patient.arrival_mode)}</div>
                      </TableCell>
                      <TableCell>
                        {latest ? (
                          <>
                            <span className="tnum">HR {latest.heart_rate.value ?? "—"} · SpO₂ {latest.spo2.value ?? "—"}</span>
                            <div className="text-[12px] text-ink-3 tnum">
                              {patient.observations} observation{patient.observations === 1 ? "" : "s"} · {clockTime(latest.observed_at)}
                            </div>
                          </>
                        ) : (
                          <span className="text-ink-3">None recorded</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {assessment ? (
                          <>
                            <span className="font-semibold tnum">{percent(assessment.deterioration_risk)}</span>
                            <span className="text-ink-3"> risk</span>
                            <div className="text-[12px] text-ink-3 tnum">
                              Reliability {percent(assessment.prediction_reliability)} · waiting {minutesLabel(assessment.minutes_waiting)}
                            </div>
                          </>
                        ) : (
                          <span className="text-ink-3">Not in queue</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="sm" className="rounded-full">
                          <Link to={`/?patient=${encodeURIComponent(patient.patient_id)}`}>Review</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
