import { EmbedBuilder, EmbedField } from 'discord.js'
import { pool } from '../db'
import { client } from '../client'
import { EmbedType } from 'psqlDB'

// import { EmbedType } from 'psqlDB'

export abstract class Embed {
  channel: any = null
  embed: any = null
  embedFields: EmbedField[] = []
  color: number = 10070709 // grey
  title: string = 'TITLE'
  description: string = ' '
  blame: string = ' '
  logType: string = 'command' // default to a command type log
  id: number | undefined = undefined

  // create embed based on instance values
  public createEmbed() {
    this.embed = new EmbedBuilder()
      .setTitle(this.title) // Title
      .setDescription(this.description) // Description
      .setColor(this.color) // Color
      .setFooter({ text: `Issued by: ${this.blame}` }) // Footer
      .setTimestamp()
  }

  // set fields in instance
  public setFields(fields: EmbedField[]) {
    this.embedFields = fields
  }

  // add fields to embed
  public addFields() {
    for (let field of this.embedFields) {
      this.embed.addFields(field)
    }
  }

  // set instance values
  public setChannel(channel: any) {
    this.channel = channel
  }
  public setEmbed(embed: any) {
    this.embed = embed
  }
  public setEmbedFields(fields: any[]) {
    this.embedFields = fields
  }
  public setColor(color: number) {
    this.color = color
  }
  public setTitle(title: string) {
    this.title = title
  }
  public setBlame(blame: string) {
    this.blame = blame
  }

  public setAll(e: EmbedType) {
    if (e.title) this.setTitle(e.title)
    if (e.color) this.setColor(e.color)
    if (e.blame) this.setBlame(e.blame)
    if (e.fields) this.setFields(e.fields)
  }

  // get logging channel (constant for all logs for now)
  public async setLogChannel() {
    const res = await pool.query(
      `SELECT * FROM settings WHERE singleton = true`,
    )
    let channelId: string = ''
    switch (this.logType) {
      case 'queue':
        channelId = res.rows[0].queue_logs_channel_id
        break
      case 'room':
        channelId = res.rows[0].room_log_id
        break
      case 'command':
        channelId = res.rows[0].logs_channel_id
        break
    }
    if (channelId !== '') {
      this.channel = await client.channels.fetch(channelId).catch(() => null)
    }
  }

  // build and send embed to logging channel
  public async logCommand() {
    // build embed (make sure fields are set)
    this.createEmbed()
    this.addFields()

    // send embed
    const message = await this.channel
      .send({ embeds: [this.embed] })
      .catch(() => null)
    if (this.logType === 'room') {
      await pool.query(
        `
        UPDATE user_room SET log_id = $1 WHERE id = $2
      `,
        [message.id, this.id],
      )
    }
  }
}

export class CommandFactory extends Embed {
  // build child instances
  static build(commandType: string, id?: number, description?: string) {
    switch (commandType) {
      case 'add_strike':
        const addStrike = new AddStrike()
        addStrike.description = description ?? ' '
        return addStrike
      case 'remove_strike':
        const removeStrike = new RemoveStrike()
        removeStrike.description = description ?? ' '
        return removeStrike
      case 'general':
        return new General()
      case 'room':
        return new Room(id)
    }
  }
}

export class General extends CommandFactory {
  color: number = 10070709 // grey
  title: string = 'COMMAND LOGGED'
  logType: string = 'command'
}

export class Room extends CommandFactory {
  color: number = 16776960 // yellow
  title: string = 'Room created'
  logType: string = 'room'

  constructor(id?: number) {
    super()
    this.id = id
  }
}

export class RemoveStrike extends CommandFactory {
  color: number = 65280 // green
  title: string = 'REMOVE STRIKE'
  logType: string = 'command'
}

export class AddStrike extends CommandFactory {
  color: number = 16711680 // red
  title: string = 'ADD STRIKE'
  logType: string = 'command'
}

// distilled process to log an EmbedType object
// @parameter
// type - choose from a list of embed types ['add_strike', 'remove_strike', 'general', 'room']
export async function logStrike(
  type: string,
  embed: EmbedType,
  id?: number,
  desc?: string,
) {
  // build strike child class using type as parameter in factory
  const strike = CommandFactory.build(type, id, desc)
  if (!strike) return
  // build embed using info from an EmbedType object
  strike.setAll(embed)
  strike.createEmbed()
  strike.addFields()

  // send embed to logging channel
  await strike.setLogChannel()
  await strike.logCommand()
}

// helper for building EmbedType object
export function createEmbedType(
  title: string | null = null,
  description: string | null = null,
  color: number | null = null,
  fields: EmbedField[] | null = null,
  footer: { text: string } | null = null,
  blame: string | null = null,
): EmbedType {
  return {
    title: title,
    description: description,
    color: color,
    fields: fields,
    footer: footer,
    blame: blame,
  }
}

// add returns to embed field text to prevent loooong embeds
export function formatEmbedField(txt: string) {
  const arr = txt.split(' ') // split at spaces
  let count: number = 0
  let newArr: string[] = []
  for (let word of arr) {
    count += word.length
    if (count > 30) {
      const middle = Math.floor(word.length / 2)
      word = word.slice(0, middle) + '-\n' + word.slice(middle)
      count = 0
    } else if (count > 20) {
      word += '\n'
      count = 0
      console.log('triggered')
    }
    newArr.push(word)
  }
  return newArr.join(' ')
}
