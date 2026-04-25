import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('ems_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) {
    localStorage.removeItem('ems_token');
    localStorage.removeItem('ems_user');
    window.location.href = '/login';
  }
  return Promise.reject(err);
});

export default api;

// Auth
export const authAPI = {
  register: d => api.post('/auth/register', d),
  login: d => api.post('/auth/login', d),
  me: () => api.get('/auth/me'),
  update: d => api.put('/auth/me', d),
};

// Events
export const eventsAPI = {
  list: () => api.get('/events'),
  get: id => api.get(`/events/${id}`),
  create: d => api.post('/events', d),
  update: (id, d) => api.put(`/events/${id}`, d),
  cancel: id => api.delete(`/events/${id}`),
};

// Vendors
export const vendorsAPI = {
  list: (params) => api.get('/vendors', { params }),
  get: id => api.get(`/vendors/${id}`),
  myProfile: () => api.get('/vendors/me'),
  create: d => api.post('/vendors', d),
  update: d => api.put('/vendors/me', d),
};

// Matching
export const matchAPI = {
  match: d => api.post('/match', d),
};

// Bookings
export const bookingsAPI = {
  list: () => api.get('/bookings'),
  create: d => api.post('/bookings', d),
  updateStatus: (id, status) => api.put(`/bookings/${id}/status`, { status }),
};

// Notifications
export const notifAPI = {
  list: () => api.get('/notifications'),
  markRead: id => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
};

// Admin
export const adminAPI = {
  stats: () => api.get('/admin/stats'),
  users: () => api.get('/admin/users'),
  updateUser: (id, d) => api.put(`/admin/users/${id}`, d),
  verifyVendor: (id, v) => api.put(`/admin/vendors/${id}/verify`, { is_verified: v }),
  vendors: () => api.get('/vendors'),
};
