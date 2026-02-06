import { pool } from '../db'
import { BannedDecks, Decks, Stakes } from 'psqlDB'

type TupleBan = {
  stakeId: number
  deckId: number

  stakeEmoji?: string
  deckEmoji?: string

  stakeName?: string
  deckName?: string
}

/**
 * Handles generating tuple bans for a match.
 */
export class TupleBans {
  // the queue id that this instance is generating for
  queueId: number

  // the amount of tuples to create
  tupleCount = 7

  // every deck and stake should start at 1, representing the multiplier of how common they are
  defaultDeckProbability = 1
  defaultStakeProbability = 1

  // todo: get specific probabilities for these based on queue settings
  // represents what stakes and decks are allowed in this match, along with their emoji and probability multipliers
  decks: {
    id: number
    name: string
    emoji?: string
    multiplier: number
    occurs?: number
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
   */
  public constructor(queueId: number) {
    this.queueId = queueId
  }

  /**
   * Initialize async methods
   */
  public async init(): Promise<void> {
    await this.constructDecks()
    await this.constructStakes()
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

    const bannedDeckIds = bannedDecks.map((deck) => deck.deck_id)

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
      })
    }
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
        stakeCount,
        stakeId: stake.id,
        stakeEmoji: stake.emoji,
        stakeName: stake.name,
      }
    })

    let deckCount = 0
    const deckSeries = this.decks.map((deck) => {
      deckCount += deck.multiplier * deckPart
      return {
        deckCount,
        deckId: deck.id,
        deckEmoji: deck.emoji,
        deckName: deck.name,
      }
    })

    // uses math.random to select a random area in probability, and picks the deck / stake that owns that area

    let chosenStake:
      | {
          stakeCount: number
          stakeId: number | undefined
          stakeEmoji: string | undefined
          stakeName: string
        }
      | undefined
    let chosenDeck:
      | {
          deckCount: number
          deckId: number
          deckEmoji: string | undefined
          deckName: string
        }
      | undefined

    // generate stakes and decks until one that is within the occurrence limit is generated

    let succeeded = false
    while (!succeeded) {
      chosenStake = stakeSeries.findLast(
        (stake) => Math.random() <= stake.stakeCount,
      )
      if (
        this.tupleBans.filter(
          (tupleBan) => tupleBan.stakeId === chosenStake?.stakeId,
        ).length <
        (this.tupleCount - 1) / 2
      ) {
        succeeded = true
      }
    }

    succeeded = false
    while (!succeeded) {
      chosenDeck = deckSeries.findLast(
        (stake) => Math.random() <= stake.deckCount,
      )
      if (
        this.tupleBans.filter(
          (tupleBan) => tupleBan.deckId === chosenDeck?.deckId,
        ).length <
        (this.tupleCount - 1) / 2
      ) {
        succeeded = true
      }
    }

    // get the tupleBan object from the chosenDeck and chosenStake object

    this.tupleBans.push({
      stakeId: chosenStake?.stakeId ?? 1,
      deckId: chosenDeck?.deckId ?? 1,

      stakeEmoji: chosenStake?.stakeEmoji ?? '',
      deckEmoji: chosenDeck?.deckEmoji ?? '',

      stakeName: chosenStake?.stakeName ?? '',
      deckName: chosenDeck?.deckName ?? '',
    })
  }

  /**
   * Generates a list of tuple bans by recursing {@link generateTuple} until an array of length {@link tupleCount} is created
   */
  private generateTupleBansRecurse(): void {
    this.generateTuple()
    if (this.tupleBans.length < this.tupleCount) {
      this.generateTupleBansRecurse()
    }
  }

  /**
   * returns a list of tuple bans with full info generated by {@link generateTupleBansRecurse}
   *
   * @returns {TupleBan[]}
   */
  public getTupleBans(): TupleBan[] {
    this.generateTupleBansRecurse()
    return this.tupleBans
  }
}
