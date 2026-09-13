function refreshControls(){
 let oy=$('#year').value,op=$('#pos').value,ot=$('#team').value;visibleYears=[...new Set([...P.values()].flatMap(yearsOf))].sort((a,b)=>b-a);
 $('#year').innerHTML='<option value="">Any year</option>'+visibleYears.map(y=>`<option ${String(y)===oy?'selected':''}>${y}</option>`).join('');
 $('#pos').innerHTML='<option value="">All pos</option>'+[...new Set([...P.values()].map(p=>p.pos).filter(Boolean))].sort().map(x=>`<option ${x===op?'selected':''}>${x}</option>`).join('');
 let uniq=new Map();for(const t of TL.values())if(t.abbr||t.name)uniq.set(t.id,t);
 $('#team').innerHTML='<option value="">All teams</option>'+[...uniq.values()].sort((a,b)=>(a.name||a.abbr).localeCompare(b.name||b.abbr)).map(t=>`<option value="${t.id}" ${t.id===ot?'selected':''}>${t.abbr||t.name}</option>`).join('')
}

function applyFilters(reset=true){
 let q=$('#q').value.toLowerCase(),pos=$('#pos').value,tid=$('#team').value,mode=$('#teamMode').value,y=$('#year').value,present=$('#present').checked,current=$('#current').checked,tn=$('#teamN').value,sn=$('#seasonN').value;
 view=[...P.values()].filter(p=>{
  let ys=yearsOf(p),tc=teamsOf(p);if(q&&!p.name.toLowerCase().includes(q)||pos&&p.pos!==pos||current&&!isCurrent(p)||present&&y&&!p.seasons[y])return false;
  if(tid){let ever=Object.values(p.seasons||{}).flat().includes(tid);if(mode==='current'&&currentTeamOf(p)!==tid||mode==='ever'&&!ever||mode==='year'&&(!y||!p.seasons[y]?.includes(tid)))return false}
  if(tn&&(+tn===1?tc!==1:tc<+tn))return false;
  if(sn){let n=ys.length;if(sn==='1'&&n!==1||sn==='2-4'&&(n<2||n>4)||sn==='5-9'&&(n<5||n>9)||sn==='10-14'&&(n<10||n>14)||sn==='15'&&n<15)return false}
  return true
 });
 let s=$('#sort').value;view.sort((a,b)=>s==='teams'?teamsOf(b)-teamsOf(a):s==='years'?yearsOf(b).length-yearsOf(a).length:s==='debut'?(Math.min(...yearsOf(b),9999)-Math.min(...yearsOf(a),9999)):s==='last'?(Math.max(...yearsOf(b),0)-Math.max(...yearsOf(a),0)):a.name.localeCompare(b.name));
 render(reset)
}

function render(reset=false){
 if(reset)$('#main').scrollTop=0;let Y=visibleYears.length?visibleYears:[cur];if(!showAll)Y=Y.slice(0,15);
 let m=$('#main'),rh=42,scroll=Math.max(0,m.scrollTop-29),start=Math.max(0,Math.floor(scroll/rh)-10),count=Math.ceil(m.clientHeight/rh)+22,end=Math.min(view.length,start+count);
 $('#head').innerHTML=`<tr><th class="player">Player (${view.length.toLocaleString()})</th>${Y.map(y=>`<th>${y}</th>`).join('')}</tr>`;
 let rows=`<tr><td colspan="${Y.length+1}" style="height:${start*rh}px;padding:0;border:0"></td></tr>`;
 for(let i=start;i<end;i++){let p=view[i],py=yearsOf(p);rows+=`<tr><td class="player"><div class="pb"><img class="photo" loading="lazy" src="${p.head}" onerror="this.style.visibility='hidden'"><div><div class="nm">${p.name}</div><div class="meta">${p.pos||'—'} • ${isCurrent(p)?'CURRENT':'HISTORICAL'} • ${py[0]||'—'}–${py.at(-1)||'—'}</div></div><div class="metrics"><b>${teamsOf(p)}T</b>${py.length} yr</div></div></td>${Y.map(y=>{let ids=p.seasons[y]||[];return `<td>${ids.length?`<div class="logos">${ids.map(id=>{let t=teamFor(y,id);return t.logo?`<img class="logo ${ids.length>1?'m':''}" loading="lazy" title="${t.name||t.abbr}" src="${t.logo}">`:`<small>${t.abbr||id}</small>`}).join('')}</div>`:'<span class="dot">·</span>'}</td>`}).join('')}</tr>`}
 rows+=`<tr><td colspan="${Y.length+1}" style="height:${Math.max(0,(view.length-end)*rh)}px;padding:0;border:0"></td></tr>`;$('#body').innerHTML=rows;$('#empty').style.display=P.size?'none':'block'
}

$('#main').onscroll=()=>{cancelAnimationFrame(renderRAF);renderRAF=requestAnimationFrame(()=>render(false))};
for(const id of ['q','pos','team','teamMode','year','present','current','teamN','seasonN','sort'])$('#'+id).addEventListener(id==='q'?'input':'change',()=>applyFilters());
$('#scan').onclick=scan;$('#pause').onclick=()=>{stop=true;queue?.cancel();$('#pause').disabled=true};
$('#all').onclick=()=>{showAll=!showAll;$('#all').textContent=showAll?'Recent 15':'All years';render()};
$('#clear').onclick=()=>{for(const id of ['q','pos','team','year','teamN','seasonN'])$('#'+id).value='';$('#teamMode').value='ever';$('#sort').value='name';$('#present').checked=$('#current').checked=false;applyFilters()};
$('#reset').onclick=async()=>{if(confirm('Delete all locally cached NFL timeline data?')){try{let d=await openDB();d.close()}catch{}dbPromise=null;let r=indexedDB.deleteDatabase(DB);r.onsuccess=r.onerror=r.onblocked=()=>location.reload()}};

(async()=>{
 await resolveSeasons();for(const id of ['from','to'])$('#'+id).innerHTML=seasons.map(y=>`<option>${y}</option>`).join('');$('#from').value=cur;$('#to').value=seasons.at(-1);
 for(const t of await dbAll('teams')){T.set(t.key,t);let old=TL.get(t.id);if(!old||(+t.year||0)>=(+old.year||0))TL.set(t.id,t)}for(const p of await dbAll('players'))P.set(p.id,p);
 for(const p of P.values())if(!p.seasons?.[cur])p.currentTeam='';
 refreshControls();applyFilters();$('#status').textContent=`Ready • ${P.size.toLocaleString()} cached players`
})()
