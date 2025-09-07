import { endMatch } from '../../utils/matchHelpers'

/**
 * Cancels an ongoing match by its unique identifier.
 *
 * @param {number} matchId - The unique identifier of the match to be canceled.
 * @return {Promise<boolean>} A promise that resolves to true if the match was successfully canceled, otherwise false.
 */
export async function cancelMatch(matchId: number): Promise<boolean> {
  return await endMatch(matchId, true)
}
