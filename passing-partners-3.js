'use strict';
function buildModel(qbRows,tdEvents,unresolved,gamesScanned,officialPassTDs,summaryFailures,seasonType,meta={}){
  const edge=new Map(),passers=new Map(),receivers=new Map(),pairEvents=new Map();
  for(const q of qbRows)passers.set(keyFor(q.id,q.name),{...q,starterRow:true,teams:new Set(q.teams||[q.team].filter(Boolean))});
  for(const td of tdEvents){
    const pk=keyFor(td.passerId,td.passerName),rk=keyFor(td.receiverId,td.receiverName);if(!pk||!rk)continue;
    const p=passers.get(pk)||{id:td.passerId,name:td.passerName,headshot:td.passerHeadshot,position:td.passerPosition||'QB',team:td.team,source:'TD passer',starterRow:false,teams:new Set()};p.teams.add(td.team);passers.set(pk,p);
    const r=receivers.get(rk)||{id:td.receiverId,name:td.receiverName,headshot:td.receiverHeadshot,position:td.receiverPosition||'',team:td.team,teams:new Set(),total:0};r.teams.add(td.team);r.total++;receivers.set(rk,r);
    const ek=pk+'|'+rk;edge.set(ek,(edge.get(ek)||0)+1);const arr=pairEvents.get(ek)||[];arr.push(td);pairEvents.set(ek,arr);
  }
  for(const p of passers.values()){p.teams=[...p.teams].filter(Boolean);p.team=p.team||p.teams[0]||'';p.teamLogo=teamLogoFor(p.team)}
  for(const r of receivers.values()){r.teams=[...r.teams].filter(Boolean);r.team=r.team||r.teams[0]||'';r.teamLogo=teamLogoFor(r.team)}
  for(const arr of pairEvents.values())arr.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  return {qbRows,edge,passers,receivers,pairEvents,tdEvents,unresolved,gamesScanned,officialPassTDs,summaryFailures,seasonType,activeIds:null,...meta};
}

function edgeEvents(a,b,mode){const pk=mode==='QB'?keyFor(a.id,a.name):keyFor(b.id,b.name),rk=mode==='QB'?keyFor(b.id,b.name):keyFor(a.id,a.name);return model.pairEvents.get(pk+'|'+rk)||[]}
function isActivePerson(p){return !els.activeOnly.checked||!model.activeIds||model.activeIds.has(idVal(p.id))}
function filteredPartnersForQB(q,minTD){
  const pk=keyFor(q.id,q.name),pos=els.positionFilter.value,out=[];
  for(const [rk,r] of model.receivers){const count=model.edge.get(pk+'|'+rk)||0;if(count<minTD)continue;if(pos!=='ALL'&&String(r.position).toUpperCase()!==pos)continue;if(!isActivePerson(r))continue;const events=model.pairEvents.get(pk+'|'+rk)||[];out.push({partner:r,count,events})}
  return out.sort((a,b)=>b.count-a.count||a.partner.name.localeCompare(b.partner.name));
}
function filteredPartnersForReceiver(r,minTD){
  const rk=keyFor(r.id,r.name),out=[];
  for(const [pk,p] of model.passers){const count=model.edge.get(pk+'|'+rk)||0;if(count<minTD)continue;if(!isActivePerson(p))continue;const events=model.pairEvents.get(pk+'|'+rk)||[];out.push({partner:p,count,events})}
  return out.sort((a,b)=>b.count-a.count||a.partner.name.localeCompare(b.partner.name));
}
function rowSearchText(row,slots){return `${row.name} ${(row.teams||[row.team]).join(' ')} ${row.position||''} ${slots.map(x=>x.partner.name).join(' ')}`.toLowerCase()}
function rowTeams(row){return (row.teams||[row.team]).filter(Boolean)}
function rowMetric(rowObj){const total=rowObj.slots.reduce((s,x)=>s+x.count,0),connections=rowObj.slots.length,avg=connections?total/connections:0,maxPair=connections?Math.max(...rowObj.slots.map(x=>x.count)):0;let recent='';for(const x of rowObj.slots)for(const e of x.events||[])if(String(e.date||'')>recent)recent=String(e.date||'');return {...rowObj,total,connections,avg,maxPair,recent}}
function sortRows(rows){const sort=els.sortBy.value;const cmp={
  'connections-desc':(a,b)=>b.connections-a.connections||b.total-a.total,
  'connections-asc':(a,b)=>a.connections-b.connections||a.total-b.total,
  'td-desc':(a,b)=>b.total-a.total||b.connections-a.connections,
  'td-asc':(a,b)=>a.total-b.total||a.connections-b.connections,
  'avg-desc':(a,b)=>b.avg-a.avg||b.total-a.total,
  'avg-asc':(a,b)=>a.avg-b.avg||a.total-b.total,
  'max-desc':(a,b)=>b.maxPair-a.maxPair||b.total-a.total,
  'recent-desc':(a,b)=>String(b.recent).localeCompare(String(a.recent))||b.total-a.total,
  'alpha':(a,b)=>a.row.name.localeCompare(b.row.name),
  'team':(a,b)=>(rowTeams(a.row)[0]||'').localeCompare(rowTeams(b.row)[0]||'')||a.row.name.localeCompare(b.row.name)
}[sort]||((a,b)=>b.total-a.total);return rows.sort(cmp)}
function getDisplayRows(){
  if(!model)return[];const mode=els.anchor.value,minTD=Math.max(1,Number(els.minTD.value)||1),query=els.search.value.trim().toLowerCase(),team=els.teamFilter.value,pos=els.positionFilter.value;
  let anchors=mode==='QB'?(model.metaRange?[...model.passers.values()]:model.qbRows):[...model.receivers.values()];
  let rows=anchors.filter(isActivePerson).map(row=>{if(mode==='REC'&&pos!=='ALL'&&String(row.position).toUpperCase()!==pos)return null;const slots=mode==='QB'?filteredPartnersForQB(row,minTD):filteredPartnersForReceiver(row,minTD);return rowMetric({row,slots,source:mode==='QB'?(row.source||'QB'):[row.position||'Receiver','TD recipient'].filter(Boolean).join(' • ')})}).filter(Boolean);
  if(team!=='ALL')rows=rows.filter(x=>rowTeams(x.row).includes(team));
  if(els.multiOnly.checked)rows=rows.filter(x=>x.connections>=2);
  if(query)rows=rows.filter(x=>rowSearchText(x.row,x.slots).includes(query));
  return sortRows(rows);
}
function populateFilters(){
  const teams=[...new Set([...model.passers.values(),...model.receivers.values()].flatMap(rowTeams))].filter(Boolean).sort();const prev=els.teamFilter.value;els.teamFilter.innerHTML='<option value="ALL">All Teams</option>'+teams.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');if(teams.includes(prev))els.teamFilter.value=prev;
}
function renderTopPairs(){
  const pairs=[];for(const [ek,count] of model.edge){const [pk,rk]=ek.split('|'),p=model.passers.get(pk),r=model.receivers.get(rk);if(!p||!r)continue;const ev=model.pairEvents.get(ek)||[];pairs.push({pk,rk,p,r,count,recent:ev[0]?.date||''})}pairs.sort((a,b)=>b.count-a.count||String(b.recent).localeCompare(String(a.recent)));const top=pairs.slice(0,10);if(!top.length){els.topPairs.classList.add('hidden');return}els.topPairs.innerHTML=top.map((x,i)=>`<button class="topPair" data-pair-p="${esc(x.pk)}" data-pair-r="${esc(x.rk)}"><b>#${i+1} ${esc(x.p.name)} → ${esc(x.r.name)}</b><span>${x.count} TD${x.count===1?'':'s'} • ${esc(rowTeams(x.r).join(' / '))}</span></button>`).join('');els.topPairs.classList.remove('hidden');
}
function render(){
  if(!model)return;const mode=els.anchor.value,rows=getDisplayRows();lastRenderedRows=rows;const maxSlots=Math.max(0,...rows.map(r=>r.slots.length)),visiblePartners=new Set(rows.flatMap(r=>r.slots.map(x=>keyFor(x.partner.id,x.partner.name))));const anchorLabel=mode==='QB'?(model.metaRange?'QB':'Starting / Primary QB'):'Receiver',teamLabel='Team(s)',totalLabel=mode==='QB'?'Pass TD':'Rec TD',slotLabel=mode==='QB'?'Recipient':'QB';let html=`<thead><tr><th class="sticky">${anchorLabel}</th><th class="team">${teamLabel}</th><th class="total">${totalLabel}</th>`;for(let i=0;i<maxSlots;i++)html+=`<th class="slot">${slotLabel} ${i+1}</th>`;html+='</tr></thead><tbody>';
  for(const {row,slots,total,source} of rows){const teams=rowTeams(row),mainTeam=teams[0]||'';html+='<tr>';html+=`<td class="sticky"><div class="person"><img class="avatar" src="${esc(headshotFor(row)||teamLogoFor(mainTeam))}" alt="" onerror="this.style.visibility='hidden'"><div><div class="personName">${esc(row.name||'Unknown')}</div><div class="small">${esc(source)}</div></div></div></td><td class="team"><div class="teamBadge">${mainTeam?`<img class="teamLogo" src="${esc(teamLogoFor(mainTeam))}" alt="${esc(mainTeam)}">`:''}<span>${esc(teams.join(' / '))}</span></div></td><td class="total"><b>${total}</b><div class="small">${slots.length} conn.</div></td>`;
    for(let i=0;i<maxSlots;i++){const slot=slots[i];if(!slot){html+='<td class="cell0">—</td>';continue}const n=slot.count,p=slot.partner,cls=n===1?'cell1':n===2?'cell2':'cell3',share=total?Math.round(n/total*100):0,partnerTeam=rowTeams(p)[0]||'',events=slot.events||[],pk=mode==='QB'?keyFor(row.id,row.name):keyFor(p.id,p.name),rk=mode==='QB'?keyFor(p.id,p.name):keyFor(row.id,row.name);html+=`<td class="${cls} partnerCell" data-pair-p="${esc(pk)}" data-pair-r="${esc(rk)}" title="Click for ${esc(row.name)} ↔ ${esc(p.name)} details"><div class="partnerPerson"><span class="rankBadge">#${i+1}</span>${headshotFor(p)?`<img class="partnerAvatar" src="${esc(headshotFor(p))}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.visibility='hidden'">`:''}<div><span class="name">${esc(p.name)}</span><span class="td">${n} TD</span><span class="share">${share}%</span><div class="small">${partnerTeam?`<img class="miniTeamLogo" src="${esc(teamLogoFor(partnerTeam))}" alt="">`:''}${esc(rowTeams(p).join(' / '))}${p.position?` • ${esc(p.position)}`:''}${events[0]?.date?` • latest ${esc(String(events[0].date).slice(0,10))}`:''}</div></div></div></td>`}html+='</tr>'}
  html+='</tbody>';els.matrix.innerHTML=html;els.matrix.classList.remove('hidden');els.empty.classList.add('hidden');els.sRows.textContent=rows.length;els.sRowsLabel.textContent=mode==='QB'?'QB rows':'Receiver rows';els.sPartners.textContent=visiblePartners.size;els.sPairs.textContent=model.tdEvents.length;els.sOfficial.textContent=model.officialPassTDs;els.sMissing.textContent=Math.max(0,model.officialPassTDs-model.tdEvents.length);els.sGames.textContent=model.gamesScanned;els.sUpdated.textContent=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});els.stats.classList.remove('hidden');els.export.disabled=false;els.compare.disabled=rows.length<2;els.search.placeholder=mode==='QB'?'Filter QB / team / recipient…':'Filter receiver / team / QB…';renderTopPairs();
}
function renderDiag(){const missing=Math.max(0,model.officialPassTDs-model.tdEvents.length),gapClass=missing?'warn':'ok';els.diag.classList.remove('hidden');els.diag.innerHTML=`<span><strong>${model.officialPassTDs}</strong> official passing TDs</span><span><strong>${model.tdEvents.length}</strong> resolved pairs</span><span class="${gapClass}"><strong>${missing}</strong> unresolved official pair(s)</span><span><strong>${model.summaryFailures}</strong> summary failures</span><span><strong>${model.unresolved.filter(x=>x.reason!=='official-gap').length}</strong> ambiguous/rejected play(s)</span><span><strong>${model.edge.size}</strong> unique QB↔receiver connections</span>`}
function openModal(title,body){els.modalTitle.textContent=title;els.modalBody.innerHTML=body;els.modal.classList.remove('hidden')}
function closeModal(){els.modal.classList.add('hidden');els.modalBody.innerHTML=''}
function showPair(pk,rk){const p=model.passers.get(pk),r=model.receivers.get(rk),events=model.pairEvents.get(pk+'|'+rk)||[];if(!p||!r)return;const seasons=[...new Set(events.map(e=>e.season).filter(Boolean))].sort();openModal(`${p.name} → ${r.name}`,`<div class="detailGrid"><div class="detailCard"><b>${events.length} passing TD${events.length===1?'':'s'}</b><div class="muted">${seasons.length?`Season${seasons.length===1?'':'s'}: ${seasons.join(', ')}`:''}</div></div><div class="detailCard"><b>${esc(rowTeams(p).join(' / '))} → ${esc(rowTeams(r).join(' / '))}</b><div class="muted">${esc(p.position||'QB')} to ${esc(r.position||'Receiver')}</div></div></div><div class="eventList">${events.map(e=>`<div class="eventRow"><span>${esc(String(e.date||'').slice(0,10)||`Week ${e.week}`)}</span><span>W${esc(e.week)}</span><div><b>${esc(e.gameName||e.gameId)}</b><div class="small">${esc(e.text||'Passing touchdown')}</div></div></div>`).join('')||'<div class="muted">No event detail available.</div>'}</div>`)}
