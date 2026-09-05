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
import type { ResourceState, StaffingPlan } from "@/api/types";
import { CapacityMeter, EmptyState, Notice, SectionLabel, StatTile, titleCase } from "@/components/clinical";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { QueueState } from "@/hooks/useQueue";

export function BedsPage({ queue }: { queue: QueueState }) {
  const [resources, setResources] = useState<ResourceState | null>(null);
  const [staffing, setStaffing] = useState<StaffingPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [staffingError, setStaffingError] = useState<string | null>(null);
  const [afterStrike, setAfterStrike] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (at?: string) => {
    setLoading(true);
    // Settled, not all: a staffing failure must never blank the bed table beside it.
    const [capacity, plan] = await Promise.allSettled([api.resources(), api.staffingPlan(at)]);
    if (capacity.status === "fulfilled") {
      setResources(capacity.value);
      setError(null);
    } else {
      setError(capacity.reason instanceof Error ? capacity.reason.message : "Resource state unavailable");
    }
    if (plan.status === "fulfilled") {
      setStaffing(plan.value);
      setStaffingError(null);
    } else {
      setStaffingError(plan.reason instanceof Error ? plan.reason.message : "Staffing plan unavailable");
    }
    setLoading(false);
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
                  {/* Scheduled and available are both named. The gap is staff who cannot reach site
                      tonight — not staff who are occupied, and never a comment on any individual. */}
                  <CapacityMeter label="Doctors reachable tonight"
                    used={hospital.staff.doctors.scheduled - hospital.staff.doctors.available}
                    total={hospital.staff.doctors.scheduled}
                    note={`${hospital.staff.doctors.scheduled} scheduled · ${hospital.staff.doctors.available} available`} />
                  <CapacityMeter label="Nurses reachable tonight"
                    used={hospital.staff.nurses.scheduled - hospital.staff.nurses.available}
                    total={hospital.staff.nurses.scheduled}
                    note={`${hospital.staff.nurses.scheduled} scheduled · ${hospital.staff.nurses.available} available`} />
                  <p className="text-[11.5px] text-ink-3">
                    {hospital.staff.nurses.scheduled - hospital.staff.nurses.available} nurses and{" "}
                    {hospital.staff.doctors.scheduled - hospital.staff.doctors.available} doctors cannot reach this
                    site tonight — transit strike.
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="paper-card p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <SectionLabel>Staffing tonight</SectionLabel>
            <p className="mt-1 text-[13px] text-ink-3">
              What can be done with the staff who are actually here, and what the strike makes impossible.
            </p>
          </div>
          <Button variant="outline" className="h-9 rounded-full"
            onClick={() => {
              const next = !afterStrike;
              setAfterStrike(next);
              void load(next ? staffing?.strike_context.window.end : undefined);
            }}>
            {afterStrike ? "Show during strike" : "Evaluate after 06:00"}
          </Button>
        </div>

        {staffingError ? (
          <div className="mt-4">
            <Notice tone="warn" title="Staffing plan unavailable">
              <p className="mt-0.5">{staffingError} Capacity figures above are unaffected.</p>
            </Notice>
          </div>
        ) : null}

        {staffing ? (
          <>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatTile label="Effective cover" value={staffing.pressure.compounded.effective_cover_pct} unit="%"
                tone="warn" foot={`${staffing.pressure.chronic_baseline.pct}% chronic and ${staffing.pressure.tonight_additional.pct}% strike compound, they do not add`} />
              <StatTile label="Blocked reassignments" value={staffing.plan.infeasible_actions.length}
                tone={staffing.plan.infeasible_actions.length ? "crit" : "ok"}
                foot={staffing.plan.infeasible_actions.length ? "Named below with an alternative" : "Every corridor is open"} />
              <StatTile label="Actions available" value={staffing.plan.feasible_actions.length}
                foot="Each awaits charge-nurse confirmation" />
              <StatTile label="Still short after the plan"
                value={Object.values(staffing.plan.residual.shortfall).reduce((a, b) => a + b, 0)}
                foot="Across every hospital and role" />
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {staffing.hospitals.map((hospital) => (
                <div key={hospital.hospital_id} className="rounded-[--radius-lg] border p-5" style={{ borderColor: "var(--rule)" }}>
                  <strong className="text-[15px] font-semibold">{hospital.hospital_id.replace(/_/g, " ")}</strong>
                  <div className="mt-4 space-y-3.5">
                    <CapacityMeter label="Nurses required vs available"
                      used={hospital.demand.required_nurses} total={hospital.staff.nurses.available}
                      note={hospital.shortfall.nurses ? `${hospital.shortfall.nurses} short` : "covered"} />
                    <CapacityMeter label="Doctors required vs available"
                      used={hospital.demand.required_doctors} total={hospital.staff.doctors.available}
                      note={hospital.shortfall.doctors ? `${hospital.shortfall.doctors} short` : "covered"} />
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-[12px] text-ink-3">How this number was reached</summary>
                    <ul className="mt-2 space-y-1 text-[12px] text-ink-3">
                      {hospital.demand.derivation.map((line) => <li key={line}>{line}</li>)}
                    </ul>
                    <p className="mt-2 text-[11.5px] text-ink-3">{hospital.demand.parameter_source}</p>
                  </details>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <SectionLabel>What we can do tonight</SectionLabel>
              {staffing.plan.feasible_actions.length ? (
                <div className="mt-3 space-y-3">
                  {staffing.plan.feasible_actions.map((action) => (
                    <div key={action.action_id} className="rounded-[--radius-lg] border p-4" style={{ borderColor: "var(--rule)" }}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <strong className="text-[13.5px] font-semibold">
                          {action.type === "PATIENT_REDIRECTION"
                            ? `Redirect ${action.patient_count} eligible arrivals to ${action.to_hospital?.replace(/_/g, " ")}`
                            : action.type === "WITHIN_HOSPITAL_REDEPLOYMENT"
                              ? `Redeploy ${action.count} nurses inside ${action.hospital_id?.replace(/_/g, " ")}`
                              : `Reassign ${action.count} ${action.role?.toLowerCase()}s to ${action.to_hospital?.replace(/_/g, " ")}`}
                        </strong>
                        <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                          style={{ background: "var(--ok-wash)", color: "var(--ok-ink)" }}>
                          {action.corridor_required ? "Corridor open" : "No corridor needed"}
                        </span>
                      </div>
                      <p className="mt-2 text-[13px] text-ink-3">{action.reason}</p>
                      {action.cost ? <p className="mt-2 text-[13px]" style={{ color: "var(--warn-ink)" }}>Cost: {action.cost}</p> : null}
                      <p className="mt-2 text-[11.5px] text-ink-3">
                        {action.verb} · awaiting {titleCase(action.requires_confirmation_by)}
                        {action.basis ? ` · ${action.basis}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3">
                  <EmptyState title="No reallocation needed" hint="Every hospital is covered by the staff already on site." />
                </div>
              )}
            </div>

            <div className="mt-5">
              <Notice tone="crit" title="What cannot be done tonight">
                <p className="mt-0.5">{staffing.plan.residual.statement}</p>
                <p className="mt-2">Escalate to: {staffing.plan.residual.escalate_to}</p>
              </Notice>
              <p className="mt-3 text-[11.5px] text-ink-3">
                {staffing.authority.statement} Counts are role totals per unit; no individual is named or tracked.
              </p>
            </div>
          </>
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
