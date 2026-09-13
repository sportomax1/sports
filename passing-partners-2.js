function athleteRecord(a,teamAbbr=''){
  if(!a)return null;
  return {id:idVal(a.id),name:a.fullName||a.displayName||a.shortName||'',shortName:a.shortName||'',position:a.position?.abbreviation||a.position?.name||'',headshot:a.headshot?.href||a.headshot||'',team:teamNorm(teamAbbr)};
}

function getSummaryAthletes(summary){
  const byId=new Map(),byNorm=new Map();
  for(const block of (summary?.boxscore?.players||[])){
    const teamAbbr=teamNorm(block?.team?.abbreviation||'');
    for(const stat of (block.statistics||[])){
      for(const row of (stat.athletes||[])){
        const rec=athleteRecord(row.athlete,teamAbbr);if(!rec||(!rec.id&&!rec.name))continue;
        if(rec.id&&!byId.has(rec.id))byId.set(rec.id,rec);
        for(const nm of [rec.name,rec.shortName,row.athlete?.displayName,row.athlete?.fullName]){const n=normName(nm);if(n&&!byNorm.has(n))byNorm.set(n,rec)}
      }
    }
  }
  return {byId,byNorm};
}

function teamIdMap(summary){
  const m=new Map();
  for(const c of (summary?.header?.competitions?.[0]?.competitors||[]))m.set(idVal(c?.team?.id),teamNorm(c?.team?.abbreviation));
  for(const t of (summary?.boxscore?.teams||[]))m.set(idVal(t?.team?.id),teamNorm(t?.team?.abbreviation));
  return m;
}

function statRows(summary,kind,teamIds=teamIdMap(summary)){
  const rows=[];
  for(const block of (summary?.boxscore?.players||[])){
    const team=teamNorm(block?.team?.abbreviation||teamIds.get(idVal(block?.team?.id))||'');
    for(const stat of (block.statistics||[])){
      const nm=String(stat.name||stat.displayName||stat.label||'').toLowerCase();
      const labels=(stat.labels||[]).map(x=>String(x).toLowerCase());
      const keys=(stat.keys||[]).map(x=>String(x).toLowerCase());
      const isPassing=nm.includes('pass')||labels.some(x=>x.includes('c/att')||x==='att'||x.includes('passing'))||keys.some(x=>x.includes('passing'));
      const isReceiving=nm.includes('receiv')||keys.some(x=>x.includes('receiv'))||labels.includes('rec')||labels.includes('tgts');
      if((kind==='passing'&&!isPassing)||(kind==='receiving'&&!isReceiving))continue;
      for(const row of (stat.athletes||[])){
        const a=athleteRecord(row.athlete,team);if(!a)continue;
        const vals=row.stats||[];let attempts=0,receptions=0,tds=0;
        const tdIndex=labels.findIndex(x=>x==='td'||x.includes('touchdown'));
        if(tdIndex>=0)tds=num(vals[tdIndex]);
        if(kind==='passing'){
          const attIndex=labels.findIndex(x=>x==='att'||x.includes('c/att')||x.includes('cmp/att'));
          if(attIndex>=0){const v=String(vals[attIndex]??'');attempts=v.includes('/')?num(v.split('/').pop()):num(v)}
          if(!attempts){for(const v of vals){const s=String(v);if(/^\d+\/\d+$/.test(s)){attempts=num(s.split('/')[1]);break}}}
        }else{
          const recIndex=labels.findIndex(x=>x==='rec'||x==='receptions');if(recIndex>=0)receptions=num(vals[recIndex]);
        }
        rows.push({...a,attempts,receptions,tds});
      }
    }
  }
  // ESPN can expose the same category with multiple aliases; dedupe by player/team and keep richest row.
  const best=new Map();
  for(const r of rows){const k=`${r.team}|${keyFor(r.id,r.name)}`;const old=best.get(k);if(!old||(r.attempts+r.receptions+r.tds)>(old.attempts+old.receptions+old.tds))best.set(k,r)}
  return [...best.values()];
}

function getPassingRows(summary,teamIds){return statRows(summary,'passing',teamIds)}
function getReceivingRows(summary,teamIds){return statRows(summary,'receiving',teamIds)}

function mergePlay(old,p){
  if(!old)return p;
  const longText=[old.text,p.text].filter(Boolean).sort((a,b)=>String(b).length-String(a).length)[0]||'';
  const longShort=[old.shortText,p.shortText].filter(Boolean).sort((a,b)=>String(b).length-String(a).length)[0]||'';
  const oldParts=old.players||old.participants||[];const newParts=p.players||p.participants||[];
  return {...old,...p,text:longText,shortText:longShort,team:p.team||old.team,type:p.type||old.type,playType:p.playType||old.playType,participants:newParts.length?newParts:oldParts};
}

function allCandidateScoringPlays(summary){
  const byId=new Map();let anonymous=0;
  const add=p=>{
    if(!p)return;const id=idVal(p.id||p.playId||p.sequenceNumber)||`anon-${anonymous++}-${p.text||p.shortText||''}`;
    byId.set(id,mergePlay(byId.get(id),p));
  };
  for(const p of (summary?.scoringPlays||[]))add(p);
  const drives=[];
  if(Array.isArray(summary?.drives?.previous))drives.push(...summary.drives.previous);
  if(summary?.drives?.current)drives.push(summary.drives.current);
  if(Array.isArray(summary?.drives))drives.push(...summary.drives);
  for(const d of drives)for(const p of (d?.plays||[])){
    const isScore=p?.scoringPlay===true||/touchdown/i.test(String(p?.type?.text||p?.playType?.text||''))||/touchdown/i.test(String(p?.text||''));if(isScore)add(p)
  }
  for(const p of (summary?.plays||[])){
    const isScore=p?.scoringPlay===true||/touchdown/i.test(String(p?.type?.text||p?.playType?.text||''))||/touchdown/i.test(String(p?.text||''));if(isScore)add(p)
  }
  return [...byId.values()];
}

function isPassTD(play){
  const typ=String(play?.type?.text||play?.playType?.text||play?.type?.abbreviation||play?.playType?.abbreviation||'');
  const text=`${play?.shortText||''} ${play?.text||''}`;
  if(/two[- ]point/i.test(typ)&&!/touchdown/i.test(typ))return false;
  if(/passing touchdown|touchdown pass|pass td/i.test(typ))return true;
  if(/\bpass from\b/i.test(text)&&!/two-point conversion/i.test(text))return true;
  return /\bpass\b/i.test(text)&&/touchdown/i.test(text)&&!/intercept/i.test(text);
}

function resolveNameToken(token,athletes){
  const raw=cleanName(token).replace(/^\d+-/,'').replace(/[.,]+$/,'');
  const direct=athletes.byNorm.get(normName(raw));if(direct)return direct;
  const initialMatch=raw.match(/^([A-Za-z])\.?\s*([A-Za-z'\-]+)$/);
  if(initialMatch){const [,fi,last]=initialMatch;for(const rec of athletes.byId.values()){
    const parts=cleanName(rec.name).split(' ');if(parts.length<2)continue;
    const lastClean=parts.at(-1).replace(/[^A-Za-z]/g,'').toLowerCase();
    if(parts[0][0]?.toLowerCase()===fi.toLowerCase()&&lastClean===last.replace(/[^A-Za-z]/g,'').toLowerCase())return rec;
  }}
  return null;
}

function parsePassTD(play,athletes){
  const text=cleanName(play?.text||''),short=cleanName(play?.shortText||'');
  // Prefer text because ESPN scoring summaries directly describe "receiver ... pass from passer".
  for(const s of [short,text].filter(Boolean)){
    let m=s.match(/^(.+?)\s+\d+\s+Yd(?:s)?\s+pass from\s+(.+?)(?:\s+\([^)]*\)|$)/i);
    if(m){return {passer:resolveNameToken(m[2],athletes)||{id:'',name:cleanName(m[2])},receiver:resolveNameToken(m[1],athletes)||{id:'',name:cleanName(m[1])},method:'score-text'}}
    m=s.match(/^(.+?)\s+Pass From\s+(.+?)(?:\s+for\b|\s+\([^)]*\)|$)/i);
    if(m){return {passer:resolveNameToken(m[2],athletes)||{id:'',name:cleanName(m[2])},receiver:resolveNameToken(m[1],athletes)||{id:'',name:cleanName(m[1])},method:'score-text'}}
    m=s.match(/(?:^|\)\s*)([A-Za-z][A-Za-z .,'’\-]+?)\s+pass\b.*?\bto\s+(?:\d+-)?([A-Za-z][A-Za-z .,'’\-]+?)\s+for\b.*?\bTOUCHDOWN\b/i);
    if(m){return {passer:resolveNameToken(m[1],athletes)||{id:'',name:cleanName(m[1])},receiver:resolveNameToken(m[2],athletes)||{id:'',name:cleanName(m[2])},method:'pbp-text'}}
  }

  // Fallback to structured participants only when we can uniquely identify one QB and one receiver-type player.
  const participants=(play?.players||play?.participants||[]).map(p=>({id:idVal(p.playerId||p.athlete?.id||p.id),ath:athletes.byId.get(idVal(p.playerId||p.athlete?.id||p.id))})).filter(p=>p.id&&p.ath);
  const qbs=participants.filter(x=>String(x.ath.position||'').toUpperCase()==='QB');
  const recs=participants.filter(x=>['WR','TE','RB','FB'].includes(String(x.ath.position||'').toUpperCase()));
  if(qbs.length===1&&recs.length===1&&qbs[0].id!==recs[0].id)return {passer:qbs[0].ath,receiver:recs[0].ath,method:'participants'};
  return null;
}

function matchRow(person,rows){
  if(!person)return null;
  if(person.id){const byId=rows.find(r=>r.id&&r.id===person.id);if(byId)return byId}
  const n=normName(person.name);if(n){const byName=rows.find(r=>normName(r.name)===n);if(byName)return byName}
  return null;
}

function processSummary(summary,event){
  const athletes=getSummaryAthletes(summary),teamIds=teamIdMap(summary);
  const passingRows=getPassingRows(summary,teamIds),receivingRows=getReceivingRows(summary,teamIds);
  const officialPassTDs=passingRows.reduce((s,r)=>s+num(r.tds),0);
  const raw=[],unresolved=[];

  for(const play of allCandidateScoringPlays(summary)){
    if(!isPassTD(play))continue;
    const parsed=parsePassTD(play,athletes);
    if(!parsed?.passer?.name||!parsed?.receiver?.name){unresolved.push({reason:'parse',gameId:idVal(event?.id),text:play?.shortText||play?.text||'',type:play?.type?.text||play?.playType?.text||''});continue}

    const officialPasser=matchRow(parsed.passer,passingRows);
    const officialReceiver=matchRow(parsed.receiver,receivingRows);
    // Reject a pairing if ESPN's boxscore does not support both sides as TD contributors.
    if(!officialPasser||num(officialPasser.tds)<=0){unresolved.push({reason:'passer-boxscore',gameId:idVal(event?.id),text:play?.shortText||play?.text||''});continue}
    if(!officialReceiver||num(officialReceiver.tds)<=0){unresolved.push({reason:'receiver-boxscore',gameId:idVal(event?.id),text:play?.shortText||play?.text||''});continue}

    const scoringTeam=teamNorm(play?.team?.abbreviation||teamIds.get(idVal(play?.team?.id||play?.teamId))||officialPasser.team||officialReceiver.team||'');
    raw.push({playId:idVal(play?.id||play?.playId||play?.sequenceNumber),gameId:idVal(event?.id),season:Number(event?.season?.year||event?.__year||0),seasonType:Number(event?.season?.type||event?.__seasonType||0),week:event?.week?.number||event?.__week||'',date:event?.date||'',gameName:event?.shortName||event?.name||'',team:scoringTeam,passerId:idVal(officialPasser.id),passerName:cleanName(officialPasser.name),passerHeadshot:officialPasser.headshot||'',passerPosition:officialPasser.position||'QB',receiverId:idVal(officialReceiver.id),receiverName:cleanName(officialReceiver.name),receiverHeadshot:officialReceiver.headshot||'',receiverPosition:officialReceiver.position||'',method:parsed.method,text:play?.shortText||play?.text||''});
  }

  // Enforce ESPN's official per-passer TD total. This protects against duplicate/richer scoring-play variants.
  const allowed=new Map(passingRows.filter(r=>num(r.tds)>0).map(r=>[keyFor(r.id,r.name),num(r.tds)]));
  const used=new Map(),tds=[];
  const confidence={"score-text":3,"pbp-text":2,"participants":1};
  raw.sort((a,b)=>(confidence[b.method]||0)-(confidence[a.method]||0));
  const seenPlay=new Set();
  for(const td of raw){
    if(td.playId&&seenPlay.has(td.playId))continue;
    const k=keyFor(td.passerId,td.passerName),limit=allowed.get(k)||0,usedCount=used.get(k)||0;
    if(usedCount>=limit)continue;
    tds.push(td);used.set(k,usedCount+1);if(td.playId)seenPlay.add(td.playId);
  }

  const missing=Math.max(0,officialPassTDs-tds.length);
  if(missing)unresolved.push({reason:'official-gap',gameId:idVal(event?.id),count:missing,text:`ESPN boxscore has ${officialPassTDs} passing TD(s); ${tds.length} pair(s) resolved.`});
  return {tds,unresolved,passingRows,receivingRows,officialPassTDs};
}

const CACHE_VERSION='pp-v6';
function cacheKey(eventId){return `${CACHE_VERSION}:${eventId}`}
function getCachedGame(event,index){
  try{
    const raw=localStorage.getItem(cacheKey(event.id));if(!raw)return null;
    const parsed=JSON.parse(raw);if(!parsed||parsed.eventId!==String(event.id))return null;
    return {...parsed.data,__index:index,event,__cached:true};
  }catch{return null}
}
function setCachedGame(event,data){
  try{
    const compact={tds:data.tds||[],unresolved:data.unresolved||[],passingRows:data.passingRows||[],receivingRows:data.receivingRows||[],officialPassTDs:num(data.officialPassTDs)};
    localStorage.setItem(cacheKey(event.id),JSON.stringify({eventId:String(event.id),savedAt:Date.now(),data:compact}));
  }catch{/* storage can be unavailable/full; live loading still works */}
}

function buildHistoricalRows(summaryResults){
  const agg=new Map();
  for(const r of summaryResults){if(!r||r.__error)continue;for(const p of r.passingRows||[]){
    if(!p.team||!p.name)continue;const key=p.team+'|'+keyFor(p.id,p.name);
    const cur=agg.get(key)||{...p,attempts:0,games:0,lastIndex:-1};cur.attempts+=num(p.attempts);cur.games++;cur.lastIndex=Math.max(cur.lastIndex,r.__index??0);agg.set(key,cur);
  }}
  const byTeam=new Map();for(const p of agg.values()){
    const old=byTeam.get(p.team);if(!old||p.attempts>old.attempts||(p.attempts===old.attempts&&p.lastIndex>old.lastIndex))byTeam.set(p.team,p)
  }
  return [...byTeam.values()].map(p=>({...p,teams:[p.team],position:'QB',source:'Season pass-attempt leader',teamName:p.team,teamLogo:'',shortName:p.shortName||''})).sort((a,b)=>a.team.localeCompare(b.team));
}

function chooseQBRows(currentRows,historicalRows,year){
  if(year!==currentYear||currentRows.length<20)return historicalRows;
  const histByTeam=new Map(historicalRows.map(x=>[x.team,x]));
  const merged=currentRows.map(q=>{const h=histByTeam.get(q.team);return {...q,id:q.id||h?.id||'',headshot:q.headshot||h?.headshot||''}});
  const seen=new Set(merged.map(x=>x.team));for(const h of historicalRows)if(!seen.has(h.team))merged.push({...h,source:'Season fallback'});
  return merged.sort((a,b)=>a.team.localeCompare(b.team));
}
