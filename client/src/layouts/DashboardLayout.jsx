import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import useAuth from "../hooks/useAuth.js";
import Icon from "../components/Icon.jsx";

const roleLabels = { ADMIN: "Admin portal", MALL_OWNER: "Owner portal", GUARD: "Guard portal", USER: "Driver portal" };

export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout, logoutError, isSigningOut } = useAuth();
  const location = useLocation();
  const sidebar = useRef(null);
  const menuButton = useRef(null);
  const view = new URLSearchParams(location.search).get("view") || "overview";
  const onDashboard = location.pathname === "/dashboard";
  const roleLabel = roleLabels[user?.role] || "Explore ParkEase";
  const initials = user?.name?.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";
  const closeSidebar = () => setSidebarOpen(false);
  const links = [];
  if (user?.role !== "GUARD") {
    links.push({ label: "Overview", icon: "home", to: "/dashboard", active: onDashboard && view === "overview" });
  }
  if (user?.role === "USER") {
    links.push(
      { label: "Find parking", icon: "pin", to: "/malls", active: location.pathname.startsWith("/malls") },
      { label: "My bookings", icon: "clipboard", to: "/dashboard/bookings", active: location.pathname.startsWith("/dashboard/bookings") },
    );
  } else if (user?.role === "ADMIN") {
    links.push(
      { label: "Mall approvals", icon: "clipboard", to: "/dashboard?view=malls", active: onDashboard && view === "malls" },
      { label: "Owner approvals", icon: "users", to: "/dashboard?view=owners", active: onDashboard && view === "owners" },
      { label: "All malls", icon: "building", to: "/dashboard?view=all-malls", active: onDashboard && view === "all-malls" },
      { label: "Guards", icon: "users", to: "/dashboard/guards", active: location.pathname === "/dashboard/guards" },
      { label: "Analytics", icon: "clipboard", to: "/dashboard/analytics", active: location.pathname === "/dashboard/analytics" },
    );
  } else if (user?.role === "MALL_OWNER" && user.status === "ACTIVE") {
    links.push(
      { label: "My malls", icon: "building", to: "/dashboard?view=my-malls", active: (onDashboard && view === "my-malls") || location.pathname.startsWith("/dashboard/malls/") },
      { label: "Submit a mall", icon: "plus", to: "/dashboard?view=submit", active: onDashboard && view === "submit" },
      { label: "Guards", icon: "users", to: "/dashboard/guards", active: location.pathname === "/dashboard/guards" },
      { label: "Analytics", icon: "clipboard", to: "/dashboard/analytics", active: location.pathname === "/dashboard/analytics" },
    );
  } else if (user?.role === "GUARD") {
    links.push(
      { label: "Gate console", icon: "clipboard", to: "/dashboard/operations", active: location.pathname === "/dashboard/operations" },
      { label: "Recent activity", icon: "home", to: "/dashboard/activity", active: location.pathname === "/dashboard/activity" },
    );
  }
  if (user) links.push({ label: "Profile", icon: "users", to: "/dashboard/profile", active: location.pathname === "/dashboard/profile" });
  if (user?.role === "ADMIN" || user?.role === "MALL_OWNER" && user.status === "ACTIVE") {
    links.splice(links.length - 1, 0,
      { label: "Reservations", icon: "clipboard", to: "/dashboard/reservations", active: location.pathname === "/dashboard/reservations" },
      { label: "Gate activity", icon: "home", to: "/dashboard/gate-activity", active: location.pathname === "/dashboard/gate-activity" });
  }
  if (user?.role !== "USER" && user?.role !== "GUARD") {
    links.push({ label: "Public directory", icon: "pin", to: "/malls", active: location.pathname.startsWith("/malls") });
  }
  const currentLabel = location.pathname.includes("/inventory") ? "Parking layout"
    : location.pathname.endsWith("/edit") ? "Edit mall"
      : links.find((link) => link.active)?.label || "Overview";

  useEffect(() => {
    if (!sidebarOpen) return;
    const trigger = menuButton.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const nodes = () => [...sidebar.current.querySelectorAll('a[href], button:not([disabled])')].filter((node) => node.getClientRects().length);
    nodes()[0]?.focus();
    const handleKey = (event) => {
      if (event.key === "Escape") setSidebarOpen(false);
      if (event.key === "Tab") {
        const list = nodes();
        const first = list[0];
        const last = list[list.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    const handleResize = () => { if (window.innerWidth > 768) setSidebarOpen(false); };
    document.addEventListener("keydown", handleKey);
    window.addEventListener("resize", handleResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("resize", handleResize);
      trigger?.focus();
    };
  }, [sidebarOpen]);

  return <div className="dashboard-layout">
    <a className="skip-link" href="#dashboard-main">Skip to dashboard content</a>
    {sidebarOpen && <div className="dashboard-backdrop" onClick={closeSidebar} aria-hidden="true" />}
    <aside ref={sidebar} id="app-navigation" className={`dashboard-sidebar ${sidebarOpen ? "sidebar-open" : ""}`} aria-label="Main navigation" role={sidebarOpen ? "dialog" : undefined} aria-modal={sidebarOpen || undefined}>
      <div className="sidebar-header">
        <Link to="/" className="brand sidebar-brand" onClick={closeSidebar}><span className="brand-mark">P</span>ParkEase</Link>
        <button className="sidebar-close icon-button" onClick={closeSidebar} aria-label="Close navigation"><Icon name="close" /></button>
        <span className="sidebar-version">{roleLabel}</span>
      </div>
      <nav className="sidebar-nav" aria-label={roleLabel}>
        {links.map((link) => <Link key={link.to} to={link.to} onClick={closeSidebar} aria-current={link.active ? "page" : undefined} className={`sidebar-link ${link.active ? "sidebar-link-active" : ""}`}><Icon name={link.icon} /><span>{link.label}</span></Link>)}
      </nav>
      <div className="sidebar-footer">
        <Link to="/" className="sidebar-back-link" onClick={closeSidebar}><Icon name="arrow" /> Back to home</Link>
        <div className="sidebar-profile"><span className="profile-avatar">{initials}</span><div><strong>{user?.name || "Welcome to ParkEase"}</strong><span>{user ? roleLabel : "Find your next destination"}</span></div></div>
      </div>
    </aside>
    <div className="dashboard-body" inert={sidebarOpen}>
      <header className="dashboard-header">
        <div className="dashboard-header-left">
          <button ref={menuButton} type="button" className="dashboard-menu-toggle icon-button" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle navigation sidebar" aria-controls="app-navigation" aria-expanded={sidebarOpen}><Icon name="menu" /></button>
          <div className="app-breadcrumb"><span>{roleLabel.replace(" portal", "")}</span><span aria-hidden="true">/</span><strong>{currentLabel}</strong></div>
        </div>
        <div className="dashboard-header-actions">
          {user ? <><span className="header-account-name">{user.name}</span><span className="profile-avatar">{initials}</span><button type="button" className="icon-button signout-button" disabled={isSigningOut} onClick={logout} aria-label={isSigningOut ? "Signing out" : "Sign out"}><Icon name="exit" /></button></> : <Link className="button button-primary button-sm" to="/login">Sign in <Icon name="arrow" size={16} /></Link>}
        </div>
      </header>
      <main id="dashboard-main" className="dashboard-main">
        {logoutError && <p className="form-error-text" role="alert">{logoutError}</p>}
        {children || <Outlet />}
      </main>
      <footer className="workspace-footer"><span>ParkEase</span><span>A smoother arrival starts here.</span></footer>
    </div>
  </div>;
}
