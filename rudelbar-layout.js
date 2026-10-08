/* v162: Seitenleiste nutzt ausschließlich die vorhandenen Rudelbar-Aktionen. */
(()=>{
  const start=document.getElementById('bereichStart');
  start?.querySelectorAll('[data-rudelbar-nav]').forEach(btn=>btn.addEventListener('click',()=>{
    const ziel=btn.dataset.rudelbarNav;
    if(ziel==='start')return;
    if(ziel==='akademie')document.getElementById('akademieStartBtn')?.click();
    else start.querySelector(`[data-bereich="${ziel}"]`)?.click();
  }));
})();
