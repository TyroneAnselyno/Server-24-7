require('../load-env')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const { createClient } = require('@supabase/supabase-js')
const { writeWeeklyReport, logAIInteraction } = require('../utils/sheetsUpdater')

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

/**
 * Fetch AI logs from the past 7 days
 */
async function getWeeklyLogs() {
  const since = new Date()
  since.setDate(since.getDate() - 7)

  const { data } = await supabase
    .from('ai_logs')
    .select('*')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })

  return data || []
}

/**
 * Fetch current system prompts for all agents
 */
async function getCurrentPrompts() {
  const { data } = await supabase.from('ai_config').select('agent_name, system_prompt, versi')
  return data || []
}

/**
 * Update a system prompt in ai_config
 */
async function updateSystemPrompt(agentName, newPrompt) {
  const { data: current } = await supabase
    .from('ai_config')
    .select('versi')
    .eq('agent_name', agentName)
    .single()

  await supabase
    .from('ai_config')
    .update({
      system_prompt: newPrompt,
      versi: (current?.versi || 1) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq('agent_name', agentName)
}

/**
 * Save weekly report to Supabase weekly_reports table
 */
async function saveWeeklyReport(metricsJson, rekomendasi) {
  const monday = new Date()
  monday.setDate(monday.getDate() - monday.getDay() + 1)
  await supabase.from('weekly_reports').insert({
    minggu: monday.toISOString().split('T')[0],
    metrics_json: metricsJson,
    rekomendasi,
  })
}

/**
 * Main weekly evaluation function
 * 1. Read last 7 days of ai_logs
 * 2. Use Gemini to evaluate quality + suggest prompt improvements
 * 3. Optionally update ai_config with improved prompts
 * 4. Write report to Google Sheets + Supabase
 */
async function runWeeklyEvaluation() {
  console.log('[weeklyEvaluator] Starting evaluation...')

  const [logs, prompts] = await Promise.all([getWeeklyLogs(), getCurrentPrompts()])

  if (logs.length === 0) {
    console.log('[weeklyEvaluator] No logs found for this week, skipping.')
    return
  }

  // Group logs by agent
  const byAgent = {}
  for (const log of logs) {
    if (!byAgent[log.agent]) byAgent[log.agent] = []
    byAgent[log.agent].push(log)
  }

  const metrics = {
    total_interaksi: logs.length,
    sukses: logs.filter(l => l.outcome === 'sukses').length,
    gagal: logs.filter(l => l.outcome === 'gagal').length,
    rata_rating: logs.filter(l => l.rating).length
      ? (logs.filter(l => l.rating).reduce((s, l) => s + l.rating, 0) / logs.filter(l => l.rating).length).toFixed(2)
      : 'N/A',
  }
  for (const [agent, agentLogs] of Object.entries(byAgent)) {
    metrics[`${agent}_total`] = agentLogs.length
    metrics[`${agent}_sukses`] = agentLogs.filter(l => l.outcome === 'sukses').length
  }

  // Sample interactions for Gemini analysis (last 5 per agent, truncated)
  const sampleLogs = Object.entries(byAgent).map(([agent, agentLogs]) => {
    const samples = agentLogs.slice(0, 5).map(l => ({
      input: (l.input || '').substring(0, 200),
      output: (l.output || '').substring(0, 200),
      outcome: l.outcome,
      rating: l.rating,
    }))
    return `Agent: ${agent}\nContoh interaksi:\n${JSON.stringify(samples, null, 2)}`
  }).join('\n\n---\n\n')

  const currentPromptsText = prompts
    .map(p => `${p.agent_name} (v${p.versi}):\n${p.system_prompt}`)
    .join('\n\n---\n\n')

  const evaluationPrompt = `Kamu adalah sistem evaluasi AI untuk Surya Yoga Studio. Analisis performa agent AI minggu ini dan berikan rekomendasi.

METRIK MINGGU INI:
${JSON.stringify(metrics, null, 2)}

CONTOH INTERAKSI AGENT:
${sampleLogs}

SYSTEM PROMPT SAAT INI:
${currentPromptsText}

Berikan:
1. Evaluasi singkat performa setiap agent (kekuatan & kelemahan)
2. Rekomendasi spesifik untuk meningkatkan system prompt masing-masing agent
3. Pola masalah yang berulang
4. Skor keseluruhan (1-10) dengan justifikasi

Format respons sebagai JSON:
{
  "evaluasi_per_agent": { "agentName": "evaluasi singkat" },
  "prompt_improvements": { "agentName": "versi prompt yang diperbaiki atau null jika sudah baik" },
  "pola_masalah": ["masalah1", "masalah2"],
  "skor_keseluruhan": 8,
  "justifikasi": "...",
  "ringkasan_untuk_owner": "pesan singkat dalam Bahasa Indonesia untuk owner"
}`

  let evaluation = null
  let rekomendasiText = 'Evaluasi gagal dijalankan.'

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })
    const result = await model.generateContent(evaluationPrompt)
    const responseText = result.response.text()

    // Extract JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      evaluation = JSON.parse(jsonMatch[0])
      rekomendasiText = evaluation.ringkasan_untuk_owner || responseText
    } else {
      rekomendasiText = responseText
    }

    // Apply prompt improvements if confidence is high (score >= 7)
    if (evaluation && evaluation.skor_keseluruhan >= 7 && evaluation.prompt_improvements) {
      for (const [agentName, newPrompt] of Object.entries(evaluation.prompt_improvements)) {
        if (newPrompt && typeof newPrompt === 'string' && newPrompt.length > 50) {
          await updateSystemPrompt(agentName, newPrompt)
          console.log(`[weeklyEvaluator] Updated prompt for ${agentName}`)
        }
      }
    }

    console.log('[weeklyEvaluator] Evaluation complete. Score:', evaluation?.skor_keseluruhan)
  } catch (err) {
    console.error('[weeklyEvaluator] Gemini error:', err.message)
    rekomendasiText = `Evaluasi otomatis gagal: ${err.message}. Metrik minggu ini: ${JSON.stringify(metrics)}`
  }

  // Write to Google Sheets
  const weekLabel = `Evaluasi ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
  try {
    await writeWeeklyReport({ weekLabel, metrics, recommendations: rekomendasiText })
    console.log('[weeklyEvaluator] Written to Google Sheets')
  } catch (err) {
    console.warn('[weeklyEvaluator] Sheets write failed:', err.message)
  }

  // Save to Supabase
  await saveWeeklyReport(metrics, rekomendasiText).catch(err =>
    console.warn('[weeklyEvaluator] Supabase write failed:', err.message)
  )

  // Log the evaluation itself
  await logAIInteraction({
    agent: 'weeklyEvaluator',
    input: `Evaluasi ${logs.length} log`,
    output: rekomendasiText.substring(0, 500),
    outcome: evaluation ? 'sukses' : 'gagal',
  }).catch(() => {})

  return { metrics, evaluation, rekomendasiText }
}

// Run directly if invoked via CLI: node learning/weeklyEvaluator.js
if (require.main === module) {
  runWeeklyEvaluation()
    .then(result => {
      console.log('\n=== WEEKLY EVALUATION COMPLETE ===')
      console.log('Metrics:', result?.metrics)
      console.log('Recommendation:', result?.rekomendasiText?.substring(0, 300))
    })
    .catch(err => {
      console.error('Fatal error:', err)
      process.exit(1)
    })
}

module.exports = { runWeeklyEvaluation }
