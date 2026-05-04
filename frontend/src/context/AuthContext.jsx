import { createContext, useContext, useState } from 'react'
import { authAPI } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ems_user')) } catch { return null }
  })

  const login = async (email, password) => {
    const { data } = await authAPI.login({ email, password })
    localStorage.setItem('ems_token', data.access_token)
    localStorage.setItem('ems_user', JSON.stringify(data.user))
    setUser(data.user)
    return data.user
  }

  const logout = () => {
    localStorage.removeItem('ems_token')
    localStorage.removeItem('ems_user')
    setUser(null)
  }

  const register = async (formData) => {
    const { data } = await authAPI.register(formData)
    return data
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, register }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
