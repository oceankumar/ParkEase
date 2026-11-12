import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import PageHeader from "../components/PageHeader.jsx";
import PageContainer from "../components/PageContainer.jsx";
import Modal from "../components/Modal.jsx";
import Select from "../components/Select.jsx";
import Input from "../components/Input.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Skeleton from "../components/Skeleton.jsx";
import { getMallById, isMallApiAvailable } from "../services/mallService.js";

/**
 * MallDetailsPage: Comprehensive dedicated view for a selected shopping mall.
 * Displays verified mall information, operating hours, contact info,
 * parking capacity, and bay reservation access without inventing mock data.
 */
export default function MallDetailsPage({
  initialMall,
  initialLoading,
} = {}) {
  const { id } = useParams();

  const [mall, setMall] = useState(() => initialMall || null);
  const [isLoading, setIsLoading] = useState(() =>
    typeof initialLoading === "boolean" ? initialLoading : id ? isMallApiAvailable() : false
  );
  const [error, setError] = useState(null);
  const [isPendingBackend, setIsPendingBackend] = useState(() => !isMallApiAvailable());

  // Reservation modal state
  const [reservationModalOpen, setReservationModalOpen] = useState(false);
  const [selectedFloor, setSelectedFloor] = useState("b1");
  const [reservationNotice, setReservationNotice] = useState(null);

  const loadMallDetails = useCallback(async () => {
    if (!id && !initialMall) return;
    setIsLoading(true);
    setError(null);
    try {
      const result = await getMallById(id);
      setMall(result.mall || null);
      setIsPendingBackend(Boolean(result.isPendingBackend));
    } catch (err) {
      setError(err.message || "Failed to load mall details. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  }, [id, initialMall]);

  useEffect(() => {
    if (initialMall !== undefined && initialMall !== null) {
      return;
    }

    if (!id) {
      return;
    }

    let isMounted = true;
    getMallById(id)
      .then((result) => {
        if (isMounted) {
          setMall(result.mall || null);
          setIsPendingBackend(Boolean(result.isPendingBackend));
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || "Failed to load mall details. Please check your connection.");
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
  }, [id, initialMall]);

  const handleSimulateReservation = (e) => {
    e.preventDefault();
    setReservationNotice(
      `Atomic reservation engine for ${mall?.name || "this mall"} will be activated in Sprint 4 (Shikhar & Mehak). Real-time slot allocation is scheduled.`
    );
  };

  return (
    <PageContainer>
      <div className="mall-details-layout">
        {/* Top Navigation & Back Link */}
        <div className="mall-details-topbar">
          <Button to="/malls" variant="outline" size="sm">
            ← Back to All Malls
          </Button>
          <div style={{ display: "flex", gap: "8px" }}>
            <Button to="/dashboard" variant="ghost" size="sm">
              User Dashboard ↗
            </Button>
          </div>
        </div>

        {/* Global Error Banner */}
        {error && (
          <ErrorMessage
            title="Failed to Load Mall"
            message={error}
            onRetry={loadMallDetails}
            onDismiss={() => setError(null)}
          />
        )}

        {/* Loading Skeletons */}
        {isLoading && (
          <div aria-busy="true" aria-label="Loading mall details">
            <Skeleton height="140px" style={{ marginBottom: "24px" }} />
            <div className="mall-details-grid">
              <Skeleton height="320px" />
              <Skeleton height="320px" />
            </div>
          </div>
        )}

        {/* Not Found / Pending Backend State */}
        {!isLoading && !error && !mall && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <EmptyState
              icon="🏢"
              title="Mall Profile Not Found"
              description="The requested shopping mall is either not registered or the backend mall intelligence service is pending."
              action={
                <Button to="/malls" variant="accent" size="sm">
                  Browse Malls Directory
                </Button>
              }
            />

            {isPendingBackend && (
              <div className="auth-status-banner info" role="status">
                <div>
                  <strong>Sprint 3 Notice: </strong>
                  <span>
                    Backend mall details endpoints (`GET /api/malls/:id`) are currently pending release (Sprint 3).
                    No live backend records are available for this ID.
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mall Profile Loaded Content */}
        {!isLoading && !error && mall && (
          <>
            {/* Header */}
            <PageHeader
              eyebrow={mall.city ? `MALL PROFILE • ${mall.city.toUpperCase()}` : "MALL PROFILE"}
              title={mall.name}
              description={mall.address ? `${mall.address}${mall.city ? `, ${mall.city}` : ""}` : "Verified ParkEase Partner Mall"}
              badge={
                <Badge variant={mall.status === "ACTIVE" ? "success" : "neutral"} dot>
                  {mall.status === "ACTIVE" ? "Live Partner" : mall.status}
                </Badge>
              }
              actions={
                <div className="page-actions">
                  <Button
                    to={`/malls/${mall.id}/parking`}
                    variant="accent"
                    size="sm"
                  >
                    🅿 View Parking Availability
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setReservationNotice(null);
                      setReservationModalOpen(true);
                    }}
                  >
                    Find &amp; Reserve Parking
                  </Button>
                </div>
              }
            />

            {/* Grid Layout: Main Overview & Sidebar */}
            <div className="mall-details-grid">
              {/* Left Column: Specifications & Information */}
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {/* Key Metrics / Overview Card */}
                <Card title="Parking & Operating Overview">
                  <div className="mall-info-summary-grid">
                    {/* Parking Capacity */}
                    {typeof mall.totalSlots === "number" && (
                      <div className="mall-info-item">
                        <span className="mall-info-label">Total Parking Capacity</span>
                        <span className="mall-info-value">{mall.totalSlots} Bays</span>
                      </div>
                    )}

                    {/* Available Slots */}
                    {typeof mall.availableSlots === "number" && (
                      <div className="mall-info-item">
                        <span className="mall-info-label">Current Available Bays</span>
                        <span className="mall-info-value" style={{ color: "var(--color-accent)" }}>
                          {mall.availableSlots} Available
                        </span>
                      </div>
                    )}

                    {/* Operating Hours */}
                    {mall.operatingHours && (
                      <div className="mall-info-item">
                        <span className="mall-info-label">Operating Hours</span>
                        <span className="mall-info-value">{mall.operatingHours}</span>
                      </div>
                    )}

                    {/* City / Location */}
                    {mall.location && (
                      <div className="mall-info-item">
                        <span className="mall-info-label">Location / City</span>
                        <span className="mall-info-value">{mall.location}</span>
                      </div>
                    )}
                  </div>

                  {/* Floors Breakdown (if provided by backend) */}
                  {Array.isArray(mall.floors) && mall.floors.length > 0 && (
                    <div style={{ marginTop: "16px" }}>
                      <h4 style={{ fontSize: "14px", fontWeight: "700", marginBottom: "8px" }}>
                        Parking Levels &amp; Basements
                      </h4>
                      <div className="mall-tags-group">
                        {mall.floors.map((floor, idx) => (
                          <Badge key={idx} variant="primary" size="sm">
                            {typeof floor === "object" ? `${floor.name || floor.level}: ${floor.slots || 0} bays` : floor}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Amenities (if provided by backend) */}
                  {Array.isArray(mall.amenities) && mall.amenities.length > 0 && (
                    <div style={{ marginTop: "16px" }}>
                      <h4 style={{ fontSize: "14px", fontWeight: "700", marginBottom: "8px" }}>
                        Parking Amenities
                      </h4>
                      <div className="mall-tags-group">
                        {mall.amenities.map((amenity, idx) => (
                          <Badge key={idx} variant="neutral" size="sm">
                            ✓ {amenity}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>

                {/* Location & Directions Card */}
                {(mall.address || mall.city || mall.pincode) && (
                  <Card title="Address &amp; Location">
                    <p style={{ fontSize: "14px", lineHeight: "1.6", color: "var(--color-text-secondary)" }}>
                      <strong>Full Address: </strong>
                      {mall.address}
                      {mall.city && `, ${mall.city}`}
                      {mall.state && `, ${mall.state}`}
                      {mall.pincode && ` - ${mall.pincode}`}
                    </p>
                  </Card>
                )}
              </div>

              {/* Right Column: Contact & Quick Actions Sidebar */}
              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {/* Quick Reservation Action Card */}
                <Card title="Reserve a Bay" subtitle="Automated entry pass & boom barrier QR:">
                  <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: "1.5", marginBottom: "16px" }}>
                    Select your preferred basement level and lock in a parking bay before arriving at {mall.name}.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <Button
                      to={`/malls/${mall.id}/parking`}
                      variant="accent"
                      size="md"
                      style={{ width: "100%" }}
                    >
                      🅿 View Parking Availability
                    </Button>
                    <Button
                      variant="outline"
                      size="md"
                      onClick={() => {
                        setReservationNotice(null);
                        setReservationModalOpen(true);
                      }}
                      style={{ width: "100%" }}
                    >
                      🅿 Find Parking at {mall.name}
                    </Button>
                  </div>
                </Card>

                {/* Contact Card (if provided by backend) */}
                {(mall.contactPhone || mall.contactEmail) && (
                  <Card title="Mall Parking Helpdesk">
                    <div className="mall-contact-card">
                      {mall.contactPhone && (
                        <div>
                          <strong>Phone: </strong>
                          <a href={`tel:${mall.contactPhone}`}>{mall.contactPhone}</a>
                        </div>
                      )}
                      {mall.contactEmail && (
                        <div>
                          <strong>Email: </strong>
                          <a href={`mailto:${mall.contactEmail}`}>{mall.contactEmail}</a>
                        </div>
                      )}
                    </div>
                  </Card>
                )}
              </div>
            </div>
          </>
        )}

        {/* Find / Reserve Parking Modal */}
        <Modal
          isOpen={reservationModalOpen}
          onClose={() => setReservationModalOpen(false)}
          title={`Find Parking • ${mall?.name || "Mall"}`}
          description="Select basement level and vehicle type to reserve parking."
          actions={
            <>
              <Button variant="secondary" onClick={() => setReservationModalOpen(false)}>
                Close
              </Button>
              <Button variant="accent" onClick={handleSimulateReservation}>
                Check Availability
              </Button>
            </>
          }
        >
          <form onSubmit={handleSimulateReservation} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <Select
              label="Select Parking Level"
              value={selectedFloor}
              onChange={(e) => setSelectedFloor(e.target.value)}
              options={
                Array.isArray(mall?.floors) && mall.floors.length > 0
                  ? mall.floors.map((f, i) => ({
                      value: typeof f === "object" ? f.level || `f${i}` : `f${i}`,
                      label: typeof f === "object" ? f.name || `Floor ${f.level}` : String(f),
                    }))
                  : [
                      { value: "b1", label: "Basement 1 (Valet & EV)" },
                      { value: "b2", label: "Basement 2 (General 4-Wheelers)" },
                      { value: "b3", label: "Basement 3 (Overnight & Long-Term)" },
                    ]
              }
            />

            <Select
              label="Vehicle Type"
              options={[
                { value: "car", label: "Car / SUV / Sedan" },
                { value: "ev", label: "Electric Vehicle (EV Charging Bay)" },
                { value: "accessible", label: "Accessible / Disability Reserved" },
                { value: "bike", label: "Two-Wheeler / Bike" },
              ]}
            />

            <Input
              label="Vehicle Registration Number"
              placeholder="e.g. MH 02 AB 1234"
              helperText="Plate number is encoded into your automated barrier entry pass."
            />

            {reservationNotice ? (
              <div className="auth-status-banner info" role="status">
                <div>
                  <strong>Sprint 4 Note: </strong>
                  <span>{reservationNotice}</span>
                </div>
              </div>
            ) : (
              <p style={{ fontSize: "13px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
                Live sensor bay allocation connects directly with mall boom barriers in Sprint 4.
              </p>
            )}
          </form>
        </Modal>
      </div>
    </PageContainer>
  );
}
