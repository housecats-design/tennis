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
  user_id text primary key,
  email text not null unique,
  login_id text not null unique,
  real_name text default '',
  nickname text default '',
  display_name text not null,
  gender text default 'unspecified',
  gender_locked_at timestamptz,
  default_ntrp numeric,
  is_admin boolean default false,
  memo text default '',
  is_deleted boolean default false,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists admin_audit_logs (
  id text primary key,
  admin_user_id text not null,
  target_user_id text,
  action text not null,
  previous_value text,
  next_value text,
  created_at timestamptz default now()
);

create table if not exists user_notifications (
  id text primary key,
  user_id text not null,
  event_id text,
  type text not null default 'info',
  title text not null,
  message text not null,
  action_url text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists clubs (
  id text primary key,
  club_name text not null,
  description text,
  created_by_user_id text not null,
  is_active boolean default true,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists club_members (
  id text primary key,
  club_id text references clubs(id) on delete cascade,
  user_id text not null,
  role text not null,
  is_active boolean default true,
  deleted_at timestamptz,
  joined_at timestamptz default now()
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
  event_type text default 'personal',
  club_id text references clubs(id) on delete set null,
  club_name text,
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
  joined_as_club_id text references clubs(id) on delete set null,
  joined_as_club_name text,
  participant_role text,
  stats jsonb not null
);

create table if not exists user_event_history (
  id text primary key,
  saved_event_id text references saved_events(id) on delete cascade,
  event_name text not null,
  match_type text not null,
  event_type text default 'personal',
  club_id text references clubs(id) on delete set null,
  club_name text,
  user_id text not null,
  participant_id text not null,
  participant_role text,
  joined_as_club_id text references clubs(id) on delete set null,
  joined_as_club_name text,
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
  club_id text references clubs(id) on delete set null,
  club_name text,
  round_number integer not null,
  court_number integer not null,
  result text not null,
  score_for integer not null default 0,
  score_against integer not null default 0,
  teammates jsonb not null default '[]'::jsonb,
  opponents jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table user_profiles add column if not exists ntrp numeric;
alter table user_profiles add column if not exists role_last_selected text;

update user_profiles
set ntrp = coalesce(ntrp, default_ntrp)
where ntrp is null;

create table if not exists club_applications (
  id text primary key,
  applicant_user_id text not null,
  club_name text not null,
  region text not null,
  description text,
  status text not null default 'pending',
  reviewed_by text,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz default now()
);

alter table clubs add column if not exists region text;
alter table clubs add column if not exists status text default 'active';
alter table clubs add column if not exists approved_by text;
alter table clubs add column if not exists approved_at timestamptz;

create unique index if not exists clubs_unique_name_idx
on clubs (lower(club_name))
where deleted_at is null;

alter table club_members add column if not exists membership_status text default 'approved';
alter table club_members add column if not exists approved_by text;
alter table club_members add column if not exists approved_at timestamptz;
alter table club_members add column if not exists left_at timestamptz;
alter table club_members add column if not exists created_at timestamptz default now();

create unique index if not exists club_members_club_user_unique_idx
on club_members (club_id, user_id);

create unique index if not exists club_members_one_leader_idx
on club_members (club_id)
where membership_status = 'approved'
  and role = 'leader'
  and deleted_at is null
  and left_at is null;

create table if not exists club_join_requests (
  id text primary key,
  club_id text not null references clubs(id) on delete cascade,
  user_id text not null,
  status text not null default 'pending',
  message text,
  requested_at timestamptz default now(),
  reviewed_by text,
  reviewed_at timestamptz
);

alter table events add column if not exists title text;
alter table events add column if not exists event_type text default 'personal';
alter table events add column if not exists club_id text references clubs(id) on delete set null;
alter table events add column if not exists participation_code text;
alter table events add column if not exists max_players integer;
alter table events add column if not exists started_at timestamptz;
alter table events add column if not exists finished_at timestamptz;

update events
set title = coalesce(title, event_name),
    participation_code = coalesce(participation_code, code)
where title is null
   or participation_code is null;

alter table participants add column if not exists joined_as_club_id text references clubs(id) on delete set null;
alter table participants add column if not exists ntrp_at_event numeric;
alter table participants add column if not exists status text default 'active';
alter table participants add column if not exists left_at timestamptz;

create unique index if not exists participants_event_user_unique_idx
on participants (event_id, user_id)
where user_id is not null;

alter table rounds add column if not exists status text default 'waiting';
alter table rounds add column if not exists generated_by text;
alter table rounds add column if not exists created_at timestamptz default now();
alter table rounds add column if not exists updated_at timestamptz default now();

alter table matches add column if not exists event_id text references events(id) on delete cascade;
alter table matches add column if not exists match_type text;
alter table matches add column if not exists status text default 'assigned';
alter table matches add column if not exists winner_team text;
alter table matches add column if not exists finalized_at timestamptz;
alter table matches add column if not exists created_at timestamptz default now();
alter table matches add column if not exists updated_at timestamptz default now();

create table if not exists match_players (
  id text primary key,
  match_id text not null references matches(id) on delete cascade,
  event_participant_id text not null references participants(id) on delete cascade,
  team_side text not null,
  position_order integer not null,
  created_at timestamptz default now()
);

create unique index if not exists match_players_match_participant_unique_idx
on match_players (match_id, event_participant_id);

create table if not exists match_score_approvals (
  id text primary key,
  match_id text not null references matches(id) on delete cascade,
  event_participant_id text not null references participants(id) on delete cascade,
  approval_status text not null default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists match_score_approvals_unique_idx
on match_score_approvals (match_id, event_participant_id);

create table if not exists match_objections (
  id text primary key,
  match_id text not null references matches(id) on delete cascade,
  event_participant_id text not null references participants(id) on delete cascade,
  reason text,
  status text not null default 'pending',
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create unique index if not exists match_objections_unique_idx
on match_objections (match_id, event_participant_id);

create table if not exists player_stats_total (
  user_id text primary key,
  matches_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  points integer not null default 0,
  updated_at timestamptz default now()
);

create table if not exists player_stats_by_club (
  user_id text not null,
  club_id text not null references clubs(id) on delete cascade,
  matches_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  points integer not null default 0,
  updated_at timestamptz default now(),
  primary key (user_id, club_id)
);

create table if not exists club_stats (
  club_id text primary key references clubs(id) on delete cascade,
  matches_played integer not null default 0,
  wins integer not null default 0,
  losses integer not null default 0,
  points integer not null default 0,
  updated_at timestamptz default now()
);

create table if not exists player_ratings (
  user_id text primary key,
  rating_points numeric not null default 1000,
  confidence_score numeric not null default 0,
  ntrp_seed numeric,
  updated_at timestamptz default now()
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
  created_at timestamptz default now()
);

create table if not exists player_interactions (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  match_id text references matches(id) on delete set null,
  user_id text not null,
  other_user_id text not null,
  interaction_type text not null,
  created_at timestamptz default now()
);

create table if not exists event_invites (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  invited_user_id text not null,
  invited_by_user_id text not null,
  status text not null default 'pending',
  invite_link_token text not null unique,
  created_at timestamptz default now(),
  responded_at timestamptz,
  expires_at timestamptz
);

create table if not exists audit_logs (
  id text primary key,
  actor_user_id text not null,
  action_type text not null,
  target_type text not null,
  target_id text not null,
  event_id text references events(id) on delete set null,
  match_id text references matches(id) on delete set null,
  club_id text references clubs(id) on delete set null,
  before_data jsonb,
  after_data jsonb,
  reason text,
  created_at timestamptz default now()
);

alter table user_notifications add column if not exists related_event_id text;
alter table user_notifications add column if not exists related_club_id text;
alter table user_notifications add column if not exists body text;
alter table user_notifications add column if not exists is_read boolean default false;

update user_notifications
set body = coalesce(body, message),
    related_event_id = coalesce(related_event_id, event_id),
    is_read = coalesce(is_read, read_at is not null)
where body is null
   or related_event_id is null;
