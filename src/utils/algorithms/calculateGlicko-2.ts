import { Player, Glicko2 } from 'glicko2'
import { getQueueSettings, getMatchData, ratingUtils, getWinningTeamFromMatch } from '.././queryDB'
import type { teamResults } from 'psqlDB';

// ONLY 1v1 games use this function - team and ffa games use openSkill
export async function calculateGlicko2(queueId: number, matchId: number, teamResults: teamResults): Promise<teamResults> {

    const matchData = await getMatchData(matchId);
    const settings = await getQueueSettings(matchData.queue_id);

    const glick = new Glicko2({
        tau: 0.35, 
        rating: settings.default_elo, 
        rd: 100, 
        vol: 0.08 
    });


    // Create Glicko-2 players for each participant using stored data
    const Player1 = glick.makePlayer(
        teamResults.teams[0].players[0].elo ?? settings.default_elo,
        teamResults.teams[0].players[0].rating_deviation ?? 100,
        teamResults.teams[0].players[0].volatility ?? 0.08
    )
    const Player2 = glick.makePlayer(
        teamResults.teams[1].players[0].elo ?? settings.default_elo,
        teamResults.teams[1].players[0].rating_deviation ?? 100,
        teamResults.teams[1].players[0].volatility ?? 0.08
    )

    const match: [Player, Player, number][] = [
        [Player1, Player2, teamResults.teams[0].score] 
    ];
    glick.updateRatings(match);

    // get rating change
    const oldRating1 = teamResults.teams[0].players[0].elo || settings.default_elo;
    const oldRating2 = teamResults.teams[1].players[0].elo || settings.default_elo;
    const newRating1 = parseFloat(Player1.getRating().toFixed(1));
    const newRating2 = parseFloat(Player2.getRating().toFixed(1));
    const ratingChange1 = parseFloat((newRating1 - oldRating1).toFixed(1))
    const ratingChange2 = parseFloat((newRating2 - oldRating2).toFixed(1))

    // Update the database with new ratings for both players
    await ratingUtils.updatePlayerGlickoAll(queueId, teamResults.teams[0].players[0].user_id, newRating1, Player1.getRd(), Player1.getVol());
    await ratingUtils.updatePlayerGlickoAll(queueId, teamResults.teams[1].players[0].user_id, newRating2, Player2.getRd(), Player2.getVol());

    // update TeamResults object with new ratings and changes
    teamResults.teams[0].players[0].elo = newRating1;
    teamResults.teams[0].players[0].elo_change = ratingChange1;
    teamResults.teams[0].players[0].volatility = Player1.getVol();
    teamResults.teams[0].players[0].rating_deviation = Player1.getRd();
    teamResults.teams[1].players[0].elo = newRating2;
    teamResults.teams[1].players[0].elo_change = ratingChange2;
    teamResults.teams[1].players[0].volatility = Player2.getVol();
    teamResults.teams[1].players[0].rating_deviation = Player2.getRd();

    const winningTeam = await getWinningTeamFromMatch(matchId);
    for (const team of teamResults.teams) {
        if (team.id === winningTeam) {
            team.score = 1;
        } else {
            team.score = 0;
        }
    }

    return teamResults;
}