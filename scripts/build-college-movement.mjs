#!/usr/bin/env node
/* Build static College Movement Lab snapshots from CFBD + CBBD.
 * Uses the same normalization and validation as api/college-movement.js.
 * Run: node scripts/build-college-movement.mjs [--history]
 * Required secrets: CFBD_API_KEY / CBBD_API_KEY.
 * By default: previous + current portal cycles, last two drafts. --history: 2021–current.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const handler=require('../api/college-movement.js');
const root=path.resolve('data/college-movement');
const history=process.argv.includes('--history');
const thisYear=new Date().getUTCFullYear();
const sports=['football','basketball'];
const available={football:!!process.env.CFBD_API_KEY,basketball:!!process.env.CBBD_API_KEY};
let total=0,errors=[],saved=[];
async function get(sport,type,year){
 let status=200, payload=null;
 const res={
  setHeader(){return this;},
  status(code){status=code;return this;},
  json(data){payload=data;return this;}
 };
 await handler({method:'GET',query:{sport,type,year:String(year)}},res);
 if(status!==200||!payload||!Array.isArray(payload.records))throw Error((payload&&payload.error)||('HTTP '+status));
 return payload;
}
for(const sport of sports){
 if(!available[sport]){console.log('Skipping '+sport+': API key not configured');continue;}
 for(const type of ['portal','draft']){
  const start=history?2021:Math.max(2021,thisYear-1),end=thisYear;
  const directory=path.join(root,sport,type);
  await fs.mkdir(directory,{recursive:true});
  for(let year=start;year<=end;year++){
   const dest=path.join(directory,year+'.json');
   try{
    const result=await get(sport,type,year);
    // Preserve previous bytes when record content is unchanged so scheduled jobs don't create noise.
    const output={sport,type,year,count:result.records.length,source:result.source,records:result.records};
    const prior=await fs.readFile(dest,'utf8').catch(()=>null);
    const next=JSON.stringify(output);
    if(prior!==next)await fs.writeFile(dest,next+'\n');
    saved.push({sport,type,year,count:result.records.length});
    total++;
    console.log(sport,type,year,result.records.length,'records');
   }catch(e){errors.push(sport+' '+type+' '+year+': '+e.message);console.error('FAILED',errors[errors.length-1]);}
   // Avoid bursts into a shared account quota.
   await new Promise(resolve=>setTimeout(resolve,350));
  }
 }
}
if(total){
 const manifest={generatedAt:new Date().toISOString(),available,snapshots:saved,errors};
 await fs.mkdir(root,{recursive:true});
 await fs.writeFile(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
}
console.log('Saved '+total+' snapshots, '+errors.length+' errors');
if(!total){console.error('No snapshots produced. Check GitHub Actions secrets and provider access.');process.exitCode=1;}
else if(errors.length)process.exitCode=1;
