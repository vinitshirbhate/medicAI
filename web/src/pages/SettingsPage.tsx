/** Console configuration, record-store health, and the presenter-only demonstration reset.
 *
 * The reset wipes assessments and the audit chain, so it lives here rather than in clinical
 * navigation and requires the word RESET to be typed — a mis-click must not erase a decision record.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api, apiBaseUrl, setApiBaseUrl } from "@/api/client";
import type { SystemStatus } from "@/api/types";
import { Notice, SectionLabel, titleCase } from "@/components/clinical";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SettingsPage({ onReset }: { onReset: () => void }) {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState(apiBaseUrl());
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<{ tone: "ok" | "crit"; title: string; body?: string } | null>(null);

  const load = useCallback(async (refresh = false) => {
    try {
      setStatus(await api.systemStatus(refresh));
      setError(null);
    } catch (cause) {
      setStatus(null);
      setError(cause instanceof Error ? cause.message : "The triage service is not responding");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveBaseUrl = () => {
    setApiBaseUrl(baseUrl);
    setFlash({
      tone: "ok",
      title: "Backend address saved",
      body: "Reload the console for the queue socket to reconnect to the new address.",
    });
    void load();
  };

  const reset = async () => {
    setBusy(true);
    try {
      const response = await api.resetDemo();
      setFlash({
        tone: "ok",
        title: `Demonstration restored with ${response.patients} patients`,
        body: "The synthetic cohort and a fresh audit chain are back in place.",
      });
      setConfirmation("");
      onReset();
      void load();
    } catch (cause) {
      setFlash({ tone: "crit", title: "Nothing was reset", body: cause instanceof Error ? cause.message : String(cause) });
    } finally {
      setBusy(false);
    }
  };

  const mongo = status?.mongodb;

  return (
    <div className="space-y-6">
      {flash ? <Notice tone={flash.tone} title={flash.title}>{flash.body ? <p className="mt-0.5">{flash.body}</p> : null}</Notice> : null}
      {error ? <Notice tone="crit" title="The triage service is not responding"><p className="mt-0.5">{error}</p></Notice> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="paper-card p-6">
          <SectionLabel>Backend connection</SectionLabel>
          <p className="mt-1 text-[13px] text-ink-3">
            Where this console reads the queue, assessments, and audit trail.
          </p>
          <div className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="base-url">API base URL</Label>
              <Input id="base-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)}
                placeholder="http://127.0.0.1:8000" className="font-mono text-[13px]" />
              <p className="text-[12px] text-ink-3">
                Stored in this browser. Clear it to fall back to the VITE_API_BASE_URL build value.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5">
              <Button onClick={saveBaseUrl} className="rounded-full">Save address</Button>
              <Button variant="outline" onClick={() => void load(true)} className="rounded-full">
                <RefreshCw /> Check status
              </Button>
            </div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 text-[13.5px]">
              <dt className="text-ink-3">Service</dt>
              <dd className="font-medium">{status ? `${titleCase(status.api.status)} · ${status.api.mode}` : "Unreachable"}</dd>
              <dt className="text-ink-3">Model version</dt>
              <dd className="font-mono text-[12.5px] font-medium">{status?.api.model_version ?? "—"}</dd>
            </dl>
          </div>
        </section>

        <section className="paper-card p-6">
          <SectionLabel>Patient record store</SectionLabel>
          <p className="mt-1 text-[13px] text-ink-3">
            MongoDB holds patients and observations. Assessments and the audit chain stay in the local
            append-only ledger — a chain whose links can be updated in place proves nothing.
          </p>
          <div className="mt-5">
            {mongo ? (
              mongo.connected ? (
                <Notice tone="ok" title={`Connected to MongoDB · database ${mongo.database}`}>
                  <p className="mt-0.5">Patients created here are written to the cluster and survive an API restart.</p>
                </Notice>
              ) : (
                <Notice tone="warn" title="MongoDB is not connected — running on the local record store">
                  <p className="mt-0.5 font-mono text-[11.5px] break-all">{mongo.reason}</p>
                  <p className="mt-2">
                    The queue still works: the same five synthetic patients are seeded locally. To connect, set
                    MONGODB_URI and MONGODB_PASSWORD in <span className="font-mono">backend/.env</span>, and confirm this
                    machine is on the cluster access list with outbound 27017 open.
                  </p>
                </Notice>
              )
            ) : (
              <p className="text-[13px] text-ink-3">Status unavailable while the service is unreachable.</p>
            )}
            {status ? (
              <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-2 text-[13.5px] sm:grid-cols-4">
                {Object.entries(status.local_store).map(([key, value]) => (
                  <div key={key}>
                    <dt className="label-caps text-[10px]">{titleCase(key)}</dt>
                    <dd className="mt-1 text-[19px] font-semibold tnum">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </section>
      </div>

      <section className="paper-card p-6">
        <SectionLabel>Reset demonstration data</SectionLabel>
        <p className="mt-1 text-[13px] text-ink-3">
          Presenter-only. Clears patients, assessments, and the audit chain, then re-seeds the five
          synthetic patients in both stores.
        </p>
        <div className="mt-5 max-w-md space-y-4">
          <Notice tone="warn" title="This deletes the recorded decision history">
            <p className="mt-0.5">
              Accepts and overrides recorded during the demonstration are removed along with the chain
              that links them.
            </p>
          </Notice>
          <div className="space-y-1.5">
            <Label htmlFor="reset-confirm">Type RESET to confirm</Label>
            <Input id="reset-confirm" value={confirmation} onChange={(event) => setConfirmation(event.target.value)}
              placeholder="RESET" className="font-mono" />
          </div>
          <Button variant="destructive" className="rounded-full" disabled={confirmation !== "RESET" || busy}
            onClick={() => void reset()}>
            {busy ? "Resetting…" : "Reset demonstration data"}
          </Button>
        </div>
      </section>

      <section className="paper-card p-6">
        <SectionLabel>Scope</SectionLabel>
        <p className="mt-3 max-w-[68ch] text-[14px] leading-relaxed text-ink-2">
          Sundara Command is a clinical decision-support demonstration built on synthetic data. It does
          not diagnose, does not act on a patient, and is not connected to a hospital system. It helps a
          clinician decide what to review first, and records the decision they make. Deterioration risk
          and prediction reliability are reported as separate quantities and are never combined into a
          single score.
        </p>
      </section>
    </div>
  );
}
