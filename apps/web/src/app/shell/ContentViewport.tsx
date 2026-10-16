import { useEffect,useRef } from 'react';
import type { ReactNode } from 'react';
import { useElementScrollRestoration,useLocation,useRouter } from '@tanstack/react-router';
export interface ContentViewportProps { children: ReactNode }
export function ContentViewport({children}:ContentViewportProps) {
 const ref=useRef<HTMLDivElement>(null),router=useRouter();
 const location=useLocation(),key=location.state.__TSR_key;
 const surfaceSearch=new URLSearchParams(location.searchStr);surfaceSearch.delete('taskId');if(/^\/w\/[^/]+\/projects\/[^/]+\/files$/.test(location.pathname))surfaceSearch.delete('fileId');surfaceSearch.sort();
 const surfaceView=`${location.pathname}?${surfaceSearch}`;
 const previousSurfaceView=useRef<string|null>(null);
 const entry=useElementScrollRestoration({id:'main-content'});
 useEffect(()=>{const preserveSurface=surfaceView===previousSurfaceView.current;previousSurfaceView.current=surfaceView;if(ref.current&&!preserveSurface)ref.current.scrollTop=entry?.scrollY??0;},[key,entry?.scrollY,surfaceView]);
 useEffect(()=>router.subscribe('onResolved',()=>{document.getElementById('sr-live')!.textContent=document.title.replace(' · HoaDev','');}),[router]);
 return <div ref={ref} className="relative min-h-0 flex-1 overflow-auto focus:outline-none" id="main-content" tabIndex={-1} data-scroll-restoration-id="main-content">{children}</div>;
}
