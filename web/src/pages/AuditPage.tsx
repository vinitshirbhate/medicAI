/** The decision record.
 *
 * Every AI assessment and every human decision, in order, with the hash chain that links them. A
 * failed verification is reported plainly: an unverified chain is never presented as trustworthy.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/api/client";
import type { AuditEntry, AuditVerification } from "@/api/types";
import { EmptyState, Notice, SectionLabel, StatTile, dateTime, titleCase } from "@/components/clinical";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ALL = "__all__";

const EVENT_TONE: Record<string, { background: string; color: string }> = {
  OVERRIDE: { background: "var(--warn-wash)", color: "var(--warn-ink)" },
  ACCEPT: { background: "var(--ok-wash)", color: "var(--ok-ink)" },
};
const DEFAULT_TONE = { background: "var(--accent-wash)", color: "var(--accent-ink)" };

export function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [verification, setVerification] = useState<AuditVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [patientFilter, setPatientFilter] = useState(ALL);
  const [typeFilter, setTypeFilter] = useState(ALL);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [log, verified] = await Promise.all([api.audit(), api.verifyAudit()]);
      setEntries(log);
      setVerification(verified);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Audit trail unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const patientIds = useMemo(
    () => [...new Set(entries.map((entry) => entry.patient_id).filter((id): id is string => Boolean(id)))].sort(),
    [entries],
  );
  const eventTypes = useMemo(() => [...new Set(entries.map((entry) => entry.event_type))].sort(), [entries]);

  const rows = useMemo(
    () =>
      [...entries]
        .filter((entry) => (patientFilter === ALL ? true : entry.patient_id === patientFilter))
        .filter((entry) => (typeFilter === ALL ? true : entry.event_type === typeFilter))
        .sort((a, b) => b.seq - a.seq),
    [entries, patientFilter, typeFilter],
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Audit entries" value={entries.length} foot="Append-only and hash-chained" />
        <StatTile label="Human decisions" value={entries.filter((entry) => entry.initiated_by === "HUMAN").length}
          foot="Accepts and overrides recorded by clinicians" />
        <StatTile label="AI assessments" value={entries.filter((entry) => entry.initiated_by === "AI").length}
          foot="Every assessment the engine produced" />
        <StatTile label="Chain status"
          value={<span className="text-[1.5rem]">{verification ? (verification.valid ? "Verified" : "Failed") : "—"}</span>}
          tone={verification ? (verification.valid ? "ok" : "crit") : "muted"}
          foot={verification
            ? verification.valid
              ? "Every link recomputes to its stored hash"
              : `Chain broke at ${verification.failed_at ?? "an unidentified entry"}`
            : "Not yet checked"} />
      </div>

      {verification && !verification.valid ? (
        <Notice tone="crit" title="Audit chain verification failed">
          <p className="mt-0.5">
            The recorded history cannot be shown as trustworthy. Treat the entries below as unverified
            until the chain is re-established.
          </p>
        </Notice>
      ) : null}

      {error ? <Notice tone="crit" title="Audit trail unavailable"><p className="mt-0.5">{error}</p></Notice> : null}

      <section className="paper-card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 p-6 pb-4">
          <div>
            <SectionLabel>Decision audit trail</SectionLabel>
            <p className="mt-1 text-[13px] text-ink-3">
              Timestamp, event, initiator, actor, patient, model version, and the recorded payload.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={patientFilter} onValueChange={setPatientFilter}>
              <SelectTrigger className="h-9 w-[150px] rounded-full text-[13px]" aria-label="Filter by patient">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All patients</SelectItem>
                {patientIds.map((id) => <SelectItem key={id} value={id}>{id}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-[160px] rounded-full text-[13px]" aria-label="Filter by event">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All events</SelectItem>
                {eventTypes.map((type) => <SelectItem key={type} value={type}>{titleCase(type)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" className="h-9 rounded-full" onClick={() => void load()}>
              <RefreshCw /> Verify again
            </Button>
          </div>
        </div>

        {loading && !entries.length ? (
          <div className="px-6 pb-6">
            <EmptyState title="Loading audit trail" hint="Reading the append-only decision log." />
          </div>
        ) : rows.length === 0 ? (
          <div className="px-6 pb-6">
            <EmptyState title="No matching entries" hint="Clear the filters, or record a decision from the triage queue." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seq</TableHead><TableHead>Time</TableHead><TableHead>Event</TableHead>
                  <TableHead>By</TableHead><TableHead>Actor</TableHead><TableHead>Patient</TableHead>
                  <TableHead>Payload</TableHead><TableHead>Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((entry) => (
                  <TableRow key={entry.hash}>
                    <TableCell className="tnum">{entry.seq}</TableCell>
                    <TableCell className="whitespace-nowrap tnum">{dateTime(entry.timestamp)}</TableCell>
                    <TableCell>
                      <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap"
                        style={EVENT_TONE[entry.event_type] ?? DEFAULT_TONE}>
                        {titleCase(entry.event_type)}
                      </span>
                    </TableCell>
                    <TableCell>{entry.initiated_by === "AI" ? "AI" : "Human"}</TableCell>
                    <TableCell>{entry.actor}</TableCell>
                    <TableCell className="font-mono">{entry.patient_id ?? "—"}</TableCell>
                    <TableCell className="max-w-[280px] font-mono text-[11.5px] break-all text-ink-2">
                      {JSON.stringify(entry.payload)}
                    </TableCell>
                    <TableCell className="font-mono text-[11.5px] text-ink-3" title={entry.hash}>
                      {entry.hash.slice(0, 10)}…
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
