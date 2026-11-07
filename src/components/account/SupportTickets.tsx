import { useCallback, useEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { formatJalali } from "@/utils/date";

type Summary={id:string;subject:string;status:"open"|"answered"|"closed";updatedAt:string};
type Ticket=Summary & {messages:{role:"customer"|"staff";text:string;at:string}[]};
const status=(value:Summary["status"])=>({open:"در انتظار پاسخ",answered:"پاسخ داده شده",closed:"بسته شده"})[value];
const key=()=>crypto.randomUUID();
export function SupportTickets() {
  const [tickets,setTickets]=useState<Summary[]|null>(null),[selected,setSelected]=useState<Ticket|null>(null),[subject,setSubject]=useState(""),[message,setMessage]=useState(""),[reply,setReply]=useState("");
  const [cursor,setCursor]=useState<string|null>(null);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const createKey=useRef(key()),replyKey=useRef(key()),lock=useRef(false);
  const load=useCallback(async()=>{try{const data=await api.get<{tickets:Summary[];nextCursor:string|null}>('/api/support/tickets');setTickets(data.tickets);setCursor(data.nextCursor);setError("")}catch{setTickets(null);setError('دریافت درخواست‌ها ناموفق بود؛ دوباره تلاش کنید.')}},[]);
  useEffect(()=>{void load()},[load]);
  async function more(){if(!cursor||busy)return;setBusy(true);try{const data=await api.get<{tickets:Summary[];nextCursor:string|null}>(`/api/support/tickets?before=${encodeURIComponent(cursor)}`);setTickets(previous=>[...(previous??[]),...data.tickets]);setCursor(data.nextCursor)}catch{setError('دریافت درخواست‌های قدیمی‌تر ناموفق بود.')}finally{setBusy(false)}}
  async function open(id:string){setError("");try{const data=await api.get<{ticket:Ticket}>(`/api/support/tickets/${encodeURIComponent(id)}`);setSelected(data.ticket);setReply("");replyKey.current=key()}catch{setError('دریافت گفتگو ناموفق بود؛ دوباره تلاش کنید.')}}
  async function create(e:React.FormEvent){e.preventDefault();if(lock.current)return;lock.current=true;setBusy(true);setError("");setNotice("");
    try{const data=await api.post<{ticket:Ticket}>('/api/support/tickets',{subject,message,requestKey:createKey.current});setSubject("");setMessage("");createKey.current=key();setSelected(data.ticket);setNotice('درخواست ثبت شد؛ پاسخ در همین صفحه نمایش داده می‌شود.');await load()}
    catch(err){setError(err instanceof ApiError&&err.status<500?err.message:'نتیجه نامشخص است؛ بدون تغییر متن دوباره تلاش کنید یا فهرست را تازه کنید.')}
    finally{lock.current=false;setBusy(false)}}
  async function send(e:React.FormEvent){e.preventDefault();if(lock.current||!selected)return;lock.current=true;setBusy(true);setError("");setNotice("");
    try{const data=await api.post<{ticket:Ticket}>(`/api/support/tickets/${encodeURIComponent(selected.id)}/messages`,{message:reply,requestKey:replyKey.current});setSelected(data.ticket);setReply("");replyKey.current=key();setNotice('پیام ثبت شد.');await load()}
    catch(err){setError(err instanceof ApiError&&err.status<500?err.message:'نتیجه نامشخص است؛ بدون تغییر متن دوباره تلاش کنید یا گفتگو را تازه کنید.')}
    finally{lock.current=false;setBusy(false)}}
  return <>
    <section className="acc-card"><header><h3><MessageSquare width={15} height={15}/> درخواست پشتیبانی</h3><button type="button" className="acc-link" onClick={()=>void load()}>تازه‌سازی</button></header>
      <p className="acc-muted">پیام‌ها در همین حساب قابل پیگیری‌اند. اعلان پیامکی یا ایمیلی ارسال نمی‌شود؛ اطلاعات حساس مانند رمز و شماره کارت نفرستید.</p>
      <form className="acc-return-form" onSubmit={create}><label className="acc-field">موضوع<input aria-label="موضوع درخواست" required maxLength={160} value={subject} disabled={busy} onChange={e=>{setSubject(e.target.value);createKey.current=key()}}/></label><label className="acc-field">پیام<textarea aria-label="پیام درخواست" required maxLength={4000} rows={4} value={message} disabled={busy} onChange={e=>{setMessage(e.target.value);createKey.current=key()}}/></label><button className="acc-btn is-primary" disabled={busy}>{busy?'در حال ثبت…':'ثبت درخواست پشتیبانی'}</button></form>
      {error&&<p role="alert" className="acc-muted">{error}</p>}{notice&&<p role="status" className="acc-muted">{notice}</p>}
    </section>
    <section className="acc-card"><header><h3>درخواست‌های من</h3></header><p className="acc-muted">درخواست‌ها بر اساس زمان ثبت نمایش داده می‌شوند.</p>
      {tickets===null?<p className="acc-muted">فهرست در دسترس نیست.</p>:tickets.length===0?<p className="acc-muted">درخواستی ثبت نشده است.</p>:<ul className="acc-orders">{tickets.map(t=><li key={t.id}><div className="acc-order-row"><div><b>{t.subject}</b><p className="acc-muted">{formatJalali(t.updatedAt)} · {status(t.status)}</p></div><button type="button" className="acc-link" onClick={()=>void open(t.id)}>مشاهده گفتگو</button></div></li>)}</ul>}{cursor&&<button type="button" className="acc-link" disabled={busy} onClick={()=>void more()}>درخواست‌های قدیمی‌تر</button>}
    </section>
    {selected&&<section className="acc-card"><header><h3>{selected.subject}</h3><button type="button" className="acc-link" onClick={()=>void open(selected.id)}>تازه‌سازی گفتگو</button></header><p className="acc-muted">{status(selected.status)}</p><ul className="acc-orders">{selected.messages.map((m,i)=><li key={`${m.at}-${i}`}><b>{m.role==='staff'?'پشتیبانی':'شما'}</b><p className="acc-muted whitespace-pre-wrap break-words">{m.text}</p><small>{formatJalali(m.at)}</small></li>)}</ul>
      {selected.status==='closed'?<p className="acc-muted">این گفتگو بسته است؛ برای موضوع جدید درخواست تازه ثبت کنید.</p>:<form className="acc-return-form" onSubmit={send}><label className="acc-field">پاسخ شما<textarea aria-label="پاسخ شما" required maxLength={4000} rows={3} value={reply} disabled={busy} onChange={e=>{setReply(e.target.value);replyKey.current=key()}}/></label><button className="acc-btn" disabled={busy}>ارسال پاسخ</button></form>}
    </section>}
  </>;
}
