import { createElement } from "react";
import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import useAuth from "./hooks/useAuth.js";
import InventoryPage from "./pages/InventoryPage.jsx";
import AccountDashboard from "./pages/AccountDashboard.jsx";
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
import GateConsolePage from "./pages/GateConsolePage.jsx";
import OperationsActivityPage from "./pages/OperationsActivityPage.jsx";
import MallBookingsPage from "./pages/MallBookingsPage.jsx";
import BookingDetailPage from "./pages/BookingDetailPage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import GuardsPage from "./pages/GuardsPage.jsx";
import BookingBillPage from "./pages/BookingBillPage.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import EditMallPage from "./pages/EditMallPage.jsx";

function RoleDashboard() {
  const { user } = useAuth();
  if (user.role === ROLES.GUARD) return <Navigate to="/dashboard/operations" replace />;
  return user.role === ROLES.USER ? <DashboardPage /> : <AccountDashboard key={user._id} />;
}

function MallPage({ Component }) {
  const { id } = useParams();
  return createElement(Component, { key: id });
}

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
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>

        <Route element={<DashboardLayout />}>
          <Route path="/malls" element={<MallDiscoveryPage />} />
          <Route path="/malls/:id" element={<MallPage Component={MallDetailsPage} />} />
          <Route path="/malls/:id/parking" element={<MallPage Component={ParkingAvailabilityPage} />} />
          <Route path="/malls/:id/availability" element={<MallPage Component={ParkingAvailabilityPage} />} />
        </Route>

        {/* Protected dashboard layout */}
        <Route
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<RoleDashboard />} />
          <Route element={<ProtectedRoute allowedRoles={[ROLES.MALL_OWNER]} />}>
            <Route path="/dashboard/malls/:id/inventory" element={<MallPage Component={InventoryPage} />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={[ROLES.USER]} />}>
            <Route path="/dashboard/bookings" element={<DashboardPage bookingsOnly />} />
            <Route path="/dashboard/bookings/:id" element={<BookingDetailPage />} />
            <Route path="/dashboard/bookings/:id/bill" element={<BookingBillPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={[ROLES.MALL_OWNER, ROLES.ADMIN]} />}>
            <Route path="/dashboard/guards" element={<GuardsPage />} />
            <Route path="/dashboard/analytics" element={<AnalyticsPage />} />
            <Route path="/dashboard/reservations" element={<MallBookingsPage />} />
            <Route path="/dashboard/gate-activity" element={<OperationsActivityPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={[ROLES.MALL_OWNER]} />}>
            <Route path="/dashboard/malls/:id/edit" element={<EditMallPage />} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={[ROLES.GUARD]} />}>
            <Route path="/dashboard/operations" element={<GateConsolePage />} />
            <Route path="/dashboard/activity" element={<OperationsActivityPage />} />
          </Route>
          <Route path="/dashboard/profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
