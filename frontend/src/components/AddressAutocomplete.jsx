import { useEffect, useRef, useState } from 'react'

/**
 * Google Places Autocomplete input.
 * Requires window.google to be loaded (via index.html script tag).
 * Falls back to plain text input if Google Maps is not available.
 */
export default function AddressAutocomplete({ value, onChange, onPlaceSelect, placeholder = 'Start typing an address…' }) {
  const inputRef = useRef(null)
  const autocompleteRef = useRef(null)
  const [googleAvailable, setGoogleAvailable] = useState(false)

  useEffect(() => {
    // Wait for Google Maps to load
    const check = () => {
      if (window.google?.maps?.places) {
        setGoogleAvailable(true)
      } else {
        setTimeout(check, 500)
      }
    }
    check()
  }, [])

  useEffect(() => {
    if (!googleAvailable || !inputRef.current) return

    autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ['geocode', 'establishment'],
      componentRestrictions: { country: 'ng' }, // Nigeria only
      fields: ['formatted_address', 'geometry', 'name'],
    })

    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current.getPlace()
      if (!place.geometry) return

      const lat = place.geometry.location.lat()
      const lng = place.geometry.location.lng()
      const address = place.formatted_address || place.name || ''

      onChange(address)
      if (onPlaceSelect) onPlaceSelect({ address, lat, lng })
    })

    return () => {
      if (window.google?.maps?.event && autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current)
      }
    }
  }, [googleAvailable])

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        className="form-control"
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete="off"
      />
      {!googleAvailable && (
        <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4 }}>
          ⚠️ Google Maps not configured — enter address manually.{' '}
          <a href="#" style={{ color: 'var(--blue)' }}
            onClick={e => { e.preventDefault(); window.open('https://console.cloud.google.com/apis/library/places-backend.googleapis.com', '_blank') }}>
            Get API key
          </a>
        </div>
      )}
      {googleAvailable && (
        <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
          🔍 Powered by Google Places — latitude & longitude auto-populate on selection
        </div>
      )}
    </div>
  )
}
