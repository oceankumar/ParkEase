import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import FeatureCard from "../components/FeatureCard.jsx";
import { apiRequest } from "../services/api.js";

export default function HomePage() {
  const [apiStatus, setApiStatus] = useState("Checking backend…");
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    apiRequest("/health", { signal: controller.signal })
      .then((data) =>
        setApiStatus(
          data.success === true ? "API Connected" : "Backend unavailable",
        ),
      )
      .catch(() => {
        setApiStatus("Backend unavailable");
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  return (
    <>
      <section className="container hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <span className="small-dot" /> SMART MALL PARKING INTELLIGENCE
          </span>
          <h1>
            Smart Parking.
            <br />
            <span>Zero Hassle.</span>
          </h1>
          <p className="hero-description">
            A better mall visit starts before you step inside. ParkEase is being
            built to help you discover parking, reserve a slot, and move with
            ease.
          </p>
          <div className="hero-actions">
            <Link className="button" to="/register">
              Get Started <span aria-hidden="true">↗</span>
            </Link>
            <Link className="button secondary" to="/login">
              Login
            </Link>
          </div>
          <p className="tagline">Book smarter. Enter faster. Park better.</p>
        </div>
        <div
          className="parking-visual"
          aria-label="Illustration of a future smart parking layout"
        >
          <div className="visual-heading">
            <span>
              <span className="small-dot" /> THE WAY FORWARD
            </span>
            <span>01 / PARK</span>
          </div>
          <div className="parking-sign">
            P
            <span>
              Less searching.
              <br />
              More arriving.
            </span>
          </div>
          <div className="parking-grid" aria-hidden="true">
            {["", "", "car", "", "car", ""].map((slot, index) => (
              <div key={index} className={`parking-space ${slot}`}>
                {slot ? (
                  <span>▰</span>
                ) : (
                  <span>{String(index + 1).padStart(2, "0")}</span>
                )}
              </div>
            ))}
          </div>
          <div className="visual-bottom">
            <span>Designed for a smoother arrival</span>
            <span aria-hidden="true">↗</span>
          </div>
          <span className="illustration-label">
            Concept illustration · No live parking data
          </span>
        </div>
      </section>
      <div className="container status-bar">
        <span
          className={`status-dot ${apiStatus === "API Connected" ? "online" : ""}`}
        />
        <span role="status">{apiStatus}</span>
        <span className="status-note">
          Foundation preview · Features below are planned
        </span>
      </div>
      <section className="container features">
        <div className="section-heading">
          <div>
            <span className="eyebrow">A SMARTER WAY TO PARK</span>
            <h2>Less friction. More possibility.</h2>
          </div>
          <p>
            The destination is clear.
            <br />
            This is where we start.
          </p>
        </div>
        <div className="feature-grid">
          <FeatureCard number="01" title="Smart Slot Allocation">
            Find the right space with intelligent parking allocation.
          </FeatureCard>
          <FeatureCard number="02" title="QR Entry & Exit">
            Move through entry and exit with a simple QR workflow.
          </FeatureCard>
          <FeatureCard number="03" title="Live Parking Availability">
            Plan your arrival with a clearer view of available spaces.
          </FeatureCard>
          <FeatureCard number="04" title="Secure Parking Workflow">
            A connected journey from reservation to departure.
          </FeatureCard>
        </div>
      </section>
    </>
  );
}
