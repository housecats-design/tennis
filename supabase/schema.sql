create table if not exists events (
  id text primary key,
  event_name text not null,
  host_user_id text not null,
  match_type text not null,
  court_count integer not null,
  round_count integer not null,
  round_view_mode text not null,
  status text not null,
  created_at timestamptz default now()
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
