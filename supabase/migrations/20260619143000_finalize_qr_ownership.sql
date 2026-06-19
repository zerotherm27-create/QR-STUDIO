do $$
begin
  if exists (
    select 1
    from public.qr_codes
    where owner_id is null
  ) then
    raise exception
      'Cannot finalize QR ownership while ownerless rows remain. Run qr:assign-legacy first.';
  end if;
end;
$$;

alter table public.qr_codes
  drop constraint if exists qr_codes_owner_id_fkey;

alter table public.qr_codes
  add constraint qr_codes_owner_id_fkey
  foreign key (owner_id)
  references public.profiles(id)
  on delete restrict;

alter table public.qr_codes
  alter column owner_id set not null;

alter table public.qr_codes
  drop column if exists edit_token;
