import { set, update } from "lodash-es";
import { partyUtils, getUsersInQueue, getCurrentEloRangeForUser, updateCurrentEloRangeForUser, ratingUtils, getQueueChannelId } from "./queryDB";
import { getQueueSettings } from "./queryDB";
import { queueUsers } from "./queueHelpers";
import { get } from "http";

// delete old parties every 5 minutes
export async function partyDeleteCronJob() {
    setInterval(async () =>{
        console.log('-- running partyDeleteCronJob --');

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
    const queueSettings = await getQueueSettings(queueId, ['elo_search_speed'] );
    const speed = queueSettings.elo_search_speed || 2;
    setInterval(async () =>{

        const queueSettings = await getQueueSettings(queueId, ['elo_search_increment', 'elo_search_speed', 'elo_search_start'] );
        const increment = queueSettings.elo_search_increment || 1;
        const start = queueSettings.elo_search_start || 0;
        const usersInQueue = await getUsersInQueue(queueId);

        let bestMatch: { range: number, userId: string, elo: number }[] = [];

        for (const userId of usersInQueue) {
            const elo = await ratingUtils.getPlayerElo(userId, queueId);
            if (!elo) {
                throw new Error(`User ${userId} does not have an ELO rating in queue ${queueId}`)
            };
            const currentRange = await getCurrentEloRangeForUser(userId, queueId);
            let newRange = currentRange;

            // increment range and update DB
            newRange = (currentRange ?? start) + increment 
            await updateCurrentEloRangeForUser(userId, queueId, newRange);

            if (bestMatch.length > 2){
                bestMatch.pop();
            }

            // if there are already 2 users, then we are competing for a spot
            if (bestMatch.length === 2){
                const currentBest = Math.abs(bestMatch[0].elo - bestMatch[1].elo);

                const firstDiff = Math.abs(bestMatch[0].elo - elo);
                const secondDiff = Math.abs(bestMatch[1].elo - elo);

                const firstIsValid = (firstDiff < newRange && firstDiff < bestMatch[0].range)
                const secondIsValid = (secondDiff < newRange && secondDiff < bestMatch[1].range)

                if (firstDiff < currentBest && firstIsValid) {
                    bestMatch.pop()
                    bestMatch.push({ range: newRange, userId: userId, elo: elo});
                }
                else if (secondDiff < currentBest && secondIsValid) {
                    bestMatch.shift()
                    bestMatch.push({ range: newRange, userId: userId, elo: elo});
                }
            }

            // if there are no users, its a free space
            if (bestMatch.length === 0){
                bestMatch.push({ range: newRange, userId: userId, elo: elo});
            }

            // if there is one user, we get instantly added as long as we are within valid range
            if (bestMatch.length === 1){
                const diff = Math.abs(bestMatch[0].elo - elo); 
                const isValid = (diff < newRange && diff < bestMatch[0].range)
                if (isValid) {
                    bestMatch.push({ range: newRange, userId: userId, elo: elo});
                }
            }

            
        }

        const matchupUsers = (bestMatch.length === 2) ? bestMatch.map(user => user.userId) : [];
        const queueChannelId = await getQueueChannelId(queueId);
        queueUsers(matchupUsers, queueChannelId);
    }), speed * 1000;
}