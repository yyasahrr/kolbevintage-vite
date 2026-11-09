#!/usr/bin/env node
// Print an auditable, atomic migration for the previously approved empty demo
// schema. It never connects to a database and contains no credentials or seed.
import {readFile} from 'node:fs/promises';
if(process.argv.length!==3||process.argv[2]!=='--confirm-empty-kolbe-demo'){
 console.error('Usage: node scripts/generate-isolated-demo-schema.mjs --confirm-empty-kolbe-demo');process.exit(1);
}
const schema=await readFile(new URL('../server/src/schema.sql',import.meta.url),'utf8');
if(/\bpublic\s*\./i.test(schema)||/\b(?:create|drop)\s+schema\b/i.test(schema)||/\b(?:create|drop)\s+extension\b/i.test(schema)) throw Error('Unexpected cross-schema migration SQL');
console.log(`-- Kolbe demo only: aborts unless the dedicated schema is empty and private.
-- No demo data, role passwords, storage setup or public tables are modified.
begin;
select pg_advisory_xact_lock(hashtext('kolbe:isolated-demo-schema'));
do $guard$
declare objects integer;
begin
 if not exists(select 1 from pg_namespace where nspname='kolbe_demo') then raise exception 'Dedicated demo schema does not exist'; end if;
 if not exists(select 1 from pg_roles where rolname='kolbe_demo_app' and not rolcanlogin and not rolsuper and not rolcreaterole and not rolcreatedb and not rolbypassrls) then raise exception 'Expected restricted non-login role is missing'; end if;
 if not has_schema_privilege(current_user,'kolbe_demo','CREATE') then raise exception 'Schema owner privileges required'; end if;
 if exists(select 1 from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='kolbe_demo' and a.grantee=0 and a.privilege_type in ('USAGE','CREATE')) or has_schema_privilege('anon','kolbe_demo','USAGE,CREATE') or has_schema_privilege('authenticated','kolbe_demo','USAGE,CREATE') then raise exception 'Demo schema is not private'; end if;
 select (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='kolbe_demo') + (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='kolbe_demo') + (select count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='kolbe_demo' and t.typrelid=0) into objects;
 if objects<>0 then raise exception 'Demo schema is not empty; migration aborted'; end if;
end $guard$;
set local search_path to kolbe_demo;
${schema}
grant select,insert,update,delete on all tables in schema kolbe_demo to kolbe_demo_app;
grant usage,select on all sequences in schema kolbe_demo to kolbe_demo_app;
commit;
`);
