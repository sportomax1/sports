/* Companion logo enhancement for keyless live, small-school roster comparisons. */
(()=>{'use strict';
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id),picker=$('team');
if(!picker)return;
let scheduled=false,lastPicker='';
const logo=id=>/^\d+$/.test(String(id))?'https://a.espncdn.com/i/teamlogos/ncaa/500/'+encodeURIComponent(String(id))+'.png':'';
const initials=s=>String(s||'').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]||'').join('').toUpperCase()||'SC';
const options=()=>Array.from(picker.options);
function mark(id,name,size='xs'){
 const wrap=document.createElement('span');wrap.className='team-mark team-mark--'+size;
 wrap.setAttribute('aria-hidden','true');
 const img=document.createElement('img');img.src=logo(id);img.alt='';img.loading='lazy';img.decoding='async';
 img.addEventListener('error',()=>wrap.classList.add('missing'),{once:true});wrap.appendChild(img);
 const fallback=document.createElement('span');fallback.className='team-mark-fallback';fallback.textContent=initials(name);wrap.appendChild(fallback);
 return wrap;
}
function refreshPicker(){
 const op=options().find(x=>x.value===picker.value),signature=picker.value+'|'+(op?.textContent||'');
 if(signature===lastPicker)return;
 lastPicker=signature;
 const preview=$('liveSchoolPreview');
 if(!preview)return;
 preview.replaceChildren();
 if(op?.value)preview.appendChild(mark(op.value,op.textContent,'sm'));
}
function markCell(cell,team){
 if(cell.dataset.logoEnhanced)return;
 cell.dataset.logoEnhanced='true';
 cell.classList.add('team-logo-cell');
 cell.insertBefore(mark(team.value,team.textContent,'xs'),cell.firstChild);
}
function update(){
 scheduled=false;const opts=options().filter(o=>o.value);
 const byName=new Map(opts.map(o=>[o.textContent.trim(),o]));
 for(const td of document.querySelectorAll('#tabContent td:not([data-logo-enhanced])')){
  const value=td.textContent.trim(),team=byName.get(value);
  if(team&&!td.querySelector('button'))markCell(td,team);
 }
 for(const row of document.querySelectorAll('#rank .rankrow:not([data-logo-enhanced])')){
  const n=row.querySelector('.name'),team=byName.get(n?.textContent.trim()||'');
  if(team&&n){row.dataset.logoEnhanced='true';n.classList.add('team-logo-cell');n.insertBefore(mark(team.value,team.textContent,'xs'),n.firstChild);}
 }
 for(const row of document.querySelectorAll('#playerDialog .path-item:not([data-logo-enhanced])')){
  const value=row.textContent.split('·').slice(1).join('·').trim(),team=byName.get(value);
  row.dataset.logoEnhanced='true';
  if(team){row.classList.add('team-logo-cell');row.insertBefore(mark(team.value,team.textContent,'sm'),row.childNodes[1]||null);}
 }
 for(const chip of document.querySelectorAll('#teamChips .tag img:not([data-logo-enhanced])')){
  chip.dataset.logoEnhanced='true';
  chip.addEventListener('error',()=>{
   const fallback=document.createElement('span');fallback.className='team-chip-fallback';
   fallback.textContent=initials(chip.parentElement?.textContent);
   chip.replaceWith(fallback);
  },{once:true});
 }
 refreshPicker();
}
const schedule=()=>{if(scheduled)return;scheduled=true;queueMicrotask(update)};
picker.addEventListener('change',()=>{lastPicker='';refreshPicker()});
if(typeof MutationObserver!=='undefined')new MutationObserver(schedule).observe(document.querySelector('main')||document.body,{childList:true,subtree:true});
schedule();
})();
