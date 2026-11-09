import { promises as fs } from 'node:fs';
import path from 'node:path';
import type {FastifyInstance,FastifyReply} from 'fastify';
import {ROOT} from '../config';
import {panelPath,validPanelPath} from '../panel-path';

/** The HTML is only an application shell; every privileged API still checks
 * sessions and permissions. Rewrites preserve the address in the browser. */
export async function panelEntryRoutes(app:FastifyInstance){
  async function respond(requested:unknown,reply:FastifyReply){
    reply.header('cache-control','no-store');
    if(!validPanelPath(requested) || requested!==await panelPath())return reply.code(404).send({error:'not found'});
    try {return reply.type('text/html; charset=utf-8').send(await fs.readFile(path.join(ROOT,'server/panel-static/index.html')))}
    catch{return reply.code(503).send({error:'پنل مدیریت آماده نیست.',code:'panel_unavailable'})}
  }
  app.get('/api/internal/panel-default',(_req,reply)=>respond('/panel',reply));
  app.get<{Querystring:{slug?:unknown}}>('/api/internal/panel-custom',(req,reply)=>{
    const slug=req.query.slug;
    return respond(typeof slug==='string' ? `/manage/${slug}` : null,reply);
  });
}
