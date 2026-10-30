#!/usr/bin/env node
/* Publish only names/positions for roster-observed school switches.
 * No raw ESPN profile dump, and no third-party credentials.
 * Reuses successful prior lookups; partial failures keep existing names.
 */
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {analyze,validSnapshot}=require('../college-national-engine.js');
const sports=['football','basketball'];
const api={football:'football/leagues/college-football',basketball:'basketball/leagues/mens-college-basketball'};
const nowYear=new Date().getUTCFullYear();
async function readJSON(p){return JSON.parse(await readFile(p,'utf8'))}
async function get(url){
 let last;
 for(let n=0;n<3;n++){
  const c=new AbortController(),timeout=setTimeout(()=>c.abort(),16000);
  try{
   const res=await fetch(url,{signal:c.signal,headers:{Accept:'application/json','User-Agent':'CollegeMovementLabProfile/1.0'}});
   if(!res.ok)throw Error('ESPN '+res.status);
   return await res.json();
  }catch(e){last=e;if(n<2)await new Promise(r=>setTimeout(r,450*(n+1)))}
  finally{clearTimeout(timeout)}
 }throw last;
}
for(const sport of sports){
 const years=[nowYear-2,nowYear-1,nowYear];
 const snapshots=[];
 for(const year of years){
  try{snapshots.push(validSnapshot(await readJSON(join('data','college-rosters',sport,year+'.json')),sport,year))}
  catch(e){console.warn('No usable national snapshot for',sport,year,e.message)}
 }
 if(snapshots.length<2){console.log('Skipping profile build; fewer than 2 seasons',sport);continue}
 const model=analyze(snapshots);
 const ids=[...new Set(model.movement.map(x=>x.id))];
 const path=join('data','college-rosters','profiles',sport+'.json');
 let saved={};try{saved=(await readJSON(path)).athletes||{}}catch{}
 const results={...saved},need=ids.filter(id=>!saved[id]?.name);
 console.log('Profiles',sport,ids.length,'movement athletes',need.length,'unresolved');
 let index=0,completed=0,failures=0;
 async function worker(){
  while(index<need.length){
   const id=need[index++];
   try{
    const obj=await get('https://sports.core.api.espn.com/v2/sports/'+api[sport]+'/athletes/'+id+'?lang=en&region=us');
    const a=obj.athlete||obj,name=String(a.displayName||a.fullName||a.name||'').trim();
    if(!name)throw Error('No athlete name');
    results[id]={name,position:String(a.position?.abbreviation||''),image:String(a.headshot?.href||'')};
   }catch(e){failures++}
   completed++;if(completed%250===0||completed===need.length)console.log(sport,completed+'/'+need.length,'failed',failures);
   await new Promise(r=>setTimeout(r,70));
  }
 }
 await Promise.all(Array.from({length:Math.min(10,need.length)},worker));
 await mkdir(join('data','college-rosters','profiles'),{recursive:true});
 const kept=Object.fromEntries(Object.entries(results).filter(([id,p])=>p?.name&&ids.includes(id)));
 await writeFile(path,JSON.stringify({version:1,sport,generatedAt:new Date().toISOString(),movementAthletes:ids.length,
  fetched:Object.keys(kept).length,unresolved:ids.length-Object.keys(kept).length,athletes:kept})+'\n');
 console.log('Wrote',path,'resolved',Object.keys(kept).length,'unresolved',ids.length-Object.keys(kept).length);
}
