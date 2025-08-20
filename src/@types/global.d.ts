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
    team?: number | null;
    match_id?: number | null;
    joined_party_id?: string | null;
  }

  export interface QueueUsers {
    id: number;
    user_id: string;
    elo: number;
    peak_elo: number;
    wins: number;
    losses: number;
    games_played: number;
    win_streak: number;
    peak_win_streak: number;
    queue_channel_id: string;
    queue_join_time?: Date | null;
  }

  export interface Bans {
    id: number;
    user_id: string;
    reason: string;
    expires_at?: Date | null;
  }
}
