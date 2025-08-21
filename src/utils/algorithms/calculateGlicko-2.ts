import { Player, Glicko2 } from 'glicko2.ts'
import { getQueueSettings, getMatchData, getPlayerDataLive } from '.././queryDB'
import { pool } from '../../db'

export async function calculateGlicko2(matchId: number) {

    const matchData = await getMatchData(matchId);
    const settings = await getQueueSettings(matchData.queue_id);
    const playerData = await getPlayerDataLive(matchId);




    // const glick = new Glicko2({
    // tau: 0.5,
    // rating: settings.default_elo,
    // rd: 200,
    // vol: 0.06,

    // // this was copilots algorithm, idk how it works, we will find our own later:
    // volatilityAlgorithm(v, delta, { vol, tau, rd, rating }) {
    //     const v2 = v * v;
    //     const delta2 = delta * delta;
    //     const rd2 = rd * rd;
    //     const a = Math.log(v2);
    //     const b = Math.log(delta2);
    //     const c = (a - b) / (2 * tau * tau);
    //     return Math.sqrt(Math.max(0, c + Math.sqrt(c * c + 1)));
    // }
    // })

}