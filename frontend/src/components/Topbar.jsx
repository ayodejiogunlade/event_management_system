import { useState, useEffect, useRef } from 'react'
import { Bell } from 'lucide-react'
import { notifAPI } from '../api'
import { formatDistanceToNow } from 'date-fns'
import { useAuth } from '../context/AuthContext'

export default function Topbar({ title, onNotif }) {
  const { user }      = useAuth()
  const [open, setOpen]   = useState(false)
  const [notifs, setNotifs] = useState([])
  const ref = useRef()

  const unread = notifs.filter(n => !n.is_read).length

  const fetchNotifs = async () => {
    try { const { data } = await notifAPI.list(); setNotifs(data) } catch {}
  }

  useEffect(() => {
    fetchNotifs()
    const t = setInterval(fetchNotifs, 30000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => { if (onNotif) fetchNotifs() }, [onNotif])

  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const markAll = async () => {
    await notifAPI.markAllRead()
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const markOne = async (id) => {
    await notifAPI.markRead(id)
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  const typeIcon = t => ({
    success: '✅', warning: '⚠️', booking_request: '📋',
    confirmed: '✅', declined: '❌', cancelled: '🚫',
  }[t] || 'ℹ️')

  return (
    <header className="topbar">
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-800)' }}>{title}</h2>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>
          Hi, <strong>{user?.name?.split(' ')[0]}</strong>
        </span>
        <div style={{ position: 'relative' }} ref={ref}>
          <button className="btn btn-ghost notif-btn" onClick={() => setOpen(o => !o)} style={{ padding: 8 }}>
            <Bell size={20} />
            {unread > 0 && <span className="notif-dot" />}
          </button>
          {open && (
            <div className="dropdown-panel">
              <div className="dropdown-header">
                <span style={{ fontWeight: 700, fontSize: 14 }}>
                  Notifications {unread > 0 && <span className="badge badge-red" style={{ marginLeft: 6 }}>{unread}</span>}
                </span>
                {unread > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={markAll}>Mark all read</button>
                )}
              </div>
              {notifs.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
                  No notifications yet
                </div>
              ) : (
                <ul className="notif-list" style={{ maxHeight: 360, overflowY: 'auto' }}>
                  {notifs.map(n => (
                    <li key={n.id} className={`notif-item ${!n.is_read ? 'unread' : ''}`}
                        onClick={() => markOne(n.id)}>
                      <div className="notif-msg">{typeIcon(n.notification_type)} {n.message}</div>
                      <div className="notif-time">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
