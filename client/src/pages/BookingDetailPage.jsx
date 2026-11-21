import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import BookingPass from "../components/BookingPass.jsx";
import { cancelBooking, getBooking } from "../services/bookingService.js";
import { formatBookingTime, formatRupees } from "../utils/bookingDisplay.js";
import useAuth from "../hooks/useAuth.js";

export default function BookingDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  return <BookingDetails key={`${id}:${user?._id}`} id={id} />;
}

function BookingDetails({ id }) {
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let timer;
    async function read() {
      try {
        const next = await getBooking(id, { signal: controller.signal });
        if (!controller.signal.aborted) { setBooking(next); setError(""); setUpdatedAt(new Date()); }
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally {
        if (!controller.signal.aborted) { setLoading(false); timer = setTimeout(read, 10000); }
      }
    }
    read();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [id, revision]);

  async function cancel() {
    if (!booking?.canCancel || busy || !window.confirm("Cancel this reservation?")) return;
    setBusy(true); setActionError("");
    try { setBooking(await cancelBooking(id)); }
    catch (err) { setActionError(err.message); }
    finally { setBusy(false); setRevision((value) => value + 1); }
  }

  return <div className="dashboard-content-grid">
    <PageHeader title="Reservation details" description="Times below are shown in IST. Gate status refreshes every 10 seconds."
      actions={<Button variant="outline" disabled={busy} onClick={() => setRevision((value) => value + 1)}>Refresh status</Button>} />
    {loading && <p role="status">Loading reservation…</p>}
    {error && <p role="alert" className="form-error-text">{error} Passes are hidden until status can be refreshed.</p>}
    {actionError && <p role="alert" className="form-error-text">{actionError}</p>}
    {booking && <div className="booking-visit-layout">
      <Card title={booking.mallName} subtitle={`Reference: ${booking.id}`}>
        <dl className="detail-list">
          <div><dt>Status</dt><dd>{booking.status === "ENDED" ? "ENDED (legacy reservation, entry not verified)" : booking.status}</dd></div>
          <div><dt>Bay</dt><dd>{booking.floor} · {booking.slotCode}</dd></div>
          <div><dt>Vehicle</dt><dd>{booking.vehicleNumber} {booking.vehicleType && `(${booking.vehicleType})`}</dd></div>
          <div><dt>Scheduled arrival</dt><dd>{formatBookingTime(booking.startTime)} IST</dd></div>
          <div><dt>Scheduled departure</dt><dd>{formatBookingTime(booking.endTime)} IST</dd></div>
          {booking.entryDeadline && <div><dt>Entry deadline</dt><dd>{formatBookingTime(booking.entryDeadline)} IST</dd></div>}
          {booking.enteredAt && <div><dt>Actual entry</dt><dd>{formatBookingTime(booking.enteredAt)} IST</dd></div>}
          {booking.exitedAt && <div><dt>Actual exit</dt><dd>{formatBookingTime(booking.exitedAt)} IST</dd></div>}
          <div><dt>Reservation estimate</dt><dd>{formatRupees(booking.totalAmount)}</dd></div>
        </dl>
        <div className="page-header-actions">
          {booking.canCancel && <Button onClick={cancel} disabled={busy}>{busy ? "Cancelling…" : "Cancel reservation"}</Button>}
          {booking.billAvailable && <Link className="button button-primary" to={`/dashboard/bookings/${id}/bill`}>View final bill</Link>}
        </div>
        {updatedAt && <p className="gate-help">Last checked: {formatBookingTime(updatedAt)} IST</p>}
      </Card>
      {!error && <BookingPass key={`${booking.id}:${booking.status}:${booking.qrEligiblePurposes.join()}`} booking={booking} />}
    </div>}
  </div>;
}
