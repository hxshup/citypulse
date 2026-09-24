import './globals.css'
import { Providers } from './providers'

export const metadata = {
  title: 'CityPulse — Live Civic Intelligence',
  description: 'See what\'s happening. Understand why it matters. Real-time civic intelligence & neighborhood health.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: 'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);' }} />
      </head>
      <body style={{ fontFamily: 'Inter, sans-serif' }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
