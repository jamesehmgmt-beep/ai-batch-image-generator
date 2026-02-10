import { createClient } from '@supabase/supabase-js'

// Server-side Supabase client (uses service role key)
// NEVER expose this to the browser - has full admin access
export function createServerSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
