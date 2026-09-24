import { createClient } from '@supabase/supabase-js'

// Server-only Supabase client using the SECRET key.
// The secret key bypasses RLS and must never reach the browser.
let _client = null

export function supabaseServer() {
  if (_client) return _client
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url) throw new Error('Missing Supabase URL')
  if (!key) throw new Error('Missing SUPABASE_SECRET_KEY')
  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  return _client
}
