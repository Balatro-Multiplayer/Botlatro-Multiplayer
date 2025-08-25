import { Player, Glicko2 } from 'glicko2.ts'
import { getQueueSettings, getMatchData, getPlayerDataLive, partyUtils, ratingUtils } from '.././queryDB'
import { pool } from '../../db'
import type { teamResults } from 'psqlDB';

// ONLY 1v1 games use this function - team and ffa games use openSkill
export async function calculateGlicko2(matchId: number, teamResults: teamResults) {

    const matchData = await getMatchData(matchId);
    const settings = await getQueueSettings(matchData.queue_id);
    const playerData = await getPlayerDataLive(matchId);

    // Initialize the Glicko-2 system
    const glick = new Glicko2({
        tau: 0.5,
        rating: settings.default_elo,
        rd: 200,
        vol: 0.06,

        // this was copilots algorithm, idk how it works, we will find our own later:
        volatilityAlgorithm(v, delta, { vol, tau, rd, rating }) {
            const v2 = v * v;
            const delta2 = delta * delta;
            const rd2 = rd * rd;
            const a = Math.log(v2);
            const b = Math.log(delta2);
            const c = (a - b) / (2 * tau * tau);
            return Math.sqrt(Math.max(0, c + Math.sqrt(c * c + 1)));
        }
    })

    // Create Glicko-2 players for each participant using stored data
    const Player1 = glick.makePlayer(
        teamResults.teams[0].players[0]._rating,
        teamResults.teams[0].players[0]._rd,
        teamResults.teams[0].players[0]._vol
    )
    const Player2 = glick.makePlayer(
        teamResults.teams[1].players[0]._rating,
        teamResults.teams[1].players[0]._rd,
        teamResults.teams[1].players[0]._vol
    )

    const match: [Player, Player, number][] = [
        [Player1, Player2, teamResults.teams[0].score] 
    ];
    glick.updateRatings(match);

    // Update the database with new ratings for both players
    await ratingUtils.updatePlayerGlickoAll(teamResults.teams[0].players[0].id, Player1.getRating(), Player1.getRd(), Player1.getVol());
    await ratingUtils.updatePlayerGlickoAll(teamResults.teams[1].players[0].id, Player2.getRating(), Player2.getRd(), Player2.getVol());
}