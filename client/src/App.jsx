import { Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import { ROLES } from "./constants/roles.js";
import PublicLayout from "./layouts/PublicLayout.jsx";
import DashboardLayout from "./layouts/DashboardLayout.jsx";
import HomePage from "./pages/HomePage.jsx";
import MallDiscoveryPage from "./pages/MallDiscoveryPage.jsx";
import MallDetailsPage from "./pages/MallDetailsPage.jsx";
import ParkingAvailabilityPage from "./pages/ParkingAvailabilityPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import RegisterPage from "./pages/RegisterPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";

/**
 * Main application router defining public and dashboard layout hierarchies,
 * wrapped in the central AuthProvider with protected dashboard access.
 */
export default function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* Public layout route tree */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/malls" element={<MallDiscoveryPage />} />
          <Route path="/malls/:id" element={<MallDetailsPage />} />
          <Route path="/malls/:id/parking" element={<ParkingAvailabilityPage />} />
          <Route path="/malls/:id/availability" element={<ParkingAvailabilityPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        {/* Protected Dashboard layout route tree - strictly restricted to authenticated USER role */}
        <Route
          element={
            <ProtectedRoute allowedRoles={[ROLES.USER]}>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<DashboardPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
