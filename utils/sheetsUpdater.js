require('dotenv').config()
const { google } = require('googleapis')
const path = require('path')

const SHEET_ID = process.env.GOOGLE_SHEET_ID

function getAuth() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH || './credentials/service-account.json'
  const auth = new google.auth.GoogleAuth({
    keyFile: path.resolve(keyPath),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return auth
}

async function getSheets() {
  const auth = getAuth()
  return google.sheets({ version: 'v4', auth })
}

/**
 * Append rows to a sheet tab
 * @param {string} sheetName - Tab name e.g. "AI Logs"
 * @param {Array<Array>} rows - Array of row arrays
 */
async function appendRows(sheetName, rows) {
  const sheets = await getSheets()
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!A1`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: rows },
  })
}

/**
 * Update a single cell
 * @param {string} sheetName
 * @param {string} cell - e.g. "B2"
 * @param {string|number} value
 */
async function updateCell(sheetName, cell, value) {
  const sheets = await getSheets()
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!${cell}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[value]] },
  })
}

/**
 * Read a range from a sheet
 * @param {string} sheetName
 * @param {string} range - e.g. "A1:Z100"
 */
async function readRange(sheetName, range) {
  const sheets = await getSheets()
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${sheetName}!${range}`,
  })
  return res.data.values || []
}

/**
 * Ensure a sheet tab exists; creates it if missing
 * @param {string} sheetName
 */
async function ensureSheetExists(sheetName) {
  const auth = getAuth()
  const sheetsApi = google.sheets({ version: 'v4', auth })
  const meta = await sheetsApi.spreadsheets.get({ spreadsheetId: SHEET_ID })
  const exists = meta.data.sheets.some(s => s.properties.title === sheetName)
  if (!exists) {
    await sheetsApi.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: sheetName } } }],
      },
    })
  }
}

/**
 * Log an AI interaction to the "AI Logs" sheet
 */
async function logAIInteraction({ agent, input, output, outcome, rating = null }) {
  const timestamp = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
  await ensureSheetExists('AI Logs')
  await appendRows('AI Logs', [
    [timestamp, agent, input, output, outcome, rating ?? ''],
  ])
}

/**
 * Write weekly report summary to a dated sheet tab
 */
async function writeWeeklyReport({ weekLabel, metrics, recommendations }) {
  await ensureSheetExists(weekLabel)
  const headers = [['Metrik', 'Nilai']]
  const rows = Object.entries(metrics).map(([k, v]) => [k, v])
  const allRows = [
    ...headers,
    ...rows,
    [],
    ['Rekomendasi AI', recommendations],
  ]
  await appendRows(weekLabel, allRows)
}

module.exports = {
  appendRows,
  updateCell,
  readRange,
  ensureSheetExists,
  logAIInteraction,
  writeWeeklyReport,
}
