/**
 * @fileoverview Events.jsx — Event Management Page (Organizer / Admin)
 *
 * Allows event organisers and admins to create, view, edit, and cancel events.
 *
 * ─── Features ────────────────────────────────────────────────────────────
 *   • List all events for the current user (or all events for admins)
 *   • Create / edit events via a modal form
 *   • Venue address with real-time OpenStreetMap autocomplete (Photon API)
 *     and optional "Use My Location" (device GPS + Nominatim reverse-geocode)
 *   • Latitude / longitude auto-populate when an address suggestion is selected
 *   • Cancel events (cascades to cancel active bookings — enforced server-side)
 *
 * ─── Access ───────────────────────────────────────────────────────────────
 *   organizer + admin (enforced by route guard in App.jsx)
 */

import { useState, useEffect }    from 'react'
import { eventsAPI }              from '../api'
import Sidebar                    from '../components/Sidebar'
import Topbar                     from '../components/Topbar'
import AddressAutocomplete        from '../components/AddressAutocomplete'
import { useSocket }              from '../hooks/useSocket'
import toast                      from 'react-hot-toast'
import { format }                 from 'date-fns'
import { Plus, X, Edit2, Trash2 } from 'lucide-react'

/* ─── Constants ──────────────────────────────────────────────────────────── */

/** CSS badge variant per event status */
const STATUS_BADGE_CLASS = {
  active:    'badge-green',
  draft:     'badge-gray',
  cancelled: 'badge-red',
  completed: 'badge-blue',
}

/** Available event type options for the form selector */
const EVENT_TYPES = [
  'Conference',
  'Wedding',
  'Exhibition',
  'Corporate',
  'Party',
  'Concert',
  'Workshop',
  'Funeral / Memorial',
  'Product Launch',
  'Other',
]

/* ─── EventModal ─────────────────────────────────────────────────────────── */

/**
 * Modal form for creating or editing an event.
 *
 * @param {Object}         props
 * @param {Object|null}    props.event    - Existing event object (edit mode) or null (create mode)
 * @param {Function}       props.onClose  - Called when the modal should close
 * @param {Function}       props.onSaved  - Called after a successful create / update
 */
function EventModal({ event, onClose, onSaved }) {
  const isEditing = !!event?.id

  const [form, setForm] = useState({
    name:             event?.name             || '',
    event_type:       event?.event_type       || 'Conference',
    event_date:       event?.event_date ? event.event_date.slice(0, 16) : '',
    budget:           event?.budget           || '',
    location_address: event?.location_address || '',
    location_lat:     event?.location_lat     || '',
    location_lng:     event?.location_lng     || '',
    required_services: event?.required_services || '',
    description:      event?.description      || '',
  })
  const [isSaving, setIsSaving] = useState(false)

  /**
   * Helper to bind a form field to a simple text-like input.
   * @param {string} key - The field name in the form state
   */
  const fieldHandler = (key) => (e) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setIsSaving(true)
    try {
      const payload = {
        ...form,
        budget:       form.budget       ? parseFloat(form.budget)       : null,
        location_lat: form.location_lat ? parseFloat(form.location_lat) : null,
        location_lng: form.location_lng ? parseFloat(form.location_lng) : null,
      }

      if (isEditing) {
        await eventsAPI.update(event.id, payload)
      } else {
        await eventsAPI.create(payload)
      }

      toast.success(isEditing ? 'Event updated!' : 'Event created!')
      onSaved()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to save event')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal" style={{ maxWidth: 600 }}>
        <div className="modal-header">
          <h2>{isEditing ? 'Edit Event' : 'Create New Event'}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className="modal-body">
          <form onSubmit={handleSubmit}>

            {/* Name + type */}
            <div className="form-row">
              <div className="form-group">
                <label>Event Name *</label>
                <input
                  className="form-control"
                  required
                  value={form.name}
                  onChange={fieldHandler('name')}
                  placeholder="e.g. Annual Tech Summit"
                />
              </div>
              <div className="form-group">
                <label>Event Type</label>
                <select
                  className="form-control"
                  value={form.event_type}
                  onChange={fieldHandler('event_type')}
                >
                  {EVENT_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Date + budget */}
            <div className="form-row">
              <div className="form-group">
                <label>Event Date &amp; Time *</label>
                <input
                  className="form-control"
                  type="datetime-local"
                  required
                  value={form.event_date}
                  onChange={fieldHandler('event_date')}
                />
              </div>
              <div className="form-group">
                <label>Budget (₦)</label>
                <input
                  className="form-control"
                  type="number"
                  value={form.budget}
                  onChange={fieldHandler('budget')}
                  placeholder="2000000"
                />
              </div>
            </div>

            {/*
              Venue address — OSM Photon autocomplete.
              Selecting a suggestion auto-fills lat/lng below.
            */}
            <div className="form-group">
              <label>
                Venue Address
                <span
                  style={{
                    fontSize:   11,
                    color:      'var(--gray-400)',
                    fontWeight: 400,
                    marginLeft: 6,
                  }}
                >
                  — start typing to search (OpenStreetMap)
                </span>
              </label>
              <AddressAutocomplete
                value={form.location_address}
                onChange={(addr) =>
                  setForm((p) => ({ ...p, location_address: addr }))
                }
                onPlaceSelect={({ address, lat, lng }) => {
                  setForm((p) => ({
                    ...p,
                    location_address: address,
                    location_lat:     lat.toFixed(6),
                    location_lng:     lng.toFixed(6),
                  }))
                  toast.success('Venue location set automatically!')
                }}
                placeholder="e.g. Landmark Centre, Victoria Island, Lagos"
              />
            </div>

            {/* Lat / lng (auto-filled, editable) */}
            <div className="form-row">
              <div className="form-group">
                <label>Latitude (auto-filled)</label>
                <input
                  className="form-control"
                  type="number"
                  step="any"
                  value={form.location_lat}
                  onChange={fieldHandler('location_lat')}
                  placeholder="6.4281"
                />
              </div>
              <div className="form-group">
                <label>Longitude (auto-filled)</label>
                <input
                  className="form-control"
                  type="number"
                  step="any"
                  value={form.location_lng}
                  onChange={fieldHandler('location_lng')}
                  placeholder="3.4219"
                />
              </div>
            </div>

            {/* Services needed */}
            <div className="form-group">
              <label>Services Required</label>
              <input
                className="form-control"
                value={form.required_services}
                onChange={fieldHandler('required_services')}
                placeholder="e.g. Catering, Decoration, Photography, DJ Services, Security"
              />
            </div>

            {/* Description */}
            <div className="form-group">
              <label>Description</label>
              <textarea
                className="form-control"
                value={form.description}
                onChange={fieldHandler('description')}
                placeholder="Brief event description…"
              />
            </div>

            <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={isSaving}
              >
                {isSaving
                  ? 'Saving…'
                  : isEditing ? 'Update Event' : 'Create Event'
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */

export default function Events() {
  const [events, setEvents]       = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing]     = useState(null)   // event being edited, or null
  const [notifTick, setNotifTick] = useState(0)
  useSocket(() => setNotifTick((t) => t + 1))

  /** Fetches the event list from the API and updates state */
  async function loadEvents() {
    setIsLoading(true)
    try {
      const { data } = await eventsAPI.list()
      setEvents(data)
    } catch {
      // Silent fail — the empty state handles no data
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadEvents() }, [])

  /** Cancels an event after user confirmation */
  async function handleCancel(eventId) {
    if (!window.confirm('Cancel this event? All active bookings will be cancelled.')) return
    try {
      await eventsAPI.cancel(eventId)
      toast.success('Event cancelled')
      loadEvents()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Failed to cancel event')
    }
  }

  /** Opens the modal in create mode */
  function openCreate() {
    setEditing(null)
    setShowModal(true)
  }

  /** Opens the modal in edit mode */
  function openEdit(event) {
    setEditing(event)
    setShowModal(true)
  }

  function closeModal() {
    setShowModal(false)
    setEditing(null)
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="My Events" onNotif={notifTick} />

        <div className="page">
          {/* ── Header ── */}
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="page-title">Events</p>
              <p className="page-subtitle">
                Plan and manage all your events — venue address auto-geocodes
                via OpenStreetMap (free, no API key required)
              </p>
            </div>
            <button className="btn btn-primary" onClick={openCreate}>
              <Plus size={16} /> New Event
            </button>
          </div>

          {/* ── Content ── */}
          {isLoading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : events.length === 0 ? (
            <div className="card">
              <div className="card-body">
                <div className="empty-state">
                  <div className="icon">📅</div>
                  <p>No events yet.</p>
                  <br />
                  <button className="btn btn-primary" onClick={openCreate}>
                    + Create Event
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Event Name</th>
                      <th>Type</th>
                      <th>Date</th>
                      <th>Venue</th>
                      <th>Budget</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {events.map((ev) => (
                      <tr key={ev.id}>
                        <td><span className="fw-600">{ev.name}</span></td>
                        <td>
                          <span className="badge badge-purple">{ev.event_type}</span>
                        </td>
                        <td>
                          {format(new Date(ev.event_date), 'dd MMM yyyy, HH:mm')}
                        </td>
                        <td className="text-sm text-muted">
                          {ev.location_address || '—'}
                        </td>
                        <td>
                          {ev.budget ? `₦${Number(ev.budget).toLocaleString()}` : '—'}
                        </td>
                        <td>
                          <span
                            className={`badge ${STATUS_BADGE_CLASS[ev.status] || 'badge-gray'}`}
                          >
                            {ev.status}
                          </span>
                        </td>
                        <td>
                          {ev.status !== 'cancelled' && (
                            <div className="flex gap-2">
                              <button
                                className="btn btn-ghost btn-sm"
                                title="Edit event"
                                onClick={() => openEdit(ev)}
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                className="btn btn-ghost btn-sm text-danger"
                                title="Cancel event"
                                onClick={() => handleCancel(ev.id)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Create / Edit modal ── */}
      {showModal && (
        <EventModal
          event={editing}
          onClose={closeModal}
          onSaved={() => { closeModal(); loadEvents() }}
        />
      )}
    </div>
  )
}
