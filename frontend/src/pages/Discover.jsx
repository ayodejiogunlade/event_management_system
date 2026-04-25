import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { eventsAPI, matchAPI, bookingsAPI } from '../api';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { useSocket } from '../hooks/useSocket';
import toast from 'react-hot-toast';
import { Search, MapPin, Star, DollarSign } from 'lucide-react';

// Fix leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const venueIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25,41], iconAnchor: [12,41], popupAnchor: [1,-34],
});

const SERVICE_TYPES = ['Catering','Decoration','Photography','Sound Engineering','Transportation','Security','Other'];

function Stars({ rating }) {
  return <span>{[1,2,3,4,5].map(i => <span key={i} className="star">{i <= Math.round(rating) ? '★' : '☆'}</span>)}</span>;
}

export default function Discover() {
  const [events, setEvents] = useState([]);
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notifTick, setNotifTick] = useState(0);
  useSocket(() => setNotifTick(t => t + 1));

  const [form, setForm] = useState({
    event_id: '', service_type: 'Catering',
    event_lat: '6.4281', event_lng: '3.4219',
    search_radius_km: 50, budget: '',
    event_date: new Date().toISOString().slice(0,16),
  });

  const [bookingModal, setBookingModal] = useState(null);
  const [bookingDetails, setBookingDetails] = useState('');
  const [sortBy, setSortBy] = useState('score');

  useEffect(() => {
    eventsAPI.list().then(r => setEvents(r.data)).catch(() => {});
  }, []);

  const onEventChange = e => {
    const ev = events.find(x => x.id === parseInt(e.target.value));
    if (ev) {
      setForm(p => ({
        ...p, event_id: ev.id,
        event_lat: ev.location_lat || p.event_lat,
        event_lng: ev.location_lng || p.event_lng,
        budget: ev.budget || p.budget,
        event_date: ev.event_date?.slice(0,16) || p.event_date,
      }));
    } else setForm(p => ({ ...p, event_id: '' }));
  };

  const search = async e => {
    e.preventDefault();
    setLoading(true); setResults([]); setSelected(null);
    try {
      const { data } = await matchAPI.match({
        service_type: form.service_type,
        event_date: form.event_date,
        budget: form.budget ? parseFloat(form.budget) : null,
        event_lat: parseFloat(form.event_lat),
        event_lng: parseFloat(form.event_lng),
        search_radius_km: parseFloat(form.search_radius_km),
      });
      setResults(data);
      if (data.length === 0) toast('No vendors found matching your criteria.', { icon: '🔍' });
      else toast.success(`Found ${data.length} matching vendor${data.length > 1 ? 's' : ''}!`);
    } catch (err) { toast.error('Search failed'); }
    setLoading(false);
  };

  const book = async () => {
    if (!form.event_id) { toast.error('Select an event first'); return; }
    try {
      await bookingsAPI.create({ event_id: parseInt(form.event_id), vendor_id: bookingModal.vendor.id, service_details: bookingDetails });
      toast.success('Booking request sent!');
      setBookingModal(null); setBookingDetails('');
    } catch (err) { toast.error(err.response?.data?.detail || 'Booking failed'); }
  };

  const sorted = [...results].sort((a, b) => {
    if (sortBy === 'score')    return b.composite_score - a.composite_score;
    if (sortBy === 'distance') return a.distance_km - b.distance_km;
    if (sortBy === 'price')    return (a.vendor.pricing||0) - (b.vendor.pricing||0);
    if (sortBy === 'rating')   return b.vendor.rating - a.vendor.rating;
    return 0;
  });

  const mapCenter = [parseFloat(form.event_lat) || 6.4281, parseFloat(form.event_lng) || 3.4219];

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="Find Vendors" onNotif={notifTick} />
        <div className="page" style={{ maxWidth: 1400 }}>
          <p className="page-title">Vendor Discovery</p>
          <p className="page-subtitle">Find and book the perfect vendors for your event using real-time matching</p>

          {/* Search Form */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-body">
              <form onSubmit={search}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Link to Event</label>
                    <select className="form-control" value={form.event_id} onChange={onEventChange}>
                      <option value="">— Select event —</option>
                      {events.filter(e => e.status === 'active').map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Service Type *</label>
                    <select className="form-control" value={form.service_type} onChange={e => setForm(p => ({ ...p, service_type: e.target.value }))}>
                      {SERVICE_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Event Date *</label>
                    <input className="form-control" type="datetime-local" value={form.event_date} onChange={e => setForm(p => ({ ...p, event_date: e.target.value }))} required />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Max Budget (₦)</label>
                    <input className="form-control" type="number" value={form.budget} onChange={e => setForm(p => ({ ...p, budget: e.target.value }))} placeholder="500000" />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Venue Latitude</label>
                    <input className="form-control" type="number" step="any" value={form.event_lat} onChange={e => setForm(p => ({ ...p, event_lat: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Venue Longitude</label>
                    <input className="form-control" type="number" step="any" value={form.event_lng} onChange={e => setForm(p => ({ ...p, event_lng: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Search Radius (km)</label>
                    <input className="form-control" type="number" value={form.search_radius_km} onChange={e => setForm(p => ({ ...p, search_radius_km: e.target.value }))} min={1} max={500} />
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
                    {['score','distance','price','rating'].map(s => (
                      <button key={s} className={`btn btn-sm ${sortBy === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSortBy(s)} style={{ textTransform: 'capitalize' }}>{s}</button>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {sorted.map((r, i) => (
                  <div key={r.vendor.id} className={`vendor-card ${selected?.vendor.id === r.vendor.id ? 'selected' : ''}`}
                    onClick={() => setSelected(r)}>
                    <div className="flex justify-between items-center">
                      <div style={{ flex: 1 }}>
                        <div className="flex items-center gap-2">
                          <span style={{ background: 'var(--blue)', color: '#fff', borderRadius: 6, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>#{i+1}</span>
                          <span className="vendor-name">{r.vendor.business_name}</span>
                          {r.vendor.is_verified && <span className="badge badge-green">✅ Verified</span>}
                        </div>
                        <div className="vendor-meta">
                          <span><MapPin size={12} /> {r.distance_km} km away</span>
                          {r.vendor.pricing && <span><DollarSign size={12} /> ₦{Number(r.vendor.pricing).toLocaleString()}</span>}
                          <span><Star size={12} /> <Stars rating={r.vendor.rating} /> ({r.vendor.rating_count})</span>
                          <span className="badge badge-purple">{r.vendor.service_type}</span>
                        </div>
                        {r.vendor.description && <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 6 }}>{r.vendor.description.slice(0,120)}{r.vendor.description.length>120?'…':''}</p>}
                        <div className="score-bar mt-2"><div className="score-fill" style={{ width: `${r.composite_score * 100}%` }} /></div>
                      </div>
                      <div style={{ marginLeft: 20, textAlign: 'right', flexShrink: 0 }}>
                        <div className="vendor-score">{(r.composite_score * 100).toFixed(0)}<span>Match Score</span></div>
                        <button className="btn btn-primary btn-sm mt-2"
                          onClick={e => { e.stopPropagation(); setBookingModal(r); }}>
                          Book Now
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {!loading && results.length === 0 && (
                  <div className="empty-state card" style={{ padding: 60 }}>
                    <div className="icon">🔍</div>
                    <p>Run a search to discover vendors near your event venue</p>
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
                  {/* Venue marker */}
                  <Marker position={mapCenter} icon={venueIcon}>
                    <Popup><strong>📍 Event Venue</strong><br/>Lat: {mapCenter[0]}<br/>Lng: {mapCenter[1]}</Popup>
                  </Marker>
                  {/* Search radius */}
                  <Circle center={mapCenter} radius={parseFloat(form.search_radius_km)*1000}
                    color="var(--blue)" fillColor="var(--blue)" fillOpacity={0.05} />
                  {/* Vendor markers */}
                  {results.map(r => r.vendor.location && (
                    <Marker key={r.vendor.id}
                      position={[parseFloat(r.vendor.location.latitude), parseFloat(r.vendor.location.longitude)]}>
                      <Popup>
                        <strong>{r.vendor.business_name}</strong><br/>
                        {r.vendor.service_type}<br/>
                        📍 {r.distance_km} km away<br/>
                        ⭐ {r.vendor.rating.toFixed(1)} | Score: {(r.composite_score*100).toFixed(0)}%
                        {r.vendor.pricing && <><br/>₦{Number(r.vendor.pricing).toLocaleString()}</>}
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
              {selected && (
                <div className="card" style={{ marginTop: 12 }}>
                  <div className="card-body" style={{ padding: 16 }}>
                    <p className="fw-600">{selected.vendor.business_name}</p>
                    <p className="text-sm text-muted mt-1">{selected.vendor.service_type} · {selected.distance_km} km · ₦{Number(selected.vendor.pricing||0).toLocaleString()}</p>
                    <button className="btn btn-primary w-100 mt-2" onClick={() => setBookingModal(selected)}>Book This Vendor</button>
                  </div>
                </div>
              )}
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
              <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13 }}>
                <div className="flex gap-3 flex-wrap">
                  <span>🏪 {bookingModal.vendor.service_type}</span>
                  <span>📍 {bookingModal.distance_km} km</span>
                  {bookingModal.vendor.pricing && <span>₦{Number(bookingModal.vendor.pricing).toLocaleString()}</span>}
                  <span>⭐ {bookingModal.vendor.rating.toFixed(1)}</span>
                </div>
              </div>
              <div className="form-group">
                <label>Link to Event *</label>
                <select className="form-control" value={form.event_id} onChange={e => setForm(p=>({...p, event_id:e.target.value}))}>
                  <option value="">— Select event —</option>
                  {events.filter(e=>e.status==='active').map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Service Details / Notes</label>
                <textarea className="form-control" value={bookingDetails} onChange={e=>setBookingDetails(e.target.value)}
                  placeholder="Describe your specific requirements…" />
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
  );
}
