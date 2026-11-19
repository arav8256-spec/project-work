-- Run this entire script in Supabase Dashboard > SQL Editor.
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  username text,
  role text not null default 'student' check (role in ('student','admin')),
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

-- A user can read and update only their own profile. Admins can inspect and manage all students.
drop policy if exists "read own profile or admin" on public.user_profiles;
create policy "read own profile or admin" on public.user_profiles for select to authenticated
using (auth.uid() = id or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

drop policy if exists "create own student profile" on public.user_profiles;
create policy "create own student profile" on public.user_profiles for insert to authenticated
with check (auth.uid() = id and role = 'student');

drop policy if exists "update own profile or admin" on public.user_profiles;
create policy "update own profile or admin" on public.user_profiles for update to authenticated
using (auth.uid() = id or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.uid() = id and role = 'student') or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- New accounts automatically get a student profile row.
create or replace function public.create_student_profile()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.user_profiles (id, name, username, role, state)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)), new.email, 'student', '{}'::jsonb)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile after insert on auth.users
for each row execute procedure public.create_student_profile();

-- Promote the intended admin account after creating it in Supabase Authentication > Users.
-- Replace the email below with the admin email, then run this separately:
-- update auth.users set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"admin"}'::jsonb where email = 'YOUR_ADMIN_EMAIL';
-- Also promote the matching profile:
-- update public.user_profiles set role = 'admin' where username = 'YOUR_ADMIN_EMAIL';

-- Enable database change events so active student pages receive admin task/timetable updates.
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_profiles') then
    alter publication supabase_realtime add table public.user_profiles;
  end if;
end $$;
