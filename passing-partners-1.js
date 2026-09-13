'use strict';

const BASE='https://site.api.espn.com/apis/site/v2/sports/football/nfl';
// ESPN is the source, so keep ESPN/current abbreviations as canonical.
const TEAM_ALIASES={WAS:'WSH',LA:'LAR',JAC:'JAX'};
const els=Object.fromEntries(['anchor','scope','season','seasonEnd','endWrap','seasonType','week','sortBy','teamFilter','positionFilter','minTD','activeOnly','multiOnly','search','compare','load','export','status','fill','pct','note','stats','sRows','sRowsLabel','sPartners','sPairs','sOfficial','sMissing','sGames','sUpdated','diag','topPairs','matrix','empty','modal','modalTitle','modalBody','modalClose'].map(id=>[id,document.getElementById(id)]));
let model=null,busy=false,lastRenderedRows=[];
const now=new Date();
const currentYear=now.getFullYear();

for(let y=currentYear;y>=1999;y--){for(const el of [els.season,els.seasonEnd]){const o=document.createElement('option');o.value=y;o.textContent=y;el.appendChild(o)}}
els.season.value=String(currentYear);els.seasonEnd.value=String(currentYear);

function regularSeasonWeeks(year){return Number(year)>=2021?18:17}
function rebuildWeekOptions(){
  const year=Number(els.season.value),type=els.seasonType.value,prev=els.week.value||'ALL';
  els.week.innerHTML='';
  const all=document.createElement('option');all.value='ALL';all.textContent='All Weeks';els.week.appendChild(all);
  if(type!=='ALL'){
    const max=Number(type)===2?regularSeasonWeeks(year):5;
    for(let w=1;w<=max;w++){const o=document.createElement('option');o.value=String(w);o.textContent=Number(type)===2?`Week ${w}`:`Post ${w}`;els.week.appendChild(o)}
    if([...els.week.options].some(o=>o.value===prev))els.week.value=prev;
  }
  if(type==='ALL')els.week.value='ALL';
}
rebuildWeekOptions();
function updateScopeUI(){const range=els.scope.value==='range';els.endWrap.classList.toggle('hiddenCtl',!range);els.week.disabled=range;if(range)els.week.value='ALL'}
updateScopeUI();

const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const teamNorm=t=>TEAM_ALIASES[String(t||'').toUpperCase()]||String(t||'').toUpperCase();
const cleanName=s=>String(s||'').replace(/\s+/g,' ').replace(/\s+(Jr\.|Sr\.|II|III|IV)$/i,'').trim();
const normName=s=>cleanName(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const idVal=v=>String(v??'').trim();
const num=v=>{const n=Number(String(v??'').replace(/,/g,''));return Number.isFinite(n)?n:0};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const keyFor=(id,name)=>idVal(id)||normName(name);
const headshotFor=p=>p?.headshot||(p?.id?`https://a.espncdn.com/i/headshots/nfl/players/full/${encodeURIComponent(p.id)}.png`:'');
const teamLogoFor=t=>t?`https://a.espncdn.com/i/teamlogos/nfl/500/${teamNorm(t).toLowerCase()}.png`:'';

function setStatus(text,pct=null,tone=''){
  els.status.textContent=text;els.status.className='statusText '+tone;
  if(pct!=null){const p=Math.max(0,Math.min(100,pct));els.fill.style.width=p+'%';els.pct.textContent=Math.round(p)+'%'}
}

async function fetchJSON(url,{signal,retries=2}={}){
  let last;
  for(let i=0;i<=retries;i++){
    try{
      const r=await fetch(url,{signal,cache:'no-store',headers:{Accept:'application/json,text/plain,*/*'}});
      if(!r.ok){const e=new Error(`${r.status} ${r.statusText}`);const retryAfter=Number(r.headers.get('retry-after'));e.retryDelay=Number.isFinite(retryAfter)&&retryAfter>0?retryAfter*1000:0;throw e}
      const text=await r.text();
      try{return JSON.parse(text)}catch{throw new Error('ESPN returned non-JSON data')}
    }catch(e){
      last=e;if(signal?.aborted)throw e;
      if(i<retries){const delay=e?.retryDelay||Math.min(4000,500*(2**i))+Math.floor(Math.random()*180);await sleep(delay)}
    }
  }
  throw new Error(`Failed to fetch ${url}: ${last?.message||last}`);
}

async function mapLimit(items,limit,worker){
  const out=new Array(items.length);let next=0;
  const runners=Array.from({length:Math.min(limit,items.length||1)},async()=>{
    while(true){const i=next++;if(i>=items.length)return;try{out[i]=await worker(items[i],i)}catch(e){out[i]={__error:e,item:items[i]}}}
  });
  await Promise.all(runners);return out;
}

function scoreboardEvents(payload){return Array.isArray(payload?.events)?payload.events:[]}

async function loadEvents(year,seasonType,weekFilter,signal,progressCb){
  // ESPN's historical scoreboard is most reliable when the season year is supplied through
  // dates=YYYY together with seasontype + week. We still enumerate weeks, then verify the
  // returned event's own season/week fields so ESPN cannot silently bleed in another season.
  const types=seasonType==='ALL'?[2,3]:[Number(seasonType)];
  const jobs=[];
  for(const t of types){
    const maxWeek=t===2?regularSeasonWeeks(year):5;
    if(weekFilter!=='ALL'&&seasonType!=='ALL'){
      const week=Number(weekFilter);if(week>=1&&week<=maxWeek)jobs.push({t,week});
    }else{
      for(let week=1;week<=maxWeek;week++)jobs.push({t,week});
    }
  }
  let done=0;
  const result=await mapLimit(jobs,6,async({t,week})=>{
    const url=`${BASE}/scoreboard?limit=100&dates=${year}&seasontype=${t}&week=${week}`;
    const j=await fetchJSON(url,{signal,retries:2});
    done++;progressCb?.(done,jobs.length);
    return scoreboardEvents(j)
      .filter(e=>Number(e?.season?.year)===Number(year)&&Number(e?.season?.type)===Number(t)&&Number(e?.week?.number)===Number(week))
      .map(e=>({...e,__seasonType:t,__week:week}));
  });
  const byId=new Map();
  for(const batch of result){if(!Array.isArray(batch))continue;for(const e of batch)byId.set(String(e.id),e)}
  return [...byId.values()].filter(e=>{
    const st=e?.status?.type?.state;const completed=e?.status?.type?.completed;
    return completed===true||st==='post'||st==='in';
  }).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}

function extractTeams(payload){
  const raw=payload?.sports?.[0]?.leagues?.[0]?.teams||payload?.teams||[];
  return raw.map(x=>x.team||x).filter(Boolean).map(t=>({id:idVal(t.id),abbr:teamNorm(t.abbreviation),name:t.displayName||t.name||t.abbreviation||'',logo:t.logos?.[0]?.href||''})).filter(t=>t.id&&t.abbr);
}

function extractQB1(depth,team){
  const found=[];
  const inspect=(pos,key='')=>{
    if(!pos)return;const p=pos.position||{};const ab=String(p.abbreviation||pos.abbreviation||key).toUpperCase();const name=String(p.name||pos.name||key).toLowerCase();
    if(ab!=='QB'&&!name.includes('quarterback')&&!String(key).toLowerCase().includes('quarterback')&&String(key).toLowerCase()!=='qb')return;
    for(const item of (pos.athletes||[])){
      const a=item.athlete||item;
      found.push({rank:Number(item.rank??item.pos_rank??a.rank??999),id:idVal(a.id||item.id),name:a.displayName||a.fullName||a.shortName||'',shortName:a.shortName||'',headshot:a.headshot?.href||a.headshot||'',team:team.abbr,teams:[team.abbr],teamName:team.name,teamLogo:team.logo,position:'QB',source:'Current ESPN QB1'});
    }
  };
  for(const chart of (depth?.depthCharts||depth?.items||[])){
    const p=chart.positions||{};Array.isArray(p)?p.forEach((v,i)=>inspect(v,String(i))):Object.entries(p).forEach(([k,v])=>inspect(v,k));
  }
  const root=depth?.positions||{};Array.isArray(root)?root.forEach((v,i)=>inspect(v,String(i))):Object.entries(root).forEach(([k,v])=>inspect(v,k));
  found.sort((a,b)=>a.rank-b.rank);return found.find(x=>x.rank===1)||found.find(x=>x.id||x.name)||null;
}

async function loadCurrentQB1s(signal,progressCb){
  const teamPayload=await fetchJSON(`${BASE}/teams?limit=100`,{signal});
  const teams=extractTeams(teamPayload);let done=0;
  const rows=await mapLimit(teams,10,async team=>{
    const depth=await fetchJSON(`${BASE}/teams/${team.id}/depthcharts`,{signal,retries:1});
    done++;progressCb?.(done,teams.length);return extractQB1(depth,team);
  });
  return rows.filter(x=>x&&!x.__error);
}
