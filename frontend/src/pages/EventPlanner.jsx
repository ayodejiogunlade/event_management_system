import { useState, useEffect, useCallback } from 'react'
import { eventsAPI, metaAPI } from '../api'
import api, { bookingsAPI } from '../api'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { useSocket } from '../hooks/useSocket'
import toast from 'react-hot-toast'
import { Plus, Trash2, Search, ChevronDown, ChevronUp, CheckCircle } from 'lucide-react'

// ── helpers ───────────────────────────────────────────────────────────────────
const fmt = n => `₦${Number(n).toLocaleString()}`

function pctColor(total) {
  if (Math.abs(total - 100) < 0.5) return 'var(--green)'
  if (total > 100) return 'var(--red)'
  return 'var(--amber)'
}

// Render dynamic extra-info fields for a service category
function ExtraInfoFields({ infoFields, values, onChange }) {
  if (!infoFields || infoFields.length === 0) return null
  return (
    <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', marginBottom: 8 }}>
        Service Details
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {infoFields.map(f => (
          <div key={f.name}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: 4 }}>
              {f.label} {f.unit ? `(${f.unit})` : ''}
            </label>
            {f.type === 'select' ? (
              <select className="form-control" style={{ padding: '6px 10px', fontSize: 13 }}
                value={values?.[f.name] || ''} onChange={e => onChange(f.name, e.target.value)}>
                <option value="">— Select —</option>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input className="form-control" type={f.type || 'text'}
                style={{ padding: '6px 10px', fontSize: 13 }}
                placeholder={f.placeholder || ''}
                value={values?.[f.name] || ''}
                onChange={e => onChange(f.name, e.target.value)} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Package card ──────────────────────────────────────────────────────────────
function PackageCard({ pkg, onBook, events }) {
  const [expanded, setExpanded] = useState(false)
  const [bookingEvent, setBookingEvent] = useState('')
  const [booking, setBooking] = useState(false)

  const bookAll = async () => {
    if (!bookingEvent) { toast.error('Select an event first'); return }
    setBooking(true)
    let success = 0
    for (const v of pkg.vendors) {
      try {
        await bookingsAPI.create({
          event_id: parseInt(bookingEvent),
          vendor_id: v.vendor_id,
          service_details: `${v.service_name} — booked via Event Planner`,
          agreed_price: v.price,
        })
        success++
      } catch {}
    }
    toast.success(`${success}/${pkg.vendors.length} vendors booked!`)
    setBooking(false)
  }

  return (
    <div className="card" style={{ border: '2px solid var(--gray-200)', marginBottom: 16 }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', background: 'var(--navy)', borderRadius: '8px 8px 0 0' }}>
        <div className="flex justify-between items-center">
          <div>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Package #{pkg.package_number}</span>
            <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, marginLeft: 12 }}>
              {pkg.vendors.length} vendor{pkg.vendors.length > 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#4ade80', fontWeight: 800, fontSize: 18 }}>{fmt(pkg.total_cost)}</div>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>
              Saves {fmt(pkg.savings)} of {fmt(pkg.total_budget)} budget
            </div>
          </div>
        </div>
      </div>

      {/* Vendors */}
      <div style={{ padding: '12px 20px' }}>
        {pkg.vendors.map((v, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 0', borderBottom: i < pkg.vendors.length - 1 ? '1px solid var(--gray-100)' : 'none' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{v.vendor_name}</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                {v.address} · 📍 {v.distance_km} km · ⭐ {v.rating.toFixed(1)}
              </div>
              <div className="flex gap-2 mt-1" style={{ flexWrap: 'wrap' }}>
                <span className="badge badge-purple" style={{ fontSize: 10 }}>{v.category_label}</span>
                <span className="badge badge-blue" style={{ fontSize: 10 }}>{v.service_name}</span>
                <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>
                  Deposit: {v.deposit_percent}% {v.vat_applicable ? '· +7.5% VAT' : ''}
                </span>
              </div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--green)', marginLeft: 16, flexShrink: 0 }}>
              {fmt(v.price)}
            </div>
          </div>
        ))}
      </div>

      {/* Book section */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--gray-200)', background: 'var(--gray-50)',
        borderRadius: '0 0 8px 8px' }}>
        <div className="flex gap-2 items-center" style={{ flexWrap: 'wrap' }}>
          <select className="form-control" style={{ width: 240, margin: 0 }}
            value={bookingEvent} onChange={e => setBookingEvent(e.target.value)}>
            <option value="">Link to event…</option>
            {events.filter(e => e.status === 'active').map(e =>
              <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <button className="btn btn-primary" onClick={bookAll} disabled={booking || !bookingEvent}>
            <CheckCircle size={14} /> {booking ? 'Booking…' : 'Book All Vendors'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function EventPlanner() {
  const [events, setEvents] = useState([])
  const [categories, setCategories] = useState([])
  const [packages, setPackages] = useState([])
  const [loading, setLoading] = useState(false)
  const [notifTick, setNotifTick] = useState(0)
  useSocket(() => setNotifTick(t => t + 1))

  const [form, setForm] = useState({
    event_date: new Date().toISOString().slice(0, 16),
    total_budget: '',
    attendee_count: '',
    event_lat: '6.4281',
    event_lng: '3.4219',
    venue_address: '',
    search_radius_km: 50,
  })

  const [services, setServices] = useState([
    { category_key: '', budget_percent: '', extra_info: {} }
  ])

  useEffect(() => {
    eventsAPI.list().then(r => setEvents(r.data)).catch(() => {})
    metaAPI.serviceCategories().then(r => setCategories(r.data)).catch(() => {})
  }, [])

  const totalPct = services.reduce((s, x) => s + (parseFloat(x.budget_percent) || 0), 0)
  const budgetFor = pct => form.total_budget
    ? (parseFloat(form.total_budget) * pct / 100).toFixed(0) : '—'

  const addService = () => setServices(prev => [...prev, { category_key: '', budget_percent: '', extra_info: {} }])
  const removeService = i => setServices(prev => prev.filter((_, idx) => idx !== i))

  const updateService = (i, field, val) =>
    setServices(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s))

  const updateExtraInfo = (i, key, val) =>
    setServices(prev => prev.map((s, idx) => idx === i
      ? { ...s, extra_info: { ...s.extra_info, [key]: val } } : s))

  const evenSplit = () => {
    const pct = Math.floor(100 / services.length)
    const rem = 100 - pct * services.length
    setServices(prev => prev.map((s, i) => ({ ...s, budget_percent: i === 0 ? pct + rem : pct })))
  }

  const search = async e => {
    e.preventDefault()
    if (Math.abs(totalPct - 100) > 0.5) {
      toast.error(`Budget percentages must total 100% (currently ${totalPct.toFixed(1)}%)`)
      return
    }
    if (services.some(s => !s.category_key)) {
      toast.error('Select a category for each service row')
      return
    }
    setLoading(true); setPackages([])
    try {
      const payload = {
        event_date: form.event_date,
        total_budget: parseFloat(form.total_budget),
        attendee_count: parseInt(form.attendee_count),
        event_lat: parseFloat(form.event_lat),
        event_lng: parseFloat(form.event_lng),
        search_radius_km: parseFloat(form.search_radius_km),
        services: services.map(s => ({
          category_key: s.category_key,
          budget_percent: parseFloat(s.budget_percent),
          extra_info: Object.keys(s.extra_info || {}).length ? s.extra_info : null,
        })),
      }
      const { data } = await api.post('/planner', payload)
      setPackages(data)
      if (data.length === 0)
        toast('No vendor packages found within your budget. Try increasing your budget or radius.', { icon: '🔍' })
      else
        toast.success(`Found ${data.length} vendor package${data.length > 1 ? 's' : ''}!`)
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Search failed')
    }
    setLoading(false)
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="Event Budget Planner" onNotif={notifTick} />
        <div className="page" style={{ maxWidth: 1000 }}>
          <p className="page-title">Multi-Service Budget Planner</p>
          <p className="page-subtitle">
            Select all services for your event, set your total budget and allocation percentages,
            then discover vendor packages that fit within your budget — powered by Haversine geolocation.
          </p>

          {/* ── Budget planner form ── */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header"><span className="fw-600">Event & Budget Details</span></div>
            <div className="card-body">
              <form onSubmit={search}>
                {/* Row 1: date, budget, attendees, radius */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 16 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Event Date & Time *</label>
                    <input className="form-control" type="datetime-local" required
                      value={form.event_date} onChange={e => setForm(p => ({ ...p, event_date: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Total Budget (₦) *</label>
                    <input className="form-control" type="number" required placeholder="1000000"
                      value={form.total_budget} onChange={e => setForm(p => ({ ...p, total_budget: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Expected Attendees *</label>
                    <input className="form-control" type="number" required placeholder="100"
                      value={form.attendee_count} onChange={e => setForm(p => ({ ...p, attendee_count: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Search Radius (km)</label>
                    <input className="form-control" type="number" min={1} max={500}
                      value={form.search_radius_km} onChange={e => setForm(p => ({ ...p, search_radius_km: e.target.value }))} />
                  </div>
                </div>

                {/* Venue address */}
                <div className="form-group">
                  <label>Event Venue (auto-fills coordinates)</label>
                  <AddressAutocomplete
                    value={form.venue_address}
                    onChange={addr => setForm(p => ({ ...p, venue_address: addr }))}
                    onPlaceSelect={({ address, lat, lng }) => {
                      setForm(p => ({ ...p, venue_address: address, event_lat: lat.toFixed(6), event_lng: lng.toFixed(6) }))
                      toast.success('Venue location set!')
                    }}
                    placeholder="e.g. Landmark Centre, Victoria Island, Lagos"
                  />
                  <div className="flex gap-3 mt-1" style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                    <span>Lat: {form.event_lat}</span><span>Lng: {form.event_lng}</span>
                  </div>
                </div>

                {/* ── Service rows ── */}
                <div style={{ marginTop: 8 }}>
                  <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
                    <p className="fw-600">Services Required</p>
                    <div className="flex gap-2">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={evenSplit}>
                        ⚡ Split Evenly
                      </button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={addService}>
                        <Plus size={13} /> Add Service
                      </button>
                    </div>
                  </div>

                  {services.map((svc, i) => {
                    const catDef = categories.find(c => c.key === svc.category_key)
                    const allocated = svc.budget_percent && form.total_budget
                      ? parseFloat(form.total_budget) * parseFloat(svc.budget_percent) / 100
                      : null

                    return (
                      <div key={i} style={{ background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)',
                        borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 120px 120px auto', gap: 12, alignItems: 'end' }}>
                          {/* Category */}
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: 12 }}>Service Category *</label>
                            <select className="form-control" required value={svc.category_key}
                              onChange={e => {
                                updateService(i, 'category_key', e.target.value)
                                updateService(i, 'extra_info', {})
                              }}>
                              <option value="">— Select —</option>
                              {categories.map(c => (
                                <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
                              ))}
                            </select>
                          </div>

                          {/* % */}
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: 12 }}>Budget %</label>
                            <input className="form-control" type="number" min={1} max={100}
                              placeholder="e.g. 60" value={svc.budget_percent}
                              onChange={e => updateService(i, 'budget_percent', e.target.value)} />
                          </div>

                          {/* Allocated amount */}
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: 12 }}>Allocated</label>
                            <div style={{ padding: '8px 10px', background: '#fff', border: '1.5px solid var(--gray-200)',
                              borderRadius: 8, fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>
                              {allocated ? fmt(allocated) : '—'}
                            </div>
                          </div>

                          {/* Remove */}
                          <button type="button" className="btn btn-ghost btn-sm text-danger"
                            onClick={() => removeService(i)} disabled={services.length === 1}
                            style={{ marginBottom: 2 }}>
                            <Trash2 size={15} />
                          </button>
                        </div>

                        {/* Dynamic extra info fields */}
                        {catDef?.info_fields && (
                          <ExtraInfoFields
                            infoFields={catDef.info_fields}
                            values={svc.extra_info}
                            onChange={(key, val) => updateExtraInfo(i, key, val)}
                          />
                        )}
                      </div>
                    )
                  })}

                  {/* Budget summary bar */}
                  <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 10,
                    background: Math.abs(totalPct - 100) < 0.5 ? 'var(--green-lt)' : totalPct > 100 ? 'var(--red-lt)' : 'var(--amber-lt)',
                    border: `1.5px solid ${pctColor(totalPct)}` }}>
                    <div className="flex justify-between items-center">
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 700, color: pctColor(totalPct) }}>
                          Total Allocation: {totalPct.toFixed(1)}%
                        </span>
                        {Math.abs(totalPct - 100) > 0.5 && (
                          <span style={{ fontSize: 12, marginLeft: 8, color: pctColor(totalPct) }}>
                            {totalPct > 100 ? `Over by ${(totalPct - 100).toFixed(1)}%` : `${(100 - totalPct).toFixed(1)}% remaining`}
                          </span>
                        )}
                      </div>
                      {Math.abs(totalPct - 100) < 0.5 && (
                        <span style={{ color: 'var(--green)', fontWeight: 700 }}>✅ Ready to search!</span>
                      )}
                    </div>
                    {/* Visual bar */}
                    <div style={{ height: 6, background: 'rgba(0,0,0,.1)', borderRadius: 3, marginTop: 8 }}>
                      <div style={{ height: '100%', width: `${Math.min(totalPct, 100)}%`,
                        background: pctColor(totalPct), borderRadius: 3, transition: 'width .3s' }} />
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <button className="btn btn-primary btn-lg" type="submit" disabled={loading}>
                    <Search size={16} />
                    {loading ? 'Searching for vendor packages…' : 'Find Vendor Packages'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* ── Results ── */}
          {loading && (
            <div className="loading"><div className="spinner" /><span style={{ marginLeft: 12, color: 'var(--gray-500)' }}>
              Running MCDM matching across all vendors…</span></div>
          )}

          {packages.length > 0 && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <p className="section-title">{packages.length} Vendor Package{packages.length > 1 ? 's' : ''} Found</p>
                <p className="text-sm text-muted">
                  All packages are within your ₦{Number(form.total_budget).toLocaleString()} budget,
                  sorted by lowest total cost. Each vendor is available on the selected date.
                </p>
              </div>
              {packages.map(pkg => (
                <PackageCard key={pkg.package_number} pkg={pkg} events={events} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
