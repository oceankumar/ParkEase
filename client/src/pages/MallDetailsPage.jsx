import Icon from "../components/Icon.jsx";
import MallIllustration from "../components/MallIllustration.jsx";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import Button from "../components/Button.jsx";
import Card from "../components/Card.jsx";
import Badge from "../components/Badge.jsx";
import PageHeader from "../components/PageHeader.jsx";
import PageContainer from "../components/PageContainer.jsx";
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

  return <PageContainer><div className="mall-details-layout">
    <div className="mall-details-topbar"><Button to="/malls" variant="ghost" size="sm">← Back to All Malls</Button><Button variant="outline" size="sm" loading={isLoading} onClick={loadMallDetails}>Refresh details</Button></div>
    {error && <ErrorMessage title="Unable to load mall" message={error} onRetry={loadMallDetails} />}
    {isLoading && <div aria-busy="true" aria-label="Loading mall details"><Skeleton height="240px" /></div>}
    {!isLoading && !error && !mall && <EmptyState icon={<Icon name="building" size={30} />} title="Mall Profile Not Found" description={isPendingBackend ? "The mall directory is not available yet." : "This mall is unavailable in the public directory."} action={<Button to="/malls">Browse malls</Button>} />}
    {!isLoading && !error && mall && <>
      <PageHeader eyebrow={mall.city ? `MALL PROFILE • ${mall.city.toUpperCase()}` : "MALL PROFILE"} title={mall.name} description={[mall.address, mall.city].filter(Boolean).join(", ")} badge={<Badge variant="success">{mall.status === "APPROVED" ? "Approved mall" : mall.status}</Badge>} actions={<Button to={`/malls/${mall.id}/parking`} icon={<Icon name="arrow" size={17} />}>View Parking Availability</Button>} />
      <div className="mall-detail-banner"><div><span className="eyebrow">MAKE ROOM FOR A GOOD DAY</span><h2>Your visit starts here.</h2><p>{mall.description || "Explore the details before you head out. A little planning makes arriving easier."}</p></div><MallIllustration /></div>
      <div className="mall-details-grid"><div className="mall-details-main-column">
        <Card title="Parking & Operating Overview"><div className="mall-info-summary-grid">
          {mall.operatingHours && <div className="mall-info-item"><span className="mall-info-label">Operating Hours</span><span className="mall-info-value">{mall.operatingHours}</span></div>}
          {mall.location && <div className="mall-info-item"><span className="mall-info-label">Location / City</span><span className="mall-info-value">{mall.location}</span></div>}
          {typeof mall.hourlyRatePaise === "number" && <div className="mall-info-item"><span className="mall-info-label">Hourly parking rate</span><span className="mall-info-value">₹{(mall.hourlyRatePaise / 100).toFixed(2)}</span></div>}
          {typeof mall.totalSlots === "number" && <div className="mall-info-item"><span className="mall-info-label">Total Parking Capacity</span><span className="mall-info-value">{mall.totalSlots} Bays</span></div>}
          {typeof mall.availableSlots === "number" && <div className="mall-info-item"><span className="mall-info-label">Current Available Bays</span><span className="mall-info-value">{mall.availableSlots} Available</span></div>}
        </div>
        {mall.floors?.length > 0 && <div className="mall-extra-details"><h4>Parking Levels & Basements</h4><div className="mall-tags-group">{mall.floors.map((floor, index) => <Badge key={index} variant="neutral">{typeof floor === "string" ? floor : [floor.name || floor.label || `Floor ${index + 1}`, typeof floor.slots === "number" ? `${floor.slots} bays` : null].filter(Boolean).join(": ")}</Badge>)}</div></div>}
        {mall.amenities?.length > 0 && <div className="mall-extra-details"><h4>Parking Amenities</h4><div className="mall-tags-group">{mall.amenities.map((amenity) => <Badge key={amenity} variant="neutral">{amenity}</Badge>)}</div></div>}
        </Card>
        <Card title="Address & Location"><p className="location-address">{[mall.address, mall.city, mall.state, mall.pincode].filter(Boolean).join(", ")}</p></Card>
      </div><div className="mall-details-side-column"><Card title="Plan your parking" subtitle="Know your destination before you arrive."><div className="parking-info-callout"><Icon name="car" size={38} /><p>Check this mall's parking information and explore available bays when inventory is connected.</p><Button to={`/malls/${mall.id}/parking`} icon={<Icon name="arrow" size={17} />}>View Parking Availability</Button><div className="coming-soon-note"><Icon name="clock" size={18} /><div><strong>Plan your arrival</strong><p>Choose your arrival time and bay. Your booking includes a QR pass for verified entry and exit.</p></div></div></div></Card>
      {(mall.contactPhone || mall.contactEmail) && <Card title="Mall Parking Helpdesk"><div className="mall-contact-card">{mall.contactPhone && <a href={`tel:${mall.contactPhone}`}>{mall.contactPhone}</a>}{mall.contactEmail && <a href={`mailto:${mall.contactEmail}`}>{mall.contactEmail}</a>}</div></Card>}
      </div></div>
    </>}
  </div></PageContainer>;
}
