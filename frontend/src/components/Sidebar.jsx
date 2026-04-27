/**
 * @fileoverview Sidebar.jsx — Application navigation sidebar
 *
 * Renders a role-specific navigation menu.  Each user role sees only
 * the routes relevant to their account type.
 *
 * Navigation is defined as a static map keyed by user_type.
 * To add, remove, or reorder items for a role, edit `navByRole` below.
 *
 * Roles:
 *   organizer — event organisers who plan and manage events
 *   vendor    — service providers who receive booking requests
 *   admin     — platform administrators with full access
 */

import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard,
  Calendar,
  Users,
  ShoppingBag,
  Map,
  LogOut,
  Shield,
  BookOpen,
  Sliders,
  Search,
} from 'lucide-react'

/* ─── Navigation Map ──────────────────────────────────────────────────── */
/**
 * Role-specific navigation items.
 *
 * Each item:
 *   path   {string}    — React Router path
 *   label  {string}    — Sidebar button text
 *   icon   {Component} — Lucide icon component
 *
 * NOTE:
 *   /planner is the multi-service vendor discovery page ("Find Vendors").
 *   It is intentionally available to ALL roles so every user can
 *   search and compare vendors.
 */
const navByRole = {
  organizer: [
    { path: '/dashboard',  label: 'Dashboard',              icon: LayoutDashboard },
    { path: '/events',     label: 'My Events',              icon: Calendar        },
    { path: '/planner',    label: 'Find Vendors',           icon: Search          },
    { path: '/discover',   label: 'Quick Vendor Search',    icon: Map             },
    { path: '/bookings',   label: 'Bookings',               icon: ShoppingBag     },
  ],

  vendor: [
    { path: '/dashboard',      label: 'Dashboard',                 icon: LayoutDashboard },
    { path: '/vendor-profile', label: 'My Profile & Services',     icon: Users           },
    { path: '/bookings',       label: 'Booking Requests',          icon: ShoppingBag     },
    { path: '/planner',        label: 'Find Vendors',              icon: Search          },
  ],

  admin: [
    { path: '/dashboard',      label: 'Dashboard',               icon: LayoutDashboard },
    { path: '/admin/settings', label: 'Platform Settings',       icon: Sliders         },
    { path: '/admin/users',    label: 'Users',                   icon: Users           },
    { path: '/admin/vendors',  label: 'Vendors & Services',      icon: Shield          },
    { path: '/admin/events',   label: 'All Events',              icon: Calendar        },
    { path: '/admin/bookings', label: 'All Bookings',            icon: BookOpen        },
    { path: '/planner',        label: 'Find Vendors',            icon: Search          },
    { path: '/vendor-profile', label: 'Vendor Profile',          icon: Users           },
  ],
}

/* ─── Component ──────────────────────────────────────────────────────── */

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate         = useNavigate()
  const { pathname }     = useLocation()

  // Look up the nav items for the current user's role (default to empty)
  const navItems = navByRole[user?.user_type] || []

  return (
    <aside className="sidebar">
      {/* ── Brand / Logo ── */}
      <div className="sidebar-logo">
        <h1>⚡ EMS</h1>
        <span>Event Management</span>
      </div>

      {/* ── Navigation Links ── */}
      <nav className="sidebar-nav">
        {navItems.map(({ path, label, icon: Icon }) => {
          // Mark a nav item as active if the current path matches exactly
          // or starts with the path (for nested routes like /admin/*)
          const isActive =
            pathname === path ||
            (path !== '/dashboard' && pathname.startsWith(path + '/'))

          return (
            <button
              key={path}
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => navigate(path)}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon size={15} />
              {label}
            </button>
          )
        })}
      </nav>

      {/* ── User Info + Sign Out ── */}
      <div className="sidebar-footer">
        <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, marginBottom: 8 }}>
          {user?.name}
          <br />
          <span style={{ textTransform: 'capitalize', color: 'rgba(255,255,255,.35)' }}>
            {user?.user_type}
          </span>
        </div>
        <button
          className="nav-item"
          onClick={logout}
          style={{ padding: '8px 0', color: 'rgba(255,255,255,.5)' }}
        >
          <LogOut size={15} />
          Sign out
        </button>
      </div>
    </aside>
  )
}
