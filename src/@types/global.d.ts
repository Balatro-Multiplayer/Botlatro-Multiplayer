// Types for the database stuff

declare module 'psqlDB' {
  export interface Queues {
    id: number;
    queue_name: string;
    category_id: string;
    channel_id: string;
    results_channel_id: string;
    message_id?: string | null;
    members_per_team: number;
    number_of_teams: number;
    elo_search_start: number;
    elo_search_increment: number;
    elo_search_speed: number;
    default_elo: number;
    minimum_elo?: number | null;
    maximum_elo?: number | null;
    max_party_elo_difference?: number | null;
    locked: boolean;
  }

  export interface Matches {
    id: number;
    queue_id: number;
    channel_id: string;
  }

  export interface Users {
    id: number;
    user_id: string;
    joined_party_id?: string | null;
  }

  export interface QueueUsers {
    // glicko2 fields
    elo: number | undefined; // rating
    rating_deviation: number | undefined; // rating deviation
    volatility: number | undefined; // rating change volatility

    // our fields
    id: number;
    user_id: string;
    peak_rating: number;
    wins: number;
    losses: number;
    games_played: number;
    win_streak: number;
    peak_win_streak: number;
    queue_channel_id: string;
    queue_join_time?: Date | null;
  }

  export interface matchUsers extends QueueUsers {
    id: number;
    user_id: string;
    match_id: number | null;
    team: number | null;
    elo_change?: number | null;
  }

  export interface Bans {
    id: number;
    user_id: string;
    reason: string;
    expires_at?: Date | null;
  }

  export type teamResults = {
      teams: { 
        id: number; 
        score: 0 | 0.5 | 1; 
        players: matchUsers[];
      } []
    }
}
