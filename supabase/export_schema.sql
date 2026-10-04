-- =============================================================================
-- export_schema.sql - schema-only export (NO data) of this Postgres/Supabase DB
--
-- Run this against the SOURCE database. It returns ONE text value: a complete
-- SQL script that recreates the structure in a new, empty project.
--
--   Supabase SQL editor : paste this whole file, Run, copy the single result cell.
--   psql                : psql "<connection string>" -qAt -f supabase/export_schema.sql -o schema.sql
--
-- Then run the generated script once in the NEW project as the postgres role.
-- It is wrapped in begin/commit, so if any statement fails nothing is applied.
--
-- Exported (for the schemas passed at the bottom, default: public):
--   extensions, schemas, enum/domain/composite types, sequences, tables (columns,
--   defaults, identity and generated columns, partitions), primary keys,
--   unique/check/exclusion constraints, foreign keys, views and materialized
--   views (in dependency order), functions, indexes, triggers (including
--   triggers on auth.users that call your functions), RLS on/off + policies
--   (also storage.* policies), replica identity, table/sequence/function/column
--   grants, comments, and realtime publication membership.
--
-- Privileges: before re-granting, every object is revoked from PUBLIC and from
-- every role your default privileges auto-grant to (anon, authenticated,
-- service_role on Supabase). Anything you locked down stays locked down in the
-- new project instead of silently re-opening.
--
-- NOT exported: row data, auth users, storage buckets and files, Edge Functions,
-- secrets, cron jobs, aggregates, foreign tables, INHERITS relationships
-- (children become standalone tables), rules, event triggers, ALTER DEFAULT
-- PRIVILEGES.
--
-- Read-only: it only creates a temporary function (pg_temp) that disappears
-- when the session ends.
-- =============================================================================

create or replace function pg_temp.export_schema(
  p_schemas              text[] default array['public'],
  p_extra_policy_schemas text[] default array['storage']
) returns text
language sql
-- Empty search_path makes every deparsed name (types, tables, functions)
-- schema-qualified, so the output doesn't depend on the new project's path.
set search_path = ''
as $fn$
with recursive
ext_member as (
  select classid, objid from pg_depend where deptype = 'e'
),
rels as (
  select c.oid, n.nspname
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = any(p_schemas)
    and c.relkind in ('r', 'p', 'v', 'm', 'S')
    and not exists (select 1 from ext_member e
                    where e.classid = 'pg_class'::regclass and e.objid = c.oid)
),
types as (
  select t.oid, n.nspname
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  left join pg_class tc on tc.oid = t.typrelid
  where n.nspname = any(p_schemas)
    and (t.typtype in ('e', 'd') or (t.typtype = 'c' and tc.relkind = 'c'))
    and not exists (select 1 from ext_member e
                    where e.classid = 'pg_type'::regclass and e.objid = t.oid)
),
-- dep: 0 = signature uses no table/view row types, 1 = uses a table's,
-- 2 = uses a view's. Decides whether a function is emitted before tables,
-- after tables, or after views.
fns as (
  select p.oid, p.proowner, p.proacl,
         format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) as ident,
         coalesce((
           select max(case when rc.relkind in ('v', 'm') then 2 else 1 end)
           from pg_depend d
           left join pg_type dt on d.refclassid = 'pg_type'::regclass and dt.oid = d.refobjid
           left join pg_type et on et.oid = dt.typelem
           join pg_class rc on rc.oid = case when d.refclassid = 'pg_class'::regclass then d.refobjid
                                             else coalesce(nullif(dt.typrelid, 0), et.typrelid) end
           where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'n'
             and rc.relkind in ('r', 'p', 'f', 'v', 'm')
         ), 0) as dep
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = any(p_schemas)
    and p.prokind in ('f', 'p')
    and not exists (select 1 from ext_member e
                    where e.classid = 'pg_proc'::regclass and e.objid = p.oid)
),
view_dep as (
  select distinct r.ev_class as v, d.refobjid as dep
  from pg_rewrite r
  join pg_depend d on d.classid = 'pg_rewrite'::regclass and d.objid = r.oid
                  and d.refclassid = 'pg_class'::regclass and d.refobjid <> r.ev_class
  join pg_class dc on dc.oid = d.refobjid and dc.relkind in ('v', 'm')
),
view_lvl (v, lvl) as (
  select c.oid, 0
  from rels r
  join pg_class c on c.oid = r.oid
  where c.relkind in ('v', 'm')
  union all
  select vd.v, vl.lvl + 1
  from view_lvl vl
  join view_dep vd on vd.dep = vl.v
),
default_grantees as (
  select distinct a.grantee
  from pg_default_acl da
  cross join lateral aclexplode(da.defaclacl) a
  where a.grantee <> 0
),
acl_objs as (
  select 190 as phase, c.oid,
         case when c.relkind = 'S' then 'sequence' else 'table' end as kind,
         format('%I.%I', r.nspname, c.relname) as ident,
         c.relowner as owner,
         coalesce(c.relacl, acldefault((case when c.relkind = 'S' then 's' else 'r' end)::"char", c.relowner)) as acl
  from rels r
  join pg_class c on c.oid = r.oid
  union all
  select 191, f.oid, 'routine', f.ident, f.proowner, coalesce(f.proacl, acldefault('f', f.proowner))
  from fns f
),
parts (phase, k1, k2, ddl) as (
  select 0, 0::bigint, ''::text, concat_ws(E'\n',
    format('-- Schema-only export of database %s (schemas: %s; policies also from: %s)',
           current_database(), array_to_string(p_schemas, ', '), array_to_string(p_extra_policy_schemas, ', ')),
    format('-- Generated %s by export_schema.sql. Contains NO data.', to_char(now(), 'YYYY-MM-DD HH24:MI:SS TZ')),
    '-- Run once in the NEW (empty) project as the postgres role.',
    '',
    'begin;',
    'set check_function_bodies = false;',
    'set client_min_messages = warning;')::text

  union all -- schemas that extensions live in
  select 5, n.oid::bigint, '', format('create schema if not exists %I;', n.nspname)
  from pg_namespace n
  where n.nspname not in ('pg_catalog', 'public')
    and exists (select 1 from pg_extension x where x.extnamespace = n.oid and x.extname <> 'plpgsql')

  union all
  select 10, x.oid::bigint, '', format('create extension if not exists %I with schema %I;', x.extname, n.nspname)
  from pg_extension x
  join pg_namespace n on n.oid = x.extnamespace
  where x.extname <> 'plpgsql'

  union all
  select 20, 0, n.nspname, format('create schema if not exists %I;', n.nspname)
  from pg_namespace n
  where n.nspname = any(p_schemas) and n.nspname <> 'public'

  union all -- enums
  select 30, t.oid::bigint, '',
         format('create type %I.%I as enum (%s);', ty.nspname, t.typname,
                (select string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder)
                 from pg_enum e where e.enumtypid = t.oid))
  from types ty
  join pg_type t on t.oid = ty.oid
  where t.typtype = 'e'

  union all -- domains
  select 31, t.oid::bigint, '',
         format('create domain %I.%I as %s%s%s%s;', ty.nspname, t.typname,
                format_type(t.typbasetype, t.typtypmod),
                case when t.typdefaultbin is not null then ' default ' || pg_get_expr(t.typdefaultbin, 0) else '' end,
                case when t.typnotnull then ' not null' else '' end,
                coalesce((select string_agg(format(' constraint %I %s', co.conname, pg_get_constraintdef(co.oid)), '' order by co.conname)
                          from pg_constraint co where co.contypid = t.oid and co.contype = 'c'), ''))
  from types ty
  join pg_type t on t.oid = ty.oid
  where t.typtype = 'd'

  union all -- standalone composite types
  select 32, t.oid::bigint, '',
         format('create type %I.%I as (%s);', ty.nspname, t.typname,
                (select string_agg(format('%I %s', a.attname, format_type(a.atttypid, a.atttypmod)), ', ' order by a.attnum)
                 from pg_attribute a where a.attrelid = t.typrelid and a.attnum > 0 and not a.attisdropped))
  from types ty
  join pg_type t on t.oid = ty.oid
  where t.typtype = 'c'

  union all -- sequences (identity-column sequences are created by their table)
  select 60, c.oid::bigint, '',
         format('create sequence if not exists %I.%I as %s increment by %s minvalue %s maxvalue %s start with %s cache %s%s;',
                r.nspname, c.relname, format_type(s.seqtypid, null), s.seqincrement, s.seqmin, s.seqmax,
                s.seqstart, s.seqcache, case when s.seqcycle then ' cycle' else '' end)
  from rels r
  join pg_class c on c.oid = r.oid
  join pg_sequence s on s.seqrelid = c.oid
  where not exists (select 1 from pg_depend d
                    where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'i')

  union all -- functions and procedures
  select case f.dep when 0 then 70 when 1 then 95 else 140 end, f.oid::bigint, '',
         rtrim(pg_get_functiondef(f.oid), E'\n') || ';'
  from fns f

  union all -- tables (80) and partitions (81)
  select case when c.relispartition then 81 else 80 end, c.oid::bigint, '',
         case when c.relispartition then
           format('create%s table %I.%I partition of %I.%I %s%s;',
                  case when c.relpersistence = 'u' then ' unlogged' else '' end,
                  r.nspname, c.relname, pn.nspname, pc.relname,
                  pg_get_expr(c.relpartbound, c.oid),
                  case when c.relkind = 'p' then ' partition by ' || pg_get_partkeydef(c.oid) else '' end)
         else
           format(E'create%s table %I.%I (\n    %s\n)%s%s;',
                  case when c.relpersistence = 'u' then ' unlogged' else '' end,
                  r.nspname, c.relname, coalesce(cols.defs, ''),
                  case when c.relkind = 'p' then ' partition by ' || pg_get_partkeydef(c.oid) else '' end,
                  case when c.reloptions is not null then ' with (' || array_to_string(c.reloptions, ', ') || ')' else '' end)
         end
  from rels r
  join pg_class c on c.oid = r.oid
  left join pg_inherits ih on c.relispartition and ih.inhrelid = c.oid
  left join pg_class pc on pc.oid = ih.inhparent
  left join pg_namespace pn on pn.oid = pc.relnamespace
  left join lateral (
    select string_agg(
             format('%I %s', a.attname, format_type(a.atttypid, a.atttypmod))
             || case when a.attcollation <> 0 and a.attcollation <> ty.typcollation
                     then format(' collate %I.%I', cn.nspname, co.collname) else '' end
             || case when a.attgenerated in ('s', 'v')
                       then ' generated always as (' || pg_get_expr(ad.adbin, ad.adrelid) || ')'
                            || case when a.attgenerated = 's' then ' stored' else '' end
                     when a.attidentity = 'a' then ' generated always as identity'
                     when a.attidentity = 'd' then ' generated by default as identity'
                     when ad.adbin is not null then ' default ' || pg_get_expr(ad.adbin, ad.adrelid)
                     else '' end
             || case when a.attnotnull then ' not null' else '' end,
             E',\n    ' order by a.attnum) as defs
    from pg_attribute a
    join pg_type ty on ty.oid = a.atttypid
    left join pg_collation co on co.oid = a.attcollation
    left join pg_namespace cn on cn.oid = co.collnamespace
    left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
    where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  ) cols on true
  where c.relkind in ('r', 'p')

  union all -- serial-style sequences: tie them to their column
  select 90, c.oid::bigint, '',
         format('alter sequence %I.%I owned by %I.%I.%I;', r.nspname, c.relname, tn.nspname, tc.relname, a.attname)
  from rels r
  join pg_class c on c.oid = r.oid and c.relkind = 'S'
  join pg_depend d on d.classid = 'pg_class'::regclass and d.objid = c.oid
                  and d.refclassid = 'pg_class'::regclass and d.deptype = 'a' and d.refobjsubid > 0
  join pg_class tc on tc.oid = d.refobjid
  join pg_namespace tn on tn.oid = tc.relnamespace
  join pg_attribute a on a.attrelid = tc.oid and a.attnum = d.refobjsubid

  union all -- PK / unique / check / exclusion (100), foreign keys (110)
  select case when co.contype = 'f' then 110 else 100 end, co.oid::bigint, '',
         format('alter table %I.%I add constraint %I %s;', r.nspname, c.relname, co.conname, pg_get_constraintdef(co.oid))
  from rels r
  join pg_class c on c.oid = r.oid
  join pg_constraint co on co.conrelid = c.oid
  where co.contype in ('p', 'u', 'c', 'x', 'f')
    and co.conparentid = 0 -- skip copies a partition inherits from its parent
    and co.conislocal

  union all -- views and materialized views, dependencies first
  select 130, vl.lvl::bigint, c.relname::text,
         format(E'create %sview %I.%I%s as\n%s;',
                case when c.relkind = 'm' then 'materialized ' else '' end,
                r.nspname, c.relname,
                case when c.reloptions is not null then ' with (' || array_to_string(c.reloptions, ', ') || ')' else '' end,
                regexp_replace(pg_get_viewdef(c.oid), ';\s*$', ''))
  from rels r
  join pg_class c on c.oid = r.oid
  join (select v, max(lvl) as lvl from view_lvl group by v) vl on vl.v = c.oid

  union all -- indexes not already created by a constraint
  select 150, i.indexrelid::bigint, '',
         regexp_replace(pg_get_indexdef(i.indexrelid), ' ON ONLY ', ' ON ') || ';'
  from rels r
  join pg_index i on i.indrelid = r.oid
  where not exists (select 1 from pg_constraint co
                    where co.conindid = i.indexrelid and co.contype in ('p', 'u', 'x'))
    and not exists (select 1 from pg_inherits ih where ih.inhrelid = i.indexrelid)

  union all -- triggers on your tables, plus triggers elsewhere (e.g. auth.users) that call your functions
  select 160, t.oid::bigint, '', pg_get_triggerdef(t.oid) || ';'
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  join pg_proc p on p.oid = t.tgfoid
  join pg_namespace pn on pn.oid = p.pronamespace
  where not t.tgisinternal
    and t.tgparentid = 0
    and (n.nspname = any(p_schemas) or pn.nspname = any(p_schemas))
    and not exists (select 1 from ext_member e
                    where e.classid = 'pg_class'::regclass and e.objid = c.oid)

  union all
  select 170, c.oid::bigint, '',
         format('alter table %I.%I enable row level security;', r.nspname, c.relname)
         || case when c.relforcerowsecurity
                 then format(E'\nalter table %I.%I force row level security;', r.nspname, c.relname) else '' end
  from rels r
  join pg_class c on c.oid = r.oid
  where c.relkind in ('r', 'p') and c.relrowsecurity

  union all -- matters for realtime (old-row payloads)
  select 175, c.oid::bigint, '',
         format('alter table %I.%I replica identity %s;', r.nspname, c.relname,
                case c.relreplident
                  when 'f' then 'full'
                  when 'n' then 'nothing'
                  else 'using index ' || quote_ident((select ic.relname from pg_index ix
                                                      join pg_class ic on ic.oid = ix.indexrelid
                                                      where ix.indrelid = c.oid and ix.indisreplident))
                end)
  from rels r
  join pg_class c on c.oid = r.oid
  where c.relkind in ('r', 'p') and c.relreplident in ('f', 'n', 'i')

  union all
  select 180, 0, format('%s.%s.%s', pol.schemaname, pol.tablename, pol.policyname),
         format(E'drop policy if exists %I on %I.%I;\ncreate policy %I on %I.%I as %s for %s to %s%s%s;',
                pol.policyname, pol.schemaname, pol.tablename,
                pol.policyname, pol.schemaname, pol.tablename,
                lower(pol.permissive), lower(pol.cmd),
                (select string_agg(case when rl = 'public' then 'public' else quote_ident(rl) end, ', ')
                 from unnest(pol.roles) rl),
                case when pol.qual is not null then E'\n  using (' || pol.qual || ')' else '' end,
                case when pol.with_check is not null then E'\n  with check (' || pol.with_check || ')' else '' end)
  from pg_policies pol
  where pol.schemaname = any(p_schemas || p_extra_policy_schemas)

  union all -- schema privileges (custom schemas only; public is already set up in a new project)
  select 189, n.oid::bigint, g.grantee_name,
         format('grant %s on schema %I to %s%s;', g.privs, n.nspname, g.grantee_name, g.wgo)
  from pg_namespace n
  cross join lateral (
    select case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end as grantee_name,
           case when a.is_grantable then ' with grant option' else '' end as wgo,
           string_agg(lower(a.privilege_type), ', ' order by a.privilege_type) as privs
    from aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
    where a.grantee <> n.nspowner
    group by a.grantee, a.is_grantable
  ) g
  where n.nspname = any(p_schemas) and n.nspname <> 'public'

  union all -- reset to "nothing granted" before re-granting exactly what the source has
  select o.phase, o.oid::bigint, '0',
         format('revoke all on %s %s from %s;', o.kind, o.ident,
                concat_ws(', ', 'public',
                          (select string_agg(quote_ident(pg_get_userbyid(dg.grantee)), ', ' order by pg_get_userbyid(dg.grantee))
                           from default_grantees dg where dg.grantee <> o.owner)))
  from acl_objs o

  union all
  select o.phase, o.oid::bigint, '1 ' || g.grantee_name,
         format('grant %s on %s %s to %s%s;', g.privs, o.kind, o.ident, g.grantee_name, g.wgo)
  from acl_objs o
  cross join lateral (
    select case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end as grantee_name,
           case when a.is_grantable then ' with grant option' else '' end as wgo,
           string_agg(lower(a.privilege_type), ', ' order by a.privilege_type) as privs
    from aclexplode(o.acl) a
    where a.grantee <> o.owner
    group by a.grantee, a.is_grantable
  ) g

  union all -- column-level privileges
  select 192, c.oid::bigint, att.attname || ' ' || g.grantee_name,
         format('grant %s (%I) on table %I.%I to %s%s;', g.privs, att.attname, r.nspname, c.relname, g.grantee_name, g.wgo)
  from rels r
  join pg_class c on c.oid = r.oid
  join pg_attribute att on att.attrelid = c.oid and att.attnum > 0 and not att.attisdropped and att.attacl is not null
  cross join lateral (
    select case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end as grantee_name,
           case when a.is_grantable then ' with grant option' else '' end as wgo,
           string_agg(lower(a.privilege_type), ', ' order by a.privilege_type) as privs
    from aclexplode(att.attacl) a
    where a.grantee <> c.relowner
    group by a.grantee, a.is_grantable
  ) g

  union all
  select 200, c.oid::bigint, '',
         format('comment on %s %I.%I is %L;',
                case c.relkind when 'v' then 'view' when 'm' then 'materialized view' when 'S' then 'sequence' else 'table' end,
                r.nspname, c.relname, d.description)
  from rels r
  join pg_class c on c.oid = r.oid
  join pg_description d on d.classoid = 'pg_class'::regclass and d.objoid = c.oid and d.objsubid = 0

  union all
  select 200, c.oid::bigint, lpad(d.objsubid::text, 5, '0'),
         format('comment on column %I.%I.%I is %L;', r.nspname, c.relname, a.attname, d.description)
  from rels r
  join pg_class c on c.oid = r.oid
  join pg_description d on d.classoid = 'pg_class'::regclass and d.objoid = c.oid and d.objsubid > 0
  join pg_attribute a on a.attrelid = c.oid and a.attnum = d.objsubid

  union all
  select 200, f.oid::bigint, '', format('comment on routine %s is %L;', f.ident, d.description)
  from fns f
  join pg_description d on d.classoid = 'pg_proc'::regclass and d.objoid = f.oid

  union all
  select 200, t.oid::bigint, '',
         format('comment on %s %I.%I is %L;', case when t.typtype = 'd' then 'domain' else 'type' end,
                ty.nspname, t.typname, d.description)
  from types ty
  join pg_type t on t.oid = ty.oid
  join pg_description d on d.classoid = 'pg_type'::regclass and d.objoid = t.oid

  union all -- publications (supabase_realtime already exists in a new Supabase project)
  select 209, 0, p.pubname,
         format('do $do$ begin if not exists (select 1 from pg_catalog.pg_publication where pubname = %L) '
                'then create publication %I; end if; end $do$;', p.pubname, p.pubname)
  from pg_publication p
  where not p.puballtables
    and exists (select 1 from pg_publication_tables pt
                where pt.pubname = p.pubname and pt.schemaname = any(p_schemas))

  union all
  select 210, 0, format('%s.%s.%s', pt.pubname, pt.schemaname, pt.tablename),
         format('alter publication %I add table %I.%I;', pt.pubname, pt.schemaname, pt.tablename)
  from pg_publication_tables pt
  join pg_publication p on p.pubname = pt.pubname
  where not p.puballtables and pt.schemaname = any(p_schemas)

  union all
  select 999, 0, '', 'commit;'
),
headers (phase, title) as (
  values (5, 'Schemas used by extensions'),
         (10, 'Extensions'),
         (20, 'Schemas'),
         (30, 'Enum types'),
         (31, 'Domains'),
         (32, 'Composite types'),
         (60, 'Sequences'),
         (70, 'Functions'),
         (80, 'Tables'),
         (81, 'Partitions'),
         (90, 'Sequence ownership'),
         (95, 'Functions that use table row types'),
         (100, 'Primary key / unique / check / exclusion constraints'),
         (110, 'Foreign keys (relationships)'),
         (130, 'Views and materialized views'),
         (140, 'Functions that use view row types'),
         (150, 'Indexes'),
         (160, 'Triggers'),
         (170, 'Row level security'),
         (175, 'Replica identity'),
         (180, 'RLS policies'),
         (189, 'Schema privileges'),
         (190, 'Table, view and sequence privileges'),
         (191, 'Function privileges'),
         (192, 'Column privileges'),
         (200, 'Comments'),
         (209, 'Realtime / publications')
)
select string_agg(x.ddl, E'\n\n' order by x.phase, x.k1, x.k2)
from (
  select phase, k1, k2, ddl from parts
  union all
  select h.phase, -1, '',
         format(E'-- ------------------------------------------------------------\n-- %s\n-- ------------------------------------------------------------', h.title)
  from headers h
  where exists (select 1 from parts p where p.phase = h.phase)
) x;
$fn$;

-- Add any custom schemas you created (e.g. array['public', 'billing']).
-- Do NOT add Supabase-managed schemas (auth, storage, realtime, extensions, ...):
-- a new project already has them.
select pg_temp.export_schema(
  p_schemas              => array['public'],
  p_extra_policy_schemas => array['storage']
) as schema_sql;
