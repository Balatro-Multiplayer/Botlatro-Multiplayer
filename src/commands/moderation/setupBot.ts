import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  MessageFlags,
  TextChannel,
  ChannelType,
} from 'discord.js'
import { pool } from '../../db'
import { client } from '../../client'

export default {
  data: new SlashCommandBuilder()
    .setName('setup-bot')
    .setDescription('[ADMIN] Setup the initial settings for the bot')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) =>
      option
        .setName('queue-category')
        .setDescription('The category to put the queue channel into')
        .setRequired(true)
        .addChannelTypes(4),
    )
    .addRoleOption((option) =>
      option
        .setName('helper-role')
        .setDescription('The role for helpers')
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option
        .setName('queue-helper-role')
        .setDescription('The role for queue helpers, who can always see match channels')
        .setRequired(true),
    ),
  async execute(interaction: ChatInputCommandInteraction) {
    // ensure settings row exists
    try {
      const queueCategoryId = interaction.options.getChannel(
        'queue-category',
        true,
      )?.id
      const helperRoleId = interaction.options.getRole('helper-role', true)?.id
      const queueHelperRoleId = interaction.options.getRole('queue-helper-role', true)?.id
      if (queueCategoryId && helperRoleId) {
        await pool.query(
          `
					INSERT INTO settings (singleton, queue_category_id, helper_role_id, queue_helper_role_id) 
					VALUES ($1, $2, $3, $4) ON CONFLICT (singleton) DO UPDATE 
					SET queue_category_id = EXCLUDED.queue_category_id,
						helper_role_id = EXCLUDED.helper_role_id,
            queue_helper_role_id = EXCLUDED.queue_helper_role_id`,
          [true, queueCategoryId, helperRoleId, queueHelperRoleId],
        )
      }
    } catch (err: any) {
      console.error(err)
    }

    // main try catch for rest of setup
    try {
      const queueCategoryId = interaction.options.getChannel(
        'queue-category',
        true,
      )?.id
      const guild =
        client.guilds.cache.get(process.env.GUILD_ID!) ??
        (await client.guilds.fetch(process.env.GUILD_ID!))

      async function getOrCreateChannel(
        channelId: string | null,
        channelName: string,
        permissionOverwrites: any,
        databaseEntry: string,
      ) {
        let existingChannel: any = null

        // if channel id is in db, try to fetch channel from discord
        if (channelId) {
          existingChannel = interaction.guild?.channels.cache.get(channelId)
          if (!existingChannel) {
            try {
              ;(await interaction.guild?.channels.fetch(
                channelId,
              )) as TextChannel
            } catch (err) {
              existingChannel = null
            }
          }
        }

        // if there is no channel id in db, create channel and add to db
        else {
          const newChannel = (await interaction.guild?.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: queueCategoryId,
            permissionOverwrites: permissionOverwrites,
          })) as TextChannel
          await pool.query(
            `
						UPDATE settings SET ${databaseEntry} = $1 WHERE singleton = $2`,
            [newChannel.id, true],
          )
          return newChannel
        }

        // if the channel that the db references doesn't exist, create it and overwrite the db entry
        if (!existingChannel) {
          const newChannel = (await interaction.guild?.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            parent: queueCategoryId,
            permissionOverwrites: permissionOverwrites,
          })) as TextChannel
          await pool.query(
            `
						UPDATE settings SET ${databaseEntry} = $1 WHERE singleton = $2`,
            [newChannel.id, true],
          )
          return newChannel
        }

        // if everything is fine, return existing channel
        else {
          return existingChannel
        }
      }

      const helperRole = interaction.options.getRole('helper-role', true)
      const settingsRes = await pool.query(
        'SELECT * FROM settings WHERE singleton = true',
      )
      if (!settingsRes || settingsRes.rowCount === 0) {
        throw new Error('Settings row not found in database after insertion.')
      }
      const settings = settingsRes.rows[0]

      // Permissions
      const botId = guild.members.me?.user.id || ''
      const everyonePermsSend = [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.SendMessages] },
      ]
      const everyonePermsView = [
        { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      ]
      const helperPerms = {
        id: helperRole.id,
        allow: [PermissionFlagsBits.ViewChannel],
        deny: [PermissionFlagsBits.SendMessages],
      }
      const botPerms = {
        id: botId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
        ],
      }

      // Get or create all channels
      ;(await getOrCreateChannel(
        settings.queue_channel_id,
        'queue',
        everyonePermsSend,
        'queue_channel_id',
      ),
        await getOrCreateChannel(
          settings.queue_results_channel_id,
          'queue-results',
          [everyonePermsSend[0], botPerms],
          'queue_results_channel_id',
        ),
        await getOrCreateChannel(
          settings.logs_channel_id,
          'activity-log',
          [everyonePermsView[0], helperPerms, botPerms],
          'logs_channel_id',
        ),
        await getOrCreateChannel(
          settings.queue_logs_channel_id,
          'queue-log',
          [everyonePermsView[0], helperPerms],
          'queue_logs_channel_id',
        ))

      await interaction.reply({
        content:
          'Successfully setup queue bot! Use </create queue:1414248501742669938> to setup a queue and queue message.',
        flags: MessageFlags.Ephemeral,
      })
    } catch (err: any) {
      console.error(err)
      const errorMsg = err.detail || err.message || 'Unknown'
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `Failed to setup bot in database. Reason: ${errorMsg}`,
        })
      } else {
        await interaction.reply({
          content: `Failed to setup bot in database. Reason: ${errorMsg}`,
          flags: MessageFlags.Ephemeral,
        })
      }
    }
  },
}
