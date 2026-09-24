'use client'
import { useEffect, useRef } from 'react'

const SOURCE_COLOR = { weather: '#38bdf8', traffic: '#f59e0b', transit: '#a78bfa' }
function pulseColor(score) {
  if (score >= 80) return '#10b981'
  if (score >= 60) return '#f59e0b'
  return '#ef4444'
}

export default function CivicMap({ snapshot, layers, selectedZoneId, onSelectEvent }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const layerRef = useRef(null)
  const LRef = useRef(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const mod = await import('leaflet')
      const L = mod.default || mod
      if (!mounted || !containerRef.current) return
      LRef.current = L
      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, { zoomControl: true, attributionControl: true })
          .setView([37.7793, -122.4193], 13)
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
          attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19, subdomains: 'abcd',
        }).addTo(mapRef.current)
        layerRef.current = L.layerGroup().addTo(mapRef.current)
      }
      setTimeout(() => mapRef.current && mapRef.current.invalidateSize(), 200)
      draw()
    })()
    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { draw() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [snapshot, layers, selectedZoneId])

  function draw() {
    const L = LRef.current, map = mapRef.current, lg = layerRef.current
    if (!L || !map || !lg || !snapshot) return
    lg.clearLayers()

    for (const zv of snapshot.zones || []) {
      const z = zv.zone
      if (z.latitude == null) continue
      const color = pulseColor(zv.pulse.score)
      const selected = selectedZoneId === z.id
      L.circle([z.latitude, z.longitude], {
        radius: z.radius || 800, color, weight: selected ? 3 : 1,
        fillColor: color, fillOpacity: selected ? 0.12 : 0.05, dashArray: selected ? null : '4',
      }).addTo(lg)
      L.marker([z.latitude, z.longitude], {
        icon: L.divIcon({
          className: '', html: `<div style="transform:translate(-50%,-50%);white-space:nowrap;font:600 11px Inter,sans-serif;color:#cbd5e1;background:rgba(15,23,42,.75);padding:2px 8px;border-radius:999px;border:1px solid rgba(148,163,184,.25)">${z.label} · ${zv.pulse.score}</div>`,
        }),
        interactive: false,
      }).addTo(lg)
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

  return <div ref={containerRef} className="h-full w-full rounded-xl overflow-hidden" style={{ background: '#0b1120' }} />
}
