-- Club system core migration
-- Existing app tables are preserved. This migration extends them for club-aware operation.

begin;

alter table user_profiles
add column if not exists ntrp numeric;

alter table user_profiles
add column if not exists role_last_selected text;

update user_profiles
set ntrp = coalesce(ntrp, default_ntrp)
where ntrp is null;

create table if not exists club_applications (
  id text primary key,
  applicant_user_id text not null,
  club_name text not null,
  region text not null,
  description text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);

alter table clubs
add column if not exists region text,
add column if not exists status text not null default 'active',
add column if not exists approved_by text,
add column if not exists approved_at timestamptz;

alter table clubs
alter column description drop not null;

create unique index if not exists clubs_unique_name_idx
on clubs (lower(club_name))
where deleted_at is null;

alter table club_members
add column if not exists membership_status text not null default 'approved',
add column if not exists approved_by text,
add column if not exists approved_at timestamptz,
add column if not exists left_at timestamptz,
add column if not exists created_at timestamptz not null default now();

alter table club_members
drop constraint if exists club_members_role_check;

alter table club_members
add constraint club_members_role_check
check (role in ('leader', 'vice_leader', 'member'));

alter table club_members
drop constraint if exists club_members_membership_status_check;

alter table club_members
add constraint club_members_membership_status_check
check (membership_status in ('pending', 'approved', 'rejected', 'left', 'banned'));

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
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  message text,
  requested_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz
);

create unique index if not exists club_join_requests_pending_unique_idx
on club_join_requests (club_id, user_id)
where status = 'pending';

alter table events
add column if not exists title text,
add column if not exists event_type text not null default 'personal',
add column if not exists club_id text references clubs(id) on delete set null,
add column if not exists participation_code text,
add column if not exists max_players integer,
add column if not exists started_at timestamptz,
add column if not exists finished_at timestamptz;

update events
set title = coalesce(title, event_name),
    participation_code = coalesce(participation_code, code)
where title is null
   or participation_code is null;

alter table events
drop constraint if exists events_event_type_check;

alter table events
add constraint events_event_type_check
check (event_type in ('personal', 'club'));

alter table participants
add column if not exists joined_as_club_id text references clubs(id) on delete set null,
add column if not exists ntrp_at_event numeric,
add column if not exists status text not null default 'active',
add column if not exists left_at timestamptz;

update participants
set status = 'active'
where status is null;

alter table participants
drop constraint if exists participants_status_check;

alter table participants
add constraint participants_status_check
check (status in ('active', 'unavailable', 'injured', 'left_early', 'removed'));

create unique index if not exists participants_event_user_unique_idx
on participants (event_id, user_id)
where user_id is not null;

alter table rounds
add column if not exists status text not null default 'waiting',
add column if not exists generated_by text,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

alter table rounds
drop constraint if exists rounds_status_check;

alter table rounds
add constraint rounds_status_check
check (status in ('waiting', 'assigned', 'playing', 'score_pending', 'disputed', 'completed'));

alter table matches
add column if not exists event_id text references events(id) on delete cascade,
add column if not exists match_type text,
add column if not exists status text not null default 'assigned',
add column if not exists winner_team text,
add column if not exists finalized_at timestamptz,
add column if not exists created_at timestamptz not null default now(),
add column if not exists updated_at timestamptz not null default now();

alter table matches
drop constraint if exists matches_status_check;

alter table matches
add constraint matches_status_check
check (status in ('waiting', 'assigned', 'playing', 'score_pending', 'disputed', 'completed'));

alter table matches
drop constraint if exists matches_winner_team_check;

alter table matches
add constraint matches_winner_team_check
check (winner_team in ('A', 'B') or winner_team is null);

create table if not exists match_players (
  id text primary key,
  match_id text not null references matches(id) on delete cascade,
  event_participant_id text not null references participants(id) on delete cascade,
  team_side text not null check (team_side in ('A', 'B')),
  position_order integer not null,
  created_at timestamptz not null default now()
);

create unique index if not exists match_players_match_participant_unique_idx
on match_players (match_id, event_participant_id);

create table if not exists match_score_approvals (
  id text primary key,
  match_id text not null references matches(id) on delete cascade,
  event_participant_id text not null references participants(id) on delete cascade,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists match_score_approvals_unique_idx
on match_score_approvals (match_id, event_participant_id);

create table if not exists match_objections (
  id text primary key,
  match_id text not null references matches(id) on delete cascade,
  event_participant_id text not null references participants(id) on delete cascade,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'dismissed')),
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists match_objections_unique_idx
on match_objections (match_id, event_participant_id);

create table if not exists event_invites (
  id text primary key,
  event_id text not null references events(id) on delete cascade,
  invited_user_id text not null,
  invited_by_user_id text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  invite_link_token text not null unique,
  created_at timestamptz not null default now(),
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
  created_at timestamptz not null default now()
);

alter table user_notifications
add column if not exists related_event_id text,
add column if not exists related_club_id text,
add column if not exists body text,
add column if not exists is_read boolean not null default false;

update user_notifications
set body = coalesce(body, message),
    related_event_id = coalesce(related_event_id, event_id),
    is_read = coalesce(is_read, read_at is not null)
where body is null
   or related_event_id is null;

create or replace function enforce_user_club_membership_limit()
returns trigger
language plpgsql
as $$
declare
  approved_count integer;
begin
  if new.membership_status <> 'approved' or new.deleted_at is not null or new.left_at is not null then
    return new;
  end if;

  select count(*)
    into approved_count
  from club_members
  where user_id = new.user_id
    and membership_status = 'approved'
    and deleted_at is null
    and left_at is null
    and id <> coalesce(new.id, '');

  if approved_count >= 5 then
    raise exception '한 사용자는 최대 5개의 승인된 클럽에만 속할 수 있습니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_user_club_membership_limit on club_members;
create trigger trg_enforce_user_club_membership_limit
before insert or update on club_members
for each row
execute function enforce_user_club_membership_limit();

create or replace function enforce_club_operator_limit()
returns trigger
language plpgsql
as $$
declare
  operator_count integer;
begin
  if new.membership_status <> 'approved'
     or new.deleted_at is not null
     or new.left_at is not null
     or new.role not in ('leader', 'vice_leader') then
    return new;
  end if;

  select count(*)
    into operator_count
  from club_members
  where club_id = new.club_id
    and membership_status = 'approved'
    and role in ('leader', 'vice_leader')
    and deleted_at is null
    and left_at is null
    and id <> coalesce(new.id, '');

  if operator_count >= 6 then
    raise exception '리더와 부리더를 합쳐 최대 6명까지만 운영진으로 지정할 수 있습니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_club_operator_limit on club_members;
create trigger trg_enforce_club_operator_limit
before insert or update on club_members
for each row
execute function enforce_club_operator_limit();

commit;
