-- Simulierter Produktions-Ausgangszustand (Phase 6B1): nur Legacy-app_state mit SYNTHETISCHEN Daten
create table public.app_state (id text primary key, data jsonb not null default '{}'::jsonb, updated_at timestamptz default now());
alter table public.app_state enable row level security;
create policy "Jeder darf lesen" on public.app_state for select to public using (true);
create policy "Jeder darf schreiben" on public.app_state for insert to public with check (true);
create policy "Jeder darf aktualisieren" on public.app_state for update to public using (true);
alter publication supabase_realtime add table public.app_state;
insert into public.app_state (id, data, updated_at) values ('family-main', '{"members":[{"id":"m1","name":"Synth Eins"}],"tasks":[],"completions":[]}'::jsonb, '2026-09-28T10:00:00Z');
