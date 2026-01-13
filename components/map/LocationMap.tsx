'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix for default marker icons in Leaflet
const iconPrototype = L.Icon.Default.prototype as unknown as { _getIconUrl?: string }
delete iconPrototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

interface LocationMapProps {
  latitude?: number
  longitude?: number
  onLocationSelect?: (lat: number, lng: number) => void
  editable?: boolean
  height?: string
  zoom?: number
}

export default function LocationMap({
  latitude,
  longitude,
  onLocationSelect,
  editable = false,
  height = '400px',
  zoom = 13
}: LocationMapProps) {
  const mapRef = useRef<L.Map | null>(null)
  const markerRef = useRef<L.Marker | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    if (mapRef.current) return // Already initialized

    // Small delay to ensure container is rendered
    const timer = setTimeout(() => {
      if (!containerRef.current) return

      // Initialize map
      const map = L.map(containerRef.current).setView(
        [latitude || 40.4168, longitude || -3.7038], // Default to Madrid
        zoom
      )

      // Add OpenFreeMap tiles
      L.tileLayer('https://tiles.openfreemap.org/osm/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap contributors'
      }).addTo(map)

      mapRef.current = map

      // Add marker if coordinates provided
      if (latitude && longitude) {
        const marker = L.marker([latitude, longitude]).addTo(map)
        markerRef.current = marker
      }

      // Add click handler for editable mode
      if (editable && onLocationSelect) {
        map.on('click', (e: L.LeafletMouseEvent) => {
          const { lat, lng } = e.latlng
          
          // Remove existing marker
          if (markerRef.current) {
            markerRef.current.remove()
          }
          
          // Add new marker
          const marker = L.marker([lat, lng]).addTo(map)
          markerRef.current = marker
          
          // Call callback
          onLocationSelect(lat, lng)
        })
      }

      // Force map to recalculate size
      setTimeout(() => {
        map.invalidateSize()
      }, 100)
    }, 100)

    // Cleanup
    return () => {
      clearTimeout(timer)
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, []) // Only run once on mount

  // Update marker when coordinates change
  useEffect(() => {
    if (!mapRef.current || !latitude || !longitude) return

    if (markerRef.current) {
      markerRef.current.setLatLng([latitude, longitude])
    } else {
      const marker = L.marker([latitude, longitude]).addTo(mapRef.current)
      markerRef.current = marker
    }

    mapRef.current.setView([latitude, longitude], zoom)
  }, [latitude, longitude, zoom])

  return (
    <div 
      ref={containerRef} 
      style={{ height, width: '100%' }}
      className="rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700"
    />
  )
}
