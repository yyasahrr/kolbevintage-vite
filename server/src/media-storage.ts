import {promises as fs} from 'node:fs';
import path from 'node:path';
import {config} from './config';
import {CommerceError} from './commerce/errors';

// Only generated safe filenames and re-encoded images / signature-checked
// videos reach this module. In serverless, the writable disk is ephemeral and
// must not be treated as durable storage.
type StoredMedia={url:string;discard:()=>Promise<void>};
const unavailable=()=>new CommerceError('ذخیره‌سازی پایدار رسانه در دسترس نیست.',503,'media_storage_unavailable');
function supabaseConfig(){
  const base=process.env.SUPABASE_STORAGE_URL??'', bucket=process.env.SUPABASE_STORAGE_BUCKET??'', key=process.env.SUPABASE_STORAGE_SECRET??'';
  let u:URL;try{u=new URL(base)}catch{throw unavailable()}
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash||!/^([a-z0-9-]+)\.supabase\.co$/i.test(u.hostname)||!/^[-a-z0-9_]{3,63}$/.test(bucket)||!key)throw unavailable();
  return {base:u.origin,bucket,key};
}
export async function storeMedia(filename:string,bytes:Buffer,contentType:string):Promise<StoredMedia>{
  if(!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,200}$/.test(filename)||!['image/webp','video/mp4','video/webm','video/quicktime'].includes(contentType)||!bytes.length)throw unavailable();
  const backend=process.env.MEDIA_BACKEND??'local';
  if(backend==='local'){
    if(process.env.VERCEL==='1')throw unavailable();
    await fs.mkdir(config.uploadsDir,{recursive:true});const file=path.join(config.uploadsDir,filename);await fs.writeFile(file,bytes,{flag:'wx'});
    return {url:`/uploads/${filename}`,discard:async()=>{await fs.unlink(file).catch(()=>undefined)}};
  }
  if(backend!=='supabase')throw unavailable();
  const {base,bucket,key}=supabaseConfig();const objectUrl=`${base}/storage/v1/object/${bucket}/${filename}`;
  let response:Response;
  try{response=await fetch(objectUrl,{method:'POST',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':contentType,'x-upsert':'false'},body:new Uint8Array(bytes),redirect:'error',signal:AbortSignal.timeout(30000)})}catch{throw unavailable()}
  if(!response.ok)throw unavailable();
  return {url:`${base}/storage/v1/object/public/${bucket}/${filename}`,discard:async()=>{try{await fetch(`${base}/storage/v1/object/${bucket}`,{method:'DELETE',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json'},body:JSON.stringify({prefixes:[filename]}),redirect:'error',signal:AbortSignal.timeout(10000)})}catch{/* An orphan may require independent cleanup. */}}};
}
