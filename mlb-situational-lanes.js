(function(){
'use strict';
var API='https://statsapi.mlb.com/api/v1', $=function(id){return document.getElementById(id);};
var page=document.body.dataset.page==='runners'?'runners':'counts';
function etDate(){var z={};new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).forEach(function(p){z[p.type]=p.value;});return z.year+'-'+z.month+'-'+z.day;}
var TODAY=etDate(),anchor=TODAY,year=Number(TODAY.slice(0,4)),period='week',seasonType=Number(TODAY.slice(5,7))>=10?'P':'R',perspective='batter',split=page==='runners'?'runners':'count',metric='avg',ranking='best',layout='lanes',sequence=0,controller=null,dbPromise=null;
var games=[],loaded=[],failures=[],teamNames=new Map(),complete=false,done=0;
var GROUPS={
 count:Array.from({length:4},function(_,b){return Array.from({length:3},function(_,s){return b+'-'+s;});}).flat(),
 pa:['1','2','3','4','5','6','7','8','9','10+'],
 workload:['1–25','26–50','51–75','76–100','101–125','126+'],
 runners:['Empty','1B','2B','1B + 2B','3B','1B + 3B','2B + 3B','Loaded']
};
var NON_AB=new Set(['walk','intent_walk','hit_by_pitch','sac_fly','sac_bunt','sac_fly_double_play','sac_bunt_double_play','catcher_interf','catcher_interference','batter_interf','fan_interference','batter_interference']);
var HIT=new Set(['single','double','triple','home_run']);
var AB_OUT=new Set(['strikeout','strikeout_double_play','field_out','force_out','fielders_choice','fielders_choice_out','field_error','grounded_into_double_play','double_play','triple_play','other_out','batter_out','runner_interference','ground_out','fly_out','line_out','pop_out','sac_fly_error','sac_bunt_error']);
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,function(x){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x];});}
function dateObj(s){return new Date(s+'T12:00:00Z');}
function iso(d){return d.toISOString().slice(0,10);}
function dayPlus(s,n){var d=dateObj(s);d.setUTCDate(d.getUTCDate()+n);return iso(d);}
function dateLabel(s){return dateObj(s).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});}
function range(){if(period==='day')return [anchor,anchor];if(period==='week'){var w=(dateObj(anchor).getUTCDay()+6)%7,first=dayPlus(anchor,-w);return[first,dayPlus(first,6)];}if(period==='month')return[anchor.slice(0,7)+'-01',iso(new Date(Date.UTC(+anchor.slice(0,4),+anchor.slice(5,7),0,12)))];return[year+'-01-01',year+'-12-31'];}
function dateNav(){
 var r=range(),end=r[1]>TODAY?TODAY:r[1];
 $('periodLabel').textContent=period==='season'?String(year):period==='day'?dateLabel(anchor):dateLabel(r[0])+' – '+dateLabel(end);
 $('date').hidden=period==='season';$('seasonYear').hidden=period!=='season';$('date').max=TODAY;$('date').value=anchor;$('seasonYear').value=String(year);
 $('next').disabled=period==='season'?year>=Number(TODAY.slice(0,4)):r[1]>=TODAY;
 document.querySelectorAll('[data-period]').forEach(function(x){x.classList.toggle('active',x.dataset.period===period);});
 document.querySelectorAll('[data-perspective]').forEach(function(x){x.classList.toggle('active',x.dataset.perspective===perspective);});
 document.querySelectorAll('[data-split]').forEach(function(x){x.classList.toggle('active',x.dataset.split===split);});
 $('minLabel').textContent=metric==='avg'?'Min AB':'Min PA';
}
function openDb(){if(dbPromise)return dbPromise;dbPromise=new Promise(function(ok){if(!window.indexedDB){ok(null);return;}try{var q=indexedDB.open('sportomax-mlb-situational-splits-v1',1);q.onupgradeneeded=function(){q.result.createObjectStore('plays',{keyPath:'id'});};q.onsuccess=function(){ok(q.result);};q.onerror=function(){ok(null);};}catch(e){ok(null);}});return dbPromise;}
async function getCached(id){var db=await openDb();if(!db)return null;return new Promise(function(ok){try{var q=db.transaction('plays','readonly').objectStore('plays').get(id);q.onsuccess=function(){ok(q.result||null);};q.onerror=function(){ok(null);};}catch(e){ok(null);}});}
async function cache(record){var db=await openDb();if(!db)return;return new Promise(function(ok){try{var t=db.transaction('plays','readwrite');t.objectStore('plays').put(record);t.oncomplete=function(){ok();};t.onerror=function(){ok();};}catch(e){ok();}});}
function isFinal(g){var s=g.status||{};return s.abstractGameState==='Final'||s.codedGameState==='F'||/final|completed early|game over/i.test(s.detailedState||'');}
function isLive(g){var s=g.status||{};return s.abstractGameState==='Live'||/in progress|manager challenge/i.test(s.detailedState||'');}
function normGame(g){var t=g.teams||{},h=t.home||{},a=t.away||{};return{id:+g.gamePk,date:g.officialDate||String(g.gameDate||'').slice(0,10),final:isFinal(g),home:+(h.team||{}).id,homeName:(h.team||{}).name||'Home',away:+(a.team||{}).id,awayName:(a.team||{}).name||'Away'};}
function baseIndex(base){if(base==='1B'||base==='1st'||base===1)return 0;if(base==='2B'||base==='2nd'||base===2)return 1;if(base==='3B'||base==='3rd'||base===3)return 2;return -1;}
function classify(type,r){
 if(HIT.has(type))return{h:1,ab:1,pa:1,bb:0,hbp:0,sf:0,k:0,hr:type==='home_run'?1:0};
 if(NON_AB.has(type))return{h:0,ab:0,pa:1,bb:type==='walk'||type==='intent_walk'?1:0,hbp:type==='hit_by_pitch'?1:0,sf:type.indexOf('sac_fly')===0?1:0,k:0,hr:0};
 if(AB_OUT.has(type))return{h:0,ab:1,pa:1,bb:0,hbp:0,sf:0,k:type.indexOf('strikeout')===0?1:0,hr:0};
 if(typeof r.isAtBat==='boolean')return {h:0,ab:r.isAtBat?1:0,pa:1,bb:0,hbp:0,sf:0,k:0,hr:0,uncertain:true};
 return null;
}
function processGame(raw,g){
 var state=[null,null,null],previousHalf='',pitchTotals=new Map(),rows=[],unknown=new Set(),missingPitches=0,uncertainBases=0;
 (raw.allPlays||[]).forEach(function(p){
  var about=p.about||{},half=String(about.inning||0)+':'+String(about.halfInning||'');
  if(half!==previousHalf){state=[null,null,null];previousHalf=half;}
  var moves=p.runners||[],res=p.result||{},typ=String(res.eventType||'').toLowerCase(),match=p.matchup||{},isPA=res.type==='atBat'&&about.isComplete!==false;
  // Recover base occupants explicitly represented by the official runner movement start.
  moves.forEach(function(q){var m=q.movement||{},i=baseIndex(m.start);if(i>=0&&state[i]==null){state[i]=String((q.details||{}).runner&&q.details.runner.id||'?');}});
  var mask=state.reduce(function(n,x,i){return n+(x==null?0:(1<<i));},0);
  var events=p.playEvents||[],pitchIndices=[],pitcherId=+(match.pitcher||{}).id;
  events.forEach(function(e,i){if(e.isPitch===true)pitchIndices.push(i);});
  var lastIdx=pitchIndices.length?pitchIndices[pitchIndices.length-1]:-1;
  var pitchBefore=null;
  if(lastIdx>=0){pitchBefore=[0,0];for(var k=lastIdx-1;k>=0;k--){var prev=events[k].count;if(prev&&Number.isInteger(prev.balls)&&Number.isInteger(prev.strikes)){pitchBefore=[prev.balls,prev.strikes];break;}}}
  var paPitchCount=pitchIndices.length;
  if(pitcherId&&paPitchCount)pitchTotals.set(pitcherId,(pitchTotals.get(pitcherId)||0)+paPitchCount);
  if(isPA&&match.batter&&match.pitcher&&about.halfInning){
   var stat=classify(typ,res);
   if(stat){
    var battingTeam=about.halfInning==='top'?g.away:g.home,pitchingTeam=about.halfInning==='top'?g.home:g.away;
    if(stat.uncertain)unknown.add(typ+' (uncertain AB)');
    if(pitchBefore===null)missingPitches++;
    var safeCount=pitchBefore&&pitchBefore[0]>=0&&pitchBefore[0]<=3&&pitchBefore[1]>=0&&pitchBefore[1]<=2?pitchBefore[0]+'-'+pitchBefore[1]:null;
    // Stored: batter id/name, pitcher id/name, batting/pitching team, 0..7 starting-base mask,
    // pre-terminal-pitch count, terminal pitch no., pitcher's cumulative pitch count at PA end,
    // then batting-event measures: H, AB, PA, BB, HBP, SF, K, HR.
    rows.push([+(match.batter||{}).id,String(match.batter.fullName||''),pitcherId,String(match.pitcher.fullName||''),battingTeam,pitchingTeam,mask,safeCount,paPitchCount||null,pitcherId?(pitchTotals.get(pitcherId)||null):null,stat.h,stat.ab,stat.pa,stat.bb,stat.hbp,stat.sf,stat.k,stat.hr]);
   }else if(typ)unknown.add(typ);
  }
  // Runner state for the next plate appearance. First remove all departing runners,
  // then land all advancing runners simultaneously (so 1B->2B and 2B->3B work).
  var next=state.slice();
  moves.forEach(function(q){var s=baseIndex((q.movement||{}).start);if(s>=0)next[s]=null;});
  moves.forEach(function(q){var m=q.movement||{},e=baseIndex(m.end);if(e>=0&&!m.isOut)next[e]=String((q.details||{}).runner&&q.details.runner.id||'?');});
  if(moves.length===0&&isPA&&HIT.has(typ))uncertainBases++;
  state=next;
 });
 return{id:g.id,date:g.date,final:g.final,stored:Date.now(),rows:rows,unknown:Array.from(unknown),missingPitches:missingPitches,uncertainBases:uncertainBases};
}
async function getJson(url,signal){var last;for(var a=0;a<3;a++){try{var response=await fetch(url,{signal:signal,headers:{Accept:'application/json'}});if(!response.ok)throw Error('HTTP '+response.status);return await response.json();}catch(e){if(e.name==='AbortError')throw e;last=e;if(a<2)await new Promise(function(ok){setTimeout(ok,400*(a+1));});}}throw last;}
async function getGame(g,signal,force){
 var old=force?null:await getCached(g.id);if(old&&(old.final||Date.now()-old.stored<90000))return old;
 var data=await getJson(API+'/game/'+g.id+'/playByPlay',signal),record=processGame(data,g);
 await cache(record);return record;
}
function groupIndex(r){
 if(split==='runners')return r[6];
 if(split==='count')return GROUPS.count.indexOf(r[7]);
 if(split==='pa')return r[8]?Math.min(9,r[8]-1):-1;
 if(split==='workload')return r[9]?Math.min(5,Math.floor((r[9]-1)/25)):-1;
 return -1;
}
function emptyRow(id,name,index){return{id:id,name:name,index:index,h:0,ab:0,pa:0,bb:0,hbp:0,sf:0,k:0,hr:0,teams:new Set(),games:new Set()};}
function addRow(x,r,g){x.h+=r[10];x.ab+=r[11];x.pa+=r[12];x.bb+=r[13];x.hbp+=r[14];x.sf+=r[15];x.k+=r[16];x.hr+=r[17];x.teams.add(perspective==='batter'?r[4]:r[5]);x.games.add(g.id);}
function value(x){switch(metric){case'obp':return (x.ab+x.bb+x.hbp+x.sf)?(x.h+x.bb+x.hbp)/(x.ab+x.bb+x.hbp+x.sf):null;case'k':return x.pa?x.k/x.pa:null;case'bb':return x.pa?x.bb/x.pa:null;case'hr':return x.pa?x.hr/x.pa:null;default:return x.ab?x.h/x.ab:null;}}
function goodHigh(){return metric==='k'?perspective==='pitcher':perspective==='batter';}
function metricLabel(){var label={avg:'AVG',obp:'OBP',k:'K%',bb:'BB%',hr:'HR%'}[metric]||'AVG';return perspective==='pitcher'&&(metric==='avg'||metric==='obp')?'OPP '+label:label;}
function formatted(x){var y=value(x);if(y==null)return '—';return metric==='avg'||metric==='obp'?y.toFixed(3).replace(/^0/,''):(y*100).toFixed(1)+'%';}
function denominator(x){return metric==='avg'?x.ab:metric==='obp'?(x.ab+x.bb+x.hbp+x.sf):x.pa;}
function rateCount(x){return metric==='avg'?x.h+' H / '+x.ab+' AB':metric==='obp'?(x.h+x.bb+x.hbp)+' ON / '+denominator(x)+' DEN':metric==='k'?x.k+' K / '+x.pa+' PA':metric==='bb'?x.bb+' BB / '+x.pa+' PA':x.hr+' HR / '+x.pa+' PA';}
function filters(){return{team:+($('team').value||0),minimum:+($('minAB').value||1),limit:+($('limit').value||10),q:$('search').value.trim().toLowerCase()};}
function buildLanes(){
 var f=filters(),maps=GROUPS[split].map(function(){return new Map();});
 loaded.forEach(function(g){g.rows.forEach(function(r){
  var i=groupIndex(r);if(i<0||i>=maps.length)return;
  var id=perspective==='batter'?r[0]:r[2],name=perspective==='batter'?r[1]:r[3],team=perspective==='batter'?r[4]:r[5];
  if(!id||f.team&&team!==f.team||f.q&&!name.toLowerCase().includes(f.q))return;
  var map=maps[i],x=map.get(id);if(!x){x=emptyRow(id,name,i);map.set(id,x);}addRow(x,r,g);
 });});
 var high=goodHigh();if(ranking==='worst')high=!high;
 return maps.map(function(m){return Array.from(m.values()).filter(function(x){return (metric==='avg'?x.ab:x.pa)>=f.minimum&&value(x)!=null;}).sort(function(a,b){return (high?value(b)-value(a):value(a)-value(b))||b.ab-a.ab||a.name.localeCompare(b.name);});});
}
function photo(id,team){return '<span class="photo"><img class="face" loading="lazy" alt="" src="https://img.mlbstatic.com/mlb-photos/image/upload/w_90,q_auto:good/v1/people/'+id+'/headshot/67/current" onerror="this.style.visibility=\'hidden\'"><img class="teamlogo" loading="lazy" alt="" src="https://www.mlbstatic.com/team-logos/'+team+'.svg" onerror="this.style.visibility=\'hidden\'"></span>';}
function diamond(mask){
 var bases=[[39,22,8],[27,10,4],[15,22,2]];
 return '<svg class="diamond" viewBox="0 0 54 42" aria-hidden="true"><path d="M9 26 L27 8 L45 26 L27 40Z" fill="none" stroke="#56738a" stroke-width="1.5"/>'+
 [[39,26,1],[27,13,2],[15,26,4]].map(function(pt){return '<rect x="'+(pt[0]-5)+'" y="'+(pt[1]-5)+'" width="10" height="10" rx="1" transform="rotate(45 '+pt[0]+' '+pt[1]+')" fill="'+(mask&pt[2]?'#65e0b9':'#193449')+'" stroke="'+(mask&pt[2]?'#a9ffe4':'#527289')+'" stroke-width="1.1"/>';}).join('')+'</svg>';
}
function laneRow(x,i){var team=Array.from(x.teams)[0];return '<button class="athlete" data-index="'+x.index+'" data-id="'+x.id+'"><span class="rank">'+(i+1)+'</span>'+photo(x.id,team)+'<span class="playername"><strong>'+esc(x.name)+'</strong><small>'+esc(x.teams.size>1?'Multiple teams':teamNames.get(team)||'MLB')+'</small></span><span class="numbers"><b>'+formatted(x)+'</b><small>'+esc(rateCount(x))+'</small></span></button>';}
function chips(){
 var f=filters(),all=emptyRow(0,'',0),people=new Set(),unknown=new Set(),missing=0,uncertain=0;
 loaded.forEach(function(g){missing+=g.missingPitches||0;uncertain+=g.uncertainBases||0;(g.unknown||[]).forEach(function(s){unknown.add(s);});g.rows.forEach(function(r){
  var team=perspective==='batter'?r[4]:r[5];if(f.team&&f.team!==team)return;
  addRow(all,r,g);people.add(perspective==='batter'?r[0]:r[2]);
 });});
 var summary=[['Games',loaded.length+' / '+games.length],['Players',people.size],['Hits',all.h.toLocaleString()],['At-bats',all.ab.toLocaleString()],['Overall AVG',all.ab?(all.h/all.ab).toFixed(3).replace(/^0/,''):'—'],['Status',complete?'Complete':'Partial / loading']];
 $('summary').innerHTML=summary.map(function(pair){return '<span class="chip">'+pair[0]+' <b>'+pair[1]+'</b></span>';}).join('');
 var notes=failures.slice(0,3);
 if(unknown.size)notes.push('Some uncommon outcomes were excluded or could have uncertain at-bat classification: '+Array.from(unknown).slice(0,9).join(', ')+'.');
 if(page==='runners'&&uncertain)notes.push(uncertain+' plate appearances had no base-movement records despite a hit; subsequent runner states may be incomplete.');
 if(page==='counts'&&missing)notes.push(missing+' plate appearances had no recorded pitch and are excluded from pitch/count lanes.');
 $('alert').hidden=!notes.length;$('alert').textContent=notes.join(' ');
}
function situationTotals(){
 var f=filters(),totals=GROUPS[split].map(function(_,i){return emptyRow(0,'',i);});
 loaded.forEach(function(g){g.rows.forEach(function(r){
  var i=groupIndex(r);if(i<0||i>=totals.length)return;
  var team=perspective==='batter'?r[4]:r[5],name=perspective==='batter'?r[1]:r[3];
  if(f.team&&f.team!==team||f.q&&!name.toLowerCase().includes(f.q))return;
  addRow(totals[i],r,g);
 });});
 return totals;
}
function setLayout(next){
 layout=next==='grid'?'grid':'lanes';
 var board=$('board');board.classList.toggle('grid-view',layout==='grid');
 document.querySelectorAll('[data-layout]').forEach(function(b){
  var selected=b.dataset.layout===layout;
  b.classList.toggle('active',selected);b.setAttribute('aria-pressed',String(selected));
 });
 $('scrollPrev').hidden=layout==='grid';$('scrollNext').hidden=layout==='grid';
 $('viewHint').textContent=layout==='grid'?'Grid view · all situations visible':'Scroll horizontally to compare lanes →';
}
function jumpToLane(index){
 var all=$('board').querySelectorAll('.lane'),target=all[index];if(!target)return;
 all.forEach(function(card){card.classList.toggle('highlight-lane',card===target);});
 if(layout==='grid'){target.scrollIntoView({behavior:'smooth',block:'nearest'});}
 else{
  var board=$('board'),left=target.offsetLeft-board.offsetLeft;
  board.scrollTo({left:Math.max(0,left-12),behavior:'smooth'});
 }
}
function render(){
 var lanes=buildLanes(),f=filters(),groups=GROUPS[split],totals=situationTotals();
 var viewName=perspective==='pitcher'?'Pitchers · opponent rates':'Batters · offensive rates';
 var title=split==='runners'?'Base occupancy':split==='count'?'Ball–strike counts':split==='pa'?'Pitch number in plate appearance':'Pitcher workload';
 $('boardTitle').textContent=title+' · '+metricLabel();
 $('boardSub').textContent=viewName+' · '+(ranking==='best'?'best':'worst')+' first · '+groups.length+' situations · minimum '+f.minimum+' '+(metric==='avg'?'AB':'PA');
 var overallLabel=metricLabel();
 $('overview').innerHTML=totals.map(function(x,i){
  var label=groups[i],measure=formatted(x),isR=split==='runners';
  var scope=metric==='avg'?x.ab+' AB':metric==='obp'?denominator(x)+' denominator':x.pa+' PA';
  return '<button class="situation" type="button" data-go="'+i+'" aria-label="'+esc(label)+': '+esc(measure)+' '+esc(overallLabel)+', '+scope+'; jump to lane '+(i+1)+'"><span class="sit-top"><strong>'+esc(label)+'</strong>'+(isR?diamond(i):'')+'</span><span class="sit-number">'+measure+'</span><span class="sit-base">'+esc(scope)+' · '+x.h+' H</span></button>';
 }).join('');
 $('overview').querySelectorAll('[data-go]').forEach(function(b){b.onclick=function(){jumpToLane(Number(b.dataset.go));};});
 $('board').innerHTML=lanes.map(function(players,i){
  var label=groups[i],visible=players.slice(0,f.limit);
  var subtitle=split==='runners'?(i===0?'Bases empty':i===7?'Bases loaded':'Runners on '+label):split==='count'?'Before terminal pitch':split==='pa'?'Final pitch number':'Pitches thrown, PA end';
  var rows=visible.length?visible.map(laneRow).join(''):
   '<div class="empty">'+(done?'No qualified players<br>Reduce minimum '+(metric==='avg'?'AB':'PA')+' to expand results.':'Awaiting game data…')+'</div>';
  return '<article class="lane" data-lane="'+i+'"><div class="lanehead"><div class="headingcluster">'+(split==='runners'?diamond(i):'')+'<div><strong>'+esc(label)+'</strong><small>'+esc(subtitle)+'</small></div></div><span class="metric-pill">'+esc(overallLabel)+'</span></div><div class="qual">'+players.length+' qualified · showing '+visible.length+'</div><div class="list">'+rows+'</div></article>';
 }).join('');
 $('board').querySelectorAll('.athlete').forEach(function(b){b.onclick=function(){openPlayer(+b.dataset.id,+b.dataset.index);};});
 setLayout(layout);
 chips();
}
function openPlayer(id,index){
 var set=new Map(),first=null;
 loaded.forEach(function(g){g.rows.forEach(function(r){
  if(groupIndex(r)!==index||(perspective==='batter'?r[0]:r[2])!==id)return;
  var team=perspective==='batter'?r[4]:r[5],f=filters();if(f.team&&team!==f.team)return;
  if(!first)first={name:perspective==='batter'?r[1]:r[3],team:team};
  var x=set.get(g.id);if(!x){x=emptyRow(id,first.name,index);x.date=g.date;x.game=games.find(function(m){return m.id===g.id;});set.set(g.id,x);}addRow(x,r,g);
 });});
 if(!first)return;
 var all=emptyRow(id,first.name,index);set.forEach(function(x){['h','ab','pa','bb','hbp','sf','k','hr'].forEach(function(k){all[k]+=x[k];});});
 var rows=Array.from(set.values()).sort(function(a,b){return b.date.localeCompare(a.date);});
 $('dialogContents').innerHTML='<div class="modalhead">'+photo(id,first.team)+'<div><h2>'+esc(first.name)+'</h2><p>'+esc(perspective==='batter'?'Batter':'Pitcher · opponent')+' · '+esc(GROUPS[split][index])+'</p></div><button class="close" id="close" aria-label="Close">×</button></div>'+
 '<div class="modalbody"><div class="modalstats">'+[['AVG',all.ab?(all.h/all.ab).toFixed(3).replace(/^0/,''):'—'],['H / AB',all.h+' / '+all.ab],['PA',all.pa],['K',all.k],['BB',all.bb],['HR',all.hr]].map(function(p){return '<div><b>'+p[1]+'</b><small>'+p[0]+'</small></div>';}).join('')+'</div>'+
 '<h3>Game-by-game · '+rows.length+' games</h3><div class="gamelog">'+rows.map(function(x){return '<div class="gamerow"><span>'+esc(dateLabel(x.date))+'</span><span>'+esc(x.game?x.game.awayName+' @ '+x.game.homeName:'Game')+'</span><b>'+x.h+' H / '+x.ab+' AB</b><b>'+esc(formatted(x))+'</b></div>';}).join('')+'</div></div>';
 $('close').onclick=function(){$('detail').close();};$('detail').showModal();
}
function updateTeams(){
 var prev=$('team').value,opts='<option value="">All teams</option>';
 teamNames=new Map();games.forEach(function(g){if(g.home)teamNames.set(g.home,g.homeName);if(g.away)teamNames.set(g.away,g.awayName);});
 Array.from(teamNames.entries()).sort(function(a,b){return a[1].localeCompare(b[1]);}).forEach(function(x){opts+='<option value="'+x[0]+'">'+esc(x[1])+'</option>';});
 $('team').innerHTML=opts;if(prev&&teamNames.has(+prev))$('team').value=prev;
}
function status(s){$('status').textContent=s;}
function minimumDefault(){var defaults={day:1,week:1,month:3,season:12};$('minAB').value=String(defaults[period]);}
async function load(force){
 var requestId=++sequence;if(controller)controller.abort();controller=new AbortController();var signal=controller.signal;
 loaded=[];games=[];failures=[];complete=false;done=0;teamNames.clear();$('barFill').style.width='0';dateNav();status('Retrieving MLB schedule…');render();
 var selected=range(),end=selected[1]>TODAY?TODAY:selected[1];
 try{
  var response=await getJson(API+'/schedule?sportId=1&startDate='+selected[0]+'&endDate='+end+'&gameTypes='+seasonType,signal);
  if(requestId!==sequence)return;
  games=(response.dates||[]).flatMap(function(x){return x.games||[];}).filter(function(g){return g.gameType===seasonType&&(isFinal(g)||isLive(g));}).map(normGame).filter(function(g){return g.home&&g.away;});
  updateTeams();
  if(!games.length){complete=true;status('No started games found. Try a different period or regular/postseason setting.');$('barFill').style.width='100%';render();return;}
  var next=0,lastRender=0;
  status('Processing '+games.length+' MLB games. Completed games use IndexedDB cache on subsequent visits…');
  async function worker(){
   while(requestId===sequence&&next<games.length){
    var g=games[next++];
    try{var record=await getGame(g,signal,force===true);if(requestId!==sequence)return;loaded.push(record);}
    catch(e){if(e.name==='AbortError'||requestId!==sequence)return;failures.push('Game '+g.id+' '+g.date+': '+e.message+'.');}
    done++;
    var now=Date.now();
    if(now-lastRender>500||done===games.length){lastRender=now;$('barFill').style.width=(100*done/games.length).toFixed(1)+'%';status('Processed '+done+' / '+games.length+' games · '+loaded.length+' usable'+(failures.length?' · '+failures.length+' failed':'')+' ('+Math.round(100*done/games.length)+'%)');render();}
   }
  }
  await Promise.all(Array.from({length:Math.min(10,games.length)},worker));
  if(requestId!==sequence)return;complete=!failures.length;
  status((complete?'Complete':'Partial coverage')+' · '+loaded.length+' / '+games.length+' games · '+(complete?'Final-game records cached locally.':'Failed games excluded; retry to reload them.'));
  $('barFill').style.width='100%';render();
 }catch(e){if(e.name==='AbortError'||requestId!==sequence)return;failures.push('MLB schedule unavailable: '+e.message+'.');status('Could not load the MLB schedule. Retry Load.');render();}
}
function step(delta){
 if(period==='season')year=Math.min(+TODAY.slice(0,4),Math.max(2010,year+delta));
 else if(period==='day')anchor=dayPlus(anchor,delta);
 else if(period==='week')anchor=dayPlus(anchor,7*delta);
 else{var d=dateObj(anchor),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+delta);d.setUTCDate(Math.min(day,new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0,12)).getUTCDate()));anchor=iso(d);}
 if(anchor>TODAY)anchor=TODAY;load();
}
function mount(){
 $('seasonType').value=seasonType;
 $('seasonYear').innerHTML=Array.from({length:+TODAY.slice(0,4)-2009},function(_,i){var y=+TODAY.slice(0,4)-i;return'<option value="'+y+'">'+y+'</option>';}).join('');
 document.querySelectorAll('[data-period]').forEach(function(b){b.onclick=function(){period=this.dataset.period;minimumDefault();load();};});
 document.querySelectorAll('[data-perspective]').forEach(function(b){b.onclick=function(){perspective=this.dataset.perspective;dateNav();render();};});
 document.querySelectorAll('[data-split]').forEach(function(b){b.onclick=function(){split=this.dataset.split;dateNav();render();};});
 $('prev').onclick=function(){step(-1);};$('next').onclick=function(){step(1);};
 $('date').onchange=function(){if(this.value&&this.value<=TODAY){anchor=this.value;load();}};
 $('seasonYear').onchange=function(){year=+this.value;load();};
 $('seasonType').onchange=function(){seasonType=this.value;load();};
 $('reload').onclick=function(){load(true);};
 $('team').onchange=render;$('minAB').onchange=render;$('limit').onchange=render;
 $('metric').onchange=function(){metric=this.value;dateNav();render();};
 $('ranking').onchange=function(){ranking=this.value;render();};
 $('search').oninput=render;
 document.querySelectorAll('[data-layout]').forEach(function(b){b.onclick=function(){setLayout(this.dataset.layout);};});
 $('scrollPrev').onclick=function(){$('board').scrollBy({left:-Math.max(300,$('board').clientWidth*.7),behavior:'smooth'});};
 $('scrollNext').onclick=function(){$('board').scrollBy({left:Math.max(300,$('board').clientWidth*.7),behavior:'smooth'});};
 $('detail').onclick=function(e){if(e.target===this)this.close();};
 minimumDefault();dateNav();load();
}
window.MLBSplitTest={classify:classify,processGame:processGame,groupIndex:groupIndex,baseIndex:baseIndex,groups:GROUPS};
mount();
})();