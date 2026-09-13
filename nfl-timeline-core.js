const CORE='https://sports.core.api.espn.com/v2/sports/football/leagues/nfl';
const V3='https://sports.core.api.espn.com/v3/sports/football/nfl';
const SITE='https://site.api.espn.com/apis/site/v2/sports/football/nfl';
const DB='nflTimelineV6', DBV=1, FALLBACK_START=1920, $=s=>document.querySelector(s), sleep=ms=>new Promise(r=>setTimeout(r,ms));
let P=new Map(), T=new Map(), TL=new Map(), seasons=[], cur=0, view=[], visibleYears=[], running=false, stop=false, showAll=false, queue=null, currentSeed=new Map(), renderRAF=0, uiTimer=0, dbPromise=null;
const CURRENT_TTL=6*60*60*1000, META_RETRY_TTL=7*24*60*60*1000;

function refId(v){return String(v||'').match(/\/(\d+)(?:\?.*)?$/)?.[1]||''}
function addParam(url,k,v){let u=new URL(url);u.searchParams.set(k,v);return u.toString()}
async function rawGet(url,tries=2){for(let i=0;i<=tries;i++){try{let r=await fetch(String(url).replace(/^http:/,'https:'));if(!r.ok)throw Error(`HTTP ${r.status}`);return await r.json()}catch(e){if(i===tries)throw e;await sleep(250*2**i)}}}

class RequestQueue{
 constructor(limit){this.limit=limit;this.active=0;this.pending=[]}
 add(fn){return new Promise((resolve,reject)=>{this.pending.push({fn,resolve,reject});this.pump()})}
 pump(){while(!stop&&this.active<this.limit&&this.pending.length){let j=this.pending.shift();this.active++;Promise.resolve().then(j.fn).then(j.resolve,j.reject).finally(()=>{this.active--;this.pump()})}}
 cancel(){let e=Error('PAUSED');while(this.pending.length)this.pending.shift().reject(e)}
}
const qget=(url,tries=2)=>queue?queue.add(()=>rawGet(url,tries)):rawGet(url,tries);

async function collection(url){
 let first=await qget(addParam(url,'page',1)), items=[...(first.items||[])], pages=Math.max(1,+first.pageCount||1);
 if(pages>1){let rest=await Promise.all(Array.from({length:pages-1},(_,i)=>qget(addParam(url,'page',i+2),1).catch(e=>({__error:e,items:[]}))));
   let failed=rest.filter(x=>x.__error).length;if(failed)throw Error(`${failed}/${pages-1} collection pages failed`);
   for(const p of rest)items.push(...(p.items||[]))
 }
 return {items,count:+first.count||items.length,pages}
}

function openDB(){if(dbPromise)return dbPromise;dbPromise=new Promise((ok,no)=>{let r=indexedDB.open(DB,DBV);r.onupgradeneeded=()=>{let d=r.result;for(const [n,k] of [['players','id'],['teams','key'],['done','key']])if(!d.objectStoreNames.contains(n))d.createObjectStore(n,{keyPath:k})};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});return dbPromise}
async function dbAll(s){let d=await openDB();return new Promise((ok,no)=>{let r=d.transaction(s).objectStore(s).getAll();r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)})}
async function dbGet(s,k){let d=await openDB();return new Promise(ok=>{let r=d.transaction(s).objectStore(s).get(k);r.onsuccess=()=>ok(r.result)})}
async function dbPut(s,o){let d=await openDB();return new Promise((ok,no)=>{let tx=d.transaction(s,'readwrite');tx.objectStore(s).put(o);tx.oncomplete=ok;tx.onerror=()=>no(tx.error)})}
async function dbPutMany(s,a){if(!a.length)return;let d=await openDB();return new Promise((ok,no)=>{let tx=d.transaction(s,'readwrite'),os=tx.objectStore(s);for(const o of a)os.put(o);tx.oncomplete=ok;tx.onerror=()=>no(tx.error)})}

function teamKey(y,id){return `${y}:${id}`}
function teamFor(y,id){return T.get(teamKey(y,id))||TL.get(String(id))||{id:String(id),abbr:String(id),name:String(id),logo:''}}
function normalizeTeam(x,y,idHint=''){
 let id=String(x?.id||idHint||refId(x?.$ref));if(!id)return null;let prev=teamFor(y,id), t={key:teamKey(y,id),id,year:y,abbr:x?.abbreviation||prev.abbr||'',name:x?.displayName||x?.name||prev.name||'',logo:x?.logos?.[0]?.href||x?.logo||prev.logo||''};T.set(t.key,t);let old=TL.get(id);if(!old||(+t.year||0)>=(+old.year||0))TL.set(id,t);return t
}
function blankPlayer(id){return {id:String(id),name:`Player ${id}`,pos:'',head:`https://a.espncdn.com/i/headshots/nfl/players/full/${id}.png`,metaLoaded:false,activeNow:false,currentTeam:'',seasons:{}}}
function applyMeta(p,a){
 if(!a)return p;p.name=a.displayName||a.fullName||p.name;p.pos=a.position?.abbreviation||p.pos;p.head=a.headshot?.href||p.head;
 if(a.active!=null)p.activeNow=!!a.active;let tid=String(a.team?.id||refId(a.team?.$ref)||'');if(p.activeNow&&tid)p.currentTeam=tid;p.metaLoaded=!!(a.displayName||a.fullName);p.metaAt=Date.now();p.metaTryAt=Date.now();return p
}
function associate(id,y,teamId){
 id=String(id);let p=P.get(id)||blankPlayer(id);let seed=currentSeed.get(id);if(seed&&!p.metaLoaded)applyMeta(p,seed);
 let z=p.seasons[y]||[];if(!z.includes(String(teamId)))z.push(String(teamId));p.seasons[y]=z;P.set(id,p);return p
}
function yearsOf(p){return Object.keys(p.seasons||{}).map(Number).sort((a,b)=>a-b)}
function teamsOf(p){return new Set(Object.values(p.seasons||{}).flat()).size}
function isCurrent(p){return !!p.seasons?.[cur]}
function currentTeamOf(p){if(p.currentTeam)return p.currentTeam;let a=p.seasons?.[cur]||[];return a.length===1?a[0]:''}

async function resolveSeasons(){
 try{let d=await rawGet(CORE);cur=+(d.season?.year||refId(d.season?.$ref))||new Date().getFullYear()}catch{cur=new Date().getFullYear()}
 try{let d=await rawGet(`${CORE}/seasons?limit=200`),ys=(d.items||[]).map(x=>+(x.year||refId(x.$ref))).filter(y=>y>=FALLBACK_START&&y<=cur);seasons=[...new Set(ys)].sort((a,b)=>b-a)}
 catch{seasons=Array.from({length:cur-FALLBACK_START+1},(_,i)=>cur-i)}
 if(!seasons.includes(cur))seasons.unshift(cur)
}

async function seedCurrentMetadata(){
 if(currentSeed.size)return;
 try{
  let d=await collection(`${V3}/athletes?active=true&limit=3000`);
  for(const a of d.items){let id=String(a.id||refId(a.$ref));if(id&&(a.displayName||a.fullName))currentSeed.set(id,a)}
 }catch(e){console.warn('current metadata seed failed',e)}
}

async function currentTeamMetadata(y){
 try{let d=await qget(`${SITE}/teams?limit=40`),arr=d.sports?.[0]?.leagues?.[0]?.teams||[],save=[];for(const x of arr){let t=normalizeTeam(x.team,y);if(t)save.push(t)}await dbPutMany('teams',save)}catch(e){console.warn('current teams metadata',e)}
}

async function seasonTeamIds(y){
 let d=await collection(`${CORE}/seasons/${y}/teams?limit=100`), ids=[];
 for(const x of d.items){let id=String(x.id||refId(x.$ref));if(id)ids.push(id)}
 return [...new Set(ids)]
}

async function ensureTeamMeta(y,id){
 let k=teamKey(y,id),cached=T.get(k);if(cached&&!$('#force').checked)return cached;
 if(y===cur&&cached)return cached;
 try{let d=await qget(`${CORE}/seasons/${y}/teams/${id}`,1),t=normalizeTeam(d,y,id);if(t)await dbPut('teams',t);return t}catch(e){console.warn('team metadata',y,id,e);let t=normalizeTeam(null,y,id);if(t)await dbPut('teams',t);return t}
}

async function rosterIds(y,teamId){
 let key=`roster:${y}:${teamId}`,cached=await dbGet('done',key);
 let fresh=cached&&(y!==cur||Date.now()-(cached.at||0)<CURRENT_TTL);if(fresh&&!$('#force').checked&&Array.isArray(cached.athleteIds))return {ids:cached.athleteIds,cached:true,pages:cached.pages||1};
 let d=await collection(`${CORE}/seasons/${y}/teams/${teamId}/athletes?limit=200`),ids=[...new Set(d.items.map(x=>String(x.id||refId(x.$ref))).filter(Boolean))];
 let changed=ids.map(id=>associate(id,y,teamId));await dbPutMany('players',changed);
 await dbPut('done',{key,year:y,teamId,athleteIds:ids,count:ids.length,pages:d.pages,at:Date.now()});
 return {ids,cached:false,pages:d.pages}
}

async function hydratePlayers(ids,y){
 let now=Date.now(),missing=[...new Set(ids)].filter(id=>{let p=P.get(id);return !p?.metaLoaded && (!p?.metaTryAt||now-p.metaTryAt>META_RETRY_TTL) || (y===cur&&$('#force').checked)});
 if(!missing.length)return {needed:0,failed:0};
 let done=0,failed=0,batch=[];
 await Promise.all(missing.map(async id=>{
   let p=P.get(id)||blankPlayer(id);
   try{
     let a;try{a=await qget(`${V3}/athletes/${id}`,1)}catch{a=await qget(`${CORE}/athletes/${id}`,1)}
     applyMeta(p,a)
   }catch(e){failed++;p.metaTryAt=Date.now();console.warn('player metadata',id,e)}
   P.set(id,p);batch.push(p);done++;if(done%50===0)scheduleUI(`${y}: player details ${done}/${missing.length}`)
 }));
 await dbPutMany('players',batch);return {needed:missing.length,failed}
}
function scheduleUI(text=''){
 if(text)$('#status').textContent=text;clearTimeout(uiTimer);uiTimer=setTimeout(()=>{refreshControls();applyFilters(false)},80)
}

async function scanYear(y){
 let ids=await seasonTeamIds(y);if(!ids.length)throw Error('No teams returned');
 if(y===cur)await currentTeamMetadata(y);
 let allIds=new Set(),done=0,fail=0,networkTeams=0,metaJobs=[],rosterJobs=[];
 for(const teamId of ids){
   if(y!==cur)metaJobs.push(ensureTeamMeta(y,teamId));
   rosterJobs.push(rosterIds(y,teamId).then(r=>{
     r.ids.forEach(id=>allIds.add(id));if(!r.cached)networkTeams++;done++;
     $('#prog i').style.width=`${done/ids.length*100}%`;scheduleUI(`${y}: rosters ${done}/${ids.length} • ${allIds.size} players`)
   }).catch(e=>{fail++;done++;console.warn('roster',y,teamId,e);scheduleUI(`${y}: ${done}/${ids.length} rosters • ${fail} failed`)}))
 }
 await Promise.all(rosterJobs);await Promise.allSettled(metaJobs);
 if(stop)return {failed:fail,players:allIds.size};
 let meta=await hydratePlayers([...allIds],y);
 refreshControls();applyFilters(false);
 if(!fail)await dbPut('done',{key:`season:${y}`,complete:true,teams:ids.length,players:allIds.size,at:Date.now()});
 return {failed:fail,players:allIds.size,networkTeams,meta}
}
async function scan(){
 if(running)return;running=true;stop=false;queue=new RequestQueue(+$('#speed').value||24);$('#scan').disabled=true;$('#pause').disabled=false;
 await seedCurrentMetadata();
 let hi=+$('#from').value,lo=+$('#to').value;if(hi<lo)[hi,lo]=[lo,hi];let list=seasons.filter(y=>y<=hi&&y>=lo);
 for(const y of list){if(stop)break;let sd=await dbGet('done',`season:${y}`),complete=sd?.complete&&(y!==cur||Date.now()-(sd.at||0)<CURRENT_TTL);
   if(complete&&!$('#force').checked){
     let ids=[...P.values()].filter(p=>p.seasons?.[y]).map(p=>p.id);await hydratePlayers(ids,y);
     $('#status').textContent=`${y}: cached ✓`;refreshControls();applyFilters(false);continue
   }
   $('#status').textContent=`${y}: loading…`;try{let r=await scanYear(y);if(r.failed)$('#status').textContent=`${y}: ${r.failed} team failure(s), not marked complete`}
   catch(e){console.warn('season',y,e);$('#status').textContent=`${y}: failed, will retry next run`}
   refreshControls();applyFilters(false);await sleep(20)
 }
 await dbPutMany('players',[...P.values()]);running=false;$('#scan').disabled=false;$('#pause').disabled=true;$('#status').textContent=stop?'Paused — resumes at unfinished team':'Complete ✓'
}
