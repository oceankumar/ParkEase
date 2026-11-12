import { useState, useEffect, useCallback } from "react";
import Button from "../components/Button.jsx";
import StatCard from "../components/StatCard.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import PageHeader from "../components/PageHeader.jsx";
import PageContainer from "../components/PageContainer.jsx";
import Modal from "../components/Modal.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Skeleton from "../components/Skeleton.jsx";
import useAuth from "../hooks/useAuth.js";
import { getUserBookings, isBookingApiAvailable } from "../services/bookingService.js";
import { ROLES } from "../constants/roles.js";

/**
 * DashboardPage: Polished User Dashboard for authenticated ParkEase drivers and shoppers.
 * Displays personalized greeting, live booking summary metrics, quick actions,
 * and a recent reservations list with loading, empty, and error states.
 */
export default function DashboardPage({
  initialLoading,
  initialBookings,
  initialStats,
} = {}) {
  const { user } = useAuth();

  const [bookings, setBookings] = useState(() => initialBookings || []);
  const [stats, setStats] = useState(() => initialStats || { total: 0, active: 0, completed: 0 });
  const [isLoading, setIsLoading] = useState(() =>
    typeof initialLoading === "boolean" ? initialLoading : isBookingApiAvailable()
  );
  const [error, setError] = useState(null);
  const [isPendingBackend, setIsPendingBackend] = useState(() => !isBookingApiAvailable());

  // Modals state
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [qrModalOpen, setQrModalOpen] = useState(false);

  /**
   * Fetch bookings and summary metrics.
   * Handles pending backend API gracefully without inventing fake data.
   */
  const loadBookingsData = useCallback(async () => {
    try {
      const result = await getUserBookings();
      setBookings(result.bookings || []);
      setStats(result.stats || { total: 0, active: 0, completed: 0 });
      setIsPendingBackend(Boolean(result.isPendingBackend));
      setError(null);
    } catch (err) {
      setError(err.message || "Failed to load parking reservations. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleRefresh = async () => {
    setIsLoading(true);
    await loadBookingsData();
  };

  useEffect(() => {
    if (initialBookings !== undefined && initialBookings !== null) {
      return;
    }

    let isMounted = true;
    getUserBookings()
      .then((result) => {
        if (isMounted) {
          setBookings(result.bookings || []);
          setStats(result.stats || { total: 0, active: 0, completed: 0 });
          setIsPendingBackend(Boolean(result.isPendingBackend));
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || "Failed to load parking reservations. Please check your connection.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [initialBookings]);

  // Guard: strictly restrict to USER role accounts
  if (user && user.role && user.role !== ROLES.USER) {
    return (
      <PageContainer className="unauthorized-page-container">
        <div className="unauthorized-card">
          <Badge variant="danger" size="md">
            403 Forbidden
          </Badge>
          <h1 className="unauthorized-title">Access Restricted</h1>
          <p className="unauthorized-text">
            This dashboard is dedicated to <strong>Driver / Customer</strong> accounts.
            Your account role is <strong>{user.role}</strong>. Please switch to your designated management portal.
          </p>
          <div className="unauthorized-actions">
            <Button to="/" variant="secondary">
              Return to Public Home
            </Button>
          </div>
        </div>
      </PageContainer>
    );
  }

  const handleViewPass = (booking) => {
    setSelectedBooking(booking);
    setQrModalOpen(true);
  };

  const handleScrollToBookings = () => {
    const el = document.getElementById("recent-bookings-section");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const displayName = user?.name || user?.email?.split("@")[0] || "Driver";

  return (
    <div className="dashboard-content-grid">
      {/* 1. Personalized Welcome Header */}
      <PageHeader
        eyebrow="USER PORTAL"
        title={`Welcome back, ${displayName}!`}
        description="Monitor active parking bay reservations, download digital QR gate entry passes, and find live parking across partner malls."
        badge={
          <Badge variant="success" dot>
            Driver Account Active
          </Badge>
        }
        actions={
          <div className="page-actions">
            <Button
              to="/malls"
              variant="accent"
              size="sm"
            >
              🅿 Find Parking
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={isLoading}
              onClick={handleRefresh}
            >
              ↻ Refresh
            </Button>
          </div>
        }
      />

      {/* Authenticated User Metadata Details */}
      <div className="welcome-user-meta" aria-label="Account details">
        <span className="user-meta-pill">
          <span aria-hidden="true">✉</span>
          <span>{user?.email || "driver@parkease.com"}</span>
        </span>
        <span className="user-meta-pill">
          <span aria-hidden="true">👤</span>
          <span>Role: <strong>{user?.role || "USER"}</strong></span>
        </span>
        <span className="user-meta-pill">
          <span className="status-dot online" aria-hidden="true" />
          <span>Active Session</span>
        </span>
      </div>

      {/* Global Error Notice if initial fetch failed */}
      {error && (
        <ErrorMessage
          title="Could Not Refresh Reservations"
          message={error}
          onRetry={handleRefresh}
          onDismiss={() => setError(null)}
        />
      )}

      {/* 2. Summary Metric Cards: Total, Active, Completed */}
      <section className="dashboard-summary-grid" aria-label="Parking summary statistics">
        <StatCard
          label="Total Bookings"
          value={isLoading ? "--" : stats.total}
          note={isPendingBackend ? "Reservation stats connect in Sprint 4" : "All-time parking reservations"}
          badge={isPendingBackend ? "Sprint 4" : `${stats.total} total`}
          badgeVariant={isPendingBackend ? "neutral" : "primary"}
          loading={isLoading}
        />

        <StatCard
          label="Active Bookings"
          value={isLoading ? "--" : stats.active}
          note={isPendingBackend ? "Live gate passes connect in Sprint 4" : "Currently reserved or checked-in bays"}
          badge={stats.active > 0 ? "Active Now" : "None Active"}
          badgeVariant={stats.active > 0 ? "success" : "neutral"}
          loading={isLoading}
        />

        <StatCard
          label="Completed Bookings"
          value={isLoading ? "--" : stats.completed}
          note={isPendingBackend ? "Visit logs connect in Sprint 4" : "Successfully completed parking visits"}
          badge={stats.completed > 0 ? "Completed" : "None"}
          badgeVariant="neutral"
          loading={isLoading}
        />
      </section>

      {/* 3. Quick Action Cards */}
      <section className="quick-actions-grid" aria-label="Quick actions">
        <Card className="quick-action-card">
          <div className="quick-action-header">
            <div className="quick-action-icon" aria-hidden="true">
              🅿
            </div>
            <div>
              <h3 className="quick-action-title">Find Parking</h3>
              <p className="quick-action-desc">
                Search partner shopping malls, check real-time bay availability across basement floors, and reserve ahead of arrival.
              </p>
            </div>
          </div>
          <Button to="/malls" variant="accent" size="sm">
            Search Available Slots ↗
          </Button>
        </Card>

        <Card className="quick-action-card">
          <div className="quick-action-header">
            <div className="quick-action-icon" aria-hidden="true">
              📋
            </div>
            <div>
              <h3 className="quick-action-title">My Bookings</h3>
              <p className="quick-action-desc">
                Access your digital QR entry passes, inspect assigned parking bays, check arrival directions, and view past history.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleScrollToBookings}>
            View Reservations ↓
          </Button>
        </Card>
      </section>

      {/* 4. Recent Bookings Section */}
      <section id="recent-bookings-section" className="bookings-section" aria-label="Recent bookings">
        <Card
          title="Recent Bookings"
          subtitle="Your latest mall parking reservations and digital gate entry passes:"
        >
          {/* Loading State */}
          {isLoading && (
            <div className="bookings-list" aria-busy="true" aria-label="Loading reservations">
              <Skeleton height="72px" />
              <Skeleton height="72px" />
              <Skeleton height="72px" />
            </div>
          )}

          {/* Error State */}
          {!isLoading && error && (
            <ErrorMessage
              title="Unable to Load Bookings"
              message={error}
              onRetry={handleRefresh}
            />
          )}

          {/* Empty State */}
          {!isLoading && !error && bookings.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <EmptyState
                icon="🅿"
                title="No Parking Reservations Found"
                description="You haven't reserved any parking bays yet. Explore available shopping mall parking to reserve your first slot."
                action={
                  <Button to="/malls" variant="accent" size="sm">
                    Find Parking Now
                  </Button>
                }
              />

              {isPendingBackend && (
                <div className="auth-status-banner info" role="status">
                  <div>
                    <strong>Sprint 4 Note: </strong>
                    <span>
                      Live atomic booking APIs are currently scheduled for Sprint 4 (Shikhar &amp; Mehak).
                      No live backend bookings are recorded yet.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Booking List with Real/Fetched Bookings */}
          {!isLoading && !error && bookings.length > 0 && (
            <div className="bookings-list" role="list">
              {bookings.map((booking) => {
                const isConfirmed = booking.status === "CONFIRMED" || booking.status === "ACTIVE";
                const isCompleted = booking.status === "COMPLETED";

                return (
                  <div key={booking.id} className="booking-item-card" role="listitem">
                    <div className="booking-main-info">
                      <div className="booking-mall-title">
                        <span>{booking.mallName}</span>
                        <Badge
                          variant={isConfirmed ? "success" : isCompleted ? "neutral" : "danger"}
                          size="sm"
                          dot={isConfirmed}
                        >
                          {booking.status}
                        </Badge>
                      </div>

                      <div className="booking-meta-row">
                        <span>
                          <strong>Bay:</strong> {booking.slotCode} ({booking.floor})
                        </span>
                        <span>•</span>
                        <span>
                          <strong>Vehicle:</strong> {booking.vehicleNumber}
                        </span>
                        <span>•</span>
                        <span>
                          <strong>Time:</strong>{" "}
                          {new Date(booking.startTime).toLocaleDateString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {booking.totalAmount > 0 && (
                          <>
                            <span>•</span>
                            <span>
                              <strong>Fee:</strong> ${booking.totalAmount.toFixed(2)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="booking-actions-group">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleViewPass(booking)}
                      >
                        QR Pass ↗
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </section>

      {/* QR Pass / Booking Details Modal */}
      <Modal
        isOpen={qrModalOpen}
        onClose={() => setQrModalOpen(false)}
        title="Digital QR Entry Pass"
        description="Present this pass at the mall boom barrier scanner for automated gate access."
        actions={
          <Button variant="secondary" onClick={() => setQrModalOpen(false)}>
            Close
          </Button>
        }
      >
        {selectedBooking && (
          <div style={{ textAlign: "center" }}>
            <div className="qr-code-placeholder" aria-label="QR Code placeholder">
              <span style={{ fontSize: "36px" }} aria-hidden="true">
                ☷
              </span>
              <span>PARKEASE QR PASS</span>
              <span style={{ fontSize: "10px", color: "var(--color-text-muted)" }}>
                ID: {selectedBooking.id.slice(0, 8)}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", textAlign: "left", fontSize: "14px" }}>
              <div>
                <strong>Mall: </strong>
                <span>{selectedBooking.mallName}</span>
              </div>
              <div>
                <strong>Assigned Bay: </strong>
                <span>{selectedBooking.slotCode} ({selectedBooking.floor})</span>
              </div>
              <div>
                <strong>Vehicle Plate: </strong>
                <span>{selectedBooking.vehicleNumber}</span>
              </div>
              <div>
                <strong>Status: </strong>
                <Badge variant="success" size="sm" dot>
                  {selectedBooking.status}
                </Badge>
              </div>
            </div>

            <p style={{ marginTop: "16px", fontSize: "12px", color: "var(--color-text-muted)" }}>
              QR entry/exit scanners operate autonomously with security guard tablets during Sprint 4.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
