require('../load-env')
const { callGemini } = require('../utils/gemini')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function getSystemPrompt() {
  const { data } = await supabase
    .from('ai_config')
    .select('system_prompt')
    .eq('agent_name', 'financeAgent')
    .single()
  return data?.system_prompt || 'Kamu adalah asisten keuangan Surya Yoga Studio.'
}

async function logInteraction(input, output, outcome) {
  await supabase.from('ai_logs').insert({ agent: 'financeAgent', input, output, outcome })
}

function formatRupiah(amount) {
  return `Rp ${Number(amount).toLocaleString('id-ID')}`
}

/**
 * Get financial summary for the current month
 */
async function getMonthlyFinancials() {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const today = now.toISOString().split('T')[0]

  const { data } = await supabase
    .from('transactions')
    .select('jumlah, tipe, keterangan, tanggal, status_bayar')
    .gte('tanggal', startOfMonth)
    .lte('tanggal', today)

  const pemasukan = (data || [])
    .filter(t => t.tipe === 'pemasukan' && t.status_bayar === 'lunas')
    .reduce((sum, t) => sum + Number(t.jumlah), 0)

  const pengeluaran = (data || [])
    .filter(t => t.tipe === 'pengeluaran' && t.status_bayar === 'lunas')
    .reduce((sum, t) => sum + Number(t.jumlah), 0)

  const pending = (data || [])
    .filter(t => t.status_bayar === 'pending')
    .reduce((sum, t) => sum + Number(t.jumlah), 0)

  return {
    pemasukan,
    pengeluaran,
    laba_bersih: pemasukan - pengeluaran,
    pending,
    periode: `1–${now.getDate()} ${now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })}`,
    transaksi: data || [],
  }
}

/**
 * Generate a formatted financial summary message
 */
async function generateFinancialReport() {
  const fin = await getMonthlyFinancials()
  const summary = `Periode: ${fin.periode}
Total Pemasukan: ${formatRupiah(fin.pemasukan)}
Total Pengeluaran: ${formatRupiah(fin.pengeluaran)}
Laba Bersih: ${formatRupiah(fin.laba_bersih)}
Tagihan Pending: ${formatRupiah(fin.pending)}
Jumlah Transaksi: ${fin.transaksi.length}`

  const userPrompt = `Buat ringkasan laporan keuangan bulanan yang singkat, jelas, dan profesional berdasarkan data berikut:\n${summary}\n\nFormat dengan emoji dan mudah dibaca owner via Telegram.`

  let output = ''
  let outcome = 'sukses'

  try {
    const systemPrompt = await getSystemPrompt()
    output = await callGemini(systemPrompt, userPrompt, 512)
  } catch (err) {
    console.error('[financeAgent] Error:', err.message)
    output = `Ringkasan Keuangan:\n${summary}`
    outcome = 'gagal'
  }

  await logInteraction(userPrompt, output, outcome).catch(() => {})
  return output
}

/**
 * Generate a payment reminder message for a member
 * @param {{ nama: string, telegram_id: string, jumlah: number, jatuh_tempo: string }} member
 */
async function generatePaymentReminder({ nama, jumlah, jatuh_tempo }) {
  const userPrompt = `Buat pesan reminder pembayaran yang sopan dan ramah untuk member bernama ${nama}. Tagihan: ${formatRupiah(jumlah)}. Jatuh tempo: ${jatuh_tempo}. Pesan harus singkat, tidak mengancam, dan tetap positif.`

  let output = ''
  let outcome = 'sukses'

  try {
    const systemPrompt = await getSystemPrompt()
    output = await callGemini(systemPrompt, userPrompt, 256)
  } catch (err) {
    console.error('[financeAgent] Reminder error:', err.message)
    output = `Halo ${nama}, kami mengingatkan tagihan sebesar ${formatRupiah(jumlah)} yang jatuh tempo ${jatuh_tempo}. Terima kasih! 🙏`
    outcome = 'gagal'
  }

  await logInteraction(userPrompt, output, outcome).catch(() => {})
  return output
}

/**
 * Get members with pending payments
 */
async function getMembersWithPendingPayments() {
  const { data } = await supabase
    .from('transactions')
    .select('member_id, jumlah, tanggal, members(nama, telegram_id)')
    .eq('status_bayar', 'pending')
  return data || []
}

module.exports = {
  generateFinancialReport,
  generatePaymentReminder,
  getMembersWithPendingPayments,
  getMonthlyFinancials,
}
