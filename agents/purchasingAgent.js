require('../load-env')
const { callGemini } = require('../utils/gemini')
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function getSystemPrompt() {
  const { data } = await supabase
    .from('ai_config')
    .select('system_prompt')
    .eq('agent_name', 'purchasingAgent')
    .single()
  return data?.system_prompt || 'Kamu adalah asisten pengadaan Surya Yoga Studio.'
}

async function logInteraction(input, output, outcome) {
  await supabase.from('ai_logs').insert({ agent: 'purchasingAgent', input, output, outcome })
}

/**
 * Get all inventory items below minimum stock
 */
async function getLowStockItems() {
  const { data } = await supabase
    .from('inventory')
    .select('*')
    .filter('stok', 'lt', supabase.raw('stok_minimum'))

  // Fallback: manual filter if raw filter not supported
  if (!data) {
    const { data: all } = await supabase.from('inventory').select('*')
    return (all || []).filter(item => item.stok < item.stok_minimum)
  }
  return data || []
}

/**
 * Get full inventory list
 */
async function getAllInventory() {
  const { data } = await supabase
    .from('inventory')
    .select('*')
    .order('nama_item')
  return data || []
}

/**
 * Generate a purchase order draft for low-stock items
 */
async function generatePurchaseOrder() {
  const all = await getAllInventory()
  const lowStock = all.filter(item => item.stok < item.stok_minimum)

  if (lowStock.length === 0) {
    return '✅ Semua stok aman. Tidak ada pengadaan yang diperlukan saat ini.'
  }

  const itemList = lowStock
    .map(item => `• ${item.nama_item}: stok ${item.stok} ${item.satuan} (min: ${item.stok_minimum}), vendor: ${item.vendor || 'belum ditentukan'}, harga satuan: Rp ${Number(item.harga_satuan).toLocaleString('id-ID')}`)
    .join('\n')

  const totalEstimasi = lowStock.reduce((sum, item) => {
    const qty = item.stok_minimum - item.stok + 5 // buffer stock
    return sum + qty * Number(item.harga_satuan)
  }, 0)

  const userPrompt = `Buat draft Purchase Order (PO) yang rapi dan profesional untuk pengadaan perlengkapan Surya Yoga Studio.

Item yang perlu dibeli:
${itemList}

Total estimasi: Rp ${totalEstimasi.toLocaleString('id-ID')}

Format PO harus mencakup: nomor PO, tanggal, daftar item dengan quantity yang disarankan, estimasi biaya per item, dan total. Gunakan format yang mudah dibaca di Telegram.`

  let output = ''
  let outcome = 'sukses'

  try {
    const systemPrompt = await getSystemPrompt()
    output = await callGemini(systemPrompt, userPrompt, 1024)
  } catch (err) {
    console.error('[purchasingAgent] Error:', err.message)
    output = `⚠️ Perlu pengadaan:\n${itemList}\n\nEstimasi total: Rp ${totalEstimasi.toLocaleString('id-ID')}`
    outcome = 'gagal'
  }

  await logInteraction(userPrompt, output, outcome).catch(() => {})
  return output
}

/**
 * Update stock level for an item
 * @param {string} itemId
 * @param {number} newStok
 */
async function updateStock(itemId, newStok) {
  const { error } = await supabase
    .from('inventory')
    .update({ stok: newStok, updated_at: new Date().toISOString() })
    .eq('id', itemId)
  return !error
}

/**
 * Get inventory status summary as text
 */
async function getStockSummary() {
  const all = await getAllInventory()
  const lowStock = all.filter(i => i.stok < i.stok_minimum)
  const ok = all.filter(i => i.stok >= i.stok_minimum)

  return `📦 Status Inventori\n✅ Stok aman: ${ok.length} item\n⚠️ Perlu pengadaan: ${lowStock.length} item${lowStock.length > 0 ? '\n\nItem kritis:\n' + lowStock.map(i => `• ${i.nama_item}: ${i.stok}/${i.stok_minimum} ${i.satuan}`).join('\n') : ''}`
}

module.exports = {
  getLowStockItems,
  getAllInventory,
  generatePurchaseOrder,
  updateStock,
  getStockSummary,
}
