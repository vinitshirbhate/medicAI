/** Recording a clinician decision that differs from the recommendation.
 *
 * The original recommendation stays on screen while the reason is captured — an override is a
 * documented clinical judgement, not a dismissal — and `reason_code` is mandatory, as the backend
 * requires. Nothing is reported as saved until the server confirms it.
 */
import { useState } from "react";
import { ApiError, api } from "@/api/client";
import type { OverrideReason, QueueItem } from "@/api/types";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Notice, percent, titleCase } from "./clinical";

const REASONS: { code: OverrideReason; label: string }[] = [
  { code: "NEW_CLINICAL_INFORMATION", label: "New clinical information" },
  { code: "BEDSIDE_ASSESSMENT_DIFFERS", label: "Bedside assessment differs" },
  { code: "RESOURCE_CONSTRAINT", label: "Resource constraint" },
  { code: "DETERIORATION_OBSERVED", label: "Deterioration observed" },
  { code: "OTHER", label: "Other" },
];

export function OverrideDialog({
  item, actor, onClose, onRecorded,
}: { item: QueueItem; actor: string; onClose: () => void; onRecorded: (message: string) => void }) {
  // A low-reliability assessment arrives with the reason already drafted by the backend.
  const [reasonCode, setReasonCode] = useState<OverrideReason>(
    (item.prefilled_override?.reason_code as OverrideReason) ?? "BEDSIDE_ASSESSMENT_DIFFERS",
  );
  const [reasonText, setReasonText] = useState(item.prefilled_override?.reason_text ?? "");
  const [newRank, setNewRank] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const rank = newRank.trim() ? Number(newRank) : null;
      const response = await api.override(item.patient_id, {
        reason_code: reasonCode,
        reason_text: reasonText,
        new_rank: rank && rank > 0 ? rank : null,
      });
      const due = new Date(response.reassessment_due);
      onRecorded(
        `${response.message} Due ${due.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}.`,
      );
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "The override was not recorded.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Override recommendation</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{item.patient_id}</span> — the recorded decision is yours, and the
            recommendation below stays on the record.
          </DialogDescription>
        </DialogHeader>

        <Notice tone="info" title={item.recommended_action.primary}>
          <p className="mt-0.5 tnum">
            Deterioration risk {percent(item.deterioration_risk)} · prediction reliability{" "}
            {percent(item.prediction_reliability)} · protocol band {item.protocol_band}
          </p>
        </Notice>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="override-reason">Reason (required)</Label>
            <Select value={reasonCode} onValueChange={(value) => setReasonCode(value as OverrideReason)}>
              <SelectTrigger id="override-reason" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map((reason) => <SelectItem key={reason.code} value={reason.code}>{reason.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="override-note">Supporting note</Label>
            <Textarea id="override-note" rows={3} value={reasonText} onChange={(event) => setReasonText(event.target.value)}
              placeholder="What did you see that the recommendation did not account for?" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="override-rank">New rank (optional)</Label>
            <Input id="override-rank" inputMode="numeric" value={newRank} onChange={(event) => setNewRank(event.target.value)}
              placeholder={`Currently ${item.global_rank}`} />
            <p className="text-[12px] text-ink-3">Leave blank to keep the current position.</p>
          </div>

          <p className="text-[12.5px] text-ink-3">Recorded as {actor} · {titleCase(reasonCode)}.</p>

          {error ? (
            <Notice tone="crit" title="The override was not recorded"><p className="mt-0.5">{error}</p></Notice>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy} className="rounded-full">Cancel</Button>
          <Button onClick={() => void submit()} disabled={busy} className="rounded-full">
            {busy ? "Recording…" : "Confirm override"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
