require('../load-env')
const { callGemini } = require('../utils/gemini')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function getSystemPrompt() {
  const { data } = await supabase
    .from('ai_config')
    .select('system_prompt')
    .eq('agent_name', 'marketingAgent')
    .single()
  return data?.system_prompt || 'Kamu adalah spesialis marketing Surya Yoga Studio.'
}

async function logInteraction(input, output, outcome) {
  await supabase.from('ai_logs').insert({ agent: 'marketingAgent', input, output, outcome })
}

/**
 * Generate a promotional message for a specific campaign type
 * @param {'promo_bulanan'|'welcome'|'winback'|'event'} campaignType
 * @param {Object} [params] - Extra context (member name, class name, discount, etc.)
 * @returns {Promise<string>}
 */
async function generatePromo(campaignType, params = {}) {
  const prompts = {
    promo_bulanan: `Buat pesan promosi bulan ini untuk anggota baru Surya Yoga Studio. Sertakan ajakan bergabung yang hangat dan manfaat yoga. Data ekstra: ${JSON.stringify(params)}`,
    welcome: `Buat pesan selamat datang yang hangat untuk member baru bernama ${params.nama || 'Member Baru'}. Ini pertama kali mereka bergabung dengan kelas ${params.kelas || 'yoga'} kami.`,
    winback: `Buat pesan re-engagement untuk member yang sudah tidak aktif selama ${params.hari || '30'} hari. Nama: ${params.nama || 'Member'}. Ajak mereka kembali dengan nada hangat dan positif.`,
    event: `Buat pengumuman event spesial: ${params.judul || 'Workshop Yoga'}. Tanggal: ${params.tanggal || 'Minggu ini'}. Lokasi: ${params.lokasi || 'Surya Yoga Studio'}. Harga: ${params.harga || 'Gratis untuk member'}.`,
  }

  const userPrompt = prompts[campaignType] || `Buat konten marketing bertema: ${campaignType}. Konteks: ${JSON.stringify(params)}`
  let output = ''
  let outcome = 'sukses'

  try {
    const systemPrompt = await getSystemPrompt()
    output = await callGemini(systemPrompt, userPrompt, 1024)
  } catch (err) {
    console.error('[marketingAgent] Error:', err.message)
    output = 'Gagal membuat konten marketing.'
    outcome = 'gagal'
  }

  await logInteraction(userPrompt, output, outcome).catch(() => {})
  return output
}

/**
 * Get list of members whose membership expires within N days
 * @param {number} days
 */
async function getMembersExpiringIn(days = 7) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + days)

  // Members on monthly plan registered more than 23 days ago are considered near-expiry
  const since = new Date()
  since.setDate(since.getDate() - 23)

  const { data } = await supabase
    .from('members')
    .select('id, nama, telegram_id, paket, tanggal_daftar')
    .eq('status', 'aktif')
    .eq('paket', 'bulanan')
    .lte('tanggal_daftar', since.toISOString())

  return data || []
}

/**
 * Get new members from the last N days
 * @param {number} days
 */
async function getNewMembers(days = 7) {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const { data } = await supabase
    .from('members')
    .select('id, nama, telegram_id')
    .gte('tanggal_daftar', since.toISOString())
  return data || []
}

module.exports = { generatePromo, getMembersExpiringIn, getNewMembers }
