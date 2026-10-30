#!/usr/bin/env node
/** Headless school-logo UI regression: picker, tables, rankings, history, broken-image fallback. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const src=await readFile('college-logo-ui.js','utf8');
const els=new Map();
class FakeEl {
 constructor(tag='div',id=''){
  this.tagName=tag.toUpperCase();this.id=id;this.dataset={};this.children=[];this.childNodes=[];this.listeners={};
  this.attributes={};this.style={};this.hidden=id==='teamPickerPanel'||id==='schoolSpotlight'||id==='chartSchoolMark';
  this.value='';this.type='';this._text='';this.className='';this.options=[];this._classes=new Set();
  this.classList={add:(x)=>this._classes.add(x),contains:(x)=>this._classes.has(x)||this.className.split(/\s+/).includes(x)};
 }
 get textContent(){return this._text}
 set textContent(s){this._text=String(s)}
 setAttribute(k,v){this.attributes[k]=String(v)}
 addEventListener(k,cb){this.listeners[k]=cb}
 dispatchEvent(event){this.listeners[event.type]?.(event);return true}
 appendChild(child){this.children.push(child);this.childNodes.push(child);return child}
 append(...children){children.forEach(x=>this.appendChild(x))}
 replaceChildren(...children){this.children=[];this.childNodes=[];this.append(...children)}
 insertBefore(child,before){const index=this.children.indexOf(before);this.children.splice(index<0?0:index,0,child);this.childNodes=this.children.slice();return child}
 get firstChild(){return this.children[0]||null}
 focus(){this.focused=true}
 querySelector(q){return q.includes('data-school-option')?this.children.find(x=>x.dataset.schoolOption!==undefined):q==='.name'?this.nameElement:null}
 closest(q){if(q==='#schoolPicker')return null;return this}
}
const el=(id,tag)=>{if(!els.has(id))els.set(id,new FakeEl(tag,id));return els.get(id)};
const select=el('team','select');
select.options=[{value:'',textContent:'All ESPN-listed schools'},{value:'38',textContent:'Colorado Buffaloes'},{value:'333',textContent:'Alabama Crimson Tide'}];
select.value='';
const trigger=el('teamPickerTrigger','button'),panel=el('teamPickerPanel'),input=el('teamPickerSearch','input');
const list=el('teamPickerList'),rank=el('rank'),table=el('tabContent');
const rankButton=new FakeEl('button');rankButton.dataset.team='333';rankButton.className='rankrow';rankButton.textContent='Alabama Crimson Tide';
const rankName=new FakeEl('span');rankName.className='name';rankName.textContent='Alabama Crimson Tide';rankButton.nameElement=rankName;
const tableButton=new FakeEl('button');tableButton.dataset.team='38';tableButton.textContent='Colorado Buffaloes';
const pathRow=new FakeEl('div');pathRow.textContent='2025 · Colorado Buffaloes';pathRow.className='path-item';const year=new FakeEl('b');year.textContent='2025';pathRow.appendChild(year);
const doc={
 getElementById:id=>el(id),
 createElement:tag=>new FakeEl(tag),
 querySelector:q=>q==='main'?el('main'):null,
 querySelectorAll:q=>{
  if(q.startsWith('#tabContent'))return [tableButton,rankButton];
  if(q.startsWith('#playerDialog'))return [pathRow];
  return [];
 },
 addEventListener(){ }
};
const ctx={document:doc,console,queueMicrotask,MutationObserver:class {constructor(fn){this.fn=fn}observe(){}},Event,encodeURIComponent};
vm.runInNewContext(src,ctx,{timeout:5000});
await new Promise(resolve=>setTimeout(resolve,10));
assert.equal(tableButton.dataset.logoEnhanced,'true','Transfer table school buttons get badges');
assert.equal(tableButton.children[0]?.className,'team-mark team-mark--sm','Standard inline logo');
assert.match(tableButton.children[0].children[0].src,/\/38\.png$/);
assert.equal(rankName.children[0]?.className,'team-mark team-mark--xs','Leaderboard logo');
assert.match(rankName.children[0].children[0].src,/\/333\.png$/);
assert.equal(pathRow.dataset.schoolLogo,'true','Player career timeline receives logo');
assert(pathRow.children.some(c=>c.className.includes('team-mark')),'History row includes a team logo');
trigger.listeners.click();
assert.equal(panel.hidden,false,'Picker opens');
assert(list.children.length===3,'All-schools and two ESPN teams shown');
assert(list.children[1].children.some(c=>c.className?.includes('team-mark')),'Picker options include logos');
input.value='Colorado';
input.listeners.input();
assert.equal(list.children.length,1,'Picker search narrows options');
const row=list.children[0];
list.listeners.click({target:{closest:()=>row}});
assert.equal(select.value,'38','Picker updates the real native school select');
assert.equal(panel.hidden,true,'Picker closes after choosing school');
assert.equal(el('teamPickerText').textContent,'Colorado Buffaloes','Selected team label updates');
assert(el('schoolSpotlight').children.some(c=>c.className?.includes('team-mark')),'School spotlight shows logo');
assert(el('chartSchoolMark').children.some(c=>c.className?.includes('team-mark')),'Selected school chart shows logo');
const image=tableButton.children[0].children[0];
image.listeners.error();
assert.equal(tableButton.children[0].classList.contains('missing'),true,'Broken ESPN logo uses initials fallback');
console.log('PASS ESPN school logos in all-school picker, transfer tables, rankings, player history, selected-school chart and fallback');
