-- Club-aware stats, rating, and interaction tables
-- These tables are designed to coexist with the current event snapshot architecture.

begin;

create table if not exists player_stats_total (
  user_id text primary key,
  matches_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  points integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists player_stats_by_club (
  user_id text not null,
  club_id text not null references clubs(id) on delete cascade,
  matches_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  points integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, club_id)
);

create table if not exists club_stats (
  club_id text primary key references clubs(id) on delete cascade,
  matches_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  points integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists player_ratings (
  user_id text primary key,
  rating_points numeric not null default 1000,
  confidence_score numeric not null default 0,
  ntrp_seed numeric,
  updated_at timestamptz not null default now()
);

create table if not exists point_transactions (
  id text primary key,
  event_id text references events(id) on delete set null,
  match_id text references matches(id) on delete set null,
  user_id text not null,
  club_id text references clubs(id) on delete set null,
  base_points numeric not null default 0,
  ntrp_bonus numeric not null default 0,
  upset_bonus numeric not null default 0,
  close_game_bonus numeric not null default 0,
  total_points numeric not null default 0,
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists point_transactions_user_id_idx
on point_transactions (user_id, created_at desc);

create index if not exists point_transactions_club_id_idx
on point_transactions (club_id, created_at desc);

create table if not exists player_interactions (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  match_id text references matches(id) on delete set null,
  user_id text not null,
  other_user_id text not null,
  interaction_type text not null check (interaction_type in ('same_match', 'same_team', 'opponent', 'same_event')),
  created_at timestamptz not null default now()
);

create index if not exists player_interactions_user_pair_idx
on player_interactions (user_id, other_user_id, created_at desc);

create index if not exists player_interactions_event_idx
on player_interactions (event_id, created_at desc);

commit;
