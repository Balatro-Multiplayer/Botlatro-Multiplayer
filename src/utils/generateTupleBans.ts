import { pool } from '../db'
import { BannedDecks, Decks, Stakes } from 'psqlDB'

/**
 * Handles generating tuple bans for a match.
 */
class generateTupleBans {
  queueId: number

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

  // a collection of all created tuple bans, generated per-match when a match starts
  tupleBans: {
    deckId: number
    deckEmoji: string
    stakeId: number
    stakeEmoji: string
  }[] = []

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
   * Generates a list of tuple bans based on queue settings
   */
  public generateTupleBans(): void {}
}
