import { useState, useEffect, useCallback, useMemo } from "react";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import PageHeader from "../components/PageHeader.jsx";
import PageContainer from "../components/PageContainer.jsx";
import Input from "../components/Input.jsx";
import Select from "../components/Select.jsx";
import EmptyState from "../components/EmptyState.jsx";
import ErrorMessage from "../components/ErrorMessage.jsx";
import Skeleton from "../components/Skeleton.jsx";
import { getMalls, isMallApiAvailable } from "../services/mallService.js";

/**
 * MallDiscoveryPage: Mall discovery and directory portal for ParkEase.
 * Displays partner shopping malls with real-time slot intelligence,
 * search by name or location, dynamic backend-supported city filters,
 * and loading, empty, and error handling without fake data.
 */
export default function MallDiscoveryPage({
  initialMalls,
  initialLoading,
  initialCities,
} = {}) {
  const [malls, setMalls] = useState(() => initialMalls || []);
  const [supportedCities, setSupportedCities] = useState(() => initialCities || []);
  const [isLoading, setIsLoading] = useState(() =>
    typeof initialLoading === "boolean" ? initialLoading : isMallApiAvailable()
  );
  const [error, setError] = useState(null);
  const [isPendingBackend, setIsPendingBackend] = useState(() => !isMallApiAvailable());

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("");

  const loadMallsData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getMalls();
      setMalls(result.malls || []);
      setSupportedCities(result.supportedCities || []);
      setIsPendingBackend(Boolean(result.isPendingBackend));
    } catch (err) {
      setError(err.message || "Failed to load mall directory. Please check your connection.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialMalls !== undefined && initialMalls !== null) {
      return;
    }

    let isMounted = true;
    getMalls()
      .then((result) => {
        if (isMounted) {
          setMalls(result.malls || []);
          setSupportedCities(result.supportedCities || []);
          setIsPendingBackend(Boolean(result.isPendingBackend));
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || "Failed to load mall directory. Please check your connection.");
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
  }, [initialMalls]);

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedCity("");
  };

  // Client-side filtering across actual backend records
  const filteredMalls = useMemo(() => {
    let result = malls;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (m) =>
          (m.name && m.name.toLowerCase().includes(q)) ||
          (m.address && m.address.toLowerCase().includes(q)) ||
          (m.city && m.city.toLowerCase().includes(q)) ||
          (m.location && m.location.toLowerCase().includes(q))
      );
    }

    if (selectedCity) {
      result = result.filter((m) => m.city === selectedCity);
    }

    return result;
  }, [malls, searchQuery, selectedCity]);

  const hasActiveFilters = Boolean(searchQuery.trim() || selectedCity);

  return (
    <PageContainer>
      <div className="malls-discovery-layout">
        {/* Page Header */}
        <PageHeader
          eyebrow="EXPLORE DESTINATIONS"
          title="Mall Directory & Smart Parking"
          description="Discover partner shopping malls equipped with ParkEase parking intelligence, live bay availability, and automated QR gate access."
          badge={
            <Badge variant="accent" dot>
              Live Directory
            </Badge>
          }
          actions={
            <div className="page-actions">
              <Button
                variant="outline"
                size="sm"
                loading={isLoading}
                onClick={loadMallsData}
              >
                ↻ Refresh Directory
              </Button>
            </div>
          }
        />

        {/* Global Error Banner */}
        {error && (
          <ErrorMessage
            title="Directory Refresh Failed"
            message={error}
            onRetry={loadMallsData}
            onDismiss={() => setError(null)}
          />
        )}

        {/* Search & Filter Bar */}
        <div className="malls-filter-bar" role="search" aria-label="Search and filter malls">
          <div className="malls-filter-input-group">
            <Input
              id="mall-search-input"
              label="Search Malls"
              placeholder="Search by mall name, area, or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              icon={<span aria-hidden="true">🔍</span>}
            />
          </div>

          {/* Supported City Filter (rendered only from backend-provided cities) */}
          <div className="malls-filter-select-group">
            <Select
              id="mall-city-select"
              label="Filter by City"
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              placeholder="All Cities"
              options={supportedCities.map((city) => ({
                value: city,
                label: city,
              }))}
              disabled={supportedCities.length === 0}
            />
          </div>

          <div className="malls-filter-actions">
            {hasActiveFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearFilters}
              >
                ✕ Clear Filters
              </Button>
            )}
          </div>
        </div>

        {/* Results Metadata Header */}
        <div className="malls-results-header">
          <span className="malls-results-count">
            {isLoading
              ? "Scanning mall networks..."
              : `Showing ${filteredMalls.length} ${filteredMalls.length === 1 ? "mall" : "malls"}${hasActiveFilters ? " (filtered)" : ""}`}
          </span>
        </div>

        {/* Loading Skeletons */}
        {isLoading && (
          <div className="malls-grid" aria-busy="true" aria-label="Loading malls directory">
            <Skeleton height="260px" />
            <Skeleton height="260px" />
            <Skeleton height="260px" />
          </div>
        )}

        {/* Empty States */}
        {!isLoading && !error && filteredMalls.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {hasActiveFilters ? (
              <EmptyState
                icon="🔍"
                title="No Matching Malls Found"
                description="No shopping malls match your current search criteria. Try modifying your search or clearing your filters."
                action={
                  <Button variant="outline" size="sm" onClick={handleClearFilters}>
                    Clear Active Filters
                  </Button>
                }
              />
            ) : (
              <>
                <EmptyState
                  icon="🏢"
                  title="Mall Directory Under Construction"
                  description="The live mall parking intelligence directory will activate once partner shopping malls are provisioned."
                />

                {isPendingBackend && (
                  <div className="auth-status-banner info" role="status">
                    <div>
                      <strong>Sprint 3 Notice: </strong>
                      <span>
                        Backend mall management services are currently pending release (Shikhar - Sprint 3).
                        No live mall records are connected yet.
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Mall Cards Grid */}
        {!isLoading && !error && filteredMalls.length > 0 && (
          <div className="malls-grid" role="list" aria-label="Shopping malls list">
            {filteredMalls.map((mall) => (
              <Card key={mall.id} className="mall-card" role="listitem">
                <div>
                  <div className="mall-card-header">
                    <h3 className="mall-card-title">{mall.name}</h3>
                    <Badge variant={mall.status === "ACTIVE" ? "success" : "neutral"} size="sm" dot>
                      {mall.status}
                    </Badge>
                  </div>

                  <div className="mall-card-meta">
                    {/* Location / Address */}
                    {(mall.address || mall.location) && (
                      <div className="mall-meta-row">
                        <span className="mall-meta-icon" aria-hidden="true">
                          📍
                        </span>
                        <span>
                          {mall.address}
                          {mall.city && mall.address ? `, ${mall.city}` : mall.city}
                        </span>
                      </div>
                    )}

                    {/* Operating Hours (if provided by backend) */}
                    {mall.operatingHours && (
                      <div className="mall-meta-row">
                        <span className="mall-meta-icon" aria-hidden="true">
                          🕒
                        </span>
                        <span>Open: {mall.operatingHours}</span>
                      </div>
                    )}

                    {/* Contact Phone (if provided by backend) */}
                    {mall.contactPhone && (
                      <div className="mall-meta-row">
                        <span className="mall-meta-icon" aria-hidden="true">
                          📞
                        </span>
                        <span>{mall.contactPhone}</span>
                      </div>
                    )}

                    {/* Parking Capacity (if provided by backend) */}
                    {typeof mall.totalSlots === "number" && (
                      <div className="mall-slots-pill">
                        <span aria-hidden="true">🅿</span>
                        <span>
                          Capacity: <strong>{mall.totalSlots}</strong> bays
                          {typeof mall.availableSlots === "number" && (
                            <> ({mall.availableSlots} available)</>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mall-card-actions">
                  <Button
                    to={`/malls/${mall.id}`}
                    variant="primary"
                    size="sm"
                  >
                    View Details ↗
                  </Button>
                  <Button
                    to={`/malls/${mall.id}`}
                    variant="accent"
                    size="sm"
                  >
                    Find Parking
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
