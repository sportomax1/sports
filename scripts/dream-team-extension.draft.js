
// DREAM TEAM EXTENSION — within the main page IIFE, before init().
var POSITION_ROLES=[
 {key:'pg',label:'PG',name:'Point guard',tone:'pg'},
 {key:'sg',label:'SG',name:'Shooting guard',tone:'sg'},
 {key:'sf',label:'SF',name:'Small forward',tone:'sf'},
 {key:'pf',label:'PF',name:'Power forward',tone:'pf'},
 {key:'c',label:'C',name:'Center',tone:'c'},
 {key:'sixth',label:'6TH',name:'Best available',tone:'stl'}
], LEAGUE_NAMES={'nba':'NBA','mens-college-basketball':'NCAA Men','womens-college-basketball':'NCAA Women'};
function positionOptions(position){
 var p=text(position).toUpperCase().replace(/[^A-Z]/g,'');
 var lookup={PG:['pg'],SG:['sg'],SF:['sf'],PF:['pf'],C:['c'],G:['pg','sg'],F:['sf','pf'],GF:['sg','sf'],FG:['sg','sf'],FC:['pf','c'],CF:['pf','c']};
 return lookup[p]||[]
}
function allroundScore(p){
 return metric(p,'pts')+metric(p,'reb')+2*metric(p,'ast')+metric(p,'blk')+metric(p,'stl')-metric(p,'to')
}
function activeRoles(){return S.build==='allround'?POSITION_ROLES:ROLES}
var oldLoad=loadPreferences,oldUpdate=updateFilters,oldRange=range;
loadPreferences=function(){
 oldLoad();
 try{var v=JSON.parse(localStorage.getItem('dream-team-pref-v2')||'{}');
  if(v.mode==='week')S.mode='week';
  if(LEAGUE_NAMES[v.league])S.league=v.league;
  if(v.build==='allround')S.build='allround';
  if(v.week&&/^\d{4}-\d{2}-\d{2}$/.test(v.week)&&v.week<=today)S.week=v.week
 }catch(e){}
 S.rank=S.build==='allround'?'pg':'pts'
};
savePreferences=function(){
 try{localStorage.setItem('dream-team-pref-v2',JSON.stringify({mode:S.mode,league:S.league,build:S.build,day:S.day,week:S.week,month:S.month,season:S.season,type:S.type,measure:S.measure}))}catch(e){}
};
range=function(){
 if(S.mode==='week'){
  var d=new Date(S.week+'T12:00:00'),first=shift(S.week,-((d.getDay()+6)%7));
  return {start:first,end:shift(first,6),label:'Week of '+first}
 }
 if(S.mode!=='season')return oldRange();
 var college=S.league!=='nba',start=(S.season-1)+(college?'-11-01':'-10-01'),end=S.season+(college?'-03-20':'-04-20');
 if(S.type==='3'){start=S.season+(college?'-03-01':'-04-01');end=S.season+(college?'-04-30':'-06-30')}
 if(S.type==='all')end=S.season+(college?'-04-30':'-06-30');
 return {start:start,end:end,label:(S.season-1)+'–'+String(S.season).slice(-2)+' '+LEAGUE_NAMES[S.league]+' season'}
};
updateFilters=function(){
 oldUpdate();
 $('weekField').classList.toggle('hidden',S.mode!=='week');$('week').value=S.week;$('week').max=today;
 $('nextWeek').disabled=S.week>=today;$('league').value=S.league;
 Array.from($('buildModes').querySelectorAll('button')).forEach(function(b){b.classList.toggle('active',b.dataset.build===S.build)});
 $('rangeText').textContent=range().label+' · '+(S.type==='2'?'Regular':S.type==='3'?'Postseason':'All games');
 var all=S.build==='allround';
 $('buildDescription').textContent=all?'Best positional starting five, then highest-scoring remaining sixth man.':'Five complementary specialists plus a steals specialist.';
 $('buildFormula').textContent=all?'PTS + REB + 2×AST + BLK + STL − TO':'PTS · 3PM · AST · REB · BLK + STL';
 $('rosterKpiTitle').textContent=all?'All-around lineup':'Roster specialists';
 $('scoreKpiTitle').textContent=all?'Team composite':'Specialty coverage';
 $('scoreKpiHint').textContent=all?'Sum of six player scores':'Combined % of category leaders';
 $('lineupDescription').textContent=all?'Optimize one PG, SG, SF, PF and C from reported ESPN positions.':'Flexible positions · unique statistical specialties.';
 $('ranksTitle').textContent=all?'All-around rankings by position':'Specialist leaderboards';
 $('legendTitle').textContent=all?'Five positions + sixth man':'Six statistical specialties';
 $('legendDescription').textContent=all?'Sixth man has no position restriction. No duplicate players.':'PTS, 3PM, AST, REB and BLK starters; STL sixth man.';
 savePreferences()
};
var baseMetric=metric,baseRanking=ranking,baseAssign=assign,baseCard=playerCard,baseDraw=drawCards,baseRanks=renderRanks,baseRender=render;
metric=function(p,key){return key==='overall'?allroundScore(p):baseMetric(p,key)};
ranking=function(key){
 if(S.build!=='allround')return baseRanking(key);
 return eligible().filter(function(p){return key==='sixth'||positionOptions(p.position).includes(key)}).sort(function(a,b){
  return allroundScore(b)-allroundScore(a)||b.games-a.games||a.name.localeCompare(b.name)
 })
};
assign=function(){
 if(S.build!=='allround')return baseAssign();
 var players=eligible(),locks=S.forced,benchLock=locks.sixth||null,reserved={},dp=Array(32).fill(null);
 Object.keys(locks).forEach(function(k){reserved[locks[k]]=k});
 dp[0]={score:0,picks:{}};
 players.forEach(function(p){
  if(p.id===benchLock)return;
  var positions=positionOptions(p.position),value=allroundScore(p);
  for(var mask=31;mask>=0;mask--){var prior=dp[mask];if(!prior)continue;
   for(var i=0;i<5;i++){
    var role=POSITION_ROLES[i],bit=1<<i,next=mask|bit;
    if((mask&bit)||!positions.includes(role.key))continue;
    if(locks[role.key]&&locks[role.key]!==p.id)continue;
    if(reserved[p.id]&&reserved[p.id]!==role.key)continue;
    var score=prior.score+value;
    if(!dp[next]||score>dp[next].score+1e-9)dp[next]={score:score,picks:Object.assign({},prior.picks,{[role.key]:p})}
   }
  }
 });
 var best=dp[31],line=best?Object.assign({},best.picks):{},used=new Set(Object.values(line).map(function(p){return p.id}));
 var bench=players.filter(function(p){return !used.has(p.id)&&(!benchLock||p.id===benchLock)}).sort(function(a,b){return allroundScore(b)-allroundScore(a)})[0];
 if(best&&bench){line.sixth=bench;S.score=best.score+allroundScore(bench)}else S.score=0;
 S.lineup=best?line:{}
};
playerCard=function(r,i){
 if(S.build!=='allround')return baseCard(r,i);
 var p=S.lineup[r.key];
 if(!p)return '<article class="player" data-role="'+r.tone+'"><div class="slot">'+r.label+'</div><div class="headempty">◌</div><div class="pname muted">Position unfilled</div><div class="pteam">No eligible players with this position.</div></article>';
 var breakdown=['pts','reb','ast','stl','to'].map(function(k){return '<span class="ministat">'+k.toUpperCase()+' '+format(metric(p,k))+'</span>'}).join('');
 return '<article class="player" data-role="'+r.tone+'"><div class="slot">'+r.label+' · ALL-AROUND</div><div class="role">'+esc(r.name)+' · '+esc(p.position||'Unlisted')+'</div><div class="photoarea">'+imageTag(athleteImg(p),'photo',p.name)+imageTag(teamImg(p),'teamlogo',p.team)+'</div><div class="pname" title="'+esc(p.name)+'">'+esc(p.name)+'</div><div class="pteam">'+esc(p.team)+' · '+p.games+' GP</div><div class="heroStat"><strong>'+format(allroundScore(p))+'</strong><span>SCORE'+(S.measure==='avg'&&S.mode!=='day'?'/G':'')+'</span></div><div class="statmore">'+breakdown+'</div><button data-details="'+esc(p.id)+'">View player stats ↗</button></article>'
};
drawCards=function(){
 if(S.build!=='allround'){baseDraw();$('bench').dataset.build='specialists';return}
 $('starters').innerHTML=POSITION_ROLES.slice(0,5).map(playerCard).join('');
 var p=S.lineup.sixth;$('bench').dataset.build='allround';
 $('bench').innerHTML='<div class="benchtop"><div class="eyebrow">SIXTH MAN</div><b>Best remaining</b></div>'+(p?imageTag(athleteImg(p),'benchpic',p.name):'<div class="headempty">✳</div>')+
 '<div><div class="meta">OVERALL SCORE · ANY POSITION</div><div style="font-weight:900;font-size:16px">'+(p?esc(p.name):'No eligible player')+'</div><div class="muted">'+(p?esc(p.team)+' · '+p.games+' GP':'Adjust minimum games')+'</div></div><div style="text-align:right"><div class="benchvalue">'+(p?format(allroundScore(p)):'—')+'</div><div class="sub">COMPOSITE'+(S.measure==='avg'&&S.mode!=='day'?'/G':'')+'</div>'+(p?'<button data-details="'+esc(p.id)+'">Player details ↗</button>':'')+'</div>'
};
renderRanks=function(){
 if(S.build!=='allround'){baseRanks();return}
 Array.from($('rankingTabs').querySelectorAll('button')).forEach(function(b){b.classList.toggle('active',b.dataset.role===S.rank)});
 var rows=ranking(S.rank),q=S.query.toLowerCase(),shown=rows.filter(function(p){return (p.name+' '+p.team).toLowerCase().includes(q)}).slice(0,50);
 $('rankingCount').textContent=format(rows.length,0)+' eligible';$('statCol').textContent='Score';
 $('rankingBody').innerHTML=shown.length?shown.map(function(p){
  var chosen=Object.values(S.lineup).some(function(z){return z.id===p.id}),here=S.lineup[S.rank]&&S.lineup[S.rank].id===p.id,locked=S.forced[S.rank]===p.id;
  return '<tr class="'+(here?'chosen':'')+'"><td>'+(rows.indexOf(p)+1)+'</td><td><div class="linePlayer">'+imageTag(athleteImg(p),'',p.name)+'<span><b>'+esc(p.name)+'</b><small>'+esc(p.team)+' · '+esc(p.position||'Unlisted')+(chosen?' · Dream Team':'')+'</small></span></div></td><td>'+p.games+'</td><td class="val">'+format(allroundScore(p))+'</td><td><button class="btn tiny" data-pick="'+esc(p.id)+'">'+(locked?'Unlock':here?'Selected':'Pick')+'</button></td></tr>'
 }).join(''):'<tr><td colspan="5" class="muted" style="padding:18px">No position-eligible players.</td></tr>';
 $('rankingNote').textContent='Composite = PTS + REB + 2×AST + BLK + STL − TO · '+(S.measure==='avg'?'per game':'totals')+' · '+S.minGames+' minimum games · Pick to lock a position.';
};
render=function(){
 if(S.build!=='allround'){baseRender()}else{
  var count=Object.keys(S.lineup).length;
  $('kPlayers').textContent=format(S.players.length,0);$('kGames').textContent=format(S.gameCount,0);$('kRoster').textContent=count+' / 6';$('kScore').textContent=count===6?format(S.score):'—';
  drawCards();renderRanks();$('reset').disabled=!Object.keys(S.forced).length
 }
 $('coverage').textContent=LEAGUE_NAMES[S.league]+' · '+S.gameCount+' box scores · '+S.emptyDays+' no-game dates skipped · '+eligible().length+' eligible players · '+S.errors.length+' errors'+(S.errors.length?'. First error: '+S.errors[0]:'')+(S.stale?' · Partial coverage':'')
};
var baseDetails=details,baseExport=downloadCsv,baseCopy=copyTeam;
details=function(id){
 if(S.build!=='allround'){baseDetails(id);return}
 var p=S.players.find(function(x){return x.id===id});if(!p)return;
 var stats=statKeys.map(function(k){return '<div class="modstat"><small>'+k.toUpperCase()+'</small><b>'+format(p.totals[k],0)+'</b><small>'+format(p.totals[k]/p.games)+'/G</small></div>'}).join('');
 $('modalContent').innerHTML='<div class="modalhead">'+imageTag(athleteImg(p),'',p.name)+'<div><div class="eyebrow">'+esc(p.team)+' · '+esc(p.position||'Unlisted')+'</div><h3>'+esc(p.name)+'</h3><div class="muted">'+p.games+' games · composite '+format(allroundScore(p))+'</div></div></div><div class="modstats">'+stats+'</div><div class="notice">PTS + REB + 2×AST + BLK + STL − TO</div>';
 $('details').showModal()
};
downloadCsv=function(){
 if(S.build!=='allround'){baseExport();return}
 var rows=[['League','Window','Role','Player','Team','Games','Composite','PTS','REB','AST','BLK','STL','TO']];
 POSITION_ROLES.forEach(function(r){var p=S.lineup[r.key];if(p)rows.push([LEAGUE_NAMES[S.league],range().label,r.label,p.name,p.team,p.games,format(allroundScore(p),2),...['pts','reb','ast','blk','stl','to'].map(function(k){return format(metric(p,k),2)})])});
 if(rows.length===1)return;
 var csv=rows.map(function(a){return a.map(function(x){return '"'+text(x).replace(/"/g,'""')+'"'}).join(',')}).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
 a.href=url;a.download='dream-team-allaround-'+S.league+'-'+range().start+'.csv';a.click();setTimeout(function(){URL.revokeObjectURL(url)},1000)
};
copyTeam=async function(){
 if(S.build!=='allround'){await baseCopy();return}
 var lines=[LEAGUE_NAMES[S.league]+' Dream Team · '+range().label,'PTS + REB + 2×AST + BLK + STL − TO'];
 POSITION_ROLES.forEach(function(r){var p=S.lineup[r.key];lines.push(r.label+' · '+(p?p.name+' ('+p.team+') · '+format(allroundScore(p)):'Unfilled'))});
 try{await navigator.clipboard.writeText(lines.join('\n'));setState('Lineup copied.','good')}catch(e){setState('Clipboard unavailable, try CSV.','error')}
};
function refreshRoleUI(){
 var roles=activeRoles(),all=S.build==='allround';
 if(!roles.some(function(r){return r.key===S.rank}))S.rank=roles[0].key;
 $('rankingTabs').innerHTML=roles.map(function(r){return '<button class="tab '+(S.rank===r.key?'active':'')+'" data-role="'+r.key+'">'+r.label+' · '+r.name+'</button>'}).join('');
 $('statLegend').innerHTML=roles.map(function(r,i){return '<div class="legend"><span>'+(i===5?'Sixth man · ':'Starter · ')+esc(r.name)+'</span><span>'+(all?'OVERALL':r.label)+'</span></div>'}).join('');
 $('ruleList').innerHTML=all?'<li>PTS + REB + 2×AST + BLK + STL − TO.</li><li>Five unique position-eligible starters maximize combined score.</li><li>Highest-scoring remaining player is sixth man.</li><li>Per-game or total stats across daily, weekly, monthly or seasonal windows.</li><li>Missing player positions are never guessed.</li>':
 '<li>Five starters: PTS, 3PM, AST, REB, BLK. Sixth: STL.</li><li>Positions are flexible and players unique.</li><li>Week runs Monday through Sunday.</li><li>Days without completed games use no box-score requests.</li>'
}
async function navigateGameDay(step){
 var d=S.day,issue='';setState('Searching for a completed game day…');
 for(var n=0;n<40;n++){
  d=shift(d,step);if(d>today||d<'2010-01-01')break;
  try{var games=await getBoard(d,new AbortController().signal,false);
   if(games.some(function(g){return g.completed&&(S.type==='all'||g.seasonType===Number(S.type)))){S.day=d;updateFilters();scan(false);return}
  }catch(e){issue=e.message;break}
 }
 setState(issue?'Navigation error: '+issue:'No completed games found within 40 days.',issue?'error':'')
}
function enhancedInit(){
 $('buildModes').onclick=function(e){
  var b=e.target.closest('[data-build]');if(!b||S.build===b.dataset.build)return;
  S.build=b.dataset.build;S.rank=S.build==='allround'?'pg':'pts';S.forced={};updateFilters();refreshRoleUI();recompute()
 };
 $('league').onchange=function(e){if(S.abort)S.abort.abort();S.league=e.target.value;S.team='all';S.forced={};updateFilters();scan(false)};
 $('prev').onclick=function(){navigateGameDay(-1)};$('next').onclick=function(){navigateGameDay(1)};
 $('prevWeek').onclick=function(){S.week=shift(S.week,-7);updateFilters();scan(false)};
 $('nextWeek').onclick=function(){S.week=shift(S.week,7);if(S.week>today)S.week=today;updateFilters();scan(false)};
 $('week').onchange=function(e){if(e.target.value){S.week=e.target.value;updateFilters();scan(false)}};
 refreshRoleUI();updateFilters();render()
}
