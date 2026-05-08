/**
 * @fileoverview EventPlanner.jsx — Find Vendors with Custom Package Builder
 *
 * New features in this version:
 *
 *  1. VENDOR DETAIL MODAL
 *     Click any vendor card (in packages or category breakdown) to open a
 *     full-detail modal showing all services, pricing, location, and
 *     contact information.
 *
 *  2. CUSTOM PACKAGE BUILDER
 *     Each vendor in the category breakdown has a "Select" toggle.
 *     Selected vendors (one per category) appear in a floating
 *     "Custom Package" panel at the bottom of the screen.
 *     The organizer picks an event and books all selected vendors at once.
 *
 *  3. POST-BOOKING CONTACT MODAL
 *     After any booking (package or custom), a modal appears showing
 *     each booked vendor's contact details (name, phone, email) with a
 *     prompt to reach out and confirm arrangements.
 */

import { useState, useEffect, useCallback } from 'react'
import { eventsAPI, metaAPI, vendorsAPI } from '../api'
import api, { bookingsAPI } from '../api'
import { useAuth } from '../context/AuthContext'
import Sidebar from '../components/Sidebar'
import Topbar from '../components/Topbar'
import AddressAutocomplete from '../components/AddressAutocomplete'
import { useSocket } from '../hooks/useSocket'
import toast from 'react-hot-toast'
import {
  Plus, Trash2, Search, CheckCircle, AlertTriangle, Info,
  ChevronDown, ChevronUp, X, Phone, Mail, MapPin, Star,
  ShoppingCart, Eye, UserCheck,
} from 'lucide-react'

// ─── Formatting ────────────────────────────────────────────────────────────────
const fmt = (n) => `₦${Number(n).toLocaleString()}`

function pctColor(p) {
  if (Math.abs(p - 100) < 0.5) return 'var(--green)'
  if (p > 100)                  return 'var(--red)'
  return 'var(--amber)'
}

function priceSummary(svc) {
  if (!svc) return '—'
  if (svc.pricing_model_key === 'fixed_fee'  && svc.fixed_price)     return `${fmt(svc.fixed_price)} fixed`
  if (svc.pricing_model_key === 'per_head'   && svc.price_per_head)  return `${fmt(svc.price_per_head)}/guest`
  if (svc.pricing_model_key === 'percentage' && svc.percentage_rate) return `${svc.percentage_rate}% of budget`
  if (svc.pricing_model_key === 'hourly'     && svc.hourly_rate)     return `${fmt(svc.hourly_rate)}/hr`
  return '—'
}

// ─── VendorDetailModal ─────────────────────────────────────────────────────────
/**
 * Opens when the user clicks on any vendor card.
 * Fetches full VendorOut (all services + contact details) from the API.
 * Includes a "Select this Vendor" button to add to the custom package.
 */
function VendorDetailModal({ vendorId, onClose, onSelect, isSelected, searchedCategoryKey }) {
  const [vendor,  setVendor]  = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!vendorId) return
    setLoading(true)
    vendorsAPI.get(vendorId)
      .then(r => { setVendor(r.data); setLoading(false) })
      .catch(() => { toast.error('Could not load vendor details'); onClose() })
  }, [vendorId])

  // Find the service matching the category that brought up this modal
  const matchedSvc = vendor?.services?.find(s => s.category_key === searchedCategoryKey)
    || vendor?.services?.[0]

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 660, maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div className="modal-header" style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 10, paddingBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>
            {loading ? 'Loading…' : vendor?.business_name}
          </h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={18} /></button>
        </div>

        {loading ? (
          <div className="loading" style={{ padding: 60 }}><div className="spinner" /></div>
        ) : vendor ? (
          <div className="modal-body">

            {/* Status badges */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              {vendor.is_verified && <span className="badge badge-green">✅ Verified</span>}
              <span className={`badge ${vendor.availability_status ? 'badge-green' : 'badge-gray'}`}>
                {vendor.availability_status ? '● Available' : '○ Unavailable'}
              </span>
              <span className="badge badge-blue">⭐ {vendor.rating.toFixed(1)} ({vendor.rating_count} reviews)</span>
              <span className="badge badge-purple">📍 {vendor.service_radius_km} km radius</span>
            </div>

            {/* Description */}
            {vendor.description && (
              <p style={{ fontSize: 14, color: 'var(--gray-600)', lineHeight: 1.7, marginBottom: 16 }}>
                {vendor.description}
              </p>
            )}

            {/* Location */}
            {vendor.location && (
              <div style={{ background: 'var(--gray-50)', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <MapPin size={14} style={{ color: 'var(--blue)', flexShrink: 0 }} />
                  <span style={{ color: 'var(--gray-700)' }}>{vendor.location.address}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4, marginLeft: 22 }}>
                  {parseFloat(vendor.location.latitude).toFixed(5)}, {parseFloat(vendor.location.longitude).toFixed(5)}
                </div>
              </div>
            )}

            {/* Services */}
            <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Services Offered</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
              {vendor.services.map(svc => (
                <div key={svc.id} style={{
                  border: `2px solid ${svc.category_key === searchedCategoryKey ? 'var(--blue)' : 'var(--gray-200)'}`,
                  borderRadius: 10, padding: '12px 16px',
                  background: svc.category_key === searchedCategoryKey ? 'var(--blue-pale)' : '#fff',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {svc.service_name}
                        {svc.category_key === searchedCategoryKey && (
                          <span className="badge badge-blue" style={{ marginLeft: 8, fontSize: 10 }}>Matched</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 5 }}>
                        <span className="badge badge-purple" style={{ fontSize: 10 }}>{svc.category_key}</span>
                        <span className="badge badge-gray"   style={{ fontSize: 10 }}>{svc.pricing_model_key}</span>
                        {svc.vat_applicable && <span className="badge badge-amber" style={{ fontSize: 10 }}>+7.5% VAT</span>}
                        <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>Deposit: {svc.deposit_percent}%</span>
                      </div>
                      {svc.description && (
                        <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 6 }}>{svc.description}</p>
                      )}
                    </div>
                    <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--green)', marginLeft: 16, flexShrink: 0 }}>
                      {priceSummary(svc)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Contact details */}
            <div style={{ background: '#f0fdf4', border: '2px solid #4ade80', borderRadius: 10, padding: '16px 20px', marginBottom: 20 }}>
              <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--green)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserCheck size={16} /> Contact Information
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {vendor.owner_name && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                    <UserCheck size={14} style={{ color: 'var(--gray-400)', flexShrink: 0 }} />
                    <span style={{ fontWeight: 600 }}>{vendor.owner_name}</span>
                  </div>
                )}
                {vendor.owner_phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                    <Phone size={14} style={{ color: 'var(--gray-400)', flexShrink: 0 }} />
                    <a href={`tel:${vendor.owner_phone}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>
                      {vendor.owner_phone}
                    </a>
                  </div>
                )}
                {vendor.owner_email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                    <Mail size={14} style={{ color: 'var(--gray-400)', flexShrink: 0 }} />
                    <a href={`mailto:${vendor.owner_email}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>
                      {vendor.owner_email}
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={onClose}>Close</button>
              {onSelect && matchedSvc && (
                <button
                  className={`btn ${isSelected ? 'btn-danger' : 'btn-primary'}`}
                  onClick={() => {
                    onSelect({
                      vendor_id:        vendor.id,
                      vendor_service_id: matchedSvc.id,
                      vendor_name:      vendor.business_name,
                      service_name:     matchedSvc.service_name,
                      category_key:     matchedSvc.category_key,
                      category_label:   matchedSvc.category_key,
                      price:            0,  // placeholder; real price from search result
                      distance_km:      0,
                      rating:           vendor.rating,
                      address:          vendor.location?.address || '',
                      deposit_percent:  matchedSvc.deposit_percent,
                      vat_applicable:   matchedSvc.vat_applicable,
                      pricing_model:    matchedSvc.pricing_model_key,
                    })
                    onClose()
                  }}
                >
                  {isSelected ? '✕ Deselect Vendor' : '+ Add to Custom Package'}
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}


// ─── BookingSuccessModal ───────────────────────────────────────────────────────
/**
 * Shown after a successful booking (package or custom).
 * Displays each booked vendor's contact details and prompts the user to reach out.
 */
function BookingSuccessModal({ contacts, onClose }) {
  const copyAll = () => {
    const text = contacts.map(c =>
      `${c.business_name}\n  Phone: ${c.owner_phone || 'N/A'}\n  Email: ${c.owner_email || 'N/A'}`
    ).join('\n\n')
    navigator.clipboard.writeText(text)
    toast.success('Contact details copied!')
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="modal-header">
          <h2 style={{ color: 'var(--green)' }}>🎉 Booking Requests Sent!</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="modal-body">

          {/* Success message */}
          <div style={{ background: 'var(--green-lt)', border: '1.5px solid var(--green)', borderRadius: 10, padding: '14px 18px', marginBottom: 20 }}>
            <p style={{ fontWeight: 700, color: 'var(--green)', marginBottom: 4 }}>
              ✅ {contacts.length} booking request{contacts.length > 1 ? 's' : ''} created successfully
            </p>
            <p style={{ fontSize: 13, color: '#166534' }}>
              Your vendors have been notified via the platform. We recommend contacting
              them directly to confirm all arrangements and share event-specific details.
            </p>
          </div>

          {/* Contact details */}
          <p style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Phone size={15} style={{ color: 'var(--blue)' }} />
            Vendor Contact Details
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {contacts.map((c, i) => (
              <div key={i} style={{ border: '1.5px solid var(--gray-200)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{c.business_name}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {c.owner_name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <UserCheck size={13} style={{ color: 'var(--gray-400)' }} />
                      <span>{c.owner_name}</span>
                    </div>
                  )}
                  {c.owner_phone ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <Phone size={13} style={{ color: 'var(--gray-400)' }} />
                      <a href={`tel:${c.owner_phone}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>
                        {c.owner_phone}
                      </a>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                      <Phone size={12} style={{ marginRight: 6 }} />
                      Phone not listed — contact via platform
                    </div>
                  )}
                  {c.owner_email ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <Mail size={13} style={{ color: 'var(--gray-400)' }} />
                      <a href={`mailto:${c.owner_email}`} style={{ color: 'var(--blue)', fontWeight: 600 }}>
                        {c.owner_email}
                      </a>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>
                      <Mail size={12} style={{ marginRight: 6 }} />
                      Email not listed — contact via platform
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={copyAll}>📋 Copy All Contacts</button>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  )
}


// ─── CustomPackagePanel ────────────────────────────────────────────────────────
/**
 * Floating bottom panel that appears when the user has selected 1+ vendors.
 * Shows: selected vendors list, total price, event selector, Book button.
 */
function CustomPackagePanel({ selected, events, userType, onRemove, onBook, onViewVendor }) {
  const [collapsed,  setCollapsed]  = useState(false)
  const [eventId,    setEventId]    = useState('')
  const [isBooking,  setIsBooking]  = useState(false)
  const canBook = userType === 'organizer' || userType === 'admin'
  const items   = Object.values(selected)

  if (items.length === 0) return null

  const total = items.reduce((s, v) => s + (v.price || 0), 0)

  async function handleBook() {
    if (!eventId) { toast.error('Please select an event'); return }
    setIsBooking(true)
    const result = await onBook(eventId)
    setIsBooking(false)
    if (result) setEventId('')
  }

  return (
    <div style={{
      position:   'fixed',
      bottom:     0,
      left:       240,
      right:      0,
      zIndex:     200,
      background: '#fff',
      borderTop:  '2px solid var(--blue)',
      boxShadow:  '0 -4px 20px rgba(0,0,0,.15)',
      transition: 'height .25s ease',
    }}>
      {/* Panel header — always visible */}
      <div
        style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: 'var(--navy)' }}
        onClick={() => setCollapsed(c => !c)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShoppingCart size={18} style={{ color: '#fff' }} />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>
            Custom Package — {items.length} vendor{items.length > 1 ? 's' : ''} selected
          </span>
          {total > 0 && (
            <span style={{ color: '#4ade80', fontWeight: 800, fontSize: 16, marginLeft: 8 }}>
              {fmt(total)}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {canBook && !collapsed && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
              <select className="form-control" style={{ width: 220, margin: 0, fontSize: 13, padding: '6px 10px' }}
                value={eventId} onChange={e => setEventId(e.target.value)}>
                <option value="">Link to event…</option>
                {events.filter(e => e.status === 'active').map(e => (
                  <option key={e.id} value={e.id}>{e.name}</option>
                ))}
              </select>
              <button className="btn btn-primary btn-sm" onClick={handleBook} disabled={isBooking || !eventId}>
                <CheckCircle size={13} />
                {isBooking ? 'Booking…' : 'Book Custom Package'}
              </button>
            </div>
          )}
          {collapsed
            ? <ChevronUp size={18} style={{ color: '#fff' }} />
            : <ChevronDown size={18} style={{ color: '#fff' }} />}
        </div>
      </div>

      {/* Selected vendors list */}
      {!collapsed && (
        <div style={{ padding: '12px 24px', display: 'flex', gap: 10, flexWrap: 'wrap', maxHeight: 160, overflowY: 'auto' }}>
          {items.map((v) => (
            <div key={v.category_key} style={{
              background:   'var(--blue-pale)',
              border:       '1.5px solid var(--blue)',
              borderRadius: 10,
              padding:      '8px 12px',
              display:      'flex',
              alignItems:   'center',
              gap:          8,
              fontSize:     13,
            }}>
              <div>
                <div style={{ fontWeight: 700 }}>{v.vendor_name}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>
                  {v.category_label || v.category_key} · {v.price ? fmt(v.price) : 'Price TBC'}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ padding: 3 }}
                title="View details" onClick={() => onViewVendor(v.vendor_id, v.category_key)}>
                <Eye size={13} />
              </button>
              <button className="btn btn-ghost btn-sm text-danger" style={{ padding: 3 }}
                title="Remove" onClick={() => onRemove(v.category_key)}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


// ─── CategoryBestCard ──────────────────────────────────────────────────────────
/**
 * Shows up to 5 vendors per category with:
 *  - Click row → VendorDetailModal
 *  - Select button → adds to custom package
 *  - Visual state: selected (blue), within budget (green), over budget (amber), none (red)
 */
function CategoryBestCard({ cat, selectedVendors, onToggleSelect, onViewVendor }) {
  const [expanded, setExpanded] = useState(true)

  const withinBudget  = cat.vendors_found > 0
  const anyAvailable  = cat.any_vendors_found > 0
  const selectedInCat = selectedVendors[cat.category_key]

  const hdr = withinBudget
    ? { bg: '#f0fdf4', border: '#4ade80', text: '#166534', badgeBg: '#dcfce7', badgeText: '#166534' }
    : anyAvailable
      ? { bg: '#fffbeb', border: '#fbbf24', text: '#78350f', badgeBg: '#fde68a', badgeText: '#78350f' }
      : { bg: '#fef2f2', border: '#f87171', text: '#7f1d1d', badgeBg: '#fee2e2', badgeText: '#7f1d1d' }

  return (
    <div style={{ border: `2px solid ${hdr.border}`, borderRadius: 12, marginBottom: 14, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: hdr.bg, padding: '14px 18px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={() => setExpanded(e => !e)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: hdr.text }}>{cat.category_label}</span>
          <span style={{ background: hdr.badgeBg, color: hdr.badgeText, borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>
            {withinBudget
              ? `✅ ${cat.vendors_found} within budget`
              : anyAvailable
                ? `⚠️ ${cat.any_vendors_found} found — budget too low`
                : '❌ No vendors found'}
          </span>
          <span style={{ fontSize: 12, color: hdr.text }}>Allocated: {fmt(cat.allocated_budget)}</span>
          {cat.min_price_available && cat.min_price_available > cat.allocated_budget && (
            <span style={{ fontSize: 12, color: '#b45309', fontWeight: 600 }}>
              Cheapest: {fmt(cat.min_price_available)} (+{fmt(cat.budget_shortfall)} needed)
            </span>
          )}
          {selectedInCat && (
            <span style={{ background: 'var(--blue)', color: '#fff', borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
              ✓ Selected: {selectedInCat.vendor_name}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp size={16} color={hdr.text} /> : <ChevronDown size={16} color={hdr.text} />}
      </div>

      {/* Vendor rows */}
      {expanded && (
        <div style={{ background: '#fff', padding: '10px 18px' }}>
          {cat.top_vendors.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--gray-400)', fontSize: 13 }}>
              No vendors found. Try expanding radius or adjusting budget.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {cat.top_vendors.map((v, idx) => {
                const isSelected = selectedInCat?.vendor_id === v.vendor_id
                const overBudget = v.price > cat.allocated_budget

                return (
                  <div
                    key={`${v.vendor_id}-${idx}`}
                    style={{
                      background:   isSelected ? 'var(--blue-pale)' : 'var(--gray-50)',
                      border:       `1.5px solid ${isSelected ? 'var(--blue)' : 'var(--gray-200)'}`,
                      borderRadius: 10,
                      padding:      '12px 16px',
                      display:      'flex',
                      alignItems:   'center',
                      gap:          12,
                      cursor:       'pointer',
                      transition:   'border-color .15s, background .15s',
                    }}
                    onClick={() => onViewVendor(v.vendor_id, cat.category_key)}
                  >
                    {/* Vendor info */}
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--gray-800)' }}>
                          {v.vendor_name}
                        </span>
                        {isSelected && <span className="badge badge-blue" style={{ fontSize: 10 }}>✓ Selected</span>}
                        {overBudget && <span className="badge badge-amber" style={{ fontSize: 10 }}>Over budget</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 3 }}>
                        📍 {v.address} · {v.distance_km} km · ⭐ {v.rating.toFixed(1)}
                      </div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                        <span className="badge badge-purple" style={{ fontSize: 10 }}>{v.service_name}</span>
                        <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>
                          Deposit: {v.deposit_percent}%{v.vat_applicable ? ' · +7.5% VAT' : ''}
                        </span>
                      </div>
                    </div>

                    {/* Price */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: 16, color: overBudget ? 'var(--amber)' : 'var(--green)' }}>
                        {fmt(v.price)}
                      </div>
                      {overBudget && (
                        <div style={{ fontSize: 10, color: 'var(--amber)' }}>
                          +{fmt(v.price - cat.allocated_budget)} over
                        </div>
                      )}
                    </div>

                    {/* Select button */}
                    <button
                      className={`btn btn-sm ${isSelected ? 'btn-danger' : 'btn-primary'}`}
                      style={{ flexShrink: 0 }}
                      title={isSelected ? 'Remove from custom package' : 'Add to custom package'}
                      onClick={e => {
                        e.stopPropagation()
                        onToggleSelect(v, cat.category_label)
                      }}
                    >
                      {isSelected ? <><X size={12} /> Remove</> : <><Plus size={12} /> Select</>}
                    </button>

                    {/* Eye icon */}
                    <div style={{ color: 'var(--gray-400)', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                      <Eye size={15} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}


// ─── ExtraInfoFields ──────────────────────────────────────────────────────────
function ExtraInfoFields({ infoFields, values, onChange }) {
  if (!infoFields?.length) return null
  return (
    <div style={{ marginTop: 10, padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-500)', textTransform: 'uppercase', marginBottom: 8 }}>
        Service Details
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {infoFields.map(field => (
          <div key={field.name}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-700)', display: 'block', marginBottom: 4 }}>
              {field.label}{field.unit ? ` (${field.unit})` : ''}
            </label>
            {field.type === 'select' ? (
              <select className="form-control" style={{ padding: '6px 10px', fontSize: 13 }}
                value={values?.[field.name] || ''} onChange={e => onChange(field.name, e.target.value)}>
                <option value="">— Select —</option>
                {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : (
              <input className="form-control" type={field.type || 'text'} style={{ padding: '6px 10px', fontSize: 13 }}
                placeholder={field.placeholder || ''} value={values?.[field.name] || ''}
                onChange={e => onChange(field.name, e.target.value)} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Banners ──────────────────────────────────────────────────────────────────
function RecommendationBanner({ reason, labels }) {
  return (
    <div style={{ background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: 12, padding: '18px 22px', marginBottom: 20, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <AlertTriangle size={22} style={{ color: '#d97706', flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <p style={{ fontWeight: 700, fontSize: 15, color: '#92400e', marginBottom: 6 }}>⚡ Close Recommendations — Not an Exact Match</p>
        <p style={{ fontSize: 13, color: '#78350f', lineHeight: 1.6, marginBottom: labels.length ? 10 : 0 }}>{reason}</p>
        {labels.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {labels.map((label, i) => (
              <span key={i} style={{ background: '#fde68a', color: '#78350f', borderRadius: 99, padding: '3px 12px', fontSize: 12, fontWeight: 600, border: '1px solid #fbbf24' }}>
                ⚠ {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function NoPackageBanner({ reason }) {
  return (
    <div style={{ background: '#fef2f2', border: '2px solid #f87171', borderRadius: 12, padding: '18px 22px', marginBottom: 20, display: 'flex', gap: 14, alignItems: 'flex-start' }}>
      <AlertTriangle size={22} style={{ color: '#dc2626', flexShrink: 0, marginTop: 2 }} />
      <div>
        <p style={{ fontWeight: 700, fontSize: 15, color: '#7f1d1d', marginBottom: 6 }}>No Complete Package Found</p>
        <p style={{ fontSize: 13, color: '#991b1b', lineHeight: 1.6 }}>{reason}</p>
        <p style={{ fontSize: 13, color: '#991b1b', marginTop: 8, fontWeight: 600 }}>
          👇 Select individual vendors below to build your own custom package.
        </p>
      </div>
    </div>
  )
}

// ─── PackageCard ──────────────────────────────────────────────────────────────
function PackageCard({ pkg, events, userType, isRecommendation, onViewVendor, onBookingSuccess }) {
  const [selectedEventId, setSelectedEventId] = useState('')
  const [isBooking, setIsBooking]             = useState(false)
  const canBook = userType === 'organizer' || userType === 'admin'

  async function handleBookAll() {
    if (!selectedEventId) { toast.error('Please select an event first'); return }
    setIsBooking(true)
    const bookedVendorIds = []
    for (const vendor of pkg.vendors) {
      try {
        await bookingsAPI.create({
          event_id:         parseInt(selectedEventId),
          vendor_id:        vendor.vendor_id,
          vendor_service_id: vendor.vendor_service_id || null,
          service_details:  `${vendor.service_name} — booked via Vendor Discovery`,
          agreed_price:     vendor.price,
        })
        bookedVendorIds.push(vendor.vendor_id)
      } catch (err) {
        console.warn(`Booking failed for vendor ${vendor.vendor_id}:`, err)
      }
    }
    toast.success(`${bookedVendorIds.length} / ${pkg.vendors.length} vendors booked!`)
    setIsBooking(false)
    if (bookedVendorIds.length > 0 && onBookingSuccess) {
      onBookingSuccess(bookedVendorIds)
    }
  }

  return (
    <div className="card" style={{ border: `2px solid ${isRecommendation ? '#f59e0b' : 'var(--gray-200)'}`, marginBottom: 16 }}>
      <div style={{ padding: '16px 20px', background: isRecommendation ? '#78350f' : 'var(--navy)', borderRadius: '8px 8px 0 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Package #{pkg.package_number}</span>
            {isRecommendation && <span style={{ marginLeft: 10, background: '#fde68a', color: '#78350f', borderRadius: 99, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>⚡ Close Match</span>}
            <span style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, marginLeft: 12 }}>{pkg.vendors.length} vendors</span>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#4ade80', fontWeight: 800, fontSize: 18 }}>{fmt(pkg.total_cost)}</div>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 11 }}>Saves {fmt(pkg.savings)}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: '12px 20px' }}>
        {pkg.vendors.map((vendor, idx) => (
          <div key={`${vendor.vendor_id}-${idx}`}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: idx < pkg.vendors.length - 1 ? '1px solid var(--gray-100)' : 'none', cursor: 'pointer' }}
            onClick={() => onViewVendor(vendor.vendor_id, vendor.category_key)}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                {vendor.vendor_name}
                <Eye size={12} style={{ color: 'var(--gray-400)' }} />
              </div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                {vendor.address} · 📍 {vendor.distance_km} km · ⭐ {vendor.rating.toFixed(1)}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                <span className="badge badge-purple" style={{ fontSize: 10 }}>{vendor.category_label}</span>
                <span className="badge badge-blue"   style={{ fontSize: 10 }}>{vendor.service_name}</span>
              </div>
            </div>
            <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--green)', marginLeft: 16, flexShrink: 0 }}>
              {fmt(vendor.price)}
            </div>
          </div>
        ))}
      </div>

      {canBook && (
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--gray-200)', background: 'var(--gray-50)', borderRadius: '0 0 8px 8px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select className="form-control" style={{ width: 240, margin: 0 }} value={selectedEventId}
              onChange={e => setSelectedEventId(e.target.value)}>
              <option value="">Link to an active event…</option>
              {events.filter(e => e.status === 'active').map(e => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            <button className="btn btn-primary" onClick={handleBookAll} disabled={isBooking || !selectedEventId}>
              <CheckCircle size={14} />
              {isBooking ? 'Booking…' : 'Book All Vendors'}
            </button>
          </div>
        </div>
      )}
      {!canBook && (
        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--gray-200)', background: 'var(--blue-pale)', borderRadius: '0 0 8px 8px', fontSize: 12, color: 'var(--blue)' }}>
          ℹ Booking is restricted to event organisers.
        </div>
      )}
    </div>
  )
}


// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function EventPlanner() {
  const { user }                         = useAuth()
  const [events,      setEvents]         = useState([])
  const [categories,  setCategories]     = useState([])
  const [result,      setResult]         = useState(null)
  const [isLoading,   setIsLoading]      = useState(false)
  const [notifTick,   setNotifTick]      = useState(0)

  // Custom package selection — keyed by category_key
  const [selectedVendors, setSelectedVendors] = useState({})

  // Vendor detail modal
  const [detailVendorId,  setDetailVendorId]  = useState(null)
  const [detailCatKey,    setDetailCatKey]    = useState(null)

  // Post-booking contact modal
  const [bookedContacts,      setBookedContacts]      = useState([])
  const [showContactModal,    setShowContactModal]    = useState(false)

  useSocket(() => setNotifTick(t => t + 1))

  const [form, setForm] = useState({
    event_date: new Date().toISOString().slice(0, 16),
    total_budget: '', attendee_count: '',
    event_lat: '9.0820', event_lng: '8.6753',
    venue_address: '', search_radius_km: 50,
  })

  const [services, setServices] = useState([
    { category_key: '', budget_percent: '', extra_info: {} },
  ])

  useEffect(() => {
    if (user.user_type === 'organizer' || user.user_type === 'admin') {
      eventsAPI.list().then(r => setEvents(r.data)).catch(() => {})
    }
    metaAPI.serviceCategories().then(r => setCategories(r.data)).catch(() => {})
  }, [user.user_type])

  const totalPct = services.reduce((s, sv) => s + (parseFloat(sv.budget_percent) || 0), 0)

  const addService    = () => setServices(p => [...p, { category_key: '', budget_percent: '', extra_info: {} }])
  const removeService = i  => setServices(p => p.filter((_, j) => j !== i))
  const updateService = (i, f, v) => setServices(p => p.map((s, j) => j === i ? { ...s, [f]: v } : s))
  const updateExtra   = (i, k, v) => setServices(p => p.map((s, j) => j === i ? { ...s, extra_info: { ...s.extra_info, [k]: v } } : s))
  const splitEvenly   = () => {
    const per = Math.floor(100 / services.length)
    const rem = 100 - per * services.length
    setServices(p => p.map((s, i) => ({ ...s, budget_percent: i === 0 ? per + rem : per })))
  }

  // ── Open vendor detail modal ─────────────────────────────────────────────
  function openVendorDetail(vendorId, catKey) {
    setDetailVendorId(vendorId)
    setDetailCatKey(catKey || null)
  }

  // ── Toggle custom selection ──────────────────────────────────────────────
  function toggleSelect(matchedVendor, categoryLabel) {
    setSelectedVendors(prev => {
      const existing = prev[matchedVendor.category_key]
      if (existing && existing.vendor_id === matchedVendor.vendor_id) {
        const next = { ...prev }
        delete next[matchedVendor.category_key]
        return next
      }
      return {
        ...prev,
        [matchedVendor.category_key]: {
          ...matchedVendor,
          category_label: categoryLabel || matchedVendor.category_key,
        },
      }
    })
  }

  // ── Fetch vendor contacts (after booking) ────────────────────────────────
  async function fetchContacts(vendorIds) {
    const results = await Promise.allSettled(
      vendorIds.map(id => vendorsAPI.get(id))
    )
    return results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value.data)
  }

  // ── Handle booking success → show contact modal ──────────────────────────
  async function handleBookingSuccess(vendorIds) {
    const contacts = await fetchContacts(vendorIds)
    setBookedContacts(contacts)
    setShowContactModal(true)
  }

  // ── Book custom package ──────────────────────────────────────────────────
  async function handleBookCustom(eventId) {
    const items = Object.values(selectedVendors)
    if (items.length === 0) return false

    let successCount = 0
    const bookedIds = []
    for (const v of items) {
      try {
        await bookingsAPI.create({
          event_id:          parseInt(eventId),
          vendor_id:         v.vendor_id,
          vendor_service_id: v.vendor_service_id || null,
          service_details:   `${v.service_name} — Custom package`,
          agreed_price:      v.price || null,
        })
        successCount++
        bookedIds.push(v.vendor_id)
      } catch (err) {
        console.warn(`Custom booking failed for vendor ${v.vendor_id}:`, err)
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} vendor${successCount > 1 ? 's' : ''} booked!`)
      setSelectedVendors({})
      const contacts = await fetchContacts(bookedIds)
      setBookedContacts(contacts)
      setShowContactModal(true)
      return true
    } else {
      toast.error('All bookings failed. Please try again.')
      return false
    }
  }

  // ── Search ───────────────────────────────────────────────────────────────
  async function handleSearch(e) {
    e.preventDefault()
    if (Math.abs(totalPct - 100) > 0.5) { toast.error(`Budget allocations must total 100% (currently ${totalPct.toFixed(1)}%)`); return }
    if (services.some(s => !s.category_key)) { toast.error('Please select a service category for every row'); return }
    setIsLoading(true)
    setResult(null)
    setSelectedVendors({})
    try {
      const payload = {
        event_date: form.event_date, total_budget: parseFloat(form.total_budget),
        attendee_count: parseInt(form.attendee_count),
        event_lat: parseFloat(form.event_lat), event_lng: parseFloat(form.event_lng),
        search_radius_km: parseFloat(form.search_radius_km),
        services: services.map(s => ({
          category_key: s.category_key,
          budget_percent: parseFloat(s.budget_percent),
          extra_info: Object.keys(s.extra_info || {}).length ? s.extra_info : null,
        })),
      }
      const { data } = await api.post('/planner', payload)
      setResult(data)
      if (data.packages.length > 0 && !data.is_recommendation)
        toast.success(`Found ${data.packages.length} exact package${data.packages.length > 1 ? 's' : ''}!`)
      else if (data.packages.length > 0)
        toast(`${data.packages.length} close match${data.packages.length > 1 ? 'es' : ''} found.`, { icon: '⚡' })
      else
        toast('No packages found — select vendors below to build your own.', { icon: '🔍', duration: 6000 })
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Search failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  const hasSelections = Object.keys(selectedVendors).length > 0
  const canBook       = user.user_type === 'organizer' || user.user_type === 'admin'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-content">
        <Topbar title="Find Vendors" onNotif={notifTick} />
        <div className="page" style={{ maxWidth: 1000, paddingBottom: hasSelections ? 140 : 32 }}>
          <p className="page-title">Find Vendors</p>
          <p className="page-subtitle">
            Vendor Discovery — Real-time MCDM matching with Haversine geolocation across all service categories
          </p>

          {/* ── Search Form ── */}
          <div className="card" style={{ marginBottom: 24 }}>
            <div className="card-header"><span className="fw-600">Event & Budget Details</span></div>
            <div className="card-body">
              <form onSubmit={handleSearch}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 16 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Event Date &amp; Time *</label>
                    <input className="form-control" type="datetime-local" required value={form.event_date}
                      onChange={e => setForm(p => ({ ...p, event_date: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Total Budget (₦) *</label>
                    <input className="form-control" type="number" required placeholder="3000000" value={form.total_budget}
                      onChange={e => setForm(p => ({ ...p, total_budget: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Expected Attendees *</label>
                    <input className="form-control" type="number" required placeholder="100" value={form.attendee_count}
                      onChange={e => setForm(p => ({ ...p, attendee_count: e.target.value }))} />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label>Search Radius (km)</label>
                    <input className="form-control" type="number" min={1} max={2000} value={form.search_radius_km}
                      onChange={e => setForm(p => ({ ...p, search_radius_km: e.target.value }))} />
                    <p className="form-hint" style={{ fontSize: 11 }}>Tip: 1000 km = nationwide</p>
                  </div>
                </div>

                <div className="form-group">
                  <label>Event Venue <span style={{ fontSize: 11, color: 'var(--gray-400)', fontWeight: 400, marginLeft: 6 }}>— auto-fills coordinates via OpenStreetMap</span></label>
                  <AddressAutocomplete value={form.venue_address}
                    onChange={addr => setForm(p => ({ ...p, venue_address: addr }))}
                    onPlaceSelect={({ address, lat, lng }) => {
                      setForm(p => ({ ...p, venue_address: address, event_lat: lat.toFixed(6), event_lng: lng.toFixed(6) }))
                      toast.success('Venue location set!')
                    }}
                    placeholder="e.g. Landmark Centre, Victoria Island, Lagos" />
                  <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--gray-400)', marginTop: 4 }}>
                    <span>Lat: {form.event_lat}</span><span>Lng: {form.event_lng}</span>
                  </div>
                </div>

                {/* Services */}
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <p className="fw-600">Services Required</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={splitEvenly}>⚡ Split Evenly</button>
                      <button type="button" className="btn btn-primary btn-sm" onClick={addService}><Plus size={13} /> Add Service</button>
                    </div>
                  </div>
                  {services.map((svc, idx) => {
                    const catDef = categories.find(c => c.key === svc.category_key)
                    const allocated = svc.budget_percent && form.total_budget
                      ? parseFloat(form.total_budget) * parseFloat(svc.budget_percent) / 100 : null
                    return (
                      <div key={idx} style={{ background: 'var(--gray-50)', border: '1.5px solid var(--gray-200)', borderRadius: 10, padding: '14px 16px', marginBottom: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '2fr 120px 120px auto', gap: 12, alignItems: 'end' }}>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: 12 }}>Service Category *</label>
                            <select className="form-control" required value={svc.category_key}
                              onChange={e => { updateService(idx, 'category_key', e.target.value); updateService(idx, 'extra_info', {}) }}>
                              <option value="">— Select —</option>
                              {categories.map(c => <option key={c.key} value={c.key}>{c.icon} {c.label}</option>)}
                            </select>
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: 12 }}>Budget %</label>
                            <input className="form-control" type="number" min={1} max={100} placeholder="e.g. 40"
                              value={svc.budget_percent} onChange={e => updateService(idx, 'budget_percent', e.target.value)} />
                          </div>
                          <div className="form-group" style={{ margin: 0 }}>
                            <label style={{ fontSize: 12 }}>Allocated</label>
                            <div style={{ padding: '8px 10px', background: '#fff', border: '1.5px solid var(--gray-200)', borderRadius: 8, fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>
                              {allocated ? fmt(allocated) : '—'}
                            </div>
                          </div>
                          <button type="button" className="btn btn-ghost btn-sm text-danger"
                            onClick={() => removeService(idx)} disabled={services.length === 1} style={{ marginBottom: 2 }}>
                            <Trash2 size={15} />
                          </button>
                        </div>
                        {catDef?.info_fields && (
                          <ExtraInfoFields infoFields={catDef.info_fields} values={svc.extra_info}
                            onChange={(k, v) => updateExtra(idx, k, v)} />
                        )}
                      </div>
                    )
                  })}

                  {/* Budget bar */}
                  <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 10, border: `1.5px solid ${pctColor(totalPct)}`,
                    background: Math.abs(totalPct - 100) < 0.5 ? 'var(--green-lt)' : totalPct > 100 ? 'var(--red-lt)' : 'var(--amber-lt)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: pctColor(totalPct) }}>
                        Total Allocation: {totalPct.toFixed(1)}%
                        {Math.abs(totalPct - 100) > 0.5 && (
                          <span style={{ fontSize: 12, marginLeft: 8 }}>
                            {totalPct > 100 ? `Over by ${(totalPct - 100).toFixed(1)}%` : `${(100 - totalPct).toFixed(1)}% remaining`}
                          </span>
                        )}
                      </span>
                      {Math.abs(totalPct - 100) < 0.5 && <span style={{ color: 'var(--green)', fontWeight: 700 }}>✅ Ready to search!</span>}
                    </div>
                    <div style={{ height: 6, background: 'rgba(0,0,0,.1)', borderRadius: 3, marginTop: 8 }}>
                      <div style={{ height: '100%', width: `${Math.min(totalPct, 100)}%`, background: pctColor(totalPct), borderRadius: 3, transition: 'width .3s ease' }} />
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 20 }}>
                  <button className="btn btn-primary btn-lg" type="submit" disabled={isLoading}>
                    <Search size={16} />
                    {isLoading ? 'Searching…' : 'Find Vendor Packages'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="loading">
              <div className="spinner" />
              <span style={{ marginLeft: 12, color: 'var(--gray-500)' }}>Running MCDM matching…</span>
            </div>
          )}

          {/* Results */}
          {result && !isLoading && (
            <div>
              {result.is_recommendation && result.packages.length > 0 && (
                <RecommendationBanner reason={result.recommendation_reason} labels={result.recommendation_labels} />
              )}
              {result.packages.length === 0 && (
                <NoPackageBanner reason={result.recommendation_reason} />
              )}

              {/* Packages */}
              {result.packages.length > 0 && (
                <div style={{ marginBottom: 24 }}>
                  <p className="section-title" style={{ color: result.is_recommendation ? '#92400e' : undefined }}>
                    {result.is_recommendation ? '⚡' : '✅'} {result.packages.length} {result.is_recommendation ? 'Close Match' : 'Exact Package'}{result.packages.length > 1 ? 'es' : ''} Found
                  </p>
                  <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 16 }}>
                    Click any vendor name to view full details and contact information.
                  </p>
                  {result.packages.map(pkg => (
                    <PackageCard key={pkg.package_number} pkg={pkg} events={events}
                      userType={user.user_type} isRecommendation={result.is_recommendation}
                      onViewVendor={openVendorDetail}
                      onBookingSuccess={handleBookingSuccess} />
                  ))}
                </div>
              )}

              {/* Per-category breakdown */}
              {result.per_category?.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <Info size={16} style={{ color: 'var(--blue)' }} />
                    <p className="section-title" style={{ margin: 0 }}>
                      {result.packages.length === 0
                        ? '🔍 Build Your Custom Package — Select Vendors Below'
                        : '📊 Category Breakdown — Select Individual Vendors'}
                    </p>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 16 }}>
                    Click any vendor row to <strong>view full details</strong>, or click{' '}
                    <strong>Select</strong> to add them to your custom package.
                    You can mix and match one vendor per category.
                  </p>
                  {result.per_category.map(cat => (
                    <CategoryBestCard key={cat.category_key} cat={cat}
                      selectedVendors={selectedVendors}
                      onToggleSelect={toggleSelect}
                      onViewVendor={openVendorDetail} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Vendor Detail Modal ── */}
      {detailVendorId && (
        <VendorDetailModal
          vendorId={detailVendorId}
          searchedCategoryKey={detailCatKey}
          isSelected={
            detailCatKey
              ? selectedVendors[detailCatKey]?.vendor_id === detailVendorId
              : false
          }
          onClose={() => { setDetailVendorId(null); setDetailCatKey(null) }}
          onSelect={canBook ? (v) => toggleSelect(v, v.category_key) : null}
        />
      )}

      {/* ── Post-Booking Contact Modal ── */}
      {showContactModal && bookedContacts.length > 0 && (
        <BookingSuccessModal
          contacts={bookedContacts}
          onClose={() => { setShowContactModal(false); setBookedContacts([]) }}
        />
      )}

      {/* ── Custom Package Panel (floating bottom) ── */}
      <CustomPackagePanel
        selected={selectedVendors}
        events={events}
        userType={user.user_type}
        onRemove={catKey => setSelectedVendors(p => { const n = { ...p }; delete n[catKey]; return n })}
        onBook={handleBookCustom}
        onViewVendor={openVendorDetail}
      />
    </div>
  )
}
