import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use(cfg => {
  const t = localStorage.getItem('ems_token')
  if (t) cfg.headers.Authorization = `Bearer ${t}`
  return cfg
})

api.interceptors.response.use(r => r, err => {
  if (err.response?.status === 401) {
    localStorage.removeItem('ems_token')
    localStorage.removeItem('ems_user')
    window.location.href = '/login'
  }
  return Promise.reject(err)
})

export default api

export const authAPI = {
  register: d  => api.post('/auth/register', d),
  login:    d  => api.post('/auth/login', d),
  me:       () => api.get('/auth/me'),
  update:   d  => api.put('/auth/me', d),
}

export const eventsAPI = {
  list:   ()       => api.get('/events'),
  get:    id       => api.get(`/events/${id}`),
  create: d        => api.post('/events', d),
  update: (id, d)  => api.put(`/events/${id}`, d),
  cancel: id       => api.delete(`/events/${id}`),
}

export const vendorsAPI = {
  list:          params  => api.get('/vendors', { params }),
  get:           id      => api.get(`/vendors/${id}`),
  myProfile:     ()      => api.get('/vendors/me'),
  create:        d       => api.post('/vendors', d),
  update:        d       => api.put('/vendors/me', d),
  myServices:    ()      => api.get('/vendors/me/services'),
  addService:    d       => api.post('/vendors/me/services', d),
  updateService: (id, d) => api.put(`/vendors/me/services/${id}`, d),
  deleteService: id      => api.delete(`/vendors/me/services/${id}`),
}

export const matchAPI   = { match: d => api.post('/match', d) }
export const plannerAPI = { plan:  d => api.post('/planner', d) }

export const bookingsAPI = {
  list:         ()       => api.get('/bookings'),
  create:       d        => api.post('/bookings', d),
  updateStatus: (id, s)  => api.put(`/bookings/${id}/status`, { status: s }),
}

export const notifAPI = {
  list:        () => api.get('/notifications'),
  markRead:    id => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
}

export const metaAPI = {
  serviceCategories:   () => api.get('/meta/service-categories'),
  pricingModels:       () => api.get('/meta/pricing-models'),
  defaultServiceLimit: () => api.get('/meta/default-service-limit'),
}

export const adminAPI = {
  stats:                  ()       => api.get('/admin/stats'),
  users:                  ()       => api.get('/admin/users'),
  updateUser:             (id, d)  => api.put(`/admin/users/${id}`, d),
  vendors:                ()       => api.get('/admin/vendors'),
  getVendor:              id       => api.get(`/admin/vendors/${id}`),
  verifyVendor:           (id, v)  => api.put(`/admin/vendors/${id}/verify`, { is_verified: v }),
  setServiceLimit:        (id, l)  => api.put(`/admin/vendors/${id}/service-limit`, { service_limit: l }),
  events:                 ()       => api.get('/admin/events'),
  bookings:               ()       => api.get('/admin/bookings'),
  listCategories:         ()       => api.get('/admin/categories'),
  createCategory:         d        => api.post('/admin/categories', d),
  updateCategory:         (id, d)  => api.put(`/admin/categories/${id}`, d),
  listPricingModels:      ()       => api.get('/admin/pricing-models'),
  createPricingModel:     d        => api.post('/admin/pricing-models', d),
  updatePricingModel:     (id, d)  => api.put(`/admin/pricing-models/${id}`, d),
  setDefaultServiceLimit: v        => api.put('/admin/settings/default-service-limit', { value: v }),
}
