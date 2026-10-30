#!/usr/bin/env node
/** National college movement quality regression tests; no network or credentials needed. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {validSnapshot,analyze}=require('../college-national-engine.js');
const team=(id,name,ids,status='ok')=>({id,name,ids,status});
const players=(from,to)=>Array.from({length:to-from+1},(_,i)=>String(from+i));
function fixture(year,change=false){
 const a=players(100,111),b=players(200,211);
 if(change){
  a.pop();a.push('999');
  b.push('111');
  b.push('105'); // Same year duplicate team membership: NEVER infer a transfer for 105
 }
 const teams=[team('1','Team A',a),team('2','Team B',b)];
 while(teams.length<110)teams.push(team(String(teams.length+1),'Partial school '+teams.length,[],'partial'));
 return{version:2,sport:'basketball',year,teams};
}
const f24=validSnapshot(fixture(2024), 'basketball',2024);
const f25=validSnapshot(fixture(2025,true), 'basketball',2025);
const result=analyze([f24,f25]);
assert.equal(result.coverage[0].complete,2);
assert.equal(result.coverage[1].complete,2);
assert.equal(result.movement.length,1,'One unambiguous observed school switch');
assert.deepEqual(result.movement[0],{id:'111',year:2025,fromId:'1',toId:'2',from:'Team A',to:'Team B'});
assert.equal(result.teamStats.get('1').retained,11);
assert.equal(result.teamStats.get('1').new,1);
assert.equal(result.teamStats.get('1').exits,1);
assert.equal(result.teamStats.get('2').new,2,'Both incoming players newly appear on B');
assert.equal(result.teamStats.get('2').switchedIn,1);
assert(!result.movement.some(x=>x.id==='105'),'Same-season duplicate excluded');
const invalid=fixture(2024);invalid.teams[0].ids=['5'];const sanitized=validSnapshot(invalid,'basketball',2024);
assert.equal(sanitized.teams[0].status,'partial','Sparse rosters must never count as complete');
assert.equal(sanitized.teams[0].ids.length,0,'Sparse membership removed from comparison');
assert.throws(()=>validSnapshot({version:1,sport:'basketball',year:2025,teams:[]},'basketball',2025));
assert.throws(()=>validSnapshot(fixture(2025),'football',2025));
const missing=validSnapshot({...fixture(2025),teams:[team('1','Team A',[], 'missing'),team('2','Team B',players(200,211)),...fixture(2025).teams.slice(2)]},'basketball',2025);
assert.equal(analyze([f24,missing]).teamStats.get('1').eligiblePairs,0,'Missing roster cannot be treated as empty');
const current=new Date().getUTCFullYear(),paths=['football','basketball'].flatMap(s=>[current-2,current-1,current].map(y=>({sport:s,year:y,path:'data/college-rosters/'+s+'/'+y+'.json'})));
let real=0;
for(const sport of ['football','basketball']){
 const rows=[];
 for(const p of paths.filter(x=>x.sport===sport)){
  try{const d=JSON.parse(await readFile(p.path,'utf8'));const x=validSnapshot(d,sport,p.year);rows.push(x)}
  catch(e){console.warn('National sample unavailable:',p.path,e.message)}
 }
 if(rows.length>=2){
  const out=analyze(rows);
  const coverage=out.coverage.reduce((x,y)=>x+y.complete,0);
  assert(coverage>100,'National index unexpectedly sparse');
  assert(out.movement.every(t=>t.fromId!==t.toId&&t.year>rows[0].year));
  assert(out.yearStats.every(y=>y.entrants>=0&&y.exits>=0&&y.comparisons>=0));
  for(const a of out.teamStats.values())assert(a.retained<=a.previous);
  console.log('REAL',sport,'years',rows.map(x=>x.year).join(','),'teams',out.teams.size,'athletes',out.athletes.size,'moves',out.movement.length,'complete team-years',coverage);
  real++;
 }
}
if(!real)console.log('Offline fixture checks passed (national files not yet present).');
console.log('PASS all national college roster invariants');
