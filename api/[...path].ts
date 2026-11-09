import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';

// The Node runtime must leave the body stream untouched for Fastify multipart.
export const config = { api: { bodyParser: false } };
let starting:Promise<FastifyInstance>|undefined;

async function boot():Promise<FastifyInstance> {
  // This adapter NEVER seeds or migrates a DB during request handling. It also
  // requires a separate schema and distributed limiter, so an accidental deploy
  // can't run against another application or silently weaken rate limits.
  if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1' || !process.env.DATABASE_URL || !process.env.DATABASE_SCHEMA || process.env.RATE_LIMIT_STORE !== 'postgres' || process.env.RATE_LIMIT_SCOPE !== 'global' || process.env.PANEL_OPEN_ACCESS === '1') throw new Error('Backend deployment is not configured safely.');
  const {initDb,query,closeDb}=await import('../server/src/db');
  try {
    await initDb({migrate:false});
    // search_path is not a permission boundary. Refuse an owner/superuser or
    // a role with inherited or direct access to the other application's data.
    const role=await query<{safe:boolean}>(`select (current_user='kolbe_demo_app' and not r.rolsuper and not r.rolcreatedb and not r.rolcreaterole and not r.rolinherit and not r.rolbypassrls and has_schema_privilege(r.oid,current_schema(),'USAGE') and not has_schema_privilege(r.oid,current_schema(),'CREATE') and not exists(select 1 from pg_auth_members m where m.member=r.oid) and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p','v','m') and (has_table_privilege(r.oid,c.oid,'SELECT') or has_table_privilege(r.oid,c.oid,'INSERT') or has_table_privilege(r.oid,c.oid,'UPDATE') or has_table_privilege(r.oid,c.oid,'DELETE'))) and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname not in ('pg_catalog','information_schema','pg_toast') and p.prosecdef and has_schema_privilege(r.oid,n.oid,'USAGE') and has_function_privilege(r.oid,p.oid,'EXECUTE'))) as safe from pg_roles r where r.rolname=current_user`);
    if(!role.rows[0]?.safe)throw new Error('Database role is not isolated.');
    const probe=await query<{ready:boolean}>(`select to_regclass('state_documents') is not null and to_regclass('security_rate_limits') is not null and to_regclass('roles') is not null as ready`);
    if(!probe.rows[0]?.ready)throw new Error('Database schema is not initialized.');
    const docs=await query<{n:number}>("select count(*)::int as n from state_documents where key in ('admin','ops')");
    if(docs.rows[0]?.n!==2)throw new Error('Database documents are not provisioned.');
    const provisioned=await query<{ok:boolean}>("select value->>'kind'='isolated_demo' and value->>'complete'='true' as ok from state_documents where key='demo_provisioning'");
    if(!provisioned.rows[0]?.ok)throw new Error('Demo provisioning has not completed.');
    const roles=await query<{n:number}>("select count(*)::int as n from roles where id='owner' and protected=true");
    if(roles.rows[0]?.n!==1)throw new Error('Database roles are not provisioned.');
    const {buildServer}=await import('../server/src/index');const app=await buildServer({apiOnly:true,skipSeedRbac:true});await app.ready();return app;
  } catch(error) {await closeDb();throw error}
}
function getApp(){if(!starting)starting=boot().catch(error=>{starting=undefined;throw error});return starting}

export default async function handler(req:IncomingMessage,res:ServerResponse) {
  let app:FastifyInstance;try{app=await getApp()}catch{res.statusCode=503;res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');res.end(JSON.stringify({error:'سرویس فروشگاه آماده نیست.',code:'backend_unavailable'}));return}
  await new Promise<void>(resolve=>{
    let settled=false;const done=()=>{if(!settled){settled=true;resolve()}};
    res.once('finish',done);res.once('close',done);
    app.server.emit('request',req,res);
  });
}
