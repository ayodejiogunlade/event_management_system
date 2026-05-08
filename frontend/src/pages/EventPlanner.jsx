/**
 * @fileoverview EventPlanner.jsx — "Find Vendors" Multi-Service Discovery Page
 *
 * Handles the new PlannerResponse format which includes:
 *   - packages          → exact or relaxed vendor packages
 *   - is_recommendation → true when constraints were relaxed
 *   - recommendation_reason / recommendation_labels → what changed
 *   - per_category      → best vendors per category (always shown)
 *
 * When no exact results are found, the page shows a clear "Close Recommendations"
 * section so the user always gets something useful instead of a blank screen.
 */

import { useState, useEffect } from 'react'
import { eventsAPI, metaAPI } from '../api'
import api, { bookingsAPI } from '../api'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { useSocket } from '../hooks/useSocket'
import toast from 'react-hot-toast'
import { Plus, Trash2, Search, CheckCircle, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n) => `₦${Number(n).toLocaleString()}`

function pctColor(p) {
  if (Math.abs(p - 100) < 0.5) return 'var(--green)'
  if (p > 100)                  return 'var(--red)'
  return 'var(--amber)'
}

// ─── ExtraInfoFields ──────────────────────────────────────────────────────────

function ExtraInfoFields({ infoFields, values, onChange }) {
  if (!infoFields || infoFields.length === 0) return null
  return (
    <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', marginBottom: 8 }}>
        Service Details
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {infoFields.map((field) => (
          <div key={field.name}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: 4 }}>
              {field.label}{field.unit ? ` (${field.unit})` : ''}
            </label>
            {field.type === 'select' ? (
              <select className="form-control" style={{ padding: '6px 10px', fontSize: 13 }}
                value={values?.[field.name] || ''} onChange={(e) => onChange(field.name, e.target.value)}>
                <option value="">— Select —</option>
                {field.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : (
              <input className="form-control" type={field.type || 'text'} style={{ padding: '6px 10px', fontSize: 13 }}
                placeholder={field.placeholder || ''} value={values?.[field.name] || ''}
                onChange={(e) => onChange(field.name, e.target.value)} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── RecommendationBanner ─────────────────────────────────────────────────────
/**
 * Yellow/amber banner shown when results are recommendations, not exact matches.
 * Clearly explains what constraints were relaxed and why.
 */
function RecommendationBanner({ reason, labels }) {
  return (
    <div style={{
      background:   '#fffbeb',
      border:       '2px solid #f59e0b',
      borderRadius: 12,
      padding:      '18px 22px',
      marginBottom: 20,
      display:      'flex',
      gap:          14,
      alignItems:   'flex-start',
    }}>
      <AlertTriangle size={22} style={{ color: '#d97706', flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 700, fontSize: 15, color: '#92400e', marginBottom: 6 }}>
          ⚡ Close Recommendations — Not an Exact Match
        </p>
        <p style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6, marginBottom: labels.length ? 10 : 0 }}>
          {reason}
        </p>
        {labels.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {labels.map((label, i) => (
              <span key={i} style={{
                background:   '#fde68a',
                color:        '#78350f',
                borderRadius: 99,
                padding:      '3px 12px',
                fontSize:     12,
                fontWeight:   600,
                border:       '1px solid #fbbf24',
              }}>
                ⚠ {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── NoPackageBanner ──────────────────────────────────────────────────────────
/**
 * Shown when not even a relaxed package could be assembled.
 * Directs the user to the per-category breakdown below.
 */
function NoPackageBanner({ reason }) {
  return (
    <div style={{
      background:   '#fef2f2',
      border:       '2px solid #f87171',
      borderRadius: 12,
      padding:      '18px 22px',
      marginBottom: 20,
      display:      'flex',
      gap:          14,
      alignItems:   'flex-start',
    }}>
      <AlertTriangle size={22} style={{ color: '#dc2626', flexShrink: 0, marginTop: 2 }} />
      <div>
        <p style={{ fontWeight: 700, fontSize: 15, color: '#7f1d1d', marginBottom: 6 }}>
          No Complete Package Found
        </p>
        <p style={{ fontSize: 13, color: '#991b1b', lineHeight: 1.6 }}>
          {reason}
        </p>
        <p style={{ fontSize: 13, color: '#991b1b', marginTop: 8, fontWeight: 600 }}>
          👇 Scroll down to see the best available vendors per category.
          You can contact them directly to arrange a custom package.
        </p>
      </div>
    </div>
  )
}

// ─── CategoryBestCard ─────────────────────────────────────────────────────────
/**
 * Shows the best available vendors for a single service category.
 * Includes budget status — whether vendors were found within budget or not.
 */
function CategoryBestCard({ cat, events, userType }) {
  const [expanded, setExpanded] = useState(true)

  const hasVendors     = cat.top_vendors.length > 0
  const withinBudget   = cat.vendors_found > 0
  const anyAvailable   = cat.any_vendors_found > 0

  const headerColor = withinBudget
    ? { bg: '#f0fdf4', border: '#4ade80', text: '#166534', badge: '#dcfce7', badgeText: '#166534' }
    : anyAvailable
      ? { bg: '#fffbeb', border: '#fbbf24', text: '#78350f', badge: '#fde68a', badgeText: '#78350f' }
      : { bg: '#fef2f2', border: '#f87171', text: '#7f1d1d', badge: '#fee2e2', badgeText: '#7f1d1d' }

  return (
    <div style={{ border: `2px solid ${headerColor.border}`, borderRadius: 12, marginBottom: 14, overflow: 'hidden' }}>
      {/* Category header */}
      <div
        style={{ background: headerColor.bg, padding: '14px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setExpanded(e => !e)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: headerColor.text }}>
            {cat.category_label}
          </span>
          <span style={{ background: headerColor.badge, color: headerColor.badgeText, borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>
            {withinBudget
              ? `✅ ${cat.vendors_found} vendor${cat.vendors_found > 1 ? 's' : ''} within budget`
              : anyAvailable
                ? `⚠️ ${cat.any_vendors_found} vendor${cat.any_vendors_found > 1 ? 's' : ''} — budget too low`
                : '❌ No vendors found'
            }
          </span>
          <span style={{ fontSize: 12, color: headerColor.text }}>
            Allocated: {fmt(cat.allocated_budget)}
          </span>
          {cat.min_price_available && cat.min_price_available > cat.allocated_budget && (
            <span style={{ fontSize: 12, color: '#b45309', fontWeight: 600 }}>
              Cheapest available: {fmt(cat.min_price_available)}
              {' '}(+{fmt(cat.budget_shortfall)} needed)
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={16} color={headerColor.text} /> : <ChevronDown size={16} color={headerColor.text} />}
      </div>

      {/* Vendor list */}
      {expanded && (
        <div style={{ background: '#fff', padding: '12px 18px' }}>
          {!hasVendors ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
              No vendors found for this category in your search area.
              <br />Try expanding the radius or adjusting your budget.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {cat.top_vendors.map((v, idx) => (
                <div key={`${v.vendor_id}-${idx}`} style={{
                  background:   'var(--gray-50)',
                  border:       '1px solid var(--gray-200)',
                  borderRadius: 10,
                  padding:      '12px 16px',
                  display:      'flex',
                  justifyContent: 'space-between',
                  alignItems:   'flex-start',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--gray-800)' }}>
                      {v.vendor_name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 3 }}>
                      📍 {v.address} · {v.distance_km} km away · ⭐ {v.rating.toFixed(1)}
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                      <span className="badge badge-purple" style={{ fontSize: 10 }}>{v.service_name}</span>
                      <span className="badge badge-blue"   style={{ fontSize: 10 }}>{v.pricing_model}</span>
                      <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>
                        Deposit: {v.deposit_percent}%{v.vat_applicable ? ' · +7.5% VAT' : ''}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--green)', marginLeft: 16, flexShrink: 0, textAlign: 'right' }}>
                    {fmt(v.price)}
                    {v.price > cat.allocated_budget && (
                      <div style={{ fontSize: 10, color: 'var(--amber)', fontWeight: 600 }}>
                        +{fmt(v.price - cat.allocated_budget)} over budget
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── PackageCard ──────────────────────────────────────────────────────────────

function PackageCard({ pkg, events, userType, isRecommendation }) {
  const [selectedEventId, setSelectedEventId] = useState('')
  const [isBooking, setIsBooking]             = useState(false)
  const canBook = userType === 'organizer' || userType === 'admin'

  async function handleBookAll() {
    if (!selectedEventId) { toast.error('Please select an event first'); return }
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
    toast.success(`${successCount} / ${pkg.vendors.length} vendors booked!`)
    setIsBooking(false)
  }

  return (
    <div className="card" style={{
      border: `2px solid ${isRecommendation ? '#f59e0b' : 'var(--gray-200)'}`,
      marginBottom: 16,
    }}>
      {/* Package header */}
      <div style={{ padding: '16px 20px', background: isRecommendation ? '#78350f' : 'var(--navy)', borderRadius: '8px 8px 0 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>
              Package #{pkg.package_number}
            </span>
            {isRecommendation && (
              <span style={{ marginLeft: 10, background: '#fde68a', color: '#78350f', borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                ⚡ Close Match
              </span>
            )}
            <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, marginLeft: 12 }}>
              {pkg.vendors.length} vendor{pkg.vendors.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#4ade80', fontWeight: 800, fontSize: 18 }}>{fmt(pkg.total_cost)}</div>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>Saves {fmt(pkg.savings)} of {fmt(pkg.total_budget)} budget</div>
          </div>
        </div>
      </div>

      {/* Vendor list */}
      <div style={{ padding: '12px 20px' }}>
        {pkg.vendors.map((vendor, idx) => (
          <div key={`${vendor.vendor_id}-${idx}`} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 0',
            borderBottom: idx < pkg.vendors.length - 1 ? '1px solid var(--gray-100)' : 'none',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{vendor.vendor_name}</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                {vendor.address} · 📍 {vendor.distance_km} km · ⭐ {vendor.rating.toFixed(1)}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                <span className="badge badge-purple" style={{ fontSize: 10 }}>{vendor.category_label}</span>
                <span className="badge badge-blue"   style={{ fontSize: 10 }}>{vendor.service_name}</span>
                <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>
                  Deposit: {vendor.deposit_percent}%{vendor.vat_applicable ? ' · +7.5% VAT' : ''}
                </span>
              </div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--green)', marginLeft: 16, flexShrink: 0 }}>
              {fmt(vendor.price)}
            </div>
          </div>
        ))}
      </div>

      {/* Booking section — organizer/admin only */}
      {canBook && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--gray-200)', background: 'var(--gray-50)', borderRadius: '0 0 8px 8px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="form-control" style={{ width: 240, margin: 0 }}
              value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>
              <option value="">Link to an active event…</option>
              {events.filter((e) => e.status === 'active').map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={handleBookAll} disabled={isBooking || !selectedEventId}>
              <CheckCircle size={14} />
              {isBooking ? 'Booking…' : 'Book All Vendors'}
            </button>
          </div>
        </div>
      )}

      {!canBook && (
        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--gray-200)', background: 'var(--blue-pale)', borderRadius: '0 0 8px 8px', fontSize: 12, color: 'var(--blue)' }}>
          ℹ Booking requests can only be created by event organisers.
        </div>
      )}
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function EventPlanner() {
  const { user }                           = useAuth()
  const [events,     setEvents]            = useState([])
  const [categories, setCategories]        = useState([])
  const [result,     setResult]            = useState(null)   // PlannerResponse
  const [isLoading,  setIsLoading]         = useState(false)
  const [notifTick,  setNotifTick]         = useState(0)
  useSocket(() => setNotifTick((t) => t + 1))

  const [form, setForm] = useState({
    event_date:       new Date().toISOString().slice(0, 16),
    total_budget:     '',
    attendee_count:   '',
    event_lat:        '9.0820',
    event_lng:        '8.6753',
    venue_address:    '',
    search_radius_km: 50,
  })

  const [services, setServices] = useState([
    { category_key: '', budget_percent: '', extra_info: {} },
  ])

  useEffect(() => {
    if (user.user_type === 'organizer' || user.user_type === 'admin') {
      eventsAPI.list().then((r) => setEvents(r.data)).catch(() => {})
    }
    metaAPI.serviceCategories().then((r) => setCategories(r.data)).catch(() => {})
  }, [user.user_type])

  const totalPct = services.reduce((s, sv) => s + (parseFloat(sv.budget_percent) || 0), 0)
  const getBudgetAmount = (pct) => form.total_budget ? fmt(parseFloat(form.total_budget) * parseFloat(pct) / 100) : '—'

  const addService    = () => setServices((p) => [...p, { category_key: '', budget_percent: '', extra_info: {} }])
  const removeService = (i) => setServices((p) => p.filter((_, j) => j !== i))
  const updateService = (i, field, val) => setServices((p) => p.map((s, j) => j === i ? { ...s, [field]: val } : s))
  const updateExtraInfo = (i, k, v) => setServices((p) => p.map((s, j) => j === i ? { ...s, extra_info: { ...s.extra_info, [k]: v } } : s))
  const splitEvenly = () => {
    const per = Math.floor(100 / services.length)
    const rem = 100 - per * services.length
    setServices((p) => p.map((s, i) => ({ ...s, budget_percent: i === 0 ? per + rem : per })))
  }

  async function handleSearch(e) {
    e.preventDefault()
    if (Math.abs(totalPct - 100) > 0.5) {
      toast.error(`Budget allocations must total 100% (currently ${totalPct.toFixed(1)}%)`)
      return
    }
    if (services.some((s) => !s.category_key)) {
      toast.error('Please select a service category for every row')
      return
    }
    setIsLoading(true)
    setResult(null)
    try {
      const payload = {
        event_date:       form.event_date,
        total_budget:     parseFloat(form.total_budget),
        attendee_count:   parseInt(form.attendee_count),
        event_lat:        parseFloat(form.event_lat),
        event_lng:        parseFloat(form.event_lng),
        search_radius_km: parseFloat(form.search_radius_km),
        services: services.map((s) => ({
          category_key:   s.category_key,
          budget_percent: parseFloat(s.budget_percent),
          extra_info:     Object.keys(s.extra_info || {}).length ? s.extra_info : null,
        })),
      }
      const { data } = await api.post('/planner', payload)
      setResult(data)

      if (data.packages.length > 0 && !data.is_recommendation) {
        toast.success(`Found ${data.packages.length} exact vendor package${data.packages.length > 1 ? 's' : ''}!`)
      } else if (data.packages.length > 0 && data.is_recommendation) {
        toast(`Found ${data.packages.length} close match${data.packages.length > 1 ? 'es' : ''} — some criteria were adjusted.`, { icon: '⚡' })
      } else {
        toast('No packages found. Showing best vendors per category.', { icon: '🔍', duration: 6000 })
      }
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Search failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="Find Vendors" onNotif={notifTick} />
        <div className="page" style={{ maxWidth: 1000 }}>
          <p className="page-title">Find Vendors</p>
          <p className="page-subtitle">
            Vendor Discovery — Real-time MCDM matching with Haversine geolocation across all service categories
          </p>

          {/* ── Search Form ── */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header"><span className="fw-600">Event & Budget Details</span></div>
            <div className="card-body">
              <form onSubmit={handleSearch}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 16 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Event Date &amp; Time *</label>
                    <input className="form-control" type="datetime-local" required value={form.event_date}
                      onChange={(e) => setForm((p) => ({ ...p, event_date: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Total Budget (₦) *</label>
                    <input className="form-control" type="number" required placeholder="3000000" value={form.total_budget}
                      onChange={(e) => setForm((p) => ({ ...p, total_budget: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Expected Attendees *</label>
                    <input className="form-control" type="number" required placeholder="100" value={form.attendee_count}
                      onChange={(e) => setForm((p) => ({ ...p, attendee_count: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Search Radius (km)</label>
                    <input className="form-control" type="number" min={1} max={2000} value={form.search_radius_km}
                      onChange={(e) => setForm((p) => ({ ...p, search_radius_km: e.target.value }))} />
                    <p className="form-hint" style={{ marginTop: 4, fontSize: 11 }}>
                      Tip: set 1000 km for nationwide search
                    </p>
                  </div>
                </div>

                <div className="form-group">
                  <label>
                    Event Venue
                    <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 400, marginLeft: 6 }}>
                      — auto-fills coordinates via OpenStreetMap
                    </span>
                  </label>
                  <AddressAutocomplete
                    value={form.venue_address}
                    onChange={(addr) => setForm((p) => ({ ...p, venue_address: addr }))}
                    onPlaceSelect={({ address, lat, lng }) => {
                      setForm((p) => ({ ...p, venue_address: address, event_lat: lat.toFixed(6), event_lng: lng.toFixed(6) }))
                      toast.success('Venue location set!')
                    }}
                    placeholder="e.g. Landmark Centre, Victoria Island, Lagos"
                  />
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                    <span>Lat: {form.event_lat}</span>
                    <span>Lng: {form.event_lng}</span>
                  </div>
                </div>

                {/* Services */}
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <p className="fw-600">Services Required</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={splitEvenly} title="Divide 100% evenly">
                        ⚡ Split Evenly
                      </button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={addService}>
                        <Plus size={13} /> Add Service
                      </button>
                    </div>
                  </div>

                  {services.map((svc, idx) => {
                    const catDef  = categories.find((c) => c.key === svc.category_key)
                    const allocated = svc.budget_percent && form.total_budget
                      ? parseFloat(form.total_budget) * parseFloat(svc.budget_percent) / 100
                      : null
                    return (
                      <div key={idx} style={{ background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 120px 120px auto', gap: 12, alignItems: 'end' }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: 12 }}>Service Category *</label>
                            <select className="form-control" required value={svc.category_key}
                              onChange={(e) => { updateService(idx, 'category_key', e.target.value); updateService(idx, 'extra_info', {}) }}>
                              <option value="">— Select —</option>
                              {categories.map((c) => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                            </select>
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: 12 }}>Budget %</label>
                            <input className="form-control" type="number" min={1} max={100} placeholder="e.g. 40" value={svc.budget_percent}
                              onChange={(e) => updateService(idx, 'budget_percent', e.target.value)} />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: 12 }}>Allocated</label>
                            <div style={{ padding: '8px 10px', background: '#fff', border: '1.5px solid var(--gray-200)', borderRadius: 8, fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>
                              {allocated ? fmt(allocated) : '—'}
                            </div>
                          </div>
                          <button type="button" className="btn btn-ghost btn-sm text-danger"
                            onClick={() => removeService(idx)} disabled={services.length === 1} style={{ marginBottom: 2 }}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                        {catDef?.info_fields && (
                          <ExtraInfoFields infoFields={catDef.info_fields} values={svc.extra_info}
                            onChange={(k, v) => updateExtraInfo(idx, k, v)} />
                        )}
                      </div>
                    )
                  })}

                  {/* Budget bar */}
                  <div style={{
                    marginTop: 12, padding: '12px 16px', borderRadius: 10,
                    background: Math.abs(totalPct - 100) < 0.5 ? 'var(--green-lt)' : totalPct > 100 ? 'var(--red-lt)' : 'var(--amber-lt)',
                    border: `1.5px solid ${pctColor(totalPct)}`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: pctColor(totalPct) }}>
                        Total Allocation: {totalPct.toFixed(1)}%
                        {Math.abs(totalPct - 100) > 0.5 && (
                          <span style={{ fontSize: 12, marginLeft: 8, color: pctColor(totalPct) }}>
                            {totalPct > 100 ? `Over by ${(totalPct - 100).toFixed(1)}%` : `${(100 - totalPct).toFixed(1)}% remaining`}
                          </span>
                        )}
                      </span>
                      {Math.abs(totalPct - 100) < 0.5 && <span style={{ color: 'var(--green)', fontWeight: 700 }}>✅ Ready to search!</span>}
                    </div>
                    <div style={{ height: 6, background: 'rgba(0,0,0,.1)', borderRadius: 3, marginTop: 8 }}>
                      <div style={{ height: '100%', width: `${Math.min(totalPct, 100)}%`, background: pctColor(totalPct), borderRadius: 3, transition: 'width .3s ease' }} />
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <button className="btn btn-primary btn-lg" type="submit" disabled={isLoading}>
                    <Search size={16} />
                    {isLoading ? 'Searching for vendor packages…' : 'Find Vendor Packages'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ── Loading ── */}
          {isLoading && (
            <div className="loading">
              <div className="spinner" />
              <span style={{ marginLeft: 12, color: 'var(--gray-500)' }}>
                Running MCDM matching…
              </span>
            </div>
          )}

          {/* ── Results ── */}
          {result && !isLoading && (
            <div>
              {/* Recommendation banner — shown when constraints were relaxed */}
              {result.is_recommendation && result.packages.length > 0 && (
                <RecommendationBanner
                  reason={result.recommendation_reason}
                  labels={result.recommendation_labels}
                />
              )}

              {/* No-package banner — shown when not even a relaxed package was found */}
              {result.packages.length === 0 && (
                <NoPackageBanner reason={result.recommendation_reason} />
              )}

              {/* Exact package results */}
              {result.packages.length > 0 && !result.is_recommendation && (
                <div style={{ marginBottom: 24 }}>
                  <p className="section-title">
                    {result.packages.length} Exact Vendor Package{result.packages.length > 1 ? 's' : ''} Found
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 16 }}>
                    All packages are within your {form.total_budget ? fmt(parseFloat(form.total_budget)) : ''} budget,
                    sorted by lowest total cost. Each vendor is confirmed available on the selected date.
                  </p>
                  {result.packages.map((pkg) => (
                    <PackageCard key={pkg.package_number} pkg={pkg} events={events}
                      userType={user.user_type} isRecommendation={false} />
                  ))}
                </div>
              )}

              {/* Recommendation packages */}
              {result.packages.length > 0 && result.is_recommendation && (
                <div style={{ marginBottom: 24 }}>
                  <p className="section-title" style={{ color: '#92400e' }}>
                    ⚡ {result.packages.length} Close Match{result.packages.length > 1 ? 'es' : ''} Found
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 16 }}>
                    These packages were found after adjusting your search criteria.
                    Prices or distances may differ from your original requirements.
                  </p>
                  {result.packages.map((pkg) => (
                    <PackageCard key={pkg.package_number} pkg={pkg} events={events}
                      userType={user.user_type} isRecommendation={true} />
                  ))}
                </div>
              )}

              {/* Per-category breakdown — always shown after any search */}
              {result.per_category && result.per_category.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <Info size={16} style={{ color: 'var(--blue)' }} />
                    <p className="section-title" style={{ margin: 0 }}>
                      {result.packages.length === 0
                        ? '🔍 Best Available Vendors Per Category'
                        : '📊 Category Breakdown'}
                    </p>
                  </div>
                  {result.packages.length === 0 && (
                    <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 16 }}>
                      These are the top vendors found per category across an expanded search area.
                      Categories marked in <span style={{ color: '#d97706', fontWeight: 600 }}>amber</span> have
                      vendors available but above your budget. Categories in{' '}
                      <span style={{ color: '#dc2626', fontWeight: 600 }}>red</span> have no vendors at all —
                      consider adjusting your search radius or checking back later.
                    </p>
                  )}
                  {result.per_category.map((cat) => (
                    <CategoryBestCard key={cat.category_key} cat={cat}
                      events={events} userType={user.user_type} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
