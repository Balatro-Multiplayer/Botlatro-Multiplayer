import { Events, Client } from "discord.js";
import { startUpQueues } from "../utils/queueHelpers";

module.exports = {
	name: Events.ClientReady,
	once: true,
	async execute(client: Client) {
		await startUpQueues();
		console.log(`Ready! Logged in as ${client.user?.tag}`);
	},
};
