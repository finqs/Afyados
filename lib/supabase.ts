import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy initialization — avoids crashing at module load when env vars
// are not yet available (e.g. during Next.js static analysis at build time).
let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase env vars não configuradas. ' +
      'Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no Vercel.'
    )
  }
  _client = createClient(url, key)
  return _client
}

// Proxy que só instancia o cliente quando um método é chamado de fato.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop: string) {
    return (getClient() as unknown as Record<string, unknown>)[prop]
  },
})
