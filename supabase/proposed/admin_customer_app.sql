-- ============================================================================
-- Admin — Customer App catalog controls
--   1. service price            admin_set_service_price()
--   2. salon rating (permanent)  admin_set_salon_rating() / admin_clear_salon_rating()
--   3. service picture          services.image_url + `service-images` bucket
--                                + admin_set_service_image()
-- ============================================================================
--
-- PROPOSED — not yet applied. Run once, whole file, in the Supabase SQL
-- editor (project oepwnbtoruxhdjnkcazu). Safe to re-run.
--
-- WHY RPCs AND NOT AN RLS POLICY
--   `services` and `salons` are owner-write only (rls_hardening.sql). A
--   blanket admin UPDATE policy would let an admin session rewrite any column
--   with no audit trail. These follow admin_operations.sql instead: SECURITY
--   DEFINER, one is_platform_admin() check, a narrow set of writable fields,
--   and an admin_audit row via admin_log() on every change.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- 1. SERVICE PRICE
-- ════════════════════════════════════════════════════════════════════════════
-- services.price: the Partner app writes it as a string, the Customer app
-- parses it as a number. variants is a jsonb array of {label, price, duration}
-- (service_variants_column.sql) — note the Customer app does not read
-- variants today, only `price`. p_variants = null leaves variants untouched.
create or replace function public.admin_set_service_price(
  p_service uuid, p_price text, p_variants jsonb default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_salon uuid;
  v_old_price text;
  v_old_variants jsonb;
  v_item jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;

  if p_price is null or p_price !~ '^\d+(\.\d{1,2})?$' then
    raise exception 'Price must be a non-negative number';
  end if;

  if p_variants is not null then
    if jsonb_typeof(p_variants) <> 'array' then
      raise exception 'Variants must be an array';
    end if;
    for v_item in select * from jsonb_array_elements(p_variants) loop
      if coalesce(v_item->>'price', '') !~ '^\d+(\.\d{1,2})?$' then
        raise exception 'Every variant needs a non-negative numeric price';
      end if;
    end loop;
  end if;

  select salon_id, price::text, variants
    into v_salon, v_old_price, v_old_variants
    from public.services where id = p_service;
  if not found then raise exception 'Service not found'; end if;

  update public.services
     -- ::numeric works whether the column is text (assignment cast back to
     -- text) or numeric — no migration in either repo pins its type.
     set price    = p_price::numeric,
         variants = coalesce(p_variants, variants)
   where id = p_service;

  perform public.admin_log('service_price_changed', p_service, v_salon,
    jsonb_build_object(
      'from_price', v_old_price, 'to_price', p_price,
      'from_variants', v_old_variants,
      'to_variants', coalesce(p_variants, v_old_variants)));
end $$;

revoke all on function public.admin_set_service_price(uuid, text, jsonb) from public, anon;
grant execute on function public.admin_set_service_price(uuid, text, jsonb) to authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. SALON RATING — permanent admin override
-- ════════════════════════════════════════════════════════════════════════════
-- salons.rating_avg / rating_count are recomputed by a review trigger that
-- lives only in the live DB (the Customer app's review_service.dart says so;
-- its SQL is in neither repo). Rather than edit a trigger we can't see, the
-- override is enforced on `salons` itself: while rating_override_avg is set,
-- a BEFORE trigger forces rating_avg back to it on every write — including
-- the review trigger's UPDATE. Clearing the override recomputes the real
-- values from `reviews`.
--
-- rating_avg feeds compute_visibility(), so an override moves the salon in
-- customer search ranking too. That's intended.

alter table public.salons add column if not exists rating_override_avg   numeric;
alter table public.salons add column if not exists rating_override_count int;

create or replace function public.salons_apply_rating_override()
returns trigger language plpgsql as $$
begin
  -- Salons are owner-writable, so without this a partner could set an
  -- override on their own salon. Same session-flag pattern as
  -- protect_user_roles() in admin_role.sql.
  if (tg_op = 'INSERT' and (new.rating_override_avg is not null
                            or new.rating_override_count is not null))
     or (tg_op = 'UPDATE' and (new.rating_override_avg is distinct from old.rating_override_avg
                               or new.rating_override_count is distinct from old.rating_override_count))
  then
    if coalesce(current_setting('groomto.rating_override', true), '') <> 'allowed' then
      raise exception 'rating override can only be changed by an admin';
    end if;
  end if;

  if new.rating_override_avg is not null then
    new.rating_avg := new.rating_override_avg;
    if new.rating_override_count is not null then
      new.rating_count := new.rating_override_count;
    end if;
  end if;
  return new;
end $$;

-- "zz_" — BEFORE triggers fire in name order; this one must run last so
-- nothing else on salons can change rating_avg after it.
drop trigger if exists zz_salons_rating_override on public.salons;
create trigger zz_salons_rating_override
  before insert or update on public.salons
  for each row execute function public.salons_apply_rating_override();


create or replace function public.admin_set_salon_rating(
  p_salon uuid, p_avg numeric, p_count int default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old_avg numeric;
  v_old_count int;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  if p_avg is null or p_avg < 0 or p_avg > 5 then
    raise exception 'Rating must be between 0 and 5';
  end if;
  if p_count is not null and p_count < 0 then
    raise exception 'Rating count cannot be negative';
  end if;

  select rating_avg, rating_count into v_old_avg, v_old_count
    from public.salons where id = p_salon;
  if not found then raise exception 'Salon not found'; end if;

  perform set_config('groomto.rating_override', 'allowed', true);
  update public.salons
     set rating_override_avg   = round(p_avg, 1),
         rating_override_count = p_count
   where id = p_salon;
  perform set_config('groomto.rating_override', '', true);

  begin
    perform public.refresh_visibility(p_salon);
  exception when undefined_function then null;
  end;

  perform public.admin_log('salon_rating_override_set', p_salon, p_salon,
    jsonb_build_object(
      'from_avg', v_old_avg, 'to_avg', round(p_avg, 1),
      'from_count', v_old_count, 'to_count', coalesce(p_count, v_old_count)));
end $$;

revoke all on function public.admin_set_salon_rating(uuid, numeric, int) from public, anon;
grant execute on function public.admin_set_salon_rating(uuid, numeric, int) to authenticated;


create or replace function public.admin_clear_salon_rating(p_salon uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old_avg numeric;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;

  select rating_override_avg into v_old_avg from public.salons where id = p_salon;
  if not found then raise exception 'Salon not found'; end if;

  perform set_config('groomto.rating_override', 'allowed', true);
  update public.salons
     set rating_override_avg = null, rating_override_count = null
   where id = p_salon;
  perform set_config('groomto.rating_override', '', true);

  -- Restore the real, review-derived values (same aggregate the Partner app's
  -- salon_business_metrics() uses).
  update public.salons s
     set rating_avg = r.avg_rating, rating_count = r.n_rating
    from (select coalesce(round(avg(rating)::numeric, 1), 0) as avg_rating,
                 count(*)::int as n_rating
            from public.reviews where salon_id = p_salon) r
   where s.id = p_salon;

  begin
    perform public.refresh_visibility(p_salon);
  exception when undefined_function then null;
  end;

  perform public.admin_log('salon_rating_override_cleared', p_salon, p_salon,
    jsonb_build_object('was', v_old_avg));
end $$;

revoke all on function public.admin_clear_salon_rating(uuid) from public, anon;
grant execute on function public.admin_clear_salon_rating(uuid) to authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. SERVICE PICTURES
-- ════════════════════════════════════════════════════════════════════════════
-- Today the Customer app shows hardcoded Unsplash placeholders picked by
-- service-id hash (salon_detail_screen.dart `_kServiceImages`). This adds a
-- real column; the Customer app falls back to the placeholder when it's null.
--
-- Caveat: the Partner app's ServiceSelectionProvider.insertServicesToDatabase
-- deletes and re-inserts a salon's whole menu, which would drop image_url for
-- that salon. The newer services_screen.dart edits rows in place and is fine.

alter table public.services add column if not exists image_url text;

-- Public bucket: customers load these straight by URL, like salon-photos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('service-images', 'service-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Only admins write. Reads need no policy because the bucket is public.
drop policy if exists "service_images_admin_insert" on storage.objects;
create policy "service_images_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'service-images' and public.is_platform_admin());

drop policy if exists "service_images_admin_update" on storage.objects;
create policy "service_images_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'service-images' and public.is_platform_admin());

drop policy if exists "service_images_admin_delete" on storage.objects;
create policy "service_images_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'service-images' and public.is_platform_admin());


create or replace function public.admin_set_service_image(
  p_service uuid, p_url text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_salon uuid;
  v_old text;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  if p_url is not null and p_url !~ '^https://' then
    raise exception 'Image URL must be https';
  end if;

  select salon_id, image_url into v_salon, v_old
    from public.services where id = p_service;
  if not found then raise exception 'Service not found'; end if;

  update public.services set image_url = p_url where id = p_service;

  perform public.admin_log(
    case when p_url is null then 'service_image_removed' else 'service_image_set' end,
    p_service, v_salon, jsonb_build_object('from', v_old, 'to', p_url));
end $$;

revoke all on function public.admin_set_service_image(uuid, text) from public, anon;
grant execute on function public.admin_set_service_image(uuid, text) to authenticated;


notify pgrst, 'reload schema';


-- ── Verify ──────────────────────────────────────────────────────────────────
--   select admin_set_service_price('<service uuid>', '499');
--   select admin_set_salon_rating('<salon uuid>', 4.5, 120);
--   select rating_avg, rating_override_avg from salons where id = '<salon uuid>';
--   select admin_clear_salon_rating('<salon uuid>');
--   select * from admin_audit order by created_at desc limit 5;
