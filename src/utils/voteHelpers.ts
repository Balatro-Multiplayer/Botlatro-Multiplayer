import { Embed, Interaction, MessageComponentInteraction, MessageFlags, StringSelectMenuInteraction } from "discord.js";

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

export async function handleTwoPlayerMatchVoting(
    interaction: StringSelectMenuInteraction,
    {
        participants = [] as string[],
        onComplete = async (
            interaction: StringSelectMenuInteraction,
            winner: number
        ) => {},
    }
) {
    const embed = interaction.message.embeds[0];
    const fields = embed.data.fields;
    if (!fields) return console.error("No fields found in embed");

    const winMatchData: string[] = interaction.values[0].split('_');
    const winMatchTeamId = parseInt(winMatchData[2]);
    const voteArray: { team_id: number, votes: string[] }[] = [];
    const userTag = `<@${interaction.user.id}>`;

    // Restrict to allowed voters
    if (participants.length && !participants.includes(interaction.user.id)) {
        return interaction.reply({
            content: `You are not allowed to vote in this poll.`,
            flags: MessageFlags.Ephemeral,
        });
    }

    for (let i = 0; i < fields.length; i++) {
        const lines = fields[i].value?.split("\n") || [];

        const mmrLine = lines.find(l => l.includes("MMR")) || "";
        const voteLines = lines.filter(l => l.trim() !== "" && !l.includes("MMR") && !l.includes("Win Votes"));

        const idx = voteLines.indexOf(userTag);
        if (idx !== -1) voteLines.splice(idx, 1);

        // Teams start at 1
        if (winMatchTeamId == i+1) voteLines.push(userTag);

        let newValue = mmrLine;
        newValue += `\nWin Votes`;
        if (voteLines.length > 0) newValue += "\n" + voteLines.join("\n");

        fields[i].value = newValue || "\u200b";

        voteArray.push({ team_id: i, votes: voteLines });
    }

    // Check if all participants voted
    const totalVotes = voteArray.reduce((sum, team) => sum + team.votes.length, 0);
    const allVoted = participants.length > 0 && totalVotes === participants.length;
    
    if (allVoted) {
        // Check majority
        const majority = Math.floor(participants.length / 2) + 1;
        let winner: number | undefined;
        for (let i = 0; i < voteArray.length; i++) {
            if (voteArray[i].votes.length >= majority) {
                winner = i+1; // Teams start at 1
            }
        }

        if (winner) {
            await onComplete(interaction, winner);
            return;
        }
    }

    interaction.message.embeds[0] = embed;

    // Update the message with new embed
    await interaction.update({ embeds: interaction.message.embeds });
}