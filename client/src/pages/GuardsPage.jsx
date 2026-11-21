import { useEffect, useState } from "react";
import useAuth from "../hooks/useAuth.js";
import { sessionRequest } from "../services/authService.js";
import { getMalls } from "../services/mallService.js";
import { assignGuard, createGuard, listMallGuards, updateAssignment } from "../services/guardService.js";
import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import Badge from "../components/Badge.jsx";
import Icon from "../components/Icon.jsx";

export default function GuardsPage() {
  const { user } = useAuth();
  const [malls, setMalls] = useState([]);
  const [mallId, setMallId] = useState("");
  const [guards, setGuards] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const source = user?.role === "ADMIN" ? getMalls() : sessionRequest("/malls/owner/my-malls");
    source.then((result) => {
      const list = user?.role === "ADMIN" ? result.malls : result.data.malls;
      if (active) setMalls(list.filter((mall) => mall.status === "APPROVED"));
    }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [user?._id, user?.role]);

  async function refresh() {
    if (!mallId) return;
    setError("");
    try { setGuards(await listMallGuards(mallId)); }
    catch (err) { setError(err.message); }
  }

  useEffect(() => {
    if (!mallId) return;
    let active = true;
    listMallGuards(mallId).then((list) => { if (active) setGuards(list); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [mallId]);

  async function submit(event, mode) {
    event.preventDefault();
    const form = event.currentTarget;
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    const fields = Object.fromEntries(new FormData(form));
    try {
      if (mode === "create") await createGuard(mallId, fields);
      else await assignGuard(mallId, fields);
      form.reset();
      setNotice(mode === "create" ? "Guard created. Share the temporary password securely; it will not be shown again." : "Guard assigned.");
      await refresh();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function toggle(assignment) {
    setBusy(true); setError("");
    try { await updateAssignment(assignment.id, { isActive: !assignment.isActive, gateLabel: assignment.gateLabel }); await refresh(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return <div className="dashboard-content-grid">
    <PageHeader eyebrow="YOUR GATE TEAM" title="A smoother shift starts here." description="Create guard accounts and manage access to your approved malls." />
    {error && <p className="form-error-text" role="alert">{error} <Button onClick={refresh}>Retry</Button></p>}
    {notice && <div className="notice-success" role="status"><Icon name="check" size={18} />{notice}</div>}
    <Card title="Choose a location" subtitle="Guard assignments are managed separately for each mall."><Select label="Selected mall" value={mallId} disabled={busy} onChange={(event) => { setMallId(event.target.value); setGuards([]); setError(""); setNotice(""); }} options={[{ value: "", label: "Choose a mall" }, ...malls.map((mall) => ({ value: mall._id || mall.id, label: mall.name }))]} /></Card>
    {mallId && <>
      <Card title="Your assigned guards" subtitle={`${guards.length} ${guards.length === 1 ? "assignment" : "assignments"} at this location.`}>{guards.length === 0 ? <div className="portal-empty"><Icon name="users" size={28} /><p>No guards assigned yet. Create an account or assign an existing guard below.</p></div> : <div className="guard-roster">{guards.map(({ user: guard, assignment }) => <div key={assignment.id} className="guard-roster-row">
        <span className="profile-avatar">{guard?.name?.slice(0, 1) || "G"}</span><div className="guard-roster-identity"><strong>{guard?.name}</strong><span>{guard?.email}</span><small>{assignment.gateLabel || "Gate not labeled"}</small></div><Badge variant={assignment.isActive ? "success" : "neutral"}>{assignment.isActive ? "Active" : "Inactive"}</Badge>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => toggle(assignment)}>{assignment.isActive ? "Deactivate" : "Activate"}</Button>
      </div>)}</div>}</Card>
      <div className="portal-two-panel">
      <Card title="Create a guard account" subtitle="A new team member, ready for their first shift."><form onSubmit={(event) => submit(event, "create")} className="portal-form">
        <Input label="Full name" name="name" required minLength={2} maxLength={100} disabled={busy} /><Input label="Email" name="email" type="email" required disabled={busy} />
        <div className="form-two-columns"><Input label="Phone" name="phone" type="tel" maxLength={20} disabled={busy} /><Input label="Gate label" name="gateLabel" placeholder="e.g. North entrance" maxLength={80} disabled={busy} /></div>
        <Input label="Temporary password" name="initialPassword" type="password" required minLength={8} autoComplete="new-password" disabled={busy} helperText="The guard must change this password before their first gate operation." />
        <div className="portal-form-footer"><p>Share the temporary password directly with the guard through a secure channel.</p><Button type="submit" disabled={busy}>Create guard</Button></div>
      </form></Card>
      <Card title="Assign an existing guard" subtitle="Give a guard access to another location."><form onSubmit={(event) => submit(event, "assign")} className="portal-form">
        <Input label="Guard ID" name="guardId" required disabled={busy} helperText="Use the account ID of a guard you manage." /><Input label="Gate label" name="gateLabel" placeholder="e.g. Basement exit" maxLength={80} disabled={busy} />
        <div className="portal-callout"><Icon name="shield" size={20} /><p>An active assignment lets this guard verify passes and record entries and exits at this mall.</p></div>
        <div className="portal-form-footer"><Button type="submit" disabled={busy}>Assign guard</Button></div>
      </form></Card>
      </div>
    </>}
  </div>;
}
