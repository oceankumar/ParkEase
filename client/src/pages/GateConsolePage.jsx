import { useCallback, useEffect, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import PassScanner from "../components/PassScanner.jsx";
import useMallChoices from "../hooks/useMallChoices.js";
import { passReasons, recordGateOperation, verifyPass } from "../services/operationService.js";
import { formatBookingTime, formatRupees } from "../utils/bookingDisplay.js";

export default function GateConsolePage() {
  const { choices, loading, error, reload } = useMallChoices();
  const [selected, setSelected] = useState("");
  const [locked, setLocked] = useState(false);
  const mall = choices.find((choice) => choice.id === selected) || choices[0];
  return <div className="dashboard-content-grid">
    <PageHeader title="Gate console" description="Verify the driver's pass, check the vehicle, then confirm entry or exit."
      actions={<Button variant="outline" disabled={locked || loading} onClick={reload}>Refresh assignments</Button>} />
    {loading && <p role="status">Loading gate assignments…</p>}
    {error && <p role="alert" className="form-error-text">{error}</p>}
    {!loading && !error && !choices.length && <Card title="No active assignments"><p>Ask your mall owner to assign you to a gate.</p></Card>}
    {!!choices.length && <>
      <Select label="Assigned mall" value={mall.id} disabled={locked || loading} onChange={(event) => setSelected(event.target.value)} options={choices.map((choice) => ({ value: choice.id, label: `${choice.name}${choice.gateLabel ? ` · ${choice.gateLabel}` : ""}` }))} />
      <GateWorkspace key={mall.id} mall={mall} onLock={setLocked} />
    </>}
  </div>;
}

function GateWorkspace({ mall, onLock }) {
  const [action, setAction] = useState("ENTRY");
  const [token, setToken] = useState("");
  const [scanning, setScanning] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { onLock(busy || Boolean(attempt)); return () => onLock(false); }, [busy, attempt, onLock]);
  const scanned = useCallback((value) => { setToken(value); setPreview(null); setError(""); setScanning(false); setResult(null); }, []);

  async function verify(event) {
    event.preventDefault();
    if (busy || attempt) return;
    setBusy(true); setPreview(null); setError(""); setResult(null); setScanning(false);
    try { setPreview(await verifyPass(mall.id, token.trim(), action)); }
    catch (err) { setError(passReasons[err.data?.error?.code] || err.message); }
    finally { setBusy(false); }
  }

  async function submit(request) {
    if (busy) return;
    setBusy(true); setError(""); setScanning(false);
    setAttempt(request);
    try {
      const completed = await recordGateOperation(action, request);
      setResult(completed); setPreview(null); setToken(""); setAttempt(null);
    } catch (err) {
      const uncertain = !err.status || err.status >= 500;
      setError(uncertain ? "The result could not be confirmed. Retry this same operation to safely recover its result. Do not admit or release the vehicle until confirmation appears."
        : passReasons[err.data?.error?.code] || err.message);
      if (!uncertain) { setAttempt(null); setPreview(null); }
    } finally { setBusy(false); }
  }

  return <>
    <Card title={`${mall.name} · ${action === "ENTRY" ? "Vehicle entry" : "Vehicle exit"}`}>
      <div className="gate-action-switch" aria-label="Gate action">
        {["ENTRY", "EXIT"].map((value) => <Button key={value} variant={action === value ? "primary" : "outline"} disabled={busy || Boolean(attempt)} aria-pressed={action === value}
          onClick={() => { setAction(value); setPreview(null); setToken(""); setError(""); setResult(null); setScanning(false); }}>{value === "ENTRY" ? "Entry" : "Exit"}</Button>)}
      </div>
      <form onSubmit={verify} className="portal-form">
        <Input label="Driver's manual credential" value={token} autoComplete="off" spellCheck={false} required pattern="[a-f0-9]{64}" maxLength={64}
          disabled={busy || Boolean(attempt)} onChange={(event) => { setToken(event.target.value.trim()); setPreview(null); setError(""); setResult(null); }} helperText="Scan a ParkEase QR, or paste the 64-character credential from the driver's pass." />
        <div className="page-header-actions"><Button type="submit" disabled={busy || Boolean(attempt) || !/^[a-f0-9]{64}$/.test(token)} loading={busy && !attempt}>Verify pass</Button>
          <Button variant="outline" disabled={busy || Boolean(attempt)} onClick={() => setScanning((value) => !value)}>{scanning ? "Hide camera preview" : "Scan QR with camera"}</Button></div>
      </form>
      {scanning && <PassScanner onScan={scanned} onClose={() => setScanning(false)} />}
    </Card>
    {error && <p role="alert" className="form-error-text">{error}</p>}
    {attempt && !busy && <Card title="Operation awaiting confirmation"><p>Retry uses the same operation reference: {attempt.operationId}</p><Button onClick={() => submit(attempt)}>Retry same {action.toLowerCase()}</Button></Card>}
    {preview && <Card title={preview.allowed ? "Pass verified — check the vehicle" : "Pass cannot be used"}>
      {!preview.allowed && <p role="alert">{passReasons[preview.reasonCode] || "This pass is not eligible. Ask the driver to refresh their booking."}</p>}
      {preview.booking && <GateBooking booking={preview.booking} />}
      {preview.allowed && <>
        <p>Match the number plate and bay before confirming. Verification alone does not record a gate operation.</p>
        <Button disabled={busy || Boolean(attempt)} loading={busy} onClick={() => submit({ mallId: mall.id, token: token.trim(), operationId: crypto.randomUUID() })}>Confirm vehicle {action.toLowerCase()}</Button>
      </>}
    </Card>}
    {result && <Card title={result.operation.action === "ENTRY" ? "Entry confirmed" : "Exit confirmed"}>
      <p role="status">Vehicle {result.booking.vehicleNumber} · {result.booking.status} · {formatBookingTime(result.operation.occurredAt)} IST</p>
      <GateBooking booking={result.booking} />
      {result.bill && <div className="gate-result"><strong>Final bill: {formatRupees(result.bill.calculatedAmountPaise / 100)}</strong><p>{result.bill.durationMinutes} minutes · {result.bill.billableHours} billable hours. Billed amount only; payment is not recorded here.</p></div>}
      <p className="gate-help">Operation reference: {result.operation.id}</p>
    </Card>}
  </>;
}

function GateBooking({ booking }) {
  return <dl className="detail-list"><div><dt>Vehicle</dt><dd>{booking.vehicleNumber} · {booking.vehicleType}</dd></div><div><dt>Bay</dt><dd>{booking.floor} · {booking.slotCode}</dd></div><div><dt>Reservation</dt><dd>{booking._id}</dd></div><div><dt>Status</dt><dd>{booking.status}</dd></div><div><dt>Entry deadline</dt><dd>{formatBookingTime(booking.entryDeadline)} IST</dd></div></dl>;
}
