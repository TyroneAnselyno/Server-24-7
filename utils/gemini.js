require('../load-env')
const axios = require('axios')

const API_KEY = process.env.GROQ_API_KEY
console.log('[groq] Key loaded:', API_KEY ? API_KEY.substring(0, 8) + '...' : 'TIDAK ADA KEY!')

async function callGemini(systemPrompt, userMessage, maxTokens = 1024) {
  if (!API_KEY) throw new Error('GROQ_API_KEY tidak ditemukan di .env.local')

  const res = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: 'llama-3.1-8b-instant',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens,
    },
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  )
  return res.data.choices[0].message.content
}

module.exports = { callGemini }
