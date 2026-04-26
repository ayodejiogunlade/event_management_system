import { useState, useEffect } from 'react'
import { adminAPI, metaAPI } from '../api'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'
import { useSocket } from '../hooks/useSocket'
import toast from 'react-hot-toast'
import { Plus, Edit2, X } from 'lucide-react'

const LIMIT_OPTIONS = [
  { value: 1,  label: '1 Service (Default)' },
  { value: 3,  label: '3 Services (Standard)' },
  { value: 5,  label: '5 Services (Pro)' },
  { value: -1, label: 'Unlimited (Enterprise)' },
]

function CategoryModal({ cat, onClose, onSaved }) {
  const editing = !!cat?.id
  const [form, setForm] = useState({
    key:         cat?.key         || '',
    label:       cat?.label       || '',
    icon:        cat?.icon        || '🛎️',
    description: cat?.description || '',
    sort_order:  cat?.sort_order  != null ? String(cat.sort_order) : '0',
    is_active:   cat?.is_active   != null ? cat.is_active : true,
  })
  const [saving, setSaving] = useState(false)

  const save = async e => {
    e.preventDefault(); setSaving(true)
    try {
      const payload = { ...form, sort_order: parseInt(form.sort_order) || 0 }
      if (editing) await adminAPI.updateCategory(cat.id, payload)
      else         await adminAPI.createCategory(payload)
      toast.success(editing ? 'Category updated!' : 'Category created!')
      onSaved()
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed') }
    setSaving(false)
  }
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2>{editing ? 'Edit Category' : 'Add Category'}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <form onSubmit={save}>
            <div className="form-row">
              <div className="form-group">
                <label>Key (unique, no spaces) *</label>
                <input className="form-control" required value={form.key} onChange={f('key')}
                  placeholder="e.g. live_band" disabled={editing}
                  style={{ background: editing ? 'var(--gray-100)' : '#fff' }} />
              </div>
              <div className="form-group">
                <label>Icon (emoji)</label>
                <input className="form-control" value={form.icon} onChange={f('icon')} placeholder="🛎️" />
              </div>
            </div>
            <div className="form-group">
              <label>Label (display name) *</label>
              <input className="form-control" required value={form.label} onChange={f('label')}
                placeholder="e.g. Live Band" />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea className="form-control" rows={2} value={form.description} onChange={f('description')}
                placeholder="Brief description of this service category" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Sort Order</label>
                <input className="form-control" type="number" value={form.sort_order} onChange={f('sort_order')} />
              </div>
              {editing && (
                <div className="form-group">
                  <label>Status</label>
                  <select className="form-control" value={form.is_active ? 'true' : 'false'}
                    onChange={e => setForm(p => ({ ...p, is_active: e.target.value === 'true' }))}>
                    <option value="true">Active</option>
                    <option value="false">Disabled</option>
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function PricingModal({ model, onClose, onSaved }) {
  const editing = !!model?.id
  const [form, setForm] = useState({
    key:         model?.key         || '',
    label:       model?.label       || '',
    description: model?.description || '',
    is_active:   model?.is_active   != null ? model.is_active : true,
  })
  const [saving, setSaving] = useState(false)

  const save = async e => {
    e.preventDefault(); setSaving(true)
    try {
      if (editing) await adminAPI.updatePricingModel(model.id, form)
      else         await adminAPI.createPricingModel(form)
      toast.success(editing ? 'Pricing model updated!' : 'Pricing model created!')
      onSaved()
    } catch (err) { toast.error(err.response?.data?.detail || 'Failed') }
    setSaving(false)
  }
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-header">
          <h2>{editing ? 'Edit Pricing Model' : 'Add Pricing Model'}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <form onSubmit={save}>
            <div className="form-group">
              <label>Key (unique) *</label>
              <input className="form-control" required value={form.key} onChange={f('key')}
                placeholder="e.g. per_day" disabled={editing}
                style={{ background: editing ? 'var(--gray-100)' : '#fff' }} />
            </div>
            <div className="form-group">
              <label>Label *</label>
              <input className="form-control" required value={form.label} onChange={f('label')}
                placeholder="e.g. Per Day Rate" />
            </div>
            <div className="form-group">
              <label>Description</label>
              <textarea className="form-control" rows={2} value={form.description} onChange={f('description')}
                placeholder="Explain when to use this pricing model" />
            </div>
            {editing && (
              <div className="form-group">
                <label>Status</label>
                <select className="form-control" value={form.is_active ? 'true' : 'false'}
                  onChange={e => setForm(p => ({ ...p, is_active: e.target.value === 'true' }))}>
                  <option value="true">Active</option>
                  <option value="false">Disabled</option>
                </select>
              </div>
            )}
            <div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function AdminSettings() {
  const [categories, setCategories] = useState([])
  const [pricingModels, setPricingModels] = useState([])
  const [defaultLimit, setDefaultLimit] = useState(1)
  const [loading, setLoading] = useState(true)
  const [catModal, setCatModal] = useState(null)   // null | {} | {id,...}
  const [pmModal, setPmModal]   = useState(null)
  const [notifTick, setNotifTick] = useState(0)
  useSocket(() => setNotifTick(t => t + 1))

  const load = async () => {
    setLoading(true)
    try {
      const [cats, pms, dlim] = await Promise.all([
        adminAPI.listCategories(),
        adminAPI.listPricingModels(),
        metaAPI.defaultServiceLimit(),
      ])
      setCategories(cats.data || [])
      setPricingModels(pms.data || [])
      setDefaultLimit(dlim.data?.default_service_limit ?? 1)
    } catch {}
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const saveDefaultLimit = async val => {
    try {
      await adminAPI.setDefaultServiceLimit(parseInt(val))
      setDefaultLimit(parseInt(val))
      toast.success('Default service limit updated!')
    } catch { toast.error('Failed') }
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="Platform Settings" onNotif={notifTick} />
        <div className="page">
          <p className="page-title">Platform Settings</p>
          <p className="page-subtitle">Manage service categories, pricing models, and platform defaults</p>

          {loading ? <div className="loading"><div className="spinner" /></div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

              {/* ── Default service limit ── */}
              <div className="card">
                <div className="card-header"><span className="fw-600">🔢 Default Service Limit for New Vendors</span></div>
                <div className="card-body">
                  <p className="text-sm text-muted" style={{ marginBottom: 14 }}>
                    This sets how many services a newly registered vendor can add by default.
                    Individual limits can be upgraded per-vendor in the Vendor Management page.
                  </p>
                  <div className="flex gap-3 items-center" style={{ flexWrap: 'wrap' }}>
                    {LIMIT_OPTIONS.map(o => (
                      <button key={o.value}
                        className={`btn ${defaultLimit === o.value ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => saveDefaultLimit(o.value)}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-sm text-muted" style={{ marginTop: 12 }}>
                    Current default: <strong>{defaultLimit === -1 ? 'Unlimited' : defaultLimit} service{defaultLimit !== 1 ? 's' : ''}</strong>
                  </p>
                </div>
              </div>

              {/* ── Service Categories ── */}
              <div className="card">
                <div className="card-header flex justify-between items-center">
                  <span className="fw-600">🏷️ Service Categories ({categories.length})</span>
                  <button className="btn btn-primary btn-sm" onClick={() => setCatModal({})}>
                    <Plus size={13} /> Add Category
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Icon</th><th>Key</th><th>Label</th><th>Description</th><th>Order</th><th>Status</th><th>Action</th></tr></thead>
                    <tbody>
                      {categories.map(c => (
                        <tr key={c.id}>
                          <td style={{ fontSize: 20 }}>{c.icon}</td>
                          <td><code style={{ fontSize: 12, background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 4 }}>{c.key}</code></td>
                          <td className="fw-600">{c.label}</td>
                          <td className="text-sm text-muted">{c.description?.slice(0, 50) || '—'}</td>
                          <td>{c.sort_order}</td>
                          <td><span className={`badge ${c.is_active ? 'badge-green' : 'badge-gray'}`}>{c.is_active ? 'Active' : 'Disabled'}</span></td>
                          <td>
                            <button className="btn btn-ghost btn-sm" onClick={() => setCatModal(c)}><Edit2 size={13} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── Pricing Models ── */}
              <div className="card">
                <div className="card-header flex justify-between items-center">
                  <span className="fw-600">💰 Pricing Models ({pricingModels.length})</span>
                  <button className="btn btn-primary btn-sm" onClick={() => setPmModal({})}>
                    <Plus size={13} /> Add Pricing Model
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Key</th><th>Label</th><th>Description</th><th>Status</th><th>Action</th></tr></thead>
                    <tbody>
                      {pricingModels.map(p => (
                        <tr key={p.id}>
                          <td><code style={{ fontSize: 12, background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 4 }}>{p.key}</code></td>
                          <td className="fw-600">{p.label}</td>
                          <td className="text-sm text-muted">{p.description?.slice(0, 60) || '—'}</td>
                          <td><span className={`badge ${p.is_active ? 'badge-green' : 'badge-gray'}`}>{p.is_active ? 'Active' : 'Disabled'}</span></td>
                          <td>
                            <button className="btn btn-ghost btn-sm" onClick={() => setPmModal(p)}><Edit2 size={13} /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {catModal !== null && (
        <CategoryModal
          key={catModal.id ?? 'new-cat'}
          cat={catModal.id ? catModal : null}
          onClose={() => setCatModal(null)}
          onSaved={() => { setCatModal(null); load() }}
        />
      )}
      {pmModal !== null && (
        <PricingModal
          key={pmModal.id ?? 'new-pm'}
          model={pmModal.id ? pmModal : null}
          onClose={() => setPmModal(null)}
          onSaved={() => { setPmModal(null); load() }}
        />
      )}
    </div>
  )
}
