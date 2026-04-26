import { useState, useEffect } from 'react'
import { vendorsAPI, metaAPI } from '../api'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'
import { useSocket } from '../hooks/useSocket'
import AddressAutocomplete from '../components/AddressAutocomplete'
import toast from 'react-hot-toast'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Plus, Edit2, Trash2, X } from 'lucide-react'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

function MapPicker({ lat, lng, onChange }) {
  function Inner() {
    useMapEvents({ click: e => onChange(e.latlng.lat, e.latlng.lng) })
    return null
  }
  const center = [lat || 6.5, lng || 3.4]
  return (
    <div className="map-container" style={{ height: 240 }}>
      <MapContainer center={center} zoom={12} style={{ height: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Inner />
        {lat && lng && <Marker position={[lat, lng]} />}
      </MapContainer>
    </div>
  )
}

// ── Pricing field hints ────────────────────────────────────────────────────────
const PM_HINTS = {
  fixed_fee:   'Client pays one flat price regardless of guest count.',
  per_head:    'Billed per guest: price × attendee count.',
  percentage:  'A % of total event budget — standard for planners (10–20%).',
  hourly:      'Charged per hour or as a day rate. Set minimum hours for a base fee.',
}

// ── Service Modal (fully controlled, no crashes) ──────────────────────────────
function ServiceModal({ svc, categories, pricingModels, onClose, onSaved, limitReached }) {
  const editing = !!svc?.id

  const [fields, setFields] = useState({
    service_name:      svc?.service_name      || '',
    category_key:      svc?.category_key      || '',
    description:       svc?.description       || '',
    pricing_model_key: svc?.pricing_model_key || 'fixed_fee',
    fixed_price:       svc?.fixed_price       != null ? String(svc.fixed_price) : '',
    price_per_head:    svc?.price_per_head    != null ? String(svc.price_per_head) : '',
    min_guests:        svc?.min_guests        != null ? String(svc.min_guests) : '',
    percentage_rate:   svc?.percentage_rate   != null ? String(svc.percentage_rate) : '',
    hourly_rate:       svc?.hourly_rate       != null ? String(svc.hourly_rate) : '',
    min_hours:         svc?.min_hours         != null ? String(svc.min_hours) : '',
    deposit_percent:   svc?.deposit_percent   != null ? String(svc.deposit_percent) : '50',
    vat_applicable:    svc?.vat_applicable    != null ? svc.vat_applicable : true,
  })
  const [extraInfo, setExtraInfo] = useState(svc?.extra_info || {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k, v) => setFields(p => ({ ...p, [k]: v }))

  const catDef = categories.find(c => c.key === fields.category_key)
  const pm = fields.pricing_model_key

  const save = async e => {
    e.preventDefault()
    setError('')
    if (!fields.service_name.trim()) { setError('Service name is required.'); return }
    if (!fields.category_key) { setError('Please select a category.'); return }
    if (pm === 'fixed_fee' && !fields.fixed_price) { setError('Enter the fixed price.'); return }
    if (pm === 'per_head' && !fields.price_per_head) { setError('Enter the price per guest.'); return }
    if (pm === 'percentage' && !fields.percentage_rate) { setError('Enter the percentage rate.'); return }
    if (pm === 'hourly' && !fields.hourly_rate) { setError('Enter the hourly rate.'); return }

    setSaving(true)
    try {
      const payload = {
        service_name:      fields.service_name.trim(),
        category_key:      fields.category_key,
        description:       fields.description || null,
        pricing_model_key: fields.pricing_model_key,
        fixed_price:       fields.fixed_price       ? parseFloat(fields.fixed_price)     : null,
        price_per_head:    fields.price_per_head    ? parseFloat(fields.price_per_head)  : null,
        min_guests:        fields.min_guests        ? parseInt(fields.min_guests)        : null,
        percentage_rate:   fields.percentage_rate   ? parseFloat(fields.percentage_rate) : null,
        hourly_rate:       fields.hourly_rate       ? parseFloat(fields.hourly_rate)     : null,
        min_hours:         fields.min_hours         ? parseFloat(fields.min_hours)       : null,
        deposit_percent:   fields.deposit_percent   ? parseFloat(fields.deposit_percent) : 50,
        vat_applicable:    fields.vat_applicable,
        extra_info:        Object.keys(extraInfo).length ? extraInfo : null,
      }
      if (editing) await vendorsAPI.updateService(svc.id, payload)
      else         await vendorsAPI.addService(payload)
      toast.success(editing ? 'Service updated!' : 'Service added!')
      onSaved()
    } catch (err) {
      setError(err.response?.data?.detail || 'Save failed. Please check your inputs.')
    }
    setSaving(false)
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-header" style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 10, paddingBottom: 12 }}>
          <h2>{editing ? 'Edit Service' : 'Add New Service'}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          {error && (
            <div style={{ background: 'var(--red-lt)', border: '1px solid var(--red)', borderRadius: 8,
              padding: '10px 14px', marginBottom: 16, color: 'var(--red)', fontSize: 13 }}>
              ⚠️ {error}
            </div>
          )}
          <form onSubmit={save} noValidate>
            {/* Name + Category */}
            <div className="form-row">
              <div className="form-group">
                <label>Service Name *</label>
                <input className="form-control" value={fields.service_name}
                  onChange={e => set('service_name', e.target.value)}
                  placeholder="e.g. Full Wedding Catering Package" />
              </div>
              <div className="form-group">
                <label>Category *</label>
                <select className="form-control" value={fields.category_key}
                  onChange={e => { set('category_key', e.target.value); setExtraInfo({}) }}>
                  <option value="">— Select —</option>
                  {categories.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea className="form-control" rows={2} value={fields.description}
                onChange={e => set('description', e.target.value)}
                placeholder="What does this service include?" />
            </div>

            {/* Pricing model */}
            <div className="form-group">
              <label>Pricing Model *</label>
              <select className="form-control" value={fields.pricing_model_key}
                onChange={e => set('pricing_model_key', e.target.value)}>
                {pricingModels.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              <p className="form-hint" style={{ color: 'var(--blue)', marginTop: 6 }}>
                ℹ️ {PM_HINTS[pm] || pricingModels.find(p => p.key === pm)?.description}
              </p>
            </div>

            {/* Dynamic price fields */}
            {pm === 'fixed_fee' && (
              <div className="form-group">
                <label>Fixed Price (₦) *</label>
                <input className="form-control" type="number" min={0}
                  value={fields.fixed_price} onChange={e => set('fixed_price', e.target.value)}
                  placeholder="e.g. 350000" />
              </div>
            )}
            {pm === 'per_head' && (
              <div className="form-row">
                <div className="form-group">
                  <label>Price Per Guest (₦) *</label>
                  <input className="form-control" type="number" min={0}
                    value={fields.price_per_head} onChange={e => set('price_per_head', e.target.value)}
                    placeholder="e.g. 8500" />
                </div>
                <div className="form-group">
                  <label>Minimum Guests</label>
                  <input className="form-control" type="number" min={1}
                    value={fields.min_guests} onChange={e => set('min_guests', e.target.value)}
                    placeholder="e.g. 50" />
                </div>
              </div>
            )}
            {pm === 'percentage' && (
              <div className="form-group">
                <label>Percentage of Budget (%) *</label>
                <input className="form-control" type="number" step="0.5" min={1} max={30}
                  value={fields.percentage_rate} onChange={e => set('percentage_rate', e.target.value)}
                  placeholder="e.g. 15" />
                <p className="form-hint">Industry norm: 10–20% for planners/agencies</p>
              </div>
            )}
            {pm === 'hourly' && (
              <div className="form-row">
                <div className="form-group">
                  <label>Hourly / Day Rate (₦) *</label>
                  <input className="form-control" type="number" min={0}
                    value={fields.hourly_rate} onChange={e => set('hourly_rate', e.target.value)}
                    placeholder="e.g. 50000" />
                </div>
                <div className="form-group">
                  <label>Minimum Hours</label>
                  <input className="form-control" type="number" step="0.5" min={0}
                    value={fields.min_hours} onChange={e => set('min_hours', e.target.value)}
                    placeholder="e.g. 4" />
                </div>
              </div>
            )}

            {/* Deposit + VAT */}
            <div className="form-row">
              <div className="form-group">
                <label>Required Deposit (%)</label>
                <select className="form-control" value={fields.deposit_percent}
                  onChange={e => set('deposit_percent', e.target.value)}>
                  {[25, 50, 60, 70, 80, 100].map(v => <option key={v} value={v}>{v}%</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>VAT (7.5%)</label>
                <select className="form-control" value={fields.vat_applicable ? 'true' : 'false'}
                  onChange={e => set('vat_applicable', e.target.value === 'true')}>
                  <option value="true">Yes — VAT applies</option>
                  <option value="false">No — VAT exempt</option>
                </select>
              </div>
            </div>

            {/* Service-specific extra info fields */}
            {catDef?.info_fields?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p className="fw-600" style={{ fontSize: 13, marginBottom: 10 }}>
                  {catDef.icon} {catDef.label} — Specific Details
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
                  padding: 14, background: 'var(--gray-50)', borderRadius: 8 }}>
                  {catDef.info_fields.map(f => (
                    <div key={f.name}>
                      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                        {f.label}{f.unit ? ` (${f.unit})` : ''}
                      </label>
                      {f.type === 'select' ? (
                        <select className="form-control" value={extraInfo[f.name] || ''}
                          onChange={e => setExtraInfo(p => ({ ...p, [f.name]: e.target.value }))}>
                          <option value="">— Select —</option>
                          {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input className="form-control" type={f.type || 'text'}
                          placeholder={f.placeholder || ''}
                          value={extraInfo[f.name] || ''}
                          onChange={e => setExtraInfo(p => ({ ...p, [f.name]: e.target.value }))} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Update Service' : 'Add Service'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

// ── Price summary helper ───────────────────────────────────────────────────────
function priceSummary(svc) {
  if (svc.pricing_model_key === 'fixed_fee' && svc.fixed_price)
    return `₦${Number(svc.fixed_price).toLocaleString()} fixed`
  if (svc.pricing_model_key === 'per_head' && svc.price_per_head)
    return `₦${Number(svc.price_per_head).toLocaleString()}/guest`
  if (svc.pricing_model_key === 'percentage' && svc.percentage_rate)
    return `${svc.percentage_rate}% of budget`
  if (svc.pricing_model_key === 'hourly' && svc.hourly_rate)
    return `₦${Number(svc.hourly_rate).toLocaleString()}/hr`
  return '—'
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function VendorProfile() {
  const [profile, setProfile] = useState(null)
  const [categories, setCategories] = useState([])
  const [pricingModels, setPricingModels] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showSvcModal, setShowSvcModal] = useState(false)
  const [editingSvc, setEditingSvc] = useState(null)
  const [notifTick, setNotifTick] = useState(0)
  useSocket(() => setNotifTick(t => t + 1))

  const emptyForm = { business_name: '', description: '', service_radius_km: 50,
    availability_status: true, location: { address: '', latitude: 6.4281, longitude: 3.4219 } }
  const [form, setForm] = useState(emptyForm)

  const load = async () => {
    setLoading(true)
    try {
      const [cats, pms] = await Promise.all([metaAPI.serviceCategories(), metaAPI.pricingModels()])
      setCategories(cats.data || [])
      setPricingModels(pms.data || [])
    } catch { setCategories([]); setPricingModels([]) }

    try {
      const { data } = await vendorsAPI.myProfile()
      setProfile(data)
      setForm({
        business_name:      data.business_name,
        description:        data.description || '',
        service_radius_km:  data.service_radius_km,
        availability_status: data.availability_status,
        location: data.location ? {
          address:   data.location.address || '',
          latitude:  parseFloat(data.location.latitude),
          longitude: parseFloat(data.location.longitude),
        } : { address: '', latitude: 6.4281, longitude: 3.4219 },
      })
    } catch { /* no profile */ }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const saveProfile = async e => {
    e.preventDefault(); setSaving(true)
    try {
      const payload = { ...form, service_radius_km: parseFloat(form.service_radius_km) }
      if (profile) await vendorsAPI.update(payload)
      else         await vendorsAPI.create(payload)
      toast.success(profile ? 'Profile updated!' : 'Profile created! Awaiting admin verification.')
      load()
    } catch (err) { toast.error(err.response?.data?.detail || 'Save failed') }
    setSaving(false)
  }

  const deleteService = async id => {
    if (!window.confirm('Remove this service?')) return
    try { await vendorsAPI.deleteService(id); toast.success('Service removed'); load() }
    catch { toast.error('Failed to remove service') }
  }

  const openAdd  = () => { setEditingSvc(null); setShowSvcModal(true) }
  const openEdit = svc => { setEditingSvc(svc); setShowSvcModal(true) }
  const closeModal = () => { setShowSvcModal(false); setEditingSvc(null) }
  const onSaved   = () => { closeModal(); load() }

  const services    = profile?.services?.filter(s => s.is_active) || []
  const limitReached = profile && profile.service_limit !== -1 && services.length >= profile.service_limit

  if (loading) return (
    <div className="app-shell"><Sidebar />
      <div className="main-content"><div className="loading"><div className="spinner" /></div></div>
    </div>
  )

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="Vendor Profile" onNotif={notifTick} />
        <div className="page">
          <p className="page-title">{profile ? 'My Vendor Profile' : 'Create Vendor Profile'}</p>
          <p className="page-subtitle">Manage your business info, location, and service listings</p>

          {/* Status banner */}
          {profile && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-body" style={{ padding: '14px 20px' }}>
                <div className="flex items-center gap-3" style={{ flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 32 }}>🏪</span>
                  <div style={{ flex: 1 }}>
                    <p className="fw-600">{profile.business_name}</p>
                    <div className="flex gap-2 mt-1" style={{ flexWrap: 'wrap' }}>
                      {profile.is_verified
                        ? <span className="badge badge-green">✅ Verified</span>
                        : <span className="badge badge-amber">⏳ Awaiting Verification</span>}
                      <span className={`badge ${profile.availability_status ? 'badge-green' : 'badge-gray'}`}>
                        {profile.availability_status ? '● Available' : '○ Unavailable'}
                      </span>
                      <span className="badge badge-blue">⭐ {profile.rating.toFixed(1)}</span>
                      <span className="badge badge-purple">
                        Services: {services.length} / {profile.service_limit === -1 ? '∞' : profile.service_limit}
                      </span>
                    </div>
                  </div>
                  {limitReached && (
                    <div style={{ fontSize: 12, color: 'var(--amber)', background: 'var(--amber-lt)',
                      padding: '6px 12px', borderRadius: 8 }}>
                      ⚠️ Limit reached. Contact admin to upgrade.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
            {/* Business info */}
            <div className="card">
              <div className="card-header"><span className="fw-600">Business Information</span></div>
              <div className="card-body">
                <form onSubmit={saveProfile}>
                  <div className="form-group">
                    <label>Business Name *</label>
                    <input className="form-control" required value={form.business_name}
                      onChange={e => setForm(p => ({ ...p, business_name: e.target.value }))}
                      placeholder="e.g. ABC Catering Services" />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea className="form-control" rows={3} value={form.description}
                      onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                      placeholder="Describe your business and what makes you stand out…" />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Service Radius (km)</label>
                      <input className="form-control" type="number" min={1}
                        value={form.service_radius_km}
                        onChange={e => setForm(p => ({ ...p, service_radius_km: e.target.value }))} />
                    </div>
                    {profile && (
                      <div className="form-group">
                        <label>Availability</label>
                        <select className="form-control"
                          value={form.availability_status ? 'true' : 'false'}
                          onChange={e => setForm(p => ({ ...p, availability_status: e.target.value === 'true' }))}>
                          <option value="true">● Available</option>
                          <option value="false">○ Unavailable</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <button className="btn btn-primary w-100" type="submit" disabled={saving}>
                    {saving ? 'Saving…' : profile ? 'Update Profile' : 'Create Profile'}
                  </button>
                </form>
              </div>
            </div>

            {/* Location */}
            <div className="card">
              <div className="card-header flex justify-between items-center">
                <span className="fw-600">Business Location</span>
                <span className="text-xs text-muted">Google Places + OpenStreetMap</span>
              </div>
              <div className="card-body">
                <div className="form-group">
                  <label>Address (start typing to search)</label>
                  <AddressAutocomplete
                    value={form.location.address}
                    onChange={addr => setForm(p => ({ ...p, location: { ...p.location, address: addr } }))}
                    onPlaceSelect={({ address, lat, lng }) => {
                      setForm(p => ({ ...p, location: { address, latitude: lat, longitude: lng } }))
                      toast.success(`📍 ${lat.toFixed(4)}, ${lng.toFixed(4)}`)
                    }}
                    placeholder="e.g. 14 Awolowo Road, Ikoyi, Lagos"
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Latitude</label>
                    <input className="form-control" type="number" step="any"
                      value={form.location.latitude}
                      onChange={e => setForm(p => ({ ...p, location: { ...p.location, latitude: parseFloat(e.target.value) } }))} />
                  </div>
                  <div className="form-group">
                    <label>Longitude</label>
                    <input className="form-control" type="number" step="any"
                      value={form.location.longitude}
                      onChange={e => setForm(p => ({ ...p, location: { ...p.location, longitude: parseFloat(e.target.value) } }))} />
                  </div>
                </div>
                <p className="form-hint" style={{ marginBottom: 8 }}>Or click the map to pin your location</p>
                <MapPicker
                  lat={form.location.latitude} lng={form.location.longitude}
                  onChange={(lat, lng) => setForm(p => ({ ...p, location: { ...p.location, latitude: lat, longitude: lng } }))}
                />
                <button className="btn btn-secondary w-100" style={{ marginTop: 12 }}
                  onClick={saveProfile} disabled={saving}>
                  Save Location
                </button>
              </div>
            </div>
          </div>

          {/* Services table */}
          {profile && (
            <div className="card" style={{ marginTop: 20 }}>
              <div className="card-header flex justify-between items-center">
                <div>
                  <span className="fw-600">My Services</span>
                  <span className="text-muted text-sm" style={{ marginLeft: 8 }}>
                    {services.length} / {profile.service_limit === -1 ? '∞' : profile.service_limit} used
                  </span>
                </div>
                <button
                  className={`btn btn-sm ${limitReached ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={() => { if (limitReached) { toast.error('Limit reached. Contact admin.'); return } openAdd() }}>
                  <Plus size={14} /> Add Service
                </button>
              </div>

              {services.length === 0 ? (
                <div className="card-body">
                  <div className="empty-state" style={{ padding: '40px 0' }}>
                    <div className="icon">🛎️</div>
                    <p>No services listed yet. Add your first service to appear in search results.</p>
                    <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={openAdd}>
                      + Add First Service
                    </button>
                  </div>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>Service</th><th>Category</th><th>Pricing Model</th><th>Price</th><th>Deposit</th><th>VAT</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {services.map(svc => (
                        <tr key={svc.id}>
                          <td className="fw-600">{svc.service_name}</td>
                          <td>
                            <span className="badge badge-purple" style={{ fontSize: 10 }}>
                              {categories.find(c => c.key === svc.category_key)?.label || svc.category_key}
                            </span>
                          </td>
                          <td>
                            <span className="badge badge-blue" style={{ fontSize: 10 }}>
                              {pricingModels.find(p => p.key === svc.pricing_model_key)?.label || svc.pricing_model_key}
                            </span>
                          </td>
                          <td className="fw-600" style={{ color: 'var(--green)' }}>{priceSummary(svc)}</td>
                          <td>{svc.deposit_percent}%</td>
                          <td>
                            {svc.vat_applicable
                              ? <span className="badge badge-amber" style={{ fontSize: 10 }}>7.5% VAT</span>
                              : <span className="badge badge-gray" style={{ fontSize: 10 }}>Exempt</span>}
                          </td>
                          <td>
                            <div className="flex gap-2">
                              <button className="btn btn-ghost btn-sm" title="Edit"
                                onClick={() => openEdit(svc)}><Edit2 size={13} /></button>
                              <button className="btn btn-ghost btn-sm text-danger" title="Remove"
                                onClick={() => deleteService(svc.id)}><Trash2 size={13} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {limitReached && (
                <div style={{ padding: '12px 20px', background: 'var(--amber-lt)',
                  borderTop: '1px solid var(--amber)', fontSize: 13, color: 'var(--amber)',
                  borderRadius: '0 0 8px 8px' }}>
                  ⚠️ Service limit reached ({profile.service_limit}). Contact your administrator to upgrade.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mount modal outside the form to avoid any nesting issues */}
      {showSvcModal && categories.length > 0 && (
        <ServiceModal
          key={editingSvc?.id ?? 'new'}
          svc={editingSvc}
          categories={categories}
          pricingModels={pricingModels}
          limitReached={limitReached}
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}
