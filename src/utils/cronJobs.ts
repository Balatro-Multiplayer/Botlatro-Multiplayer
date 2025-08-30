import { set, update } from "lodash-es";
import { partyUtils, getUsersInQueue, getCurrentEloRangeForUser, updateCurrentEloRangeForUser, ratingUtils, removeUserFromQueue } from "./queryDB";
import { getQueueSettings } from "./queryDB";
import { matchUpGames, queueUsers } from "./queueHelpers";
import { get } from "http";

// delete old parties every 5 minutes
export async function partyDeleteCronJob() {
    setInterval(async () =>{
        const parties = await partyUtils.listAllParties();
        const now = new Date();

        parties.map(async (party) => {
            // delete parties older than 24 hours
            const createdAt = new Date(party.created_at);
            const ageInMinutes = (now.getTime() - createdAt.getTime()) / (1000 * 60);
            if (ageInMinutes > 24 * 60) { // 24 hours
                console.log(`Deleting party ${party.name} (ID: ${party.id}) - reason: Older than 24 hours (${ageInMinutes.toFixed(2)} minutes)`);
                await partyUtils.deleteParty(party.id);
            } 

            // delete parties with no members
            else {
                const members = await partyUtils.getPartyUserList(party.id, true);
                if (!members || members.length === 0) {
                    console.log(`Deleting party ${party.name} (ID: ${party.id}) - reason: No members`);
                    await partyUtils.deleteParty(party.id);
                }
            }
        })



    }, 5 * 60 * 1000); // 5 minutes in milliseconds
}


// increment elo search for a specific queue
export async function incrementEloCronJob(queueId: number) {
    const queueSettings = await getQueueSettings(queueId, ["elo_search_speed"]);
    const speed = queueSettings.elo_search_speed || 2;

    setInterval(async () => {
        try {
            const queueSettings = await getQueueSettings(queueId, [
                "elo_search_increment",
                "elo_search_speed",
                "elo_search_start",
            ]);

            const increment = queueSettings.elo_search_increment || 1;
            const start = queueSettings.elo_search_start || 0;
            const usersInQueue = await getUsersInQueue(queueId);

            if (usersInQueue.length <= 1) return;

            const candidates: { range: number; userId: string; elo: number }[] = [];

            for (const userId of usersInQueue) {
                const elo = await ratingUtils.getPlayerElo(userId, queueId);
                if (!elo) {
                    throw new Error(
                        `User ${userId} does not have an ELO rating in queue ${queueId}`
                    );
                }

                const currentRange = await getCurrentEloRangeForUser(userId, queueId);
                const newRange = (currentRange ?? start) + increment;

                await updateCurrentEloRangeForUser(userId, queueId, newRange);

                candidates.push({ range: newRange, userId, elo });
            }

            // find the best two candidates with the smallest elo difference
            let bestPair: { userId: string; elo: number }[] = [];
            let minDiff = Infinity;

            for (let i = 0; i < candidates.length; i++) {
                for (let j = i + 1; j < candidates.length; j++) {
                    const diff = Math.abs(candidates[i].elo - candidates[j].elo);

                    const inRange =
                        diff < candidates[i].range && diff < candidates[j].range;

                    if (inRange && diff < minDiff) {
                        minDiff = diff;
                        bestPair = [candidates[i], candidates[j]];
                    }
                }
            }

            if (bestPair.length === 2) {
                const matchupUsers = bestPair.map(u => u.userId);

                for (const userId of matchupUsers) {
                    await removeUserFromQueue(queueId, userId); 
                }

                await queueUsers(matchupUsers, queueId);
            }

        } catch (err) {
            console.error("Error with matchmaking:", err);
        }
    }, speed * 1000);
}
