// Build official NHL G/A1/A2 snapshots without browser CORS.
// Node 22+, no packages. NHL_SEASON=2026 optionally selects a historical season.
import fs from 'node:fs';
import path from 'node:path';
const API='https://api-web.nhle.com/v1';
const today=new Date();
const year=today.getUTCFullYear(),nowYear=year-(today.getUTCMonth()<8?1:0);
const season=Number(process.env.NHL_SEASON||nowYear),full=process.env.NHL_FULL_REFRESH==='1';
if(!Number.isInteger(season)||season<2010||season>nowYear)throw Error('Invalid NHL_SEASON');
const dest=path.resolve('data/nhl');fs.mkdirSync(dest,{recursive:true});
const pad=n=>String(n).padStart(2,'0');
const iso=d=>d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());
const day=(s,n)=>iso(new Date(Date.parse(s+'T12:00:00Z')+n*86400000));
const begin=season+'-10-01',end=[(season+1)+'-06-30',iso(today)].sort()[0];
const L=o=>typeof o==='string'?o:o?.default||o?.en||Object.values(o||{})[0]||'';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
// Pace all NHL requests through one queue to avoid CDN rate limits.
let requestGate=Promise.resolve();
function pace(){const turn=requestGate.then(()=>wait(900));requestGate=turn.catch(()=>{});return turn;}
async function get(endpoint){
 let error;
 for(let i=0;i<5;i++){
  try{
   await pace();
   const r=await fetch(API+endpoint,{headers:{accept:'application/json'},signal:AbortSignal.timeout(25000)});
   if(!r.ok)throw Error('HTTP '+r.status);
   return await r.json();
  }catch(e){error=e;if(i<4)await wait(600*(i+1)**2)}
 }
 throw Error(endpoint+' -> '+error.message);
}
async function mapLimit(list,workers,fn){
 let next=0,fail=0,done=0;
 await Promise.all(Array.from({length:Math.min(workers,list.length)},async()=>{
  while(next<list.length){
   const item=list[next++];
   try{await fn(item)}catch(e){fail++;console.error('Failed',String(item?.id||item),e.message)}
   if(++done%30===0||done===list.length)console.log('Progress',done+'/'+list.length);
  }
 }));
 return fail;
}
const months=new Map();
for(let m=1;m<=12;m++){
 const mm=pad(m),file=path.join(dest,season+'-'+mm+'.json');
 if(fs.existsSync(file)){
  try{const data=JSON.parse(fs.readFileSync(file,'utf8'));if(data.season===season&&Array.isArray(data.games))months.set(mm,new Map(data.games.map(g=>[String(g.id),g])))}catch(e){console.warn('Unusable cache',file,e.message)}
 }
}
const firstRun=!months.size,scan=(firstRun||full)?begin:[begin,day(iso(today),-15)].sort().at(-1);
if(scan>end){console.log('Season not yet underway; no data.');process.exit(0)}
const weekDays=[];
for(let d=scan;d<=end;d=day(d,7))weekDays.push(d);
const games=new Map();
const scheduleErrors=await mapLimit(weekDays,3,async d=>{
 const data=await get('/schedule/'+d);
 for(const w of data.gameWeek||[])for(const g of w.games||[]){
  const date=g.gameDate||w.date||'';
  if(date<scan||date>end||Number(g.gameType)!==2||!g.id)continue;
  if(!['OFF','FINAL','LIVE','CRIT','COMPLETED'].includes(g.gameState))continue;
  const home=g.homeTeam?.abbrev,away=g.awayTeam?.abbrev;
  if(home&&away)games.set(String(g.id),{id:String(g.id),date,home,away,homeId:g.homeTeam.id,awayId:g.awayTeam.id,state:g.gameState});
 }
});
if(scheduleErrors)throw Error(scheduleErrors+' schedule requests failed. No incomplete data published.');
// Situation code is [home goalie, HOME skaters, AWAY skaters, away goalie].
// Use skaters relative to the SCORING team and reject empty-net/extra-attacker
// situations so five manpower lanes represent genuine on-ice strength.
function classifyManpower(s,owner,homeId,awayId){
 s=String(s||'');
 if(!/^[01][3456][3456][01]$/.test(s))return 'UNK';
 if(s[0]!=='1'||s[3]!=='1'||Number(s[1])>5||Number(s[2])>5)return 'OTHER';
 const h=String(owner)===String(homeId),a=String(owner)===String(awayId);
 if(!h&&!a)return 'UNK';
 const ours=Number(h?s[1]:s[2]),theirs=Number(h?s[2]:s[1]);
 return ({'-2':'SH2','-1':'SH1','0':'EV','1':'PP1','2':'PP2'})[String(ours-theirs)]||'OTHER';
}
function strengthFromManpower(manpower){
 return manpower==='EV'?'EV':manpower.startsWith('PP')?'PP':manpower.startsWith('SH')?'SH':'UNK';
}
function normalize(pbp,g){
 const homeId=pbp.homeTeam?.id??g.homeId,awayId=pbp.awayTeam?.id??g.awayId;
 const players={};
 for(const p of pbp.rosterSpots||[]){
  const id=String(p.playerId||p.id||'');if(!id)continue;
  const name=(L(p.firstName)+' '+L(p.lastName)).trim()||L(p.name)||'Player '+id;
  const team=String(p.teamId)===String(homeId)?g.home:String(p.teamId)===String(awayId)?g.away:g.home;
  players[id]={id,name,team};
 }
 const goals=[];
 for(const play of pbp.plays||[]){
  if(play.typeDescKey!=='goal')continue;
  const d=play.details||{};
  const team=String(d.eventOwnerTeamId)===String(homeId)?g.home:String(d.eventOwnerTeamId)===String(awayId)?g.away:null;
  if(!team||d.scoringPlayerId==null)continue;
  const scorer=String(d.scoringPlayerId),a1=d.assist1PlayerId==null?null:String(d.assist1PlayerId),a2=d.assist2PlayerId==null?null:String(d.assist2PlayerId);
  for(const id of [scorer,a1,a2])if(id&&!players[id])players[id]={id,name:'Player '+id,team};
  goals.push({id:String(play.eventId??play.sortOrder??goals.length),gameId:g.id,date:g.date,home:g.home,away:g.away,team,period:play.periodDescriptor?.number||1,time:play.timeInPeriod||'',scorer,a1,a2,strength:strengthFromManpower(classifyManpower(play.situationCode,d.eventOwnerTeamId,homeId,awayId)),manpower:classifyManpower(play.situationCode,d.eventOwnerTeamId,homeId,awayId),situationCode:String(play.situationCode||''),score:d.homeScore==null||d.awayScore==null?'':d.awayScore+'–'+d.homeScore});
 }
 return {id:g.id,date:g.date,home:g.home,away:g.away,homeId,awayId,state:g.state,players,goals,cachedAt:Date.now()};
}
const todo=[...games.values()].filter(g=>{
 const old=months.get(g.date.slice(5,7))?.get(g.id);
 return !old||full||!['OFF','FINAL','COMPLETED'].includes(old.state)||(old.goals||[]).some(goal=>!('manpower' in goal)||!('situationCode' in goal));
});
console.log('Season',season,'range',scan,end,'games',games.size,'to update',todo.length);
const touched=new Set();
const gameErrors=await mapLimit(todo,4,async g=>{
 const pbp=await get('/gamecenter/'+g.id+'/play-by-play');
 const mm=g.date.slice(5,7);
 if(!months.has(mm))months.set(mm,new Map());
 months.get(mm).set(g.id,normalize(pbp,g));touched.add(mm);
});
for(const mm of touched){
 const entries=[...months.get(mm).values()].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
 const file=path.join(dest,season+'-'+mm+'.json');
 fs.writeFileSync(file,JSON.stringify({schema:1,season,month:mm,updatedAt:new Date().toISOString(),games:entries})+'\n');
 console.log('Saved',file,entries.length,'games');
}
if(gameErrors){console.error(gameErrors,'play-by-play requests failed. Missing games retry next run.');if(!touched.size)process.exitCode=1}
console.log('Completed: updated',touched.size,'months.');
