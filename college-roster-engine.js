/* College Movement Lab: ESPN season-roster engine.
 * No API keys. Compares genuine historical team-season athlete membership.
 * Site-v2 ?season= is intentionally not used for history.
 */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const E={
 football:{sport:'football',league:'college-football',label:'College football',default:'38',fallback:[['38','Colorado Buffaloes'],['333','Alabama Crimson Tide'],['194','Ohio State Buckeyes'],['130','Michigan Wolverines'],['251','Texas Longhorns'],['61','Georgia Bulldogs'],['150','Duke Blue Devils']]},
 basketball:{sport:'basketball',league:'mens-college-basketball',label:"Men's basketball",default:'150',fallback:[['150','Duke Blue Devils'],['2305','Kansas Jayhawks'],['96','Kentucky Wildcats'],['153','North Carolina Tar Heels'],['41','UConn Huskies'],['38','Colorado Buffaloes'],['26','UCLA Bruins']]}
};
const currentYear=new Date().getFullYear();
const state={sport:'football',yearStart:Math.max(2022,currentYear-2),yearEnd:currentYear,teams:[],selected:[],rosters:new Map(),profiles:{},loading:false,run:0,transport:'direct',failures:[],progress:0,planned:0,view:'moves',rows:[],draftRows:[],person:null};
const rosterCachePrefix='cm_espn_roster_v3_',profilePrefix='cm_espn_profile_v3_';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('en-US');
const slug=s=>String(s??'').trim().toLowerCase().replace(/\s+/g,' ');
const idFrom=obj=>{
 if(obj?.id!==undefined&&obj?.id!==null&&/^\d+$/.test(String(obj.id)))return String(obj.id);
 const ref=String(obj?.['$ref']||obj?.href||obj?.athlete?.['$ref']||'');
 const m=ref.match(/\/athletes\/(\d+)(?:[/?#]|$)/);
 return m?m[1]:'';
};
const config=()=>E[state.sport];
const keyOf=(team,year)=>state.sport+':'+team+':'+year;
const cacheRead=k=>{try{return JSON.parse(localStorage.getItem(k))}catch{return null}};
const cacheWrite=(k,x)=>{try{localStorage.setItem(k,JSON.stringify(x))}catch{}};
const message=(s,err=false)=>{let n=$('notice');n.hidden=!s;n.classList.toggle('error',err);n.textContent=s||''};
const updateProgress=s=>$('loaded').textContent=s;
function getProfile(id){return state.profiles[id]||{id,name:'Athlete #'+id,position:'',headshot:'',classYear:''};}
function sanitizeProfile(p,id){
 const a=p?.athlete||p?.person||p||{};
 return{id,name:String(a.displayName||a.fullName||a.name||[a.firstName,a.lastName].filter(Boolean).join(' ')||'Athlete #'+id),position:String(a.position?.abbreviation||a.position?.name||''),headshot:typeof a.headshot==='string'?a.headshot:String(a.headshot?.href||''),classYear:String(a.experience?.abbreviation||a.experience?.displayValue||'')};
}
async function direct(url){
 const ac=new AbortController(),tm=setTimeout(()=>ac.abort(),12000);
 try{
  const res=await fetch(url,{signal:ac.signal,mode:'cors',cache:'default'});
  if(!res.ok){const e=Error('ESPN HTTP '+res.status);e.status=res.status;throw e}
  const obj=await res.json();if(!obj||typeof obj!=='object')throw Error('Invalid ESPN response');return obj;
 }finally{clearTimeout(tm)}
}
async function getJSON(url){
 if(state.transport==='proxy'){
  try{return await direct('https://api.allorigins.win/raw?url='+encodeURIComponent(url))}
  catch(e){throw Error('ESPN access unavailable (proxy): '+e.message)}
 }
 try{return await direct(url)}catch(e){
  if(e.status===404||e.status===400||e.status===429)throw e;
  try{const json=await direct('https://api.allorigins.win/raw?url='+encodeURIComponent(url));state.transport='proxy';return json}
  catch(e2){throw Error('ESPN and cross-origin fallback failed: '+e.message+'; '+e2.message)}
 }
}
function parseTeams(json){
 const leaf=json?.sports?.[0]?.leagues?.[0]?.teams||json?.teams||[];
 const m=new Map();
 for(const raw of leaf){let p=raw.team||raw;let id=String(p.id||'');
  if(!/^\d+$/.test(id))continue;
  m.set(id,{id,name:p.displayName||p.name||p.location||('Team '+id),logo:p.logos?.[0]?.href||'https://a.espncdn.com/i/teamlogos/ncaa/500/'+id+'.png'});
 }
 return [...m.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
async function loadTeams(){
 const c=config();let all=[];
 try{
  if(state.sport==='basketball'){
   const r=await fetch('./data/campus-directory/men.json',{cache:'default'});
   if(r.ok){const d=await r.json();all=(d.teams||[]).map(t=>({id:String(t.id),name:t.name,logo:t.logo}))}
  }
  if(all.length<100){
   const url='https://site.api.espn.com/apis/site/v2/sports/'+c.sport+'/'+c.league+'/teams?groups='+(state.sport==='football'?'80':'50')+'&limit=500';
   all=parseTeams(await getJSON(url));
  }
 }catch(e){message('Could not load the complete school directory. Popular schools are available; ESPN roster requests can still work.',true)}
 const m=new Map(all.map(t=>[t.id,t]));for(const [id,name] of c.fallback)if(!m.has(id))m.set(id,{id,name,logo:'https://a.espncdn.com/i/teamlogos/ncaa/500/'+id+'.png'});
 state.teams=[...m.values()].sort((a,b)=>a.name.localeCompare(b.name));
 fillTeams();if(state.selected.length===0){const init=state.teams.find(t=>t.id===c.default);if(init)state.selected=[init];}
 renderChips();
}
function fillTeams(){
 const pick=$('team'),active=pick.value;pick.replaceChildren();
 for(const t of state.teams)pick.add(new Option(t.name,t.id,t.id===active,t.id===active));
 if(!state.teams.some(t=>t.id===active))pick.value=config().default;
}
function renderChips(){
 const region=$('teamChips');if(!region)return;
 region.innerHTML=state.selected.map(t=>'<span class="tag" style="display:inline-flex;align-items:center;gap:6px;padding:5px 8px"><img src="'+escape(t.logo)+'" width="19" height="19" alt="" style="object-fit:contain"><span>'+escape(t.name)+'</span><button type="button" aria-label="Remove '+escape(t.name)+'" data-remove="'+t.id+'" style="background:none;color:#f3a6a6;border:none;padding:0 2px">✕</button></span>').join('')+'<span class="smallnote">Roster matching covers selected schools only (up to 4).</span>';
}
function addSchool(){
 const v=$('team').value,t=state.teams.find(x=>x.id===v);
 if(!t)return;
 if(state.selected.some(x=>x.id===v)){message('This school is already in the comparison.',false);return}
 if(state.selected.length>=4){message('Select up to four schools to keep the ESPN request volume reasonable.',true);return}
 state.selected.push(t);renderChips();message('School added. Click Load rosters to compare the selected programs.');
}
function prepareYears(){
 for(let year=currentYear+1;year>=2013;year--){
  $('fromYear').add(new Option(year,year));
  $('toYear').add(new Option(year,year));
 }
 $('fromYear').value=String(state.yearStart);
 $('toYear').value=String(state.yearEnd);
}
function playerBase(s){return 'https://sports.core.api.espn.com/v2/sports/'+s.sport+'/leagues/'+s.league+'/athletes/'}
function seasonBase(s,team,year){return 'https://sports.core.api.espn.com/v2/sports/'+s.sport+'/leagues/'+s.league+'/seasons/'+year+'/teams/'+team+'/athletes?limit=200&lang=en&region=us'}
async function fetchRoster(team,year,run){
 const label=keyOf(team.id,year);
 const saved=cacheRead(rosterCachePrefix+label),ttl=year>=currentYear?12*3600000:180*24*3600000;
 if(saved?.at&&Date.now()-saved.at<ttl&&saved.ids?.length&&saved.complete){
  return {...saved,teamId:team.id,teamName:team.name,year};
 }
 const url=seasonBase(config(),team.id,year);
 const first=await getJSON(url);
 if(run!==state.run)throw Error('Cancelled');
 const pageCount=Number(first.pageCount)||1;
 const items=[...(first.items||[])],maxPages=8;
 let failedPages=0;
 for(let p=2;p<=Math.min(pageCount,maxPages);p++){
  try{const more=await getJSON(url+'&page='+p);items.push(...(more.items||[]))}
  catch{failedPages++}
  if(run!==state.run)throw Error('Cancelled');
 }
 const ids=[...new Set(items.map(idFrom).filter(Boolean))];
 if(!ids.length)throw Error('ESPN returned no athletes for '+team.name+' '+year);
 const expectedCount=Number(first.count)||ids.length;
 const complete=!failedPages&&pageCount<=maxPages&&ids.length>=expectedCount;
 const result={at:Date.now(),ids,complete,unresolvedPages:failedPages,teamId:team.id,teamName:team.name,year};
 if(complete)cacheWrite(rosterCachePrefix+label,result);
 return result;
}
async function hydrate(run){
 const allIds=[...new Set([...state.rosters.values()].flatMap(r=>r.ids))].filter(id=>!state.profiles[id]);
 updateProgress('Roster membership loaded. Resolving '+fmt(allIds.length)+' ESPN player profiles…');
 let index=0,done=0,failed=0;
 async function worker(){
  while(index<allIds.length&&run===state.run){
   const id=allIds[index++];
   try{
    const result=await getJSON(playerBase(config())+id+'?lang=en&region=us');
    if(run!==state.run)return;
    state.profiles[id]=sanitizeProfile(result,id);
   }catch{failed++}
   done++;
   if(done%25===0||done===allIds.length){
    updateProgress(fmt(state.rosters.size)+' roster snapshots · '+fmt(done)+'/'+fmt(allIds.length)+' player profiles · '+fmt(failed)+' unresolved');
    render();cacheWrite(profilePrefix+state.sport,state.profiles);
   }
  }
 }
 await Promise.all(Array.from({length:Math.min(10,allIds.length)},worker));
 cacheWrite(profilePrefix+state.sport,state.profiles);
 if(failed)message('Loaded rosters, but '+failed+' player profiles could not be resolved. Athlete IDs and roster changes remain available.',false);
}
async function load(){
 if(state.loading){state.run++;state.loading=false}
 const run=++state.run;
 const start=Number($('fromYear').value),end=Number($('toYear').value);
 if(!state.selected.length){message('Add a school before loading rosters.',true);return}
 if(end<start||end-start>5){message('Choose a valid range of up to six consecutive seasons.',true);return}
 state.yearStart=start;state.yearEnd=end;state.rosters.clear();state.failures=[];
 state.profiles=cacheRead(profilePrefix+state.sport)||{};
 state.loading=true;$('load').disabled=true;$('load').textContent='Loading ESPN…';message('',false);
 const tasks=state.selected.flatMap(t=>Array.from({length:end-start+1},(_,i)=>({t,year:start+i})));
 let cursor=0,done=0;
 async function worker(){
  while(cursor<tasks.length&&run===state.run){
   const job=tasks[cursor++];
   try{const result=await fetchRoster(job.t,job.year,run);if(run===state.run)state.rosters.set(keyOf(job.t.id,job.year),result)}
   catch(e){if(e.message!=='Cancelled')state.failures.push(job.t.name+' '+job.year+': '+e.message)}
   done++;if(run===state.run){updateProgress('ESPN roster indexes '+done+'/'+tasks.length+' · '+state.rosters.size+' loaded');render()}
  }
 }
 try{
  await Promise.all(Array.from({length:Math.min(3,tasks.length)},worker));
  if(run!==state.run)return;
  if(state.failures.length)message('Partial roster coverage: '+state.failures.slice(0,3).join(' · ')+(state.failures.length>3?' …':''),true);
  if(!state.rosters.size){message('ESPN did not provide valid season rosters. Check access and try a narrower year range.',true);return}
  render();await hydrate(run);if(run!==state.run)return;
  updateProgress(fmt(state.rosters.size)+' historical roster snapshots · '+fmt(new Set([...state.rosters.values()].flatMap(r=>r.ids)).size)+' unique ESPN athlete IDs');
 }finally{
  if(run===state.run){state.loading=false;$('load').disabled=false;$('load').textContent='↻ Load rosters';render()}
 }
}
function calculate(){
 const athletes=new Map(),stats=new Map(),rosters=[...state.rosters.values()];
 for(const t of state.selected)stats.set(t.id,{team:t,years:[],total:0,retained:0,new:0,departed:0,switchesIn:0,switchesOut:0,comparisons:0});
 for(const r of rosters){
  for(const id of r.ids){
   if(!athletes.has(id))athletes.set(id,[]);
   athletes.get(id).push({teamId:r.teamId,teamName:r.teamName,year:r.year});
  }
 }
 const transitions=[];
 for(const [id,entries] of athletes){
  entries.sort((a,b)=>a.year-b.year||a.teamName.localeCompare(b.teamName));
  for(let i=1;i<entries.length;i++){
   const a=entries[i-1],b=entries[i];
   if(a.teamId!==b.teamId&&b.year>a.year){
    transitions.push({id,player:getProfile(id).name,from:a.teamName,to:b.teamName,fromId:a.teamId,toId:b.teamId,year:b.year,previousYear:a.year,gap:b.year-a.year,verified:false});
   }
  }
 }
 const changes=[];
 for(const t of state.selected){
  const st=stats.get(t.id);
  for(let year=state.yearStart;year<=state.yearEnd;year++){
   const curr=state.rosters.get(keyOf(t.id,year)),prev=state.rosters.get(keyOf(t.id,year-1));
   if(!curr)continue;
   st.total+=curr.ids.length;
   let newCount=null,returning=null,departed=null;
   if(prev&&prev.complete&&curr.complete){
    const a=new Set(prev.ids),b=new Set(curr.ids);
    returning=curr.ids.filter(id=>a.has(id)).length;
    newCount=curr.ids.filter(id=>!a.has(id)).length;
    departed=prev.ids.filter(id=>!b.has(id)).length;
    st.comparisons++;st.retained+=returning;st.new+=newCount;st.departed+=departed;
    for(const id of curr.ids)if(!a.has(id))changes.push({id,team:t.name,teamId:t.id,year,kind:'New roster appearance',position:getProfile(id).position});
    for(const id of prev.ids)if(!b.has(id))changes.push({id,team:t.name,teamId:t.id,year,kind:'No longer on roster',position:getProfile(id).position});
   }
   st.years.push({year,count:curr.ids.length,returning,newCount,departed,complete:curr.complete&&(!prev||prev.complete)});
  }
 }
 for(const tr of transitions){
  if(stats.has(tr.fromId))stats.get(tr.fromId).switchesOut++;
  if(stats.has(tr.toId))stats.get(tr.toId).switchesIn++;
 }
 return{athletes,stats,transitions,changes,rosters};
}
function table(cols,rows,empty='No records in the selected scope.'){
 state.rows=rows;
 const lim=Math.min(+$('rowLimit').value||250,rows.length);
 if(!rows.length)return '<div class="empty">'+escape(empty)+'</div>';
 return '<div class="tablewrap"><table class="table"><thead><tr>'+cols.map(x=>'<th>'+escape(x)+'</th>').join('')+'</tr></thead><tbody>'+rows.slice(0,lim).map(r=>'<tr>'+r.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'+(rows.length>lim?'<div class="subtabs">Showing '+fmt(lim)+' of '+fmt(rows.length)+' rows. CSV exports all matching records.</div>':'');
}
function playerButton(id){
 const p=getProfile(id);
 return '<button class="click" data-person="'+escape(id)+'" title="View athlete history">'+escape(p.name)+'</button>';
}
function render(){
 const {athletes,stats,transitions,changes,rosters}=calculate();
 const comparisons=[...stats.values()].filter(s=>s.comparisons);
 const totalNew=comparisons.reduce((n,s)=>n+s.new,0),totalOut=comparisons.reduce((n,s)=>n+s.departed,0);
 const totalReturn=comparisons.reduce((n,s)=>n+s.retained,0);
 const kpis=[athletes.size,transitions.length,totalNew,totalOut,rosters.length];
 for(const [i,id] of ['kEntries','kLanded','kOpen','kSchools','kDraft'].entries())$(id).textContent=rosters.length?fmt(kpis[i]):'—';
 const names=['Players observed','School switches observed','Roster newcomers','Roster departures','Roster snapshots'];
 ['kEntries','kLanded','kOpen','kSchools','kDraft'].forEach((id,i)=>$(id).parentElement.querySelector('small').textContent=names[i]);
 const subtitles=['Distinct ESPN athlete IDs','Only switches between selected schools','Consecutive verified team seasons','Not necessarily transfers or pro exits','Team-season coverage'];
 ['kEntries','kLanded','kOpen','kSchools','kDraft'].forEach((id,i)=>$(id).parentElement.querySelector('span').textContent=subtitles[i]);
 const years=Array.from({length:state.yearEnd-state.yearStart+1},(_,i)=>state.yearStart+i);
 const points=years.map(y=>({year:y,entered:[...stats.values()].reduce((n,s)=>n+s.years.filter(q=>q.year===y).reduce((p,q)=>p+(q.newCount||0),0),0),moved:transitions.filter(t=>t.year===y).length}));
 const peak=Math.max(1,...points.map(p=>p.entered),...points.map(p=>p.moved));
 $('trend').innerHTML=points.map(p=>'<div class="bar-group"><div class="bars"><div class="bar portals" title="'+p.year+': '+p.entered+' newcomers" style="height:'+(p.entered*100/peak)+'%"></div><div class="bar committed" title="'+p.year+': '+p.moved+' school switches" style="height:'+(p.moved*100/peak)+'%"></div></div><em>'+fmt(p.entered)+'</em><small>'+p.year+'</small></div>').join('');
 document.querySelector('.charts .panelhead h2').textContent='Year-over-year roster movement';
 document.querySelector('.charts .panelhead p').textContent='New arrivals vs. observed school switches';
 document.querySelector('.legend').innerHTML='<span><i class="dot blue"></i>New to roster</span><span><i class="dot green"></i>Observed school switches</span><span>ESPN season-roster inference</span>';
 document.querySelectorAll('.tab').forEach(t=>t.setAttribute('aria-selected',String(t.dataset.tab===state.view)));
 $('moveFilter').hidden=true;
 $('rank').innerHTML=[...stats.values()].sort((a,b)=>b.new-a.new).map(s=>'<div class="rankrow"><span class="name" title="'+escape(s.team.name)+'">'+escape(s.team.name)+'</span><div class="track"><i style="width:'+(s.new*100/Math.max(1,...[...stats.values()].map(x=>x.new)))+'%"></i></div><b>'+fmt(s.new)+'</b></div>').join('')||'<div class="empty">Choose a team to see its roster changes.</div>';
 document.querySelector('.charts .panel:nth-child(2) .panelhead h2').textContent='New roster appearances by school';
 document.querySelector('.charts .panel:nth-child(2) .panelhead p').textContent='Only years with complete adjacent rosters';
 const q=slug($('search').value);
 const match=x=>!q||slug(x).includes(q);
 const sortedMoves=transitions.filter(t=>match([t.player,t.from,t.to,t.year].join(' '))).sort((a,b)=>b.year-a.year||a.player.localeCompare(b.player));
 if(state.view==='moves'){
  $('viewTitle').textContent='Observed school switches · '+fmt(sortedMoves.length);
  $('viewDescription').textContent='Player IDs matching different selected schools in different years. Portal entry itself is NOT verified.';
  let html=table(['Year','Player','From','To','Gap','Classification'],sortedMoves.map(t=>[escape(t.year),playerButton(t.id),escape(t.from),escape(t.to),escape(t.gap===1?'Adjacent seasons':t.gap+'-year gap'),'<span class="tag">Roster-inferred</span>']),'No school-to-school switches in this comparison. Add other schools or browse the roster changes below.');
  const changed=changes.filter(c=>match([getProfile(c.id).name,c.team,c.year,c.kind].join(' '))).sort((a,b)=>b.year-a.year||a.team.localeCompare(b.team));
  html+='<div class="subtabs"><strong>Roster arrivals &amp; departures</strong><p>Players can leave without transferring, and their destination may be outside the scanned schools.</p></div>';
  html+=table(['Season','Player','School','Roster status'],changed.map(c=>[escape(c.year),playerButton(c.id),escape(c.team),escape(c.kind)]),'Compare two adjacent seasons to see arrivals and departures.');
  $('tabContent').innerHTML=html;
 }else if(state.view==='teams'){
  $('viewTitle').textContent='Roster turnover by school';
  $('viewDescription').textContent='Comparisons require complete rosters in consecutive years.';
  const list=[...stats.values()].filter(s=>match(s.team.name)).sort((a,b)=>b.new-a.new);
  $('tabContent').innerHTML=table(['School','Players across seasons','Returners','New arrivals','Departures','Observed transfers in/out'],list.map(s=>[escape(s.team.name),fmt(s.total),fmt(s.retained),fmt(s.new),fmt(s.departed),fmt(s.switchesIn)+' / '+fmt(s.switchesOut)]),'No school matches the filter.');
 }else if(state.view==='routes'){
  $('viewTitle').textContent='Cross-school movement paths';
  $('viewDescription').textContent='Only transfers visible between the schools and seasons you selected.';
  const routes=new Map();
  for(const t of sortedMoves){const k=t.fromId+'>'+t.toId;if(!routes.has(k))routes.set(k,{from:t.from,to:t.to,n:0,players:[]});const r=routes.get(k);r.n++;r.players.push(t.player)}
  $('tabContent').innerHTML=table(['Origin','Destination','Observed switches','Players'],[...routes.values()].sort((a,b)=>b.n-a.n).map(r=>[escape(r.from),escape(r.to),fmt(r.n),escape(r.players.slice(0,5).join(', '))]),'No cross-school movement is observed within the scanned team set.');
 }else if(state.view==='draft'){
  $('viewTitle').textContent='College departures · professional status unverified';
  $('viewDescription').textContent='ESPN roster disappearance does not establish graduation, portal transfer, NFL/NBA eligibility or draft status.';
  const exits=changes.filter(c=>c.kind==='No longer on roster'&&match([getProfile(c.id).name,c.team,c.year].join(' '))).sort((a,b)=>b.year-a.year);
  $('tabContent').innerHTML=table(['Last seen season','Player','School','Possible next step'],exits.map(r=>[escape(r.year-1),playerButton(r.id),escape(r.team),'<span class="pending">Unverified (may have transferred, graduated, or left)</span>']),'No consecutive-season exits were observed.');
 }else{
  $('viewTitle').textContent='Season roster snapshots';
  $('viewDescription').textContent='A roster is checked only when ESPN provides season-scoped athlete IDs; no missing years treated as zero.';
  const list=[...stats.values()].flatMap(s=>s.years.map(y=>({...y,team:s.team.name}))).filter(r=>match(r.team+' '+r.year)).sort((a,b)=>b.year-a.year||a.team.localeCompare(b.team));
  $('tabContent').innerHTML=table(['Season','School','Players','Returners','New','Departed','Coverage'],list.map(r=>[escape(r.year),escape(r.team),fmt(r.count),r.returning===null?'—':fmt(r.returning),r.newCount===null?'—':fmt(r.newCount),r.departed===null?'—':fmt(r.departed),r.complete?'<span class="good">Complete snapshot</span>':'<span class="pending">Partial / no comparison</span>']),'No valid roster snapshots are loaded.');
 }
 if(rosters.length){
  $('keyStatus').textContent='ESPN rosters · no key';
  $('coverage').textContent=state.selected.length+' team(s) · '+fmt(rosters.length)+' / '+fmt(state.selected.length*years.length)+' roster years'+(state.failures.length?' · partial coverage':'');
 }else{
  $('keyStatus').textContent='ESPN API · no key required';
  $('coverage').textContent='Historical rosters from ESPN Core API (not a verified transfer-portal list)';
 }
}
function playerDialog(id){
 const {athletes}=calculate(),history=athletes.get(id)||[],p=getProfile(id);
 $('dialogTitle').textContent=p.name;
 const link='https://www.espn.com/'+(state.sport==='football'?'college-football':'mens-college-basketball')+'/player/_/id/'+encodeURIComponent(id);
 $('dialogBody').innerHTML='<div class="row">'+(p.headshot?'<img src="'+escape(p.headshot)+'" alt="" style="width:65px;height:65px;object-fit:cover;border-radius:8px">':'')+'<span class="tag">'+escape(p.position||'Position unknown')+'</span><a href="'+link+'" target="_blank" rel="noopener">ESPN player profile ↗</a></div><div class="path">'+history.sort((a,b)=>a.year-b.year).map(h=>'<div class="path-item"><strong>'+escape(h.year)+'</strong> · '+escape(h.teamName)+'</div>').join('')+'</div><div class="smallnote">Team history includes only schools and seasons loaded into this dashboard. Playing at another school, using the portal, or going pro cannot be inferred from missing seasons.</div>';
 $('playerDialog').showModal();
}
function csv(){
 const {athletes,transitions,stats,changes,rosters}=calculate();const q=slug($('search').value);
 let cols=[],records=[];
 if(state.view==='moves'){cols=['Athlete ID','Name','Old school','New school','Old season','New season','Source'];records=transitions.filter(t=>!q||slug([t.player,t.from,t.to].join(' ')).includes(q)).map(t=>[t.id,getProfile(t.id).name,t.from,t.to,t.previousYear,t.year,'ESPN roster inference']);}
 else if(state.view==='teams'){cols=['School','Returners','New','Departed','Observed in','Observed out'];records=[...stats.values()].map(s=>[s.team.name,s.retained,s.new,s.departed,s.switchesIn,s.switchesOut]);}
 else if(state.view==='routes'){cols=['Player','From','To','Year'];records=transitions.map(t=>[getProfile(t.id).name,t.from,t.to,t.year]);}
 else if(state.view==='draft'){cols=['Player','School','Last visible season','Pro status'];records=changes.filter(c=>c.kind==='No longer on roster').map(c=>[getProfile(c.id).name,c.team,c.year-1,'Not verified']);}
 else {cols=['Year','School','Roster IDs','Complete'];records=rosters.map(r=>[r.year,r.teamName,r.ids.length,r.complete]);}
 const text=[cols,...records].map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\ufeff'+text],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='college-roster-movement-'+state.sport+'-'+state.view+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),300);
}
async function changeSport(){
 state.run++;state.loading=false;state.sport=$('sport').value;state.selected=[];state.rosters.clear();state.profiles={};state.teams=[];state.transport='direct';state.failures=[];
 $('load').disabled=false;$('load').textContent='↻ Load rosters';
 message('',false);await loadTeams();render();
}
function init(){
 const sp=new URLSearchParams(location.search).get('sport');if(E[sp])$('sport').value=sp;
 state.sport=$('sport').value;prepareYears();
 // In the live historical app, the school picker adds one school at a time.
 const add=$('addTeam');if(add)add.addEventListener('click',addSchool);
 $('teamChips').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(!b)return;state.selected=state.selected.filter(t=>t.id!==b.dataset.remove);renderChips();message('School removed. Click Load rosters to rebuild the comparison.');});
 $('load').addEventListener('click',load);$('sport').addEventListener('change',changeSport);
 $('fromYear').addEventListener('change',()=>message('Year range changed. Click Load rosters.'));
 $('toYear').addEventListener('change',()=>message('Year range changed. Click Load rosters.'));
 $('search').addEventListener('input',render);$('rowLimit').addEventListener('change',render);
 document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{state.view=btn.dataset.tab;render()}));
 $('tabContent').addEventListener('click',e=>{const b=e.target.closest('[data-person]');if(b)playerDialog(b.dataset.person)});
 $('dismiss').addEventListener('click',()=>$('playerDialog').close());$('csv').addEventListener('click',csv);
 $('keyStatus').textContent='ESPN API · no key required';
 loadTeams().then(()=>{render();load()});
}
init();
})();