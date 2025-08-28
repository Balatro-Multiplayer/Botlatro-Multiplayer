import { partyUtils } from "./queryDB";
import { getQueueSettings } from "./queryDB";

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
export async function incrementElo(queueId: number) {
    const queueSettings = await getQueueSettings(queueId, ['elo_search_increment', 'elo_search_speed', 'elo_search_start'] );
    const increment = queueSettings.elo_search_increment || 1;
    const speed = queueSettings.elo_search_speed || 2;
    const start = queueSettings.elo_search_start || 0;

    
}