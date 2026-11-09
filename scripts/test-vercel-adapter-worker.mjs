import http from 'node:http';import handler from '../api/[...path].ts';
const server=http.createServer((req,res)=>void handler(req,res));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));process.send({port:server.address().port});process.on('message',message=>{if(message==='enable'){process.env.RATE_LIMIT_SCOPE='global';process.send('enabled')}});
