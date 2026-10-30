/* College Movement Lab / National ESPN roster analytics. Static site, no credentials.
 * A season index is a roster observation, not an official portal transaction.
 * This file exports a testable pure core when CommonJS is available.
 */
(function(root){
'use strict';
const clean=x=>String(x??'').trim();
const lower=x=>clean(x).toLowerCase();
const esc=x=>clean(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=x=>Number(x||0).toLocaleString('en-US');
const SPORT={
 football:{name:'College football',path:'football/college-football',profile:'https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/athletes/'},
 basketball:{name:"Men's college basketball",path:'basketball/mens-college-basketball',profile:'https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/athletes/'}
};
function validSnapshot(obj,sport,year){
 if(!obj||obj.version!==2||obj.sport!==sport||obj.year!==year||!Array.isArray(obj.teams)||obj.teams.length<100)throw Error('Unrecognized or incomplete '+year+' ESPN roster dataset');
 const seen=new Set(),teams=[];
 for(const t of obj.teams){
  const id=clean(t.id);if(!/^\d+$/.test(id)||seen.has(id))continue;seen.add(id);
  const status=['ok','partial','missing'].includes(t.status)?t.status:'missing';
  const ids=status==='ok'&&Array.isArray(t.ids)?[...new Set(t.ids.map(clean).filter(x=>/^\d+$/.test(x)))]:[];
  // Reject status="ok" when the provider index contains no valid athlete IDs.
  teams.push({id,name:clean(t.name)||('Team '+id),logo:clean(t.logo),status:status==='ok'&&ids.length?'ok':status==='ok'?'partial':status,ids,reportedCount:t.reportedCount});
 }
 return {year,teams,source:clean(obj.source),generatedAt:clean(obj.generatedAt),directoryTeams:teams.length};
}
function analyze(seasons){
 const byYear=new Map(),teams=new Map(),athletes=new Map(),coverage=[];
 for(const snap of seasons.slice().sort((a,b)=>a.year-b.year)){
  const map=new Map();
  for(const t of snap.teams){
   map.set(t.id,t);
   if(!teams.has(t.id))teams.set(t.id,{id:t.id,name:t.name,logo:t.logo});
   if(t.status!=='ok')continue;
   for(const id of t.ids){
    if(!athletes.has(id))athletes.set(id,new Map());
    const history=athletes.get(id);
    if(!history.has(snap.year))history.set(snap.year,new Set());
    history.get(snap.year).add(t.id);
   }
  }
  byYear.set(snap.year,map);
  const ok=snap.teams.filter(t=>t.status==='ok').length;
  coverage.push({year:snap.year,complete:ok,total:snap.teams.length,partial:snap.teams.filter(t=>t.status==='partial').length,missing:snap.teams.filter(t=>t.status==='missing').length,memberships:snap.teams.reduce((sum,t)=>sum+(t.status==='ok'?t.ids.length:0),0)});
 }
 const years=[...byYear.keys()].sort((a,b)=>a-b);
 const movement=[],changes=[],teamStats=new Map(),yearStats=[];
 for(const t of teams.values())teamStats.set(t.id,{...t,new:0,exits:0,retained:0,previous:0,switchedIn:0,switchedOut:0,eligiblePairs:0,byYear:[]});
 for(const year of years){
  const current=byYear.get(year),previous=byYear.get(year-1);
  const currentYearStats={year,entrants:0,exits:0,switches:0,retained:0,comparisons:0};
  for(const t of current.values()){
   const meta=teamStats.get(t.id),prior=previous?.get(t.id);
   if(t.status==='ok'&&prior?.status==='ok'){
    const old=new Set(prior.ids),now=new Set(t.ids);
    let kept=0,added=0,exited=0;
    for(const id of now){if(old.has(id))kept++;else{added++;changes.push({id,year,teamId:t.id,team:t.name,type:'arrival'});}}
    for(const id of old)if(!now.has(id)){exited++;changes.push({id,year,teamId:t.id,team:t.name,type:'departure'});}
    meta.new+=added;meta.exits+=exited;meta.retained+=kept;meta.previous+=prior.ids.length;meta.eligiblePairs++;
    currentYearStats.entrants+=added;currentYearStats.exits+=exited;currentYearStats.retained+=kept;currentYearStats.comparisons++;
    meta.byYear.push({year,count:now.size,arrivals:added,exits:exited,retained:kept,pct:prior.ids.length?100*kept/prior.ids.length:null,comparable:true});
   }else{
    meta.byYear.push({year,count:t.status==='ok'?t.ids.length:null,arrivals:null,exits:null,retained:null,pct:null,comparable:false,reason:!previous?'No prior year available':(t.status!=='ok'?'Season roster unavailable':'Previous roster unavailable')});
   }
  }
  if(previous){
   for(const [id,history] of athletes){
    const from=history.get(year-1),to=history.get(year);
    // Multi-school memberships in either season are ambiguous, never infer a move.
    if(!from||!to||from.size!==1||to.size!==1)continue;
    const a=[...from][0],b=[...to][0];
    if(a===b)continue;
    if(previous.get(a)?.status!=='ok'||current.get(b)?.status!=='ok')continue;
    movement.push({id,year,fromId:a,toId:b,from:teams.get(a)?.name||a,to:teams.get(b)?.name||b});
    currentYearStats.switches++;
    if(teamStats.has(a))teamStats.get(a).switchedOut++;
    if(teamStats.has(b))teamStats.get(b).switchedIn++;
   }
  }
  yearStats.push(currentYearStats);
 }
 return{teams,athletes,byYear,years,movement,changes,teamStats,yearStats,coverage};
}
if(typeof module!=='undefined'&&module.exports)module.exports={validSnapshot,analyze};
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id);
const state={sport:'football',start:2024,end:2026,scope:'',raw:[],model:null,profiles:new Map(),profileFailed:new Set(),profilePending:new Set(),run:0,tab:'moves',sort:'activity',visibleRows:[],error:[],loading:false,renderVersion:0};
const canRun=()=>!!SPORT[state.sport];
const cacheKey=id=>'college_profile_v4_'+state.sport+'_'+id;
function setNotice(t,error=false){
 const el=$('notice');el.hidden=!t;el.classList.toggle('error',!!error);el.textContent=t||'';
}
function status(text){$('loaded').textContent=text}
function selectYearOptions(){
 const max=new Date().getFullYear(),first=Math.max(2024,max-2);
 for(let y=max+1;y>=2013;y--){$('fromYear').add(new Option(y,y));$('toYear').add(new Option(y,y));}
 $('fromYear').value=String(first);$('toYear').value=String(max);
 state.start=first;state.end=max;
}
function playerName(id){return state.profiles.get(id)?.name||'Athlete #'+id;}
function playerCell(id){
 return '<button class="click personLink" type="button" data-person="'+esc(id)+'">'+esc(playerName(id))+'</button>';
}
function scopeMatches(m){
 return !state.scope||m.fromId===state.scope||m.toId===state.scope;
}
function matchesText(...parts){
 const q=lower($('search').value);
 return !q||lower(parts.join(' ')).includes(q);
}
function bySelection(){
 const model=state.model;if(!model)return{movements:[],changes:[],teams:[]};
 const moves=model.movement.filter(m=>scopeMatches(m)&&matchesText(m.id,playerName(m.id),m.from,m.to,m.year));
 const changes=model.changes.filter(c=>(!state.scope||state.scope===c.teamId)&&matchesText(c.id,playerName(c.id),c.team,c.year,c.type));
 const teams=[...model.teamStats.values()].filter(t=>(!state.scope||state.scope===t.id)&&matchesText(t.name,t.id));
 return{movements:moves,changes,teams};
}
function renderKPIs(){
 const m=state.model,scope=state.scope;
 const matchScope=tr=>!scope||tr.fromId===scope||tr.toId===scope;
 const moves=m?m.movement.filter(matchScope):[];
 const teamSummaries=m?[...m.teamStats.values()].filter(t=>!scope||t.id===scope):[];
 const nNew=teamSummaries.reduce((a,t)=>a+t.new,0),nExits=teamSummaries.reduce((a,t)=>a+t.exits,0);
 const denom=teamSummaries.reduce((a,t)=>a+t.previous,0),kept=teamSummaries.reduce((a,t)=>a+t.retained,0);
 const teamsObserved=m?teamSummaries.filter(t=>t.eligiblePairs>0).length:0;
 const kpi=[
 ['kEntries',moves.length,'Observed switches','ESPN ID seen at different schools in adjacent years'],
 ['kLanded',nNew,'New roster appearances','Only complete adjacent team rosters'],
 ['kOpen',nExits,'Roster departures','Not proof of transferring or going pro'],
 ['kSchools',teamsObserved,'Comparable schools','At least one complete adjacent-season pair'],
 ['kDraft',denom?Math.round(100*kept/denom)+'%':'—','Roster retention','Weighted returning players / prior roster slots']
 ];
 for(const [id,n,title,desc] of kpi){$(id).textContent=m?(typeof n==='string'?n:number(n)):'—';$(id).parentElement.querySelector('small').textContent=title;$(id).parentElement.querySelector('span').textContent=desc;}
}
function renderCharts(){
 const m=state.model,years=m?.years||[];
 const values=years.map(y=>{
  if(!state.scope)return m.yearStats.find(x=>x.year===y);
  const t=m.teamStats.get(state.scope)?.byYear.find(x=>x.year===y);
  return{year:y,entrants:t?.arrivals||0,exits:t?.exits||0,switches:m.movement.filter(x=>x.year===y&&scopeMatches(x)).length,comparisons:t?.comparable?1:0};
 });
 const peak=Math.max(1,...values.map(x=>x.entrants||0),...values.map(x=>x.switches||0));
 $('trend').innerHTML=values.length?values.map(x=>'<div class="bar-group"><div class="bars">'+
  '<div class="bar portals" title="'+esc(x.year+': '+(x.comparisons?number(x.entrants):'no comparable rosters')+' arrivals')+'" style="height:'+Math.max(0,(x.entrants||0)*100/peak)+'%"></div>'+
  '<div class="bar committed" title="'+esc(x.year+': '+number(x.switches)+' observed switches')+'" style="height:'+Math.max(0,(x.switches||0)*100/peak)+'%"></div></div>'+
  '<em>'+(x.comparisons?number(x.entrants):'N/A')+'</em><small>'+x.year+'</small></div>').join(''):
  '<div class="empty">No published roster snapshots yet.</div>';
 const stats=m?[...m.teamStats.values()].filter(t=>(!state.scope||t.id===state.scope)&&t.eligiblePairs>0).sort((a,b)=>b.switchedIn+b.switchedOut-(a.switchedIn+a.switchedOut)).slice(0,12):[];
 const peakRank=Math.max(1,...stats.map(s=>s.switchedIn+s.switchedOut));
 $('rank').innerHTML=stats.length?stats.map(t=>'<button class="rankrow" type="button" data-team="'+esc(t.id)+'" title="Filter to '+esc(t.name)+'"><span class="name">'+esc(t.name)+'</span><span class="track"><i style="width:'+((t.switchedIn+t.switchedOut)*100/peakRank)+'%"></i></span><b>'+number(t.switchedIn+t.switchedOut)+'</b></button>').join(''):
 '<div class="empty">No comparable team movement records in this selection.</div>';
}
function table(headers,rows,limitNote=''){
 const n=Number($('rowLimit').value)||250;
 if(!rows.length)return '<div class="empty">No observed records match the filters. Missing schools or seasons are not counted as zero.</div>';
 const body=rows.slice(0,n).map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('');
 return '<div class="tablewrap"><table class="table"><thead><tr>'+headers.map(v=>'<th scope="col">'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table></div>'+
  (rows.length>n?'<div class="subtabs">Showing '+number(n)+' / '+number(rows.length)+' records. Export CSV to include all matching rows.</div>':'')+
  (limitNote?'<div class="subtabs">'+esc(limitNote)+'</div>':'');
}
function renderTab(){
 const m=state.model,{movements,changes,teams}=bySelection();
 const t=state.tab;
 $('moveFilter').hidden=true;
 $('viewDescription').textContent='Observed ESPN roster memberships, not official transfer-portal or draft transactions.';
 if(!m){$('viewTitle').textContent='All-schools dataset';$('tabContent').innerHTML='<div class="empty">Loading national rosters. <a href="./college-movement-live.html">Compare specific schools live</a> while the national index is built.</div>';return;}
 if(t==='moves'){
  $('viewTitle').textContent='Observed school switches · '+number(movements.length);
  $('viewDescription').textContent='Same ESPN athlete ID at different schools in adjacent seasons; not verified portal participation.';
  const list=movements.slice().sort((a,b)=>b.year-a.year||a.from.localeCompare(b.from)||a.id.localeCompare(b.id));
  $('tabContent').innerHTML=table(['New season','Athlete','From','To','Evidence'],list.map(x=>[
   esc(x.year),playerCell(x.id),
   '<button class="click" data-team="'+esc(x.fromId)+'">'+esc(x.from)+'</button>',
   '<button class="click" data-team="'+esc(x.toId)+'">'+esc(x.to)+'</button>',
   '<span class="tag">Roster-inferred</span>'
  ]),'Only unique one-school-to-one-school adjacent-season matches qualify.');
 }else if(t==='teams'){
  $('viewTitle').textContent='School turnover leaderboard';
  $('viewDescription').textContent='Season-comparable team retention plus observed transfers in/out.';
  const sorts={
   activity:(a,b)=>(b.switchedIn+b.switchedOut)-(a.switchedIn+a.switchedOut),
   inbound:(a,b)=>b.switchedIn-a.switchedIn,outbound:(a,b)=>b.switchedOut-a.switchedOut,
   new:(a,b)=>b.new-a.new,retention:(a,b)=>((b.previous?b.retained/b.previous:-1)-(a.previous?a.retained/a.previous:-1))
  };
  const sorted=teams.filter(x=>x.eligiblePairs).sort((a,b)=>(sorts[state.sort]||sorts.activity)(a,b)||a.name.localeCompare(b.name));
  $('tabContent').innerHTML=table(['Team','Observed in','Observed out','New','Departed','Returners','Retention'],sorted.map(x=>[
   '<button class="click" data-team="'+esc(x.id)+'">'+esc(x.name)+'</button>',number(x.switchedIn),number(x.switchedOut),
   number(x.new),number(x.exits),number(x.retained),x.previous?(100*x.retained/x.previous).toFixed(1)+'%':'—'
  ]),'Retention pools comparable adjacent team-season pairs.');
 }else if(t==='routes'){
  $('viewTitle').textContent='School-to-school pipelines';
  const routes=new Map();
  for(const x of movements){const k=x.fromId+'>'+x.toId;let r=routes.get(k);if(!r){r={from:x.from,to:x.to,fromId:x.fromId,toId:x.toId,count:0,years:new Set(),ids:[]};routes.set(k,r)}r.count++;r.years.add(x.year);r.ids.push(x.id)}
  const rows=[...routes.values()].sort((a,b)=>b.count-a.count||a.from.localeCompare(b.from));
  $('tabContent').innerHTML=table(['From school','To school','Players','Cycles'],rows.map(x=>[
   '<button class="click" data-team="'+esc(x.fromId)+'">'+esc(x.from)+'</button>',
   '<button class="click" data-team="'+esc(x.toId)+'">'+esc(x.to)+'</button>',number(x.count),esc([...x.years].sort().join(', '))
  ]));
 }else if(t==='draft'){
  $('viewTitle').textContent='Unresolved roster departures';
  $('viewDescription').textContent='Leaving a roster does NOT establish a transfer, draft declaration, graduation or professional contract.';
  const rows=changes.filter(x=>x.type==='departure').sort((a,b)=>b.year-a.year||a.team.localeCompare(b.team));
  $('tabContent').innerHTML=table(['Last listed','Player','School','Outcome'],rows.map(x=>[
   esc(x.year-1),playerCell(x.id),'<button class="click" data-team="'+esc(x.teamId)+'">'+esc(x.team)+'</button>',
   '<span class="pending">Unknown</span>'
  ]));
 }else if(t==='retention'){
  $('viewTitle').textContent='Roster coverage & retention';
  $('viewDescription').textContent='Complete, partial, and unavailable school-season indexes are shown separately. No missing record is assumed empty.';
  const records=[];
  for(const s of state.raw)for(const t of s.teams){
   if(state.scope&&state.scope!==t.id)continue;
   if(!matchesText(s.year,t.name,t.status,t.id))continue;
   const stat=m.teamStats.get(t.id)?.byYear.find(x=>x.year===s.year);
   records.push({year:s.year,team:t,stat});
  }
  records.sort((a,b)=>b.year-a.year||a.team.name.localeCompare(b.team.name));
  $('tabContent').innerHTML=table(['Year','School','ESPN status','Athletes','New','Departed','Retention'],records.map(x=>[
   esc(x.year),'<button class="click" data-team="'+esc(x.team.id)+'">'+esc(x.team.name)+'</button>',
   x.team.status==='ok'?'<span class="good">Complete</span>':'<span class="pending">'+esc(x.team.status)+'</span>',
   x.team.status==='ok'?number(x.team.ids.length):'—',x.stat?.comparable?number(x.stat.arrivals):'—',
   x.stat?.comparable?number(x.stat.exits):'—',x.stat?.comparable&&x.stat.pct!==null?x.stat.pct.toFixed(1)+'%':'—'
  ]));
 }else{
  $('viewTitle').textContent='Year-by-year national summary';
  $('viewDescription').textContent='Compared rosters only. Directory coverage measures include schools for which ESPN has no roster.';
  $('tabContent').innerHTML=table(['Season','Schools listed','Complete rosters','Partial','Missing','Players indexed','Comparable teams','Observed switches'],m.coverage.map(c=>{
   const stat=m.yearStats.find(y=>y.year===c.year);
   return [esc(c.year),number(c.total),number(c.complete),number(c.partial),number(c.missing),number(c.memberships),
    number(stat?.comparisons||0),number(stat?.switches||0)];
  }));
 }
 queueProfiles();
}
function render(){
 if(!canRun())return;
 renderKPIs();renderCharts();renderTab();
 const m=state.model,observed=m?.coverage||[];
 const schoolCount=m?.teams.size||0;
 const total=observed.reduce((n,c)=>n+c.total,0),good=observed.reduce((n,c)=>n+c.complete,0);
 $('coverage').textContent=m?number(schoolCount)+' ESPN-listed schools · '+number(good)+'/'+number(total)+' team-season rosters usable ('+(total?Math.round(100*good/total):0)+'%)':'National coverage will appear after ESPN snapshot files are available';
 $('keyStatus').textContent='ESPN static snapshots · no API key';
 document.querySelectorAll('.tab').forEach(el=>el.setAttribute('aria-selected',String(el.dataset.tab===state.tab)));
}
function fillScopes(){
 const m=state.model,select=$('team'),old=state.scope;select.replaceChildren(new Option('All ESPN-listed schools',''));
 if(!m)return;
 for(const t of [...m.teams.values()].sort((a,b)=>a.name.localeCompare(b.name)))select.add(new Option(t.name,t.id));
 if(old&&m.teams.has(old)){select.value=old}else{state.scope='';select.value='';}
}
async function load(){
 const id=++state.run;
 const from=Number($('fromYear').value),to=Number($('toYear').value);
 if(!Number.isInteger(from)||!Number.isInteger(to)||to<from||to-from>5){
  setNotice('Select a range of one to six seasons, earliest first.',true);return;
 }
 state.start=from;state.end=to;state.sport=$('sport').value;
 state.raw=[];state.model=null;state.error=[];state.loading=true;
 $('load').disabled=true;$('load').textContent='Loading…';setNotice('',false);status('Fetching published ESPN season indexes…');render();
 const years=Array.from({length:to-from+1},(_,i)=>from+i);
 const completed=await Promise.all(years.map(async y=>{
  try{
   const res=await fetch('./data/college-rosters/'+state.sport+'/'+y+'.json',{cache:'default'});
   if(!res.ok)throw Error('Not yet published (HTTP '+res.status+')');
   const data=validSnapshot(await res.json(),state.sport,y);
   return {year:y,data};
  }catch(e){return {year:y,error:e.message}}
 }));
 if(id!==state.run)return;
 state.raw=completed.filter(x=>x.data).map(x=>x.data);
 state.error=completed.filter(x=>x.error).map(x=>x.year+': '+x.error);
 state.raw.sort((a,b)=>a.year-b.year);
 state.model=state.raw.length?analyze(state.raw):null;
 state.loading=false;$('load').disabled=false;$('load').textContent='↻ Load index';
 fillScopes();render();
 if(!state.raw.length){
  setNotice('No national ESPN snapshots are published for these seasons yet. The GitHub Actions all-schools scan may still be running. Use Live School Compare for immediate on-demand results.',true);
  status('0 of '+years.length+' season indexes · unavailable');
 }else{
  if(state.error.length)setNotice('Partial year coverage: '+state.error.join(' · ')+'. Missing years are excluded, not treated as zero.',true);
  else if(state.model.coverage.some(x=>x.complete<x.total))setNotice('ESPN returned empty/partial rosters for some listed schools. Nationwide results cover only valid roster indexes; see Coverage tab.',false);
  else setNotice('',false);
  status(number(state.model.movement.length)+' observed switches · '+number(state.model.athletes.size)+' unique athlete IDs · '+state.raw.length+'/'+years.length+' available years');
 }
}
const profileUrl=id=>SPORT[state.sport].profile+encodeURIComponent(id)+'?lang=en&region=us';
async function fetchProfile(id){
 const key=cacheKey(id);
 try{const c=JSON.parse(sessionStorage.getItem(key)||'null');if(c?.name)return c}catch{}
 const url=profileUrl(id);
 let obj;
 try{
  const res=await fetch(url,{cache:'force-cache'});
  if(!res.ok)throw Error('ESPN HTTP '+res.status);
  obj=await res.json();
 }catch(err){
  // ESPN is the source of truth; when browser CORS blocks it, try the same proxy as the legacy roster tool.
  const res=await fetch('https://api.allorigins.win/raw?url='+encodeURIComponent(url));
  if(!res.ok)throw err;
  obj=await res.json();
 }
 const a=obj?.athlete||obj;
 const name=clean(a?.displayName||a?.fullName||a?.name);
 if(!name)throw Error('ESPN player profile unavailable');
 const profile={id,name,position:clean(a.position?.abbreviation||a.position?.name),
   image:clean(a.headshot?.href||a.headshot),experience:clean(a.experience?.abbreviation)};
 try{sessionStorage.setItem(key,JSON.stringify(profile))}catch{}
 return profile;
}
function patchVisibleName(id){
 const profile=state.profiles.get(id);
 if(!profile)return;
 document.querySelectorAll('button[data-person]').forEach(b=>{
  if(b.dataset.person===id)b.textContent=profile.name;
 });
}
async function queueProfiles(){
 const buttons=[...document.querySelectorAll('button[data-person]')];
 const needed=[...new Set(buttons.map(b=>b.dataset.person))].filter(id=>!state.profiles.has(id)&&!state.profilePending.has(id)&&!state.profileFailed.has(id)).slice(0,100);
 if(!needed.length)return;
 const sport=state.sport,run=state.run;let cursor=0;
 async function worker(){
  while(cursor<needed.length&&sport===state.sport&&run===state.run){
   const id=needed[cursor++];state.profilePending.add(id);
   try{const profile=await fetchProfile(id);if(sport===state.sport&&run===state.run){state.profiles.set(id,profile);patchVisibleName(id)}}
   catch{state.profileFailed.add(id)}
   finally{state.profilePending.delete(id)}
  }
 }
 await Promise.all(Array.from({length:Math.min(6,needed.length)},worker));
}
async function openPlayer(id){
 const profile=state.profiles.get(id);
 const history=state.model?.athletes.get(id);
 $('dialogTitle').textContent=profile?.name||'Athlete #'+id;
 $('dialogBody').innerHTML='<div class="row">'+
  (profile?.image?'<img src="'+esc(profile.image)+'" alt="" style="height:64px;width:64px;border-radius:9px;object-fit:cover">':'')+
  '<span class="tag">'+esc(profile?.position||'Position unavailable')+'</span>'+
  '<a target="_blank" rel="noopener" href="https://www.espn.com/'+(state.sport==='football'?'college-football':'mens-college-basketball')+'/player/_/id/'+encodeURIComponent(id)+'">ESPN athlete profile ↗</a></div>'+
  '<div class="path">'+[...(history||new Map())].sort((a,b)=>a[0]-b[0]).flatMap(([year,teams])=>[...teams].map(teamId=>'<div class="path-item"><b>'+esc(year)+'</b> · '+esc(state.model?.teams.get(teamId)?.name||teamId)+'</div>')).join('')+'</div>'+
  '<p class="smallnote">Only the selected national seasons are shown. This roster history is not official transfer-portal or professional-draft evidence.</p>';
 $('playerDialog').showModal();
 if(!profile){try{const p=await fetchProfile(id);state.profiles.set(id,p);$('dialogTitle').textContent=p.name;patchVisibleName(id)}catch{}}
}
function exportCSV(){
 const m=state.model;if(!m){setNotice('No verified data available for export.',true);return}
 const {movements,changes,teams}=bySelection();let header=[],rows=[];
 if(state.tab==='moves'){header=['Athlete ID','Name','Last school','Next school','Next season','Classification'];rows=movements.map(x=>[x.id,playerName(x.id),x.from,x.to,x.year,'ESPN inferred roster movement']);}
 else if(state.tab==='teams'){header=['Team','Switches in','Switches out','Roster arrivals','Departures','Retention percent'];rows=teams.map(x=>[x.name,x.switchedIn,x.switchedOut,x.new,x.exits,x.previous?(100*x.retained/x.previous).toFixed(1):'']);}
 else if(state.tab==='routes'){header=['Athlete ID','From','To','Year'];rows=movements.map(x=>[x.id,x.from,x.to,x.year]);}
 else if(state.tab==='draft'){header=['Athlete ID','Name','School','Last observed season','Outcome'];rows=changes.filter(x=>x.type==='departure').map(x=>[x.id,playerName(x.id),x.team,x.year-1,'Unverified']);}
 else if(state.tab==='retention'){header=['Season','School','Status','Roster size'];rows=state.raw.flatMap(s=>s.teams.filter(t=>!state.scope||t.id===state.scope).map(t=>[s.year,t.name,t.status,t.status==='ok'?t.ids.length:'']));}
 else {header=['Year','Total schools','Complete','Partial','Missing','Athlete memberships'];rows=m.coverage.map(x=>[x.year,x.total,x.complete,x.partial,x.missing,x.memberships]);}
 const csv=[header,...rows].map(r=>r.map(x=>'"'+String(x??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download='college-movement-'+state.sport+'-'+state.tab+'.csv';a.click();
 setTimeout(()=>URL.revokeObjectURL(url),600);
}
function init(){
 $('sport').value='football';
 selectYearOptions();state.sport=$('sport').value;
 $('sport').addEventListener('change',()=>{state.sport=$('sport').value;state.scope='';state.profiles.clear();state.profileFailed.clear();state.profilePending.clear();load()});
 $('fromYear').addEventListener('change',()=>setNotice('Year range changed. Select Load index to recalculate.',false));
 $('toYear').addEventListener('change',()=>setNotice('Year range changed. Select Load index to recalculate.',false));
 $('team').addEventListener('change',()=>{state.scope=$('team').value;render()});
 $('search').addEventListener('input',()=>{renderTab()});
 $('rowLimit').addEventListener('change',renderTab);
 $('sortTeams').addEventListener('change',()=>{state.sort=$('sortTeams').value;renderTab()});
 $('load').addEventListener('click',load);$('csv').addEventListener('click',exportCSV);
 $('rank').addEventListener('click',e=>{const btn=e.target.closest('[data-team]');if(btn){$('team').value=btn.dataset.team;state.scope=btn.dataset.team;render()}});
 $('tabContent').addEventListener('click',e=>{
  const p=e.target.closest('[data-person]');if(p){openPlayer(p.dataset.person);return}
  const t=e.target.closest('[data-team]');if(t){state.scope=t.dataset.team;$('team').value=state.scope;render()}
 });
 $('dismiss').addEventListener('click',()=>$('playerDialog').close());
 document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{state.tab=b.dataset.tab;render()}));
 load();
}
init();
})(typeof globalThis!=='undefined'?globalThis:{});
