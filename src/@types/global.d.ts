// Types for the database stuff

declare module 'psqlDB' {
  export interface Queues {
    id: number
    queue_name: string
    queue_desc: string
    members_per_team: number
    number_of_teams: number
    elo_search_start: number
    elo_search_increment: number
    elo_search_speed: number
    default_elo: number
    minimum_elo?: number | null
    maximum_elo?: number | null
    max_party_elo_difference?: number | null
    locked: boolean
  }

  export interface QueueRoles {
    id: number,
    queue_id: number,
    role_id: string,
    mmr_threshold: number
  }

  export interface Parties {
    id: number
    name: string
    created_at: Date
  }

  export interface PartyUsers {
    id: number
    user_id: string
    party_id: number
    is_leader: boolean
    joined_at: Date
  }

  export interface Matches {
    id: number
    queue_id: number
    channel_id: string
    open: boolean
    winning_team: number | null
    created_at: Date
    match_vc_id: string
  }

  export interface Users {
    id: number
    user_id: string
    priority_queue_id: number
    joined_party_id?: string | null
  }

  export interface QueueUsers {
    // glicko2 fields
    elo: number | undefined // rating
    rating_deviation: number | undefined // rating deviation
    volatility: number | undefined // rating change volatility

    // our fields
    queue_id: number
    id: number
    user_id: string
    peak_elo: number
    wins: number
    losses: number
    games_played: number
    win_streak: number
    peak_win_streak: number
    current_elo_range: string[]
    queue_join_time?: Date | null
  }

  export interface MatchUsers extends QueueUsers {
    id: number
    user_id: string
    match_id: number | null
    team: number | null
    elo_change?: number | null
  }

  export interface Bans {
    id: number
    user_id: string
    reason: string
    expires_at?: Date | null
  }

  export interface Settings {
    singleton: boolean
    queue_channel_id: string
    queue_category_id: string
    queue_results_channel_id: string
    helper_role_id: string
    queue_message_id: string
    logs_channel_id: string
    queue_logs_channel_id: string
  }

  export type teamResults = {
    teams: {
      id: number
      score: 0 | 0.5 | 1
      players: MatchUsers[]
    }[]
  }

  export type Decks = {
    id: number
    deck_name: string
    deck_emote: string
    deck_value: string
    deck_desc: string
    custom: boolean
  }

  export type Stakes = {
    id: number
    stake_name: string
    stake_emote: string
    stake_value: string
    stake_desc: string
    custom: boolean
  }

  export type StatsCanvasPlayerData = {
    user_id: string,
    name: string,
    mmr: number,
    peak_mmr: number,
    stats: { label: string, value: string, percentile: string }[],
    previous_games: { change: number, time: Date }[],
    elo_graph_data: { date: Date, rating: number }[],
  }
}
