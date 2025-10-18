import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

type BenchmarkResult = {
  name: string
  duration: number
  operations: number
  opsPerSecond: number
  memoryUsed: number
}

async function updatePlayerMmrIndividual(
  queueId: number,
  userId: string,
  newElo: number,
  newVolatility: number,
): Promise<void> {
  const clampedElo = Math.max(0, Math.min(9999, newElo))
  await pool.query(
    `UPDATE queue_users SET elo = $1, peak_elo = GREATEST(peak_elo, $1), volatility = $2 WHERE user_id = $3 AND queue_id = $4`,
    [clampedElo, newVolatility, userId, queueId],
  )
}

async function updatePlayerMmrBulk(
  queueId: number,
  updates: Array<{ user_id: string; elo: number; volatility: number }>,
): Promise<void> {
  if (updates.length === 0) return

  const values = updates.flatMap((u) => [
    u.elo,
    u.volatility,
    u.user_id,
    queueId,
  ])

  const placeholders = updates
    .map((_, i) => {
      const offset = i * 4
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`
    })
    .join(', ')

  await pool.query(
    `UPDATE queue_users AS qu
     SET elo = v.elo::numeric,
         peak_elo = GREATEST(qu.peak_elo, v.elo::numeric),
         volatility = v.volatility::integer
     FROM (VALUES ${placeholders}) AS v(elo, volatility, user_id, queue_id)
     WHERE qu.user_id = v.user_id::text AND qu.queue_id = v.queue_id::integer`,
    values,
  )
}

async function benchmark(
  name: string,
  fn: () => Promise<void>,
  operations: number,
  iterations: number = 1,
): Promise<BenchmarkResult> {
  const startMem = process.memoryUsage().heapUsed
  const durations: number[] = []

  for (let i = 0; i < iterations; i++) {
    const start = performance.now()
    await fn()
    const end = performance.now()
    durations.push(end - start)
  }

  const endMem = process.memoryUsage().heapUsed
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length

  return {
    name,
    duration: avgDuration,
    operations,
    opsPerSecond: (operations / avgDuration) * 1000,
    memoryUsed: endMem - startMem,
  }
}

async function getExistingPlayers(
  queueId: number,
  limit: number,
): Promise<string[]> {
  const result = await pool.query(
    `SELECT user_id FROM queue_users WHERE queue_id = $1 LIMIT $2`,
    [queueId, limit],
  )
  return result.rows.map((row) => row.user_id)
}

async function getQueueId(): Promise<number> {
  const result = await pool.query(`SELECT id FROM queues LIMIT 1`)
  if (result.rows.length === 0) {
    throw new Error('No queues found in database')
  }
  return result.rows[0].id
}

async function runBenchmark(
  name: string,
  queueId: number,
  playerCount: number,
  method: 'individual' | 'bulk',
  iterations: number = 3,
): Promise<BenchmarkResult> {
  console.log(`\nRunning: ${name}...`)

  const userIds = await getExistingPlayers(queueId, playerCount)

  if (userIds.length < playerCount) {
    console.log(`⚠ Only found ${userIds.length} players, using that instead`)
  }

  const result = await benchmark(
    name,
    async () => {
      if (method === 'individual') {
        for (const userId of userIds) {
          await updatePlayerMmrIndividual(
            queueId,
            userId,
            1000 + Math.random() * 50,
            Math.floor(Math.random() * 10),
          )
        }
      } else {
        const updates = userIds.map((userId) => ({
          user_id: userId,
          elo: 1000 + Math.random() * 50,
          volatility: Math.floor(Math.random() * 10),
        }))
        await updatePlayerMmrBulk(queueId, updates)
      }
    },
    userIds.length,
    iterations,
  )

  console.log(
    `✓ Completed: ${result.duration.toFixed(2)}ms (${result.opsPerSecond.toFixed(2)} ops/sec)`,
  )
  return result
}

async function main() {
  console.log('=== MMR Update Benchmark ===\n')
  console.log('Warming up connection...\n')

  await pool.query('SELECT 1')

  const queueId = await getQueueId()
  console.log(`Using queue_id: ${queueId}`)

  const totalPlayers = await pool.query(
    `SELECT COUNT(*) FROM queue_users WHERE queue_id = $1`,
    [queueId],
  )
  console.log(`Total players in queue: ${totalPlayers.rows[0].count}`)
  console.log('Iterations per test: 3\n')

  const results: BenchmarkResult[] = []

  const testCases = [
    { players: 10, label: '10 players' },
    { players: 50, label: '50 players' },
    { players: 100, label: '100 players' },
    { players: 500, label: '500 players' },
    { players: 1000, label: '1000 players' },
  ]

  for (const testCase of testCases) {
    results.push(
      await runBenchmark(
        `${testCase.label} - individual`,
        queueId,
        testCase.players,
        'individual',
      ),
    )

    results.push(
      await runBenchmark(
        `${testCase.label} - bulk`,
        queueId,
        testCase.players,
        'bulk',
      ),
    )
  }

  console.log('\n\n=== Results ===\n')
  console.table(
    results.map((r) => ({
      Test: r.name,
      'Avg Duration (ms)': r.duration.toFixed(2),
      Ops: r.operations,
      'Ops/sec': r.opsPerSecond.toFixed(2),
      'Memory (KB)': (r.memoryUsed / 1024).toFixed(2),
    })),
  )

  console.log('\n=== Performance Comparison ===\n')
  for (let i = 0; i < results.length; i += 2) {
    const individual = results[i]
    const bulk = results[i + 1]
    const speedup = individual.duration / bulk.duration

    console.log(`${individual.name.split(' - ')[0]}:`)
    console.log(`  Bulk is ${speedup.toFixed(2)}x faster`)
    console.log(
      `  Time saved: ${(individual.duration - bulk.duration).toFixed(2)}ms`,
    )
    console.log(
      `  Memory diff: ${((bulk.memoryUsed - individual.memoryUsed) / 1024).toFixed(2)}KB\n`,
    )
  }

  await pool.end()
  console.log('Benchmark complete.')
}

main().catch((error) => {
  console.error('Benchmark failed:', error)
  pool.end().finally(() => process.exit(1))
})
