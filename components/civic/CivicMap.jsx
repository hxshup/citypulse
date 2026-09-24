'use client'
import { useEffect, useRef } from 'react'
import { CITY, LANDMARKS  } from '@/lib/civic/config'

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
          .setView(CITY.center, CITY.zoom)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap contributors', maxZoom: 19, subdomains: 'abc',
        }).addTo(mapRef.current)
        // Free OSM tiles + CSS filter for a dark, civic-tech look (no API key required).
        const pane = mapRef.current.getPane('tilePane')
        if (pane) pane.style.filter = 'invert(1) hue-rotate(180deg) brightness(0.95) contrast(0.9) saturate(0.6)'
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
    // Jaipur landmark markers
    for (const landmark of LANDMARKS) {
      const zone = (snapshot.zones || []).find(
        (zv) => zv.zone.id === landmark.zoneId
      )

      const marker = L.marker([landmark.latitude, landmark.longitude], {
        icon: L.divIcon({
          className: '',
          html: `
            <div style="
              transform:translate(-50%,-50%);
              display:flex;
              align-items:center;
              gap:5px;
              white-space:nowrap;
              font:600 11px Inter,sans-serif;
              color:#f8fafc;
              background:rgba(15,23,42,.92);
              padding:4px 8px;
              border-radius:8px;
              border:1px solid rgba(56,189,248,.45);
              box-shadow:0 4px 12px rgba(0,0,0,.35);
            ">
              <span style="color:#38bdf8;">◆</span>
              ${landmark.name}
            </div>
          `,
        }),
      })

      marker.bindTooltip(
        `<b>${landmark.name}</b><br/>${landmark.description}<br/>${
          zone ? `${zone.zone.label} · ${zone.zone.name} · Pulse ${zone.pulse.score}` : ''
        }`,
        { direction: 'top' }
      )

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
