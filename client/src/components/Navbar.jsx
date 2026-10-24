import { Link, NavLink } from "react-router-dom";
export default function Navbar() {
  return (
    <header className="site-header">
      <nav className="container navbar" aria-label="Main navigation">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          ParkEase<span className="brand-dot">.</span>
        </Link>
        <div className="nav-links">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/login">Login</NavLink>
          <NavLink className="button button-small" to="/register">
            Register <span aria-hidden="true">↗</span>
          </NavLink>
        </div>
      </nav>
    </header>
  );
}
