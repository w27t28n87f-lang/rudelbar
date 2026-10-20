(()=>{
  'use strict';
  const pane=document.getElementById('rbFinanzen');
  if(!pane)return;
  const buttons=[document.getElementById('finanzenStartBtn'),...document.querySelectorAll('[data-rudelbar-nav="finanzen"]')].filter(Boolean);
  function allowed(){return typeof window.rudelbarMenuCan==='function' && window.rudelbarMenuCan('finanzen');}
  function close(){pane.hidden=true;pane.style.display='none';document.body.style.overflow=''}
  function open(e){
    e?.preventDefault();e?.stopPropagation();
    if(!allowed()){console.warn('Finanzen: kein Inhaber-/Superuserzugriff oder Rolle noch nicht geladen');return}
    pane.hidden=false;pane.style.display='flex';document.body.style.overflow='hidden';
    const frame=document.getElementById('rbFinFrame');
    if(frame&&!frame.getAttribute('src'))frame.src='finanzmanager.html';
  }
  buttons.forEach(b=>b.addEventListener('click',open,true));
  document.getElementById('rbFinBack')?.addEventListener('click',close);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!pane.hidden)close()});
  function sync(){
    const ok=allowed();
    buttons.forEach(b=>{b.hidden=!ok;b.style.display=ok?'':'none';b.disabled=!ok});
    if(!ok&&!pane.hidden)close();
  }
  sync();setInterval(sync,1000);
})();
