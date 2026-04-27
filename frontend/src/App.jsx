/**
 * @fileoverview App.jsx — Root application component
 *
 * Defines the top-level route tree and authentication guards.
 * Each route is wrapped in a <Protected> component that enforces:
 *   1. Authentication  — redirects to /login if the user is not logged in
 *   2. Role access     — redirects to /dashboard if the user's role is not in `roles`
 *
 * Role constants (for readability):
 *   org  = organizer + admin
 *   ven  = vendor + admin
 *   adm  = admin only
 *   (no roles prop) = any authenticated user
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster }       from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'

/* ─── Page imports ─────────────────────────────────────────────────────── */
import AuthPage       from './pages/AuthPage'
import Dashboard      from './pages/Dashboard'
import Events         from './pages/Events'
import EventPlanner   from './pages/EventPlanner'   // "Find Vendors" multi-service discovery
import Discover       from './pages/Discover'        // Single-service vendor search
import Bookings       from './pages/Bookings'
import VendorProfile  from './pages/VendorProfile'
import AdminSettings  from './pages/AdminSettings'
import { AdminUsers, AdminVendors, AdminEvents, AdminBookings } from './pages/Admin'

/* ─── Route Guard ──────────────────────────────────────────────────────── */

/**
 * Protected route wrapper.
 *
 * @param {React.ReactNode} children  - The page component to render if authorised
 * @param {string[]}       [roles]    - Allowed user_type values; omit for any authenticated user
 */
function Protected({ children, roles }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.user_type)) return <Navigate to="/dashboard" replace />
  return children
}

/* ─── Route Definitions ────────────────────────────────────────────────── */

function AppRoutes() {
  const { user } = useAuth()

  // Role shorthand sets — kept here for clarity and future maintenance
  const org = ['organizer', 'admin']           // organiser-only + admin override
  const ven = ['vendor', 'admin']              // vendor-only + admin override
  const adm = ['admin']                        // admin-only routes

  return (
    <Routes>
      {/* ── Public ── */}
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <AuthPage />}
      />

      {/* ── All authenticated users ── */}
      <Route path="/dashboard"  element={<Protected><Dashboard /></Protected>} />
      <Route path="/bookings"   element={<Protected><Bookings /></Protected>} />

      {/*
        /planner — "Find Vendors" multi-service vendor discovery
        Open to ALL authenticated roles (organizers, vendors, admins).
        Vendors see results but cannot create bookings (handled in the component).
      */}
      <Route
        path="/planner"
        element={<Protected><EventPlanner /></Protected>}
      />

      {/* ── Organizer + Admin ── */}
      <Route path="/events"   element={<Protected roles={org}><Events /></Protected>} />
      <Route path="/discover" element={<Protected roles={org}><Discover /></Protected>} />

      {/* ── Vendor + Admin ── */}
      <Route path="/vendor-profile" element={<Protected roles={ven}><VendorProfile /></Protected>} />

      {/* ── Admin only ── */}
      <Route path="/admin/users"    element={<Protected roles={adm}><AdminUsers /></Protected>} />
      <Route path="/admin/vendors"  element={<Protected roles={adm}><AdminVendors /></Protected>} />
      <Route path="/admin/events"   element={<Protected roles={adm}><AdminEvents /></Protected>} />
      <Route path="/admin/bookings" element={<Protected roles={adm}><AdminBookings /></Protected>} />
      <Route path="/admin/settings" element={<Protected roles={adm}><AdminSettings /></Protected>} />

      {/* ── Catch-all ── */}
      <Route
        path="*"
        element={<Navigate to={user ? '/dashboard' : '/login'} replace />}
      />
    </Routes>
  )
}

/* ─── Root Component ───────────────────────────────────────────────────── */

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: { fontFamily: 'Inter, sans-serif', fontSize: 14 },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  )
}
