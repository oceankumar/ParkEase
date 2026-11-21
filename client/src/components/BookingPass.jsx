import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Card from "./Card.jsx";
import Button from "./Button.jsx";
import { issueBookingPass } from "../services/bookingService.js";
import { formatBookingTime } from "../utils/bookingDisplay.js";

export default function BookingPass({ booking }) {
  const [pass, setPass] = useState(null);
  const [image, setImage] = useState("");
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const purpose = booking.qrEligiblePurposes[0];

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const seconds = pass ? Math.max(0, Math.ceil((new Date(pass.expiresAt) - now) / 1000)) : 0;
  const valid = pass?.purpose === purpose && seconds > 0;

  async function generate() {
    if (busy || !purpose) return;
    setBusy(true); setError(""); setPass(null); setImage(""); setCopied(false);
    try {
      const next = await issueBookingPass(booking.id, purpose);
      const encoded = await QRCode.toDataURL(next.token, { width: 300, margin: 4, errorCorrectionLevel: "M", color: { dark: "#142536", light: "#ffffff" } });
      setNow(Date.now()); setPass(next); setImage(encoded);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(pass.token); setCopied(true); }
    catch { setError("Copy is unavailable. Open the manual credential below and copy it directly."); }
  }

  const explanation = booking.status === "CONFIRMED"
    ? purpose === "ENTRY" ? "Show an entry pass to your gate guard. Arrive before the entry deadline." : "Your entry pass becomes available at the scheduled arrival time. Arrive before the entry deadline."
    : booking.status === "ACTIVE" ? "Show an exit pass to the guard when you leave. Your final bill is calculated at exit."
      : "This reservation no longer accepts gate passes.";

  return <Card title={purpose === "EXIT" ? "Ready to leave?" : "Your gate pass"} subtitle={explanation}>
    {error && <p className="form-error-text" role="alert">{error}</p>}
    {purpose && <div className="gate-pass">
      {valid && <>
        <div className="gate-pass-heading"><span className="gate-status">{purpose} PASS</span><strong role="timer" aria-label="Pass time remaining">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</strong></div>
        <img className="gate-pass-qr" src={image} alt={`${purpose.toLowerCase()} QR pass for ${booking.slotCode}`} width="300" height="300" />
        <p>Show this QR at {booking.mallName}. Valid until {formatBookingTime(pass.expiresAt)} IST.</p>
        <details className="manual-credential"><summary>Guard cannot scan? Use a manual credential</summary><code>{pass.token}</code><Button variant="outline" onClick={copy}>{copied ? "Copied" : "Copy credential"}</Button></details>
      </>}
      {pass && !valid && <p role="status">This pass has expired. Generate a new pass before presenting it at the gate.</p>}
      <Button onClick={generate} loading={busy}>{valid ? "Generate replacement pass" : `Generate ${purpose.toLowerCase()} pass`}</Button>
      <p className="gate-help">A replacement invalidates the previous pass. Share the credential only with your gate guard.</p>
    </div>}
  </Card>;
}
