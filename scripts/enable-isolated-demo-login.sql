-- One-time setup for the dedicated, previously created kolbe_demo_app role.
-- Run only in the confirmed demo project, from its SQL editor. The result is a
-- secret: do not share it, save this result, or put it in Git or chat. This
-- never changes postgres's password or grants access to another schema.
-- The function lives only in this SQL session; all checks and ALTER are atomic.
create function pg_temp.enable_kolbe_demo_login() returns text language plpgsql as $setup$
declare
  v_password text;
  v_table record;
  v_nonempty boolean;
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('kolbe:isolated-demo-provision'));
  if not exists (
    select 1 from pg_roles r where r.rolname='kolbe_demo_app'
      and not r.rolcanlogin and not r.rolsuper and not r.rolcreatedb
      and not r.rolcreaterole and not r.rolinherit and not r.rolbypassrls
      and has_schema_privilege(r.oid,'kolbe_demo','USAGE')
      and not has_schema_privilege(r.oid,'kolbe_demo','CREATE')
      and not exists(select 1 from pg_auth_members m where m.member=r.oid)
      and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relkind in ('r','p','v','m')
        and (has_table_privilege(r.oid,c.oid,'SELECT') or has_table_privilege(r.oid,c.oid,'INSERT')
          or has_table_privilege(r.oid,c.oid,'UPDATE') or has_table_privilege(r.oid,c.oid,'DELETE')))
      and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname not in ('pg_catalog','information_schema','pg_toast') and p.prosecdef
          and has_schema_privilege(r.oid,n.oid,'USAGE') and has_function_privilege(r.oid,p.oid,'EXECUTE'))
  ) then raise exception 'Demo role is missing, already enabled, or not isolated'; end if;
  if exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
     where n.nspname='kolbe_demo' and a.grantee=0 and a.privilege_type in ('USAGE','CREATE'))
     or has_schema_privilege('anon','kolbe_demo','USAGE,CREATE')
     or has_schema_privilege('authenticated','kolbe_demo','USAGE,CREATE') then
    raise exception 'Demo schema is not private';
  end if;
  select count(*) into v_count from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='kolbe_demo' and c.relkind in ('r','p');
  if v_count<>39 or to_regclass('kolbe_demo.state_documents') is null or to_regclass('kolbe_demo.roles') is null
     or to_regclass('kolbe_demo.security_rate_limits') is null then raise exception 'Demo schema is incomplete'; end if;
  for v_table in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='kolbe_demo' and c.relkind in ('r','p') loop
    if not (has_table_privilege('kolbe_demo_app',v_table.oid,'SELECT')
      and has_table_privilege('kolbe_demo_app',v_table.oid,'INSERT')
      and has_table_privilege('kolbe_demo_app',v_table.oid,'UPDATE')
      and has_table_privilege('kolbe_demo_app',v_table.oid,'DELETE')) then raise exception 'Demo grants are incomplete'; end if;
    execute format('select exists(select 1 from kolbe_demo.%I)',v_table.relname) into v_nonempty;
    if v_nonempty then raise exception 'Demo schema is not empty'; end if;
  end loop;
  v_password := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  perform set_config('password_encryption','scram-sha-256',true);
  execute format('alter role kolbe_demo_app login password %L',v_password);
  return v_password;
end $setup$;
select pg_temp.enable_kolbe_demo_login() as demo_password;
