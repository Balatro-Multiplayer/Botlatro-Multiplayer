import { set, update } from "lodash-es";
import { partyUtils, getUsersInQueue, getCurrentEloRangeForUser, updateCurrentEloRangeForUser, ratingUtils, removeUserFromQueue, getActiveQueues, getUserQueues } from "./queryDB";
import { getQueueSettings } from "./queryDB";
import { createMatch, matchUpGames } from "./queueHelpers";
import * as fs from 'fs';
import * as path from 'path';
import { glob } from "glob";
import { get } from "http";
import { Client, Collection, GatewayIntentBits, Events, REST, Routes } from 'discord.js';

const lockedUsers = new Set<string>();

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


// increment elo search globally across all queues
// TODO: Make this work with the priority_queue_id in the users table
export async function incrementEloCronJobAllQueues() {
    const speedDefault = 2;

    setInterval(async () => {
        try {
            // get all active queues
            const activeQueues = await getActiveQueues();

            for (const queue of activeQueues) {
                const queueSettings = await getQueueSettings(queue.id, [
                    "elo_search_increment",
                    "elo_search_speed",
                    "elo_search_start",
                ]);
                const increment = queueSettings.elo_search_increment || 1;
                const start = queueSettings.elo_search_start || 0;

                let usersInQueue = await getUsersInQueue(queue.id);
                if (usersInQueue.length <= 1) continue;

                const candidates: { range: number; userId: string; elo: number; queueId: number }[] = [];

                for (const userId of usersInQueue) {
                    const elo = await ratingUtils.getPlayerElo(userId, queue.id);
                    if (!elo) continue;

                    const currentRange = await getCurrentEloRangeForUser(userId, queue.id);
                    const newRange = (currentRange ?? start) + increment;
                    await updateCurrentEloRangeForUser(userId, queue.id, newRange);

                    candidates.push({ range: newRange, userId, elo, queueId: queue.id });
                }

                // find best pair within this queue
                let bestPair: { userId: string; elo: number; queueId: number }[] = [];
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

                    // remove users from all queues they are in
                    for (const userId of matchupUsers) {
                        const userQueues = await getUserQueues(userId); 
                        for (const queue of userQueues) {
                            await removeUserFromQueue(queue.id, userId);
                        }
                    }

                    // queue them for the match
                    await createMatch(matchupUsers, bestPair[0].queueId);
                }
            }
        } catch (err) {
            console.error("Error in global matchmaking:", err);
        }
    }, speedDefault * 1000);
}


// delete old transcript files in case they dont get deleted  TODO: this should maybe send the data before deleting?
export async function deleteOldTranscriptsCronJob() {
    setInterval(async () => {
        console.log('-- running deleteOldTranscriptsCronJob --');
        const client = (await import('../index')).default; 
        const guild = client.guilds.cache.get(process.env.GUILD_ID!) 

        const pattern = path.join(__dirname, '..', 'logs', `match-*_*.log`).replace(/\\/g, '/');
        const files = await glob(pattern);

        files.map(file => {
            const channelId = file.split('_').pop()?.replace('.log', '');
            if (!channelId) return;
            const channel = guild?.channels.cache.get(channelId) || null;
            if (!channel) {
                console.log(`Deleting old transcript file: ${file}`);
                fs.unlinkSync(file);
            }
        });

    }, 5 * 60 * 1000); // every 5 mins
}