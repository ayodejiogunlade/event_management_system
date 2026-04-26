import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { eventsAPI, matchAPI, bookingsAPI, metaAPI } from '../api'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { useSocket } from '../hooks/useSocket'
import toast from 'react-hot-toast'
import { Search, MapPin, Star, DollarSign } from 'lucide-react'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const venueIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34],
})

function Stars({ rating }) {
  return <span>{[1,2,3,4,5].map(i => <span key={i} className="star">{i <= Math.round(rating) ? '★' : '☆'}</span>)}</span>
}

function priceSummary(svc) {
  if (!svc) return '—'
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

export default function Discover() {
  const [events, setEvents] = useState([])
  const [categories, setCategories] = useState([])
  const [results, setResults] = useState([])
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(false)
  const [notifTick, setNotifTick] = useState(0)
  useSocket(() => setNotifTick(t => t + 1))

  const [form, setForm] = useState({
    event_id: '', service_category: '',
    event_lat: '6.4281', event_lng: '3.4219',
    venue_address: '',
    search_radius_km: 50, budget: '',
    event_date: new Date().toISOString().slice(0, 16),
  })
  const [bookingModal, setBookingModal] = useState(null)
  const [bookingDetails, setBookingDetails] = useState('')
  const [guestCount, setGuestCount] = useState('')
  const [agreedPrice, setAgreedPrice] = useState('')
  const [sortBy, setSortBy] = useState('score')

  useEffect(() => {
    eventsAPI.list().then(r => setEvents(r.data)).catch(() => {})
    metaAPI.serviceCategories().then(r => setCategories(r.data)).catch(() => {})
  }, [])

  const onEventChange = e => {
    const ev = events.find(x => x.id === parseInt(e.target.value))
    if (ev) setForm(p => ({
      ...p, event_id: ev.id,
      event_lat: ev.location_lat || p.event_lat,
      event_lng: ev.location_lng || p.event_lng,
      venue_address: ev.location_address || p.venue_address,
      budget: ev.budget || p.budget,
      event_date: ev.event_date?.slice(0, 16) || p.event_date,
    }))
    else setForm(p => ({ ...p, event_id: '' }))
  }

  const search = async e => {
    e.preventDefault()
    if (!form.service_category) { toast.error('Select a service category'); return }
    setLoading(true); setResults([]); setSelected(null)
    try {
      const { data } = await matchAPI.match({
        service_category: form.service_category,
        event_date: form.event_date,
        budget: form.budget ? parseFloat(form.budget) : null,
        event_lat: parseFloat(form.event_lat),
        event_lng: parseFloat(form.event_lng),
        search_radius_km: parseFloat(form.search_radius_km),
      })
      setResults(data)
      if (data.length === 0) toast('No vendors found matching your criteria.', { icon: '🔍' })
      else toast.success(`Found ${data.length} matching vendor${data.length > 1 ? 's' : ''}!`)
    } catch { toast.error('Search failed') }
    setLoading(false)
  }

  const book = async () => {
    if (!form.event_id) { toast.error('Select an event first'); return }
    try {
      await bookingsAPI.create({
        event_id: parseInt(form.event_id),
        vendor_id: bookingModal.vendor.id,
        vendor_service_id: bookingModal.matched_service?.id || null,
        service_details: bookingDetails,
        guest_count: guestCount ? parseInt(guestCount) : null,
        agreed_price: agreedPrice ? parseFloat(agreedPrice) : null,
      })
      toast.success('Booking request sent!')
      setBookingModal(null); setBookingDetails(''); setGuestCount(''); setAgreedPrice('')
    } catch (err) { toast.error(err.response?.data?.detail || 'Booking failed') }
  }

  const sorted = [...results].sort((a, b) => {
    if (sortBy === 'score')    return b.composite_score - a.composite_score
    if (sortBy === 'distance') return a.distance_km - b.distance_km
    if (sortBy === 'rating')   return b.vendor.rating - a.vendor.rating
    return 0
  })

  const mapCenter = [parseFloat(form.event_lat) || 6.4281, parseFloat(form.event_lng) || 3.4219]

  // Auto-calculate price estimate for per-head services
  const estimatedPrice = bookingModal?.matched_service?.pricing_model === 'Per Head (Per Guest)' && guestCount
    ? (parseFloat(bookingModal.matched_service.price_per_head) * parseInt(guestCount)).toFixed(2)
    : null

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="Find Vendors" onNotif={notifTick} />
        <div className="page" style={{ maxWidth: 1400 }}>
          <p className="page-title">Vendor Discovery</p>
          <p className="page-subtitle">Real-time MCDM matching with Haversine geolocation across all 18 service categories</p>

          {/* Search Form */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-body">
              <form onSubmit={search}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Link to Event</label>
                    <select className="form-control" value={form.event_id} onChange={onEventChange}>
                      <option value="">— Select event —</option>
                      {events.filter(e => e.status === 'active').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Service Category *</label>
                    <select className="form-control" required value={form.service_category}
                      onChange={e => setForm(p => ({ ...p, service_category: e.target.value }))}>
                      <option value="">— All categories —</option>
                      {categories.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Event Date *</label>
                    <input className="form-control" type="datetime-local" required value={form.event_date}
                      onChange={e => setForm(p => ({ ...p, event_date: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Max Budget (₦)</label>
                    <input className="form-control" type="number" value={form.budget}
                      onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} placeholder="500000" />
                  </div>
                  <div className="form-group" style={{ margin: 0, gridColumn: 'span 2' }}>
                    <label>Venue Address (auto-fills coordinates)</label>
                    <AddressAutocomplete
                      value={form.venue_address}
                      onChange={addr => setForm(p => ({ ...p, venue_address: addr }))}
                      onPlaceSelect={({ address, lat, lng }) => {
                        setForm(p => ({ ...p, venue_address: address, event_lat: lat.toFixed(6), event_lng: lng.toFixed(6) }))
                        toast.success(`Venue set: ${lat.toFixed(4)}, ${lng.toFixed(4)}`)
                      }}
                      placeholder="e.g. Eko Hotel, Victoria Island, Lagos"
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Search Radius (km)</label>
                    <input className="form-control" type="number" value={form.search_radius_km}
                      onChange={e => setForm(p => ({ ...p, search_radius_km: e.target.value }))} min={1} max={500} />
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <button className="btn btn-primary btn-lg" type="submit" disabled={loading}>
                    <Search size={16} /> {loading ? 'Searching…' : 'Search Vendors'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: 20, alignItems: 'start' }}>
            {/* Results */}
            <div>
              {results.length > 0 && (
                <div className="flex justify-between items-center mb-3">
                  <span className="section-title" style={{ margin: 0 }}>{results.length} Vendors Found</span>
                  <div className="flex gap-2">
                    <span style={{ fontSize: 13, color: 'var(--gray-500)', alignSelf: 'center' }}>Sort:</span>
                    {['score', 'distance', 'rating'].map(s => (
                      <button key={s} className={`btn btn-sm ${sortBy === s ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setSortBy(s)} style={{ textTransform: 'capitalize' }}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sorted.map((r, i) => (
                  <div key={r.vendor.id}
                    className={`vendor-card ${selected?.vendor.id === r.vendor.id ? 'selected' : ''}`}
                    onClick={() => setSelected(r)}>
                    <div className="flex justify-between items-center">
                      <div style={{ flex: 1 }}>
                        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                          <span style={{ background: 'var(--blue)', color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>#{i + 1}</span>
                          <span className="vendor-name">{r.vendor.business_name}</span>
                          {r.vendor.is_verified && <span className="badge badge-green">✅ Verified</span>}
                        </div>
                        {/* Matched service highlight */}
                        {r.matched_service && (
                          <div style={{ marginTop: 8, background: 'var(--blue-pale)', borderRadius: 8, padding: '8px 12px' }}>
                            <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
                              <span className="badge badge-purple">{r.matched_service.category}</span>
                              <span className="fw-600 text-sm">{r.matched_service.service_name}</span>
                              <span className="badge badge-blue" style={{ fontSize: 10 }}>{r.matched_service.pricing_model}</span>
                            </div>
                            <div className="flex gap-3 mt-1" style={{ fontSize: 12, color: 'var(--gray-600)' }}>
                              <span>💰 {priceSummary(r.matched_service)}</span>
                              <span>💳 {r.matched_service.deposit_percent}% deposit</span>
                              {r.matched_service.vat_applicable && <span>🧾 +7.5% VAT</span>}
                            </div>
                            {r.matched_service.description && (
                              <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                                {r.matched_service.description.slice(0, 100)}{r.matched_service.description.length > 100 ? '…' : ''}
                              </p>
                            )}
                          </div>
                        )}
                        <div className="vendor-meta" style={{ marginTop: 8 }}>
                          <span><MapPin size={12} /> {r.distance_km} km away</span>
                          <span><Star size={12} /> <Stars rating={r.vendor.rating} /> ({r.vendor.rating_count})</span>
                          <span>📍 {r.vendor.location?.address?.slice(0, 30) || 'Location set'}</span>
                        </div>
                        <div className="score-bar mt-2"><div className="score-fill" style={{ width: `${r.composite_score * 100}%` }} /></div>
                      </div>
                      <div style={{ marginLeft: 20, textAlign: 'right', flexShrink: 0 }}>
                        <div className="vendor-score">{(r.composite_score * 100).toFixed(0)}<span>Match %</span></div>
                        <button className="btn btn-primary btn-sm mt-2"
                          onClick={e => { e.stopPropagation(); setBookingModal(r) }}>
                          Book Now
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {!loading && results.length === 0 && (
                  <div className="empty-state card" style={{ padding: 60 }}>
                    <div className="icon">🔍</div>
                    <p>Select a service category and click Search to discover vendors near your venue</p>
                  </div>
                )}
              </div>
            </div>

            {/* Map */}
            <div style={{ position: 'sticky', top: 76 }}>
              <p className="section-title">Vendor Map</p>
              <div className="map-container">
                <MapContainer center={mapCenter} zoom={11} style={{ height: '100%', width: '100%' }}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>' />
                  <Marker position={mapCenter} icon={venueIcon}>
                    <Popup><strong>📍 Event Venue</strong><br />{form.venue_address || `${mapCenter[0]}, ${mapCenter[1]}`}</Popup>
                  </Marker>
                  <Circle center={mapCenter} radius={parseFloat(form.search_radius_km) * 1000}
                    color="var(--blue)" fillColor="var(--blue)" fillOpacity={0.05} />
                  {results.map(r => r.vendor.location && (
                    <Marker key={r.vendor.id}
                      position={[parseFloat(r.vendor.location.latitude), parseFloat(r.vendor.location.longitude)]}>
                      <Popup>
                        <strong>{r.vendor.business_name}</strong><br />
                        {r.matched_service?.service_name}<br />
                        📍 {r.distance_km} km · ⭐ {r.vendor.rating.toFixed(1)}<br />
                        💰 {priceSummary(r.matched_service)}<br />
                        Match: {(r.composite_score * 100).toFixed(0)}%
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Booking Modal */}
      {bookingModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setBookingModal(null)}>
          <div className="modal">
            <div className="modal-header">
              <h2>Book {bookingModal.vendor.business_name}</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setBookingModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {bookingModal.matched_service && (
                <div style={{ background: 'var(--blue-pale)', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13 }}>
                  <div className="fw-600 mb-3">{bookingModal.matched_service.service_name}</div>
                  <div className="flex gap-3 flex-wrap">
                    <span className="badge badge-purple">{bookingModal.matched_service.category}</span>
                    <span className="badge badge-blue">{bookingModal.matched_service.pricing_model}</span>
                    <span style={{ fontWeight: 700, color: 'var(--green)' }}>{priceSummary(bookingModal.matched_service)}</span>
                    <span>Deposit: {bookingModal.matched_service.deposit_percent}%</span>
                    {bookingModal.matched_service.vat_applicable && <span>+7.5% VAT</span>}
                  </div>
                  {bookingModal.matched_service.description && (
                    <p style={{ marginTop: 8, color: 'var(--gray-600)' }}>{bookingModal.matched_service.description}</p>
                  )}
                </div>
              )}
              <div className="form-group">
                <label>Link to Event *</label>
                <select className="form-control" value={form.event_id}
                  onChange={e => setForm(p => ({ ...p, event_id: e.target.value }))}>
                  <option value="">— Select event —</option>
                  {events.filter(e => e.status === 'active').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              {bookingModal.matched_service?.pricing_model === 'Per Head (Per Guest)' && (
                <div className="form-group">
                  <label>Number of Guests *</label>
                  <input className="form-control" type="number" value={guestCount}
                    onChange={e => setGuestCount(e.target.value)} placeholder="e.g. 200" min={bookingModal.matched_service.min_guests || 1} />
                  {estimatedPrice && (
                    <p className="form-hint" style={{ color: 'var(--green)', fontWeight: 600, marginTop: 6 }}>
                      Estimated total: ₦{Number(estimatedPrice).toLocaleString()}
                      {bookingModal.matched_service.vat_applicable && ` + ₦${(estimatedPrice * 0.075).toFixed(0)} VAT`}
                    </p>
                  )}
                </div>
              )}
              {bookingModal.matched_service?.pricing_model === 'Fixed Fee / Package' && (
                <div className="form-group">
                  <label>Agreed Price (₦)</label>
                  <input className="form-control" type="number" value={agreedPrice || bookingModal.matched_service.fixed_price}
                    onChange={e => setAgreedPrice(e.target.value)} />
                </div>
              )}
              <div className="form-group">
                <label>Service Details / Requirements</label>
                <textarea className="form-control" value={bookingDetails} onChange={e => setBookingDetails(e.target.value)}
                  placeholder="Describe your specific requirements, menu preferences, timing…" />
              </div>
              <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setBookingModal(null)}>Cancel</button>
                <button className="btn btn-primary" onClick={book}>Send Booking Request</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
