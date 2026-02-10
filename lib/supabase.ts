import { createClient } from '@supabase/supabase-js'

// Client-side Supabase client (uses anon key)
// Safe to use in browser - anon key has limited permissions
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
