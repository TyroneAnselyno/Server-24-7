require('../load-env')
const express = require('express')
const TelegramBot = require('node-telegram-bot-api')
const cron = require('node-cron')
const { handleMessage: adminHandleMessage } = require('../agents/adminAgent')
const { generatePromo, getMembersExpiringIn, getNewMembers } = require('../agents/marketingAgent')
const { generateFinancialReport, generatePaymentReminder, getMembersWithPendingPayments } = require('../agents/financeAgent')
const { generatePurchaseOrder, getStockSummary } = require('../agents/purchasingAgent')
const { runWeeklyEvaluation } = require('../learning/weeklyEvaluator')

const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const OWNER_ID = Number(process.env.TELEGRAM_OWNER_ID)
const PORT = Number(process.env.PORT) || 3001

// Polling mode — no public URL needed
const bot = new TelegramBot(TOKEN, { polling: true })
const app = express()
app.use(express.json())

console.log('[bot] Running in polling mode')

// ── Message Router ────────────────────────────────────────────

bot.on('message', async (msg) => {
  const chatId = msg.chat.id
  const text = (msg.text || '').trim()
  const isOwner = chatId === OWNER_ID

  if (!text) return

  // Owner commands
  if (isOwner && text.startsWith('/')) {
    await handleOwnerCommand(chatId, text)
    return
  }

  // Regular member message → adminAgent
  try {
    await bot.sendChatAction(chatId, 'typing')
    const reply = await adminHandleMessage({
      telegram_id: String(chatId),
      text,
    })
    await bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' })
  } catch (err) {
    console.error('[bot] Message handler error:', err.message)
    await bot.sendMessage(chatId, 'Maaf, terjadi kesalahan. Silakan coba lagi. 🙏')
  }
})

// ── Owner Command Handler ─────────────────────────────────────

async function handleOwnerCommand(chatId, text) {
  const [cmd, ...args] = text.split(' ')

  const commands = {
    '/laporan': async () => {
      await bot.sendMessage(chatId, '📊 Mengambil laporan keuangan...')
      const report = await generateFinancialReport()
      await bot.sendMessage(chatId, report, { parse_mode: 'Markdown' })
    },

    '/stok': async () => {
      await bot.sendMessage(chatId, '📦 Mengecek inventori...')
      const summary = await getStockSummary()
      await bot.sendMessage(chatId, summary)
    },

    '/po': async () => {
      await bot.sendMessage(chatId, '📝 Membuat Purchase Order...')
      const po = await generatePurchaseOrder()
      await bot.sendMessage(chatId, po, { parse_mode: 'Markdown' })
    },

    '/reminder': async () => {
      await bot.sendMessage(chatId, '💳 Mengirim reminder pembayaran...')
      const pending = await getMembersWithPendingPayments()
      if (pending.length === 0) {
        await bot.sendMessage(chatId, '✅ Tidak ada tagihan pending.')
        return
      }
      for (const t of pending) {
        const member = t.members
        if (!member?.telegram_id) continue
        const msg = await generatePaymentReminder({
          nama: member.nama,
          jumlah: t.jumlah,
          jatuh_tempo: new Date(t.tanggal).toLocaleDateString('id-ID'),
        })
        await bot.sendMessage(Number(member.telegram_id), msg)
      }
      await bot.sendMessage(chatId, `✅ ${pending.length} reminder terkirim.`)
    },

    '/promo': async () => {
      const type = args[0] || 'promo_bulanan'
      await bot.sendMessage(chatId, `📣 Membuat konten promo: ${type}...`)
      const content = await generatePromo(type)
      await bot.sendMessage(chatId, content, { parse_mode: 'Markdown' })
    },

    '/welcome': async () => {
      await bot.sendMessage(chatId, '👋 Mengirim welcome ke member baru...')
      const newMembers = await getNewMembers(7)
      if (newMembers.length === 0) {
        await bot.sendMessage(chatId, 'Tidak ada member baru minggu ini.')
        return
      }
      for (const m of newMembers) {
        if (!m.telegram_id) continue
        const msg = await generatePromo('welcome', { nama: m.nama })
        await bot.sendMessage(Number(m.telegram_id), msg)
      }
      await bot.sendMessage(chatId, `✅ Welcome dikirim ke ${newMembers.length} member baru.`)
    },

    '/evaluasi': async () => {
      await bot.sendMessage(chatId, '🔍 Menjalankan evaluasi mingguan AI...')
      const result = await runWeeklyEvaluation()
      const summary = result?.rekomendasiText?.substring(0, 1000) || 'Evaluasi selesai.'
      await bot.sendMessage(chatId, `✅ Evaluasi selesai:\n\n${summary}`)
    },

    '/help': async () => {
      await bot.sendMessage(chatId, `🧘 *Surya Yoga AI — Perintah Owner*\n\n/laporan — Laporan keuangan bulan ini\n/stok — Status inventori\n/po — Buat Purchase Order\n/reminder — Kirim reminder pembayaran\n/promo [tipe] — Buat konten promo\n/welcome — Kirim welcome ke member baru\n/evaluasi — Jalankan evaluasi AI mingguan\n/help — Daftar perintah`, { parse_mode: 'Markdown' })
    },
  }

  const handler = commands[cmd]
  if (handler) {
    await handler()
  } else {
    await bot.sendMessage(chatId, `Perintah tidak dikenal: ${cmd}. Ketik /help untuk daftar perintah.`)
  }
}

// ── Scheduled Jobs ────────────────────────────────────────────

// Every Monday 08:00 WIB (01:00 UTC) — weekly evaluation
cron.schedule('0 1 * * 1', async () => {
  console.log('[cron] Running weekly evaluation...')
  try {
    const result = await runWeeklyEvaluation()
    if (result?.rekomendasiText) {
      await bot.sendMessage(OWNER_ID, `🤖 *Laporan Evaluasi AI Mingguan*\n\n${result.rekomendasiText.substring(0, 1000)}`, { parse_mode: 'Markdown' })
    }
  } catch (err) {
    console.error('[cron] Weekly evaluation failed:', err.message)
    await bot.sendMessage(OWNER_ID, `⚠️ Evaluasi mingguan gagal: ${err.message}`)
  }
})

// Every day at 09:00 WIB (02:00 UTC) — payment reminders
cron.schedule('0 2 * * *', async () => {
  console.log('[cron] Running daily payment reminders...')
  try {
    const pending = await getMembersWithPendingPayments()
    for (const t of pending) {
      const member = t.members
      if (!member?.telegram_id) continue
      const msg = await generatePaymentReminder({
        nama: member.nama,
        jumlah: t.jumlah,
        jatuh_tempo: new Date(t.tanggal).toLocaleDateString('id-ID'),
      })
      await bot.sendMessage(Number(member.telegram_id), msg)
    }
  } catch (err) {
    console.error('[cron] Payment reminder failed:', err.message)
  }
})

// Every Monday 09:00 WIB (02:00 UTC) — low stock alert to owner
cron.schedule('0 2 * * 1', async () => {
  console.log('[cron] Running stock check...')
  try {
    const { getLowStockItems } = require('../agents/purchasingAgent')
    const lowStock = await getLowStockItems()
    if (lowStock.length > 0) {
      const po = await generatePurchaseOrder()
      await bot.sendMessage(OWNER_ID, `📦 *Alert Stok Rendah*\n\n${po}`, { parse_mode: 'Markdown' })
    }
  } catch (err) {
    console.error('[cron] Stock check failed:', err.message)
  }
})

// ── Health Check ──────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'surya-yoga-ai', timestamp: new Date().toISOString() })
})

// ── Start Server ──────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[server] Surya Yoga AI running on port ${PORT}`)
  console.log(`[bot] Polling started — bot is active!`)
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[server] Port ${PORT} already in use — skipping HTTP server, bot still active`)
  } else {
    console.error('[server] HTTP server error:', err.message)
  }
})

module.exports = { app, bot }
