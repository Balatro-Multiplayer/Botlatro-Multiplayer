import { pool } from '../db'

const url = 'https://casjb.narwhalkid.com/strikes'

interface StrikeData {
  id: number
  userId: string
  amount: number
  reason: string
  reference: string
  time: Date
}

async function fetchStrikeData(): Promise<StrikeData[] | null> {
  console.log(`Fetching strike data from: ${url}`)

  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    const data: StrikeData[] = await response.json()
    return data.map((item) => ({
      ...item,
      time: new Date(item.time),
      userId: String(item.userId),
      amount: parseInt(`${item.amount}`),
    }))
  } catch (error) {
    console.error('Error fetching strike data:', error)
    return null
  }
}

async function insertData() {
  const data = await fetchStrikeData()
  if (!data) return console.log('Data not found')
  console.log(`Found ${data.length} objects`)

  for (const item of data) {
    await pool.query(
      `
      INSERT INTO strikes (user_id, reason, amount, reference, issued_at) VALUES ($1, $2, $3, $4, $5)
    `,
      [item.userId, item.reason, item.amount, item.reference, item.time],
    )
  }
  console.log('Data inserted')
}

insertData()
