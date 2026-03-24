create table if not exists events (
  id text primary key,
  code text not null,
  event_name text not null,
  host_user_id text not null,
  match_type text not null,
  court_count integer not null,
  round_count integer not null,
  round_view_mode text not null,
  status text not null,
  state jsonb not null default '{}'::jsonb,
  is_saved boolean default false,
  saved_at timestamptz,
  saved_by_user_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists user_profiles (
  id text primary key,
  email text not null unique,
  login_id text not null unique,
  display_name text not null,
  is_admin boolean default false,
  memo text default '',
  is_deleted boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists participants (
  id text primary key,
  event_id text references events(id) on delete cascade,
  user_id text,
  session_id text,
  display_name text not null,
  gender text not null,
  skill_level text not null default 'medium',
  role text not null,
  joined_at timestamptz default now(),
  is_active boolean default true
);

create table if not exists rounds (
  id text primary key,
  event_id text references events(id) on delete cascade,
  round_number integer not null,
  completed boolean default false
);

create table if not exists matches (
  id text primary key,
  round_id text references rounds(id) on delete cascade,
  court_number integer not null,
  team_a jsonb not null,
  team_b jsonb not null,
  score_a integer,
  score_b integer,
  is_tie_break boolean default false,
  skipped boolean default false,
  completed boolean default false
);

create table if not exists notifications (
  id text primary key,
  event_id text references events(id) on delete cascade,
  round_number integer not null,
  target_participant_id text references participants(id) on delete set null,
  message text not null,
  created_at timestamptz default now(),
  read_at timestamptz
);

create table if not exists saved_events (
  id text primary key,
  source_event_id text not null,
  event_name text not null,
  host_user_id text not null,
  match_type text not null,
  participant_count integer not null,
  played_at timestamptz not null,
  saved_at timestamptz not null default now(),
  snapshot jsonb not null,
  ranking jsonb not null default '[]'::jsonb,
  top_three jsonb not null default '[]'::jsonb
);

create table if not exists event_results (
  id text primary key,
  saved_event_id text references saved_events(id) on delete cascade,
  participant_id text not null,
  user_id text,
  display_name text not null,
  rank integer not null,
  gender text,
  guest_ntrp numeric,
  stats jsonb not null
);

create table if not exists user_event_history (
  id text primary key,
  saved_event_id text references saved_events(id) on delete cascade,
  event_name text not null,
  match_type text not null,
  user_id text not null,
  participant_id text not null,
  rank integer not null,
  stats jsonb not null,
  created_at timestamptz default now()
);

create table if not exists pair_history (
  id text primary key,
  user_id text not null,
  paired_user_id text not null,
  pair_key text not null,
  paired_name text not null,
  frequency integer not null default 0,
  last_played_at timestamptz default now()
);

create table if not exists match_history (
  id text primary key,
  saved_event_id text references saved_events(id) on delete cascade,
  event_name text not null,
  user_id text not null,
  participant_id text not null,
  round_number integer not null,
  court_number integer not null,
  result text not null,
  score_for integer not null default 0,
  score_against integer not null default 0,
  teammates jsonb not null default '[]'::jsonb,
  opponents jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);
