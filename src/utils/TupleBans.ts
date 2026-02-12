import { pool } from '../db'
import { BannedDecks, Decks, Stakes } from 'psqlDB'
import { getCombinedEmote } from './combinedEmoteCache'

export type TupleBan = {
  stakeId: number
  deckId: number

  stakeEmoji?: string
  deckEmoji?: string
  combinedEmote?: string

  stakeName?: string
  deckName?: string

  deckDescription: string
}

type Series = {
  count: number
  id: number | undefined
  emoji: string | undefined
  name: string
  description?: string
}

/**
 * Handles generating tuple bans for a match.
 */
export class TupleBans {
  // the queue id that this instance is generating for
  queueId: number

  // tracks number of attempts to generate tuple bans, so recursion can be stopped if it gets stuck
  attempts = 0

  // additional deck IDs to ban (from match step bans)
  additionalBannedDeckIds: number[]

  // the amount of tuples to create
  tupleCount = 7

  // every deck and stake should start at 1, representing the multiplier of how common they are
  defaultDeckProbability = 1
  defaultStakeProbability = 1

  // the jsonb objects that determine deck / stake probability multipliers
  stakeProbabilities: { stake_name: string; multiplier: number }[] = []
  deckProbabilities: { deck_name: string; multiplier: number }[] = []

  // represents what stakes and decks are allowed in this match, along with their emoji and probability multipliers
  decks: {
    id: number
    name: string
    emoji?: string
    multiplier: number
    occurs?: number
    description?: string
  }[] = []
  stakes: {
    id?: number
    name: string
    emoji?: string
    multiplier: number
    occurs?: number
  }[] = [
    {
      name: 'White Stake',
      multiplier: this.defaultStakeProbability,
    },
    {
      name: 'Green Stake',
      multiplier: this.defaultStakeProbability,
    },
    {
      name: 'Black Stake',
      multiplier: this.defaultStakeProbability,
    },
    {
      name: 'Purple Stake',
      multiplier: this.defaultStakeProbability,
    },
    {
      name: 'Gold Stake',
      multiplier: this.defaultStakeProbability,
    },
  ]

  // the finalized list of tuple bans, referencing stake and deck ids
  tupleBans: TupleBan[] = []

  /**
   * Creates an instance of the class with the specified parameters.
   * Must be called alongside {@link init}.
   *
   * @param {number} queueId - The unique identifier for the queue.
   * @param {number[]} additionalBannedDeckIds - Additional deck IDs to exclude (from match step bans).
   */
  public constructor(queueId: number, additionalBannedDeckIds: number[] = []) {
    this.queueId = queueId
    this.additionalBannedDeckIds = additionalBannedDeckIds
  }

  /**
   * Initialize async methods
   */
  public async init(): Promise<void> {
    await this.constructDecks()
    await this.constructStakes()
    await this.loadProbabilities()
  }

  /**
   * Fetch probability multipliers from db and assign them to {@link stakeProbabilities} and {@link deckProbabilities}
   * @private
   */
  private async fetchProbabilities(): Promise<void> {
    this.stakeProbabilities = (
      await pool.query(`SELECT * FROM stake_mults WHERE queue_id = $1`, [
        this.queueId,
      ])
    ).rows
    this.deckProbabilities = (
      await pool.query(`SELECT * FROM deck_mults WHERE queue_id = $1`, [
        this.queueId,
      ])
    ).rows
  }

  /**
   * Assign {@link stakeProbabilities} and {@link deckProbabilities} to the `multiplier` field of {@link decks} and {@link stakes}
   */
  private async loadProbabilities(): Promise<void> {
    await this.fetchProbabilities()
    this.stakes.forEach((stake) => {
      const probMultiplier = this.stakeProbabilities.find(
        (prob) => prob.stake_name === stake.name,
      )?.multiplier

      stake.multiplier = probMultiplier
        ? Number(probMultiplier)
        : this.defaultStakeProbability
    })

    this.decks.forEach((deck) => {
      const probMultiplier = this.deckProbabilities.find(
        (prob) => prob.deck_name === deck.name,
      )?.multiplier

      deck.multiplier = probMultiplier
        ? Number(probMultiplier)
        : this.defaultDeckProbability
    })
  }

  /**
   * Iterate through db and assign information to {@link stakes} by comparing stake name
   * @private
   */
  private async constructStakes(): Promise<void> {
    await Promise.all(
      this.stakes.map(async (stake) => {
        const dbStake = await pool.query<Stakes>(
          'SELECT * FROM stakes WHERE stake_name = $1',
          [stake.name],
        )
        stake.id = dbStake.rows[0].id
        stake.emoji = dbStake.rows[0].stake_emote
      }),
    )
  }

  /**
   * Iterate through db and assign information to {@link decks} by reading allowed decks for this queue
   * @private
   */
  private async constructDecks(): Promise<void> {
    const bannedDecks: { deck_id: number }[] = (
      await pool.query<BannedDecks>(
        'SELECT deck_id FROM banned_decks WHERE queue_id = $1',
        [this.queueId],
      )
    ).rows

    // Combine queue-banned decks with additional match-step banned decks
    const bannedDeckIds = [
      ...bannedDecks.map((deck) => deck.deck_id),
      ...this.additionalBannedDeckIds,
    ]

    const allowedDecks: Decks[] = (
      await pool.query<Decks>(`SELECT * FROM decks WHERE NOT (id = ANY($1))`, [
        bannedDeckIds,
      ])
    ).rows

    for (const allowedDeck of allowedDecks) {
      this.decks.push({
        id: allowedDeck.id,
        emoji: allowedDeck.deck_emote,
        name: allowedDeck.deck_name,
        multiplier: this.defaultDeckProbability,
        description: allowedDeck.deck_desc,
      })
    }
  }

  /**
   * Selects a deck or stake from a provided {@link Series} array based on a random number.
   * @param items
   * @param ran
   */
  private selectDeckStake = (items: Series[], ran: number) => {
    let chosenItem: Series = items[0]
    let count = 0
    for (const item of items) {
      count++
      if (ran >= item.count) {
        chosenItem = items[count]
      } else {
        break
      }
    }
    return chosenItem
  }

  /**
   * Generates a single tuple ban based on the {@link decks} and {@link stakes} arrays
   * @private
   */
  private generateTuple() {
    // gets the relative probability associated with x1 multiplier for stakes and decks

    const stakePart =
      1 /
      this.stakes.reduce((acc, stake) => {
        return acc + stake.multiplier
      }, 0)

    const deckPart =
      1 /
      this.decks.reduce((acc, deck) => {
        return acc + deck.multiplier
      }, 0)

    // gets the probability area occupied from 0-1 for each stake and deck

    let stakeCount = 0
    const stakeSeries = this.stakes.map((stake) => {
      stakeCount += stake.multiplier * stakePart
      return {
        count: stakeCount,
        id: stake.id,
        emoji: stake.emoji,
        name: stake.name,
      }
    })

    let deckCount = 0
    const deckSeries: Series[] = this.decks.map((deck) => {
      deckCount += deck.multiplier * deckPart
      return {
        count: deckCount,
        id: deck.id,
        emoji: deck.emoji,
        name: deck.name,
        description: deck.description ?? 'No description.',
      }
    })

    // uses math.random to select a random area in probability, and picks the deck / stake that owns that area

    let chosenStake: Series | undefined
    let chosenDeck: Series | undefined

    // generate stakes and decks until one that is within the occurrence limit is generated

    let fallbackCount = 0
    let succeeded = false
    while (!succeeded) {
      // if on penultimate tuple, make sure there is at least one white (yes I hate how hard-coded this is)
      let containsWhite = true
      if (this.tupleBans.length == this.tupleCount - 1) {
        containsWhite = this.tupleBans.some(
          (tupleBan) => tupleBan.stakeName === 'White Stake',
        )
      }

      if (!containsWhite) {
        chosenStake = {
          count: 1,
          id: 1,
          emoji: '<:white_stake:1407754838108016733>',
          name: 'White Stake',
        }
      } else {
        chosenStake = this.selectDeckStake(stakeSeries, Math.random())
      }

      if (
        this.tupleBans.filter(
          (tupleBan) => tupleBan.stakeId === chosenStake?.id,
        ).length <
        (this.tupleCount - 1) / 2
      ) {
        succeeded = true
      }
      if (fallbackCount++ > 100) {
        return console.warn(
          `Creating odds for stakes stuck recursing. try editing probabilities with 'change-stake-probabilities'. ${this.tupleBans.length} tuple bans are complete. Trying again`,
        )
      }
    }

    fallbackCount = 0
    succeeded = false
    while (!succeeded) {
      chosenDeck = this.selectDeckStake(deckSeries, Math.random())
      if (
        this.tupleBans.filter((tupleBan) => tupleBan.deckId === chosenDeck?.id)
          .length <
          (this.tupleCount - 3) / 2 &&
        !this.tupleBans.some(
          (tupleBan) =>
            tupleBan.deckId === chosenDeck?.id &&
            tupleBan.stakeId === chosenStake?.id,
        )
      ) {
        succeeded = true
      }
      if (fallbackCount++ > 100) {
        return console.warn(
          `Creating odds for decks stuck recursing. try editing probabilities with 'change-deck-probabilities'. ${this.tupleBans.length} tuple bans are complete. Trying again`,
        )
      }
    }

    // get the tupleBan object from the chosenDeck and chosenStake object

    const combinedEmote =
      chosenDeck?.name && chosenStake?.name
        ? getCombinedEmote(chosenDeck.name, chosenStake.name)
        : null

    this.tupleBans.push({
      stakeId: chosenStake?.id ?? 1,
      deckId: chosenDeck?.id ?? 1,

      stakeEmoji: chosenStake?.emoji ?? '',
      deckEmoji: chosenDeck?.emoji ?? '',
      combinedEmote: combinedEmote ?? undefined,

      stakeName: chosenStake?.name ?? '',
      deckName: chosenDeck?.name ?? '',

      deckDescription: chosenDeck?.description ?? 'No description.',
    })
  }

  /**
   * Generates a list of tuple bans by recursing {@link generateTuple} until an array of length {@link tupleCount} is created
   */
  private generateTupleBansRecurse(): void {
    if (this.tupleBans.length < this.tupleCount) {
      // try x times to generate tuple bans (each attempt represents up to 100 attempts for each individual tuple)
      if (this.attempts++ > 50) {
        return console.error(
          `Tuple bans stuck recursing. Aborting early with ${this.tupleBans.length} tuple bans`,
        )
      }
      this.generateTuple()
      this.generateTupleBansRecurse()
    }
  }

  private orderTupleBans(): void {
    this.tupleBans.sort((a, b) => a.deckId - b.deckId)
    this.tupleBans.sort((a, b) => a.stakeId - b.stakeId)
  }

  /**
   * returns a list of tuple bans with full info generated by {@link generateTupleBansRecurse}
   *
   * @returns {TupleBan[]}
   */
  public getTupleBans(): TupleBan[] {
    this.generateTupleBansRecurse()
    this.orderTupleBans()
    this.attempts = 0
    return this.tupleBans
  }
}
