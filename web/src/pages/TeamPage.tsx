/** Accounts and roles — the doctor-only view.
 *
 * Creating an account grants clinical access, and removing one revokes a live session, so both write
 * to the audit log. The page states what each role can do rather than leaving it to be discovered by
 * hitting a 403.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Trash2, UserPlus } from "lucide-react";
import { ApiError, api } from "@/api/client";
import type { AuthUser, Role } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { EmptyState, Notice, SectionLabel, StatTile, dateTime } from "@/components/clinical";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ROLE_SUMMARY: Record<Role, string> = {
  NURSE: "Runs intake and the queue: registers arrivals, records observations, and makes a documented accept or override decision.",
  DOCTOR: "Everything a nurse can do, and also manages accounts and resets the demonstration data.",
};

export function TeamPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: "ok" | "crit"; title: string; body?: string } | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [role, setRole] = useState<Role>("NURSE");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers((await api.users()).users);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Accounts unavailable");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const passwordTooShort = password.length > 0 && password.length < 8;
  const canSubmit = Boolean(email.trim() && name.trim() && password.length >= 8) && !busy;

  const create = async () => {
    setBusy(true);
    setFlash(null);
    try {
      const created = await api.createUser({ email: email.trim(), name: name.trim(), password, role, title: title.trim() });
      setFlash({ tone: "ok", title: `${created.name} can now sign in`, body: `${created.email} · ${created.role.toLowerCase()}` });
      setEmail(""); setName(""); setTitle(""); setPassword("");
      await load();
    } catch (cause) {
      setFlash({ tone: "crit", title: "Account not created", body: cause instanceof ApiError ? cause.message : String(cause) });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (target: AuthUser) => {
    setFlash(null);
    try {
      await api.deleteUser(target.user_id);
      setFlash({ tone: "ok", title: `${target.name} removed`, body: "Any live session for that account stops working immediately." });
      await load();
    } catch (cause) {
      setFlash({ tone: "crit", title: "Account not removed", body: cause instanceof ApiError ? cause.message : String(cause) });
    }
  };

  const counts = useMemo(
    () => ({
      doctors: users.filter((user) => user.role === "DOCTOR").length,
      nurses: users.filter((user) => user.role === "NURSE").length,
    }),
    [users],
  );

  return (
    <div className="space-y-6">
      {flash ? <Notice tone={flash.tone} title={flash.title}>{flash.body ? <p className="mt-0.5">{flash.body}</p> : null}</Notice> : null}
      {error ? <Notice tone="crit" title="Accounts unavailable"><p className="mt-0.5">{error}</p></Notice> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Accounts" value={users.length} foot="With access to the triage console" />
        <StatTile label="Doctors" value={counts.doctors} foot="Full access including account management" />
        <StatTile label="Nurses" value={counts.nurses} foot="Clinical access: intake, queue, decisions" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <section className="paper-card p-6">
          <SectionLabel>Add an account</SectionLabel>
          <p className="mt-1 text-[13px] text-ink-3">
            Creating an account grants clinical access straight away and is written to the audit log.
          </p>

          <div className="mt-5 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-name">Full name</Label>
              <Input id="new-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="K. Iyer" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-email">Email</Label>
              <Input id="new-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)}
                placeholder="k.iyer@sundara.health" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="new-role">Role</Label>
                <Select value={role} onValueChange={(value) => setRole(value as Role)}>
                  <SelectTrigger id="new-role" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NURSE">Nurse</SelectItem>
                    <SelectItem value="DOCTOR">Doctor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new-title">Title</Label>
                <Input id="new-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Triage nurse" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">Temporary password</Label>
              <Input id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters" aria-invalid={passwordTooShort} />
              {passwordTooShort ? (
                <p className="text-[12px] font-medium" style={{ color: "var(--crit-ink)" }}>
                  Must be at least 8 characters.
                </p>
              ) : null}
            </div>

            <div className="rounded-[--radius-lg] p-3.5 text-[12.5px] leading-relaxed text-ink-2"
              style={{ background: "var(--surface-sunken)" }}>
              <strong className="font-semibold">{role === "DOCTOR" ? "Doctor" : "Nurse"}</strong> — {ROLE_SUMMARY[role]}
            </div>

            <Button onClick={() => void create()} disabled={!canSubmit} className="rounded-full">
              <UserPlus /> {busy ? "Creating…" : "Create account"}
            </Button>
          </div>
        </section>

        <section className="paper-card overflow-hidden">
          <div className="flex flex-wrap items-end justify-between gap-3 p-6 pb-4">
            <div>
              <SectionLabel>Accounts</SectionLabel>
              <p className="mt-1 text-[13px] text-ink-3">Removing an account revokes its live session immediately.</p>
            </div>
            <Button variant="outline" className="h-9 rounded-full" onClick={() => void load()}>
              <RefreshCw /> Reload
            </Button>
          </div>

          {loading && !users.length ? (
            <div className="px-6 pb-6"><EmptyState title="Loading accounts" hint="Reading the credential store." /></div>
          ) : users.length === 0 ? (
            <div className="px-6 pb-6"><EmptyState title="No accounts" hint="Create one with the form beside this list." /></div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead><TableHead>Role</TableHead>
                    <TableHead>Email</TableHead><TableHead>Created</TableHead><TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => {
                    const self = user.user_id === me?.user_id;
                    return (
                      <TableRow key={user.user_id}>
                        <TableCell>
                          <div className="font-medium">{user.name}</div>
                          <div className="text-[12px] text-ink-3">{user.title || "—"}</div>
                        </TableCell>
                        <TableCell>
                          <span className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
                            style={
                              user.role === "DOCTOR"
                                ? { background: "var(--accent-wash)", color: "var(--accent-ink)" }
                                : { background: "var(--surface-sunken)", color: "var(--ink-2)" }
                            }>
                            {user.role === "DOCTOR" ? "Doctor" : "Nurse"}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-[12px]">{user.email}</TableCell>
                        <TableCell className="whitespace-nowrap tnum">{dateTime(user.created_at)}</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" className="rounded-full" disabled={self}
                            title={self ? "You cannot remove your own account" : "Remove this account"}
                            onClick={() => void remove(user)}>
                            <Trash2 /> {self ? "You" : "Remove"}
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
    </div>
  );
}
