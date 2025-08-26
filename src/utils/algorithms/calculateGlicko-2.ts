import { Player, Glicko2 } from 'glicko2'
import { getQueueSettings, getMatchData, getPlayerDataLive, partyUtils, ratingUtils, updateTeamResults } from '.././queryDB'
import { pool } from '../../db'
import type { teamResults } from 'psqlDB';

// ONLY 1v1 games use this function - team and ffa games use openSkill
export async function calculateGlicko2(matchId: number, teamResults: teamResults): Promise<teamResults> {

    const matchData = await getMatchData(matchId);
    const settings = await getQueueSettings(matchData.queue_id);

    // Initialize the Glicko-2 system
    const glick = new Glicko2({
        tau: 0.5,
        rating: settings.default_elo,
        rd: 200,
        vol: 0.06
    })

    // Create Glicko-2 players for each participant using stored data
    const Player1 = glick.makePlayer(
        teamResults.teams[0].players[0]._rating ?? settings.default_elo,
        teamResults.teams[0].players[0]._rd ?? 200,
        teamResults.teams[0].players[0]._vol ?? 0.06
    )
    const Player2 = glick.makePlayer(
        teamResults.teams[1].players[0]._rating ?? settings.default_elo,
        teamResults.teams[1].players[0]._rd ?? 200,
        teamResults.teams[1].players[0]._vol ?? 0.06
    )

    const match: [Player, Player, number][] = [
        [Player1, Player2, teamResults.teams[0].score] 
    ];
    glick.updateRatings(match);

    // get rating change
    const oldRating1 = teamResults.teams[0].players[0]._rating || settings.default_elo;
    const oldRating2 = teamResults.teams[1].players[0]._rating || settings.default_elo;
    const newRating1 = Player1.getRating();
    const newRating2 = Player2.getRating();
    const ratingChange1 = newRating1 - oldRating1;
    const ratingChange2 = newRating2 - oldRating2;


    // Update the database with new ratings for both players
    await ratingUtils.updatePlayerGlickoAll(teamResults.teams[0].players[0].id, newRating1, Player1.getRd(), Player1.getVol());
    await ratingUtils.updatePlayerGlickoAll(teamResults.teams[1].players[0].id, newRating2, Player2.getRd(), Player2.getVol());

    // update TeamResults object with new ratings and changes
    teamResults.teams[0].players[0]._rating = newRating1;

    const teamResultsReturn = await updateTeamResults(teamResults, ['_rating', '_rd', '_vol']);
    return teamResultsReturn
}