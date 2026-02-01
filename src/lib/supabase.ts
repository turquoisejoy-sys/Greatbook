import { createClient } from '@supabase/supabase-js';

// Use empty strings as fallback to prevent build crashes when env vars aren't set
// The isSupabaseConfigured() check in sync.ts guards all actual API calls
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
