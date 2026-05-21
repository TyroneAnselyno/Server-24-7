/**
 * Unified env loader for ai-system standalone operation.
 * When running inside Next.js (process.env already populated), this is a no-op.
 * When running standalone (node bot/server.js), loads from local .env or falls
 * back to the parent project's .env.local so credentials are never duplicated.
 */
const path = require('path')

// 1. Try local ai-system/.env first (override: true so .env beats Replit Secrets)
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true })

// 2. Fall back to root .env.local if SUPABASE_URL is still missing
if (!process.env.SUPABASE_URL) {
  require('dotenv').config({ path: path.join(__dirname, '../.env.local') })
}

// 3. Alias NEXT_PUBLIC_* vars used by Next.js to the names expected by ai-system
if (!process.env.SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
}
if (!process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
  process.env.GOOGLE_SHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID
}
