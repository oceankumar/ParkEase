import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "../components/PageHeader.jsx";
import Card from "../components/Card.jsx";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";
import Badge from "../components/Badge.jsx";
import Icon from "../components/Icon.jsx";
import Loading from "../components/Loading.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import useAuth from "../hooks/useAuth.js";
import { changePassword, getProfile, updateProfile } from "../services/profileService.js";

const roles = { ADMIN: "Administrator", MALL_OWNER: "Mall owner", GUARD: "Gate guard", USER: "Driver" };

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getProfile({ signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) { setProfile(result); setName(result.name || ""); setPhone(result.phone || ""); setError(""); }
    }).catch((err) => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [user?._id, revision]);

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy("profile"); setError(""); setNotice("");
    try {
      const result = await updateProfile({ name: name.trim(), phone: phone.trim() });
      setProfile(result); await refreshUser(); setNotice("Profile updated.");
    } catch (err) { setError(err.message); }
    finally { setBusy(""); }
  }

  async function savePassword(event) {
    event.preventDefault();
    if (busy) return;
    setError(""); setNotice("");
    if (newPassword !== confirmation) { setError("New passwords do not match."); return; }
    setBusy("password");
    try { await changePassword(currentPassword, newPassword); navigate("/login", { replace: true }); }
    catch (err) { setError(err.message); }
    finally { setCurrentPassword(""); setNewPassword(""); setConfirmation(""); setBusy(""); }
  }

  const initials = (profile?.name || user?.name || "P").split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return <div className="dashboard-content-grid profile-page">
    <PageHeader eyebrow="YOUR ACCOUNT" title="Make yourself at home." description="Keep your details up to date and your account secure." />
    {user?.mustChangePassword && <div className="portal-callout" role="status"><Icon name="shield" /><div><strong>One step before your first shift</strong><p>Change your temporary password below, then sign in again to open the gate console.</p></div></div>}
    {error && <ErrorMessage message={error} onRetry={!profile ? () => setRevision((value) => value + 1) : undefined} />}
    {notice && <div className="notice-success" role="status"><Icon name="check" size={18} />{notice}</div>}
    {!profile && !error && <Loading message="Loading your profile…" />}
    {profile && <div className="profile-layout">
      <aside className="profile-summary">
        <div className="profile-identity"><span className="profile-monogram">{initials}</span><span className="eyebrow">YOUR PARKEASE ACCOUNT</span><h2>{profile.name}</h2><p>{profile.email}</p><Badge variant={profile.status === "ACTIVE" ? "accent" : "warning"} dot>{profile.status === "ACTIVE" ? "Active account" : profile.status.replaceAll("_", " ")}</Badge></div>
        <div className="profile-account-facts"><div><span>Account role</span><strong>{roles[profile.role] || profile.role}</strong></div><div><span>Sign-in email</span><strong>{profile.email}</strong></div></div>
        <div className="profile-security-note"><Icon name="shield" size={20} /><p>Your password stays private. Changing it signs you out of your existing sessions.</p></div>
      </aside>
      <div className="portal-stack">
        <Card title="Personal details" subtitle="The details associated with your account.">
          <form onSubmit={save} className="portal-form">
            <div className="form-two-columns"><Input label="Full name" required minLength={2} maxLength={100} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} disabled={Boolean(busy)} /><Input label="Phone number" type="tel" maxLength={20} autoComplete="tel" placeholder="Add a contact number" value={phone} onChange={(event) => setPhone(event.target.value)} disabled={Boolean(busy)} /></div>
            <Input label="Email address" type="email" value={profile.email} readOnly helperText="Your email is used to sign in and cannot be edited here." />
            <div className="portal-form-footer"><p>Only your name and phone number will change.</p><Button type="submit" loading={busy === "profile"} disabled={Boolean(busy)}>Save profile</Button></div>
          </form>
        </Card>
        <Card title="Password & security" subtitle="Choose a strong password you do not use elsewhere.">
          <form onSubmit={savePassword} className="portal-form">
            <Input label="Current password" required type={showPasswords ? "text" : "password"} autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} disabled={Boolean(busy)} />
            <div className="form-two-columns"><Input label="New password" required minLength={8} type={showPasswords ? "text" : "password"} autoComplete="new-password" helperText="Use at least 8 characters." value={newPassword} onChange={(event) => setNewPassword(event.target.value)} disabled={Boolean(busy)} /><Input label="Confirm new password" required type={showPasswords ? "text" : "password"} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={Boolean(busy)} /></div>
            <label className="portal-checkbox"><input type="checkbox" checked={showPasswords} onChange={(event) => setShowPasswords(event.target.checked)} />Show passwords</label>
            <div className="portal-form-footer"><p>You’ll sign in again after saving your new password.</p><Button type="submit" variant="outline" loading={busy === "password"} disabled={Boolean(busy)}>Update password</Button></div>
          </form>
        </Card>
      </div>
    </div>}
  </div>;
}
