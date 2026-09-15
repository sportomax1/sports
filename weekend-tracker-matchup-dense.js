(()=>{'use strict';
function applyDenseMatchup(){
  const root=document.getElementById('matchupBoards');
  if(!root)return;
  root.querySelectorAll('.matchupOLRow').forEach(row=>{
    const cards=[...row.querySelectorAll('.matchupOLCard')];
    const hasRealSnap=cards.some(card=>/\b\d+\s+snaps\b/i.test(card.textContent||'')&&!/snap data pending/i.test(card.textContent||''));
    row.classList.toggle('has-snap-data',hasRealSnap);
    row.classList.toggle('no-snap-data',!hasRealSnap);
  });
}
function boot(){
  const root=document.getElementById('matchupBoards');
  if(!root)return;
  applyDenseMatchup();
  const observer=new MutationObserver(()=>applyDenseMatchup());
  observer.observe(root,{childList:true,subtree:true,characterData:true});
  document.getElementById('matchupReload')?.addEventListener('click',()=>setTimeout(applyDenseMatchup,250));
  document.getElementById('matchupGameSelect')?.addEventListener('change',()=>setTimeout(applyDenseMatchup,250));
  document.querySelectorAll('[data-matchup-mode]').forEach(btn=>btn.addEventListener('click',()=>setTimeout(applyDenseMatchup,250)));
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
