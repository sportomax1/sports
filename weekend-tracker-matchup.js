(()=>{'use strict';
const E=id=>document.getElementById(id);
const VIEW_KEY='fantasyWeekendMatrix.matchupViewActive';
const GAME_KEY='fantasyWeekendMatrix.matchupGame';
let matchupActive=localStorage.getItem(VIEW_KEY)==='true';
let weekGames=[];
let selectedEventId=localStorage.getItem(GAME_KEY)||'';
let requestToken=0;
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
function parseBoxscore(summary){
  const byTeam=new Map();
  for(const block of summary?.boxscore?.players||[]){
    const team=String(block?.team?.abbreviation||'').toUpperCase();if(!team)continue;
    const map=new Map();
    for(const cat of block.statistics||[]){const labels=cat.labels||cat.names||[];for(const row of cat.athletes||[]){const a=row.athlete||{};const key=String(a.id||normM(a.displayName||a.fullName||''));if(!key)continue;let entry=map.get(key);if(!entry){entry={id:String(a.id||''),name:a.displayName||a.fullName||'',headshot:a.headshot?.href||'',position:String(a.position?.abbreviation||'').toUpperCase(),cats:{}};map.set(key,entry)}const vals=row.stats||row.statistics||[];const obj={};labels.forEach((label,i)=>obj[String(label).toUpperCase()]=vals[i]);entry.cats[String(cat.name||cat.displayName||'').toLowerCase()]=obj}}
    byTeam.set(team,map);
  }
  return byTeam;
}
function findBoxPlayer(boxMap,p){if(!boxMap||!p)return null;if(p.id&&boxMap.has(String(p.id)))return boxMap.get(String(p.id));const target=normM(p.name);for(const x of boxMap.values())if(normM(x.name)===target)return x;return null}
function bestCat(bp,names){if(!bp)return{};for(const n of names){for(const [k,v] of Object.entries(bp.cats||{}))if(k.includes(n))return v}return{}}
function statsFor(p,bp){
  if(!bp)return[];
  const pos=p.position,out=[];
  const add=(obj,keys,label)=>{for(const k of keys){const v=obj[k];if(v!==undefined&&v!==null&&String(v)!==''&&String(v)!=='0'&&String(v)!=='0.0'){out.push(`${v} ${label}`);return}}};
  if(pos==='QB'){const s=bestCat(bp,['passing']);add(s,['YDS'],'PYD');add(s,['TD'],'PTD');add(s,['INT'],'INT');add(s,['QBR','RTG'],'QBR')}
  else if(['RB','FB'].includes(pos)){const r=bestCat(bp,['rushing']),c=bestCat(bp,['receiving']);add(r,['YDS'],'RYD');add(r,['TD'],'RTD');add(c,['REC'],'REC');add(c,['YDS'],'REY')}
  else if(['WR','TE'].includes(pos)){const c=bestCat(bp,['receiving']);add(c,['REC'],'REC');add(c,['YDS'],'REY');add(c,['TD'],'TD');add(c,['TGTS','TAR'],'TGT')}
  else{const d=bestCat(bp,['defensive','defense']);add(d,['TOT','TOTAL'],'TCK');add(d,['SACKS','SACK'],'SCK');add(d,['INT'],'INT');add(d,['FF'],'FF')}
  return out.slice(0,4);
}
function rankRoster(list,positions,count){return list.filter(p=>positions.includes(p.position)).sort((a,b)=>(b.starter-a.starter)||Number(a.jersey||999)-Number(b.jersey||999)||a.name.localeCompare(b.name)).slice(0,count)}
function faceUrl(p){if(p.headshot)return typeof p.headshot==='string'?p.headshot:(p.headshot.href||'');return p.id?`https://a.espncdn.com/i/headshots/nfl/players/full/${encodeURIComponent(p.id)}.png`:''}
function playerCard(p,bp,cls=''){
  if(!p)return `<div class="matchupCard ${cls} empty"><div class="matchupCardName"><b>—</b><small>Not listed</small></div></div>`;
  const stats=statsFor(p,bp),face=faceUrl(p);
  return `<div class="matchupCard ${cls}" title="${escM(p.name)}"><div class="matchupCardTop">${face?`<img class="matchupFace" src="${escM(face)}" alt="" onerror="this.style.visibility='hidden'">`:'<span class="matchupFace"></span>'}<div class="matchupCardName"><b>${escM(p.shortName||p.name)}</b><small>${escM(p.position)}${p.jersey?' · #'+escM(p.jersey):''}${p.starter?' · STARTER':''}</small></div></div><div class="matchupCardStats">${stats.length?stats.map((x,i)=>`<span class="matchupStat ${i===0?'hot':''}">${escM(x)}</span>`).join(''):'<span class="matchupStat">No game stats</span>'}</div></div>`;
}
function buildDefense(roster,box){
  const dl=rankRoster(roster,['DE','DT','NT','DL'],4),lb=rankRoster(roster,['LB','ILB','OLB','MLB'],3),db=rankRoster(roster,['CB','S','FS','SS','DB'],4);
  return `<div class="matchupDefense"><div class="matchupDefRow db">${Array.from({length:4},(_,i)=>playerCard(db[i],findBoxPlayer(box,db[i]),'compact')).join('')}</div><div class="matchupDefRow">${Array.from({length:3},(_,i)=>playerCard(lb[i],findBoxPlayer(box,lb[i]),'compact')).join('')}</div><div class="matchupDefRow">${Array.from({length:4},(_,i)=>playerCard(dl[i],findBoxPlayer(box,dl[i]),'compact')).join('')}</div></div>`;
}
function buildOffense(roster,box){
  const qb=rankRoster(roster,['QB'],1)[0],rbs=rankRoster(roster,['RB','FB'],2),wrs=rankRoster(roster,['WR'],2),tes=rankRoster(roster,['TE'],1);
  return `<div class="matchupOffense"><div class="matchupOffRow skills">${playerCard(wrs[0],findBoxPlayer(box,wrs[0]))}${playerCard(tes[0],findBoxPlayer(box,tes[0]))}${playerCard(wrs[1],findBoxPlayer(box,wrs[1]))}</div><div class="matchupOffRow"><div class="matchupCenterCol">${playerCard(qb,findBoxPlayer(box,qb),'qb')}</div></div><div class="matchupOffRow backfield">${playerCard(rbs[0],findBoxPlayer(box,rbs[0]))}${playerCard(rbs[1],findBoxPlayer(box,rbs[1]))}</div></div>`;
}
function teamBoard(side,offRoster,defRoster,boxByTeam,oppBox){
  const logo=side.logo||teamLogoM(side.abbr),status=eventState(weekGames.find(x=>String(x.id)===String(selectedEventId))),score=side.score||'0';
  return `<section class="matchupTeamBoard"><div class="matchupTeamHead"><img class="matchupTeamLogo" src="${escM(logo)}" alt=""><div class="matchupTeamHeadText"><b>${escM(side.name||teamNameM(side.abbr))}</b><small>${escM(side.abbr)} offense vs opponent defense</small></div><div class="matchupScore"><strong>${escM(score)}</strong><span>${status==='pre'?'pregame':'score'}</span></div></div><div class="matchupField"><div class="matchupZoneLabel">Opponent defense · individual game stats</div>${buildDefense(defRoster,oppBox)}<div class="matchupLos"></div><div class="matchupZoneLabel">${escM(side.abbr)} offense · skill personnel</div>${buildOffense(offRoster,boxByTeam)}<div class="matchupLegend">Starter-first roster approximation · personnel is not snap-specific</div></div></section>`;
}
async function renderSelectedGame(parentToken=requestToken){
  const root=E('matchupBoards'),meta=E('matchupMeta');if(!root)return;
  const ev=weekGames.find(x=>String(x.id)===String(selectedEventId))||weekGames[0];if(!ev)return;
  selectedEventId=String(ev.id);localStorage.setItem(GAME_KEY,selectedEventId);
  const {home,away}=gameTeams(ev),stateClass=eventState(ev),season=Number(E('season')?.value||state?.season||new Date().getFullYear());
  root.innerHTML='<div class="matchupLoading" style="grid-column:1/-1"><div><b>Building lineup</b>Loading both rosters and the selected game’s box score.</div></div>';
  meta.innerHTML=`<span class="matchupMiniTag ${stateClass}">${escM(eventStatus(ev))}</span><span>${escM(away.abbr)} at ${escM(home.abbr)}</span><span>•</span><span>Season ${season} · Week ${Number(E('week')?.value||state?.week||1)}</span>`;
  try{
    const [homeRosterData,awayRosterData,summary]=await Promise.all([
      cachedFetch(`roster:${season}:${home.abbr}`,`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${encodeURIComponent(home.abbr.toLowerCase())}/roster?season=${season}`,15*60*1000).catch(()=>({})),
      cachedFetch(`roster:${season}:${away.abbr}`,`https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/${encodeURIComponent(away.abbr.toLowerCase())}/roster?season=${season}`,15*60*1000).catch(()=>({})),
      cachedFetch(`summary:${ev.id}`,`https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${encodeURIComponent(ev.id)}`,stateClass==='live'?30*1000:5*60*1000).catch(()=>({}))
    ]);
    if(parentToken!==requestToken||String(selectedEventId)!==String(ev.id))return;
    const homeRoster=flattenRoster(homeRosterData),awayRoster=flattenRoster(awayRosterData),boxes=parseBoxscore(summary),homeBox=boxes.get(home.abbr)||new Map(),awayBox=boxes.get(away.abbr)||new Map();
    root.innerHTML=teamBoard(home,homeRoster,awayRoster,homeBox,awayBox)+teamBoard(away,awayRoster,homeRoster,awayBox,homeBox);
    if(!(homeRoster.length+awayRoster.length))meta.innerHTML+='<span class="matchupMiniTag">Roster endpoint returned no players</span>';
  }catch(e){console.error('Matchup render failed',e);root.innerHTML=`<div class="matchupError" style="grid-column:1/-1"><div><b>Could not build the lineup</b>${escM(e.message||e)}</div></div>`}
}
function bindMatchup(){
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
