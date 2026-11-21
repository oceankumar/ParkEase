import { useEffect, useState } from "react";
import useAuth from "../hooks/useAuth.js";
import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import Icon from "../components/Icon.jsx";
import StatCard from "../components/StatCard.jsx";
import Loading from "../components/Loading.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import { getAnalytics, getMallAnalytics } from "../services/analyticsService.js";
import { formatRupees } from "../utils/bookingDisplay.js";

const number = (value) => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("en-IN") : "—";
const money = (value) => typeof value === "number" && Number.isFinite(value) ? formatRupees(value / 100) : "—";
const shortDate = (date) => new Date(`${date}T12:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });

export default function AnalyticsPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mallId, setMallId] = useState("");
  const [query, setQuery] = useState({});
  const [data, setData] = useState(null);
  const [mallChoices, setMallChoices] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [chartMetric, setChartMetric] = useState("completedVisits");

  useEffect(() => {
    const controller = new AbortController();
    let timer;
    let reading = false;
    async function read() {
      if (reading || controller.signal.aborted) return;
      reading = true;
      clearTimeout(timer);
      try {
        const result = mallId && user?.role === "MALL_OWNER"
          ? await getMallAnalytics(mallId, query, { signal: controller.signal, cache: "no-store" })
          : await getAnalytics(user?.role, query, { signal: controller.signal, cache: "no-store" });
        if (!controller.signal.aborted) { setData(result); if (!mallId) setMallChoices(result.perMall || []); setError(""); }
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally {
        reading = false;
        if (!controller.signal.aborted) { setLoading(false); timer = setTimeout(read, 10000); }
      }
    }
    read();
    globalThis.window?.addEventListener("focus", read);
    return () => { controller.abort(); clearTimeout(timer); globalThis.window?.removeEventListener("focus", read); };
  }, [user?._id, user?.role, mallId, query]);

  const metrics = data?.metrics || {};
  const series = data?.series || [];
  const refresh = () => { setLoading(true); setQuery({ ...query }); };
  const selectedName = mallChoices.find((mall) => mall.mallId === mallId)?.mallName;
  return <div className="dashboard-content-grid analytics-page">
    <PageHeader eyebrow="PARKING INTELLIGENCE" title={user?.role === "ADMIN" ? "The bigger picture." : "Every space tells a story."} description="A clear view of your parking activity, occupancy, and billed revenue."
      actions={<Button variant="outline" onClick={refresh} disabled={loading} icon={<Icon name="clock" size={16} />}>Refresh report</Button>} />
    <Card className="analytics-filters" title="Your reporting window" subtitle="Date filters apply to visit outcomes. Unreserved bays exclude active visits and all current or upcoming reservations. Updates every 10 seconds.">
      <form className="analytics-filter-form" onSubmit={(event) => { event.preventDefault(); setLoading(true); setQuery({ from: from || undefined, to: to || undefined }); }}>
        {user?.role === "MALL_OWNER" && <Select label="Location" value={mallId} onChange={(event) => { setLoading(true); setMallId(event.target.value); }} options={[{ value: "", label: "All owned malls" }, ...mallChoices.map((mall) => ({ value: mall.mallId, label: mall.mallName }))]} />}
        <Input label="From (IST)" type="date" value={from} max={to || undefined} onChange={(event) => setFrom(event.target.value)} />
        <Input label="To (IST)" type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.target.value)} />
        <Button type="submit" disabled={loading}>Apply dates</Button>
      </form>
    </Card>
    {loading && <Loading message="Preparing your parking report…" />}
    {error && <ErrorMessage title="Report unavailable" message={error} onRetry={refresh} />}
    {data && !loading && !error && <>
      <div className="report-context"><span><i aria-hidden="true" />{selectedName || (user?.role === "ADMIN" ? "All platform locations" : "All owned locations")}{series.length > 0 && ` · ${shortDate(series[0].date)} – ${shortDate(series.at(-1).date)}`}</span><span>Updated {data.generatedAt ? new Date(data.generatedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—"} IST</span></div>
      <div className="analytics-kpis">
        <StatCard className="analytics-revenue" label="Billed revenue" value={money(metrics.billedAmountPaise)} icon={<Icon name="clipboard" />} note="Completed visits · selected dates" />
        <StatCard label="Completed visits" value={number(metrics.completedVisits)} icon={<Icon name="check" />} note="Verified exits · selected dates" />
        <StatCard label="Parked right now" value={number(metrics.activeVisits)} icon={<Icon name="car" />} note="Vehicles with a verified entry" />
        <StatCard label="Unreserved bays" value={number(metrics.unreservedBays)} icon={<Icon name="building" />} note="No active or upcoming reservations" />
      </div>
      <div className="analytics-charts">
        <Card title="Parking activity" subtitle="Daily totals for the selected reporting window." className="activity-chart-card">
          <div className="chart-metric-tabs" aria-label="Chart metric">{[["completedVisits", "Completed visits"], ["billedAmountPaise", "Billed revenue"]].map(([key, label]) => <button type="button" key={key} aria-pressed={chartMetric === key} onClick={() => setChartMetric(key)}>{label}</button>)}</div>
          <ActivityChart series={series} metric={chartMetric} />
        </Card>
        <CapacityPanel metrics={metrics} />
      </div>
      <div className="analytics-outcomes">{[["totalBays", "Published bays"], ["upcomingBookings", "Upcoming arrivals"], ["expiredBookings", "Missed arrivals"], ["cancelledBookings", "Cancellations"]].map(([key, label]) => <div key={key}><span>{label}</span><strong>{number(metrics[key])}</strong></div>)}</div>
      {user?.role === "ADMIN" && <div className="portal-callout"><Icon name="users" /><p><strong>{number(data.ownerCount)} owners · {number(data.mallCount)} malls</strong><br />{number(data.pendingOwnerCount)} owner accounts and {number(data.pendingMallCount)} mall listings awaiting review.</p></div>}
      <div className="analytics-tables">
        <Card title="Daily breakdown" subtitle="The values behind your activity chart."><div className="table-scroll" tabIndex={0} role="region" aria-label="Daily parking report"><table><thead><tr><th scope="col">Date (IST)</th><th scope="col" className="numeric-cell">Completed visits</th><th scope="col" className="numeric-cell">Billed revenue</th></tr></thead><tbody>{series.length ? series.map((day) => <tr key={day.date}><td>{shortDate(day.date)}</td><td className="numeric-cell">{number(day.completedVisits)}</td><td className="numeric-cell">{money(day.billedAmountPaise)}</td></tr>) : <tr><td colSpan={3} className="table-empty">No daily records for this period.</td></tr>}</tbody></table></div></Card>
        <Card title="Location performance" subtitle="Unreserved and reserved bays include upcoming bookings; revenue uses the selected dates."><div className="table-scroll" tabIndex={0} role="region" aria-label="Mall performance report"><table><thead><tr><th scope="col">Mall</th><th scope="col" className="numeric-cell">Bays</th><th scope="col" className="numeric-cell">Unreserved</th><th scope="col" className="numeric-cell">Reserved</th><th scope="col" className="numeric-cell">Active visits</th><th scope="col" className="numeric-cell">Billed revenue</th></tr></thead><tbody>{data.perMall?.length ? data.perMall.map((mall) => <tr key={mall.mallId}><td><strong>{mall.mallName}</strong></td><td className="numeric-cell">{number(mall.metrics?.totalBays)}</td><td className="numeric-cell">{number(mall.metrics?.unreservedBays)}</td><td className="numeric-cell">{number(mall.metrics?.reservedBays)}</td><td className="numeric-cell">{number(mall.metrics?.activeVisits)}</td><td className="numeric-cell">{money(mall.metrics?.billedAmountPaise)}</td></tr>) : <tr><td colSpan={6} className="table-empty">No mall records available.</td></tr>}</tbody></table></div></Card>
      </div>
      <p className="report-footnote"><Icon name="shield" size={16} />Billed revenue represents generated bills. Payment collection is not recorded in ParkEase.</p>
    </>}
  </div>;
}

function ActivityChart({ series, metric }) {
  const maximum = Math.max(0, ...series.map((day) => Number(day[metric]) || 0));
  if (!maximum) return <div className="chart-empty"><span className="summary-icon"><Icon name="clipboard" size={26} /></span><strong>No {metric === "completedVisits" ? "completed visits" : "billed revenue"} in this period</strong><p>Verified exits will appear here. Try another date range to explore earlier visits.</p></div>;
  return <figure className="activity-chart" aria-label={`Daily ${metric === "completedVisits" ? "completed visits" : "billed revenue"}. Exact values are in the daily breakdown table.`}>
    <div className="chart-scale"><span>{metric === "completedVisits" ? number(maximum) : money(maximum)}</span><span>0</span></div>
    <div className="chart-scroll" tabIndex={0} role="region" aria-label="Scrollable activity chart"><div className="chart-bars">{series.map((day) => <div className="chart-column" key={day.date}><div className="chart-bar-track"><div className="chart-bar" style={{ height: `${Math.max(0, day[metric] / maximum * 100)}%` }} title={`${day.date}: ${metric === "completedVisits" ? number(day[metric]) : money(day[metric])}`} /></div><span>{shortDate(day.date)}</span></div>)}</div></div>
  </figure>;
}

function CapacityPanel({ metrics }) {
  const categories = [["unreservedBays", "Unreserved", "available"], ["occupiedNow", "Occupied", "occupied"], ["reservedBays", "Reserved (incl. upcoming)", "reserved"], ["maintenanceNow", "Maintenance", "maintenance"]];
  const total = metrics.totalBays;
  const occupancy = total > 0 && typeof metrics.occupiedNow === "number" ? Math.round(metrics.occupiedNow / total * 100) : null;
  return <section className="capacity-panel" aria-label="Parking reservation overview"><div className="capacity-heading"><span className="eyebrow">RESERVATION OVERVIEW</span><Icon name="car" /></div><h2>Every bay accounted for.</h2><div className="capacity-percentage">{occupancy === null ? "—" : `${occupancy}%`}<span>of published bays occupied</span></div>
    <div className="capacity-track" aria-hidden="true">{categories.map(([key, , style]) => <span key={key} className={style} style={{ width: `${total > 0 ? Math.max(0, metrics[key] / total * 100) : 0}%` }} />)}</div>
    <dl className="capacity-legend">{categories.map(([key, label, style]) => <div key={key}><dt><i className={style} />{label}</dt><dd>{number(metrics[key])}</dd></div>)}</dl>
    <p>{total > 0 ? `${number(total)} published bays. ${number(metrics.availableNow)} available right now; upcoming reservations are included above. Time-window availability may differ.` : "Publish a parking layout to see capacity here."}</p>
  </section>;
}
