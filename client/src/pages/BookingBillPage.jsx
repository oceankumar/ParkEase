import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getBookingBill } from "../services/bookingService.js";
import { formatBookingTime, formatRupees } from "../utils/bookingDisplay.js";
import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";

export default function BookingBillPage() {
  const { id } = useParams();
  const [bill, setBill] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getBookingBill(id, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) { setBill(result); setError(""); }
    }).catch((err) => {
      if (!controller.signal.aborted) setError(err.data?.error?.code === "BILL_NOT_READY" ? "The final bill is not ready. It becomes available after a verified exit." : err.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, retry]);

  const rows = bill ? [
    ["Reference", bill.bookingId || bill.bookingReference],
    ["Mall", bill.mallName], ["Vehicle", bill.vehicleNumber],
    ["Bay", `${bill.floor || ""} ${bill.slotCode || ""}`],
    ["Entry", `${formatBookingTime(bill.entryTime)} IST`],
    ["Exit", `${formatBookingTime(bill.exitTime)} IST`],
    ["Duration", bill.durationMinutes != null ? `${bill.durationMinutes} minute${bill.durationMinutes === 1 ? "" : "s"}` : null],
    ["Billable hours", bill.billableHours],
    ["Hourly rate", bill.hourlyRateSnapshotPaise != null ? formatRupees(bill.hourlyRateSnapshotPaise / 100) : null],
    ["Policy version", bill.policyVersion],
    ["Final billed amount", bill.calculatedAmountPaise != null ? formatRupees(bill.calculatedAmountPaise / 100) : null],
  ] : [];

  return <div className="dashboard-content-grid receipt-page">
    <PageHeader title="Final bill" description="Billed amount; payment is not recorded here." />
    {loading && <p role="status">Loading final bill…</p>}
    {error && <p role="alert">{error} <Button onClick={() => { setError(""); setLoading(true); setRetry((value) => value + 1); }}>Retry</Button></p>}
    {bill && <Card title="ParkEase receipt"><dl className="detail-list">{rows.filter(([, value]) => value !== undefined && value !== null).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></Card>}
    <div className="receipt-actions">{bill && <Button onClick={() => window.print()}>Print receipt</Button>}<Link to={`/dashboard/bookings/${id}`}>Back to reservation</Link></div>
  </div>;
}
