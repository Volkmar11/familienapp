-- Lokaler Ersatz für die Supabase-Plattformobjekte (auth, storage, extensions, Rollen, Publikation).
-- NUR für lokale PostgreSQL-Proben (Bootstrap-Generalprobe, SQL-Checks). Nie auf ein Supabase-Projekt anwenden.
-- Enthält zwei synthetische Test-User-IDs (…0001/…0002) für die SQL-Checks; sie werden unten wieder entfernt.
create schema auth; grant usage on schema auth to anon, authenticated;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub'))::uuid $$;
grant execute on function auth.uid() to anon, authenticated;
create schema extensions; create extension pgcrypto schema extensions;
grant usage on schema extensions to anon, authenticated;
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on functions to anon, authenticated;
create publication supabase_realtime;
insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
create schema storage; grant usage on schema storage to anon, authenticated;
create table storage.buckets (id text primary key, name text not null, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, created_at timestamptz default now(), unique (bucket_id, name));
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects, storage.buckets to authenticated, anon;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$ declare _parts text[]; begin select string_to_array(name, '/') into _parts; return _parts[1 : array_length(_parts,1) - 1]; end $$;
grant execute on function storage.foldername(text) to authenticated, anon;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
alter table auth.users add column instance_id uuid, add column aud varchar(255), add column role varchar(255), add column email varchar(255),
  add column encrypted_password varchar(255), add column email_confirmed_at timestamptz, add column raw_app_meta_data jsonb, add column raw_user_meta_data jsonb,
  add column created_at timestamptz, add column updated_at timestamptz;
delete from auth.users;
-- wie Supabase: service_role erhält Standardrechte auf neue Funktionen/Tabellen in public
alter default privileges in schema public grant all on functions to service_role;
alter default privileges in schema public grant all on tables to service_role;
