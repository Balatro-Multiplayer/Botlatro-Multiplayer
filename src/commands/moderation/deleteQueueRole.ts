import { COMMAND_HANDLERS } from 'command-handlers';
import {
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js'
import { getQueueIdFromName } from 'utils/queryDB';

export default {
  async execute(interaction: ChatInputCommandInteraction) {
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const queueName = interaction.options.getString('queue-name', true);
        const queueId = await getQueueIdFromName(queueName);
        const role = interaction.options.getRole('role', true);

        await COMMAND_HANDLERS.MODERATION.DELETE_QUEUE_ROLE(queueId, role.id);
        
        await interaction.editReply({
            content: `Successfully deleted ${role.name} from ${queueName}.`,
        })
        
    } catch (err: any) {
      console.error(err)
        const errorMsg = err.detail || err.message || 'Unknown'
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
                content: `Failed to delete queue role. Reason: ${errorMsg}`,
            })
        } else {
            await interaction.reply({
                content: `Failed to delete queue role. Reason: ${errorMsg}`,
                flags: MessageFlags.Ephemeral,
            })
        }
    }
  },
}
