import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { LayoutDashboard, Calendar, Users, ShoppingBag, Map,
         LogOut, Shield, BookOpen, Sliders, PlaneTakeoff } from 'lucide-react'

const navByRole = {
  organizer: [
    { path: '/dashboard', label: 'Dashboard',        icon: LayoutDashboard },
    { path: '/planner',   label: 'Event Planner',    icon: PlaneTakeoff },
    { path: '/events',    label: 'My Events',         icon: Calendar },
    { path: '/discover',  label: 'Find Vendors',      icon: Map },
    { path: '/bookings',  label: 'Bookings',           icon: ShoppingBag },
  ],
  vendor: [
    { path: '/dashboard',      label: 'Dashboard',          icon: LayoutDashboard },
    { path: '/vendor-profile', label: 'My Profile & Services', icon: Users },
    { path: '/bookings',       label: 'Booking Requests',   icon: ShoppingBag },
  ],
  admin: [
    { path: '/dashboard',      label: 'Dashboard',          icon: LayoutDashboard },
    { path: '/admin/settings', label: 'Platform Settings',  icon: Sliders },
    { path: '/admin/users',    label: 'Users',               icon: Users },
    { path: '/admin/vendors',  label: 'Vendors & Services',  icon: Shield },
    { path: '/admin/events',   label: 'All Events',          icon: Calendar },
    { path: '/admin/bookings', label: 'All Bookings',        icon: BookOpen },
    { path: '/planner',        label: 'Event Planner',       icon: PlaneTakeoff },
    { path: '/vendor-profile', label: 'Vendor Profile',      icon: Users },
  ],
}

export default function Sidebar() {
  const { user, logout } = useAuth()
  const navigate  = useNavigate()
  const { pathname } = useLocation()
  const items = navByRole[user?.user_type] || []

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>⚡ EMS</h1>
        <span>Event Management</span>
      </div>
      <nav className="sidebar-nav">
        {items.map(({ path, label, icon: Icon }) => (
          <button key={path}
            className={`nav-item ${pathname === path || pathname.startsWith(path + '/') ? 'active' : ''}`}
            onClick={() => navigate(path)}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, marginBottom: 8 }}>
          {user?.name}<br />
          <span style={{ textTransform: 'capitalize', color: 'rgba(255,255,255,.35)' }}>{user?.user_type}</span>
        </div>
        <button className="nav-item" onClick={logout} style={{ padding: '8px 0', color: 'rgba(255,255,255,.5)' }}>
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </aside>
  )
}
