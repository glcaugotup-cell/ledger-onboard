import { BrowserRouter, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { NotificationProvider } from './context/NotificationContext.jsx';
import ProtectedRoute from './routes/ProtectedRoute.jsx';
import ScrollToTop from './routes/ScrollToTop.jsx';
import PageTransition from './routes/PageTransition.jsx';
import ServerWakeNotice from './components/ServerWakeNotice.jsx';

import LandingPage from './views/public/LandingPage.jsx';
import PropertyDetailPublicPage from './views/public/PropertyDetailPublicPage.jsx';
import UnauthorizedPage from './views/public/UnauthorizedPage.jsx';
import NotFoundPage from './views/public/NotFoundPage.jsx';

import AuthSplitLayout from './views/auth/AuthSplitLayout.jsx';
import LoginPage from './views/auth/LoginPage.jsx';
import RegisterPage from './views/auth/RegisterPage.jsx';
import ForgotPasswordPage from './views/auth/ForgotPasswordPage.jsx';
import ResetPasswordPage from './views/auth/ResetPasswordPage.jsx';
import ActivateCaretakerPage from './views/auth/ActivateCaretakerPage.jsx';
import AccountRecoveryPage from './views/auth/AccountRecoveryPage.jsx';

import DiscoverPage from './views/tenant/DiscoverPage.jsx';
import TenantPropertyDetailPage from './views/tenant/PropertyDetailPage.jsx';
import MyReservationsPage from './views/tenant/MyReservationsPage.jsx';
import MyApartmentPage from './views/tenant/MyApartmentPage.jsx';

import LandlordDashboardPage from './views/landlord/DashboardPage.jsx';
import PropertiesPage from './views/landlord/PropertiesPage.jsx';
import PropertyFormPage from './views/landlord/PropertyFormPage.jsx';
import PropertyManagePage from './views/landlord/PropertyManagePage.jsx';
import CaretakersPage from './views/landlord/CaretakersPage.jsx';
import LandlordReservationsPage from './views/landlord/ReservationsPage.jsx';
import LandlordBillingPage from './views/landlord/BillingPage.jsx';
import LandlordPaymentsPage from './views/landlord/PaymentsPage.jsx';
import BusinessVerificationPage from './views/landlord/BusinessVerificationPage.jsx';

import AssignedRoomsPage from './views/caretaker/AssignedRoomsPage.jsx';
import UtilityEntryPage from './views/caretaker/UtilityEntryPage.jsx';
import CashPaymentsPage from './views/caretaker/CashPaymentsPage.jsx';

import ProfilePage from './views/shared/ProfilePage.jsx';
import MaintenanceIssuesPage from './views/shared/MaintenanceIssuesPage.jsx';
import ArchivePage from './views/shared/ArchivePage.jsx';

import UsersPage from './views/admin/UsersPage.jsx';
import ReviewModerationPage from './views/admin/ReviewModerationPage.jsx';
import AuditLogsPage from './views/admin/AuditLogsPage.jsx';
import LandlordVerificationPage from './views/admin/LandlordVerificationPage.jsx';

/** Old tenant routes now live inside My Apartment; keeps any ?bill= / ?issue= so old links still land on the item. */
function ApartmentRedirect({ tab }) {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  params.set('tab', tab);
  return <Navigate to={`/tenant/apartment?${params.toString()}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NotificationProvider>
          <ScrollToTop />
          <ServerWakeNotice />
          <PageTransition>
            <Routes>
              {/* Public */}
              <Route path="/" element={<LandingPage />} />
              <Route path="/properties/:id" element={<PropertyDetailPublicPage />} />
              {/* Login/Register share a persistent split-screen shell so
                  switching between them slides instead of hard-swapping. */}
              <Route element={<AuthSplitLayout />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
              </Route>
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/activate-caretaker" element={<ActivateCaretakerPage />} />
              <Route path="/account-recovery" element={<AccountRecoveryPage />} />
              <Route path="/unauthorized" element={<UnauthorizedPage />} />

              {/* Tenant */}
              <Route element={<ProtectedRoute roles={['tenant']} />}>
                <Route path="/tenant/discover" element={<DiscoverPage />} />
                <Route path="/tenant/properties/:id" element={<TenantPropertyDetailPage />} />
                <Route path="/tenant/reservations" element={<MyReservationsPage />} />
                <Route path="/tenant/apartment" element={<MyApartmentPage />} />
                <Route path="/tenant/billing" element={<ApartmentRedirect tab="billing" />} />
                <Route path="/tenant/issues" element={<ApartmentRedirect tab="issues" />} />
                <Route path="/tenant/archive" element={<ArchivePage />} />
                <Route path="/tenant/profile" element={<ProfilePage />} />
                {/* The page was called "Account" before every role got a Profile; keep old links working. */}
                <Route path="/tenant/account" element={<Navigate to="/tenant/profile" replace />} />
              </Route>

              {/* Landlord */}
              <Route element={<ProtectedRoute roles={['landlord']} />}>
                <Route path="/landlord/dashboard" element={<LandlordDashboardPage />} />
                <Route path="/landlord/properties" element={<PropertiesPage />} />
                <Route path="/landlord/properties/new" element={<PropertyFormPage />} />
                <Route path="/landlord/properties/:id" element={<PropertyManagePage />} />
                <Route path="/landlord/caretakers" element={<CaretakersPage />} />
                <Route path="/landlord/reservations" element={<LandlordReservationsPage />} />
                <Route path="/landlord/billing" element={<LandlordBillingPage />} />
                <Route path="/landlord/payments" element={<LandlordPaymentsPage />} />
                <Route path="/landlord/issues" element={<MaintenanceIssuesPage />} />
                <Route path="/landlord/verification" element={<BusinessVerificationPage />} />
                <Route path="/landlord/profile" element={<ProfilePage />} />
                <Route path="/landlord/archive" element={<ArchivePage />} />
              </Route>

              {/* Caretaker */}
              <Route element={<ProtectedRoute roles={['caretaker']} />}>
                <Route path="/caretaker/rooms" element={<AssignedRoomsPage />} />
                <Route path="/caretaker/utilities" element={<UtilityEntryPage />} />
                <Route path="/caretaker/payments" element={<CashPaymentsPage />} />
                <Route path="/caretaker/issues" element={<MaintenanceIssuesPage />} />
                <Route path="/caretaker/profile" element={<ProfilePage />} />
                <Route path="/caretaker/archive" element={<ArchivePage />} />
              </Route>

              {/* Admin */}
              <Route element={<ProtectedRoute roles={['admin']} />}>
                <Route path="/admin/users" element={<UsersPage />} />
                <Route path="/admin/reviews" element={<ReviewModerationPage />} />
                <Route path="/admin/logs" element={<AuditLogsPage />} />
                <Route path="/admin/landlord-verifications" element={<LandlordVerificationPage />} />
                <Route path="/admin/profile" element={<ProfilePage />} />
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </PageTransition>
        </NotificationProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
