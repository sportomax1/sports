async function rosterIds(y,teamId){
  const key=`roster:${y}:${teamId}`,cached=await dbGet('done',key);
  const fresh=cached&&(y!==cur||Date.now()-(cached.at||0)<CURRENT_TTL);
  if(fresh&&!$('#force').checked&&Array.isArray(cached.athleteIds))return {ids:cached.athleteIds,cached:true,pages:cached.pages||1};

  const d=await collection(`${CORE}/seasons/${y}/teams/${teamId}/athletes?limit=200`);
  const ids=[...new Set(d.items.map(x=>String(x.id||refId(x.$ref))).filter(Boolean))];
  const next=new Set(ids),changed=new Map();

  for(const oldId of cached?.athleteIds||[]){
    if(next.has(String(oldId)))continue;
    const p=P.get(String(oldId));
    if(!p?.seasons?.[y])continue;
    p.seasons[y]=p.seasons[y].filter(x=>x!==String(teamId));
    if(!p.seasons[y].length)delete p.seasons[y];
    changed.set(p.id,p);
  }

  for(const id of ids){const p=associate(id,y,teamId);changed.set(p.id,p)}
  await dbPutMany('players',[...changed.values()]);
  await dbPut('done',{key,year:y,teamId,athleteIds:ids,count:ids.length,pages:d.pages,at:Date.now()});
  return {ids,cached:false,pages:d.pages};
}
