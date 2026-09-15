'use strict';
// Adds catches / receiving-yards views without changing the existing TD reconciliation pipeline.
// ESPN receiving box-score rows are assigned to the team's primary passer for that game.
const metricEl=document.getElementById('metric');
if(metricEl){
  els.metric=metricEl;
  const originalProcessSummary=processSummary;
  processSummary=function(summary,event){
    const out=originalProcessSummary(summary,event);
    const passers=out.passingRows||[], receivers=out.receivingRows||[];
    const primaryByTeam=new Map();
    for(const p of passers){
      const old=primaryByTeam.get(p.team);
      if(!old||num(p.attempts)>num(old.attempts))primaryByTeam.set(p.team,p);
    }
    const metrics=[];
    for(const r of receivers){
      if(!r.team||!r.name)continue;
      const p=primaryByTeam.get(r.team);if(!p)continue;
      const catches=num(r.receptions),yards=num(r.receivingYards||r.yards);
      if(!catches&&!yards)continue;
      metrics.push({gameId:idVal(event?.id),season:Number(event?.season?.year||event?.__year||0),seasonType:Number(event?.season?.type||event?.__seasonType||0),week:event?.week?.number||event?.__week||'',date:event?.date||'',gameName:event?.shortName||event?.name||'',team:r.team,passerId:idVal(p.id),passerName:cleanName(p.name),passerHeadshot:p.headshot||'',passerPosition:p.position||'QB',receiverId:idVal(r.id),receiverName:cleanName(r.name),receiverHeadshot:r.headshot||'',receiverPosition:r.position||'',catches,yards});
    }
    out.metricEvents=metrics;return out;
  };

  // Extend receiving parser so yards are retained from ESPN's receiving table.
  const originalGetReceivingRows=getReceivingRows;
  getReceivingRows=function(summary,teamIds){
    const rows=originalGetReceivingRows(summary,teamIds);
    for(const block of (summary?.boxscore?.players||[])){
      const team=teamNorm(block?.team?.abbreviation||'');
      for(const stat of (block.statistics||[])){
        const nm=String(stat.name||stat.displayName||stat.label||'').toLowerCase(),labels=(stat.labels||[]).map(x=>String(x).toLowerCase());
        if(!nm.includes('receiv')&&!labels.includes('rec'))continue;
        const yi=labels.findIndex(x=>x==='yds'||x==='yards'||x.includes('yds'));
        if(yi<0)continue;
        for(const row of (stat.athletes||[])){
          const id=idVal(row.athlete?.id),name=row.athlete?.fullName||row.athlete?.displayName||row.athlete?.shortName||'';
          const target=rows.find(r=>(id&&r.id===id)||(!id&&normName(r.name)===normName(name)));
          if(target)target.receivingYards=num((row.stats||[])[yi]);
        }
      }
    }
    return rows;
  };

  // Cache metric rows too; new version avoids stale pp-v6 games that lack them.
  cacheKey=function(eventId){return `pp-v7:${eventId}`};
  setCachedGame=function(event,data){try{const compact={tds:data.tds||[],metricEvents:data.metricEvents||[],unresolved:data.unresolved||[],passingRows:data.passingRows||[],receivingRows:data.receivingRows||[],officialPassTDs:num(data.officialPassTDs)};localStorage.setItem(cacheKey(event.id),JSON.stringify({eventId:String(event.id),savedAt:Date.now(),data:compact}))}catch{}};

  const originalBuildModel=buildModel;
  buildModel=function(qbRows,tdEvents,unresolved,gamesScanned,officialPassTDs,summaryFailures,seasonType,meta={}){
    const m=originalBuildModel(qbRows,tdEvents,unresolved,gamesScanned,officialPassTDs,summaryFailures,seasonType,meta);
    m.metricEvents=meta.metricEvents||[];return m;
  };

  function rebuildMetricEdges(){
    if(!model)return;const metric=metricEl.value;if(metric==='td'){model.edge=model.tdEdge||model.edge;model.pairEvents=model.tdPairEvents||model.pairEvents;return}
    if(!model.tdEdge){model.tdEdge=model.edge;model.tdPairEvents=model.pairEvents}
    const edge=new Map(),events=new Map();
    for(const e of (model.metricEvents||[])){
      const pk=keyFor(e.passerId,e.passerName),rk=keyFor(e.receiverId,e.receiverName),k=pk+'|'+rk,v=metric==='catches'?num(e.catches):num(e.yards);if(v<=0)continue;
      edge.set(k,(edge.get(k)||0)+v);const a=events.get(k)||[];a.push(e);events.set(k,a);
      if(!model.passers.has(pk))model.passers.set(pk,{id:e.passerId,name:e.passerName,headshot:e.passerHeadshot,position:'QB',team:e.team,teams:[e.team]});
      if(!model.receivers.has(rk))model.receivers.set(rk,{id:e.receiverId,name:e.receiverName,headshot:e.receiverHeadshot,position:e.receiverPosition,team:e.team,teams:[e.team]});
    }
    model.edge=edge;model.pairEvents=events;
  }

  const originalRender=render;
  render=function(){if(!model)return;rebuildMetricEdges();originalRender();const metric=metricEl.value,label=metric==='td'?'TD':metric==='catches'?'REC':'YDS';document.querySelectorAll('.partnerCell .td').forEach(x=>x.textContent=x.textContent.replace(/\d+ TD/,m=>m.replace('TD',label)));const totalHead=document.querySelector('th.total');if(totalHead)totalHead.textContent=els.anchor.value==='QB'?`Pass ${label}`:`Rec ${label}`;};

  // Capture metric rows during a load with a light wrapper around fetch cache results.
  const originalLoad=load;
  load=async function(){await originalLoad();if(!model)return;try{
    const startYear=Number(els.season.value),endYear=els.scope.value==='range'?Number(els.seasonEnd.value):startYear,lo=Math.min(startYear,endYear),hi=Math.max(startYear,endYear),years=[];for(let y=lo;y<=hi;y++)years.push(y);
    const metricEvents=[];for(let y of years){const events=await loadEvents(y,els.seasonType.value,els.scope.value==='range'?'ALL':els.week.value,new AbortController().signal);for(const e of events){const c=getCachedGame(e,0);if(c?.metricEvents)metricEvents.push(...c.metricEvents)}}model.metricEvents=metricEvents;rebuildMetricEdges();render();
  }catch(e){console.warn('Metric enrichment unavailable',e)}};
  els.load.onclick=null;els.load.replaceWith(els.load.cloneNode(true));els.load=document.getElementById('load');els.load.addEventListener('click',load);
  metricEl.addEventListener('change',()=>model&&render());
}
