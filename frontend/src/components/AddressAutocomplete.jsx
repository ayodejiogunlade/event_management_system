/**
 * @fileoverview AddressAutocomplete — Free Open-Source Geocoding Component
 *
 * Replaces the previous Google Maps Places implementation with fully free,
 * open-source alternatives that require no API key or billing account.
 *
 * ─── Services Used ──────────────────────────────────────────────────────────
 *
 *  Photon  (https://photon.komoot.io)
 *    • "Search as you type" real-time address suggestions
 *    • Backed by OpenStreetMap data; worldwide coverage
 *    • Free forever, no key required
 *    • Endpoint: GET https://photon.komoot.io/api/?q=query&limit=6
 *
 *  Nominatim  (https://nominatim.openstreetmap.org)
 *    • Reverse geocoding: GPS coordinates → human-readable address
 *    • Used exclusively for the "Use My Location" feature
 *    • Free, open-source, no key required
 *    • Endpoint: GET https://nominatim.openstreetmap.org/reverse?format=json&lat=&lon=
 *
 *  Browser Geolocation API  (navigator.geolocation)
 *    • Reads the device's GPS / location service
 *    • The browser requests permission from the user on first use
 *    • Works on desktop (IP-approximation) and mobile (GPS chip)
 *
 * ─── Props ──────────────────────────────────────────────────────────────────
 *
 *  value          {string}    Controlled input value (the address string)
 *  onChange       {Function}  Called with new address string on every keystroke
 *  onPlaceSelect  {Function}  Called with { address, lat, lng } on selection
 *  placeholder    {string}    Input placeholder text
 *  biasLat        {number}    Optional latitude to bias search results (default: Nigeria)
 *  biasLng        {number}    Optional longitude to bias search results (default: Nigeria)
 *
 * ─── Usage Example ──────────────────────────────────────────────────────────
 *
 *  <AddressAutocomplete
 *    value={address}
 *    onChange={setAddress}
 *    onPlaceSelect={({ address, lat, lng }) => {
 *      setAddress(address)
 *      setLat(lat)
 *      setLng(lng)
 *    }}
 *    placeholder="Search for a venue..."
 *  />
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { MapPin, Navigation, Loader2, X, ChevronDown } from 'lucide-react'

/* ─── API Configuration ──────────────────────────────────────────────────── */

/**
 * Photon autocomplete API endpoint.
 * Documentation: https://photon.komoot.io
 */
const PHOTON_ENDPOINT = 'https://photon.komoot.io/api'

/**
 * Nominatim reverse-geocoding endpoint.
 * Documentation: https://nominatim.org/release-docs/develop/api/Reverse/
 */
const NOMINATIM_REVERSE_ENDPOINT = 'https://nominatim.openstreetmap.org/reverse'

/** Maximum number of autocomplete suggestions to display */
const MAX_SUGGESTIONS = 6

/**
 * Debounce delay in milliseconds.
 * Prevents a new API request on every single keystroke.
 * 350ms is a good balance between responsiveness and minimising requests.
 */
const DEBOUNCE_DELAY_MS = 350

/**
 * Minimum character count before triggering a suggestion fetch.
 * Avoids meaningless results for very short queries.
 */
const MIN_QUERY_LENGTH = 2

/* ─── Utility Functions ──────────────────────────────────────────────────── */

/**
 * Formats a Photon GeoJSON feature into a clean, human-readable address string.
 *
 * Photon feature properties may include:
 *   name, street, housenumber, district, city, town, village, state, country
 *
 * @param {GeoJSON.Feature} feature - A single result from the Photon API
 * @returns {string} A formatted address string (e.g. "22 Adeola Odeku, Victoria Island, Lagos, Nigeria")
 */
function formatPhotonResult(feature) {
  const p = feature.properties
  const segments = []

  // Most specific first: name (if different from the street)
  if (p.name && p.name !== p.street) segments.push(p.name)

  // Street with house number, or street alone
  if (p.housenumber && p.street) {
    segments.push(`${p.housenumber} ${p.street}`)
  } else if (p.street) {
    segments.push(p.street)
  }

  // District / neighbourhood (if different from city)
  if (p.district && p.district !== (p.city || p.town || p.village)) {
    segments.push(p.district)
  }

  // City / town / village — pick the most specific available
  const locality = p.city || p.town || p.village || p.municipality
  if (locality) segments.push(locality)

  // State / region (if different from city)
  if (p.state && p.state !== locality) segments.push(p.state)

  // Country
  if (p.country) segments.push(p.country)

  // Deduplicate consecutive identical values while preserving order
  const unique = segments.reduce((acc, cur) => {
    if (acc.length === 0 || acc[acc.length - 1].toLowerCase() !== cur.toLowerCase()) {
      acc.push(cur)
    }
    return acc
  }, [])

  return unique.join(', ')
}

/**
 * Extracts latitude and longitude from a Photon GeoJSON feature.
 *
 * ⚠ Photon uses [longitude, latitude] order in geometry.coordinates (GeoJSON standard).
 *   This function swaps them to the more conventional { lat, lng } format.
 *
 * @param {GeoJSON.Feature} feature
 * @returns {{ lat: number, lng: number }}
 */
function extractCoordinates(feature) {
  const [lng, lat] = feature.geometry.coordinates
  return { lat, lng }
}

/**
 * Returns a short human-readable "type label" for a Photon result
 * (e.g. "city", "street", "venue") to display as a sub-label.
 *
 * @param {GeoJSON.Feature} feature
 * @returns {string}
 */
function getFeatureTypeLabel(feature) {
  const p = feature.properties
  const typeMap = {
    city:          '🏙 City',
    town:          '🏘 Town',
    village:       '🌾 Village',
    street:        '🛣 Street',
    house:         '🏠 Address',
    locality:      '📍 Locality',
    district:      '🗺 District',
    country:       '🌍 Country',
    state:         '🗾 State',
    county:        '🗺 County',
    amenity:       '🏢 Place',
    aerodrome:     '✈ Airport',
    water:         '💧 Water',
    natural:       '🌿 Natural',
  }
  return typeMap[p.osm_value] || typeMap[p.type] || ''
}

/* ─── Component ──────────────────────────────────────────────────────────── */

/**
 * AddressAutocomplete
 *
 * A fully-featured, accessible address search input that provides real-time
 * suggestions as the user types and resolves latitude/longitude on selection.
 */
export default function AddressAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = 'Start typing an address…',
  // Default bias coordinates: geographical centre of Nigeria
  // Photon will prefer nearby results while still returning global ones
  biasLat = 9.0820,
  biasLng = 8.6753,
}) {
  const [suggestions, setSuggestions]     = useState([])
  const [isLoading, setIsLoading]         = useState(false)
  const [isLocating, setIsLocating]       = useState(false)
  const [showDropdown, setShowDropdown]   = useState(false)
  const [activeIndex, setActiveIndex]     = useState(-1)
  const [error, setError]                 = useState('')

  /** Container ref — used to detect clicks outside and close the dropdown */
  const containerRef  = useRef(null)
  /** Holds the debounce timer so it can be cancelled on each new keystroke */
  const debounceTimer = useRef(null)
  /** AbortController to cancel in-flight fetch requests when a new one starts */
  const abortCtrlRef  = useRef(null)

  /* ── Close dropdown when user clicks anywhere outside the component ── */
  useEffect(() => {
    function handleOutsideClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setShowDropdown(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  /**
   * Fetches autocomplete suggestions from the Photon API.
   * Cancels any previous in-flight request to avoid race conditions.
   *
   * @param {string} query - The search text entered by the user
   */
  const fetchSuggestions = useCallback(async (query) => {
    // Abort any previous pending request
    if (abortCtrlRef.current) {
      abortCtrlRef.current.abort()
    }
    abortCtrlRef.current = new AbortController()

    setIsLoading(true)
    setError('')

    try {
      const params = new URLSearchParams({
        q:     query,
        limit: MAX_SUGGESTIONS,
        lat:   biasLat,   // Bias results toward this location
        lon:   biasLng,
      })

      const response = await fetch(`${PHOTON_ENDPOINT}?${params}`, {
        signal: abortCtrlRef.current.signal,
        headers: { 'Accept-Language': 'en' },
      })

      if (!response.ok) {
        throw new Error(`Photon API returned ${response.status}`)
      }

      const data = await response.json()
      const features = data.features || []

      setSuggestions(features)
      setShowDropdown(features.length > 0)
      setActiveIndex(-1)
    } catch (err) {
      // AbortError is expected when the user types quickly — ignore it
      if (err.name !== 'AbortError') {
        console.error('[AddressAutocomplete] Photon fetch failed:', err)
        setError('Could not load suggestions. Please check your connection.')
        setSuggestions([])
        setShowDropdown(false)
      }
    } finally {
      setIsLoading(false)
    }
  }, [biasLat, biasLng])

  /**
   * Handles user typing in the input field.
   * Propagates the raw value immediately (for controlled input),
   * then debounces the suggestion fetch to avoid excessive API calls.
   *
   * @param {React.ChangeEvent<HTMLInputElement>} e
   */
  function handleInputChange(e) {
    const query = e.target.value
    onChange(query)
    setError('')

    // Cancel any pending debounced fetch
    clearTimeout(debounceTimer.current)

    if (query.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }

    // Schedule a new fetch after the debounce delay
    debounceTimer.current = setTimeout(() => {
      fetchSuggestions(query.trim())
    }, DEBOUNCE_DELAY_MS)
  }

  /**
   * Handles selection of a suggestion from the dropdown.
   * Formats the address, extracts coordinates, updates state, and
   * calls the onPlaceSelect callback with the resolved place data.
   *
   * @param {GeoJSON.Feature} feature - The selected Photon feature
   */
  function handleSelect(feature) {
    const address      = formatPhotonResult(feature)
    const { lat, lng } = extractCoordinates(feature)

    // Update the input value
    onChange(address)

    // Close the dropdown
    setSuggestions([])
    setShowDropdown(false)
    setActiveIndex(-1)
    clearTimeout(debounceTimer.current)

    // Notify the parent with the resolved place data
    if (onPlaceSelect) {
      onPlaceSelect({ address, lat, lng })
    }
  }

  /**
   * Keyboard navigation handler for the dropdown.
   *
   * Supported keys:
   *   ArrowDown  — Move selection down the list
   *   ArrowUp    — Move selection up the list
   *   Enter      — Confirm the currently highlighted suggestion
   *   Escape     — Close the dropdown without selecting
   *
   * @param {React.KeyboardEvent} e
   */
  function handleKeyDown(e) {
    if (!showDropdown || suggestions.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex(i => Math.min(i + 1, suggestions.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex(i => Math.max(i - 1, -1))
        break
      case 'Enter':
        e.preventDefault()
        if (activeIndex >= 0 && activeIndex < suggestions.length) {
          handleSelect(suggestions[activeIndex])
        }
        break
      case 'Escape':
        e.preventDefault()
        setShowDropdown(false)
        setActiveIndex(-1)
        break
      default:
        break
    }
  }

  /**
   * Uses the device's Geolocation API to get the current position,
   * then calls Nominatim to reverse-geocode the coordinates into an address.
   *
   * Requires the user to grant location permission in their browser.
   * Falls back to raw coordinate string if reverse-geocoding fails.
   */
  async function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.')
      return
    }

    setIsLocating(true)
    setError('')

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords

        try {
          // Reverse-geocode the device coordinates using Nominatim
          const params = new URLSearchParams({
            format:          'json',
            lat:             lat,
            lon:             lng,
            zoom:            16,     // Street-level detail
            addressdetails:  1,
          })

          const response = await fetch(`${NOMINATIM_REVERSE_ENDPOINT}?${params}`, {
            headers: { 'Accept-Language': 'en', 'Accept': 'application/json' },
          })

          if (!response.ok) throw new Error(`Nominatim returned ${response.status}`)

          const data = await response.json()
          const address = data.display_name || `${lat.toFixed(6)}, ${lng.toFixed(6)}`

          onChange(address)
          if (onPlaceSelect) onPlaceSelect({ address, lat, lng })
        } catch (geocodeErr) {
          // Reverse geocoding failed — fall back to raw coordinates
          console.warn('[AddressAutocomplete] Nominatim reverse geocode failed:', geocodeErr)
          const address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`
          onChange(address)
          if (onPlaceSelect) onPlaceSelect({ address, lat, lng })
        } finally {
          setIsLocating(false)
        }
      },
      (geolocationError) => {
        setIsLocating(false)

        // Map GeolocationPositionError codes to user-friendly messages
        const errorMessages = {
          1: 'Location permission denied. Please allow access in your browser settings, then try again.',
          2: 'Your location could not be determined. Please try again or enter the address manually.',
          3: 'Location request timed out. Please try again.',
        }
        setError(errorMessages[geolocationError.code] || 'Could not retrieve your location.')
      },
      {
        enableHighAccuracy: true,  // Use GPS on mobile if available
        timeout:            10000, // 10 second timeout
        maximumAge:         60000, // Accept cached position up to 1 minute old
      }
    )
  }

  /** Clears the input and resets all state */
  function handleClear() {
    onChange('')
    setSuggestions([])
    setShowDropdown(false)
    setError('')
    clearTimeout(debounceTimer.current)
  }

  /* ─── Render ─────────────────────────────────────────────────────────── */
  return (
    <div ref={containerRef} style={{ position: 'relative' }}>

      {/* ── Input Row: text field + "Use My Location" button ── */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>

        {/* Address text input with pinpoint icon and clear button */}
        <div style={{ position: 'relative', flex: 1 }}>
          <MapPin
            size={14}
            style={{
              position:   'absolute',
              left:       12,
              top:        '50%',
              transform:  'translateY(-50%)',
              color:      'var(--blue)',
              pointerEvents: 'none',
              flexShrink: 0,
            }}
          />
          <input
            className="form-control"
            type="text"
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              // Re-open dropdown if there are existing suggestions
              if (suggestions.length > 0) setShowDropdown(true)
            }}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            aria-label="Address search"
            aria-autocomplete="list"
            aria-haspopup="listbox"
            aria-expanded={showDropdown}
            style={{ paddingLeft: 34, paddingRight: value ? 34 : 14 }}
          />

          {/* Clear (×) button — only shown when there is a value */}
          {value && !isLoading && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="Clear address"
              style={{
                position:    'absolute',
                right:       10,
                top:         '50%',
                transform:   'translateY(-50%)',
                background:  'none',
                border:      'none',
                cursor:      'pointer',
                color:       'var(--gray-400)',
                padding:     2,
                display:     'flex',
                alignItems:  'center',
                borderRadius: 4,
              }}
            >
              <X size={14} />
            </button>
          )}

          {/* Inline loading spinner (replaces the clear button while fetching) */}
          {isLoading && (
            <Loader2
              size={14}
              style={{
                position:   'absolute',
                right:      12,
                top:        '50%',
                transform:  'translateY(-50%)',
                color:      'var(--blue)',
                animation:  'spin .7s linear infinite',
              }}
            />
          )}
        </div>

        {/* "Use My Location" button — triggers device geolocation */}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleUseMyLocation}
          disabled={isLocating}
          title="Use your current device location"
          style={{ flexShrink: 0, gap: 5, whiteSpace: 'nowrap' }}
        >
          {isLocating
            ? <Loader2 size={13} style={{ animation: 'spin .7s linear infinite' }} />
            : <Navigation size={13} />
          }
          {isLocating ? 'Locating…' : 'My Location'}
        </button>
      </div>

      {/* ── Error message ── */}
      {error && (
        <div
          role="alert"
          style={{
            fontSize:     11,
            color:        'var(--red)',
            background:   'var(--red-lt)',
            border:       '1px solid var(--red)',
            borderRadius: 6,
            padding:      '5px 10px',
            marginTop:    5,
          }}
        >
          ⚠ {error}
        </div>
      )}

      {/* ── Attribution footer (OSM attribution is required by their usage policy) ── */}
      {!error && (
        <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 3 }}>
          🗺 Powered by{' '}
          <a
            href="https://photon.komoot.io"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--gray-400)', textDecoration: 'underline' }}
          >
            Photon
          </a>{' '}
          &amp;{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--gray-400)', textDecoration: 'underline' }}
          >
            OpenStreetMap contributors
          </a>
        </div>
      )}

      {/* ── Suggestions Dropdown ── */}
      {showDropdown && suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label="Address suggestions"
          style={{
            position:     'absolute',
            top:          'calc(100% + 2px)',
            left:         0,
            right:        0,
            zIndex:       1000,
            background:   '#fff',
            border:       '1.5px solid var(--blue)',
            borderRadius: 10,
            boxShadow:    'var(--shadow)',
            listStyle:    'none',
            margin:       0,
            padding:      '4px 0',
            maxHeight:    300,
            overflowY:    'auto',
          }}
        >
          {suggestions.map((feature, idx) => {
            const address      = formatPhotonResult(feature)
            const { lat, lng } = extractCoordinates(feature)
            const typeLabel    = getFeatureTypeLabel(feature)
            const isActive     = idx === activeIndex

            return (
              <li
                key={`${idx}-${feature.properties.osm_id || idx}`}
                role="option"
                aria-selected={isActive}
                onMouseEnter={() => setActiveIndex(idx)}
                // onMouseDown prevents the input from losing focus before onClick fires
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(feature)}
                style={{
                  padding:      '10px 14px',
                  cursor:       'pointer',
                  fontSize:     13,
                  background:   isActive ? 'var(--blue-pale)' : 'transparent',
                  borderLeft:   isActive ? '3px solid var(--blue)' : '3px solid transparent',
                  transition:   'background .12s ease, border-color .12s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  {/* Map pin icon */}
                  <MapPin
                    size={13}
                    style={{ color: 'var(--blue)', flexShrink: 0, marginTop: 2 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Address line */}
                    <div
                      style={{
                        fontWeight:   500,
                        color:        'var(--gray-800)',
                        lineHeight:   1.4,
                        whiteSpace:   'nowrap',
                        overflow:     'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {address}
                    </div>
                    {/* Coordinate + type sub-label */}
                    <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>
                      {lat.toFixed(5)}, {lng.toFixed(5)}
                      {typeLabel && <span style={{ marginLeft: 8 }}>{typeLabel}</span>}
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
