import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

export default function AuthPage() {
  const [tab, setTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [regForm, setRegForm] = useState({ name: '', email: '', password: '', phone_number: '', user_type: 'organizer' });

  const handleLogin = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(loginForm.email, loginForm.password);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Invalid credentials');
    } finally { setLoading(false); }
  };

  const handleRegister = async e => {
    e.preventDefault();
    setLoading(true);
    try {
      await register(regForm);
      toast.success('Account created! Please log in.');
      setTab('login');
      setLoginForm({ email: regForm.email, password: '' });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Registration failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="auth-logo">
          <h1>⚡ EMS</h1>
          <p>Event Management System</p>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => setTab('login')}>Sign In</button>
          <button className={`auth-tab ${tab === 'register' ? 'active' : ''}`} onClick={() => setTab('register')}>Register</button>
        </div>

        {tab === 'login' ? (
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Email Address</label>
              <input className="form-control" type="email" placeholder="you@example.com" required
                value={loginForm.email} onChange={e => setLoginForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input className="form-control" type="password" placeholder="••••••••" required
                value={loginForm.password} onChange={e => setLoginForm(p => ({ ...p, password: e.target.value }))} />
            </div>
            <button className="btn btn-primary btn-lg w-100" type="submit" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
            <div style={{ marginTop: 16, padding: 14, background: 'var(--gray-50)', borderRadius: 8, fontSize: 12, color: 'var(--gray-500)' }}>
              <strong>Demo accounts:</strong><br />
              admin@ems.com / admin123 &nbsp;|&nbsp; organizer@ems.com / org123<br />
              vendor@ems.com / vendor123
            </div>
          </form>
        ) : (
          <form onSubmit={handleRegister}>
            <div className="form-group">
              <label>Full Name</label>
              <input className="form-control" placeholder="John Doe" required
                value={regForm.name} onChange={e => setRegForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Email</label>
                <input className="form-control" type="email" placeholder="you@example.com" required
                  value={regForm.email} onChange={e => setRegForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Phone</label>
                <input className="form-control" placeholder="+234..." 
                  value={regForm.phone_number} onChange={e => setRegForm(p => ({ ...p, phone_number: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label>Password</label>
              <input className="form-control" type="password" placeholder="Min. 8 characters" required
                value={regForm.password} onChange={e => setRegForm(p => ({ ...p, password: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>I am a…</label>
              <select className="form-control" value={regForm.user_type}
                onChange={e => setRegForm(p => ({ ...p, user_type: e.target.value }))}>
                <option value="organizer">Event Organizer</option>
                <option value="vendor">Vendor / Service Provider</option>
              </select>
            </div>
            <button className="btn btn-primary btn-lg w-100" type="submit" disabled={loading}>
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
