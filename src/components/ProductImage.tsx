import { useState, type CSSProperties } from "react";
import { ImageOff } from "lucide-react";

/** A missing merchant image must not silently render an empty/broken img. */
export function ProductImage({src,alt,className,style,lazy=false}:{src?:string;alt:string;className?:string;style?:CSSProperties;lazy?:boolean}) {
  return <ImageForSource key={src} src={src} alt={alt} className={className} style={style} lazy={lazy}/>;
}
function ImageForSource({src,alt,className,style,lazy}:{src?:string;alt:string;className?:string;style?:CSSProperties;lazy:boolean}) {
  const [failed,setFailed]=useState(false);
  if(!src||failed) return <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-paper px-3 text-center text-ink-70" role={alt?"img":undefined} aria-label={alt?`${alt}؛ تصویر در دسترس نیست`:undefined} aria-hidden={alt?undefined:true}><ImageOff size={22} aria-hidden="true"/><span className="text-xs">تصویر در دسترس نیست</span></div>;
  return <img src={src} alt={alt} className={className} style={style} loading={lazy?"lazy":undefined} decoding="async" draggable={false} onError={()=>setFailed(true)}/>;
}
