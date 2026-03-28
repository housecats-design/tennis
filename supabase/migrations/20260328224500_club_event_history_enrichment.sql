alter table saved_events
add column if not exists event_type text default 'personal';

alter table saved_events
add column if not exists club_id text references clubs(id) on delete set null;

alter table saved_events
add column if not exists club_name text;

alter table event_results
add column if not exists joined_as_club_id text references clubs(id) on delete set null;

alter table event_results
add column if not exists joined_as_club_name text;

alter table event_results
add column if not exists participant_role text;

alter table user_event_history
add column if not exists event_type text default 'personal';

alter table user_event_history
add column if not exists club_id text references clubs(id) on delete set null;

alter table user_event_history
add column if not exists club_name text;

alter table user_event_history
add column if not exists participant_role text;

alter table user_event_history
add column if not exists joined_as_club_id text references clubs(id) on delete set null;

alter table user_event_history
add column if not exists joined_as_club_name text;

alter table match_history
add column if not exists club_id text references clubs(id) on delete set null;

alter table match_history
add column if not exists club_name text;
