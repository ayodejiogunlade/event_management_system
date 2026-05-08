/**
 * @fileoverview Discover.jsx — Quick Vendor Search (Single-Service)
 *
 * Changes in this version:
 *
 *  1. VENDOR DETAIL MODAL
 *     Clicking any vendor card opens a full-screen modal showing:
 *       - Business profile (description, verified badge, rating, radius)
 *       - Location with coordinates
 *       - Contact information (owner name, phone, email)
 *       - ALL service listings — not just the matched one
 *       - "Book Now" button per service (inline booking form)
 *
 *  2. PER-SERVICE INLINE BOOKING
 *     Inside the detail modal, each service has its own "Book Now" button
 *     that expands an inline form (event selector, guest count, price).
 *     Only one service's form is open at a time.
 *
 *  3. POST-BOOKING CONTACT MODAL
 *     After a successful booking, a modal shows the vendor's contact
 *     details and prompts the user to reach out to confirm arrangements.
 */

import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { eventsAPI, matchAPI, bookingsAPI, metaAPI, vendorsAPI } from '../api'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { useSocket } from '../hooks/useSocket'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  Search, MapPin, Star, X, Phone, Mail, UserCheck,
  ChevronDown, ChevronUp, CheckCircle, Eye,
} from 'lucide-react'

// ─── Leaflet icon fix ─────────────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const venueIcon = new L.Icon({
  iconUrl:     'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl:   'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize:    [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) => `₦${Number(n).toLocaleString()}`

function Stars({ rating }) {
  return (
    <span>
      {[1, 2, 3, 4, 5].map(i => (
        <span key={i} className="star">{i <= Math.round(rating) ? '★' : '☆'}</span>
      ))}
    </span>
  )
}

/**
 * Compute the effective price for a service given budget and guest count.
 * Returns { price, label } where label is a formatted display string.
 */
function resolvePrice(svc, budget, guests) {
  const pm = svc.pricing_model_key
  if (pm === 'fixed_fee'  && svc.fixed_price)     return { price: parseFloat(svc.fixed_price),                          label: `${fmt(svc.fixed_price)} fixed` }
  if (pm === 'per_head'   && svc.price_per_head)  return { price: parseFloat(svc.price_per_head) * (guests || 1),        label: `${fmt(svc.price_per_head)}/guest` }
  if (pm === 'percentage' && svc.percentage_rate) return { price: (svc.percentage_rate / 100) * (budget || 0),           label: `${svc.percentage_rate}% of budget` }
  if (pm === 'hourly'     && svc.hourly_rate)     return { price: parseFloat(svc.hourly_rate) * (svc.min_hours || 1),    label: `${fmt(svc.hourly_rate)}/hr` }
  return { price: null, label: '—' }
}


// ─── BookingSuccessModal ───────────────────────────────────────────────────────
/**
 * Shown after a successful booking. Displays vendor contact details
 * and prompts the user to reach out to confirm arrangements.
 */
function BookingSuccessModal({ vendor, onClose }) {
  const copyContacts = () => {
    const text = [
      vendor.business_name,
      vendor.owner_name  ? `Name:  ${vendor.owner_name}`  : '',
      vendor.owner_phone ? `Phone: ${vendor.owner_phone}` : '',
      vendor.owner_email ? `Email: ${vendor.owner_email}` : '',
    ].filter(Boolean).join('\n')
    navigator.clipboard.writeText(text)
    toast.success('Contact details copied!')
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2 style={{ color: 'var(--green)' }}>🎉 Booking Request Sent!</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {/* Success note */}
          <div style={{ background: 'var(--green-lt)', border: '1.5px solid var(--green)', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
            <p style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>✅ Booking request created</p>
            <p style={{ fontSize: 13, color: '#166534', lineHeight: 1.6 }}>
              <strong>{vendor.business_name}</strong> has been notified via the platform.
              We recommend contacting them directly to confirm all arrangements and
              share your specific event details.
            </p>
          </div>

          {/* Contact card */}
          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Phone size={15} style={{ color: 'var(--blue)' }} /> Vendor Contact Details
          </p>
          <div style={{ border: '1.5px solid var(--gray-200)', borderRadius: 10, padding: '16px 18px', marginBottom: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 10 }}>{vendor.business_name}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {vendor.owner_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                  <UserCheck size={14} style={{ color: 'var(--gray-400)', flexShrink: 0 }} />
                  <span>{vendor.owner_name}</span>
                </div>
              )}
              {vendor.owner_phone ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                  <Phone size={14} style={{ color: 'var(--gray-400)', flexShrink: 0 }} />
                  <a href={`tel:${vendor.owner_phone}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>
                    {vendor.owner_phone}
                  </a>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Phone size={13} style={{ flexShrink: 0 }} /> Phone not listed — contact via platform messages
                </div>
              )}
              {vendor.owner_email ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                  <Mail size={14} style={{ color: 'var(--gray-400)', flexShrink: 0 }} />
                  <a href={`mailto:${vendor.owner_email}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>
                    {vendor.owner_email}
                  </a>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Mail size={13} style={{ flexShrink: 0 }} /> Email not listed — contact via platform messages
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={copyContacts}>📋 Copy Contact</button>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  )
}


// ─── ServiceBookingRow ────────────────────────────────────────────────────────
/**
 * A single service listing inside the VendorDetailModal.
 * Has an expandable inline booking form.
 *
 * Props:
 *   svc          — VendorServiceOut object
 *   vendor       — full VendorOut object (for vendor_id)
 *   events       — active events list (for dropdown)
 *   isMatched    — true when this is the service that matched the search query
 *   onBooked     — callback(vendorData) called after successful booking
 */
function ServiceBookingRow({ svc, vendor, events, isMatched, onBooked }) {
  const [open,      setOpen]      = useState(false)
  const [eventId,   setEventId]   = useState('')
  const [guests,    setGuests]    = useState('')
  const [isBooking, setIsBooking] = useState(false)

  const { price, label } = resolvePrice(svc, 0, parseInt(guests) || 1)

  const estimatedTotal = (() => {
    if (svc.pricing_model_key === 'per_head' && svc.price_per_head && guests)
      return parseFloat(svc.price_per_head) * parseInt(guests)
    return price
  })()

  async function handleBook() {
    if (!eventId) { toast.error('Please select an event'); return }
    if (svc.pricing_model_key === 'per_head' && !guests) { toast.error('Please enter guest count'); return }
    setIsBooking(true)
    try {
      await bookingsAPI.create({
        event_id:          parseInt(eventId),
        vendor_id:         vendor.id,
        vendor_service_id: svc.id,
        service_details:   svc.service_name,
        guest_count:       guests ? parseInt(guests) : null,
        agreed_price:      estimatedTotal || null,
      })
      toast.success('Booking request sent!')
      setOpen(false)
      setEventId('')
      setGuests('')
      if (onBooked) onBooked(vendor)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Booking failed. Please try again.')
    } finally {
      setIsBooking(false)
    }
  }

  return (
    <div style={{
      border: `2px solid ${isMatched ? 'var(--blue)' : 'var(--gray-200)'}`,
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: 10,
    }}>
      {/* Service summary row */}
      <div style={{
        padding: '14px 16px',
        background: isMatched ? 'var(--blue-pale)' : 'var(--gray-50)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
      }}>
        {/* Info */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>{svc.service_name}</span>
            {isMatched && <span className="badge badge-blue" style={{ fontSize: 10 }}>✓ Matched your search</span>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
            <span className="badge badge-purple" style={{ fontSize: 10 }}>{svc.category_key}</span>
            <span className="badge badge-gray"   style={{ fontSize: 10 }}>{svc.pricing_model_key}</span>
            {svc.vat_applicable && <span className="badge badge-amber" style={{ fontSize: 10 }}>+7.5% VAT</span>}
            <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>Deposit: {svc.deposit_percent}%</span>
            {svc.min_guests && <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>Min guests: {svc.min_guests}</span>}
          </div>
          {svc.description && (
            <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 6, lineHeight: 1.5 }}>
              {svc.description}
            </p>
          )}
          {/* Extra info chips */}
          {svc.extra_info && Object.keys(svc.extra_info).length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 6 }}>
              {Object.entries(svc.extra_info).map(([k, v]) => v && (
                <span key={k} style={{ background: '#fff', border: '1px solid var(--gray-200)', borderRadius: 6, padding: '2px 8px', fontSize: 11, color: 'var(--gray-600)' }}>
                  {k.replace(/_/g, ' ')}: {v}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Price + Book button */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: 'var(--green)', textAlign: 'right' }}>
            {label}
          </div>
          <button
            className={`btn btn-sm ${open ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => setOpen(o => !o)}
          >
            {open ? <><ChevronUp size={13} /> Cancel</> : <><CheckCircle size={13} /> Book Now</>}
          </button>
        </div>
      </div>

      {/* Inline booking form — expands when Book Now is clicked */}
      {open && (
        <div style={{ padding: '14px 16px', background: '#fff', borderTop: '1.5px solid var(--gray-200)' }}>
          <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-700)', marginBottom: 12 }}>
            Book <strong>{svc.service_name}</strong>
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: svc.pricing_model_key === 'per_head' ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 12 }}>
            {/* Event selector */}
            <div className="form-group" style={{ margin: 0 }}>
              <label style={{ fontSize: 12 }}>Link to Event *</label>
              <select className="form-control" value={eventId}
                onChange={e => setEventId(e.target.value)}>
                <option value="">— Select active event —</option>
                {events.filter(ev => ev.status === 'active').map(ev => (
                  <option key={ev.id} value={ev.id}>{ev.name}</option>
                ))}
              </select>
            </div>
            {/* Guest count — only for per-head pricing */}
            {svc.pricing_model_key === 'per_head' && (
              <div className="form-group" style={{ margin: 0 }}>
                <label style={{ fontSize: 12 }}>
                  Number of Guests *
                  {svc.min_guests && <span style={{ color: 'var(--gray-400)', fontWeight: 400 }}> (min {svc.min_guests})</span>}
                </label>
                <input className="form-control" type="number" min={svc.min_guests || 1}
                  value={guests} onChange={e => setGuests(e.target.value)} placeholder={`e.g. ${svc.min_guests || 100}`} />
              </div>
            )}
          </div>

          {/* Price preview */}
          {estimatedTotal && (
            <div style={{ background: 'var(--green-lt)', border: '1px solid var(--green)', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--green)', fontWeight: 600 }}>Estimated Total:</span>
                <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--green)' }}>
                  {fmt(estimatedTotal)}
                  {svc.vat_applicable && ` + ${fmt(estimatedTotal * 0.075)} VAT`}
                </span>
              </div>
              <div style={{ fontSize: 11, color: '#166534', marginTop: 4 }}>
                Deposit required: {fmt(estimatedTotal * svc.deposit_percent / 100)} ({svc.deposit_percent}%)
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" onClick={handleBook} disabled={isBooking || !eventId}>
              <CheckCircle size={13} />
              {isBooking ? 'Sending request…' : 'Confirm Booking Request'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}


// ─── VendorDetailModal ─────────────────────────────────────────────────────────
/**
 * Full vendor profile modal. Shows:
 *   - Business info (name, description, verified status, rating)
 *   - Location + coordinates
 *   - Contact information (owner name, phone, email)
 *   - ALL service listings with per-service Book Now buttons
 *   - MCDM composite match score
 *
 * Props:
 *   result    — VendorMatchResult from the search API
 *   events    — active events list for booking
 *   userType  — current user's role
 *   onClose   — close callback
 *   onBooked  — called with full vendor data after a booking
 */
function VendorDetailModal({ result, events, userType, onClose, onBooked }) {
  const { vendor, distance_km, composite_score, matched_service } = result
  const canBook = userType === 'organizer' || userType === 'admin'

  // Fetch full vendor details to get owner_phone (match results may not have it)
  const [fullVendor, setFullVendor] = useState(vendor)
  useEffect(() => {
    vendorsAPI.get(vendor.id)
      .then(r => setFullVendor(r.data))
      .catch(() => {})          // fallback to search result data
  }, [vendor.id])

  const v = fullVendor

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 700, maxHeight: '92vh', overflowY: 'auto' }}>

        {/* ── Sticky header ── */}
        <div className="modal-header" style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 10, paddingBottom: 12, borderBottom: '1px solid var(--gray-200)' }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{v.business_name}</h2>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {v.is_verified && <span className="badge badge-green">✅ Verified</span>}
              <span className={`badge ${v.availability_status ? 'badge-green' : 'badge-gray'}`}>
                {v.availability_status ? '● Available' : '○ Unavailable'}
              </span>
              <span className="badge badge-blue">⭐ {v.rating.toFixed(1)} ({v.rating_count} reviews)</span>
              <span className="badge badge-purple">📍 {distance_km} km away</span>
              <span className="badge badge-purple">{v.service_radius_km} km service radius</span>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-body">

          {/* ── MCDM Score bar ── */}
          <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: '12px 16px', marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)' }}>MCDM Match Score</span>
              <span style={{ fontWeight: 800, fontSize: 20, color: 'var(--blue)' }}>
                {(composite_score * 100).toFixed(0)}
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--gray-400)' }}> / 100</span>
              </span>
            </div>
            <div style={{ height: 8, background: 'var(--gray-200)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${composite_score * 100}%`, background: 'linear-gradient(90deg, var(--blue), var(--teal))', borderRadius: 4 }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
              Weighted: 40% proximity · 30% price · 30% rating
            </div>
          </div>

          {/* ── Description ── */}
          {v.description && (
            <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.7, marginBottom: 18 }}>
              {v.description}
            </p>
          )}

          {/* ── Location ── */}
          {v.location && (
            <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: '12px 16px', marginBottom: 18 }}>
              <p style={{ fontWeight: 600, fontSize: 13, color: 'var(--gray-700)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <MapPin size={14} style={{ color: 'var(--blue)' }} /> Business Location
              </p>
              <div style={{ fontSize: 13, color: 'var(--gray-700)' }}>{v.location.address}</div>
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 3 }}>
                {parseFloat(v.location.latitude).toFixed(5)}, {parseFloat(v.location.longitude).toFixed(5)}
                {' · '}{distance_km} km from your venue
              </div>
            </div>
          )}

          {/* ── Contact information ── */}
          <div style={{ background: '#f0fdf4', border: '2px solid #4ade80', borderRadius: 10, padding: '14px 18px', marginBottom: 22 }}>
            <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--green)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <UserCheck size={15} /> Contact Information
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {v.owner_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                  <UserCheck size={14} style={{ color: 'var(--gray-400)', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600 }}>{v.owner_name}</span>
                </div>
              )}
              {v.owner_phone ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                  <Phone size={14} style={{ color: 'var(--gray-400)', flexShrink: 0 }} />
                  <a href={`tel:${v.owner_phone}`} style={{ color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>
                    {v.owner_phone}
                  </a>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Phone size={13} style={{ flexShrink: 0 }} />
                  Phone not listed
                </div>
              )}
              {v.owner_email ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                  <Mail size={14} style={{ color: 'var(--gray-400)', flexShrink: 0 }} />
                  <a href={`mailto:${v.owner_email}`} style={{ color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>
                    {v.owner_email}
                  </a>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--gray-400)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Mail size={13} style={{ flexShrink: 0 }} />
                  Email not listed
                </div>
              )}
            </div>
          </div>

          {/* ── Service listings ── */}
          <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: 'var(--gray-800)' }}>
            Service Listings ({v.services?.length || 0})
          </p>

          {!v.services?.length ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--gray-400)', fontSize: 14 }}>
              No services listed yet.
            </div>
          ) : (
            <div>
              {/* Show matched service first */}
              {matched_service && (
                <ServiceBookingRow
                  key={`matched-${matched_service.id}`}
                  svc={matched_service}
                  vendor={v}
                  events={events}
                  isMatched={true}
                  onBooked={canBook ? onBooked : null}
                />
              )}
              {/* Then remaining services */}
              {v.services
                .filter(s => s.id !== matched_service?.id)
                .map(svc => (
                  <ServiceBookingRow
                    key={svc.id}
                    svc={svc}
                    vendor={v}
                    events={events}
                    isMatched={false}
                    onBooked={canBook ? onBooked : null}
                  />
                ))
              }
              {!canBook && (
                <div style={{ fontSize: 13, color: 'var(--blue)', background: 'var(--blue-pale)', borderRadius: 8, padding: '10px 14px', marginTop: 8 }}>
                  ℹ Only event organisers can create booking requests.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


// ─── Main Discover Component ───────────────────────────────────────────────────

export default function Discover() {
  const { user }         = useAuth()
  const [events,         setEvents]        = useState([])
  const [categories,     setCategories]    = useState([])
  const [results,        setResults]       = useState([])
  const [isLoading,      setIsLoading]     = useState(false)
  const [sortBy,         setSortBy]        = useState('score')
  const [notifTick,      setNotifTick]     = useState(0)

  // Detail modal
  const [detailResult,   setDetailResult]  = useState(null)

  // Post-booking contact modal
  const [bookedVendor,   setBookedVendor]  = useState(null)

  useSocket(() => { setNotifTick(t => t + 1) })

  const [form, setForm] = useState({
    event_id: '', service_category: '',
    event_lat: '6.4281', event_lng: '3.4219',
    venue_address: '', search_radius_km: 50,
    budget: '', event_date: new Date().toISOString().slice(0, 16),
  })

  useEffect(() => {
    eventsAPI.list().then(r => setEvents(r.data)).catch(() => {})
    metaAPI.serviceCategories().then(r => setCategories(r.data)).catch(() => {})
  }, [])

  function handleEventChange(e) {
    const ev = events.find(x => x.id === parseInt(e.target.value))
    if (ev) {
      setForm(p => ({
        ...p,
        event_id:      ev.id,
        event_lat:     ev.location_lat     || p.event_lat,
        event_lng:     ev.location_lng     || p.event_lng,
        venue_address: ev.location_address || p.venue_address,
        budget:        ev.budget           || p.budget,
        event_date:    ev.event_date?.slice(0, 16) || p.event_date,
      }))
    } else {
      setForm(p => ({ ...p, event_id: '' }))
    }
  }

  async function handleSearch(e) {
    e.preventDefault()
    if (!form.service_category) { toast.error('Please select a service category'); return }
    setIsLoading(true)
    setResults([])
    try {
      const { data } = await matchAPI.match({
        service_category: form.service_category,
        event_date:       form.event_date,
        budget:           form.budget ? parseFloat(form.budget) : null,
        event_lat:        parseFloat(form.event_lat),
        event_lng:        parseFloat(form.event_lng),
        search_radius_km: parseFloat(form.search_radius_km),
      })
      setResults(data)
      if (!data.length) toast('No vendors found. Try expanding radius or adjusting budget.', { icon: '🔍' })
      else toast.success(`Found ${data.length} matching vendor${data.length > 1 ? 's' : ''}!`)
    } catch {
      toast.error('Search failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // Called after any successful booking from inside the detail modal
  function handleBooked(vendorData) {
    setDetailResult(null)
    setBookedVendor(vendorData)
  }

  const sorted = [...results].sort((a, b) =>
    sortBy === 'score'    ? b.composite_score - a.composite_score
    : sortBy === 'distance' ? a.distance_km - b.distance_km
    : b.vendor.rating - a.vendor.rating
  )

  const mapCenter = [parseFloat(form.event_lat) || 6.4281, parseFloat(form.event_lng) || 3.4219]

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="Quick Vendor Search" onNotif={notifTick} />

        <div className="page" style={{ maxWidth: 1400 }}>
          <p className="page-title">Quick Vendor Search</p>
          <p className="page-subtitle">
            Find vendors for a single service category. Click any result to view
            full details, all listings, and book individual services.
            For multi-service discovery use <strong>Find Vendors</strong> in the sidebar.
          </p>

          {/* ── Search form ── */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-body">
              <form onSubmit={handleSearch}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Link to Event</label>
                    <select className="form-control" value={form.event_id} onChange={handleEventChange}>
                      <option value="">— Select event —</option>
                      {events.filter(e => e.status === 'active').map(e => (
                        <option key={e.id} value={e.id}>{e.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Service Category *</label>
                    <select className="form-control" required value={form.service_category}
                      onChange={e => setForm(p => ({ ...p, service_category: e.target.value }))}>
                      <option value="">— Select category —</option>
                      {categories.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Event Date *</label>
                    <input className="form-control" type="datetime-local" required
                      value={form.event_date} onChange={e => setForm(p => ({ ...p, event_date: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Max Budget (₦)</label>
                    <input className="form-control" type="number" value={form.budget} placeholder="500000"
                      onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
                    <label>
                      Venue Address
                      <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 400, marginLeft: 6 }}>
                        — auto-fills coordinates (OpenStreetMap)
                      </span>
                    </label>
                    <AddressAutocomplete value={form.venue_address}
                      onChange={addr => setForm(p => ({ ...p, venue_address: addr }))}
                      onPlaceSelect={({ address, lat, lng }) => {
                        setForm(p => ({ ...p, venue_address: address, event_lat: lat.toFixed(6), event_lng: lng.toFixed(6) }))
                        toast.success(`Venue set: ${lat.toFixed(4)}, ${lng.toFixed(4)}`)
                      }}
                      placeholder="e.g. Eko Hotel, Victoria Island, Lagos" />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Search Radius (km)</label>
                    <input className="form-control" type="number" value={form.search_radius_km} min={1} max={2000}
                      onChange={e => setForm(p => ({ ...p, search_radius_km: e.target.value }))} />
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <button className="btn btn-primary btn-lg" type="submit" disabled={isLoading}>
                    <Search size={16} />
                    {isLoading ? 'Searching…' : 'Search Vendors'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ── Results grid ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 20, alignItems: 'start' }}>

            {/* ── Vendor list ── */}
            <div>
              {results.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span className="section-title" style={{ margin: 0 }}>{results.length} Vendors Found</span>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>Sort:</span>
                    {['score', 'distance', 'rating'].map(s => (
                      <button key={s} className={`btn btn-sm ${sortBy === s ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setSortBy(s)} style={{ textTransform: 'capitalize' }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sorted.map((r, i) => (
                  <div
                    key={r.vendor.id}
                    className="vendor-card"
                    style={{ cursor: 'pointer' }}
                    onClick={() => setDetailResult(r)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1 }}>
                        {/* Rank + name + badges */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                          <span style={{ background: 'var(--blue)', color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                            #{i + 1}
                          </span>
                          <span className="vendor-name">{r.vendor.business_name}</span>
                          {r.vendor.is_verified && <span className="badge badge-green">✅ Verified</span>}
                          <span style={{ fontSize: 12, color: 'var(--blue)', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Eye size={12} /> Click to view details
                          </span>
                        </div>

                        {/* Matched service highlight */}
                        {r.matched_service && (
                          <div style={{ background: 'var(--blue-pale)', borderRadius: 8, padding: '8px 12px', marginBottom: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span className="badge badge-purple" style={{ fontSize: 10 }}>{r.matched_service.category_key}</span>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{r.matched_service.service_name}</span>
                              <span className="badge badge-blue" style={{ fontSize: 10 }}>{r.matched_service.pricing_model_key}</span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                              Deposit: {r.matched_service.deposit_percent}%
                              {r.matched_service.vat_applicable ? ' · +7.5% VAT' : ''}
                            </div>
                          </div>
                        )}

                        {/* Meta row */}
                        <div className="vendor-meta">
                          <span><MapPin size={12} /> {r.distance_km} km</span>
                          <span><Star size={12} /><Stars rating={r.vendor.rating} /> ({r.vendor.rating_count})</span>
                          <span>📍 {r.vendor.location?.address?.slice(0, 40) || 'Location set'}</span>
                          {r.vendor.services?.length > 0 && (
                            <span>🛎 {r.vendor.services.length} service{r.vendor.services.length > 1 ? 's' : ''}</span>
                          )}
                        </div>

                        {/* Score bar */}
                        <div className="score-bar mt-2">
                          <div className="score-fill" style={{ width: `${r.composite_score * 100}%` }} />
                        </div>
                      </div>

                      {/* Score + quick Book button */}
                      <div style={{ marginLeft: 16, textAlign: 'right', flexShrink: 0 }}>
                        <div className="vendor-score">
                          {(r.composite_score * 100).toFixed(0)}<span>Match %</span>
                        </div>
                        <button
                          className="btn btn-primary btn-sm mt-2"
                          onClick={e => { e.stopPropagation(); setDetailResult(r) }}
                        >
                          <Eye size={13} /> View & Book
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                {!isLoading && results.length === 0 && (
                  <div className="empty-state card" style={{ padding: 60 }}>
                    <div className="icon">🔍</div>
                    <p>Select a category and click Search to find vendors near your venue.</p>
                  </div>
                )}
              </div>
            </div>

            {/* ── Map ── */}
            <div style={{ position: 'sticky', top: 76 }}>
              <p className="section-title">Vendor Map</p>
              <div className="map-container">
                <MapContainer center={mapCenter} zoom={11} style={{ height: '100%', width: '100%' }}>
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a> contributors'
                  />
                  <Marker position={mapCenter} icon={venueIcon}>
                    <Popup><strong>📍 Event Venue</strong><br />{form.venue_address || `${mapCenter[0]}, ${mapCenter[1]}`}</Popup>
                  </Marker>
                  <Circle center={mapCenter} radius={parseFloat(form.search_radius_km) * 1000}
                    color="var(--blue)" fillColor="var(--blue)" fillOpacity={0.05} />
                  {results.map(r =>
                    r.vendor.location ? (
                      <Marker key={r.vendor.id} position={[
                        parseFloat(r.vendor.location.latitude),
                        parseFloat(r.vendor.location.longitude),
                      ]}>
                        <Popup>
                          <strong>{r.vendor.business_name}</strong><br />
                          {r.matched_service?.service_name}<br />
                          📍 {r.distance_km} km · ⭐ {r.vendor.rating.toFixed(1)}<br />
                          Match: {(r.composite_score * 100).toFixed(0)}%<br />
                          <button
                            style={{ marginTop: 6, background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: 12 }}
                            onClick={() => setDetailResult(r)}
                          >
                            View Details
                          </button>
                        </Popup>
                      </Marker>
                    ) : null
                  )}
                </MapContainer>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Vendor Detail Modal ── */}
      {detailResult && (
        <VendorDetailModal
          result={detailResult}
          events={events}
          userType={user.user_type}
          onClose={() => setDetailResult(null)}
          onBooked={handleBooked}
        />
      )}

      {/* ── Post-booking contact modal ── */}
      {bookedVendor && (
        <BookingSuccessModal
          vendor={bookedVendor}
          onClose={() => setBookedVendor(null)}
        />
      )}
    </div>
  )
}
