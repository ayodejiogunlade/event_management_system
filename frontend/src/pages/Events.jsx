import { useState, useEffect } from 'react'
import { eventsAPI } from '../api'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { useSocket } from '../hooks/useSocket'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { Plus, X, Edit2, Trash2 } from 'lucide-react'

const STATUS_BADGE = { active: 'badge-green', draft: 'badge-gray', cancelled: 'badge-red', completed: 'badge-blue' }

function EventModal({ event, onClose, onSaved }) {
  const editing = !!event?.id
  const [form, setForm] = useState({
    name: event?.name || '', event_type: event?.event_type || 'Conference',
    event_date: event?.event_date ? event.event_date.slice(0, 16) : '',
    budget: event?.budget || '',
    location_address: event?.location_address || '',
    location_lat: event?.location_lat || '',
    location_lng: event?.location_lng || '',
    required_services: event?.required_services || '',
    description: event?.description || '',
  })
  const [loading, setLoading] = useState(false)

  const submit = async e => {
    e.preventDefault(); setLoading(true)
    try {
      const payload = {
        ...form,
        budget: form.budget ? parseFloat(form.budget) : null,
        location_lat: form.location_lat ? parseFloat(form.location_lat) : null,
        location_lng: form.location_lng ? parseFloat(form.location_lng) : null,
      }
      if (editing) await eventsAPI.update(event.id, payload)
      else await eventsAPI.create(payload)
      toast.success(editing ? 'Event updated!' : 'Event created!')
      onSaved()
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed') }
    setLoading(false)
  }

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <h2>{editing ? 'Edit Event' : 'Create New Event'}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <form onSubmit={submit}>
            <div className="form-row">
              <div className="form-group">
                <label>Event Name *</label>
                <input className="form-control" required value={form.name} onChange={f('name')} placeholder="Annual Tech Summit" />
              </div>
              <div className="form-group">
                <label>Event Type</label>
                <select className="form-control" value={form.event_type} onChange={f('event_type')}>
                  {['Conference', 'Wedding', 'Exhibition', 'Corporate', 'Party', 'Concert', 'Workshop', 'Funeral / Memorial', 'Product Launch', 'Other'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Event Date & Time *</label>
                <input className="form-control" type="datetime-local" required value={form.event_date} onChange={f('event_date')} />
              </div>
              <div className="form-group">
                <label>Budget (₦)</label>
                <input className="form-control" type="number" value={form.budget} onChange={f('budget')} placeholder="2000000" />
              </div>
            </div>
            <div className="form-group">
              <label>Venue Address (type to search — lat/lng auto-fills)</label>
              <AddressAutocomplete
                value={form.location_address}
                onChange={addr => setForm(p => ({ ...p, location_address: addr }))}
                onPlaceSelect={({ address, lat, lng }) => {
                  setForm(p => ({ ...p, location_address: address, location_lat: lat.toFixed(6), location_lng: lng.toFixed(6) }))
                  toast.success('Venue location set automatically!')
                }}
                placeholder="e.g. Landmark Centre, Victoria Island, Lagos"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Latitude (auto-filled)</label>
                <input className="form-control" type="number" step="any" value={form.location_lat} onChange={f('location_lat')} placeholder="6.4281" />
              </div>
              <div className="form-group">
                <label>Longitude (auto-filled)</label>
                <input className="form-control" type="number" step="any" value={form.location_lng} onChange={f('location_lng')} placeholder="3.4219" />
              </div>
            </div>
            <div className="form-group">
              <label>Services Required</label>
              <input className="form-control" value={form.required_services} onChange={f('required_services')}
                placeholder="e.g. Catering, Decoration, Photography, DJ Services, Security" />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea className="form-control" value={form.description} onChange={f('description')} placeholder="Brief event description…" />
            </div>
            <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" type="button" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? 'Saving…' : editing ? 'Update Event' : 'Create Event'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function Events() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [notifTick, setNotifTick] = useState(0)
  useSocket(() => setNotifTick(t => t + 1))

  const load = async () => {
    setLoading(true)
    try { const { data } = await eventsAPI.list(); setEvents(data) } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const cancelEvent = async id => {
    if (!window.confirm('Cancel this event? All active bookings will be cancelled.')) return
    try { await eventsAPI.cancel(id); toast.success('Event cancelled'); load() }
    catch (err) { toast.error(err.response?.data?.detail || 'Failed') }
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="My Events" onNotif={notifTick} />
        <div className="page">
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="page-title">Events</p>
              <p className="page-subtitle">Plan and manage all your events — venue address auto-geocodes via Google Places</p>
            </div>
            <button className="btn btn-primary" onClick={() => { setEditing(null); setShowModal(true) }}>
              <Plus size={16} /> New Event
            </button>
          </div>

          {loading ? <div className="loading"><div className="spinner" /></div> :
            events.length === 0 ? (
              <div className="card"><div className="card-body">
                <div className="empty-state"><div className="icon">📅</div><p>No events yet.</p><br />
                  <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Create Event</button>
                </div>
              </div></div>
            ) : (
              <div className="card">
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Event Name</th><th>Type</th><th>Date</th><th>Venue</th><th>Budget</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                      {events.map(ev => (
                        <tr key={ev.id}>
                          <td><span className="fw-600">{ev.name}</span></td>
                          <td><span className="badge badge-purple">{ev.event_type}</span></td>
                          <td>{format(new Date(ev.event_date), 'dd MMM yyyy, HH:mm')}</td>
                          <td className="text-sm text-muted">{ev.location_address || '—'}</td>
                          <td>{ev.budget ? `₦${Number(ev.budget).toLocaleString()}` : '—'}</td>
                          <td><span className={`badge ${STATUS_BADGE[ev.status] || 'badge-gray'}`}>{ev.status}</span></td>
                          <td>
                            {ev.status !== 'cancelled' && (
                              <div className="flex gap-2">
                                <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(ev); setShowModal(true) }}><Edit2 size={14} /></button>
                                <button className="btn btn-ghost btn-sm text-danger" onClick={() => cancelEvent(ev.id)}><Trash2 size={14} /></button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          }
        </div>
      </div>
      {showModal && <EventModal event={editing} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load() }} />}
    </div>
  )
}
