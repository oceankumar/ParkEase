export default function FeatureCard({ number, title, children }) {
  return (
    <article className="feature-card">
      <span className="feature-number">{number}</span>
      <span className="planned">Planned</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}
