import { EmbedBuilder } from 'discord.js'
import { pool } from '../db'
import { client } from '../client'

export type embedField = {
  name: string
  value: string
}

export abstract class Embed {
  channel: any = null
  embed: any = null
  embedFields: embedField[] = []
  color: number = 10070709 // grey
  title: string = 'TITLE'
  description: string = 'description'
  blame: any = null

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
  public setFields(fields: embedField[]) {
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
  constructor(color: number = 10070709, title: string = 'COMMAND LOGGED') {
    super()
    this.color = color
    this.title = title
  }
}

export class RemoveStrike extends CommandFactory {
  color: number = 16711680 // red
  title: string = 'REMOVE STRIKE'
}

export class AddStrike extends CommandFactory {
  color: number = 65280 // green
  title: string = 'ADD STRIKE'
}

// const addStrike = CommandFactory.build('strike') as AddStrike
