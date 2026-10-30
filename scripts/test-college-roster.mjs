#!/usr/bin/env node
// ESPN keyless historical roster smoke test: validates live schemas without publishing player data.
// Run with: node scripts/test-college-roster.mjs
const scenarios=[
 {sport:'football',league:'college-football',team:'38',year:2025,name:'Colorado football'},
 {sport:'basketball',league:'mens-college-basketball',team:'150',year:2025,name:'Duke basketball'}
];
function idOf(item){
 const ref=String(item?.['$ref']||item?.athlete?.['$ref']||item?.href||'');
 return String(item?.id||ref.match(/\/athletes\/(\d+)(?:[/?#]|$)/)?.[1]||'');
}
async function read(url){
 let last;
 for(let i=0;i<3;i++){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try{
   const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json','User-Agent':'CollegeMovementLab/2.0 data-check'}});
   if(!response.ok)throw Error('HTTP '+response.status);
   return await response.json();
  }catch(e){last=e;if(i<2)await new Promise(done=>setTimeout(done,1000*(i+1)));}
  finally{clearTimeout(timer)}
 }
 throw last;
}
let failures=0;
for(const t of scenarios){
 const base='https://sports.core.api.espn.com/v2/sports/'+t.sport+'/leagues/'+t.league;
 try{
  const endpoint=base+'/seasons/'+t.year+'/teams/'+t.team+'/athletes?limit=200';
  const roster=await read(endpoint);
  const ids=[...new Set((roster.items||[]).map(idOf).filter(Boolean))];
  if(ids.length<8)throw Error('Unexpectedly small roster athlete ID list: '+ids.length);
  const athlete=await read(base+'/athletes/'+ids[0]);
  if(!String(athlete.displayName||athlete.fullName||athlete.name||'').trim())throw Error('Athlete profile contains no player name');
  console.log('PASS',t.name,t.year,'indexed athlete IDs:',ids.length,'listed count:',roster.count,'page count:',roster.pageCount);
 }catch(e){failures++;console.error('FAIL',t.name,e.message);}
}
if(failures)process.exitCode=1;
