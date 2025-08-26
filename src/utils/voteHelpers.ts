import { Embed, Interaction, MessageComponentInteraction, MessageFlags } from "discord.js";

export async function handleVoting(interaction: MessageComponentInteraction, {
    voteType = "Votes",
    embedFieldIndex = 2,       // which field of the embed holds the votes
    participants = [] as string[],         // list of user IDs who are allowed to vote
    onComplete = async (interaction: MessageComponentInteraction, extra: { embed: Embed, votes?: string[] }) => {} // callback when all participants vote
}) {
    const embed = interaction.message.embeds[0];
    const fields = embed.data.fields;
    if (!fields) return console.error('No fields found in embed');

    // Ensure vote field exists
    if (!fields[embedFieldIndex]) {
        fields[embedFieldIndex] = { name: `${voteType}:`, value: "" };
    }

    const field = fields[embedFieldIndex];
    const votes = field.value ? field.value.split('\n').filter(v => v.trim() !== "") : [];

    // Check if user already voted
    if (votes.includes(`<@${interaction.user.id}>`)) {
        return interaction.reply({
            content: `You've already voted!`,
            flags: MessageFlags.Ephemeral
        });
    }

    // Check if user is allowed to vote
    if (participants.length && !participants.includes(interaction.user.id)) {
        return interaction.reply({
            content: `You are not allowed to vote in this poll.`,
            flags: MessageFlags.Ephemeral
        });
    }

    // Add vote
    votes.push(`<@${interaction.user.id}>`);
    fields[embedFieldIndex].value = votes.join('\n');

    // Check if voting is complete
    if (participants.length > 0 && votes.length === participants.length) {
        await onComplete(interaction, { votes, embed });
        return;
    }

    // Update embed with new votes
    interaction.message.embeds[0] = embed;
    await interaction.update({ embeds: interaction.message.embeds });
}
