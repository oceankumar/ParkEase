import { useContext, useEffect, useRef, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import FloorRows from "../components/FloorRows.jsx";
import Button from "../components/Button.jsx";
import BookingWindowForm from "../components/BookingWindowForm.jsx";
import ReservationDetails from "../components/ReservationDetails.jsx";
import Modal from "../components/Modal.jsx";
import { AuthContext } from "../context/authContextInstance.js";
import { createBooking } from "../services/bookingService.js";
import { formatBookingTime, formatRupees } from "../utils/bookingDisplay.js";
import EmptyState from "../components/EmptyState.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Icon from "../components/Icon.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import PageHeader from "../components/PageHeader.jsx";
import PageContainer from "../components/PageContainer.jsx";
import StatCard from "../components/StatCard.jsx";
import Skeleton from "../components/Skeleton.jsx";
import { getMallById } from "../services/mallService.js";
import { getParkingAvailability, SLOT_STATUS } from "../services/parkingService.js";

export default function ParkingAvailabilityPage({ initialMall = null, initialData = null, initialLoading } = {}) {
  const { id } = useParams();
  const location = useLocation();
  const auth = useContext(AuthContext);
  const mallId = id || initialMall?.id || initialMall?._id;
  const [mall, setMall] = useState(initialMall);
  const [data, setData] = useState(initialData);
  const [loading, setLoading] = useState(initialLoading ?? !initialData);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [floor, setFloor] = useState("ALL");
  const [vehicle, setVehicle] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [window, setWindow] = useState(null);
  const [plate, setPlate] = useState("");
  const [booking, setBooking] = useState(null);
  const [bookingError, setBookingError] = useState("");
  const [bookingBusy, setBookingBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const bookingAttempt = useRef(null);
  useEffect(() => {
    if (initialData && revision === 0) return;
    const controller = new AbortController();
    const params = window ? { startTime: window.startTime, endTime: window.endTime } : {};
    let timer;
    let reading = false;
    async function read() {
      if (reading || controller.signal.aborted) return;
      reading = true;
      clearTimeout(timer);
      try {
        const [mallResult, parkingResult] = await Promise.all([
          initialMall ? Promise.resolve({ mall: initialMall }) : getMallById(mallId, { signal: controller.signal }),
          getParkingAvailability(mallId, params, { signal: controller.signal }),
        ]);
        if (!controller.signal.aborted) { setMall(mallResult.mall); setData(parkingResult); setError(""); }
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally {
        reading = false;
        if (!controller.signal.aborted) { setLoading(false); timer = setTimeout(read, 10000); }
      }
    }
    read();
    globalThis.window?.addEventListener("focus", read);
    return () => { controller.abort(); clearTimeout(timer); globalThis.window?.removeEventListener("focus", read); };
  }, [mallId, initialMall, initialData, revision, window]);
  const slots = data?.slots || [];
  const floors = data?.supportedFloors || [];
  const vehicles = data?.supportedVehicleTypes || [];
  const statuses = data?.supportedStatuses || [];
  const filtered = slots.filter((slot) => (floor === "ALL" || slot.floor === floor) && (vehicle === "ALL" || slot.vehicleType === vehicle) && (status === "ALL" || slot.status === status) && `${slot.slotNumber} ${slot.floor} ${slot.vehicleType}`.toLowerCase().includes(search.trim().toLowerCase()));
  const groups = new Map();
  for (const slot of filtered) {
    const level = slot.floor || "General Level";
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level).push(slot);
  }
  const selected = filtered.find((slot) => (slot.id || slot.slotNumber) === selectedId);
  const filteredView = floor !== "ALL" || vehicle !== "ALL" || status !== "ALL" || search;
  const reset = () => { setFloor("ALL"); setVehicle("ALL"); setStatus("ALL"); setSearch(""); };
  const retry = () => { setError(""); setLoading(true); setRevision((value) => value + 1); };
  function checkWindow(nextWindow, vehicleType) {
    setWindow(nextWindow ? { ...nextWindow, vehicleType } : null);
    setVehicle(vehicleType ?? "ALL");
    setStatus("ALL");
    setSelectedId(null);
    setDetailsOpen(false);
    setBookingError("");
    retry();
  }

  function selectBay(bay) {
    setSelectedId(bay.id || bay.slotNumber);
    setBookingError("");
    setDetailsOpen(globalThis.matchMedia?.("(max-width: 768px)").matches ?? false);
  }

  async function reserve(event) {
    event.preventDefault();
    if (bookingBusy || loading || !window || selected?.status !== "AVAILABLE") return;
    setBookingBusy(true);
    setBookingError("");
    try {
      const payload = { ...window, mallId, bayId: selected.id, vehicleNumber: plate };
      const fingerprint = JSON.stringify([auth?.user?._id, payload]);
      if (bookingAttempt.current?.fingerprint !== fingerprint) {
        bookingAttempt.current = { fingerprint, key: crypto.randomUUID() };
      }
      const confirmed = await createBooking(payload, bookingAttempt.current.key);
      bookingAttempt.current = null;
      setBooking(confirmed);
      setSelectedId(null);
      setDetailsOpen(false);
      retry();
    } catch (err) {
      setBookingError(err.message);
      if (err.status === 409) {
        setSelectedId(null);
        setDetailsOpen(false);
        retry();
      }
    } finally {
      setBookingBusy(false);
    }
  }

  const details = <ReservationDetails bay={selected} window={window} plate={plate} onPlate={setPlate}
    busy={bookingBusy} loading={loading || auth?.isLoading} role={auth?.user?.role}
    loginTo="/login" loginFrom={location} onReserve={reserve}
    onClear={() => { setSelectedId(null); setDetailsOpen(false); }} />;
  const renderBay = (bay) => (
    <button key={bay.id || bay.slotNumber} type="button" className={`bay status-${bay.status.toLowerCase()} ${selected === bay ? "is-selected" : ""}`} aria-label={`Slot ${bay.slotNumber}, Floor ${bay.floor}, Status ${bay.status}`} aria-pressed={selected === bay} onClick={() => selectBay(bay)} disabled={bookingBusy}><strong>{bay.slotNumber}</strong><Icon name={bay.status === SLOT_STATUS.OCCUPIED ? "car" : selected === bay ? "check" : "building"} size={26} /><span>{bay.status.toLowerCase()}</span>{bay.isElectric && <small>EV</small>}{bay.isAccessible && <small>Accessible</small>}</button>
  );
  return <PageContainer><div className="parking-availability-layout">
    <div className="mall-details-topbar">
      <Button to={mallId ? `/malls/${mallId}` : "/malls"} variant="ghost" size="sm">← Back to Mall Details</Button>
      <div className="page-actions">
        {auth?.user?.role === "USER" && <Button to="/dashboard/bookings" variant="outline" size="sm" icon={<Icon name="clipboard" size={16} />}>My bookings</Button>}
        <Button variant="outline" size="sm" loading={loading} disabled={bookingBusy} onClick={retry}>Refresh availability</Button>
      </div>
    </div>
    <PageHeader title="Your spot. Your way." description={mall ? `${mall.name} · ${mall.address || mall.city || ""}` : "Explore parking bays and floor availability."} />
    {(mall || mallId) && <BookingWindowForm activeWindow={window} loading={loading} busy={bookingBusy}
      onCheck={checkWindow} onClear={() => checkWindow(null)} />}
    <p className="panel-hint" role="status">{window ? "Availability for the selected time window." : "Reservation overview: reserved bays include current and upcoming bookings. Select a time window to see availability for your visit."} Updates every 10 seconds.</p>
    {booking && <section className="reservation-confirmation" aria-label="Reservation confirmed">
      <h2>Reservation confirmed</h2>
      <p>{booking.slotCode} · {booking.floor} · {formatBookingTime(booking.startTime)} to {formatBookingTime(booking.endTime)} IST</p>
      <p>Reference <strong>{booking.id.toUpperCase()}</strong> · Estimated total {formatRupees(booking.totalAmount)}</p>
      <Button to="/dashboard/bookings" variant="outline">My bookings</Button>
    </section>}
    {bookingError && !detailsOpen && <ErrorMessage message={bookingError} />}
    {error && <ErrorMessage title="Unable to load parking" message={error} onRetry={retry} />}
    {loading && <div aria-busy="true" aria-label="Loading parking availability"><Skeleton height="320px" /></div>}
    {!loading && !error && <>
      {data?.summary?.total > 0 && <div className="parking-summary-grid">{[["Total Capacity", "total"], ["Available Bays", "available"], ["Occupied Bays", "occupied"], ["Reserved Bays", "reserved"]].map(([label, key]) => <StatCard key={key} label={label} value={data.summary[key]} icon={<Icon name={key === "occupied" ? "car" : "building"} />} />)}</div>}
      {slots.length > 0 ? <>
        <div className="parking-filter-bar">
          <Input label="Search Bays" value={search} placeholder="Search by bay number" icon={<Icon name="search" size={16} />} onChange={(event) => setSearch(event.target.value)} />
          {vehicles.length > 0 && <Select label="Vehicle Type" value={vehicle} onChange={(event) => setVehicle(event.target.value)} options={[{ value: "ALL", label: "All Vehicle Types" }, ...vehicles.map((value) => ({ value, label: value }))]} />}
          {statuses.length > 0 && <Select label="Slot Status" value={status} onChange={(event) => setStatus(event.target.value)} options={[{ value: "ALL", label: "All Statuses" }, ...statuses.map((value) => ({ value, label: value }))]} />}
          {filteredView && <Button variant="ghost" size="sm" onClick={reset}>Clear filters</Button>}
        </div>
        <div className="availability-workspace"><section className="bay-map-panel" aria-label="Parking bays by floor">
          <div className="section-title-row"><h2>Explore parking bays</h2><span className="muted">{filtered.length} of {slots.length} bays</span></div>
          <div className="floor-tabs" aria-label="Select Floor / Level"><button aria-pressed={floor === "ALL"} className={floor === "ALL" ? "selected" : ""} onClick={() => setFloor("ALL")}>All floors</button>{floors.map((value) => <button key={value} aria-pressed={floor === value} className={floor === value ? "selected" : ""} onClick={() => setFloor(value)}>{value}</button>)}</div>
          {filtered.length ? <div className="bay-map">{[...groups].map(([level, bays]) => {
            const layoutFloor = data?.layout?.find((entry) => entry.name === level);
            const visibleBays = new Map(bays.map((bay) => [bay.id, bay]));
            return <section className="bay-floor" key={level}>
              <div className="bay-floor-title"><strong>{level}</strong><span>{bays.filter((bay) => bay.status === SLOT_STATUS.AVAILABLE).length} available</span></div>
              {layoutFloor
                ? <FloorRows rows={layoutFloor.rows.map((row) => row.map((id) => id === null ? null : visibleBays.get(id)))} renderBay={renderBay} />
                : <div className="bay-grid">{bays.map(renderBay)}</div>}
            </section>;
          })}</div> : <EmptyState title="No Matching Parking Slots" description="Try changing the floor, vehicle type or status filters." action={<Button onClick={reset}>Reset All Filters</Button>} />}
          <div className="map-legend"><span><i />Available</span><span><i className="occupied" />Occupied</span><span><i className="selected" />Selected</span><span><i className="reserved" />Reserved</span><span><i className="maintenance" />Maintenance</span></div>
          <p className="panel-hint">Bays grouped by floor. This is a schematic view, not a navigation map.</p>
        </section><aside className="bay-detail-panel">{!detailsOpen && details}</aside></div>
      </> : <EmptyState icon={<Icon name="car" size={32} />} title="Parking Availability Unavailable" description={data?.isPendingBackend ? "Parking availability is not connected yet. You can still explore this mall's location, hours and parking rate." : "No parking slots are currently registered for this mall facility."} action={<Button to={mallId ? `/malls/${mallId}` : "/malls"} variant="outline">Return to Mall Profile</Button>} />}
    </>}
    <Modal isOpen={detailsOpen && Boolean(selected)} onClose={() => { if (!bookingBusy) setDetailsOpen(false); }}
      title="Your reservation" size="sm" className="reservation-sheet">
      {bookingError && <ErrorMessage message={bookingError} />}
      {details}
    </Modal>
  </div></PageContainer>;
}
