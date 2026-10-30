/* College Movement Lab: ESPN school logos everywhere.
 * Progressive enhancement of the national dashboard; does not change roster metrics.
 * Keeps the native school <select> as the single source of truth.
 */
(function(){
'use strict';
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id);
const select=$('team'),trigger=$('teamPickerTrigger'),panel=$('teamPickerPanel');
if(!select||!trigger||!panel)return;
const search=$('teamPickerSearch'),list=$('teamPickerList'),text=$('teamPickerText');
const selectedMark=$('teamPickerMark'),count=$('teamPickerCount');
const spotlight=$('schoolSpotlight'),chartMark=$('chartSchoolMark');
let lastSelection='',currentOptions='',scheduled=false;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const imgUrl=id=>/^\d+$/.test(String(id))?'https://a.espncdn.com/i/teamlogos/ncaa/500/'+encodeURIComponent(id)+'.png':'';
const initials=name=>String(name||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'SC';
const teamOption=id=>Array.from(select.options).find(o=>o.value===String(id));
function makeMark(id,name,size='xs'){
 const span=document.createElement('span');
 span.className='team-mark team-mark--'+(size==='lg'?'lg':size==='sm'?'sm':'xs');
 span.setAttribute('aria-hidden','true');
 const url=imgUrl(id);
 if(url){
  const img=document.createElement('img');img.src=url;img.alt='';img.loading='lazy';img.decoding='async';
  img.addEventListener('error',()=>span.classList.add('missing'),{once:true});
  span.appendChild(img);
 }else span.classList.add('missing');
 const backup=document.createElement('span');backup.className='team-mark-fallback';backup.textContent=initials(name);
 span.appendChild(backup);
 return span;
}
function decorateTeam(button){
 if(!button||button.dataset.logoEnhanced==='true')return;
 const id=String(button.dataset.team||'');
 if(!/^\d+$/.test(id))return;
 const option=teamOption(id);
 const teamName=option?.textContent||button.textContent?.trim()||'School';
 const mark=makeMark(id,teamName,button.classList.contains('rankrow')?'xs':'sm');
 if(button.classList.contains('rankrow')){
  const name=button.querySelector('.name');
  if(!name)return;
  name.insertBefore(mark,name.firstChild);
 }else{
  button.classList.add('team-link');
  button.insertBefore(mark,button.firstChild);
 }
 button.dataset.logoEnhanced='true';
}
function decoratePaths(){
 for(const row of document.querySelectorAll('#playerDialog .path-item:not([data-school-logo])')){
  const txt=(row.textContent||'').split('·').slice(1).join('·').trim();
  const match=Array.from(select.options).find(o=>o.value&&o.textContent.trim()===txt);
  if(match){
   row.classList.add('path-school');
   const textNode=Array.from(row.childNodes).find(n=>n.nodeType===3);
   if(textNode){
    textNode.textContent=' · ';
    row.appendChild(makeMark(match.value,match.textContent,'sm'));
    const name=document.createElement('span');name.className='path-team-name';name.textContent=txt;row.appendChild(name);
   }else row.appendChild(makeMark(match.value,match.textContent,'sm'));
  }
  row.dataset.schoolLogo='true';
 }
}
function renderOptionList(){
 const query=(search.value||'').trim().toLowerCase();
 const all=Array.from(select.options),matches=all.filter(o=>
  (!o.value&&!query)||!!o.value&&(!query||o.textContent.toLowerCase().includes(query)||o.value.includes(query))
 );
 const max=75;const shown=matches.slice(0,max);
 list.replaceChildren();
 for(const opt of shown){
  const row=document.createElement('button');row.type='button';row.className='school-option';
  row.setAttribute('role','option');row.dataset.schoolOption=opt.value;
  row.setAttribute('aria-selected',String(opt.value===select.value));
  if(opt.value)row.appendChild(makeMark(opt.value,opt.textContent,'sm'));
  else{
   const icon=document.createElement('span');icon.className='picker-selected-mark';icon.textContent='◎';row.appendChild(icon);
  }
  const label=document.createElement('span');label.className='school-option-name';label.textContent=opt.textContent;
  row.appendChild(label);
  if(opt.value===select.value){
   const check=document.createElement('span');check.className='school-option-check';check.textContent='✓';check.setAttribute('aria-hidden','true');row.appendChild(check);
  }
  list.appendChild(row);
 }
 if(!matches.length){
  const empty=document.createElement('div');empty.className='empty';empty.textContent='No schools found';list.appendChild(empty);
 }
 count.textContent=matches.length+' matching options'+(matches.length>max?' · showing first '+max+'; search to narrow':'');
}
function hidePicker(){panel.hidden=true;trigger.setAttribute('aria-expanded','false')}
function showPicker(){
 panel.hidden=false;trigger.setAttribute('aria-expanded','true');
 search.value='';renderOptionList();search.focus();
}
function selectSchool(id){
 const value=String(id??'');
 if(!Array.from(select.options).some(o=>o.value===value))return;
 select.value=value;
 select.dispatchEvent(new Event('change',{bubbles:true}));
 hidePicker();refreshSelected(true);
 trigger.focus();
}
function refreshSelected(force=false){
 const option=teamOption(select.value)||select.options[0];
 const key=(option?.value||'')+'|'+(option?.textContent||'');
 if(!force&&lastSelection===key)return;
 lastSelection=key;
 const id=option?.value||'',name=option?.textContent||'All ESPN-listed schools';
 text.textContent=name;
 selectedMark.replaceChildren();
 if(id)selectedMark.appendChild(makeMark(id,name,'sm'));
 else selectedMark.textContent='◎';
 spotlight.replaceChildren();chartMark.replaceChildren();
 if(id){
  const label=document.createElement('div');label.className='school-spotlight-info';
  const title=document.createElement('div');title.className='school-spotlight-title';title.textContent=name;
  const caption=document.createElement('div');caption.className='school-spotlight-desc';caption.textContent='School-specific roster trends and incoming/outgoing athlete comparisons';
  label.append(title,caption);
  const clear=document.createElement('button');clear.className='action outline';clear.type='button';clear.textContent='All schools';clear.dataset.clearSchool='true';
  spotlight.append(makeMark(id,name,'lg'),label,clear);spotlight.hidden=false;
  chartMark.appendChild(makeMark(id,name,'sm'));chartMark.hidden=false;
 }else{spotlight.hidden=true;chartMark.hidden=true;}
 if(!panel.hidden)renderOptionList();
}
function update(){
 scheduled=false;
 // Existing data-team links cover transfer origin/destination, team rankings,
 // pipeline rows, departures, roster audit, and each chart-ranking row.
 for(const b of document.querySelectorAll('#tabContent [data-team]:not([data-logo-enhanced]), #rank [data-team]:not([data-logo-enhanced])'))decorateTeam(b);
 decoratePaths();
 const options=Array.from(select.options);
 const signature=options.length+'|'+(options[0]?.textContent||'')+'|'+(options[options.length-1]?.textContent||'');
 if(currentOptions!==signature){currentOptions=signature;if(!panel.hidden)renderOptionList();}
 refreshSelected();
}
function schedule(){
 if(scheduled)return;
 scheduled=true;
 queueMicrotask(update);
}
trigger.addEventListener('click',()=>panel.hidden?showPicker():hidePicker());
search.addEventListener('input',renderOptionList);
search.addEventListener('keydown',event=>{
 if(event.key==='Escape'){hidePicker();trigger.focus()}
 if(event.key==='Enter'){
  const first=list.querySelector('button[data-school-option]');
  if(first){event.preventDefault();selectSchool(first.dataset.schoolOption);}
 }
 if(event.key==='ArrowDown'){
  const first=list.querySelector('button[data-school-option]');
  if(first){event.preventDefault();first.focus();}
 }
});
list.addEventListener('click',event=>{
 const item=event.target.closest('[data-school-option]');
 if(item)selectSchool(item.dataset.schoolOption);
});
list.addEventListener('keydown',event=>{
 if(event.key==='Escape'){hidePicker();trigger.focus();}
 if(event.key==='Enter'||event.key===' '){
  const item=event.target.closest('[data-school-option]');
  if(item){event.preventDefault();selectSchool(item.dataset.schoolOption);}
 }
});
spotlight.addEventListener('click',event=>{if(event.target.closest('[data-clear-school]'))selectSchool('')});
document.addEventListener('pointerdown',event=>{
 if(!panel.hidden&&!event.target.closest('#schoolPicker'))hidePicker();
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!panel.hidden){hidePicker();trigger.focus();}});
select.addEventListener('change',()=>refreshSelected(true));
const main=document.querySelector('main')||document.body;
if(typeof MutationObserver!=='undefined'){
 const observer=new MutationObserver(schedule);
 observer.observe(main,{subtree:true,childList:true});
}
// No data API, no double-rendering of the dashboard itself, no shared mutable state.
schedule();
})();
