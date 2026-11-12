import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import StatCard from "../components/StatCard.jsx";
import PageHeader from "../components/PageHeader.jsx";
import PageContainer from "../components/PageContainer.jsx";
import Modal from "../components/Modal.jsx";
import Select from "../components/Select.jsx";
import Input from "../components/Input.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Skeleton from "../components/Skeleton.jsx";
import { getMallById, isMallApiAvailable } from "../services/mallService.js";
import {
  getParkingAvailability,
  isParkingApiAvailable,
  SLOT_STATUS,
} from "../services/parkingService.js";

/**
 * Helper to map slot status to Badge variant.
 */
function getStatusBadgeVariant(status) {
  switch (String(status).toUpperCase()) {
    case SLOT_STATUS.AVAILABLE:
      return "success";
    case SLOT_STATUS.OCCUPIED:
      return "danger";
    case SLOT_STATUS.RESERVED:
      return "warning";
    case SLOT_STATUS.MAINTENANCE:
    default:
      return "neutral";
  }
}

/**
 * ParkingAvailabilityPage: Dedicated real-time parking availability interface
 * for a selected shopping mall. Groups bays by floor, displays live status indicators,
 * provides dynamic floor and vehicle filters, and preserves contract integrity.
 */
export default function ParkingAvailabilityPage({
  initialMall = null,
  initialData = null,
  initialLoading = undefined,
} = {}) {
  const { id } = useParams();
  const mallId = id || initialMall?.id || "";

  // Data states
  const [mall, setMall] = useState(() => initialMall);
  const [slots, setSlots] = useState(() => initialData?.slots || []);
  const [summary, setSummary] = useState(() => initialData?.summary || null);
  const [supportedFloors, setSupportedFloors] = useState(() => initialData?.supportedFloors || []);
  const [supportedVehicleTypes, setSupportedVehicleTypes] = useState(
    () => initialData?.supportedVehicleTypes || []
  );
  const [supportedStatuses, setSupportedStatuses] = useState(
    () => initialData?.supportedStatuses || []
  );

  // Status & loading states
  const [isLoading, setIsLoading] = useState(() =>
    typeof initialLoading === "boolean"
      ? initialLoading
      : mallId
        ? isParkingApiAvailable() || isMallApiAvailable()
        : false
  );
  const [error, setError] = useState(null);
  const [isPendingBackend, setIsPendingBackend] = useState(() => !isParkingApiAvailable());

  // Filter states
  const [selectedFloor, setSelectedFloor] = useState("ALL");
  const [selectedVehicleType, setSelectedVehicleType] = useState("ALL");
  const [selectedStatus, setSelectedStatus] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Slot inspection modal state
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [reservationNotice, setReservationNotice] = useState(null);

  // Fetch mall details and parking slots
  const loadData = useCallback(async () => {
    if (!mallId) return;
    setIsLoading(true);
    setError(null);

    try {
      // Load mall profile (if not provided)
      let currentMall = initialMall;
      if (!currentMall) {
        const mallResult = await getMallById(mallId);
        currentMall = mallResult.mall || null;
        setMall(currentMall);
      }

      // Load parking availability
      const parkingResult = await getParkingAvailability(mallId);
      setSlots(parkingResult.slots || []);
      setSummary(parkingResult.summary || null);
      setSupportedFloors(parkingResult.supportedFloors || []);
      setSupportedVehicleTypes(parkingResult.supportedVehicleTypes || []);
      setSupportedStatuses(parkingResult.supportedStatuses || []);
      setIsPendingBackend(Boolean(parkingResult.isPendingBackend));
    } catch (err) {
      setError(
        err.message || "Failed to load parking availability. Please check your network connection."
      );
    } finally {
      setIsLoading(false);
    }
  }, [mallId, initialMall]);

  useEffect(() => {
    if (initialData !== null && initialData !== undefined) {
      return;
    }
    if (!mallId) return;

    let isMounted = true;
    (async () => {
      try {
        let currentMall = initialMall;
        if (!currentMall) {
          const mallRes = await getMallById(mallId);
          if (isMounted) {
            currentMall = mallRes.mall || null;
            setMall(currentMall);
          }
        }

        const parkingRes = await getParkingAvailability(mallId);
        if (isMounted) {
          setSlots(parkingRes.slots || []);
          setSummary(parkingRes.summary || null);
          setSupportedFloors(parkingRes.supportedFloors || []);
          setSupportedVehicleTypes(parkingRes.supportedVehicleTypes || []);
          setSupportedStatuses(parkingRes.supportedStatuses || []);
          setIsPendingBackend(Boolean(parkingRes.isPendingBackend));
        }
      } catch (err) {
        if (isMounted) {
          setError(
            err.message ||
              "Failed to load parking availability. Please check your network connection."
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [mallId, initialMall, initialData]);

  // Filter slots based on active criteria
  const filteredSlots = useMemo(() => {
    return slots.filter((slot) => {
      // Floor filter
      if (selectedFloor !== "ALL" && slot.floor !== selectedFloor) {
        return false;
      }
      // Vehicle type filter
      if (selectedVehicleType !== "ALL" && slot.vehicleType !== selectedVehicleType) {
        return false;
      }
      // Status filter
      if (selectedStatus !== "ALL" && slot.status !== selectedStatus) {
        return false;
      }
      // Search query (slot identifier / code)
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchesCode = slot.slotNumber?.toLowerCase().includes(query);
        const matchesFloor = slot.floor?.toLowerCase().includes(query);
        const matchesType = slot.vehicleType?.toLowerCase().includes(query);
        if (!matchesCode && !matchesFloor && !matchesType) {
          return false;
        }
      }
      return true;
    });
  }, [slots, selectedFloor, selectedVehicleType, selectedStatus, searchQuery]);

  // Group filtered slots by floor
  const slotsGroupedByFloor = useMemo(() => {
    const grouped = {};
    filteredSlots.forEach((slot) => {
      const floorKey = slot.floor || "General Level";
      if (!grouped[floorKey]) {
        grouped[floorKey] = [];
      }
      grouped[floorKey].push(slot);
    });
    return grouped;
  }, [filteredSlots]);

  const hasActiveFilters =
    selectedFloor !== "ALL" ||
    selectedVehicleType !== "ALL" ||
    selectedStatus !== "ALL" ||
    Boolean(searchQuery.trim());

  const handleClearFilters = () => {
    setSelectedFloor("ALL");
    setSelectedVehicleType("ALL");
    setSelectedStatus("ALL");
    setSearchQuery("");
  };

  const handleInspectSlot = (slot) => {
    setSelectedSlot(slot);
    setReservationNotice(null);
  };

  const handleAttemptBooking = (e) => {
    e.preventDefault();
    setReservationNotice(
      "Sprint 4 Notice: Slot booking engine (`POST /api/bookings`) is currently pending release by Shikhar & Mehak. Real-time bay reservation will be activated in Sprint 4."
    );
  };

  return (
    <PageContainer>
      <div className="parking-availability-layout">
        {/* Navigation Breadcrumb & Back Actions */}
        <div className="mall-details-topbar">
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <Button
              to={mallId ? `/malls/${mallId}` : "/malls"}
              variant="outline"
              size="sm"
            >
              ← Back to Mall Details
            </Button>
            <Button to="/malls" variant="ghost" size="sm">
              All Malls Directory
            </Button>
          </div>
          <Button to="/dashboard" variant="ghost" size="sm">
            User Dashboard ↗
          </Button>
        </div>

        {/* Global Error Banner */}
        {error && (
          <ErrorMessage
            title="Failed to Load Parking Availability"
            message={error}
            onRetry={loadData}
            onDismiss={() => setError(null)}
          />
        )}

        {/* Loading Skeletons */}
        {isLoading && (
          <div aria-busy="true" aria-label="Loading parking availability">
            <Skeleton height="120px" style={{ marginBottom: "20px" }} />
            <div className="parking-summary-grid">
              <Skeleton height="100px" />
              <Skeleton height="100px" />
              <Skeleton height="100px" />
              <Skeleton height="100px" />
            </div>
            <Skeleton height="64px" style={{ margin: "24px 0" }} />
            <div className="parking-slots-grid">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} height="130px" />
              ))}
            </div>
          </div>
        )}

        {/* Loaded Content */}
        {!isLoading && !error && (
          <>
            {/* Header */}
            <PageHeader
              eyebrow={
                mall?.city
                  ? `PARKING AVAILABILITY • ${mall.city.toUpperCase()}`
                  : "PARKING AVAILABILITY • REAL-TIME"
              }
              title={mall?.name ? `Parking Bays at ${mall.name}` : "Mall Parking Availability"}
              description={
                mall?.address
                  ? `${mall.address}${mall.city ? `, ${mall.city}` : ""} · Live slot occupancy & floor directory`
                  : "Real-time parking bay availability and floor breakdown."
              }
              badge={
                <Badge
                  variant={isPendingBackend ? "neutral" : "success"}
                  dot
                >
                  {isPendingBackend ? "Telemetry Pending" : "Live Availability"}
                </Badge>
              }
              actions={
                <div className="page-actions">
                  <Button
                    to={mallId ? `/malls/${mallId}` : "/malls"}
                    variant="outline"
                    size="sm"
                  >
                    View Mall Profile
                  </Button>
                </div>
              }
            />

            {/* Availability Summaries (rendered only when actual data exists) */}
            {summary && typeof summary.total === "number" && summary.total > 0 && (
              <div className="parking-summary-grid">
                <StatCard
                  label="Total Capacity"
                  value={`${summary.total}`}
                  note="Configured parking bays"
                  icon="🅿"
                />
                <StatCard
                  label="Available Bays"
                  value={`${summary.available}`}
                  badge="Ready"
                  badgeVariant="success"
                  note="Open for reservation"
                  icon="🟢"
                />
                <StatCard
                  label="Occupied Bays"
                  value={`${summary.occupied}`}
                  badge="In Use"
                  badgeVariant="danger"
                  note="Currently occupied"
                  icon="🚗"
                />
                <StatCard
                  label="Reserved Bays"
                  value={`${summary.reserved}`}
                  badge="Held"
                  badgeVariant="warning"
                  note="Pre-booked entry passes"
                  icon="🔒"
                />
              </div>
            )}

            {/* Pending Backend Notice (when backend endpoints are pending) */}
            {isPendingBackend && (
              <div className="auth-status-banner info" role="status" style={{ margin: "16px 0" }}>
                <div>
                  <strong>Sprint 3 / Sprint 4 Notice: </strong>
                  <span>
                    Backend parking slot inventory and telemetry endpoints (`GET /api/malls/:mallId/slots`)
                    are currently pending release by Shikhar &amp; Mehak. No live slots or sensor telemetry
                    have been connected yet.
                  </span>
                </div>
              </div>
            )}

            {/* Filters Bar: Rendered only when slots or supported filters exist */}
            {(slots.length > 0 || supportedFloors.length > 0 || supportedVehicleTypes.length > 0) && (
              <div className="parking-filter-bar">
                {/* Search by slot code */}
                <div className="parking-filter-input-group">
                  <Input
                    id="slot-search-input"
                    label="Search Bays"
                    placeholder="Search by bay number (e.g. B1-04, A1)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    icon={<span aria-hidden="true">🔍</span>}
                  />
                </div>

                {/* Dynamic Floor Filter (rendered only from backend-provided floors) */}
                {supportedFloors.length > 0 && (
                  <div className="parking-filter-select-group">
                    <Select
                      id="parking-floor-select"
                      label="Select Floor / Level"
                      value={selectedFloor}
                      onChange={(e) => setSelectedFloor(e.target.value)}
                      options={[
                        { value: "ALL", label: `All Floors (${supportedFloors.length})` },
                        ...supportedFloors.map((fl) => ({
                          value: fl,
                          label: fl.toLowerCase().startsWith("floor") || fl.toLowerCase().startsWith("level") || fl.toLowerCase().startsWith("basement")
                            ? fl
                            : `Floor ${fl}`,
                        })),
                      ]}
                    />
                  </div>
                )}

                {/* Dynamic Vehicle Type Filter (rendered only from backend-provided vehicle types) */}
                {supportedVehicleTypes.length > 0 && (
                  <div className="parking-filter-select-group">
                    <Select
                      id="parking-vehicle-type-select"
                      label="Vehicle Type"
                      value={selectedVehicleType}
                      onChange={(e) => setSelectedVehicleType(e.target.value)}
                      options={[
                        { value: "ALL", label: "All Vehicle Types" },
                        ...supportedVehicleTypes.map((type) => ({
                          value: type,
                          label: type,
                        })),
                      ]}
                    />
                  </div>
                )}

                {/* Status Filter (rendered only from backend-provided statuses) */}
                {supportedStatuses.length > 0 && (
                  <div className="parking-filter-select-group">
                    <Select
                      id="parking-status-select"
                      label="Slot Status"
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value)}
                      options={[
                        { value: "ALL", label: "All Statuses" },
                        ...supportedStatuses.map((st) => ({
                          value: st,
                          label: st.charAt(0) + st.slice(1).toLowerCase(),
                        })),
                      ]}
                    />
                  </div>
                )}

                {/* Clear Filters Action */}
                {hasActiveFilters && (
                  <div className="parking-filter-actions">
                    <Button variant="outline" size="sm" onClick={handleClearFilters}>
                      ✕ Clear Filters
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Results Counter */}
            {slots.length > 0 && (
              <div className="parking-results-header">
                <span className="parking-results-count">
                  Showing <strong>{filteredSlots.length}</strong> of {slots.length} configured parking bays
                </span>
                {hasActiveFilters && (
                  <span style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>
                    Filtered view active
                  </span>
                )}
              </div>
            )}

            {/* Slots Grid Grouped by Floor */}
            {filteredSlots.length > 0 ? (
              <div className="parking-floor-groups">
                {Object.entries(slotsGroupedByFloor).map(([floorName, floorSlots]) => {
                  const availableInFloor = floorSlots.filter(
                    (s) => s.status === SLOT_STATUS.AVAILABLE
                  ).length;

                  return (
                    <section key={floorName} className="parking-floor-section">
                      <div className="parking-floor-header">
                        <div className="parking-floor-title-group">
                          <h3 className="parking-floor-title">{floorName}</h3>
                          <Badge variant="neutral" size="sm">
                            {floorSlots.length} Total Bays
                          </Badge>
                        </div>
                        <span className="parking-floor-stat">
                          <strong style={{ color: "var(--color-accent)" }}>
                            {availableInFloor}
                          </strong>{" "}
                          available
                        </span>
                      </div>

                      <div className="parking-slots-grid">
                        {floorSlots.map((slot) => {
                          const badgeVariant = getStatusBadgeVariant(slot.status);
                          const isAvailable = slot.status === SLOT_STATUS.AVAILABLE;

                          return (
                            <div
                              key={slot.id || slot.slotNumber}
                              className={`parking-slot-card status-${slot.status?.toLowerCase() || "available"}`}
                              onClick={() => handleInspectSlot(slot)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  handleInspectSlot(slot);
                                }
                              }}
                              aria-label={`Slot ${slot.slotNumber}, Floor ${slot.floor}, Status ${slot.status}`}
                            >
                              <div className="parking-slot-card-header">
                                <span className="parking-slot-number">{slot.slotNumber}</span>
                                <Badge variant={badgeVariant} size="sm" dot>
                                  {slot.status}
                                </Badge>
                              </div>

                              <div className="parking-slot-card-body">
                                <div className="parking-slot-meta-row">
                                  <span className="parking-slot-meta-label">Vehicle:</span>
                                  <span className="parking-slot-meta-value">
                                    {slot.vehicleType}
                                  </span>
                                </div>

                                {slot.floor && (
                                  <div className="parking-slot-meta-row">
                                    <span className="parking-slot-meta-label">Level:</span>
                                    <span className="parking-slot-meta-value">{slot.floor}</span>
                                  </div>
                                )}

                                {typeof slot.hourlyRate === "number" && (
                                  <div className="parking-slot-meta-row">
                                    <span className="parking-slot-meta-label">Rate:</span>
                                    <span className="parking-slot-meta-value">
                                      ₹{slot.hourlyRate}/hr
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div className="parking-slot-card-footer">
                                <div className="parking-slot-features">
                                  {slot.isElectric && (
                                    <span
                                      className="parking-feature-chip ev"
                                      title="EV Fast Charging Available"
                                    >
                                      ⚡ EV
                                    </span>
                                  )}
                                  {slot.isAccessible && (
                                    <span
                                      className="parking-feature-chip accessible"
                                      title="Disability / Accessible Bay"
                                    >
                                      ♿ Accessible
                                    </span>
                                  )}
                                </div>
                                <span className="parking-slot-action-hint">
                                  {isAvailable ? "View Details ↗" : "Inspecting ↗"}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              // Empty State when no slots match or data is empty
              <div style={{ marginTop: "16px" }}>
                {slots.length > 0 && hasActiveFilters ? (
                  <EmptyState
                    icon="🔍"
                    title="No Matching Parking Slots"
                    description="No parking bays match the selected floor, vehicle type, or status filters."
                    action={
                      <Button variant="accent" size="sm" onClick={handleClearFilters}>
                        Reset All Filters
                      </Button>
                    }
                  />
                ) : (
                  <EmptyState
                    icon="🅿"
                    title="Parking Availability Unavailable"
                    description={
                      isPendingBackend
                        ? "Real-time bay telemetry and slot inventory endpoints are currently pending release (Sprint 3 / Sprint 4). Occupancy figures will be populated as partner sensors activate."
                        : "No parking slots are currently registered for this mall facility."
                    }
                    action={
                      <Button
                        to={mallId ? `/malls/${mallId}` : "/malls"}
                        variant="accent"
                        size="sm"
                      >
                        Return to Mall Profile
                      </Button>
                    }
                  />
                )}
              </div>
            )}
          </>
        )}

        {/* Slot Details Inspection Modal */}
        <Modal
          isOpen={Boolean(selectedSlot)}
          onClose={() => setSelectedSlot(null)}
          title={
            selectedSlot
              ? `Slot ${selectedSlot.slotNumber} • Details`
              : "Slot Details"
          }
          description={
            selectedSlot
              ? `${selectedSlot.floor ? `Floor: ${selectedSlot.floor} · ` : ""}Compatible with ${selectedSlot.vehicleType} vehicles`
              : ""
          }
          actions={
            <>
              <Button variant="secondary" onClick={() => setSelectedSlot(null)}>
                Close
              </Button>
              <Button
                variant={
                  selectedSlot?.status === SLOT_STATUS.AVAILABLE ? "accent" : "outline"
                }
                onClick={handleAttemptBooking}
              >
                {selectedSlot?.status === SLOT_STATUS.AVAILABLE
                  ? "🅿 Book This Slot"
                  : "Check Reservation Status"}
              </Button>
            </>
          }
        >
          {selectedSlot && (
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div className="mall-info-summary-grid">
                <div className="mall-info-item">
                  <span className="mall-info-label">Slot Code</span>
                  <span className="mall-info-value">{selectedSlot.slotNumber}</span>
                </div>

                <div className="mall-info-item">
                  <span className="mall-info-label">Status</span>
                  <span className="mall-info-value">
                    <Badge
                      variant={getStatusBadgeVariant(selectedSlot.status)}
                      size="sm"
                      dot
                    >
                      {selectedSlot.status}
                    </Badge>
                  </span>
                </div>

                <div className="mall-info-item">
                  <span className="mall-info-label">Floor / Level</span>
                  <span className="mall-info-value">
                    {selectedSlot.floor || "General Level"}
                  </span>
                </div>

                <div className="mall-info-item">
                  <span className="mall-info-label">Vehicle Type</span>
                  <span className="mall-info-value">{selectedSlot.vehicleType}</span>
                </div>

                {typeof selectedSlot.hourlyRate === "number" && (
                  <div className="mall-info-item">
                    <span className="mall-info-label">Hourly Tariff</span>
                    <span className="mall-info-value">₹{selectedSlot.hourlyRate}/hr</span>
                  </div>
                )}
              </div>

              {(selectedSlot.isElectric || selectedSlot.isAccessible) && (
                <div>
                  <h5 style={{ fontSize: "13px", fontWeight: "700", marginBottom: "6px" }}>
                    Bay Capabilities
                  </h5>
                  <div className="mall-tags-group">
                    {selectedSlot.isElectric && (
                      <Badge variant="accent" size="sm">
                        ⚡ EV Fast Charging Bay
                      </Badge>
                    )}
                    {selectedSlot.isAccessible && (
                      <Badge variant="primary" size="sm">
                        ♿ Accessible / Disability Reserved
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {/* Sprint 4 Booking Notice (Requirement 3: Do not allow users to book a slot yet unless backend supports it) */}
              {reservationNotice ? (
                <div className="auth-status-banner info" role="status">
                  <div>
                    <strong>Sprint 4 Booking Engine Notice: </strong>
                    <span>{reservationNotice}</span>
                  </div>
                </div>
              ) : (
                <p
                  style={{
                    fontSize: "12px",
                    color: "var(--color-text-secondary)",
                    lineHeight: "1.5",
                    margin: 0,
                  }}
                >
                  Direct slot reservation and QR gate entry pass generation will be activated in Sprint 4 once the booking transaction engine is released.
                </p>
              )}
            </div>
          )}
        </Modal>
      </div>
    </PageContainer>
  );
}
