import { useState, useEffect } from 'react';
import { vendorsAPI } from '../api';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { useSocket } from '../hooks/useSocket';
import toast from 'react-hot-toast';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const SERVICE_TYPES = ['Catering','Decoration','Photography','Sound Engineering','Transportation','Security','Other'];

function MapPicker({ lat, lng, onChange }) {
  function Inner() {
    useMapEvents({ click: e => onChange(e.latlng.lat, e.latlng.lng) });
    return null;
  }
  return (
    <div className="map-container" style={{ height: 280 }}>
      <MapContainer center={[lat || 6.5, lng || 3.4]} zoom={11} style={{ height: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Inner />
        {lat && lng && <Marker position={[lat, lng]} />}
      </MapContainer>
    </div>
  );
}

export default function VendorProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notifTick, setNotifTick] = useState(0);
  useSocket(() => setNotifTick(t => t + 1));

  const [form, setForm] = useState({
    business_name: '', service_type: 'Catering', description: '',
    pricing: '', service_radius_km: 50,
    location: { address: '', latitude: 6.4281, longitude: 3.4219 },
  });

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await vendorsAPI.myProfile();
      setProfile(data);
      setForm({
        business_name: data.business_name,
        service_type: data.service_type,
        description: data.description || '',
        pricing: data.pricing || '',
        service_radius_km: data.service_radius_km,
        location: data.location ? {
          address: data.location.address || '',
          latitude: parseFloat(data.location.latitude),
          longitude: parseFloat(data.location.longitude),
        } : { address: '', latitude: 6.4281, longitude: 3.4219 },
      });
    } catch { /* no profile yet */ }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async e => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        pricing: form.pricing ? parseFloat(form.pricing) : null,
        service_radius_km: parseFloat(form.service_radius_km),
      };
      if (profile) await vendorsAPI.update(payload);
      else await vendorsAPI.create(payload);
      toast.success(profile ? 'Profile updated!' : 'Vendor profile created! Awaiting admin verification.');
      load();
    } catch (err) { toast.error(err.response?.data?.detail || 'Save failed'); }
    setSaving(false);
  };

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));
  const fl = k => e => setForm(p => ({ ...p, location: { ...p.location, [k]: e.target.value } }));

  if (loading) return <div className="app-shell"><Sidebar /><div className="main-content"><div className="loading"><div className="spinner" /></div></div></div>;

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="Vendor Profile" onNotif={notifTick} />
        <div className="page">
          <p className="page-title">{profile ? 'My Vendor Profile' : 'Create Vendor Profile'}</p>
          <p className="page-subtitle">{profile ? 'Update your service information and location' : 'Set up your profile to start receiving bookings'}</p>

          {profile && (
            <div className={`card mb-3`} style={{ marginBottom: 20 }}>
              <div className="card-body" style={{ padding: '14px 20px' }}>
                <div className="flex items-center gap-3">
                  <span style={{ fontSize: 32 }}>🏪</span>
                  <div>
                    <p className="fw-600">{profile.business_name}</p>
                    <div className="flex gap-2 mt-1">
                      <span className="badge badge-purple">{profile.service_type}</span>
                      {profile.is_verified
                        ? <span className="badge badge-green">✅ Verified</span>
                        : <span className="badge badge-amber">⏳ Awaiting Verification</span>}
                      <span className={`badge ${profile.availability_status ? 'badge-green' : 'badge-gray'}`}>
                        {profile.availability_status ? '● Available' : '○ Unavailable'}
                      </span>
                      <span className="badge badge-blue">⭐ {profile.rating.toFixed(1)} ({profile.rating_count} reviews)</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div className="card">
              <div className="card-header"><span className="fw-600">Business Information</span></div>
              <div className="card-body">
                <form onSubmit={save}>
                  <div className="form-group">
                    <label>Business Name *</label>
                    <input className="form-control" required value={form.business_name} onChange={f('business_name')} placeholder="ABC Catering Services" />
                  </div>
                  <div className="form-group">
                    <label>Service Type *</label>
                    <select className="form-control" value={form.service_type} onChange={f('service_type')}>
                      {SERVICE_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea className="form-control" value={form.description} onChange={f('description')} placeholder="Describe your services…" />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Base Price (₦)</label>
                      <input className="form-control" type="number" value={form.pricing} onChange={f('pricing')} placeholder="150000" />
                    </div>
                    <div className="form-group">
                      <label>Service Radius (km)</label>
                      <input className="form-control" type="number" value={form.service_radius_km} onChange={f('service_radius_km')} min={1} />
                    </div>
                  </div>
                  {profile && (
                    <div className="form-group">
                      <label>Availability</label>
                      <select className="form-control" value={form.availability_status ? 'true' : 'false'}
                        onChange={e => setForm(p => ({ ...p, availability_status: e.target.value === 'true' }))}>
                        <option value="true">Available</option>
                        <option value="false">Unavailable</option>
                      </select>
                    </div>
                  )}
                  <button className="btn btn-primary w-100" type="submit" disabled={saving}>
                    {saving ? 'Saving…' : profile ? 'Update Profile' : 'Create Profile'}
                  </button>
                </form>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><span className="fw-600">Service Location</span></div>
              <div className="card-body">
                <div className="form-group">
                  <label>Business Address</label>
                  <input className="form-control" value={form.location.address} onChange={fl('address')} placeholder="Street, City, State" />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Latitude</label>
                    <input className="form-control" type="number" step="any" value={form.location.latitude}
                      onChange={e => setForm(p => ({ ...p, location: { ...p.location, latitude: parseFloat(e.target.value) } }))} />
                  </div>
                  <div className="form-group">
                    <label>Longitude</label>
                    <input className="form-control" type="number" step="any" value={form.location.longitude}
                      onChange={e => setForm(p => ({ ...p, location: { ...p.location, longitude: parseFloat(e.target.value) } }))} />
                  </div>
                </div>
                <p className="form-hint mb-3">Click on the map to set your location precisely</p>
                <MapPicker
                  lat={form.location.latitude}
                  lng={form.location.longitude}
                  onChange={(lat, lng) => setForm(p => ({ ...p, location: { ...p.location, latitude: lat, longitude: lng } }))}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
