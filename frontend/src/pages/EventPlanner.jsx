/**
 * @fileoverview EventPlanner.jsx — "Find Vendors" Multi-Service Discovery Page
 *
 * Provides a multi-criteria vendor discovery engine powered by:
 *   • MCDM (Multi-Criteria Decision Making) composite scoring
 *   • Haversine geolocation distance calculation
 *   • Budget-aware filtering across multiple service categories
 *
 * ─── Access Policy ────────────────────────────────────────────────────────
 *   All authenticated roles can use this page:
 *
 *   organizer   Full access — can search, view packages, and book all vendors.
 *   vendor      Read-only  — can search and view packages but cannot create
 *               bookings (the backend enforces this; the UI hides the booking
 *               section for vendors to avoid confusion).
 *   admin       Full access — same as organizer.
 *
 * ─── Data Flow ────────────────────────────────────────────────────────────
 *   1. User fills in event details and service allocations
 *   2. POST /api/planner  →  returns ranked BudgetPackage[]
 *   3. Each package is rendered as a PackageCard
 *   4. Organizers/admins can link a package to an active event and
 *      send booking requests for all vendors in one click
 */

import { useState, useEffect, useCallback } from 'react'
import { eventsAPI, metaAPI }               from '../api'
import api, { bookingsAPI }                 from '../api'
import { useAuth }                          from '../context/AuthContext'
import Sidebar                              from '../components/Sidebar'
import Topbar                               from '../components/Topbar'
import AddressAutocomplete                  from '../components/AddressAutocomplete'
import { useSocket }                        from '../hooks/useSocket'
import toast                                from 'react-hot-toast'
import { Plus, Trash2, Search, CheckCircle } from 'lucide-react'

/* ─── Formatting Helpers ─────────────────────────────────────────────────── */

/**
 * Format a number as Nigerian Naira currency string.
 * @param {number} n
 * @returns {string}  e.g.  "₦1,500,000"
 */
const fmt = (n) => `₦${Number(n).toLocaleString()}`

/**
 * Returns a CSS colour variable name based on budget allocation percentage.
 * Green = exactly 100%, Red = over budget, Amber = under budget.
 * @param {number} totalPct
 * @returns {string} CSS variable reference
 */
function pctColor(totalPct) {
  if (Math.abs(totalPct - 100) < 0.5) return 'var(--green)'
  if (totalPct > 100) return 'var(--red)'
  return 'var(--amber)'
}

/* ─── Sub-component: ExtraInfoFields ────────────────────────────────────── */

/**
 * Renders the category-specific extra input fields defined in each
 * ServiceCategoryDef.info_fields JSON schema.
 *
 * For example, a "Venue" category might show "Capacity" and "Hall Type" inputs,
 * while "Catering" might show "Cuisine Type" and "Signature Dishes".
 *
 * @param {Object}   props
 * @param {Array}    props.infoFields  - Array of field schemas from the category definition
 * @param {Object}   props.values      - Current extra_info values for this service row
 * @param {Function} props.onChange    - Called with (fieldName, value) on change
 */
function ExtraInfoFields({ infoFields, values, onChange }) {
  if (!infoFields || infoFields.length === 0) return null

  return (
    <div
      style={{
        marginTop:    10,
        padding:      '10px 14px',
        background:   'var(--gray-50)',
        borderRadius: 8,
      }}
    >
      <p
        style={{
          fontSize:        11,
          fontWeight:      700,
          color:           'var(--gray-500)',
          textTransform:   'uppercase',
          marginBottom:    8,
        }}
      >
        Service Details
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {infoFields.map((field) => (
          <div key={field.name}>
            <label
              style={{
                fontSize:     12,
                fontWeight:   600,
                color:        'var(--gray-700)',
                display:      'block',
                marginBottom: 4,
              }}
            >
              {field.label}
              {field.unit ? ` (${field.unit})` : ''}
            </label>

            {field.type === 'select' ? (
              <select
                className="form-control"
                style={{ padding: '6px 10px', fontSize: 13 }}
                value={values?.[field.name] || ''}
                onChange={(e) => onChange(field.name, e.target.value)}
              >
                <option value="">— Select —</option>
                {field.options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <input
                className="form-control"
                type={field.type || 'text'}
                style={{ padding: '6px 10px', fontSize: 13 }}
                placeholder={field.placeholder || ''}
                value={values?.[field.name] || ''}
                onChange={(e) => onChange(field.name, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Sub-component: PackageCard ─────────────────────────────────────────── */

/**
 * Renders a single vendor package result from the MCDM planner.
 *
 * A "package" is a combination of one vendor per requested service category,
 * all of whose combined price fits within the total budget.
 *
 * @param {Object}    props
 * @param {Object}    props.pkg      - BudgetPackage object from the API
 * @param {Array}     props.events   - The current user's active events (for booking)
 * @param {string}    props.userType - The current user's role (controls booking visibility)
 */
function PackageCard({ pkg, events, userType }) {
  const [selectedEventId, setSelectedEventId] = useState('')
  const [isBooking, setIsBooking]             = useState(false)

  /**
   * Books all vendors in this package against a selected event.
   * Sends individual booking requests for each vendor sequentially.
   * Only available to organisers and admins.
   */
  async function handleBookAll() {
    if (!selectedEventId) {
      toast.error('Please select an event first')
      return
    }

    setIsBooking(true)
    let successCount = 0

    for (const vendor of pkg.vendors) {
      try {
        await bookingsAPI.create({
          event_id:        parseInt(selectedEventId),
          vendor_id:       vendor.vendor_id,
          service_details: `${vendor.service_name} — booked via Vendor Discovery`,
          agreed_price:    vendor.price,
        })
        successCount++
      } catch (err) {
        console.warn(`[PackageCard] Failed to book vendor ${vendor.vendor_id}:`, err)
      }
    }

    toast.success(`${successCount} / ${pkg.vendors.length} vendors booked successfully!`)
    setIsBooking(false)
  }

  /** Determines whether to show the booking section */
  const canBook = userType === 'organizer' || userType === 'admin'

  return (
    <div
      className="card"
      style={{ border: '2px solid var(--gray-200)', marginBottom: 16 }}
    >
      {/* ── Package header (navy background) ── */}
      <div
        style={{
          padding:      '16px 20px',
          background:   'var(--navy)',
          borderRadius: '8px 8px 0 0',
        }}
      >
        <div className="flex justify-between items-center">
          <div>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>
              Package #{pkg.package_number}
            </span>
            <span
              style={{
                color:      'rgba(255,255,255,.5)',
                fontSize:   12,
                marginLeft: 12,
              }}
            >
              {pkg.vendors.length} vendor{pkg.vendors.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#4ade80', fontWeight: 800, fontSize: 18 }}>
              {fmt(pkg.total_cost)}
            </div>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>
              Saves {fmt(pkg.savings)} of {fmt(pkg.total_budget)} budget
            </div>
          </div>
        </div>
      </div>

      {/* ── Vendor list ── */}
      <div style={{ padding: '12px 20px' }}>
        {pkg.vendors.map((vendor, idx) => (
          <div
            key={`${vendor.vendor_id}-${idx}`}
            style={{
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'space-between',
              padding:      '10px 0',
              borderBottom: idx < pkg.vendors.length - 1
                ? '1px solid var(--gray-100)'
                : 'none',
            }}
          >
            <div style={{ flex: 1 }}>
              {/* Vendor name */}
              <div style={{ fontWeight: 700, fontSize: 14 }}>{vendor.vendor_name}</div>

              {/* Location + rating */}
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                {vendor.address} · 📍 {vendor.distance_km} km · ⭐ {vendor.rating.toFixed(1)}
              </div>

              {/* Category + service + deposit */}
              <div className="flex gap-2 mt-1" style={{ flexWrap: 'wrap' }}>
                <span className="badge badge-purple" style={{ fontSize: 10 }}>
                  {vendor.category_label}
                </span>
                <span className="badge badge-blue" style={{ fontSize: 10 }}>
                  {vendor.service_name}
                </span>
                <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>
                  Deposit: {vendor.deposit_percent}%
                  {vendor.vat_applicable ? ' · +7.5% VAT' : ''}
                </span>
              </div>
            </div>

            {/* Price */}
            <div
              style={{
                fontWeight: 800,
                fontSize:   16,
                color:      'var(--green)',
                marginLeft: 16,
                flexShrink: 0,
              }}
            >
              {fmt(vendor.price)}
            </div>
          </div>
        ))}
      </div>

      {/* ── Booking section (organizer / admin only) ── */}
      {canBook && (
        <div
          style={{
            padding:      '12px 20px',
            borderTop:    '1px solid var(--gray-200)',
            background:   'var(--gray-50)',
            borderRadius: '0 0 8px 8px',
          }}
        >
          <div className="flex gap-2 items-center" style={{ flexWrap: 'wrap' }}>
            <select
              className="form-control"
              style={{ width: 240, margin: 0 }}
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
            >
              <option value="">Link to an active event…</option>
              {events
                .filter((e) => e.status === 'active')
                .map((e) => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))
              }
            </select>
            <button
              className="btn btn-primary"
              onClick={handleBookAll}
              disabled={isBooking || !selectedEventId}
            >
              <CheckCircle size={14} />
              {isBooking ? 'Booking…' : 'Book All Vendors'}
            </button>
          </div>
        </div>
      )}

      {/*
        ── Vendor info (read-only note for vendor role) ──
        Vendors can discover and compare vendor packages but cannot initiate bookings.
        The backend also enforces this restriction at the API level.
      */}
      {!canBook && (
        <div
          style={{
            padding:      '10px 20px',
            borderTop:    '1px solid var(--gray-200)',
            background:   'var(--blue-pale)',
            borderRadius: '0 0 8px 8px',
            fontSize:     12,
            color:        'var(--blue)',
          }}
        >
          ℹ Booking requests can only be created by event organisers.
          Use this page to research the vendor landscape.
        </div>
      )}
    </div>
  )
}

/* ─── Main Page Component ─────────────────────────────────────────────── */

export default function EventPlanner() {
  const { user }                      = useAuth()
  const [events, setEvents]           = useState([])
  const [categories, setCategories]   = useState([])
  const [packages, setPackages]       = useState([])
  const [isLoading, setIsLoading]     = useState(false)
  const [notifTick, setNotifTick]     = useState(0)
  useSocket(() => setNotifTick((t) => t + 1))

  /* ── Form state ── */
  const [form, setForm] = useState({
    event_date:       new Date().toISOString().slice(0, 16),
    total_budget:     '',
    attendee_count:   '',
    event_lat:        '9.0820',    // Nigeria centre as default
    event_lng:        '8.6753',
    venue_address:    '',
    search_radius_km: 50,
  })

  /* ── Service rows — each row represents one required service category ── */
  const [services, setServices] = useState([
    { category_key: '', budget_percent: '', extra_info: {} },
  ])

  /* ── Initial data load ── */
  useEffect(() => {
    // Organizers and admins also fetch their events for the booking dropdown
    if (user.user_type === 'organizer' || user.user_type === 'admin') {
      eventsAPI.list()
        .then((r) => setEvents(r.data))
        .catch(() => {})
    }
    // All roles load service categories for the search form
    metaAPI.serviceCategories()
      .then((r) => setCategories(r.data))
      .catch(() => {})
  }, [user.user_type])

  /* ── Computed total allocation percentage ── */
  const totalPct = services.reduce(
    (sum, svc) => sum + (parseFloat(svc.budget_percent) || 0),
    0
  )

  /**
   * Returns the monetary amount allocated to a service row.
   * @param {number|string} pct  - Budget percentage for the row
   * @returns {string}            Formatted ₦ amount or "—"
   */
  const getBudgetAmount = (pct) =>
    form.total_budget
      ? fmt(parseFloat(form.total_budget) * parseFloat(pct) / 100)
      : '—'

  /* ─── Service row handlers ─────────────────────────────────────────── */

  /** Adds a new empty service row */
  const addService = () =>
    setServices((prev) => [...prev, { category_key: '', budget_percent: '', extra_info: {} }])

  /** Removes the service row at the given index */
  const removeService = (index) =>
    setServices((prev) => prev.filter((_, i) => i !== index))

  /** Updates a scalar field on a service row */
  const updateService = (index, field, value) =>
    setServices((prev) =>
      prev.map((svc, i) => i === index ? { ...svc, [field]: value } : svc)
    )

  /** Updates a single extra_info key on a service row */
  const updateExtraInfo = (index, key, value) =>
    setServices((prev) =>
      prev.map((svc, i) =>
        i === index
          ? { ...svc, extra_info: { ...svc.extra_info, [key]: value } }
          : svc
      )
    )

  /**
   * Evenly distributes 100% of the budget across all service rows.
   * The first row absorbs any rounding remainder.
   */
  const splitEvenly = () => {
    const perService  = Math.floor(100 / services.length)
    const remainder   = 100 - perService * services.length
    setServices((prev) =>
      prev.map((svc, i) => ({
        ...svc,
        budget_percent: i === 0 ? perService + remainder : perService,
      }))
    )
  }

  /* ─── Search handler ──────────────────────────────────────────────── */

  /**
   * Submits the planner query to the backend MCDM engine.
   * Validates that budget percentages sum to 100% and all categories are selected.
   *
   * @param {React.FormEvent} e
   */
  async function handleSearch(e) {
    e.preventDefault()

    // Guard: percentages must sum to 100
    if (Math.abs(totalPct - 100) > 0.5) {
      toast.error(
        `Budget allocations must total 100% (currently ${totalPct.toFixed(1)}%)`,
        { duration: 5000 }
      )
      return
    }

    // Guard: all service rows must have a category selected
    if (services.some((svc) => !svc.category_key)) {
      toast.error('Please select a service category for every row')
      return
    }

    setIsLoading(true)
    setPackages([])

    try {
      const payload = {
        event_date:       form.event_date,
        total_budget:     parseFloat(form.total_budget),
        attendee_count:   parseInt(form.attendee_count),
        event_lat:        parseFloat(form.event_lat),
        event_lng:        parseFloat(form.event_lng),
        search_radius_km: parseFloat(form.search_radius_km),
        services: services.map((svc) => ({
          category_key:   svc.category_key,
          budget_percent: parseFloat(svc.budget_percent),
          extra_info:     Object.keys(svc.extra_info || {}).length
            ? svc.extra_info
            : null,
        })),
      }

      const { data } = await api.post('/planner', payload)
      setPackages(data)

      if (data.length === 0) {
        toast(
          'No vendor packages found within your budget and radius. '
          + 'Try increasing your budget or search radius.',
          { icon: '🔍', duration: 6000 }
        )
      } else {
        toast.success(
          `Found ${data.length} vendor package${data.length > 1 ? 's' : ''}!`
        )
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Search failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  /* ─── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="Find Vendors" onNotif={notifTick} />

        <div className="page" style={{ maxWidth: 1000 }}>
          {/* ── Page header ── */}
          <p className="page-title">Find Vendors</p>
          <p className="page-subtitle">
            Vendor Discovery — Real-time MCDM matching with Haversine geolocation
            across all service categories
          </p>

          {/* ── Search Form ── */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header">
              <span className="fw-600">Event & Budget Details</span>
            </div>

            <div className="card-body">
              <form onSubmit={handleSearch}>

                {/* Row 1: Event date, total budget, attendee count, search radius */}
                <div
                  style={{
                    display:             'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap:                 16,
                    marginBottom:        16,
                  }}
                >
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Event Date &amp; Time *</label>
                    <input
                      className="form-control"
                      type="datetime-local"
                      required
                      value={form.event_date}
                      onChange={(e) => setForm((p) => ({ ...p, event_date: e.target.value }))}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Total Budget (₦) *</label>
                    <input
                      className="form-control"
                      type="number"
                      required
                      placeholder="1000000"
                      value={form.total_budget}
                      onChange={(e) => setForm((p) => ({ ...p, total_budget: e.target.value }))}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Expected Attendees *</label>
                    <input
                      className="form-control"
                      type="number"
                      required
                      placeholder="100"
                      value={form.attendee_count}
                      onChange={(e) => setForm((p) => ({ ...p, attendee_count: e.target.value }))}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Search Radius (km)</label>
                    <input
                      className="form-control"
                      type="number"
                      min={1}
                      max={500}
                      value={form.search_radius_km}
                      onChange={(e) => setForm((p) => ({ ...p, search_radius_km: e.target.value }))}
                    />
                  </div>
                </div>

                {/* Venue address with OSM autocomplete + geolocation */}
                <div className="form-group">
                  <label>
                    Event Venue
                    <span
                      style={{
                        fontSize:   11,
                        color:      'var(--gray-400)',
                        fontWeight: 400,
                        marginLeft: 6,
                      }}
                    >
                      — auto-fills coordinates via OpenStreetMap
                    </span>
                  </label>
                  <AddressAutocomplete
                    value={form.venue_address}
                    onChange={(addr) => setForm((p) => ({ ...p, venue_address: addr }))}
                    onPlaceSelect={({ address, lat, lng }) => {
                      setForm((p) => ({
                        ...p,
                        venue_address: address,
                        event_lat:     lat.toFixed(6),
                        event_lng:     lng.toFixed(6),
                      }))
                      toast.success('Venue location set!')
                    }}
                    placeholder="e.g. Landmark Centre, Victoria Island, Lagos"
                  />
                  <div
                    className="flex gap-3 mt-1"
                    style={{ fontSize: 12, color: 'var(--gray-400)' }}
                  >
                    <span>Lat: {form.event_lat}</span>
                    <span>Lng: {form.event_lng}</span>
                  </div>
                </div>

                {/* ── Service rows ── */}
                <div style={{ marginTop: 8 }}>
                  <div
                    className="flex justify-between items-center"
                    style={{ marginBottom: 10 }}
                  >
                    <p className="fw-600">Services Required</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={splitEvenly}
                        title="Divide 100% evenly across all service rows"
                      >
                        ⚡ Split Evenly
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={addService}
                      >
                        <Plus size={13} /> Add Service
                      </button>
                    </div>
                  </div>

                  {services.map((svc, idx) => {
                    const catDef    = categories.find((c) => c.key === svc.category_key)
                    const allocated = svc.budget_percent && form.total_budget
                      ? parseFloat(form.total_budget) * parseFloat(svc.budget_percent) / 100
                      : null

                    return (
                      <div
                        key={idx}
                        style={{
                          background:   'var(--gray-50)',
                          border:       '1.5px solid var(--gray-200)',
                          borderRadius: 10,
                          padding:      '14px 16px',
                          marginBottom: 10,
                        }}
                      >
                        <div
                          style={{
                            display:             'grid',
                            gridTemplateColumns: '2fr 120px 120px auto',
                            gap:                 12,
                            alignItems:          'end',
                          }}
                        >
                          {/* Category selector */}
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: 12 }}>Service Category *</label>
                            <select
                              className="form-control"
                              required
                              value={svc.category_key}
                              onChange={(e) => {
                                updateService(idx, 'category_key', e.target.value)
                                updateService(idx, 'extra_info', {})
                              }}
                            >
                              <option value="">— Select —</option>
                              {categories.map((cat) => (
                                <option key={cat.key} value={cat.key}>
                                  {cat.icon} {cat.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Budget % */}
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: 12 }}>Budget %</label>
                            <input
                              className="form-control"
                              type="number"
                              min={1}
                              max={100}
                              placeholder="e.g. 40"
                              value={svc.budget_percent}
                              onChange={(e) =>
                                updateService(idx, 'budget_percent', e.target.value)
                              }
                            />
                          </div>

                          {/* Allocated amount display */}
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: 12 }}>Allocated</label>
                            <div
                              style={{
                                padding:      '8px 10px',
                                background:   '#fff',
                                border:       '1.5px solid var(--gray-200)',
                                borderRadius: 8,
                                fontSize:     14,
                                fontWeight:   700,
                                color:        'var(--green)',
                              }}
                            >
                              {allocated ? fmt(allocated) : '—'}
                            </div>
                          </div>

                          {/* Remove row button */}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm text-danger"
                            onClick={() => removeService(idx)}
                            disabled={services.length === 1}
                            title="Remove this service"
                            style={{ marginBottom: 2 }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>

                        {/* Category-specific extra fields (e.g. capacity, cuisine) */}
                        {catDef?.info_fields && (
                          <ExtraInfoFields
                            infoFields={catDef.info_fields}
                            values={svc.extra_info}
                            onChange={(key, val) => updateExtraInfo(idx, key, val)}
                          />
                        )}
                      </div>
                    )
                  })}

                  {/* Budget allocation progress bar */}
                  <div
                    style={{
                      marginTop:    12,
                      padding:      '12px 16px',
                      borderRadius: 10,
                      background:   Math.abs(totalPct - 100) < 0.5
                        ? 'var(--green-lt)'
                        : totalPct > 100
                          ? 'var(--red-lt)'
                          : 'var(--amber-lt)',
                      border: `1.5px solid ${pctColor(totalPct)}`,
                    }}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <span
                          style={{
                            fontSize:   14,
                            fontWeight: 700,
                            color:      pctColor(totalPct),
                          }}
                        >
                          Total Allocation: {totalPct.toFixed(1)}%
                        </span>
                        {Math.abs(totalPct - 100) > 0.5 && (
                          <span
                            style={{
                              fontSize:   12,
                              marginLeft: 8,
                              color:      pctColor(totalPct),
                            }}
                          >
                            {totalPct > 100
                              ? `Over by ${(totalPct - 100).toFixed(1)}%`
                              : `${(100 - totalPct).toFixed(1)}% remaining`
                            }
                          </span>
                        )}
                      </div>
                      {Math.abs(totalPct - 100) < 0.5 && (
                        <span style={{ color: 'var(--green)', fontWeight: 700 }}>
                          ✅ Ready to search!
                        </span>
                      )}
                    </div>

                    {/* Visual progress bar */}
                    <div
                      style={{
                        height:     6,
                        background: 'rgba(0,0,0,.1)',
                        borderRadius: 3,
                        marginTop:  8,
                      }}
                    >
                      <div
                        style={{
                          height:     '100%',
                          width:      `${Math.min(totalPct, 100)}%`,
                          background: pctColor(totalPct),
                          borderRadius: 3,
                          transition: 'width .3s ease',
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Search button */}
                <div style={{ marginTop: 20 }}>
                  <button
                    className="btn btn-primary btn-lg"
                    type="submit"
                    disabled={isLoading}
                  >
                    <Search size={16} />
                    {isLoading
                      ? 'Searching for vendor packages…'
                      : 'Find Vendor Packages'
                    }
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ── Loading state ── */}
          {isLoading && (
            <div className="loading">
              <div className="spinner" />
              <span style={{ marginLeft: 12, color: 'var(--gray-500)' }}>
                Running MCDM matching across all vendors…
              </span>
            </div>
          )}

          {/* ── Search results ── */}
          {packages.length > 0 && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <p className="section-title">
                  {packages.length} Vendor Package{packages.length > 1 ? 's' : ''} Found
                </p>
                <p className="text-sm text-muted">
                  All packages are within your{' '}
                  {form.total_budget
                    ? `₦${Number(form.total_budget).toLocaleString()}`
                    : ''
                  } budget, sorted by lowest total cost.
                  Each vendor is confirmed available on the selected date.
                </p>
              </div>

              {packages.map((pkg) => (
                <PackageCard
                  key={pkg.package_number}
                  pkg={pkg}
                  events={events}
                  userType={user.user_type}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
