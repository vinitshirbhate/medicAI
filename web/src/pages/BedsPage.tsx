/** Bed and network capacity.
 *
 * Not a general analytics view: it answers the one question a resource-aware recommendation raises —
 * where can this patient actually go. Requests the network cannot satisfy stay visible with their
 * alternative rather than being hidden as failures.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { api } from "@/api/client";
import type { ResourceState } from "@/api/types";
import { CapacityMeter, EmptyState, Notice, SectionLabel, StatTile, titleCase } from "@/components/clinical";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { QueueState } from "@/hooks/useQueue";

export function BedsPage({ queue }: { queue: QueueState }) {
  const [resources, setResources] = useState<ResourceState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setResources(await api.resources());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Resource state unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** Patients the engine would place in an ICU bed — the demand side of the capacity question. */
  const icuCandidates = useMemo(
    () => queue.patients.filter((item) => item.resource_recommendation.preferred === "ICU transfer"),
    [queue.patients],
  );
  const icuAvailable = resources?.hospitals.reduce((total, hospital) => total + hospital.icu.available, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Network ICU occupancy" value={resources?.network_icu_occupancy_pct ?? "—"} unit="%"
          tone="warn" foot="Across every hospital in the network" />
        <StatTile label="ICU beds available" value={resources ? icuAvailable : "—"}
          tone={icuAvailable === 0 ? "crit" : "muted"}
          foot={icuAvailable === 0 ? "No ICU bed anywhere in the network" : "Free now, network-wide"} />
        <StatTile label="Patients needing ICU" value={icuCandidates.length}
          tone={icuCandidates.length > icuAvailable ? "crit" : "ok"}
          foot={icuCandidates.length > icuAvailable ? "Demand exceeds available beds" : "Within available capacity"} />
        <StatTile label="Active network events" value={resources?.active_events.length ?? "—"}
          foot="Outbreak, mass casualty, transit disruption" />
      </div>

      {error ? <Notice tone="crit" title="Resource state unavailable"><p className="mt-0.5">{error}</p></Notice> : null}

      <section className="paper-card p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <SectionLabel>Bed status</SectionLabel>
            <p className="mt-1 text-[13px] text-ink-3">
              Critical beds are prioritised first. General beds absorb overflow when available.
            </p>
          </div>
          <Button variant="outline" className="h-9 rounded-full" onClick={() => void load()}>
            <RefreshCw /> Reload
          </Button>
        </div>

        {loading && !resources ? (
          <div className="mt-5"><EmptyState title="Loading capacity" hint="Reading the resource service." /></div>
        ) : resources ? (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {resources.hospitals.map((hospital) => (
              <div key={hospital.hospital_id} className="rounded-[--radius-lg] border p-5" style={{ borderColor: "var(--rule)" }}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-[15px] font-semibold">{hospital.hospital_id.replace(/_/g, " ")}</strong>
                  <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                    style={
                      hospital.icu.available === 0
                        ? { background: "var(--crit-wash)", color: "var(--crit-ink)" }
                        : { background: "var(--ok-wash)", color: "var(--ok-ink)" }
                    }>
                    {hospital.icu.available === 0 ? "ICU full" : `${hospital.icu.available} ICU free`}
                  </span>
                </div>
                <div className="mt-4 space-y-3.5">
                  <CapacityMeter label="ICU beds" used={hospital.icu.occupied} total={hospital.icu.total} />
                  <CapacityMeter label="ED beds" used={hospital.ed.occupied} total={hospital.ed.total} />
                  <CapacityMeter label="Doctors on shift"
                    used={hospital.staff.doctors.scheduled - hospital.staff.doctors.available}
                    total={hospital.staff.doctors.scheduled} note={`${hospital.staff.doctors.scheduled} scheduled`} />
                  <CapacityMeter label="Nurses on shift"
                    used={hospital.staff.nurses.scheduled - hospital.staff.nurses.available}
                    total={hospital.staff.nurses.scheduled} note={`${hospital.staff.nurses.scheduled} scheduled`} />
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="paper-card p-6">
          <SectionLabel>Active events</SectionLabel>
          <p className="mt-1 text-[13px] text-ink-3">What is driving the current capacity picture.</p>
          {resources?.active_events.length ? (
            <div className="mt-4 space-y-2.5">
              {resources.active_events.map((event) => (
                <Notice key={event.type} tone={event.severity === "HIGH" ? "crit" : "warn"} title={titleCase(event.type)}>
                  <p className="mt-0.5">
                    {event.severity ? `Severity ${titleCase(event.severity)}. ` : ""}
                    {event.casualties !== undefined ? `${event.casualties} casualties. ` : ""}
                    {event.staff_unavailable_pct !== undefined ? `${event.staff_unavailable_pct}% of staff unable to reach site.` : ""}
                  </p>
                </Notice>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState title="No active events" hint="The network is operating without an outbreak, mass-casualty, or transit incident." />
            </div>
          )}
        </section>

        <section className="paper-card p-6">
          <SectionLabel>Constraints and alternatives</SectionLabel>
          <p className="mt-1 text-[13px] text-ink-3">
            A request the network cannot satisfy stays visible, with the option that replaces it.
          </p>
          {resources?.infeasibilities.length ? (
            <div className="mt-4 space-y-3">
              {resources.infeasibilities.map((entry) => (
                <div key={entry.request} className="rounded-[--radius-lg] border p-4" style={{ borderColor: "var(--rule)" }}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <strong className="text-[13.5px] font-semibold">{entry.request}</strong>
                    <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                      style={{ background: "var(--crit-wash)", color: "var(--crit-ink)" }}>
                      {titleCase(entry.status)}
                    </span>
                  </div>
                  <p className="mt-2 text-[13px] text-ink-3">{entry.reason}</p>
                  <p className="mt-2 text-[13px] font-medium">Alternative: {entry.alternative}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState title="No blocked requests" hint="Every routing option the engine suggested is currently feasible." />
            </div>
          )}
        </section>
      </div>

      {icuCandidates.length ? (
        <section className="paper-card overflow-hidden">
          <div className="p-6 pb-4">
            <SectionLabel>Patients the engine would place in ICU</SectionLabel>
            <p className="mt-1 text-[13px] text-ink-3">
              The demand behind the numbers above. Selecting a patient returns to their assessment.
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead><TableHead>Preferred</TableHead><TableHead>Constraint</TableHead>
                  <TableHead>Alternative</TableHead><TableHead>Network option</TableHead><TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {icuCandidates.map((item) => (
                  <TableRow key={item.patient_id}>
                    <TableCell>
                      <div className="font-mono text-[13px] font-medium">{item.patient_id}</div>
                      <div className="text-[12px] text-ink-3 tnum">Band {item.protocol_band} · rank {item.global_rank}</div>
                    </TableCell>
                    <TableCell>{item.resource_recommendation.preferred}</TableCell>
                    <TableCell style={{ color: "var(--crit-ink)" }}>{item.resource_recommendation.constraint ?? "—"}</TableCell>
                    <TableCell>{item.resource_recommendation.alternative ?? "—"}</TableCell>
                    <TableCell>{item.resource_recommendation.network_option ?? "—"}</TableCell>
                    <TableCell>
                      <Button asChild variant="ghost" size="sm" className="rounded-full">
                        <Link to={`/?patient=${encodeURIComponent(item.patient_id)}`}>Back to patient</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
