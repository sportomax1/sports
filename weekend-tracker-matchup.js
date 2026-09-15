(()=>{'use strict';
const E=id=>document.getElementById(id);
const VIEW_KEY='fantasyWeekendMatrix.matchupViewActive';
const GAME_KEY='fantasyWeekendMatrix.matchupGame';
const MODE_KEY='fantasyWeekendMatrix.matchupMode';
let matchupActive=localStorage.getItem(VIEW_KEY)==='true';
let matchupMode=localStorage.getItem(MODE_KEY)||'offense-defense';
let weekGames=[];
let selectedEventId=localStorage.getItem(GAME_KEY)||'';
let requestToken=0;
let currentRanks=new Map();
const cache=new Map();
const escM=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const normM=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g,' ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const teamLogoM=t=>t?`https://a.espncdn.com/i/teamlogos/nfl/500/${encodeURIComponent(String(t).toLowerCase())}.png`:'';
const teamNameM=t=>(typeof TEAM_NAMES!=='undefined'&&TEAM_NAMES[t])||t||'Team';
const fmtClock=d=>{if(!d)return'';const x=new Date(d);if(Number.isNaN(x.getTime()))return'';return x.toLocaleString([],{weekday:'short',hour:'numeric',minute:'2-digit'});};

function setActive(on){
  matchupActive=!!on;
  localStorage.setItem(VIEW_KEY,String(matchupActive));
  const view=E('matchupView'),btn=E('matchupViewBtn');
  if(!view)return;
  if(on){
    ['matrixShell','leadersView','voiceMatchView','emptyStart'].forEach(id=>{const x=E(id);if(x)x.style.display='none'});
    ['matrixViewBtn','leadersViewBtn','voiceViewBtn'].forEach(id=>E(id)?.classList.remove('on'));
    btn?.classList.add('on');
    view.style.display='block';
    syncModeButtons();
    loadWeekGames(false);
  }else{
    btn?.classList.remove('on');
    view.style.display='none';
  }
}
function gameTeams(ev){
  const comp=ev?.competitions?.[0]||{};
  const all=(comp.competitors||[]).map(c=>({
    id:String(c.id||c.team?.id||''),
    abbr:String(c.team?.abbreviation||'').toUpperCase(),
    name:c.team?.displayName||c.team?.shortDisplayName||'',
    logo:c.team?.logo||c.team?.logos?.[0]?.href||'',
    score:String(c.score??'0'),
    homeAway:c.homeAway||''
  }));
  return {home:all.find(x=>x.homeAway==='home')||all[0]||{},away:all.find(x=>x.homeAway==='away')||all[1]||{}};
}
function eventState(ev){const s=ev?.status?.type||ev?.competitions?.[0]?.status?.type||{};return s.completed?'final':s.state==='in'?'live':'pre'}
function eventStatus(ev){const s=ev?.status||ev?.competitions?.[0]?.status||{};return s.type?.shortDetail||s.type?.detail||s.displayClock||fmtClock(ev?.date||ev?.competitions?.[0]?.date)||'Pregame'}
function eventLabel(ev){const {home,away}=gameTeams(ev);return `${away.abbr||away.name} @ ${home.abbr||home.name} · ${eventStatus(ev)}`}
async function fetchJSONM(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}
async function cachedFetch(key,url,ttl=5*60*1000){const hit=cache.get(key);if(hit&&Date.now()-hit.ts<ttl)return hit.data;const data=await fetchJSONM(url);cache.set(key,{ts:Date.now(),data});return data}

function installModeToggle(){
  const toolbar=document.querySelector('.matchupToolbar');
  const select=E('matchupGameSelect');
  if(!toolbar||!select||E('matchupModeToggle'))return;
  const wrap=document.createElement('div');
  wrap.id='matchupModeToggle';
  wrap.className='matchupModeToggle';
  wrap.innerHTML='<button type="button" data-matchup-mode="offense-defense">Offense vs Defense</button><button type="button" data-matchup-mode="offense-offense">Offense vs Offense</button>';
  toolbar.insertBefore(wrap,select);
  wrap.querySelectorAll('[data-matchup-mode]').forEach(b=>b.addEventListener('click',()=>{
    matchupMode=b.dataset.matchupMode;
    localStorage.setItem(MODE_KEY,matchupMode);
    syncModeButtons();
    renderSelectedGame();
  }));
  syncModeButtons();
}
function syncModeButtons(){
  document.querySelectorAll('[data-matchup-mode]').forEach(b=>b.classList.toggle('on',b.dataset.matchupMode===matchupMode));
}

async function loadWeekGames(force=false){
  const season=Number(E('season')?.value||state?.season||new Date().getFullYear()),week=Number(E('week')?.value||state?.week||1),select=E('matchupGameSelect'),meta=E('matchupMeta'),root=E('matchupBoards');
  if(!select||!root)return;
  const token=++requestToken;
  if(force)cache.delete(`week:${season}:${week}`);
  meta.innerHTML='<span class="matchupMiniTag">Loading matchups…</span>';
  root.innerHTML='<div class="matchupLoading" style="grid-column:1/-1"><div><b>Loading this week’s games</b>Building the matchup board from ESPN game and roster data.</div></div>';
  try{
    const data=await cachedFetch(`week:${season}:${week}`,`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=2&week=${week}&limit=100`,force?0:60*1000);
    if(token!==requestToken)return;
    weekGames=(data?.events||[]).slice().sort((a,b)=>new Date(a.date||0)-new Date(b.date||0));
    if(!weekGames.length){select.innerHTML='<option>No games</option>';root.innerHTML='<div class="matchupEmpty" style="grid-column:1/-1"><div><b>No games found</b>Try another season or week.</div></div>';meta.innerHTML='';return}
    if(!weekGames.some(x=>String(x.id)===String(selectedEventId)))selectedEventId=String(weekGames[0].id||'');
    select.innerHTML=weekGames.map(ev=>`<option value="${escM(ev.id)}" ${String(ev.id)===String(selectedEventId)?'selected':''}>${escM(eventLabel(ev))}</option>`).join('');
    localStorage.setItem(GAME_KEY,selectedEventId);
    await renderSelectedGame(token);
  }catch(e){
    console.error('Matchup week load failed',e);
    root.innerHTML=`<div class="matchupError" style="grid-column:1/-1"><div><b>Matchup load failed</b>${escM(e.message||e)}</div></div>`;
    meta.innerHTML='<span class="matchupMiniTag">Could not reach ESPN</span>';
  }
}
function flattenRoster(data){
  const raw=[];
  const push=(x,group='')=>{if(!x)return;const a=x.athlete||x;const p=a.position||x.position||{};raw.push({id:String(a.id||x.id||''),name:a.fullName||a.displayName||a.shortName||x.fullName||x.displayName||'',shortName:a.shortName||x.shortName||'',position:String(p.abbreviation||p.name||x.position?.abbreviation||x.position||'').toUpperCase(),jersey:String(a.jersey||x.jersey||''),headshot:a.headshot?.href||a.headshot||x.headshot?.href||'',starter:!!(x.starter||x.isStarter),active:x.active!==false,group:String(group||'')})};
  if(Array.isArray(data?.athletes))for(const g of data.athletes){if(Array.isArray(g?.items))g.items.forEach(x=>push(x,g.position||g.name||''));else push(g,'')}
  if(Array.isArray(data?.roster))data.roster.forEach(x=>push(x,x.position?.name||''));
  return raw.filter(x=>x.name&&x.position);
}
function applyDepthChart(roster,data){
  const ranks=new Map();
  for(const chart of data?.depthCharts||[]){for(const pos of Object.values(chart?.positions||{})){for(const row of pos?.athletes||[]){const a=row?.athlete||{},id=String(a.id||'');if(!id)continue;const rank=Number(row.rank||99),prev=ranks.get(id);if(!prev||rank<prev)ranks.set(id,rank)}}}
  return roster.map(p=>{const depthRank=ranks.get(String(p.id))||99;return {...p,depthRank,starter:depthRank===1||p.starter}});
}
function parseBoxscore(summary){
  const byTeam=new Map();
  for(const block of summary?.boxscore?.players||[]){
    const team=String(block?.team?.abbreviation||'').toUpperCase();if(!team)continue;
    const map=new Map();
    for(const cat of block.statistics||[]){
      const labels=cat.labels||cat.names||[];
      for(const row of cat.athletes||[]){
        const a=row.athlete||{},key=String(a.id||normM(a.displayName||a.fullName||''));if(!key)continue;
        let entry=map.get(key);
        if(!entry){entry={id:String(a.id||''),name:a.displayName||a.fullName||'',headshot:a.headshot?.href||'',position:String(a.position?.abbreviation||'').toUpperCase(),cats:{}};map.set(key,entry)}
        const vals=row.stats||row.statistics||[],obj={};
        labels.forEach((label,i)=>obj[String(label).toUpperCase()]=vals[i]);
        entry.cats[String(cat.name||cat.displayName||'').toLowerCase()]=obj;
      }
    }
    byTeam.set(team,map);
  }
  return byTeam;
}
function findBoxPlayer(boxMap,p){if(!boxMap||!p)return null;if(p.id&&boxMap.has(String(p.id)))return boxMap.get(String(p.id));const target=normM(p.name);for(const x of boxMap.values())if(normM(x.name)===target)return x;return null}
function statNumber(v){
  const s=String(v??'').trim();
  if(!s||s==='--')return null;
  if(/^-?\d+(?:\.\d+)?$/.test(s))return Number(s);
  const ratio=s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)/);if(ratio)return Number(ratio[1]);
  const first=s.match(/-?\d+(?:\.\d+)?/);return first?Number(first[0]):null;
}
function buildRankIndex(boxes){
  const buckets=new Map();
  for(const teamMap of boxes.values())for(const p of teamMap.values())for(const [cat,stats] of Object.entries(p.cats||{}))for(const [label,value] of Object.entries(stats||{})){
    const n=statNumber(value);if(n===null)continue;
    const key=`${cat}|${label}`;
    if(!buckets.has(key))buckets.set(key,[]);
    buckets.get(key).push({pid:String(p.id||normM(p.name)),n});
  }
  const ranks=new Map();
  for(const [key,rows] of buckets){
    rows.sort((a,b)=>b.n-a.n);
    let last=null,rank=0;
    rows.forEach((r,i)=>{if(last===null||r.n!==last)rank=i+1;last=r.n;ranks.set(`${key}|${r.pid}`,rank)});
  }
  return ranks;
}
function displayLabel(cat,label){
  const l=String(label||'').toUpperCase();
  const map={'YDS':'YDS','TD':'TD','INT':'INT','REC':'REC','TGTS':'TGT','TAR':'TGT','CAR':'CAR','ATT':'ATT','CMP':'CMP','CMP/ATT':'CMP/ATT','AVG':'AVG','LONG':'LNG','QBR':'QBR','RTG':'RTG','SACKS':'SCK','SACK':'SCK','TOT':'TCK','TOTAL':'TCK','SOLO':'SOLO','TFL':'TFL','PD':'PD','FF':'FF','FR':'FR','FUM':'FUM','LOST':'LOST'};
  return map[l]||l.replace(/\s+/g,' ');
}
function allStats(bp){
  if(!bp)return[];
  const pid=String(bp.id||normM(bp.name)),out=[];
  for(const [cat,stats] of Object.entries(bp.cats||{}))for(const [label,value] of Object.entries(stats||{})){
    if(value===undefined||value===null||String(value).trim()===''||String(value)==='0'||String(value)==='0.0'||String(value)==='--')continue;
    const key=`${cat}|${String(label).toUpperCase()}`;
    out.push({cat,label:displayLabel(cat,label),value:String(value),rank:currentRanks.get(`${key}|${pid}`)||null});
  }
  const priority=['YDS','TD','REC','CAR','TCK','SCK','INT','TGT','CMP/ATT','QBR','RTG','AVG','LNG','FF','FR','TFL','PD'];
  out.sort((a,b)=>{
    const ai=priority.indexOf(a.label),bi=priority.indexOf(b.label);
    return (ai<0?999:ai)-(bi<0?999:bi)||a.cat.localeCompare(b.cat)||a.label.localeCompare(b.label);
  });
  return out;
}
function rankRoster(list,positions,count){return list.filter(p=>positions.includes(p.position)).sort((a,b)=>(Number(a.depthRank||99)-Number(b.depthRank||99))||(b.starter-a.starter)||Number(a.jersey||999)-Number(b.jersey||999)||a.name.localeCompare(b.name)).slice(0,count)}
function faceUrl(p){if(p.headshot)return typeof p.headshot==='string'?p.headshot:(p.headshot.href||'');return p.id?`https://a.espncdn.com/i/headshots/nfl/players/full/${encodeURIComponent(p.id)}.png`:''}
function playerCard(p,bp,cls=''){
  if(!p)return `<div class="matchupCard ${cls} empty"><div class="matchupCardName"><b>—</b><small>Not listed</small></div></div>`;
  const stats=allStats(bp),face=faceUrl(p);
  return `<div class="matchupCard ${cls}" title="${escM(p.name)}"><div class="matchupCardTop">${face?`<img class="matchupFace" src="${escM(face)}" alt="" onerror="this.style.visibility='hidden'">`:'<span class="matchupFace"></span>'}<div class="matchupCardName"><b>${escM(p.shortName||p.name)}</b><small>${escM(p.position)}${p.jersey?' · #'+escM(p.jersey):''}${p.starter?' · STARTER':''}</small></div></div><div class="matchupCardStats">${stats.length?stats.map(x=>`<span class="matchupStat"><strong>${escM(x.value)}</strong> ${escM(x.label)}${x.rank?` <em>#${x.rank}</em>`:''}</span>`).join(''):'<span class="matchupStat muted">No game stats</span>'}</div></div>`;
}
function buildDefense(roster,box){
  const dl=rankRoster(roster,['DE','DT','NT','DL'],4),lb=rankRoster(roster,['LB','ILB','OLB','MLB'],3),db=rankRoster(roster,['CB','S','FS','SS','DB'],4);
  return `<div class="matchupDefense"><div class="matchupDefRow db">${Array.from({length:4},(_,i)=>playerCard(db[i],findBoxPlayer(box,db[i]),'defCard')).join('')}</div><div class="matchupDefRow">${Array.from({length:3},(_,i)=>playerCard(lb[i],findBoxPlayer(box,lb[i]),'defCard')).join('')}</div><div class="matchupDefRow">${Array.from({length:4},(_,i)=>playerCard(dl[i],findBoxPlayer(box,dl[i]),'defCard')).join('')}</div></div>`;
}
function buildOffense(roster,box){
  const qb=rankRoster(roster,['QB'],1)[0],rb=rankRoster(roster,['RB','FB'],1)[0],wr=rankRoster(roster,['WR'],1)[0],te=rankRoster(roster,['TE'],1)[0];
  return `<div class="matchupOffenseDiamond"><div class="matchupDiamondTop"><div class="matchupSpot left"><span class="matchupPosLabel">WR</span>${playerCard(wr,findBoxPlayer(box,wr),'skillCard')}</div><div class="matchupSpot center"><span class="matchupPosLabel">QB</span>${playerCard(qb,findBoxPlayer(box,qb),'skillCard qb')}</div><div class="matchupSpot right"><span class="matchupPosLabel">TE</span>${playerCard(te,findBoxPlayer(box,te),'skillCard')}</div></div><div class="matchupDiamondBottom"><div class="matchupSpot"><span class="matchupPosLabel">RB</span>${playerCard(rb,findBoxPlayer(box,rb),'skillCard rb')}</div></div></div>`;
}
function offenseOnlyBoard(side,roster,box){
  const logo=side.logo||teamLogoM(side.abbr),status=eventState(weekGames.find(x=>String(x.id)===String(selectedEventId))),score=side.score||'0';
  return `<section class="matchupTeamBoard offenseOnly"><div class="matchupTeamHead"><img class="matchupTeamLogo" src="${escM(logo)}" alt=""><div class="matchupTeamHeadText"><b>${escM(side.name||teamNameM(side.abbr))}</b><small>${escM(side.abbr)} offense</small></div><div class="matchupScore"><strong>${escM(score)}</strong><span>${status==='pre'?'pregame':'score'}</span></div></div><div class="matchupField offenseOnlyField"><div class="matchupZoneLabel">${escM(side.abbr)} offensive skill lineup</div>${buildOffense(roster,box)}<div class="matchupLegend">Stat rank is within this selected game · highest value = #1</div></div></section>`;
}
function offenseDefenseBoard(side,offRoster,defRoster,offBox,oppBox){
  const logo=side.logo||teamLogoM(side.abbr),status=eventState(weekGames.find(x=>String(x.id)===String(selectedEventId))),score=side.score||'0';
  return `<section class="matchupTeamBoard"><div class="matchupTeamHead"><img class="matchupTeamLogo" src="${escM(logo)}" alt=""><div class="matchupTeamHeadText"><b>${escM(side.name||teamNameM(side.abbr))}</b><small>${escM(side.abbr)} offense vs opponent defense</small></div><div class="matchupScore"><strong>${escM(score)}</strong><span>${status==='pre'?'pregame':'score'}</span></div></div><div class="matchupField"><div class="matchupZoneLabel">Opponent defense · game stats + ranks</div>${buildDefense(defRoster,oppBox)}<div class="matchupLos"></div><div class="matchupZoneLabel">${escM(side.abbr)} offense · WR / QB / TE / RB</div>${buildOffense(offRoster,offBox)}<div class="matchupLegend">Stat rank is within this selected game · highest value = #1</div></div></section>`;
}
async function renderSelectedGame(parentToken=requestToken){
  const root=E('matchupBoards'),meta=E('matchupMeta');if(!root)return;
  const ev=weekGames.find(x=>String(x.id)===String(selectedEventId))||weekGames[0];if(!ev)return;
  selectedEventId=String(ev.id);localStorage.setItem(GAME_KEY,selectedEventId);
  const {home,away}=gameTeams(ev),stateClass=eventState(ev),season=Number(E('season')?.value||state?.season||new Date().getFullYear());
  root.innerHTML='<div class="matchupLoading" style="grid-column:1/-1"><div><b>Building lineup</b>Loading rosters, depth charts, and box-score stats.</div></div>';
  meta.innerHTML=`<span class="matchupMiniTag ${stateClass}">${escM(eventStatus(ev))}</span><span>${escM(away.abbr)} at ${escM(home.abbr)}</span><span>•</span><span>Season ${season} · Week ${Number(E('week')?.value||state?.week||1)}</span><span>•</span><span>${matchupMode==='offense-offense'?'Offense vs Offense':'Offense vs Defense'}</span>`;
  try{
    const [homeRosterData,awayRosterData,homeDepthData,awayDepthData,summary]=await Promise.all([
      cachedFetch(`roster:${season}:${home.abbr}`,`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${encodeURIComponent(home.abbr.toLowerCase())}/roster?season=${season}`,15*60*1000).catch(()=>({})),
      cachedFetch(`roster:${season}:${away.abbr}`,`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${encodeURIComponent(away.abbr.toLowerCase())}/roster?season=${season}`,15*60*1000).catch(()=>({})),
      cachedFetch(`depth:${season}:${home.id}`,`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${encodeURIComponent(home.id||home.abbr)}/depthcharts`,15*60*1000).catch(()=>({})),
      cachedFetch(`depth:${season}:${away.id}`,`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${encodeURIComponent(away.id||away.abbr)}/depthcharts`,15*60*1000).catch(()=>({})),
      cachedFetch(`summary:${ev.id}`,`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(ev.id)}`,stateClass==='live'?30*1000:5*60*1000).catch(()=>({}))
    ]);
    if(parentToken!==requestToken||String(selectedEventId)!==String(ev.id))return;
    const homeRoster=applyDepthChart(flattenRoster(homeRosterData),homeDepthData),awayRoster=applyDepthChart(flattenRoster(awayRosterData),awayDepthData),boxes=parseBoxscore(summary),homeBox=boxes.get(home.abbr)||new Map(),awayBox=boxes.get(away.abbr)||new Map();
    currentRanks=buildRankIndex(boxes);
    root.classList.toggle('offenseCompare',matchupMode==='offense-offense');
    if(matchupMode==='offense-offense'){
      root.innerHTML=offenseOnlyBoard(home,homeRoster,homeBox)+offenseOnlyBoard(away,awayRoster,awayBox);
    }else{
      root.innerHTML=offenseDefenseBoard(home,homeRoster,awayRoster,homeBox,awayBox)+offenseDefenseBoard(away,awayRoster,homeRoster,awayBox,homeBox);
    }
    if(!(homeRoster.length+awayRoster.length))meta.innerHTML+='<span class="matchupMiniTag">Roster endpoint returned no players</span>';
  }catch(e){console.error('Matchup render failed',e);root.innerHTML=`<div class="matchupError" style="grid-column:1/-1"><div><b>Could not build the lineup</b>${escM(e.message||e)}</div></div>`}
}
function bindMatchup(){
  installModeToggle();
  E('matchupViewBtn')?.addEventListener('click',()=>setActive(true));
  ['matrixViewBtn','leadersViewBtn','voiceViewBtn'].forEach(id=>E(id)?.addEventListener('click',()=>setActive(false)));
  E('matchupGameSelect')?.addEventListener('change',e=>{selectedEventId=e.target.value;localStorage.setItem(GAME_KEY,selectedEventId);renderSelectedGame()});
  E('matchupReload')?.addEventListener('click',()=>loadWeekGames(true));
  E('season')?.addEventListener('change',()=>{if(matchupActive)setTimeout(()=>loadWeekGames(true),0)});
  E('week')?.addEventListener('change',()=>{if(matchupActive)setTimeout(()=>loadWeekGames(true),0)});
  if(typeof renderMatrix==='function'){
    const prior=renderMatrix;
    renderMatrix=function(){const result=prior.apply(this,arguments);if(matchupActive)setTimeout(()=>setActive(true),0);return result};
  }
  setActive(matchupActive);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindMatchup);else bindMatchup();
})();
