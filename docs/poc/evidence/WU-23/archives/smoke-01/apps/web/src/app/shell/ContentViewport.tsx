import { useEffect,useRef } from 'react';
import type { ReactNode } from 'react';
import { useElementScrollRestoration,useLocation,useRouter } from '@tanstack/react-router';
export function ContentViewport({children}:{children:ReactNode}) {
 const ref=useRef<HTMLDivElement>(null),router=useRouter();
 const location=useLocation(),key=location.state.__TSR_key;
 const fileSearch=new URLSearchParams(location.searchStr);fileSearch.delete('fileId');fileSearch.sort();
 const filesView=/^\/w\/[^/]+\/projects\/[^/]+\/files$/.test(location.pathname)?`${location.pathname}?${fileSearch}`:null;
 const previousFilesView=useRef<string|null>(null);
 const entry=useElementScrollRestoration({id:'main-content'});
 useEffect(()=>{const preserveFilesView=filesView!==null&&filesView===previousFilesView.current;previousFilesView.current=filesView;if(ref.current&&!preserveFilesView)ref.current.scrollTop=entry?.scrollY??0;},[key,entry?.scrollY,filesView]);
 useEffect(()=>router.subscribe('onResolved',()=>{document.getElementById('sr-live')!.textContent=document.title.replace(' · Gr8r Studio','');}),[router]);
 return <div ref={ref} className="relative min-h-0 flex-1 overflow-auto focus:outline-none" id="main-content" tabIndex={-1} data-scroll-restoration-id="main-content">{children}</div>;
}
