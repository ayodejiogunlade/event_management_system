import { useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import toast from 'react-hot-toast'
import { useAuth } from '../context/AuthContext'

export function useSocket(onNotification) {
  const { user } = useAuth()
  const socketRef = useRef(null)

  useEffect(() => {
    if (!user) return
    const socket = io('/', {
      path: '/socket.io',
      auth: { user_id: user.id },
      transports: ['websocket', 'polling'],
    })
    socketRef.current = socket

    socket.on('notification', (data) => {
      const icons = { success: '✅', warning: '⚠️', booking_request: '📋', info: 'ℹ️' }
      toast(data.message, { icon: icons[data.type] || 'ℹ️', duration: 5000 })
      if (onNotification) onNotification(data)
    })

    return () => socket.disconnect()
  }, [user])

  return socketRef
}
