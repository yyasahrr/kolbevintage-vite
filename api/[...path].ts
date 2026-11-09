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
    const probe=await query<{ready:boolean}>(`select to_regclass('state_documents') is not null and to_regclass('security_rate_limits') is not null and to_regclass('roles') is not null as ready`);
    if(!probe.rows[0]?.ready)throw new Error('Database schema is not initialized.');
    const docs=await query<{n:number}>("select count(*)::int as n from state_documents where key in ('admin','ops')");
    if(docs.rows[0]?.n!==2)throw new Error('Database documents are not provisioned.');
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
