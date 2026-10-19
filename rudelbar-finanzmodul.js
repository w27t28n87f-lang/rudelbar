(()=>{
  const pane=document.getElementById('rbFinanzen');
  if(!pane)return;
  const allowed=()=>{try{return (typeof istRudelbarBesitzer==='function'&&istRudelbarBesitzer())||(typeof aktuelleRolle!=='undefined'&&aktuelleRolle==='superuser');}catch(e){return false;}};
  const show=()=>{if(!allowed())return;pane.hidden=false;};
  document.getElementById('finanzenStartBtn')?.addEventListener('click',show);
  document.querySelector('[data-rudelbar-nav="finanzen"]')?.addEventListener('click',show);
  document.getElementById('rbFinBack')?.addEventListener('click',()=>{pane.hidden=true;});
  const sync=()=>{document.querySelectorAll('[data-rudelbar-nav="finanzen"],#finanzenStartBtn').forEach(el=>{el.hidden=!allowed();});if(!allowed())pane.hidden=true;};
  setInterval(sync,1000);sync();
})();
