require('../load-env')
const { callGemini } = require('../utils/gemini')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

/**
 * Fetch current system prompt from ai_config
 */
async function getSystemPrompt() {
  const { data } = await supabase
    .from('ai_config')
    .select('system_prompt')
    .eq('agent_name', 'adminAgent')
    .single()
  return data?.system_prompt || 'Kamu adalah asisten virtual Surya Yoga Studio yang ramah dan profesional.'
}

/**
 * Fetch context data to inject into prompt (classes, member info)
 */
async function buildContext(telegramId) {
  const [classesRes, memberRes] = await Promise.all([
    supabase
      .from('classes')
      .select('nama, instruktur, hari, jam_mulai, jam_selesai, tipe, harga, kapasitas')
      .eq('aktif', true)
      .order('hari'),
    supabase
      .from('members')
      .select('nama, paket, status, tanggal_daftar')
      .eq('telegram_id', telegramId)
      .single(),
  ])

  const classes = classesRes.data || []
  const member = memberRes.data

  const jadwalText = classes
    .map(c => `• ${c.hari} ${c.jam_mulai}-${c.jam_selesai} | ${c.nama} (${c.tipe}) bersama ${c.instruktur} | Rp ${c.harga.toLocaleString('id-ID')} | Kapasitas: ${c.kapasitas} orang`)
    .join('\n')

  const memberInfo = member
    ? `\nData Member:\n- Nama: ${member.nama}\n- Paket: ${member.paket}\n- Status: ${member.status}`
    : '\nPengguna belum terdaftar sebagai member.'

  return `\n\n---\nJadwal Kelas Aktif:\n${jadwalText}${memberInfo}\n---`
}

/**
 * Log interaction to Supabase ai_logs
 */
async function logInteraction(input, output, outcome) {
  await supabase.from('ai_logs').insert({
    agent: 'adminAgent',
    input,
    output,
    outcome,
  })
}

/**
 * Main handler — receives Telegram message, returns AI reply
 * @param {{ telegram_id: string, text: string }} message
 * @returns {Promise<string>} reply text
 */
async function handleMessage({ telegram_id, text }) {
  let reply = ''
  let outcome = 'sukses'

  try {
    const [systemPrompt, context] = await Promise.all([
      getSystemPrompt(),
      buildContext(telegram_id),
    ])

    reply = await callGemini(systemPrompt + context, text, 1024)
  } catch (err) {
    console.error('[adminAgent] Error:', err.message)
    reply = 'Maaf, terjadi kesalahan. Silakan coba lagi sebentar.'
    outcome = 'gagal'
  }

  await logInteraction(text, reply, outcome).catch(() => {})
  return reply
}

module.exports = { handleMessage }
