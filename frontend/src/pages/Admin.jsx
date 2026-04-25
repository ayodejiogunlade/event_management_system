import { useState, useEffect } from 'react';
import { adminAPI } from '../api';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { useSocket } from '../hooks/useSocket';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const roleBadge = r => ({ admin: 'badge-purple', organizer: 'badge-blue', vendor: 'badge-green' }[r] || 'badge-gray');

export function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [notifTick, setNotifTick] = useState(0);
  useSocket(() => setNotifTick(t => t + 1));

  const load = async () => {
    setLoading(true);
    try { const { data } = await adminAPI.users(); setUsers(data); } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggle = async (id, active) => {
    try {
      await adminAPI.updateUser(id, { is_active: !active });
      toast.success(!active ? 'User activated' : 'User suspended');
      load();
    } catch { toast.error('Failed'); }
  };

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="User Management" onNotif={notifTick} />
        <div className="page">
          <p className="page-title">Users</p>
          <p className="page-subtitle">Manage all registered users on the platform</p>
          <div className="card">
            <div className="card-header flex justify-between items-center">
              <span className="fw-600">{users.length} Total Users</span>
              <input className="form-control" style={{ width: 240, margin: 0 }} placeholder="Search by name or email…"
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {loading ? <div className="loading"><div className="spinner" /></div> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Phone</th><th>Joined</th><th>Status</th><th>Action</th></tr></thead>
                  <tbody>
                    {filtered.map(u => (
                      <tr key={u.id}>
                        <td className="fw-600">{u.name}</td>
                        <td className="text-sm text-muted">{u.email}</td>
                        <td><span className={`badge ${roleBadge(u.user_type)}`}>{u.user_type}</span></td>
                        <td className="text-sm">{u.phone_number || '—'}</td>
                        <td className="text-sm">{format(new Date(u.created_at), 'dd MMM yyyy')}</td>
                        <td><span className={`badge ${u.is_active ? 'badge-green' : 'badge-red'}`}>{u.is_active ? '● Active' : '● Suspended'}</span></td>
                        <td>
                          <button className={`btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-success'}`}
                            onClick={() => toggle(u.id, u.is_active)}>
                            {u.is_active ? 'Suspend' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminVendors() {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [notifTick, setNotifTick] = useState(0);
  useSocket(() => setNotifTick(t => t + 1));

  const load = async () => {
    setLoading(true);
    try { const { data } = await adminAPI.vendors(); setVendors(data); } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const verify = async (id, v) => {
    try {
      await adminAPI.verifyVendor(id, v);
      toast.success(v ? 'Vendor verified and approved!' : 'Vendor approval revoked');
      load();
    } catch { toast.error('Failed'); }
  };

  const filtered = filter === 'all' ? vendors
    : filter === 'pending' ? vendors.filter(v => !v.is_verified)
    : vendors.filter(v => v.is_verified);

  const pending = vendors.filter(v => !v.is_verified).length;

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="Vendor Verification" onNotif={notifTick} />
        <div className="page">
          <p className="page-title">Vendor Management</p>
          <p className="page-subtitle">Review and verify vendor registrations</p>

          {pending > 0 && (
            <div style={{ background: 'var(--amber-lt)', border: '1px solid var(--amber)', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: 'var(--amber)', fontSize: 14, fontWeight: 600 }}>
              ⚠️ {pending} vendor{pending > 1 ? 's' : ''} awaiting verification
            </div>
          )}

          <div className="flex gap-2 mb-3">
            {['all','pending','verified'].map(f => (
              <button key={f} className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setFilter(f)} style={{ textTransform: 'capitalize' }}>{f}</button>
            ))}
          </div>

          <div className="card">
            {loading ? <div className="loading"><div className="spinner" /></div> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Business</th><th>Service</th><th>Owner</th><th>Location</th><th>Price</th><th>Rating</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filtered.map(v => (
                      <tr key={v.id}>
                        <td className="fw-600">{v.business_name}</td>
                        <td><span className="badge badge-purple">{v.service_type}</span></td>
                        <td className="text-sm">{v.owner_name || '—'}<br/><span className="text-muted">{v.owner_email}</span></td>
                        <td className="text-sm text-muted">{v.location?.address || `${v.location?.latitude?.toFixed(3)}, ${v.location?.longitude?.toFixed(3)}` || '—'}</td>
                        <td>{v.pricing ? `₦${Number(v.pricing).toLocaleString()}` : '—'}</td>
                        <td>⭐ {v.rating.toFixed(1)}</td>
                        <td>
                          {v.is_verified
                            ? <span className="badge badge-green">✅ Verified</span>
                            : <span className="badge badge-amber">⏳ Pending</span>}
                        </td>
                        <td>
                          {!v.is_verified
                            ? <button className="btn btn-success btn-sm" onClick={() => verify(v.id, true)}>✅ Verify</button>
                            : <button className="btn btn-danger btn-sm" onClick={() => verify(v.id, false)}>Revoke</button>}
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr><td colSpan={8}><div className="empty-state" style={{ padding: '40px 0' }}><div className="icon">🏪</div><p>No vendors found</p></div></td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
