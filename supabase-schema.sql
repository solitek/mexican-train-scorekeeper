-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run

create table if not exists players (
  id text primary key,
  name text not null,
  archived boolean not null default false,
  created_at bigint not null
);

create table if not exists games (
  id text primary key,
  title text not null,
  player_ids jsonb not null,
  rounds jsonb not null default '[]',
  drinking_mode boolean not null default false,
  status text not null default 'active', -- 'active' or 'finished'
  started_at bigint not null,
  finished_at bigint
);

-- Row Level Security: required by Supabase before any client (even with the
-- public anon key) can read or write. These policies make both tables fully
-- open to anyone who has your project's URL + anon key, matching the "no
-- login, shared family data" design. Anyone with the link can read/write.
alter table players enable row level security;
alter table games enable row level security;

create policy "public read players" on players for select using (true);
create policy "public insert players" on players for insert with check (true);
create policy "public update players" on players for update using (true);

create policy "public read games" on games for select using (true);
create policy "public insert games" on games for insert with check (true);
create policy "public update games" on games for update using (true);
create policy "public delete games" on games for delete using (true);
