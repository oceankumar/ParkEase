import { Navigate, useLocation, Link, Outlet } from "react-router-dom";
import useAuth from "../hooks/useAuth.js";
import Loading from "./Loading.jsx";
import PageContainer from "./PageContainer.jsx";
import Badge from "./Badge.jsx";

/**
 * ProtectedRoute: Reusable route protection wrapper supporting authentication verification
 * and fine-grained role-based authorization.
 *
 * @param {Object} props
 * @param {React.ReactNode} [props.children] - Nested route elements. Renders <Outlet /> if omitted.
 * @param {string[]} [props.allowedRoles] - Optional whitelist of allowed ROLES.
 * @param {string} [props.redirectPath] - Destination redirect path when unauthenticated (default: "/login").
 */
export default function ProtectedRoute({
  children,
  allowedRoles,
  redirectPath = "/login",
}) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <Loading fullPage message="Verifying authentication session..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to={redirectPath} state={{ from: location }} replace />;
  }

  if (user?.mustChangePassword && location.pathname !== "/dashboard/profile") {
    return <Navigate to="/dashboard/profile" replace />;
  }

  if (
    Array.isArray(allowedRoles) &&
    allowedRoles.length > 0 &&
    (!user?.role || !allowedRoles.includes(user.role))
  ) {
    return (
      <PageContainer className="unauthorized-page-container">
        <div className="unauthorized-card">
          <Badge variant="danger" size="md">
            403 Forbidden
          </Badge>
          <h1 className="unauthorized-title">Access Restricted</h1>
          <p className="unauthorized-text">
            Your account role (<strong>{user?.role || "UNKNOWN"}</strong>) does not have
            authorization to access this area.
          </p>
          <div className="unauthorized-actions">
            <Link to="/dashboard" className="button button-primary">
              Return to Dashboard
            </Link>
            <Link to="/" className="button button-secondary">
              Go to Home
            </Link>
          </div>
        </div>
      </PageContainer>
    );
  }

  return children ? children : <Outlet />;
}
