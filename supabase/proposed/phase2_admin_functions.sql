-- ============================================================================
-- Admin Phase 2 — new admin functions (Customer App + shared support inbox)
-- ============================================================================
--
-- PROPOSED — not yet applied. Run once, whole file, in the Supabase SQL editor
-- (project oepwnbtoruxhdjnkcazu). Runs in ONE transaction: if any statement
-- fails, nothing is applied. Safe to re-run.
--
-- WHAT THIS ADDS — nine new functions, nothing else:
--   Support inbox     admin_support_threads / admin_support_messages /
--                     admin_support_reply
--   Bookings          admin_bookings                    (read-only)
--   Referrals         admin_referrals / admin_cancel_referral
--   Offers            admin_set_offer_active
--   Salon profile     admin_update_salon_profile
--   Reviews           admin_moderate_review
--
-- WHAT THIS DOES NOT TOUCH
--   • No table, column, constraint, index, relationship, policy, trigger or
--     existing function is created, altered or dropped.
--   • Every function is SECURITY DEFINER, starts with the same
--     is_platform_admin() check as admin_operations.sql, and writes an
--     admin_audit row (via the existing admin_log()) for every change.
--   • Customer/partner sessions can call them but get 'Not authorised'.
--
-- HOW THE APPS SEE THE RESULTS (no app change needed)
--   • A support reply is an ordinary support_messages row with
--     sender = 'support' — the value both apps already render as Groomto
--     (Partner app chat_support_screen.dart; Customer app treats anything
--     that isn't 'customer' as support). Both apps stream the table live.
--   • Offer on/off uses offers.active, which both apps already honour; turning
--     one back on still passes trg_enforce_offer_limit (plan limits).
--   • Salon edits write the same columns, in the same shapes, as the Partner
--     app's own edit screens (edit_salon_info_screen.dart,
--     edit_working_hours_screen.dart).
-- ============================================================================

begin;

-- ── 0. Never overwrite a function this file didn't create ──────────────────
-- Each function below is tagged with a comment. If one of these names already
-- exists WITHOUT that tag, stop: it's someone else's function.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'admin_support_threads', 'admin_support_messages', 'admin_support_reply',
        'admin_bookings', 'admin_referrals', 'admin_cancel_referral',
        'admin_set_offer_active', 'admin_update_salon_profile',
        'admin_moderate_review')
      and coalesce(obj_description(p.oid, 'pg_proc'), '') not like 'groomto-admin-phase2%'
  ) then
    raise exception 'A function with one of these names already exists and was not created by this file. Nothing was changed — check it before continuing.';
  end if;
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 1. SUPPORT INBOX
-- ════════════════════════════════════════════════════════════════════════════
-- support_messages is shared: customer threads have customer_id set (Customer
-- app, sender 'customer'); salon threads have salon_id set and no customer_id
-- (Partner app, sender 'salon'). Replies are sender 'support'.
-- p_kind: 'customer' | 'salon'.

create or replace function public.admin_support_threads(p_kind text)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v json;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  if p_kind is null or p_kind not in ('customer', 'salon') then
    raise exception 'Unknown inbox';
  end if;

  with m as (
    select case when p_kind = 'customer' then sm.customer_id else sm.salon_id end as party,
           sm.sender, sm.message, sm.created_at
    from public.support_messages sm
    where case when p_kind = 'customer'
               then sm.customer_id is not null
               else sm.salon_id is not null and sm.customer_id is null end
  ),
  t as (
    select party,
           count(*)::int as messages,
           max(created_at) as last_at,
           (array_agg(sender order by created_at desc))[1] as last_sender,
           (array_agg(message order by created_at desc))[1] as last_message
    from m
    group by party
  )
  select coalesce(json_agg(json_build_object(
           'id',           t.party,
           'name',         case when p_kind = 'customer' then u.full_name else s.name end,
           'phone',        case when p_kind = 'customer' then u.phone else s.phone end,
           'messages',     t.messages,
           'last_at',      t.last_at,
           'last_sender',  t.last_sender,
           'last_message', left(t.last_message, 160),
           'needs_reply',  t.last_sender is distinct from 'support')
         order by (t.last_sender is distinct from 'support') desc, t.last_at desc),
         '[]'::json)
    into v
  from t
  left join public.users  u on p_kind = 'customer' and u.id = t.party
  left join public.salons s on p_kind = 'salon'    and s.id = t.party;

  return v;
end $$;

create or replace function public.admin_support_messages(p_kind text, p_party uuid)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v json;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  if p_kind is null or p_kind not in ('customer', 'salon') then
    raise exception 'Unknown inbox';
  end if;

  select coalesce(json_agg(json_build_object(
           'id', sm.id, 'sender', sm.sender, 'message', sm.message,
           'created_at', sm.created_at)
         order by sm.created_at), '[]'::json)
    into v
  from public.support_messages sm
  where case when p_kind = 'customer'
             then sm.customer_id = p_party
             else sm.salon_id = p_party and sm.customer_id is null end;

  return v;
end $$;

create or replace function public.admin_support_reply(
  p_kind text, p_party uuid, p_message text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_msg text := btrim(coalesce(p_message, ''));
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  if p_kind is null or p_kind not in ('customer', 'salon') then
    raise exception 'Unknown inbox';
  end if;
  if v_msg = '' then raise exception 'The reply is empty'; end if;
  if length(v_msg) > 2000 then raise exception 'The reply is too long (2000 characters max)'; end if;

  if p_kind = 'customer' then
    if not exists (select 1 from public.users where id = p_party) then
      raise exception 'Customer not found';
    end if;
    insert into public.support_messages (customer_id, sender, message)
    values (p_party, 'support', v_msg);
  else
    if not exists (select 1 from public.salons where id = p_party) then
      raise exception 'Salon not found';
    end if;
    insert into public.support_messages (salon_id, sender, message)
    values (p_party, 'support', v_msg);

    -- The Partner app lists notify_salon() rows in its notification centre; a
    -- failure here must never block the reply itself.
    begin
      perform public.notify_salon(p_party, 'support', 'Groomto support replied',
        left(v_msg, 140), null, null);
    exception when others then null;
    end;
  end if;

  perform public.admin_log('support_reply', p_party,
    case when p_kind = 'salon' then p_party end,
    jsonb_build_object('inbox', p_kind, 'message', v_msg));
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. BOOKINGS (read-only)
-- ════════════════════════════════════════════════════════════════════════════
-- bookings RLS is participant-only (bookings_participants_read), so admins get
-- this function instead of a new policy — existing booking reads, realtime
-- streams and policies stay exactly as they are.
-- Rows are returned whole (to_jsonb) because the two apps add columns
-- independently; filters only use columns both apps rely on.

create or replace function public.admin_bookings(
  p_status   text default null,
  p_salon    uuid default null,
  p_customer uuid default null,
  p_from     text default null,   -- booking_date, 'YYYY-MM-DD'
  p_to       text default null,
  p_search   text default null,   -- customer name / phone
  p_limit    int  default 50,
  p_offset   int  default 0)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_like   text;
  v_total  int;
  v_counts json;
  v_value  numeric;
  v_rows   json;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;

  v_like := case
    when nullif(btrim(p_search), '') is null then null
    else '%' || replace(replace(replace(btrim(p_search), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end;

  with base as (
    select to_jsonb(b) as j, b.status::text as status, b.created_at
    from public.bookings b
    where (p_salon is null or b.salon_id = p_salon)
      and (p_customer is null or b.customer_id = p_customer)
      and (p_from is null or coalesce(to_jsonb(b) ->> 'booking_date', '') >= p_from)
      and (p_to   is null or coalesce(to_jsonb(b) ->> 'booking_date', '') <= p_to)
      and (v_like is null
           or coalesce(to_jsonb(b) ->> 'customer_name', '')  ilike v_like
           or coalesce(to_jsonb(b) ->> 'customer_phone', '') ilike v_like)
  ),
  filtered as (
    select * from base where p_status is null or status = p_status
  ),
  page as (
    select f.j, f.created_at
    from filtered f
    order by f.created_at desc nulls last
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    offset greatest(0, coalesce(p_offset, 0))
  )
  select
    (select count(*)::int from filtered),
    (select coalesce(json_object_agg(coalesce(c.status, 'unknown'), c.n), '{}'::json)
       from (select status, count(*)::int as n from base group by status) c),
    -- What customers paid for completed visits: total_price when present,
    -- else price — the same fallback as the Customer App's Booking model.
    (select coalesce(sum(case
        when (f.j ->> 'total_price') ~ '^[0-9]+(\.[0-9]+)?$' then (f.j ->> 'total_price')::numeric
        when (f.j ->> 'price')       ~ '^[0-9]+(\.[0-9]+)?$' then (f.j ->> 'price')::numeric
        else 0 end), 0)
       from filtered f where f.status = 'completed'),
    (select coalesce(json_agg(p.j || jsonb_build_object('salon_name', s.name)
                              order by p.created_at desc nulls last), '[]'::json)
       from page p
       left join public.salons s on s.id = (p.j ->> 'salon_id')::uuid)
  into v_total, v_counts, v_value, v_rows;

  return json_build_object(
    'total', v_total, 'status_counts', v_counts,
    'completed_value', v_value, 'rows', v_rows);
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 3. REFERRAL RECORDS
-- ════════════════════════════════════════════════════════════════════════════
-- referrals RLS lets each customer read only their own rows
-- (referrals_select_own), so admins read through this function.

create or replace function public.admin_referrals(
  p_status text default null, p_limit int default 100, p_offset int default 0)
returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_total  int;
  v_counts json;
  v_rows   json;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;

  select count(*)::int into v_total
  from public.referrals r
  where p_status is null or r.status = upper(p_status);

  select coalesce(json_object_agg(c.status, c.n), '{}'::json) into v_counts
  from (select status, count(*)::int as n from public.referrals group by status) c;

  select coalesce(json_agg(x order by x.created_at desc), '[]'::json) into v_rows
  from (
    select r.id, r.referral_type, r.status, r.referral_code, r.points_awarded,
           r.created_at, r.verified_at, r.completed_at,
           r.referrer_id,       ru.full_name as referrer_name, ru.phone as referrer_phone,
           r.referrer_salon_id, rs.name      as referrer_salon_name,
           r.referred_user_id,  du.full_name as referred_name, du.phone as referred_phone
    from public.referrals r
    left join public.users  ru on ru.id = r.referrer_id
    left join public.salons rs on rs.id = r.referrer_salon_id
    left join public.users  du on du.id = r.referred_user_id
    where p_status is null or r.status = upper(p_status)
    order by r.created_at desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
    offset greatest(0, coalesce(p_offset, 0))
  ) x;

  return json_build_object('total', v_total, 'status_counts', v_counts, 'rows', v_rows);
end $$;

-- CANCELLED is the lifecycle state the Customer App's own migration defines
-- for this ("voided (e.g. by support); never awards points" —
-- 20260927000000_user_referrals.sql). Only referrals that haven't paid out can
-- be voided; reversing points already credited is not decided here.
create or replace function public.admin_cancel_referral(
  p_referral uuid, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_status   text;
  v_referred uuid;
  v_referrer uuid;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;

  select status, referred_user_id, referrer_id
    into v_status, v_referred, v_referrer
  from public.referrals where id = p_referral
  for update;
  if not found then raise exception 'Referral not found'; end if;

  if v_status not in ('PENDING', 'VERIFIED') then
    raise exception 'Only pending or verified referrals can be cancelled (this one is %)', v_status;
  end if;

  update public.referrals set status = 'CANCELLED' where id = p_referral;

  perform public.admin_log('referral_cancelled', p_referral, null,
    jsonb_build_object('from', v_status, 'referred_user', v_referred,
                       'referrer', v_referrer, 'note', p_note));
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 4. OFFER MODERATION
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.admin_set_offer_active(
  p_offer uuid, p_active boolean, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_salon uuid;
  v_title text;
  v_was   boolean;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  if p_active is null then raise exception 'Choose on or off'; end if;

  select salon_id, title, active into v_salon, v_title, v_was
  from public.offers where id = p_offer
  for update;
  if not found then raise exception 'Offer not found'; end if;

  -- Turning an offer back ON still passes trg_enforce_offer_limit, so a salon
  -- never ends up with more live offers than its plan allows.
  update public.offers set active = p_active where id = p_offer;

  perform public.admin_log(
    case when p_active then 'offer_resumed' else 'offer_paused' end,
    p_offer, v_salon,
    jsonb_build_object('from', v_was, 'to', p_active, 'title', v_title, 'note', p_note));

  begin
    perform public.notify_salon(v_salon, 'offer',
      case when p_active then 'Offer turned back on by Groomto'
           else 'Offer paused by Groomto' end,
      coalesce(nullif(btrim(v_title), ''), 'Your offer')
        || case when nullif(btrim(p_note), '') is not null then ' — ' || btrim(p_note) else '' end,
      p_offer, '/manage-offers');
  exception when others then null;
  end;
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 5. SALON PROFILE EDITING
-- ════════════════════════════════════════════════════════════════════════════
-- Editable: name, owner_name, type, description, the address fields, map
-- location, opening hours, and photos (REMOVE ONLY).
-- Not editable here on purpose: phone and email (used for login/OTP and
-- WhatsApp), bank/UPI/KYC, commission (has its own function), referral code,
-- accepting_bookings (the partner's own online switch).
--
-- Values are validated and stored in the exact shapes the Partner app writes.
-- The update is built per column and cast to that column's real type, so it
-- works whatever type the live table uses (text/enum, json/jsonb, text[]).

create or replace function public.admin_update_salon_profile(
  p_salon uuid, p_changes jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_allowed   constant text[] := array[
    'name', 'owner_name', 'type', 'description',
    'address_line1', 'address_line2', 'landmark', 'city', 'state', 'pincode',
    'latitude', 'longitude', 'working_hours', 'photos'];
  v_addr_keys constant text[] := array[
    'address_line1', 'address_line2', 'landmark', 'city', 'state', 'pincode'];
  v_week      constant text[] := array['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  v_time      constant text   := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  v_old     jsonb;
  v_new     jsonb := '{}'::jsonb;
  v_key     text;
  v_val     jsonb;
  v_str     text;
  v_type    text;
  v_lit     text;
  v_sets    text[] := '{}';
  v_changed text[] := '{}';
  v_a1 text; v_a2 text; v_lm text; v_city text; v_state text; v_pin text;
  v_wh jsonb; v_days jsonb; v_open text; v_close text;
  v_hb boolean; v_bs text; v_be text;
  v_photos jsonb;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb then
    raise exception 'Nothing to change';
  end if;
  for v_key in select jsonb_object_keys(p_changes) loop
    if not (v_key = any (v_allowed)) then
      raise exception 'Field "%" cannot be changed from the admin panel', v_key;
    end if;
  end loop;

  select to_jsonb(s) into v_old from public.salons s where s.id = p_salon for update;
  if v_old is null then raise exception 'Salon not found'; end if;

  -- Text fields
  foreach v_key in array array['name', 'owner_name', 'description'] loop
    if p_changes ? v_key then
      if jsonb_typeof(p_changes -> v_key) not in ('string', 'null') then
        raise exception '% must be text', v_key;
      end if;
      v_str := btrim(coalesce(p_changes ->> v_key, ''));
      if v_key = 'name' and v_str = '' then raise exception 'Salon name is required'; end if;
      -- (A CASE can't sit inside an IF condition in PL/pgSQL — its THEN ends
      -- the condition early — so the limit is worked out first.)
      v_lit := case when v_key = 'description' then '1000' else '100' end;
      if length(v_str) > v_lit::int then
        raise exception '% is too long', v_key;
      end if;
      v_new := v_new || jsonb_build_object(v_key, v_str);
    end if;
  end loop;

  -- Salon type: the Partner app's three values (edit_salon_info_screen.dart).
  if p_changes ? 'type' then
    v_str := lower(btrim(coalesce(p_changes ->> 'type', '')));
    if v_str not in ('men', 'women', 'unisex') then
      raise exception 'Salon type must be men, women or unisex';
    end if;
    v_new := v_new || jsonb_build_object('type', v_str);
  end if;

  -- Address: recomposed into `address` exactly like the Partner app does,
  -- because the Customer App displays `address`.
  if p_changes ?| v_addr_keys then
    v_a1    := btrim(coalesce(case when p_changes ? 'address_line1' then p_changes ->> 'address_line1' else v_old ->> 'address_line1' end, ''));
    v_a2    := btrim(coalesce(case when p_changes ? 'address_line2' then p_changes ->> 'address_line2' else v_old ->> 'address_line2' end, ''));
    v_lm    := btrim(coalesce(case when p_changes ? 'landmark'      then p_changes ->> 'landmark'      else v_old ->> 'landmark'      end, ''));
    v_city  := btrim(coalesce(case when p_changes ? 'city'          then p_changes ->> 'city'          else v_old ->> 'city'          end, ''));
    v_state := btrim(coalesce(case when p_changes ? 'state'         then p_changes ->> 'state'         else v_old ->> 'state'         end, ''));
    v_pin   := btrim(coalesce(case when p_changes ? 'pincode'       then p_changes ->> 'pincode'       else v_old ->> 'pincode'       end, ''));
    if v_a1 = '' then raise exception 'Address line 1 is required'; end if;
    if v_pin <> '' and v_pin !~ '^[0-9]{6}$' then raise exception 'Pincode must be 6 digits'; end if;
    if greatest(length(v_a1), length(v_a2), length(v_lm), length(v_city), length(v_state)) > 200 then
      raise exception 'An address field is too long';
    end if;
    v_new := v_new || jsonb_build_object(
      'address_line1', v_a1, 'address_line2', v_a2, 'landmark', v_lm,
      'city', v_city, 'state', v_state, 'pincode', v_pin,
      'address', array_to_string(array[
        v_a1,
        nullif(v_a2, ''),
        case when v_lm <> '' then 'Near ' || v_lm end,
        nullif(array_to_string(array[nullif(v_city, ''), nullif(v_state, ''), nullif(v_pin, '')], ', '), '')
      ], ', '));
  end if;

  -- Map location (both together)
  if p_changes ? 'latitude' or p_changes ? 'longitude' then
    if not (p_changes ? 'latitude' and p_changes ? 'longitude') then
      raise exception 'Send latitude and longitude together';
    end if;
    if jsonb_typeof(p_changes -> 'latitude') <> 'number'
       or jsonb_typeof(p_changes -> 'longitude') <> 'number' then
      raise exception 'Latitude and longitude must be numbers';
    end if;
    if (p_changes ->> 'latitude')::numeric not between -90 and 90
       or (p_changes ->> 'longitude')::numeric not between -180 and 180 then
      raise exception 'That location is out of range';
    end if;
    v_new := v_new || jsonb_build_object(
      'latitude', p_changes -> 'latitude', 'longitude', p_changes -> 'longitude');
  end if;

  -- Opening hours: { days, open, close, hasBreak, breakStart, breakEnd } —
  -- the Partner app's shape (edit_working_hours_screen.dart), days Mon→Sun.
  if p_changes ? 'working_hours' then
    v_wh := p_changes -> 'working_hours';
    if jsonb_typeof(v_wh) <> 'object' or jsonb_typeof(v_wh -> 'days') is distinct from 'array' then
      raise exception 'Opening hours are malformed';
    end if;
    if exists (select 1 from jsonb_array_elements(v_wh -> 'days') d
               where jsonb_typeof(d) <> 'string' or not ((d #>> '{}') = any (v_week))) then
      raise exception 'Working days must be Mon, Tue, Wed, Thu, Fri, Sat or Sun';
    end if;
    select coalesce(jsonb_agg(to_jsonb(w.day) order by w.ord), '[]'::jsonb) into v_days
    from unnest(v_week) with ordinality as w(day, ord)
    where exists (select 1 from jsonb_array_elements_text(v_wh -> 'days') d where d = w.day);
    if jsonb_array_length(v_days) = 0 then
      raise exception 'Pick at least one working day — without one, customers can''t book';
    end if;

    v_open  := v_wh ->> 'open';
    v_close := v_wh ->> 'close';
    if coalesce(v_open, '') !~ v_time or coalesce(v_close, '') !~ v_time then
      raise exception 'Opening and closing times must be HH:MM (24-hour)';
    end if;
    if v_close <= v_open then raise exception 'Closing time must be after opening time'; end if;

    v_hb := coalesce(case when jsonb_typeof(v_wh -> 'hasBreak') = 'boolean'
                          then (v_wh ->> 'hasBreak')::boolean end, false);
    if v_hb then
      v_bs := v_wh ->> 'breakStart';
      v_be := v_wh ->> 'breakEnd';
      if coalesce(v_bs, '') !~ v_time or coalesce(v_be, '') !~ v_time then
        raise exception 'Break times must be HH:MM (24-hour)';
      end if;
      if not (v_open <= v_bs and v_bs < v_be and v_be <= v_close) then
        raise exception 'The break must fall inside opening hours';
      end if;
    else
      v_bs := null;
      v_be := null;
    end if;

    v_new := v_new || jsonb_build_object('working_hours', jsonb_build_object(
      'days', v_days, 'open', v_open, 'close', v_close,
      'hasBreak', v_hb, 'breakStart', v_bs, 'breakEnd', v_be));
  end if;

  -- Photos: REMOVE ONLY. The Partner app files photos into slots by file name
  -- and re-sorts them on its next save (utils/photo_slots.dart), so a reorder
  -- wouldn't stick — the original order is always kept.
  if p_changes ? 'photos' then
    if jsonb_typeof(p_changes -> 'photos') <> 'array' then
      raise exception 'Photos must be a list';
    end if;
    -- A salon with no photos may hold NULL rather than an empty list.
    v_photos := case when jsonb_typeof(v_old -> 'photos') = 'array'
                     then v_old -> 'photos' else '[]'::jsonb end;
    if exists (select 1 from jsonb_array_elements_text(p_changes -> 'photos') p
               where not (v_photos ? p)) then
      raise exception 'Photos can only be removed here, not added';
    end if;
    select coalesce(jsonb_agg(e order by o), '[]'::jsonb) into v_val
    from jsonb_array_elements(v_photos) with ordinality as t(e, o)
    where (p_changes -> 'photos') @> jsonb_build_array(e);
    v_new := v_new || jsonb_build_object('photos', v_val);
  end if;

  -- One UPDATE, only for values that actually changed, each cast to its
  -- column's real type.
  for v_key, v_val in select key, value from jsonb_each(v_new) loop
    if v_val is distinct from (v_old -> v_key) then
      select format_type(a.atttypid, a.atttypmod) into v_type
      from pg_attribute a
      where a.attrelid = 'public.salons'::regclass
        and a.attname = v_key and a.attnum > 0 and not a.attisdropped;
      if v_type is null then
        raise exception 'This database has no salons.% column', v_key;
      end if;
      v_lit := case
        when jsonb_typeof(v_val) = 'null' then null
        when jsonb_typeof(v_val) in ('string', 'number', 'boolean') then v_val #>> '{}'
        when jsonb_typeof(v_val) = 'array' and v_type like '%[]' then
          (select coalesce(array_agg(x), '{}'::text[]) from jsonb_array_elements_text(v_val) x)::text
        else v_val::text
      end;
      v_sets := v_sets || format('%I = %s', v_key,
        case when v_lit is null then 'NULL' else format('%L::%s', v_lit, v_type) end);
      v_changed := v_changed || v_key;
    end if;
  end loop;

  if coalesce(array_length(v_sets, 1), 0) = 0 then
    raise exception 'Nothing changed';
  end if;

  execute format('update public.salons set %s where id = $1', array_to_string(v_sets, ', '))
    using p_salon;

  perform public.admin_log('salon_profile_updated', p_salon, p_salon, jsonb_build_object(
    'fields', to_jsonb(v_changed),
    'before', (select jsonb_object_agg(k, v_old -> k) from unnest(v_changed) k),
    'after',  (select jsonb_object_agg(k, v_new -> k) from unnest(v_changed) k)));

  select string_agg(distinct case
           when k in ('address', 'address_line1', 'address_line2', 'landmark',
                      'city', 'state', 'pincode') then 'address'
           when k in ('latitude', 'longitude') then 'map location'
           when k = 'working_hours' then 'opening hours'
           when k = 'owner_name' then 'owner name'
           when k = 'type' then 'salon type'
           else k end, ', ')
    into v_str
  from unnest(v_changed) k;

  begin
    perform public.notify_salon(p_salon, 'profile',
      'Your salon profile was updated by Groomto',
      'Changed: ' || v_str || '. Contact support if this looks wrong.', null, null);
  exception when others then null;
  end;
end $$;


-- ════════════════════════════════════════════════════════════════════════════
-- 6. REVIEW MODERATION
-- ════════════════════════════════════════════════════════════════════════════
-- p_action: 'clear_comment' (remove the text, keep the stars — the rating is
-- unchanged) or 'delete' (remove the whole review). The full original row is
-- always kept in admin_audit, so either can be restored by hand.

create or replace function public.admin_moderate_review(
  p_review uuid, p_action text, p_note text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_row   jsonb;
  v_salon uuid;
begin
  if not public.is_platform_admin() then raise exception 'Not authorised'; end if;
  if p_action is null or p_action not in ('clear_comment', 'delete') then
    raise exception 'Unknown action';
  end if;

  select to_jsonb(r), r.salon_id into v_row, v_salon
  from public.reviews r where r.id = p_review
  for update;
  if v_row is null then raise exception 'Review not found'; end if;

  if p_action = 'clear_comment' then
    if nullif(btrim(coalesce(v_row ->> 'comment', '')), '') is null then
      raise exception 'This review has no comment to remove';
    end if;
    update public.reviews set comment = null where id = p_review;
  else
    delete from public.reviews where id = p_review;

    -- The live rating trigger normally refreshes salons.rating_avg/count, but
    -- its SQL isn't in either repo, so whether it handles DELETE can't be
    -- confirmed. Recompute from the remaining reviews (the same aggregate as
    -- salon_business_metrics) so the salon never keeps a stale rating. An
    -- active admin override is still enforced by zz_salons_rating_override.
    if v_salon is not null then
      update public.salons s
         set rating_avg = r.avg_rating, rating_count = r.n_rating
        from (select coalesce(round(avg(rating)::numeric, 1), 0) as avg_rating,
                     count(*)::int as n_rating
                from public.reviews where salon_id = v_salon) r
       where s.id = v_salon;
      begin
        perform public.refresh_visibility(v_salon);
      exception when undefined_function then null;
      end;
    end if;
  end if;

  perform public.admin_log(
    case when p_action = 'delete' then 'review_deleted' else 'review_comment_removed' end,
    p_review, v_salon, jsonb_build_object('review', v_row, 'note', p_note));
end $$;


-- ── Grants + tags ───────────────────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.admin_support_threads(text)',
    'public.admin_support_messages(text, uuid)',
    'public.admin_support_reply(text, uuid, text)',
    'public.admin_bookings(text, uuid, uuid, text, text, text, int, int)',
    'public.admin_referrals(text, int, int)',
    'public.admin_cancel_referral(uuid, text)',
    'public.admin_set_offer_active(uuid, boolean, text)',
    'public.admin_update_salon_profile(uuid, jsonb)',
    'public.admin_moderate_review(uuid, text, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
    execute format('comment on function %s is %L', f, 'groomto-admin-phase2: admin-only, see AdminPartner supabase/proposed/phase2_admin_functions.sql');
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';


-- ── Verify (read-only) ──────────────────────────────────────────────────────
--   select admin_support_threads('customer');
--   select admin_bookings(p_limit => 5);
--   select admin_referrals(p_limit => 5);
--   select proname, obj_description(oid, 'pg_proc') from pg_proc
--    where obj_description(oid, 'pg_proc') like 'groomto-admin-phase2%';
