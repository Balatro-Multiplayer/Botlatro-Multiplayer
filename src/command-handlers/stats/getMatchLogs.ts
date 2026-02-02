import fs from 'fs'

export type MatchLogData = {}
const logsPath = '/data/logs'

/**
 * Gets the transcript for a specific match.
 *
 */
export async function getMatchLogs(matchId: number, queueId?: number) {
  try {
    // read logs dir for all files
    let logFiles = await fs.promises.readdir(logsPath, {
      withFileTypes: true,
    })

    // filter log list based on match id
    const logFile = logFiles
      .filter(
        (logFile) => logFile.isFile() && logFile.name.includes(`_${matchId}_`),
      )
      .map((logFile) => logFile.name)[0]

    // handling for if no logFile is found
    if (!logFile) {
      return new Error(`Found no logs that match ${matchId}`)
    }

    // read the contents of the correct file
    const log = await fs.promises.readFile(logFile, { encoding: 'utf8' })

    // return in correct json format
    return {
      matchId: matchId,
      contents: log,
      queueId: queueId,
    }
  } catch (error) {
    console.error('Error fetching match transcript:', error)
    throw error
  }
}
