import { useState, useEffect } from 'react'
import { adminAPI } from '../api'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'
import { useSocket } from '../hooks/useSocket'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { ChevronDown, ChevronRight, Eye } from 'lucide-react'

const roleBadge = r => ({ admin: 'badge-purple', organizer: 'badge-blue', vendor: 'badge-green' }[r] || 'badge-gray')

const statusBadge = s => ({
  pending:   <span className="badge badge-amber">⏳ Pending</span>,
  confirmed: <span className="badge badge-green">✅ Confirmed</span>,
  declined:  <span className="badge badge-red">❌ Declined</span>,
  cancelled: <span className="badge badge-gray">🚫 Cancelled</span>,
  completed: <span className="badge badge-blue">✔ Completed</span>,
  active:    <span className="badge badge-green">● Active</span>,
  cancelled_ev: <span className="badge badge-red">🚫 Cancelled</span>,
}[s] || <span className="badge badge-gray">{s}</span>)

const LIMIT_OPTIONS = [
  { value: 1,  label: '1 Service (Default)' },
  { value: 3,  label: '3 Services (Standard)' },
  { value: 5,  label: '5 Services (Pro)' },
  { value: -1, label: 'Unlimited (Enterprise)' },
]

// ── Vendor Detail Drawer ──────────────────────────────────────────────────────
function VendorDrawer({ vendor, onClose, onUpdated }) {
  const [updating, setUpdating] = useState(false)
  const [newLimit, setNewLimit] = useState(vendor.service_limit)

  const setLimit = async () => {
    setUpdating(true)
    try {
      await adminAPI.setServiceLimit(vendor.id, parseInt(newLimit))
      toast.success('Service limit updated!')
      onUpdated()
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed') }
    setUpdating(false)
  }

  const toggleVerify = async () => {
    setUpdating(true)
    try {
      await adminAPI.verifyVendor(vendor.id, !vendor.is_verified)
      toast.success(vendor.is_verified ? 'Verification revoked' : 'Vendor verified!')
      onUpdated()
    } catch { toast.error('Failed') }
    setUpdating(false)
  }

  const priceSummary = svc => {
    if (svc.pricing_model === 'Fixed Fee / Package' && svc.fixed_price)
      return `₦${Number(svc.fixed_price).toLocaleString()} fixed`
    if (svc.pricing_model === 'Per Head (Per Guest)' && svc.price_per_head)
      return `₦${Number(svc.price_per_head).toLocaleString()}/guest`
    if (svc.pricing_model === 'Percentage of Budget' && svc.percentage_rate)
      return `${svc.percentage_rate}% of budget`
    if (svc.pricing_model === 'Hourly / Day Rate' && svc.hourly_rate)
      return `₦${Number(svc.hourly_rate).toLocaleString()}/hr`
    return '—'
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 700 }}>
        <div className="modal-header">
          <h2>🏪 {vendor.business_name}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* Status row */}
          <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap', marginBottom: 16 }}>
            {vendor.is_verified
              ? <span className="badge badge-green">✅ Verified</span>
              : <span className="badge badge-amber">⏳ Pending Verification</span>}
            <span className={`badge ${vendor.availability_status ? 'badge-green' : 'badge-gray'}`}>
              {vendor.availability_status ? '● Available' : '○ Unavailable'}
            </span>
            <span className="badge badge-blue">⭐ {vendor.rating?.toFixed(1)} ({vendor.rating_count} reviews)</span>
            <span className="badge badge-purple">
              Limit: {vendor.service_limit === -1 ? 'Unlimited' : vendor.service_limit}
            </span>
          </div>

          {/* Info grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            {[
              ['Owner', vendor.owner_name],
              ['Email', vendor.owner_email],
              ['Service Radius', `${vendor.service_radius_km} km`],
              ['Registered', vendor.created_at ? format(new Date(vendor.created_at), 'dd MMM yyyy') : '—'],
              ['Location', vendor.location?.address || `${vendor.location?.latitude?.toFixed(4)}, ${vendor.location?.longitude?.toFixed(4)}` || '—'],
              ['Description', vendor.description || '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{k}</div>
                <div style={{ fontSize: 13, color: 'var(--gray-800)' }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Services */}
          <div style={{ marginBottom: 16 }}>
            <p className="section-title" style={{ marginBottom: 10 }}>
              Services ({vendor.services?.length || 0})
            </p>
            {!vendor.services?.length ? (
              <div className="empty-state" style={{ padding: '20px 0' }}>
                <p>No services listed yet</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {vendor.services.map(svc => (
                  <div key={svc.id} style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 8, padding: '12px 16px' }}>
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="fw-600" style={{ fontSize: 14 }}>{svc.service_name}</span>
                        <div className="flex gap-2 mt-1">
                          <span className="badge badge-purple" style={{ fontSize: 10 }}>{svc.category}</span>
                          <span className="badge badge-blue" style={{ fontSize: 10 }}>{svc.pricing_model}</span>
                          {svc.vat_applicable && <span className="badge badge-amber" style={{ fontSize: 10 }}>7.5% VAT</span>}
                        </div>
                        {svc.description && <p className="text-sm text-muted" style={{ marginTop: 4 }}>{svc.description}</p>}
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                        <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: 15 }}>{priceSummary(svc)}</div>
                        <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>Deposit: {svc.deposit_percent}%</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Admin Controls */}
          <div style={{ background: 'var(--gray-50)', border: '1px solid var(--gray-200)', borderRadius: 10, padding: 16 }}>
            <p className="fw-600" style={{ marginBottom: 12 }}>🛡 Admin Controls</p>
            <div className="flex gap-3" style={{ flexWrap: 'wrap' }}>
              <button className={`btn ${vendor.is_verified ? 'btn-danger' : 'btn-success'}`}
                onClick={toggleVerify} disabled={updating}>
                {vendor.is_verified ? '❌ Revoke Verification' : '✅ Verify Vendor'}
              </button>
              <div className="flex gap-2 items-center">
                <select className="form-control" style={{ width: 220, margin: 0 }}
                  value={newLimit} onChange={e => setNewLimit(e.target.value)}>
                  {LIMIT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <button className="btn btn-primary" onClick={setLimit} disabled={updating}>
                  {updating ? '…' : 'Set Limit'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Event Detail Drawer ───────────────────────────────────────────────────────
function EventDrawer({ event, onClose }) {
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 620 }}>
        <div className="modal-header">
          <h2>📅 {event.name}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              ['Event Type', event.event_type],
              ['Date', event.event_date ? format(new Date(event.event_date), 'dd MMM yyyy HH:mm') : '—'],
              ['Organizer', event.organizer_name],
              ['Contact', event.organizer_email],
              ['Budget', event.budget ? `₦${Number(event.budget).toLocaleString()}` : '—'],
              ['Status', event.status],
              ['Venue', event.location_address || '—'],
              ['Coordinates', event.location_lat ? `${Number(event.location_lat).toFixed(4)}, ${Number(event.location_lng).toFixed(4)}` : '—'],
              ['Bookings', event.booking_count],
              ['Services Needed', event.required_services || '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{k}</div>
                <div style={{ fontSize: 13, color: 'var(--gray-800)' }}>{String(v)}</div>
              </div>
            ))}
          </div>
          {event.description && (
            <div style={{ marginTop: 14, background: 'var(--gray-50)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Description</div>
              <p style={{ fontSize: 13 }}>{event.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Booking Detail Drawer ─────────────────────────────────────────────────────
function BookingDrawer({ booking, onClose }) {
  const depositAmt = booking.agreed_price
    ? (booking.agreed_price * (booking.deposit_percent || 50) / 100).toFixed(2)
    : null
  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 580 }}>
        <div className="modal-header">
          <h2>📋 Booking #{booking.id}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ marginBottom: 12 }}>{statusBadge(booking.status)}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              ['Event', booking.event_name],
              ['Event Date', booking.event_date ? format(new Date(booking.event_date), 'dd MMM yyyy') : '—'],
              ['Organizer', booking.organizer_name],
              ['Vendor', booking.vendor_name],
              ['Service', booking.vendor_service || '—'],
              ['Category', booking.service_category || '—'],
              ['Pricing Model', booking.pricing_model || '—'],
              ['Guest Count', booking.guest_count || '—'],
              ['Agreed Price', booking.agreed_price ? `₦${Number(booking.agreed_price).toLocaleString()}` : '—'],
              ['Booked On', booking.booking_date ? format(new Date(booking.booking_date), 'dd MMM yyyy') : '—'],
            ].map(([k, v]) => (
              <div key={k} style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{k}</div>
                <div style={{ fontSize: 13, color: 'var(--gray-800)' }}>{String(v ?? '—')}</div>
              </div>
            ))}
          </div>
          {booking.service_details && (
            <div style={{ marginTop: 14, background: 'var(--gray-50)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Service Details / Notes</div>
              <p style={{ fontSize: 13 }}>{booking.service_details}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Admin Users ───────────────────────────────────────────────────────────────
export function AdminUsers() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [notifTick, setNotifTick] = useState(0)
  useSocket(() => setNotifTick(t => t + 1))

  const load = async () => {
    setLoading(true)
    try { const { data } = await adminAPI.users(); setUsers(data) } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const toggle = async (id, active) => {
    try {
      await adminAPI.updateUser(id, { is_active: !active })
      toast.success(!active ? 'User activated' : 'User suspended')
      load()
    } catch { toast.error('Failed') }
  }

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="User Management" onNotif={notifTick} />
        <div className="page">
          <p className="page-title">Users</p>
          <p className="page-subtitle">Manage all registered users on the platform</p>
          <div className="card">
            <div className="card-header flex justify-between items-center">
              <span className="fw-600">{users.length} Total Users</span>
              <input className="form-control" style={{ width: 260, margin: 0 }}
                placeholder="Search by name or email…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {loading ? <div className="loading"><div className="spinner" /></div> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Phone</th><th>Joined</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>
                    {filtered.map(u => (
                      <tr key={u.id}>
                        <td className="fw-600">{u.name}</td>
                        <td className="text-sm text-muted">{u.email}</td>
                        <td><span className={`badge ${roleBadge(u.user_type)}`}>{u.user_type}</span></td>
                        <td className="text-sm">{u.phone_number || '—'}</td>
                        <td className="text-sm">{format(new Date(u.created_at), 'dd MMM yyyy')}</td>
                        <td><span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>{u.is_active ? '● Active' : '● Suspended'}</span></td>
                        <td>
                          <button className={`btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-success'}`}
                            onClick={() => toggle(u.id, u.is_active)}>
                            {u.is_active ? 'Suspend' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Admin Vendors ─────────────────────────────────────────────────────────────
export function AdminVendors() {
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [notifTick, setNotifTick] = useState(0)
  useSocket(() => setNotifTick(t => t + 1))

  const load = async () => {
    setLoading(true)
    try { const { data } = await adminAPI.vendors(); setVendors(data) } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const onUpdated = () => {
    load()
    if (selected) {
      adminAPI.getVendor(selected.id).then(r => setSelected(r.data)).catch(() => setSelected(null))
    }
  }

  const filtered = filter === 'all' ? vendors
    : filter === 'pending' ? vendors.filter(v => !v.is_verified)
    : vendors.filter(v => v.is_verified)

  const pending = vendors.filter(v => !v.is_verified).length

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="Vendor Management" onNotif={notifTick} />
        <div className="page">
          <p className="page-title">Vendor Management</p>
          <p className="page-subtitle">Verify vendors, view all services, and manage service limits</p>

          {pending > 0 && (
            <div style={{ background: 'var(--amber-lt)', border: '1px solid var(--amber)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: 'var(--amber)', fontSize: 14, fontWeight: 600 }}>
              ⚠️ {pending} vendor{pending > 1 ? 's' : ''} awaiting verification
            </div>
          )}

          <div className="flex gap-2 mb-3">
            {['all', 'pending', 'verified'].map(f => (
              <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilter(f)} style={{ textTransform: 'capitalize' }}>{f}</button>
            ))}
          </div>

          <div className="card">
            {loading ? <div className="loading"><div className="spinner" /></div> : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Business</th><th>Owner</th><th>Services</th><th>Location</th><th>Rating</th><th>Svc Limit</th><th>Status</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {filtered.map(v => (
                      <tr key={v.id}>
                        <td className="fw-600">{v.business_name}</td>
                        <td className="text-sm">{v.owner_name}<br /><span className="text-muted" style={{ fontSize: 11 }}>{v.owner_email}</span></td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {v.services?.slice(0, 2).map(s => (
                              <span key={s.id} className="badge badge-purple" style={{ fontSize: 10 }}>{s.category}</span>
                            ))}
                            {v.services?.length > 2 && <span className="badge badge-gray" style={{ fontSize: 10 }}>+{v.services.length - 2}</span>}
                            {!v.services?.length && <span className="text-muted text-xs">None</span>}
                          </div>
                        </td>
                        <td className="text-sm text-muted">{v.location?.address?.slice(0, 30) || '—'}</td>
                        <td>⭐ {v.rating?.toFixed(1)}</td>
                        <td>
                          <span className={`badge ${v.service_limit === -1 ? 'badge-green' : 'badge-blue'}`}>
                            {v.service_limit === -1 ? '∞ Unlimited' : v.service_limit}
                          </span>
                        </td>
                        <td>
                          {v.is_verified
                            ? <span className="badge badge-green">✅ Verified</span>
                            : <span className="badge badge-amber">⏳ Pending</span>}
                        </td>
                        <td>
                          <button className="btn btn-secondary btn-sm" onClick={() => setSelected(v)}>
                            <Eye size={13} /> View
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={8}><div className="empty-state" style={{ padding: '40px 0' }}><p>No vendors found</p></div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      {selected && <VendorDrawer vendor={selected} onClose={() => setSelected(null)} onUpdated={onUpdated} />}
    </div>
  )
}

// ── Admin Events ──────────────────────────────────────────────────────────────
export function AdminEvents() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [notifTick, setNotifTick] = useState(0)
  useSocket(() => setNotifTick(t => t + 1))

  useEffect(() => {
    setLoading(true)
    adminAPI.events().then(r => { setEvents(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const filtered = events.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    (e.organizer_name || '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="All Events" onNotif={notifTick} />
        <div className="page">
          <p className="page-title">All Events</p>
          <p className="page-subtitle">Platform-wide view of every event created by organizers</p>
          <div className="card">
            <div className="card-header flex justify-between items-center">
              <span className="fw-600">{events.length} Total Events</span>
              <input className="form-control" style={{ width: 260, margin: 0 }}
                placeholder="Search by name or organizer…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {loading ? <div className="loading"><div className="spinner" /></div> : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Event</th><th>Type</th><th>Organizer</th><th>Date</th><th>Venue</th><th>Budget</th><th>Bookings</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {filtered.map(ev => (
                      <tr key={ev.id}>
                        <td className="fw-600">{ev.name}</td>
                        <td><span className="badge badge-purple">{ev.event_type}</span></td>
                        <td className="text-sm">{ev.organizer_name}</td>
                        <td className="text-sm">{ev.event_date ? format(new Date(ev.event_date), 'dd MMM yyyy') : '—'}</td>
                        <td className="text-sm text-muted">{ev.location_address?.slice(0, 28) || '—'}</td>
                        <td>{ev.budget ? `₦${Number(ev.budget).toLocaleString()}` : '—'}</td>
                        <td><span className="badge badge-blue">{ev.booking_count}</span></td>
                        <td>{statusBadge(ev.status)}</td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(ev)}><Eye size={13} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      {selected && <EventDrawer event={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

// ── Admin Bookings ────────────────────────────────────────────────────────────
export function AdminBookings() {
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')
  const [notifTick, setNotifTick] = useState(0)
  useSocket(() => setNotifTick(t => t + 1))

  useEffect(() => {
    setLoading(true)
    adminAPI.bookings().then(r => { setBookings(r.data); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter)

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="All Bookings" onNotif={notifTick} />
        <div className="page">
          <p className="page-title">All Bookings</p>
          <p className="page-subtitle">Platform-wide view of every booking transaction</p>

          <div className="flex gap-2 mb-3">
            {['all', 'pending', 'confirmed', 'declined', 'cancelled', 'completed'].map(s => (
              <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilter(s)} style={{ textTransform: 'capitalize' }}>
                {s}
                {s !== 'all' && bookings.filter(b => b.status === s).length > 0 &&
                  <span style={{ marginLeft: 4, background: 'rgba(255,255,255,.3)', borderRadius: 99, padding: '0 5px' }}>
                    {bookings.filter(b => b.status === s).length}
                  </span>}
              </button>
            ))}
          </div>

          <div className="card">
            {loading ? <div className="loading"><div className="spinner" /></div> : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>#</th><th>Event</th><th>Organizer</th><th>Vendor</th><th>Service</th><th>Category</th><th>Pricing</th><th>Price</th><th>Status</th><th></th></tr>
                  </thead>
                  <tbody>
                    {filtered.map(b => (
                      <tr key={b.id}>
                        <td className="text-muted text-sm">#{b.id}</td>
                        <td className="fw-600">{b.event_name}</td>
                        <td className="text-sm">{b.organizer_name}</td>
                        <td className="text-sm">{b.vendor_name}</td>
                        <td className="text-sm">{b.vendor_service || '—'}</td>
                        <td>{b.service_category ? <span className="badge badge-purple" style={{ fontSize: 10 }}>{b.service_category}</span> : '—'}</td>
                        <td>{b.pricing_model ? <span className="badge badge-blue" style={{ fontSize: 10 }}>{b.pricing_model}</span> : '—'}</td>
                        <td className="fw-600" style={{ color: 'var(--green)' }}>
                          {b.agreed_price ? `₦${Number(b.agreed_price).toLocaleString()}` : '—'}
                        </td>
                        <td>{statusBadge(b.status)}</td>
                        <td>
                          <button className="btn btn-ghost btn-sm" onClick={() => setSelected(b)}><Eye size={13} /></button>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={10}><div className="empty-state" style={{ padding: '40px 0' }}><p>No bookings found</p></div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      {selected && <BookingDrawer booking={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
