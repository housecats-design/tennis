alter table clubs
add column if not exists visibility text default 'public';

update clubs
set visibility = 'public'
where visibility is null;

alter table clubs
alter column visibility set not null;
