/* Highlight Radar video previews, browser-only. v1 */
(function(){
"use strict";
const ROOT=document.getElementById("games"),CAL=document.getElementById("calendar");
if(!ROOT||!CAL)return;
const ENDPOINTS=["https://inv.nadeko.net","https://invidious.tiekoetter.com","https://invidious.nerdvpn.de","https://yt.chocolatemoo53.com"];
const results=new Map(),revealed=new Set(),suppressed=new Set(),queued=new Set(),tasks=[];
let active=0,frame=0,observer=null,lastDate=CAL.value;
function clean(s){return String(s||"").trim()}
function html(s){return clean(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function info(card){
 const teams=Array.from(card.querySelectorAll(".matchup .team b")).map(n=>clean(n.textContent));
 if(teams.length!==2)return null;
 const league=clean(card.querySelector(".league-tag")?.textContent);
 const date=CAL.value;
 if(!date||!league)return null;
 const key=JSON.stringify([date,league,...teams]);
 const pretty=new Date(date+"T12:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"});
 return {card,key,teams,league,date,query:teams[0]+" vs "+teams[1]+" "+pretty+" "+league+" full game highlights"};
}
function sourceKey(info){return "radar-videos-v1:"+info.key}
function cacheRead(i){
 try{const v=JSON.parse(localStorage.getItem(sourceKey(i)));if(v&&v.expiry>Date.now()&&v.data?.status!=="error")return v.data}catch(e){}
 return null;
}
function cacheWrite(i,data){
 if(data.status==="error")return;
 try{localStorage.setItem(sourceKey(i),JSON.stringify({expiry:Date.now()+(data.status==="ready"?3*864e5:15*60e3),data}))}catch(e){}
}
function safeVideo(r){
 if(!r||r.type!=="video"||!/^[a-zA-Z0-9_-]{11}$/.test(String(r.videoId||"")))return null;
 const id=r.videoId;
 return {status:"ready",title:clean(r.title).slice(0,200)||"YouTube video",author:clean(r.author).slice(0,110),url:"https://www.youtube.com/watch?v="+id,thumbnail:"https://i.ytimg.com/vi/"+id+"/mqdefault.jpg"};
}
async function lookup(i){
 const previous=cacheRead(i);if(previous)return previous;
 let available=false;
 for(const host of ENDPOINTS){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),3500);
  try{
   const url=host+"/api/v1/search?q="+encodeURIComponent(i.query)+"&type=video&sort_by=relevance";
   const response=await fetch(url,{mode:"cors",cache:"no-store",signal:controller.signal});
   if(!response.ok)throw Error("search unavailable");
   const data=await response.json();
   if(!Array.isArray(data))throw Error("unexpected data");
   available=true;
   const candidate=data.map(safeVideo).find(Boolean);
   if(candidate){cacheWrite(i,candidate);return candidate}
  }catch(e){}finally{clearTimeout(timeout)}
 }
 const fallback={status:available?"empty":"error"};
 cacheWrite(i,fallback);return fallback;
}
function isShown(i){return !suppressed.has(i.key)&&(revealed.has(i.key)||i.card.classList.contains("revealed"))}
function searchLink(i){return "https://www.youtube.com/results?search_query="+encodeURIComponent(i.query)}
function render(i){
 const el=i.card.querySelector(".hr-video");
 if(!el)return;
 const data=results.get(i.key),show=isShown(i),ready=data?.status==="ready";
 const art=el.querySelector(".hr-thumb"),meta=el.querySelector(".hr-meta"),btn=el.querySelector(".hr-reveal"),watch=el.querySelector(".hr-watch");
 if(!art||!meta||!btn||!watch)return;
 // Protect against image/title spoilers: no sensitive video content enters the visual DOM until revealed.
 if(show&&ready){
  art.innerHTML='<a href="'+html(data.url)+'" target="_blank" rel="noopener noreferrer" aria-label="Watch YouTube highlights"><img alt="Video preview" loading="lazy" src="'+html(data.thumbnail)+'"><span class="hr-play">▶</span></a>';
  meta.innerHTML='<strong>'+html(data.title)+'</strong><small>'+html(data.author)+" · Public search match</small>";
  watch.href=data.url;watch.hidden=false;
 }else{
  art.innerHTML='<div class="hr-locked"><span>▶</span>'+(show?"Preview unavailable":"Thumbnail hidden")+'</div>';
  const msg=data?.status==="loading"?"Looking for a video…":data?.status==="error"?"Preview service unavailable":data?.status==="empty"?"No video match found":"Spoiler-free preview";
  meta.innerHTML='<strong>'+(show?"No video preview found":"Video title hidden")+'</strong><small>'+html(msg)+'</small>';
  watch.hidden=true;
 }
 btn.textContent=show?"Hide preview":"Reveal preview";
 btn.setAttribute("aria-pressed",String(show));
}
function renderKey(key){
 ROOT.querySelectorAll(".game").forEach(card=>{
  const i=info(card);if(i&&i.key===key)render(i);
 });
}
function pump(){
 while(active<3&&tasks.length){
  const i=tasks.shift();queued.delete(i.key);
  if(results.get(i.key)?.status!=="loading")continue;
  active++;
  (async()=>{
   try{results.set(i.key,await lookup(i))}
   catch(e){results.set(i.key,{status:"error"})}
   finally{active--;renderKey(i.key);pump()}
  })();
 }
}
function queue(i){
 if(results.has(i.key)||queued.has(i.key))return;
 const cached=cacheRead(i);
 if(cached){results.set(i.key,cached);render(i);return}
 results.set(i.key,{status:"loading"});queued.add(i.key);tasks.push(i);pump();
}
function process(){
 if(CAL.value!==lastDate){lastDate=CAL.value;revealed.clear();suppressed.clear()}
 if(observer)observer.disconnect();
 observer=typeof IntersectionObserver==="function"?new IntersectionObserver(entries=>{
  entries.forEach(e=>{
   if(!e.isIntersecting)return;observer.unobserve(e.target);
   const card=e.target.closest(".game"),i=card&&info(card);if(i)queue(i);
  });
 },{rootMargin:"280px 0px"}):null;
 const cards=Array.from(ROOT.querySelectorAll(".game"));
 let n=0;
 for(const card of cards){
  if(!card.querySelector(".gamehead")||!card.querySelector(".gamehead")?.textContent?.includes("Completed"))continue;
  const i=info(card);if(!i)continue;
  let tile=card.querySelector(".hr-video");
  if(!tile){
   tile=document.createElement("section");tile.className="hr-video";tile.setAttribute("aria-label","First highlight video result");
   tile.innerHTML='<div class="hr-thumb"></div><div class="hr-video-info"><div class="hr-kicker">▶ YOUTUBE HIGHLIGHTS</div><div class="hr-meta"></div><div class="hr-video-actions"><button type="button" class="hr-reveal" aria-pressed="false">Reveal preview</button><a class="hr-watch" target="_blank" rel="noopener noreferrer" hidden>Watch video</a><a class="hr-search" target="_blank" rel="noopener noreferrer">Search YouTube</a></div></div>';
   card.appendChild(tile);
  }
  tile.querySelector(".hr-search").href=searchLink(i);
  tile.querySelector(".hr-reveal").onclick=()=>{if(isShown(i)){revealed.delete(i.key);suppressed.add(i.key)}else{suppressed.delete(i.key);revealed.add(i.key)}render(i)};
  render(i);
  if(observer)observer.observe(tile);else if(n++<10)queue(i);
 }
}
const mutation=new MutationObserver(()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;process()})});
mutation.observe(ROOT,{childList:true,subtree:false});
document.getElementById("spoilerBtn")?.addEventListener("click",()=>{if(!document.getElementById("spoilerBtn")?.classList.contains("off")){revealed.clear();suppressed.clear()}requestAnimationFrame(process)});
process();
})();