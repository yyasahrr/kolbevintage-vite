/** Server-side allowlist for the visual editor's serialized component tree. */
export type VisualNode = { type: string; props: Record<string, unknown> & { id: string } };
export type VisualData = { root: { props: Record<string, never> }; content: VisualNode[] };
const spec: Record<string, Record<string, 'text'|'long'|'url'|'image'|'color'|'align'|'size'|'space'|'count'|'slot'|'responsiveSize'|'responsiveSpace'>> = {
  Heading:{text:'text',size:'size',sizeTablet:'responsiveSize',sizeMobile:'responsiveSize',color:'color',align:'align'},
  Text:{text:'long',color:'color',align:'align'},
  Image:{url:'image',alt:'text'}, Video:{url:'image',poster:'image',label:'text'},
  Button:{text:'text',url:'url',align:'align',background:'color',color:'color'},
  Spacer:{height:'space'}, Divider:{color:'color'},
  Hero:{heading:'text',text:'long',image:'image',buttonText:'text',url:'url',align:'align'},
  Products:{heading:'text',count:'count'}, Categories:{heading:'text',count:'count'},
  Section:{background:'color',padding:'space',paddingTablet:'responsiveSpace',paddingMobile:'responsiveSpace',content:'slot'},
  Columns:{left:'slot',right:'slot'},
};
const isObj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function safeUrl(v:string, media:boolean) {
  if(!v) return true;
  if(/[\u0000-\u0020\\]/.test(v))return false;
  if(v.startsWith('/'))return !v.startsWith('//')&&(!media||/^\/uploads\/[a-zA-Z0-9._-]+$/.test(v));
  try {const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}
}
/** Throws a generic error to avoid echoing untrusted content to clients/logs. */
export function validateVisual(value:unknown):VisualData {
  const invalid=():never=>{throw new Error('invalid_visual_data')};
  if(!isObj(value)||Object.keys(value).some(k=>!['root','content'].includes(k))||!isObj(value.root)||Object.keys(value.root).some(k=>k!=='props')||!isObj(value.root.props)||Object.keys(value.root.props).length) return invalid();
  let count=0;const ids=new Set<string>();
  function nodes(raw:unknown,depth:number):VisualNode[]{
    if(!Array.isArray(raw)||depth>5) return invalid();
    return raw.map(item=>{
      if(++count>100||!isObj(item)||Object.keys(item).some(k=>!['type','props'].includes(k))||typeof item.type!=='string'||!Object.prototype.hasOwnProperty.call(spec,item.type)||!isObj(item.props))return invalid();
      const props=item.props;const fields=spec[item.type];
      if(Object.keys(props).some(k=>k!=='id'&&!Object.prototype.hasOwnProperty.call(fields,k))||typeof props.id!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(props.id)||ids.has(props.id))return invalid();
      ids.add(props.id);const result:Record<string,unknown>&{id:string}={id:props.id};
      for(const [key,kind] of Object.entries(fields)){
        const v=props[key];
        if(v===undefined&&(kind==='responsiveSize'||kind==='responsiveSpace'))continue; // old visual documents remain valid
        if(kind==='slot'){result[key]=nodes(v,depth+1);continue;}
        if(['text','long','url','image','color','align'].includes(kind)){
          if(typeof v!=='string'||v.length>(kind==='long'?2000:kind==='url'||kind==='image'?2000:160))return invalid();
          if((kind==='url'||kind==='image')&&!safeUrl(v,kind==='image'))return invalid();
          if(kind==='color'&&!/^#[0-9a-f]{6}$/i.test(v))return invalid();
          if(kind==='align'&&!['right','center','left'].includes(v))return invalid();
          result[key]=v;
        }else{
          const max=kind==='size'||kind==='responsiveSize'?96:kind==='count'?12:240;const min=kind==='size'?12:kind==='count'?1:kind==='responsiveSpace'?-1:0;
          if(kind==='responsiveSize'&&v!==0&&(typeof v!=='number'||v<12))return invalid();
          if(typeof v!=='number'||!Number.isInteger(v)||v<min||v>max)return invalid();result[key]=v;
        }
      }
      return {type:item.type,props:result};
    });
  }
  return {root:{props:{}},content:nodes(value.content,0)};
}
