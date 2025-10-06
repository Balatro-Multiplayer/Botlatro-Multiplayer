import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js'
import { pool } from '../../db'
import { client } from '../../client'

class Settings {
  qId: string
  qResultsId: string
  logsId: string
  qLogsId: string
  categoryId: string
  guild: any = null

  constructor(
    guild: any = null,
    qId: string = '',
    qResultsId: string = '',
    logsId: string = '',
    qLogsId: string = '',
    categoryId = '',
  ) {
    this.qId = qId
    this.qResultsId = qResultsId
    this.logsId = logsId
    this.qLogsId = qLogsId
    this.categoryId = categoryId
    this.guild = guild
  }

  // updates db when a new channel is made
  async updateDb(name: string, id: string) {
    switch (name) {
      case 'queue':
        await pool.query(
          `UPDATE settings SET queue_channel_id = $1 WHERE singleton = true`,
          [id],
        )
        break
      case 'queue-results':
        await pool.query(
          `UPDATE settings SET queue_results_channel_id = $1 WHERE singleton = true`,
          [id],
        )
        break
      case 'activity-log':
        await pool.query(
          `UPDATE settings SET logs_channel_id = $1 WHERE singleton = true`,
          [id],
        )
        break
      case 'queue-log':
        await pool.query(
          `UPDATE settings SET queue_logs_channel_id = $1 WHERE singleton = true`,
          [id],
        )
        break
    }
  }

  // updates object with a list of (user inputs ?? up-to-date settings)
  async update(
    queueChannelId: any = null,
    queueResultsChannelId: any = null,
    logsChannelId: any = null,
    queueLogsChannelId: any = null,
    category: any = null,
  ) {
    const settings = await pool.query(
      `SELECT * FROM settings WHERE singleton = true`,
    )
    const {
      queue_channel_id,
      queue_results_channel_id,
      logs_channel_id,
      queue_logs_channel_id,
      queue_category_id,
    } = settings.rows[0]
    this.qId = queueChannelId ?? queue_channel_id
    this.qResultsId = queueResultsChannelId ?? queue_results_channel_id
    this.logsId = logsChannelId ?? logs_channel_id
    this.qLogsId = queueLogsChannelId ?? queue_logs_channel_id
    this.categoryId = category ?? queue_category_id
  }

  // adds guild attribute to instance
  async addGuild(guild: any = null) {
    if (this.guild && !guild) {
      return
    }
    guild
      ? (this.guild = guild)
      : (this.guild =
          client.guilds.cache.get(process.env.GUILD_ID!) ??
          (await client.guilds.fetch(process.env.GUILD_ID!)))
  }
}

class Channel extends Settings {
  id: string = ''
  name: string = ''

  constructor(name: string = '', id: string = '') {
    super()
    this.id = id
    this.name = name
  }

  // checks if channel exists in discord's API
  async isExists() {
    if (!this.guild) await this.addGuild()
    const channel = await this.guild.channels.fetch(this.id).catch(() => null)
    return !!channel?.id
  }

  // gets channel object or null
  async getMe() {
    if (!(await this.isExists())) return null
    return await this.guild.channels.fetch(this.id).catch(() => null)
  }

  // creates channel if it doesnt exist
  async createMe(categoryId: any = null, name: any = null) {
    await this.updateMe()
    // await this.updateMe()
    if (await this.isExists()) return null
    await this.updateCategory()
    const channel = await this.guild.channels.create({
      name: name ?? this.name,
      type: 0, // text channel
      parent: categoryId ?? this.categoryId,
    })
    return { channelName: name ?? this.name, channelId: channel.id }
  }

  // deletes channel if it exists
  async deleteMe() {
    await this.updateMe()
    if (!(await this.isExists())) return null
    return await this.guild.channels.delete(this.id).catch(() => null)
  }

  // updates using parent settings data
  async updateMe() {
    await this.update()
    switch (this.name) {
      case 'queue':
        this.id = this.qId
        break
      case 'queue-results':
        this.id = this.qResultsId
        break
      case 'activity-log':
        this.id = this.logsId
        break
      case 'queue-log':
        this.id = this.qLogsId
        break
    }
    await this.addGuild()
    // await this.updateCategory()
  }

  // runs comparisons for self and other to decide on what action to take (re-create, leave, create)
  // self should be the more recent channel, other should be the old channel data
  // return false means nothing was done, true means something was done
  async compare(other: Channel, newCatId: string, oldCatId: string) {
    await other.updateMe()
    this.categoryId = newCatId
    other.categoryId = oldCatId

    // doesn't exist
    if (!(await other.isExists())) {
      console.log('old channel doesnt exist anymore: re-creating channel')
      const { channelName, channelId } = (await this.createMe())!
      await this.updateDb(channelName, channelId)
      return true
    }

    // does exist but wrong category
    else if (this.categoryId !== other.categoryId) {
      console.log('wrong category: re-creating channel')
      await other.deleteMe()
      await this.createMe()
      return true
    }

    // does exist and correct category
    else if (this.categoryId === other.categoryId) {
      console.log('channel exists in correct place: passing')
      return false
    }
  }

  // updates solely the category
  async updateCategory() {
    const res = await pool.query(
      `SELECT queue_category_id FROM settings WHERE singleton = true`,
    )
    this.categoryId = res.rows[0].queue_category_id
  }
}

class Channels extends Channel {
  q: Channel
  qResults: Channel
  logs: Channel
  qLogs: Channel
  category: string = ''

  constructor(
    q: Channel,
    qResults: Channel,
    logs: Channel,
    qLogs: Channel,
    category: string,
  ) {
    super()
    this.q = q
    this.qResults = qResults
    this.logs = logs
    this.qLogs = qLogs
    this.category = category
  }

  // calls update method on all channels contained in this class
  async updateAll() {
    await this.q.updateMe()
    await this.qResults.updateMe()
    await this.logs.updateMe()
    await this.qLogs.updateMe()
    await this.update()
  }

  // runs comparisons on all channel pairs
  async compareAll(old: Channels, newCatId: string, oldCatId: string) {
    await this.q.compare(old.q, newCatId, oldCatId)
    await this.qResults.compare(old.qResults, newCatId, oldCatId)
    await this.logs.compare(old.logs, newCatId, oldCatId)
    await this.qLogs.compare(old.qLogs, newCatId, oldCatId)
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName('setup-bot')
    .setDescription('[ADMIN] Setup the initial settings for the bot')
    // .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
        .setDescription(
          'The role for queue helpers, who can always see match channels',
        )
        .setRequired(true),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral })

    // get guild object
    const guild =
      client.guilds.cache.get(process.env.GUILD_ID!) ??
      (await client.guilds.fetch(process.env.GUILD_ID!))

    // old category id
    const res = await pool.query(
      `SELECT * FROM settings WHERE singleton = true`,
    )
    const oldCatId = res.rows[0]

    // command params
    const queueCategoryId: any =
      interaction.options.getChannel('queue-category')!.id
    const helperRoleId: any = interaction.options.getRole('helper-role')!.id
    const queueHelperRoleId: any =
      interaction.options.getRole('queue-helper-role')!.id

    // create list of old channels
    const oldChannels = new Channels(
      new Channel('queue'),
      new Channel('queue-results'),
      new Channel('activity-log'),
      new Channel('queue-log'),
      queueCategoryId,
    )

    // update info based on database and add guild instance
    await oldChannels.updateAll()

    // insert parameters into DB
    console.table({
      category: queueCategoryId,
      helper: helperRoleId,
      'queue helper': queueHelperRoleId,
    })
    await pool.query(
      `
                    INSERT INTO settings (singleton, queue_category_id, helper_role_id, queue_helper_role_id) 
                    VALUES ($1, $2, $3, $4) ON CONFLICT (singleton) DO UPDATE 
                    SET queue_category_id = EXCLUDED.queue_category_id,
                        helper_role_id = EXCLUDED.helper_role_id,
            queue_helper_role_id = EXCLUDED.queue_helper_role_id`,
      [true, queueCategoryId, helperRoleId, queueHelperRoleId],
    )

    // create list of new channels
    const newChannels = new Channels(
      new Channel('queue'),
      new Channel('queue-results'),
      new Channel('activity-log'),
      new Channel('queue-log'),
      queueCategoryId,
    )

    // update category to new category and add guild
    await newChannels.updateCategory()
    await newChannels.addGuild()

    // resolve conflicts until only left with correct channels existing
    await newChannels.compareAll(oldChannels, queueCategoryId, oldCatId)

    await interaction.editReply('channels created successfully!')
  },
}
