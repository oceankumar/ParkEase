import { useEffect, useState } from "react";
import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Select from "../components/Select.jsx";
import useMallChoices from "../hooks/useMallChoices.js";
import { recentOperations } from "../services/operationService.js";
import { formatBookingTime } from "../utils/bookingDisplay.js";

export default function OperationsActivityPage() {
  const { choices, loading, error, reload } = useMallChoices();
  const [selected, setSelected] = useState("");
  const [action, setAction] = useState("");
  const mall = choices.find((choice) => choice.id === selected) || choices[0];
  return <div className="dashboard-content-grid">
    <PageHeader title="Recent gate activity" description="Recorded entries and exits for your selected mall. Times are shown in IST." actions={<Button variant="outline" onClick={reload}>Refresh malls</Button>} />
    {loading && <p role="status">Loading malls…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && !mall && <Card title="No malls available"><p>An active mall assignment is required to view gate activity.</p></Card>}
    {mall && <>
      <div className="form-two-columns"><Select label="Mall" value={mall.id} onChange={(event) => setSelected(event.target.value)} options={choices.map((item) => ({ value: item.id, label: item.name }))} />
        <Select label="Action" value={action} onChange={(event) => setAction(event.target.value)} options={[{ value: "", label: "All actions" }, { value: "ENTRY", label: "Entries" }, { value: "EXIT", label: "Exits" }]} /></div>
      <ActivityList key={`${mall.id}:${action}`} mallId={mall.id} action={action} />
    </>}
  </div>;
}

function ActivityList({ mallId, action }) {
  const [page, setPage] = useState({ operations: [], nextCursor: null });
  const [cursor, setCursor] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    recentOperations({ mallId, action: action || undefined, cursor: cursor || undefined, limit: 20 }, { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) { setPage(data); setError(""); } })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [mallId, action, cursor, revision]);
  const refresh = () => { setLoading(true); setCursor(""); setRevision((value) => value + 1); };
  return <Card title="Recorded operations" footer={<div className="page-header-actions"><Button variant="outline" disabled={loading} onClick={refresh}>Refresh latest</Button>{page.nextCursor && <Button disabled={loading || Boolean(error)} onClick={() => { setLoading(true); setCursor(page.nextCursor); }}>Older operations</Button>}</div>}>
    {loading && <p role="status">Loading activity…</p>}
    {error && <p role="alert" className="form-error-text">{error} <Button onClick={refresh}>Retry</Button></p>}
    {!loading && !error && (page.operations.length ? <div className="table-scroll"><table><thead><tr><th scope="col">Time (IST)</th><th scope="col">Action</th><th scope="col">Booking</th><th scope="col">Operation reference</th></tr></thead><tbody>{page.operations.map((operation) => <tr key={operation.id}><td>{formatBookingTime(operation.occurredAt)}</td><td>{operation.action}</td><td>{operation.bookingId}</td><td>{operation.id}</td></tr>)}</tbody></table></div> : <p>No gate operations found.</p>)}
  </Card>;
}
