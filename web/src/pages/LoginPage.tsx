/** Sign-in.
 *
 * The seeded accounts are offered as one-click buttons because this is a synthetic demonstration and
 * a presenter should not be typing credentials in front of an audience. The panel says plainly that
 * these are demonstration accounts, and the backend stops serving them when `SUNDARA_DEMO_LOGINS=0`,
 * so the same build can be shown without handing out working logins.
 */
import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck, Stethoscope, UserRound } from "lucide-react";
import { ApiError, api } from "@/api/client";
import type { DemoAccount } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { Notice, SectionLabel } from "@/components/clinical";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [demo, setDemo] = useState<DemoAccount[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.demoAccounts()
      .then((response) => !cancelled && setDemo(response.enabled ? response.accounts : []))
      .catch(() => {
        // The service may simply be down; the manual form still works once it is back.
        if (!cancelled) setDemo([]);
      });
    return () => { cancelled = true; };
  }, []);

  const attempt = async (withEmail: string, withPassword: string, marker: string) => {
    setBusy(marker);
    setError(null);
    try {
      await signIn(withEmail, withPassword);
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.status === 0
          ? `${cause.message}. Start the backend, then try again.`
          : cause instanceof Error
            ? cause.message
            : "Sign-in failed.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Left: what this is, stated before anyone signs in. */}
      <section className="flex flex-col justify-between gap-10 px-8 py-12 lg:px-14 lg:py-16"
        style={{ background: "var(--surface)" }}>
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-[8px] text-white" style={{ background: "var(--accent)" }}>
            <ShieldCheck size={16} strokeWidth={2.5} />
          </span>
          <span className="text-[14px] font-semibold tracking-tight">Sundara Command</span>
        </div>

        <div className="max-w-[34ch]">
          <h1 className="text-[2.6rem] leading-[1.05] font-semibold tracking-[-0.035em]">
            Decide what to review
            <span style={{ color: "var(--accent)" }}> first</span>.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-ink-2">
            A triage queue that separates how sick a patient may be from how much the estimate can be
            trusted — and records the clinician who made the call.
          </p>
          <ul className="mt-7 space-y-3 text-[13.5px] text-ink-2">
            {[
              "Deterioration risk and prediction reliability, never merged into one score",
              "Low reliability changes the advice, never the patient's place in the queue",
              "Every assessment and decision hash-chained into an append-only log",
            ].map((line) => (
              <li key={line} className="flex gap-2.5">
                <span className="mt-[3px] shrink-0" style={{ color: "var(--accent)" }}>✓</span>
                {line}
              </li>
            ))}
          </ul>
        </div>

        <p className="max-w-[46ch] text-[12px] leading-relaxed text-ink-3">
          Synthetic data. Not a medical device, not a diagnosis tool, and not connected to a hospital
          system. Every recommendation is advisory and subject to clinician approval.
        </p>
      </section>

      {/* Right: the actual sign-in. */}
      <section className="flex items-center justify-center px-6 py-12 lg:px-14">
        <div className="w-full max-w-[26rem]">
          <SectionLabel>Sign in</SectionLabel>
          <h2 className="mt-2 text-[1.6rem] font-semibold tracking-tight">Emergency department console</h2>
          <p className="mt-2 text-[13.5px] text-ink-3">
            Your role decides what you can do. Nurses run intake and the queue; doctors also manage
            accounts and the demonstration data.
          </p>

          {demo.length ? (
            <div className="mt-7">
              <SectionLabel>Demonstration accounts</SectionLabel>
              <div className="mt-2.5 space-y-2">
                {demo.map((account) => (
                  <button key={account.email} type="button" disabled={Boolean(busy)}
                    onClick={() => void attempt(account.email, account.password, account.email)}
                    className="focus-ring group flex w-full items-center gap-3 rounded-[--radius-lg] border px-4 py-3 text-left transition-colors hover:bg-[--surface-sunken] disabled:opacity-60"
                    style={{ borderColor: "var(--rule)", background: "var(--surface)" }}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
                      style={{ background: "var(--accent-wash)", color: "var(--accent-ink)" }}>
                      {account.role === "DOCTOR" ? <Stethoscope size={16} /> : <UserRound size={16} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold">{account.name}</span>
                      <span className="block text-[12px] text-ink-3">
                        {account.title} · {account.role === "DOCTOR" ? "full access" : "clinical access"}
                      </span>
                    </span>
                    <ArrowRight size={16} className="shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
              <p className="mt-2.5 text-[11.5px] text-ink-3">
                Fixed credentials for a synthetic demonstration. Disabled by setting
                <span className="font-mono"> SUNDARA_DEMO_LOGINS=0</span>.
              </p>
            </div>
          ) : null}

          <div className="my-7 flex items-center gap-3">
            <span className="h-px flex-1" style={{ background: "var(--rule)" }} />
            <span className="text-[11.5px] text-ink-3">or sign in manually</span>
            <span className="h-px flex-1" style={{ background: "var(--rule)" }} />
          </div>

          <form className="space-y-4"
            onSubmit={(event) => { event.preventDefault(); void attempt(email, password, "manual"); }}>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="username" value={email}
                onChange={(event) => setEmail(event.target.value)} placeholder="you@sundara.health" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password}
                onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" />
            </div>
            {error ? <Notice tone="crit" title="Could not sign in"><p className="mt-0.5">{error}</p></Notice> : null}
            <Button type="submit" className="w-full rounded-full" disabled={Boolean(busy) || !email || !password}>
              {busy === "manual" ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </section>
    </div>
  );
}
