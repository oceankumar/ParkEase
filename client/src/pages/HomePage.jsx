import Button from "../components/Button.jsx";
import FeatureCard from "../components/FeatureCard.jsx";
import Icon from "../components/Icon.jsx";
import ParkingPreview from "../components/ParkingPreview.jsx";

export default function HomePage() {
  return <>
    <section className="container hero">
      <div className="hero-copy">
        <span className="eyebrow"><span className="small-dot" /> A LITTLE LESS CIRCLING. A LOT MORE LIVING.</span>
        <h1>Your destination.<br /><span>Your parking.<br />All in one place.</span></h1>
        <p className="hero-description">Make room for the good part of your day. Discover malls, explore parking details, and plan a smoother arrival with ParkEase.</p>
        <div className="hero-actions"><Button to="/malls" icon={<Icon name="arrow" size={18} />}>Explore parking</Button><Button to="/register" variant="outline">Create an account</Button></div>
        <p className="tagline"><Icon name="shield" size={17} /> Reviewed malls. Clear parking information.</p>
      </div>
      <div className="hero-map"><div className="hero-map-label"><span className="count-chip">P</span><div><strong>A better way to arrive</strong><span>Designed around your next visit</span></div></div><ParkingPreview /><div className="hero-map-foot"><Icon name="pin" /><span>Find your place. Enjoy your day.</span><Icon name="arrow" /></div></div>
    </section>
    <section className="container journey-band" aria-label="The ParkEase journey"><div><span>01</span><strong>Discover your destination</strong><p>Browse approved malls and parking rates.</p></div><div><span>02</span><strong>Plan your arrival</strong><p>Check the location and opening hours.</p></div><div><span>03</span><strong>Arrive with your pass</strong><p>Reserve a bay, show your QR at entry, and view your bill after exit.</p></div></section>
    <section className="container features">
      <div className="section-heading"><div><span className="eyebrow">ONE PLATFORM. EVERY PERSPECTIVE.</span><h2>Good parking starts with connection.</h2></div><p>For the people arriving.<br />And the people making it happen.</p></div>
      <div className="feature-grid">
        <FeatureCard number="01" title="Find your next stop" badge="For drivers" icon={<Icon name="pin" />}>Explore approved malls, compare parking rates, and check opening hours before you leave.</FeatureCard>
        <FeatureCard number="02" title="Put your mall on the map" badge="For owners" icon={<Icon name="building" />}>Submit your mall and manage its listing from a dedicated workspace.</FeatureCard>
        <FeatureCard number="03" title="Keep standards high" badge="For admins" icon={<Icon name="shield" />}>Review mall applications and owner accounts in one connected portal.</FeatureCard>
        <FeatureCard number="04" title="From bay to barrier" badge="Connected visits" icon={<Icon name="car" />}>Reserve your bay, check in with a QR pass, and see your final bill after a verified exit.</FeatureCard>
      </div>
    </section>
  </>;
}
