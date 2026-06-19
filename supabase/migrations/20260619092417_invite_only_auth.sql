create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'user' check (role in ('admin', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.qr_codes (
  slug text primary key,
  destination_url text not null,
  title text,
  edit_token text,
  scan_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.qr_codes
  add column if not exists owner_id uuid references public.profiles(id)
    on delete set null,
  add column if not exists status text not null default 'active'
    check (status in ('active', 'disabled'));

alter table public.qr_codes
  alter column edit_token drop not null;

create table if not exists public.qr_scans (
  id bigint generated always as identity primary key,
  qr_slug text not null references public.qr_codes(slug) on delete cascade,
  scanned_at timestamptz not null default now(),
  user_agent text,
  referrer text,
  ip_address text
);

create index if not exists qr_codes_owner_id_updated_at_idx
  on public.qr_codes (owner_id, updated_at desc);

create index if not exists qr_scans_qr_slug_scanned_at_idx
  on public.qr_scans (qr_slug, scanned_at desc);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    'user'
  )
  on conflict (id) do update
  set email = excluded.email,
      updated_at = now();

  return new;
end;
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
  );
$$;

create or replace function private.record_qr_scan(
  p_slug text,
  p_user_agent text default null,
  p_referrer text default null,
  p_ip_address text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.qr_codes
  set scan_count = scan_count + 1,
      updated_at = updated_at
  where slug = p_slug
    and status = 'active';

  if found then
    insert into public.qr_scans (
      qr_slug,
      user_agent,
      referrer,
      ip_address
    )
    values (
      p_slug,
      p_user_agent,
      p_referrer,
      p_ip_address
    );
  end if;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email on auth.users
  for each row execute function private.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

drop trigger if exists qr_codes_set_updated_at on public.qr_codes;
create trigger qr_codes_set_updated_at
  before update of destination_url, title, owner_id, status on public.qr_codes
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.qr_codes enable row level security;
alter table public.qr_scans enable row level security;

drop policy if exists "Server role manages qr codes" on public.qr_codes;
drop policy if exists "Server role manages qr scans" on public.qr_scans;

drop policy if exists "Users read authorized profiles" on public.profiles;
create policy "Users read authorized profiles"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_admin());

drop policy if exists "Users update their profile" on public.profiles;
create policy "Users update their profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "Users read authorized QR codes" on public.qr_codes;
create policy "Users read authorized QR codes"
  on public.qr_codes for select to authenticated
  using (owner_id = (select auth.uid()) or private.is_admin());

drop policy if exists "Users create owned QR codes" on public.qr_codes;
create policy "Users create owned QR codes"
  on public.qr_codes for insert to authenticated
  with check (owner_id = (select auth.uid()) or private.is_admin());

drop policy if exists "Users update authorized QR codes" on public.qr_codes;
create policy "Users update authorized QR codes"
  on public.qr_codes for update to authenticated
  using (owner_id = (select auth.uid()) or private.is_admin())
  with check (owner_id = (select auth.uid()) or private.is_admin());

drop policy if exists "Users delete authorized QR codes" on public.qr_codes;
create policy "Users delete authorized QR codes"
  on public.qr_codes for delete to authenticated
  using (owner_id = (select auth.uid()) or private.is_admin());

drop policy if exists "Users read authorized QR scans" on public.qr_scans;
create policy "Users read authorized QR scans"
  on public.qr_scans for select to authenticated
  using (
    private.is_admin()
    or exists (
      select 1
      from public.qr_codes
      where public.qr_codes.slug = public.qr_scans.qr_slug
        and public.qr_codes.owner_id = (select auth.uid())
    )
  );

revoke all on public.profiles from anon, authenticated;
revoke all on public.qr_codes from anon, authenticated;
revoke all on public.qr_scans from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.qr_codes to authenticated;
grant select on public.qr_scans to authenticated;

revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated, service_role;
revoke all on function private.record_qr_scan(text, text, text, text)
  from public, anon, authenticated;
grant execute on function private.record_qr_scan(text, text, text, text)
  to service_role;
