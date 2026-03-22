import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const SUPABASE_URL = 'https://omngwhdstrgnsbjonahc.supabase.co'
const SUPABASE_KEY = 'sb_publishable_KjxMqKxFpxIAgMmPQLl2CQ_D1-4RXQd'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)