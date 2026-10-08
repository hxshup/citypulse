'use client'
import { useEffect, useRef } from 'react'
import { CITY } from '@/lib/civic/config'

const SOURCE_COLOR = { weather: '#38bdf8', traffic: '#f59e0b', transit: '#a78bfa' }
function pulseColor(score) {
  if (score >= 80) return '#10b981'
  if (score >= 60) return '#f59e0b'
  return '#ef4444'
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character])
}

export default function CivicMap({
  snapshot,
  layers,
  selectedZoneId,
  onSelectEvent,
  places = [],
  focusedPlace,
  onSelectPlace,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const LRef = useRef(null)
  const resizeTimerRef = useRef(null)
  const mapDataRef = useRef(null)
  mapDataRef.current = {
    snapshot,
    layers,
    selectedZoneId,
    onSelectEvent,
    places,
    focusedPlace,
    onSelectPlace,
  }

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const mod = await import('leaflet')
      const L = mod.default || mod
      if (!mounted || !containerRef.current) return
      LRef.current = L
      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, { zoomControl: true, attributionControl: true })
          .setView(
            mapDataRef.current?.focusedPlace
              ? [mapDataRef.current.focusedPlace.latitude, mapDataRef.current.focusedPlace.longitude]
              : CITY.center,
            mapDataRef.current?.focusedPlace ? Math.max(CITY.zoom, 15) : CITY.zoom
          )
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors', maxZoom: 19, subdomains: 'abc',
        }).addTo(mapRef.current)
        // Free OSM tiles + CSS filter for a dark, civic-tech look (no API key required).
        const pane = mapRef.current.getPane('tilePane')
        if (pane) pane.style.filter = 'invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9) saturate(0.6)'
        layerRef.current = L.layerGroup().addTo(mapRef.current)
      }
      resizeTimerRef.current = setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 200)
      draw()
    })()
    return () => {
      mounted = false
      clearTimeout(resizeTimerRef.current)
      mapRef.current?.remove()
      mapRef.current = null
      layerRef.current = null
      LRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { draw() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [snapshot, layers, selectedZoneId, places, focusedPlace])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !focusedPlace) return
    const center = [focusedPlace.latitude, focusedPlace.longitude]
    if (!center.every(Number.isFinite)) return
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    map.setView(center, Math.max(map.getZoom(), 15), { animate: !reducedMotion, duration: 0.6 })
  }, [focusedPlace])

  function draw() {
    const L = LRef.current, map = mapRef.current, lg = layerRef.current
    const {
      snapshot,
      layers,
      selectedZoneId,
      onSelectEvent,
      places,
      focusedPlace,
      onSelectPlace,
    } = mapDataRef.current || {}
    if (!L || !map || !lg || !snapshot) return
    lg.clearLayers()

    for (const zv of snapshot.zones || []) {
      const z = zv.zone
      if (z.latitude == null) continue
      const hasReports = zv.eventCount > 0
      const color = hasReports ? pulseColor(zv.pulse.score) : "#64748b"
      const selected = selectedZoneId === z.id
      L.circle([z.latitude, z.longitude], {
        radius: z.radius || 800, color, weight: selected ? 3 : 1,
        fillColor: color, fillOpacity: selected ? 0.12 : 0.05, dashArray: selected ? null : '4',
      }).addTo(lg)
      L.marker([z.latitude, z.longitude], {
        icon: L.divIcon({
          className: '', html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;font:600 11px Inter,sans-serif;color:#cbd5e1;background:rgba(15,23,42,.75);padding:2px 8px;border-radius:999px;border:1px solid rgba(148,163,184,.25)">${escapeHtml(z.label)} · ${hasReports ? zv.pulse.score : '—'}</div>`,
        }),
        interactive: false,
      }).addTo(lg)
    }
    for (const place of places) {
      if (!Number.isFinite(place.latitude) || !Number.isFinite(place.longitude)) continue
      const color = place.category === 'hospital'
        ? '#fb7185'
        : place.category === 'area'
          ? '#38bdf8'
          : '#fbbf24'
      const selected = focusedPlace?.name === place.name
      const marker = L.circleMarker([place.latitude, place.longitude], {
        radius: selected ? 8 : 5,
        color,
        weight: selected ? 2.5 : 1.5,
        fillColor: color,
        fillOpacity: selected ? 1 : 0.78,
      })
      marker.bindTooltip(`<b>${escapeHtml(place.name)}</b><br/>${escapeHtml(place.category)}`, {
        direction: 'top',
      })
      marker.on('click', () => onSelectPlace?.(place))
      marker.addTo(lg)
    }

    for (const e of snapshot.events || []) {
      if (e.latitude == null || !layers[e.source]) continue
      const base = SOURCE_COLOR[e.source] || '#94a3b8'
      const isHigh = e.severity === 'high'
      const r = isHigh ? 9 : e.severity === 'medium' ? 7 : 5
      if (layers.anomalies && isHigh) {
        L.circleMarker([e.latitude, e.longitude], {
          radius: r + 7, color: '#ef4444', weight: 1, fillColor: '#ef4444', fillOpacity: 0.12,
        }).addTo(lg)
      }
      const m = L.circleMarker([e.latitude, e.longitude], {
        radius: r, color: base, weight: 1.5, fillColor: base, fillOpacity: 0.75,
      })
      m.bindTooltip(`<b>${e.title}</b><br/>${e.source} · ${e.severity}`, { direction: 'top' })
      m.on('click', () => onSelectEvent && onSelectEvent(e))
      m.addTo(lg)
    }
  }

  return <div ref={containerRef} className="relative z-0 h-full w-full rounded-xl overflow-hidden" style={{ background: '#0b1120' }} />
}
