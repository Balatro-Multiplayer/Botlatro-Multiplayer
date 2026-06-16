import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ComponentType,
  EmbedBuilder,
  MessageFlags,
} from 'discord.js'

const DEFAULT_COLOR = 0x5865f2
// Discord caps an embed description at 4096 chars; stay well under it.
const MAX_PAGE_LENGTH = 3800
// Soft cap so pages stay readable even when entries are short.
const MAX_ENTRIES_PER_PAGE = 12
const ENTRY_SEPARATOR = '\n\n'
const COLLECTOR_TIMEOUT_MS = 5 * 60 * 1000

const PREV_ID = 'paginate_prev'
const NEXT_ID = 'paginate_next'

type PaginateOptions = {
  maxPageLength?: number
  maxEntriesPerPage?: number
}

// Greedily pack entries into pages, splitting when the next entry would push a
// page past the length budget or the per-page entry cap (dynamic content-length
// detection). An entry larger than the budget still gets its own page.
export function paginateEntries(
  entries: string[],
  {
    maxPageLength = MAX_PAGE_LENGTH,
    maxEntriesPerPage = MAX_ENTRIES_PER_PAGE,
  }: PaginateOptions = {},
): string[][] {
  const pages: string[][] = []
  let current: string[] = []
  let currentLength = 0

  for (const entry of entries) {
    const separatorLength = current.length > 0 ? ENTRY_SEPARATOR.length : 0
    const wouldOverflow =
      currentLength + separatorLength + entry.length > maxPageLength
    const wouldExceedCount = current.length >= maxEntriesPerPage

    if (current.length > 0 && (wouldOverflow || wouldExceedCount)) {
      pages.push(current)
      current = []
      currentLength = 0
    }

    currentLength +=
      (current.length > 0 ? ENTRY_SEPARATOR.length : 0) + entry.length
    current.push(entry)
  }

  if (current.length > 0) pages.push(current)
  return pages
}

function buildButtons(pageIndex: number, totalPages: number, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(PREV_ID)
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || pageIndex === 0),
    new ButtonBuilder()
      .setCustomId(NEXT_ID)
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || pageIndex === totalPages - 1),
  )
}

type SendPaginatedEmbedOptions = {
  title: string
  entries: string[]
  /** Summary shown in the footer (e.g. counts). "Page X/Y" is appended automatically. */
  summary?: string
  emptyState: string
  color?: number
  ephemeral?: boolean
}

// Render a list as a paginated embed. With a single page no buttons are shown;
// with multiple pages, ◀ / ▶ buttons let the invoker page through. The collector
// only responds to the user who ran the command and disables itself on timeout.
export async function sendPaginatedEmbed(
  interaction: ChatInputCommandInteraction,
  {
    title,
    entries,
    summary,
    emptyState,
    color = DEFAULT_COLOR,
    ephemeral = true,
  }: SendPaginatedEmbedOptions,
) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply(
      ephemeral ? { flags: MessageFlags.Ephemeral } : {},
    )
  }

  if (entries.length === 0) {
    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(emptyState)
      .setTimestamp()
    await interaction.editReply({ embeds: [embed], components: [] })
    return
  }

  const pages = paginateEntries(entries)

  const buildEmbed = (pageIndex: number) => {
    const footerParts = [
      summary,
      pages.length > 1 ? `Page ${pageIndex + 1}/${pages.length}` : undefined,
    ].filter((part): part is string => Boolean(part))

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(pages[pageIndex].join(ENTRY_SEPARATOR))
      .setTimestamp()

    if (footerParts.length > 0) {
      embed.setFooter({ text: footerParts.join(' · ') })
    }
    return embed
  }

  if (pages.length === 1) {
    await interaction.editReply({ embeds: [buildEmbed(0)], components: [] })
    return
  }

  let pageIndex = 0
  const message = await interaction.editReply({
    embeds: [buildEmbed(pageIndex)],
    components: [buildButtons(pageIndex, pages.length)],
  })

  const collector = message.createMessageComponentCollector({
    componentType: ComponentType.Button,
    filter: (i) => i.user.id === interaction.user.id,
    time: COLLECTOR_TIMEOUT_MS,
  })

  collector.on('collect', async (buttonInteraction) => {
    if (buttonInteraction.customId === PREV_ID) {
      pageIndex = Math.max(0, pageIndex - 1)
    } else if (buttonInteraction.customId === NEXT_ID) {
      pageIndex = Math.min(pages.length - 1, pageIndex + 1)
    }

    await buttonInteraction.update({
      embeds: [buildEmbed(pageIndex)],
      components: [buildButtons(pageIndex, pages.length)],
    })
  })

  collector.on('end', async () => {
    await interaction
      .editReply({
        embeds: [buildEmbed(pageIndex)],
        components: [buildButtons(pageIndex, pages.length, true)],
      })
      .catch(() => {})
  })
}
