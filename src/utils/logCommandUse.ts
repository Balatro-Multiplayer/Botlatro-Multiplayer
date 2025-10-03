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
  description: string = 'description'
  blame: string = ''

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
    for (let field in this.embedFields) {
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
  public async getLogChannel() {
    const res = await pool.query(
      `SELECT * FROM settings WHERE singleton = true`,
    )
    const channelId = res.rows[0].logs_channel_id
    this.channel = await client.channels.fetch(channelId).catch(() => null)
  }

  // build and send embed to logging channel
  public async logCommand() {
    // build embed (make sure fields are set)
    this.createEmbed()
    this.addFields()

    // send embed
    await this.channel.send({ embeds: [this.embed] }).catch(() => null)
  }
}

export class CommandFactory extends Embed {
  // build child instances
  static build(commandType: string) {
    switch (commandType) {
      case 'add_strike':
        return new AddStrike()
      case 'remove_strike':
        return new RemoveStrike()
      case 'general':
        return new General()
    }
  }
}

export class General extends CommandFactory {
  color: number = 10070709 // grey
  title: string = 'COMMAND LOGGED'
}

export class RemoveStrike extends CommandFactory {
  color: number = 16711680 // red
  title: string = 'REMOVE STRIKE'
}

export class AddStrike extends CommandFactory {
  color: number = 65280 // green
  title: string = 'ADD STRIKE'
}

export async function logStrike(type: string, embed: EmbedType) {
  // build strike child class using type as parameter in factory
  const strike = CommandFactory.build(type)
  if (!strike) return

  // build embed using info from an EmbedType object
  strike.setAll(embed)
  strike.createEmbed()
  strike.addFields()

  // send embed to logging channel
  await strike.getLogChannel()
  await strike.logCommand()
}
