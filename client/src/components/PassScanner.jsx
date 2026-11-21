import { useEffect, useRef, useState } from "react";
import Button from "./Button.jsx";

export default function PassScanner({ onScan, onClose }) {
  const video = useRef(null);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    let controls;
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera scanning requires HTTPS or localhost. Use the manual credential instead.");
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        if (!active) return;
        const reader = new BrowserQRCodeReader();
        controls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" } }, audio: false }, video.current, (result, _error, scanControls) => {
          if (!active || !result) return;
          const token = result.getText().trim();
          if (!/^[a-f0-9]{64}$/.test(token)) { setError("This is not a ParkEase credential. Scan the driver's gate pass."); return; }
          scanControls.stop(); onScan(token);
        });
        if (!active) controls.stop();
        else setReady(true);
      } catch (err) {
        if (active) setError(err.name === "NotAllowedError" ? "Camera permission was declined. Use the manual credential instead." : err.message || "Camera unavailable. Use the manual credential instead.");
      }
    }
    start();
    return () => { active = false; controls?.stop(); };
  }, [onScan]);
  return <div className="pass-scanner">
    <video ref={video} autoPlay muted playsInline aria-label="QR camera preview" />
    {!ready && !error && <p role="status">Opening camera…</p>}
    {error && <p role="alert" className="form-error-text">{error}</p>}
    <Button variant="outline" onClick={onClose}>Close camera</Button>
  </div>;
}
