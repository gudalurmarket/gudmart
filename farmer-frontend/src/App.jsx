import React, { Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import ErrorBoundary from './shared/components/ErrorBoundary.jsx'
import LoadingSpinner from './shared/components/LoadingSpinner.jsx'
import Layout from './shared/components/Layout.jsx'
import ProtectedRoute from './shared/components/ProtectedRoute.jsx'
import LoginPage from './pages/LoginPage.jsx'
import useAuth from './shared/hooks/useAuth.js'
import { ROLES } from './shared/lib/constants.js'
import { useVolunteerSW } from './volunteer/hooks/useVolunteerSW'

const Dashboard = React.lazy(() => import('./operator/pages/Dashboard.jsx'))
const OrderIntake = React.lazy(() => import('./operator/pages/OrderIntake.jsx'))
const OrderManagement = React.lazy(() => import('./operator/pages/OrderManagement.jsx'))
const WalletManagement = React.lazy(() => import('./operator/pages/WalletManagement.jsx'))
const DeliveryManagement = React.lazy(() => import('./operator/pages/DeliveryManagement.jsx'))
const MarketDay = React.lazy(() => import('./operator/pages/MarketDay.jsx'))
const Reconciliation = React.lazy(() => import('./operator/pages/Reconciliation.jsx'))
const WeeklySummary = React.lazy(() => import('./operator/pages/WeeklySummary.jsx'))
const WeekSetup = React.lazy(() => import('./operator/pages/WeekSetup.jsx'))
const Registrations = React.lazy(() => import('./operator/pages/Registrations.jsx'))
const CustomerRegistration = React.lazy(() => import('./operator/pages/CustomerRegistration.jsx'))
const FarmerRegistration = React.lazy(() => import('./operator/pages/FarmerRegistration.jsx'))
const CatalogueManagement = React.lazy(() => import('./operator/pages/CatalogueManagement.jsx'))

const DeliveryEntry = React.lazy(() => import('./volunteer/pages/DeliveryEntry.jsx'))
const PackingList = React.lazy(() => import('./volunteer/pages/PackingList.jsx'))
const Dispatch = React.lazy(() => import('./volunteer/pages/Dispatch.jsx'))

function RootRedirect () {
  const { user, role, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (role === ROLES.OPERATOR) {
    return <Navigate to="/operator/dashboard" replace />
  }

  if (role === ROLES.VOLUNTEER) {
    return <Navigate to="/volunteer/delivery" replace />
  }

  return <Navigate to="/login" replace />
}

function OperatorRoutes () {
  return (
    <Suspense fallback={<LoadingSpinner size="lg" />}>
      <Routes>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="intake" element={<OrderIntake />} />
        <Route path="orders" element={<OrderManagement />} />
        <Route path="wallet" element={<WalletManagement />} />
        <Route path="delivery" element={<DeliveryManagement />} />
        <Route path="market-day" element={<MarketDay />} />
        <Route path="reconciliation" element={<Reconciliation />} />
        <Route path="summary" element={<WeeklySummary />} />
        <Route path="setup" element={<WeekSetup />} />
        <Route path="registrations" element={<Registrations />} />
        <Route path="registrations/customers" element={<CustomerRegistration />} />
        <Route path="registrations/farmers" element={<FarmerRegistration />} />
        <Route path="registrations/catalogue" element={<CatalogueManagement />} />
      </Routes>
    </Suspense>
  )
}

function VolunteerRoutes () {
  useVolunteerSW()
  return (
    <Suspense fallback={<LoadingSpinner size="lg" />}>
      <Routes>
        <Route index element={<Navigate to="delivery" replace />} />
        <Route path="delivery" element={<DeliveryEntry />} />
        <Route path="packing" element={<PackingList />} />
        <Route path="dispatch" element={<Dispatch />} />
      </Routes>
    </Suspense>
  )
}

export default function App () {
  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RootRedirect />} />
        <Route
          path="/operator/*"
          element={
            <ProtectedRoute role={ROLES.OPERATOR}>
              <Layout>
                <OperatorRoutes />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/volunteer/*"
          element={
            <ProtectedRoute role={ROLES.VOLUNTEER}>
              <Layout>
                <VolunteerRoutes />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  )
}
