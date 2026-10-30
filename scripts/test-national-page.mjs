#!/usr/bin/env node
/** Simulate the real static nationwide dashboard with ESPN snapshots, no browser dependencies. */
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const js=await readFile('college-national-engine.js','utf8');
const elements=new Map(),listeners=new Map();
class Element{
 constructor(id){
  this.id=id;this.value='';this.textContent='';this.innerHTML='';this.hidden=false;this.disabled=false;this.options=[];
  this.dataset={};this.attributes={};this.style={};this.classList={toggle(){},add(){},remove(){}};
  this.parentElement={querySelector:()=>new Element('nested')};
 }
 add(opt){this.options.push(opt);if(this.options.length===1)this.value=String(opt.value)}
 replaceChildren(...values){this.options=values;this.value=String(values[0]?.value??'')}
 addEventListener(event,fn){listeners.set(this.id+':'+event,fn)}
 setAttribute(key,val){this.attributes[key]=val}
 querySelector(){return null}
 click(){throw Error('Unexpected click')}
}
const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id)};
get('sport').value='football';get('rowLimit').value='250';get('sortTeams').value='activity';
const tabs=['moves','teams','routes','draft','retention','coverage'].map(id=>{
 const element=get('tab-'+id);element.dataset.tab=id;return element;
});
const document={
 getElementById:get,querySelectorAll(selector){return selector==='.tab'?tabs:[]},
 createElement(name){return new Element(name)}
};
class Option{constructor(label,value){this.label=label;this.value=String(value)}}
const years=[2024,2025,2026],snapshots={};
for(const year of years){
 const path='data/college-rosters/football/'+year+'.json';
 try{snapshots[year]=JSON.parse(await readFile(path,'utf8'))}
 catch(e){throw Error('UI integration requires committed national snapshot: '+path)}
}
const fetch=async url=>{
 const year=Number(String(url).match(/\/(\d{4})\.json/)?.[1]);
 const payload=String(url).includes('data/college-rosters/football')?snapshots[year]:null;
 return{ok:!!payload,status:payload?200:404,json:async()=>payload};
};
const ss=new Map(),sessionStorage={getItem:k=>ss.get(k)||null,setItem:(k,v)=>ss.set(k,v)};
const ctx={document,fetch,Option,sessionStorage,Blob,URL,console,
 setTimeout,clearTimeout,encodeURIComponent,Intl,Date,Math,Number,Map,Set,JSON,Promise};
vm.runInNewContext(js,ctx,{timeout:4000});
await new Promise(resolve=>setTimeout(resolve,350));
assert.match(get('loaded').textContent,/observed school switches/);
assert.notEqual(get('kEntries').textContent,'—');
assert(get('team').options.length>100,'School scope must include nationwide choices');
assert.match(get('tabContent').innerHTML,/Roster-inferred/);
assert.match(get('coverage').textContent,/ESPN-listed schools/);
assert.equal(get('team').options[0].label,'All ESPN-listed schools');
for(const tab of ['teams','routes','draft','retention','coverage']){
 const b=get('tab-'+tab);listeners.get(b.id+':click')();
 assert(get('viewTitle').textContent.length>5,tab+' has a heading');
 assert(get('tabContent').innerHTML.length>100,tab+' renders data');
}
get('team').value=get('team').options.find(x=>x.value==='38')?.value||get('team').options[1].value;
listeners.get('team:change')();
assert(get('coverage').textContent.includes('ESPN-listed schools'),'School scope must retain national coverage');
console.log('PASS national UI integration: loaded all schools, charts/KPIs, six views, and school filtering');
