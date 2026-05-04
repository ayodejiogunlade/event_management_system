import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { eventsAPI, bookingsAPI, adminAPI, vendorsAPI } from '../api'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'
import { useSocket } from '../hooks/useSocket'
import { format } from 'date-fns'

const statusBadge = s => ({
  pending:   <span className="badge badge-amber">⏳ Pending</span>,
  confirmed: <span className="badge badge-green">✅ Confirmed</span>,
  declined:  <span className="badge badge-red">❌ Declined</span>,
  cancelled: <span className="badge badge-gray">🚫 Cancelled</span>,
  completed: <span className="badge badge-blue">✔ Completed</span>,
  active:    <span className="badge badge-green">● Active</span>,
  draft:     <span className="badge badge-gray">Draft</span>,
}[s] || <span className="badge badge-gray">{s}</span>)

export default function Dashboard() {
  const { user }    = useAuth()
  const navigate    = useNavigate()
  const [notifTick, setNotifTick] = useState(0)
  useSocket(() => setNotifTick(t => t + 1))

  const [events,        setEvents]        = useState([])
  const [bookings,      setBookings]      = useState([])
  const [stats,         setStats]         = useState(null)
  const [vendorProfile, setVendorProfile] = useState(null)
  const [loading,       setLoading]       = useState(true)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        if (user.user_type === 'admin') {
          const [s] = await Promise.all([adminAPI.stats()])
          setStats(s.data)
        } else if (user.user_type === 'organizer') {
          const [e, b] = await Promise.all([eventsAPI.list(), bookingsAPI.list()])
          setEvents(e.data); setBookings(b.data)
        } else {
          const [b, vp] = await Promise.all([
            bookingsAPI.list(),
            vendorsAPI.myProfile().catch(() => ({ data: null })),
          ])
          setBookings(b.data); setVendorProfile(vp.data)
        }
      } catch {}
      setLoading(false)
    })()
  }, [user])

  if (loading) return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content"><div className="loading"><div className="spinner" /></div></div>
    </div>
  )

  // ── Admin Dashboard ──────────────────────────────────────────────────────
  if (user.user_type === 'admin') return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="Admin Dashboard" onNotif={notifTick} />
        <div className="page">
          <p className="page-title">System Overview</p>
          <p className="page-subtitle">Platform health and activity at a glance</p>
          <div className="stat-grid">
            {[
              { label: 'Total Users',         value: stats?.total_users,        icon: '👥', color: '#eff6ff' },
              { label: 'Total Vendors',        value: stats?.total_vendors,       icon: '🏪', color: '#f0fdf4' },
              { label: 'Verified Vendors',     value: stats?.verified_vendors,    icon: '✅', color: '#f0fdf4' },
              { label: 'Pending Verification', value: stats?.pending_vendors,     icon: '⏳', color: '#fffbeb' },
              { label: 'Total Events',         value: stats?.total_events,        icon: '📅', color: '#faf5ff' },
              { label: 'Total Bookings',       value: stats?.total_bookings,      icon: '📋', color: '#eff6ff' },
              { label: 'Confirmed Bookings',   value: stats?.confirmed_bookings,  icon: '🎉', color: '#f0fdf4' },
            ].map(s => (
              <div className="stat-card" key={s.label}>
                <div className="stat-icon" style={{ background: s.color }}>{s.icon}</div>
                <div className="stat-info"><p>{s.label}</p><h3>{s.value ?? '—'}</h3></div>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card">
              <div className="card-header flex justify-between items-center">
                <span className="section-title" style={{ margin: 0 }}>Quick Actions</span>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button className="btn btn-primary"   onClick={() => navigate('/admin/vendors')}>🛡 Verify Vendors</button>
                <button className="btn btn-secondary" onClick={() => navigate('/admin/users')}>👥 Manage Users</button>
                <button className="btn btn-secondary" onClick={() => navigate('/bookings')}>📋 View All Bookings</button>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><span className="section-title" style={{ margin: 0 }}>System Status</span></div>
              <div className="card-body">
                {[['API Server','Online','green'],['Database','Connected','green'],['WebSocket','Active','green']].map(([k,v,c]) => (
                  <div key={k} className="flex justify-between items-center" style={{ marginBottom: 12 }}>
                    <span style={{ fontSize: 14 }}>{k}</span>
                    <span className={`badge badge-${c}`}>● {v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )

  // ── Vendor Dashboard ─────────────────────────────────────────────────────
  if (user.user_type === 'vendor') {
    const pending   = bookings.filter(b => b.status === 'pending').length
    const confirmed = bookings.filter(b => b.status === 'confirmed').length
    return (
      <div className="app-shell">
        <Sidebar />
        <div className="main-content">
          <Topbar title="Vendor Dashboard" onNotif={notifTick} />
          <div className="page">
            <p className="page-title">Welcome back, {user.name.split(' ')[0]}!</p>
            <p className="page-subtitle">Manage your service profile and booking requests</p>
            <div className="stat-grid">
              <div className="stat-card"><div className="stat-icon" style={{ background: '#fffbeb' }}>⏳</div><div className="stat-info"><p>Pending Requests</p><h3>{pending}</h3></div></div>
              <div className="stat-card"><div className="stat-icon" style={{ background: '#f0fdf4' }}>✅</div><div className="stat-info"><p>Confirmed</p><h3>{confirmed}</h3></div></div>
              <div className="stat-card"><div className="stat-icon" style={{ background: '#eff6ff' }}>⭐</div><div className="stat-info"><p>Rating</p><h3>{vendorProfile?.rating?.toFixed(1) ?? '—'}</h3></div></div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background: vendorProfile?.is_verified ? '#f0fdf4' : '#fff7ed' }}>
                  {vendorProfile?.is_verified ? '✅' : '⏳'}
                </div>
                <div className="stat-info"><p>Verification</p><h3 style={{ fontSize: 16, paddingTop: 4 }}>{vendorProfile?.is_verified ? 'Verified' : 'Pending'}</h3></div>
              </div>
            </div>
            {!vendorProfile && (
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-body" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div><p className="fw-600">Complete your vendor profile</p><p className="text-sm text-muted">Set up your profile to start receiving booking requests.</p></div>
                  <button className="btn btn-primary" onClick={() => navigate('/vendor-profile')}>Set Up Profile →</button>
                </div>
              </div>
            )}
            <div className="card">
              <div className="card-header flex justify-between items-center">
                <span className="section-title" style={{ margin: 0 }}>Recent Booking Requests</span>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/bookings')}>View all</button>
              </div>
              <div className="table-wrap">
                {bookings.length === 0 ? (
                  <div className="empty-state"><div className="icon">📭</div><p>No booking requests yet</p></div>
                ) : (
                  <table>
                    <thead><tr><th>Event</th><th>Date</th><th>Service</th><th>Status</th></tr></thead>
                    <tbody>
                      {bookings.slice(0, 6).map(b => (
                        <tr key={b.id}>
                          <td className="fw-600">#{b.event_id}</td>
                          <td>{format(new Date(b.booking_date), 'dd MMM yyyy')}</td>
                          <td>{b.service_details || '—'}</td>
                          <td>{statusBadge(b.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Organizer Dashboard ──────────────────────────────────────────────────
  const activeEvents    = events.filter(e => e.status === 'active').length
  const pendingBookings = bookings.filter(b => b.status === 'pending').length
  const confirmedBkg    = bookings.filter(b => b.status === 'confirmed').length

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="Dashboard" onNotif={notifTick} />
        <div className="page">
          <p className="page-title">Welcome back, {user.name.split(' ')[0]}!</p>
          <p className="page-subtitle">Here's what's happening with your events</p>
          <div className="stat-grid">
            <div className="stat-card"><div className="stat-icon" style={{ background: '#eff6ff' }}>📅</div><div className="stat-info"><p>Active Events</p><h3>{activeEvents}</h3></div></div>
            <div className="stat-card"><div className="stat-icon" style={{ background: '#fffbeb' }}>⏳</div><div className="stat-info"><p>Pending Bookings</p><h3>{pendingBookings}</h3></div></div>
            <div className="stat-card"><div className="stat-icon" style={{ background: '#f0fdf4' }}>✅</div><div className="stat-info"><p>Confirmed Bookings</p><h3>{confirmedBkg}</h3></div></div>
            <div className="stat-card"><div className="stat-icon" style={{ background: '#faf5ff' }}>📊</div><div className="stat-info"><p>Total Events</p><h3>{events.length}</h3></div></div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card">
              <div className="card-header flex justify-between items-center">
                <span className="section-title" style={{ margin: 0 }}>Upcoming Events</span>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/events')}>View all</button>
              </div>
              {events.length === 0 ? (
                <div className="card-body">
                  <div className="empty-state" style={{ padding: '30px 0' }}><div className="icon">📅</div><p>No events yet</p></div>
                  <button className="btn btn-primary w-100" onClick={() => navigate('/events')}>Create your first event</button>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Event</th><th>Date</th><th>Status</th></tr></thead>
                    <tbody>
                      {events.slice(0, 5).map(ev => (
                        <tr key={ev.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/events')}>
                          <td className="fw-600">{ev.name}</td>
                          <td>{format(new Date(ev.event_date), 'dd MMM yy')}</td>
                          <td>{statusBadge(ev.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="card">
              <div className="card-header flex justify-between items-center">
                <span className="section-title" style={{ margin: 0 }}>Recent Bookings</span>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/bookings')}>View all</button>
              </div>
              {bookings.length === 0 ? (
                <div className="card-body">
                  <div className="empty-state" style={{ padding: '30px 0' }}><div className="icon">📋</div><p>No bookings yet</p></div>
                  <button className="btn btn-secondary w-100" onClick={() => navigate('/planner')}>Find vendors →</button>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Event</th><th>Vendor</th><th>Status</th></tr></thead>
                    <tbody>
                      {bookings.slice(0, 5).map(b => (
                        <tr key={b.id}>
                          <td>#{b.event_id}</td>
                          <td>#{b.vendor_id}</td>
                          <td>{statusBadge(b.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-body" style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-lg"   onClick={() => navigate('/events')}>+ Create Event</button>
              <button className="btn btn-secondary btn-lg" onClick={() => navigate('/planner')}>🔍 Find Vendors</button>
              <button className="btn btn-secondary btn-lg" onClick={() => navigate('/bookings')}>📋 My Bookings</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
