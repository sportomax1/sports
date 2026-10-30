#!/usr/bin/env node
/**
 * ESPN NCAA Division I roster snapshot. One sport and year per job.
 * Usage: node scripts/build-national-college-rosters.mjs football 2025
 * No secrets. Includes FBS + FCS or D-I men's basketball.
 * Per-team success/partial/missing, never turns a missing roster into empty.
 */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const sport=process.argv[2],year=Number(process.argv[3]);
const LEAGUES={
 football:{path:'football/college-football',groups:['80','81'],minimum:210},
 basketball:{path:'basketball/mens-college-basketball',groups:['50'],minimum:300}
};
if(!LEAGUES[sport]||!Number.isInteger(year)||year<2013||year>new Date().getUTCFullYear()+1){
 console.error('Usage: node scripts/build-national-college-rosters.mjs <football|basketball> <2013..nextYear>');process.exit(2);
}
const cfg=LEAGUES[sport],outDir=join('data','college-rosters',sport),outFile=join(outDir,year+'.json');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let requests=0;
async function fetchJSON(url,{attempts=4}={}){
 let last;
 for(let i=0;i<attempts;i++){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),25000);
  try{
   requests++;
   const res=await fetch(url,{signal:ctrl.signal,headers:{'User-Agent':'CollegeMovementLab/2.2 ESPN roster history','Accept':'application/json'}});
   if(!res.ok){
    const err=new Error('HTTP '+res.status);err.status=res.status;
    if(res.status===400||res.status===404||res.status===410)throw err;
    last=err;
   }else{
    const body=await res.json();
    if(!body||typeof body!=='object')throw Error('Invalid ESPN JSON');
    return body;
   }
  }catch(e){last=e;if([400,404,410].includes(e.status))throw e}
  finally{clearTimeout(timer)}
  if(i+1<attempts)await delay(700*2**i+Math.round(Math.random()*350));
 }
 throw last||new Error('ESPN fetch failed');
}
function normalizeDirectory(obj){
 const raw=obj?.sports?.[0]?.leagues?.[0]?.teams||obj?.teams||[];
 return raw.map(item=>item.team||item).map(team=>({
  id:String(team.id||''),name:String(team.displayName||team.name||''),
  abbr:String(team.abbreviation||''),logo:String(team.logos?.[0]?.href||''),
  conference:String(team.groups?.id||team.group?.id||'')
 })).filter(team=>/^\d+$/.test(team.id)&&team.name);
}
async function directory(){
 const map=new Map(),errors=[];
 for(const group of cfg.groups){
  const url='https://site.api.espn.com/apis/site/v2/sports/'+cfg.path+'/teams?groups='+group+'&limit=1000';
  try{
   const data=normalizeDirectory(await fetchJSON(url));
   if(data.length<(sport==='football'?75:250))throw Error('Unexpectedly small group '+group+': '+data.length);
   for(const team of data)map.set(team.id,team);
   console.log('directory group',group,data.length);
  }catch(e){errors.push(group+': '+e.message)}
 }
 // Never mark nationwide complete when the team directory is incomplete.
 if(errors.length||map.size<cfg.minimum)throw Error('Incomplete national team directory: '+map.size+' teams, '+errors.join(' | '));
 return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name));
}
function athId(r){
 const direct=String(r?.id||'');
 if(/^\d+$/.test(direct))return direct;
 const ref=String(r?.['$ref']||r?.athlete?.['$ref']||r?.href||'');
 return ref.match(/\/athletes\/(\d+)(?:[/?#]|$)/)?.[1]||'';
}
async function roster(team){
 const url='https://sports.core.api.espn.com/v2/sports/'+cfg.path.replace('/','/leagues/')+'/seasons/'+year+'/teams/'+team.id+'/athletes?limit=200&lang=en&region=us';
 try{
  const first=await fetchJSON(url);
  const pageCount=Math.max(1,Number(first.pageCount)||1),pages=Math.min(12,pageCount);
  const entries=[...(first.items||[])];let pagesFailed=0;
  for(let p=2;p<=pages;p++){
   try{const pg=await fetchJSON(url+'&page='+p);entries.push(...(pg.items||[]))}
   catch(e){pagesFailed++}
  }
  const ids=[...new Set(entries.map(athId).filter(Boolean))];
  const expected=Number(first.count)||ids.length;
  const minimumRoster=sport==='football'?35:10;
  const complete=!pagesFailed&&pageCount<=12&&ids.length>=expected&&ids.length>=minimumRoster;
  return {...team,status:complete?'ok':'partial',ids,reportedCount:expected,
   note:complete?'':('Roster too sparse or incomplete; expected '+expected+', got '+ids.length+'; minimum '+minimumRoster)};
 }catch(e){
  return {...team,status:'missing',ids:[],reportedCount:null,note:e.message};
 }
}
async function main(){
 const teams=await directory();
 if(process.argv.includes('--directory-only')){console.log('DIRECTORY CHECK PASS',sport,teams.length);return;}
 await mkdir(outDir,{recursive:true});
 // Reuse successful snapshots from previous interrupted runs and keep prior-year immutable.
 let prior;try{prior=JSON.parse(await readFile(outFile,'utf8'))}catch{}
 const minimumRoster=sport==='football'?35:10;
 const existing=new Map((prior?.teams||[]).filter(t=>t.status==='ok'&&Array.isArray(t.ids)&&t.ids.length>=minimumRoster).map(t=>[t.id,t]));
 const results=new Map(),work=teams.filter(t=>!existing.has(t.id));
 for(const t of teams)if(existing.has(t.id))results.set(t.id,{...t,...existing.get(t.id)});
 console.log(sport,year,'total schools',teams.length,'cached complete',existing.size,'to fetch',work.length);
 let cursor=0,done=0;
 async function worker(){
  while(cursor<work.length){
   const team=work[cursor++];
   const result=await roster(team);
   results.set(team.id,result);
   done++;
   if(done%25===0||done===work.length)console.log('progress',done,'/',work.length,'successful', [...results.values()].filter(t=>t.status==='ok').length);
   await delay(110);
  }
 }
 await Promise.all(Array.from({length:Math.min(5,work.length)},worker));
 const rows=teams.map(t=>results.get(t.id)||{...t,status:'missing',ids:[],note:'Not fetched'});
 const ok=rows.filter(t=>t.status==='ok').length,partial=rows.filter(t=>t.status==='partial').length,missing=rows.length-ok-partial;
 // Avoid publishing a badly failed season; fail the job rather than a misleading dataset.
 if(ok<Math.max(30,Math.floor(teams.length*.30)))throw Error('Only '+ok+'/'+teams.length+' complete team rosters; refusing to publish snapshot');
 const output={version:2,source:'ESPN Core historical season-athlete index',sport,year,
  generatedAt:new Date().toISOString(),scope:sport==='football'?'All ESPN-listed college football schools':"All ESPN-listed college men's basketball schools",
  coverage:{directoryTeams:teams.length,complete:ok,partial,missing,rosterCompletenessPct:Number((100*ok/rows.length).toFixed(1)),requests},
  teams:rows};
 await writeFile(outFile,JSON.stringify(output)+'\n');
 console.log('WROTE',outFile,'complete',ok,'partial',partial,'missing',missing,'total athletes memberships',rows.reduce((s,r)=>s+r.ids.length,0));
}
await main();
