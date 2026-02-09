import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js'

export async function createFeedback() {
  const buttonsRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('feedback_yes')
      .setLabel('I like it!')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId('feedback_maybe')
      .setLabel("I'm not too sure on it...")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('feedback_no')
      .setLabel("I don't like it.")
      .setStyle(ButtonStyle.Danger),
  )

  const modal = new ModalBuilder()
    .setCustomId('feedback_modal')
    .setTitle('What do you think of the changes?')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('dum dum dum')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('diddly doo')
            .setStyle(TextInputStyle.Paragraph),
        ),
    )
}
