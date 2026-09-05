/** Registering a new arrival.
 *
 * Structured rather than long: identity and observations first, pathway-specific fields only once a
 * pathway is chosen. A value that was not taken stays blank and is sent as `null`, which the backend
 * records as missing — never as a normal reading, because a silently-normal missing value is exactly
 * how a triage system reports false safety.
 *
 * Ranges are checked beside the field, and everything typed survives a failed request.
 */
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { ApiError, api } from "@/api/client";
import type { ArrivalMode, Assessment, Pathway, Sex } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Notice, SectionLabel } from "./clinical";

type VitalKey = "heart_rate" | "systolic_bp" | "diastolic_bp" | "spo2" | "respiratory_rate" | "temperature_c" | "gcs";

const VITALS: { key: VitalKey; label: string; unit: string; min: number; max: number; placeholder: string }[] = [
  { key: "heart_rate", label: "Heart rate", unit: "bpm", min: 1, max: 300, placeholder: "128" },
  { key: "systolic_bp", label: "Systolic BP", unit: "mmHg", min: 30, max: 300, placeholder: "94" },
  { key: "diastolic_bp", label: "Diastolic BP", unit: "mmHg", min: 10, max: 200, placeholder: "62" },
  { key: "spo2", label: "Oxygen saturation", unit: "%", min: 0, max: 100, placeholder: "89" },
  { key: "respiratory_rate", label: "Respiratory rate", unit: "/min", min: 1, max: 80, placeholder: "29" },
  { key: "temperature_c", label: "Temperature", unit: "°C", min: 25, max: 45, placeholder: "39.4" },
  { key: "gcs", label: "GCS", unit: "3–15", min: 3, max: 15, placeholder: "14" },
];

const PATHWAYS: { value: Pathway; label: string }[] = [
  { value: "GENERAL", label: "General" },
  { value: "DENGUE", label: "Dengue" },
  { value: "BURN_SMOKE", label: "Burn / smoke" },
  { value: "TRAUMA", label: "Trauma" },
];

const BLANK: Record<VitalKey, string> = {
  heart_rate: "", systolic_bp: "", diastolic_bp: "", spo2: "", respiratory_rate: "", temperature_c: "", gcs: "",
};

export function IntakeForm({ onCreated, onCancel }: { onCreated: (assessment: Assessment) => void; onCancel: () => void }) {
  const [patientId, setPatientId] = useState("");
  const [age, setAge] = useState("");
  const [sex, setSex] = useState<Sex>("UNKNOWN");
  const [hospital, setHospital] = useState("SUNDARA_CENTRAL");
  const [arrivalMode, setArrivalMode] = useState<ArrivalMode>("AMBULANCE");
  const [isNewPatient, setIsNewPatient] = useState(false);
  const [complaint, setComplaint] = useState("");
  const [pathway, setPathway] = useState<Pathway>("GENERAL");
  const [band, setBand] = useState("3");
  const [vitals, setVitals] = useState<Record<VitalKey, string>>(BLANK);
  const [plateletTrend, setPlateletTrend] = useState("");
  const [dengueStatus, setDengueStatus] = useState("UNKNOWN");
  const [tbsa, setTbsa] = useState("");
  const [smoke, setSmoke] = useState(false);
  const [airway, setAirway] = useState("UNKNOWN");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const errors = useMemo(() => {
    const found: Record<string, string> = {};
    if (!patientId.trim()) found.patientId = "Patient ID is required.";
    const ageValue = Number(age);
    if (!age.trim() || Number.isNaN(ageValue) || ageValue < 0 || ageValue > 130) found.age = "Age must be 0–130.";
    for (const vital of VITALS) {
      const raw = vitals[vital.key];
      if (!raw.trim()) continue; // Blank is "not yet measured", which is a valid answer.
      const value = Number(raw);
      if (Number.isNaN(value) || value < vital.min || value > vital.max) {
        found[vital.key] = `Must be ${vital.min}–${vital.max}.`;
      }
    }
    if (!VITALS.some((vital) => vitals[vital.key].trim())) {
      found.vitals = "Record at least one observation; the engine needs one to assess.";
    }
    return found;
  }, [patientId, age, vitals]);

  const submit = async () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    setBusy(true);
    setServerError(null);

    const pathwayDetail: Record<string, unknown> = {};
    if (pathway === "DENGUE") {
      pathwayDetail.dengue_status = dengueStatus;
      const trend = plateletTrend.split(/[,\s]+/).map(Number).filter((value) => Number.isFinite(value) && value > 0);
      if (trend.length) pathwayDetail.platelet_trend = trend;
    }
    if (pathway === "BURN_SMOKE") {
      if (tbsa.trim()) pathwayDetail.tbsa_pct = Number(tbsa);
      pathwayDetail.smoke_inhalation = smoke;
      pathwayDetail.airway_concern = airway;
    }

    try {
      const assessment = await api.createPatient({
        patient_id: patientId.trim(),
        hospital_id: hospital,
        age: Number(age),
        sex,
        arrival_mode: arrivalMode,
        is_new_patient: isNewPatient,
        chief_complaint: complaint.trim(),
        pathway,
        protocol_band: Number(band),
        symptoms: {},
        known_conditions: pathway === "DENGUE" ? { dengue: dengueStatus } : {},
        pathway_detail: pathwayDetail,
        notes: notes.trim(),
        vitals: {
          source: "MANUAL",
          ...Object.fromEntries(
            VITALS.map((vital) => {
              const raw = vitals[vital.key].trim();
              return [vital.key, { value: raw ? Number(raw) : null }];
            }),
          ),
        },
      });
      onCreated(assessment);
    } catch (cause) {
      // Everything typed stays on screen; a failed request must not cost the nurse the intake.
      setServerError(cause instanceof ApiError ? cause.message : "The patient was not created.");
    } finally {
      setBusy(false);
    }
  };

  const errorFor = (key: string) => (touched ? errors[key] : undefined);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field id="patient-id" label="Patient ID" error={errorFor("patientId")}>
          <Input id="patient-id" value={patientId} onChange={(event) => setPatientId(event.target.value)}
            placeholder="P-1055" className="font-mono" aria-invalid={Boolean(errorFor("patientId"))} />
        </Field>
        <Field id="age" label="Age" error={errorFor("age")}>
          <Input id="age" value={age} onChange={(event) => setAge(event.target.value)} inputMode="numeric"
            placeholder="46" aria-invalid={Boolean(errorFor("age"))} />
        </Field>
        <Field id="sex" label="Sex">
          <Select value={sex} onValueChange={(value) => setSex(value as Sex)}>
            <SelectTrigger id="sex" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="UNKNOWN">Unknown</SelectItem>
              <SelectItem value="F">Female</SelectItem>
              <SelectItem value="M">Male</SelectItem>
              <SelectItem value="OTHER">Other</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field id="hospital" label="Hospital">
          <Select value={hospital} onValueChange={setHospital}>
            <SelectTrigger id="hospital" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="SUNDARA_CENTRAL">Sundara Central</SelectItem>
              <SelectItem value="SUNDARA_NORTH">Sundara North</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field id="arrival" label="Arrival mode">
          <Select value={arrivalMode} onValueChange={(value) => setArrivalMode(value as ArrivalMode)}>
            <SelectTrigger id="arrival" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="AMBULANCE">Ambulance</SelectItem>
              <SelectItem value="WALK_IN">Walk-in</SelectItem>
              <SelectItem value="TRANSFER">Transfer</SelectItem>
              <SelectItem value="UNKNOWN">Unknown</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field id="band" label="Protocol band">
          <Select value={band} onValueChange={setBand}>
            <SelectTrigger id="band" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5].map((value) => (
                <SelectItem key={value} value={String(value)}>
                  Band {value}{value === 1 ? " — most urgent" : value === 5 ? " — least urgent" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field id="complaint" label="Chief complaint">
        <Input id="complaint" value={complaint} onChange={(event) => setComplaint(event.target.value)}
          placeholder="Shortness of breath and high fever" />
      </Field>

      <label className="flex items-center gap-2.5 text-[13.5px] font-medium text-ink-2">
        <input type="checkbox" checked={isNewPatient} onChange={(event) => setIsNewPatient(event.target.checked)}
          className="h-4 w-4 accent-[--accent]" />
        New to the system — no previous records
      </label>

      <div>
        <Separator className="mb-5" />
        <SectionLabel>Initial observations</SectionLabel>
        <p className="mt-1 mb-4 text-[12.5px] text-ink-3">
          Leave a field blank when it has not been measured. Blank is recorded as missing, never as normal.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {VITALS.map((vital) => (
            <Field key={vital.key} id={vital.key} label={`${vital.label} (${vital.unit})`} error={errorFor(vital.key)}>
              <Input id={vital.key} value={vitals[vital.key]} placeholder={vital.placeholder} inputMode="decimal"
                aria-invalid={Boolean(errorFor(vital.key))} className="tnum"
                onChange={(event) => setVitals((current) => ({ ...current, [vital.key]: event.target.value }))} />
            </Field>
          ))}
        </div>
        {errorFor("vitals") ? (
          <p className="mt-3 text-[12px] font-medium" style={{ color: "var(--crit-ink)" }}>{errors.vitals}</p>
        ) : null}
      </div>

      <div>
        <Separator className="mb-5" />
        <SectionLabel>Pathway</SectionLabel>
        <p className="mt-1 mb-4 text-[12.5px] text-ink-3">Pathway-specific detail appears once a pathway is selected.</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field id="pathway" label="Pathway">
            <Select value={pathway} onValueChange={(value) => setPathway(value as Pathway)}>
              <SelectTrigger id="pathway" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PATHWAYS.map((entry) => <SelectItem key={entry.value} value={entry.value}>{entry.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>

          {pathway === "DENGUE" ? (
            <>
              <Field id="dengue" label="Dengue status">
                <Select value={dengueStatus} onValueChange={setDengueStatus}>
                  <SelectTrigger id="dengue" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNKNOWN">Unknown</SelectItem>
                    <SelectItem value="SUSPECTED">Suspected</SelectItem>
                    <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                    <SelectItem value="DENIED">Denied</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field id="platelets" label="Platelet trend" hint="Oldest first. Blank if no trend is available.">
                <Input id="platelets" value={plateletTrend} onChange={(event) => setPlateletTrend(event.target.value)}
                  placeholder="128000, 110000, 96000" className="tnum" />
              </Field>
            </>
          ) : null}

          {pathway === "BURN_SMOKE" ? (
            <>
              <Field id="tbsa" label="Burn area (TBSA %)">
                <Input id="tbsa" value={tbsa} onChange={(event) => setTbsa(event.target.value)} inputMode="decimal"
                  placeholder="24" className="tnum" />
              </Field>
              <Field id="airway" label="Airway concern">
                <Select value={airway} onValueChange={setAirway}>
                  <SelectTrigger id="airway" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UNKNOWN">Unknown</SelectItem>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MODERATE">Moderate</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <label className="flex items-end gap-2.5 pb-2.5 text-[13.5px] font-medium text-ink-2">
                <input type="checkbox" checked={smoke} onChange={(event) => setSmoke(event.target.checked)}
                  className="h-4 w-4 accent-[--accent]" />
                Smoke inhalation
              </label>
            </>
          ) : null}
        </div>
      </div>

      <Field id="notes" label="Clinical note">
        <Textarea id="notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)}
          placeholder="Anything the observations above do not capture." />
      </Field>

      {serverError ? (
        <Notice tone="crit" title="The patient was not created"><p className="mt-0.5">{serverError}</p></Notice>
      ) : null}

      <div className="flex flex-wrap gap-2.5">
        <Button onClick={() => void submit()} disabled={busy} className="rounded-full">
          <Plus /> {busy ? "Creating…" : "Create and assess"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy} className="rounded-full">Cancel</Button>
      </div>
    </div>
  );
}

function Field({
  id, label, error, hint, children,
}: { id: string; label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={cn(error && "text-[--crit-ink]")}>{label}</Label>
      {children}
      {error ? <p className="text-[12px] font-medium" style={{ color: "var(--crit-ink)" }}>{error}</p> : null}
      {hint && !error ? <p className="text-[12px] text-ink-3">{hint}</p> : null}
    </div>
  );
}
