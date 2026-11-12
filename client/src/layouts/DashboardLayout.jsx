import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import useAuth from "../hooks/useAuth.js";

/**
 * DashboardLayout: Application layout for dashboard and management views.
 * Features a responsive dark navy sidebar, top control header with status,
 * user session pill, logout action, and a main content viewport.
 */
export default function DashboardLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, logout } = useAuth();

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  const userInitials = user?.name
    ? user.name
        .split(" ")
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "PE";

  return (
    <div className="dashboard-layout">
      <a className="skip-link" href="#dashboard-main">
        Skip to dashboard content
      </a>

      {/* Backdrop overlay for mobile drawer */}
      {sidebarOpen && (
        <div
          className="dashboard-backdrop"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/* Sidebar navigation */}
      <aside
        className={`dashboard-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}
        aria-label="Dashboard navigation"
      >
        <div className="sidebar-header">
          <Link to="/" className="brand sidebar-brand" onClick={closeSidebar}>
            <span className="brand-mark" aria-hidden="true">
              P
            </span>
            ParkEase<span className="brand-dot">.</span>
          </Link>
          <span className="sidebar-version">Intelligence v0.1</span>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-group-title">Navigation</div>
          <NavLink
            to="/dashboard"
            end
            onClick={closeSidebar}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "sidebar-link-active" : ""}`
            }
          >
            <span className="sidebar-icon" aria-hidden="true">
              ▦
            </span>
            <span>Overview</span>
          </NavLink>
          <NavLink
            to="/malls"
            onClick={closeSidebar}
            className={({ isActive }) =>
              `sidebar-link ${isActive ? "sidebar-link-active" : ""}`
            }
          >
            <span className="sidebar-icon" aria-hidden="true">
              🏢
            </span>
            <span>Malls Directory</span>
          </NavLink>

          <div className="sidebar-group-title">Future Modules</div>
          <a
            href="#slots"
            className="sidebar-link disabled-link"
            onClick={(e) => e.preventDefault()}
          >
            <span className="sidebar-icon" aria-hidden="true">
              🅿
            </span>
            <span>Parking Slots</span>
            <span className="sidebar-badge">Planned</span>
          </a>

          <a
            href="#availability"
            className="sidebar-link disabled-link"
            onClick={(e) => e.preventDefault()}
          >
            <span className="sidebar-icon" aria-hidden="true">
              ◉
            </span>
            <span>Live Availability</span>
            <span className="sidebar-badge">Planned</span>
          </a>

          <a
            href="#bookings"
            className="sidebar-link disabled-link"
            onClick={(e) => e.preventDefault()}
          >
            <span className="sidebar-icon" aria-hidden="true">
              📋
            </span>
            <span>Reservations</span>
            <span className="sidebar-badge">Planned</span>
          </a>

          <a
            href="#analytics"
            className="sidebar-link disabled-link"
            onClick={(e) => e.preventDefault()}
          >
            <span className="sidebar-icon" aria-hidden="true">
              📈
            </span>
            <span>Analytics</span>
            <span className="sidebar-badge">Planned</span>
          </a>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-pill">
            <span className="status-dot online" aria-hidden="true" />
            <span>Foundation Preview</span>
          </div>
          <Link to="/" className="sidebar-back-link" onClick={closeSidebar}>
            ← Public Website
          </Link>
        </div>
      </aside>

      {/* Main dashboard body */}
      <div className="dashboard-body">
        {/* Top header */}
        <header className="dashboard-header" aria-label="Dashboard header">
          <div className="dashboard-header-left">
            <button
              type="button"
              className="dashboard-menu-toggle"
              onClick={toggleSidebar}
              aria-label="Toggle navigation sidebar"
              aria-expanded={sidebarOpen}
            >
              <span className="hamburger-line" />
              <span className="hamburger-line" />
              <span className="hamburger-line" />
            </button>
            <div className="dashboard-title-group">
              <span className="dashboard-crumb">ParkEase Console</span>
              <h1 className="dashboard-heading">Dashboard</h1>
            </div>
          </div>

          <div className="dashboard-header-actions">
            <div className="dashboard-status-indicator">
              <span className="status-dot online" aria-hidden="true" />
              <span>{user ? "Session Active" : "Foundation Active"}</span>
            </div>
            <Link to="/" className="button button-small button-outline">
              Public Site ↗
            </Link>
            <div
              className="user-avatar-pill"
              title={user ? `${user.name || "User"} (${user.role || "MEMBER"})` : "ParkEase User"}
            >
              <span className="user-avatar-initial">{userInitials}</span>
              <span className="user-avatar-role">{user?.role || "GUEST"}</span>
            </div>
            <button
              type="button"
              className="button button-small button-outline"
              onClick={logout}
              title="Sign out of ParkEase"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Dashboard main viewport */}
        <main id="dashboard-main" className="dashboard-main">
          {children || <Outlet />}
        </main>
      </div>
    </div>
  );
}
