import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import useMallChoices from "../hooks/useMallChoices.js";
import { getMallBookings } from "../services/reportService.js";
import { formatBookingTime, formatRupees } from "../utils/bookingDisplay.js";

export default function MallBookingsPage() {
  const { choices, loading, error, reload } = useMallChoices();
  const [selected, setSelected] = useState("");
  const mall = choices.find((choice) => choice.id === selected) || choices[0];
  return <div className="dashboard-content-grid">
    <PageHeader title="Reservations" description="Upcoming arrivals, active visits, and reservation history for your malls."
      actions={<Button variant="outline" onClick={reload}>Refresh malls</Button>} />
    {loading && <p role="status">Loading malls…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && !mall && <Card title="No malls available"><p>Add a mall before viewing its reservations.</p></Card>}
    {mall && <><Select label="Mall" value={mall.id} onChange={(event) => setSelected(event.target.value)} options={choices.map((item) => ({ value: item.id, label: item.name }))} /><ReservationRegister key={mall.id} mallId={mall.id} /></>}
  </div>;
}

function ReservationRegister({ mallId }) {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState({});
  const [page, setPage] = useState({ bookings: [], nextCursor: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    getMallBookings(mallId, { ...query, limit: 20 }, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) { setPage(data); setError(""); } })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [mallId, query]);
  const apply = () => { setLoading(true); setQuery({ status: status || undefined, search: search.trim() || undefined, from: from || undefined, to: to || undefined }); };
  return <>
    <Card title="Find reservations"><form className="form-two-columns" onSubmit={(event) => { event.preventDefault(); apply(); }}>
      <Select label="Reservation status" value={status} onChange={(event) => setStatus(event.target.value)} options={[{ value: "", label: "All statuses" }, ...["CONFIRMED", "ACTIVE", "COMPLETED", "CANCELLED", "EXPIRED"].map((value) => ({ value, label: value === "ACTIVE" ? "ACTIVE — currently parked" : value }))]} />
      <Input label="Vehicle or bay" maxLength={60} value={search} onChange={(event) => setSearch(event.target.value)} />
      <Input label="Arrival from (IST)" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
      <Input label="Arrival to (IST)" type="date" min={from || undefined} value={to} onChange={(event) => setTo(event.target.value)} />
      <div className="portal-form-footer form-span-all"><Button type="submit" disabled={loading}>Apply filters</Button></div>
    </form></Card>
    <Card title="Reservation register" subtitle="Amounts shown are reservation estimates. Final billing uses actual entry and exit times."
      footer={<div className="page-header-actions"><Button variant="outline" disabled={loading} onClick={apply}>Refresh first page</Button>{page.nextCursor && <Button disabled={loading || Boolean(error)} onClick={() => { setLoading(true); setQuery({ ...query, cursor: page.nextCursor }); }}>Older reservations</Button>}</div>}>
      {loading && <p role="status">Loading reservations…</p>}
      {error && <p role="alert" className="form-error-text">{error} <Button onClick={apply}>Retry</Button></p>}
      {!loading && !error && (page.bookings.length ? <div className="table-scroll"><table><thead><tr><th scope="col">Vehicle / bay</th><th scope="col">Arrival (IST)</th><th scope="col">Status</th><th scope="col">Estimate</th><th scope="col">Details</th></tr></thead><tbody>{page.bookings.map((booking) => <tr key={booking._id}>
        <td><strong>{booking.vehicleNumber}</strong><br />{booking.floor} · {booking.slotCode}</td><td>{formatBookingTime(booking.startTime)}</td><td>{booking.status}</td><td>{formatRupees(booking.totalAmountPaise / 100)}</td>
        <td><details><summary>View details</summary><dl className="detail-list"><div><dt>Reference</dt><dd>{booking._id}</dd></div><div><dt>Scheduled departure</dt><dd>{formatBookingTime(booking.endTime)} IST</dd></div><div><dt>Entry deadline</dt><dd>{formatBookingTime(booking.entryDeadline)} IST</dd></div><div><dt>Actual entry</dt><dd>{booking.entryTime ? formatBookingTime(booking.entryTime) : "Not recorded"}</dd></div><div><dt>Actual exit</dt><dd>{booking.exitTime ? formatBookingTime(booking.exitTime) : "Not recorded"}</dd></div></dl></details></td>
      </tr>)}</tbody></table></div> : <p>No reservations match these filters.</p>)}
    </Card>
  </>;
}
