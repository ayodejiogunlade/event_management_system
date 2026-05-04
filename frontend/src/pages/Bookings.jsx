import { useState, useEffect } from 'react'
import { bookingsAPI } from '../api'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'
import { useAuth } from '../context/AuthContext'
import { useSocket } from '../hooks/useSocket'
import toast from 'react-hot-toast'
import { format } from 'date-fns'

const STATUS_BADGE = {
  pending:   <span className="badge badge-amber">⏳ Pending</span>,
  confirmed: <span className="badge badge-green">✅ Confirmed</span>,
  declined:  <span className="badge badge-red">❌ Declined</span>,
  cancelled: <span className="badge badge-gray">🚫 Cancelled</span>,
  completed: <span className="badge badge-blue">✔ Completed</span>,
}

export default function Bookings() {
  const { user } = useAuth()
  const [bookings,   setBookings]   = useState([])
  const [loading,    setLoading]    = useState(true)
  const [filter,     setFilter]     = useState('all')
  const [notifTick,  setNotifTick]  = useState(0)
  useSocket(() => { setNotifTick(t => t + 1); load() })

  const load = async () => {
    setLoading(true)
    try { const { data } = await bookingsAPI.list(); setBookings(data) } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const updateStatus = async (id, status) => {
    const labels = { confirmed: 'confirm', declined: 'decline', cancelled: 'cancel' }
    if (!window.confirm(`Are you sure you want to ${labels[status]} this booking?`)) return
    try {
      await bookingsAPI.updateStatus(id, status)
      toast.success(`Booking ${status}!`)
      load()
    } catch (err) { toast.error(err.response?.data?.detail || 'Update failed') }
  }

  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter)

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="Bookings" onNotif={notifTick} />
        <div className="page">
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="page-title">Booking Management</p>
              <p className="page-subtitle">
                {user.user_type === 'vendor'
                  ? 'Incoming booking requests from event organizers'
                  : 'Track the status of all your vendor bookings'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {['all','pending','confirmed','declined','cancelled','completed'].map(s => (
              <button key={s} className={`btn btn-sm ${filter === s ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilter(s)} style={{ textTransform: 'capitalize' }}>
                {s}{s !== 'all' && bookings.filter(b => b.status === s).length > 0 &&
                  <span style={{ marginLeft: 4, background: 'rgba(255,255,255,.3)', borderRadius: '99px', padding: '0 5px' }}>
                    {bookings.filter(b => b.status === s).length}
                  </span>}
              </button>
            ))}
          </div>

          {loading ? <div className="loading"><div className="spinner" /></div> :
            filtered.length === 0 ? (
              <div className="card"><div className="card-body">
                <div className="empty-state"><div className="icon">📋</div><p>No {filter === 'all' ? '' : filter} bookings found</p></div>
              </div></div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {filtered.map(b => (
                  <div key={b.id} className="card">
                    <div className="card-body" style={{ padding: '18px 24px' }}>
                      <div className="flex justify-between items-center">
                        <div style={{ flex: 1 }}>
                          <div className="flex items-center gap-2 mb-3">
                            <span style={{ fontWeight: 700, fontSize: 15 }}>Booking #{b.id}</span>
                            {STATUS_BADGE[b.status]}
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                            <div>
                              <span className="text-xs text-muted" style={{ display: 'block', marginBottom: 2 }}>EVENT</span>
                              <span className="fw-600 text-sm">Event #{b.event_id}</span>
                            </div>
                            <div>
                              <span className="text-xs text-muted" style={{ display: 'block', marginBottom: 2 }}>VENDOR</span>
                              <span className="fw-600 text-sm">Vendor #{b.vendor_id}</span>
                            </div>
                            <div>
                              <span className="text-xs text-muted" style={{ display: 'block', marginBottom: 2 }}>REQUESTED ON</span>
                              <span className="text-sm">{format(new Date(b.booking_date || b.created_at), 'dd MMM yyyy')}</span>
                            </div>
                            {b.service_details && (
                              <div style={{ gridColumn: '1 / -1' }}>
                                <span className="text-xs text-muted" style={{ display: 'block', marginBottom: 2 }}>DETAILS</span>
                                <span className="text-sm">{b.service_details}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2" style={{ marginLeft: 20 }}>
                          {user.user_type === 'vendor' && b.status === 'pending' && (
                            <>
                              <button className="btn btn-success btn-sm" onClick={() => updateStatus(b.id, 'confirmed')}>✅ Accept</button>
                              <button className="btn btn-danger btn-sm"  onClick={() => updateStatus(b.id, 'declined')}>❌ Decline</button>
                            </>
                          )}
                          {user.user_type === 'organizer' && ['pending','confirmed'].includes(b.status) && (
                            <button className="btn btn-secondary btn-sm text-danger" onClick={() => updateStatus(b.id, 'cancelled')}>🚫 Cancel</button>
                          )}
                          {user.user_type === 'admin' && b.status === 'pending' && (
                            <>
                              <button className="btn btn-success btn-sm" onClick={() => updateStatus(b.id, 'confirmed')}>✅ Confirm</button>
                              <button className="btn btn-danger btn-sm"  onClick={() => updateStatus(b.id, 'declined')}>❌ Decline</button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        </div>
      </div>
    </div>
  )
}
