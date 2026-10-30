#!/usr/bin/env node
/* College Movement Lab: publish DERIVED aggregate metrics only.
 * The CFBD/CBBD terms prohibit publishing raw or substantially equivalent datasets.
 * No player-level API records or API keys are written to this public repository.
 * Run: node scripts/build-college-movement.mjs [--history]
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const handler=require('../api/college-movement.js');
const root=path.resolve('data/college-movement');
const manifestPath=path.join(root,'manifest.json');
const previous=await fs.readFile(manifestPath,'utf8').then(JSON.parse).catch(()=>({snapshots:[]}));
const history=process.argv.includes('--history')||!previous.snapshots?.length;
const thisYear=new Date().getUTCFullYear();
const available={football:!!process.env.CFBD_API_KEY,basketball:!!process.env.CBBD_API_KEY};
// Temporary access credential exists only in this process; never written to disk.
const access=randomBytes(32).toString('hex');
process.env.DASHBOARD_ACCESS_TOKEN=access;
async function get(sport,type,year){
 let status=200,payload=null;
 const res={setHeader(){return this},status(code){status=code;return this},json(data){payload=data;return this}};
 await handler({method:'GET',headers:{'x-dashboard-access':access},query:{sport,type,year:String(year)}},res);
 if(status!==200||!payload||!Array.isArray(payload.records))throw Error(payload?.error||('HTTP '+status));
 return payload.records;
}
function counts(rows,field){
 const m=new Map();
 for(const r of rows){const key=String(r[field]||'').trim();if(key)m.set(key,(m.get(key)||0)+1);}
 return [...m.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]));
}
function derive(sport,year,portal,draft){
 const routeMap=new Map();
 for(const r of portal){
   if(!r.origin||!r.destination||r.origin===r.destination)continue;
   const k=JSON.stringify([r.origin,r.destination]);
   routeMap.set(k,(routeMap.get(k)||0)+1);
 }
 const routes=[...routeMap].map(([k,count])=>{const [origin,destination]=JSON.parse(k);return {origin,destination,count};})
   .sort((a,b)=>b.count-a.count||a.origin.localeCompare(b.origin));
 return {sport,year,portalEntries:portal.length,knownDestinations:portal.filter(r=>r.destination).length,
  draftPicks:draft.length,originCounts:counts(portal,'origin'),
  destinationCounts:counts(portal,'destination'),
  draftCollegeCounts:counts(draft,'college'),routes,
  note:'Derived aggregate counts only. No player-level records are published.'};
}
let errors=[],snapshots=new Map((previous.snapshots||[]).map(x=>[x.sport+':'+x.year,x]));
let success=0;
for(const sport of ['football','basketball']){
 if(!available[sport]){console.log('Skipped '+sport+': missing key');continue;}
 const start=history?2021:Math.max(2021,thisYear-1);
 const directory=path.join(root,'summaries',sport);
 await fs.mkdir(directory,{recursive:true});
 for(let year=start;year<=thisYear;year++){
  try{
   const portal=await get(sport,'portal',year);
   const draft=await get(sport,'draft',year);
   const derived=derive(sport,year,portal,draft);
   const dest=path.join(directory,year+'.json');
   const next=JSON.stringify(derived);
   const prior=await fs.readFile(dest,'utf8').catch(()=>null);
   if(prior?.trimEnd()!==next)await fs.writeFile(dest,next+'\n');
   snapshots.set(sport+':'+year,{sport,year,portalEntries:derived.portalEntries,draftPicks:derived.draftPicks});
   success++;
   console.log(sport,year,derived.portalEntries+' portal entries',derived.draftPicks+' draft picks');
  }catch(e){errors.push(sport+' '+year+': '+e.message);console.error(errors[errors.length-1]);}
  await new Promise(resolve=>setTimeout(resolve,400));
 }
}
if(success){
 await fs.mkdir(root,{recursive:true});
 await fs.writeFile(manifestPath,JSON.stringify({
  generatedAt:new Date().toISOString(),
  kind:'derived-aggregate-only',
  snapshots:[...snapshots.values()].sort((a,b)=>a.sport.localeCompare(b.sport)||a.year-b.year),
  errors
 },null,2)+'\n');
}
console.log(success+' aggregate seasons saved; '+errors.length+' errors');
if(!success||errors.length)process.exitCode=1;
