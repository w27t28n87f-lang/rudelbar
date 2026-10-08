/* Akademie-Integration: bestehende Rudelbar-Authentifizierung, eigene RLS-Freigaben */
(()=>{
  const AREAS=['unternehmer','marketing','mobile-kneipe','security'];
  window.rudelbarAcademyAccess={};
  let rightsReady=false;
  window.rudelbarAcademyLoadAccess=async()=>{
    if(aktuelleRolle!=='superuser')return;
    const {data,error}=await sb.from('academy_access').select('user_id,area');
    if(error){rightsReady=false;console.warn('Akademie-Rechte nicht geladen:',error.message);return;}
    const next={};for(const r of data||[])(next[r.user_id]??=[]).push(r.area);
    window.rudelbarAcademyAccess=next;rightsReady=true;
  };
  window.rudelbarAcademySaveAccess=async(id,card)=>{
    const status=card.querySelector('[data-akademie-status]');
    if(aktuelleRolle!=='superuser')return;
    if(!rightsReady){alert('Akademie-Rechte nicht geladen. SQL-Einrichtung prüfen.');return;}
    const selected=[...card.querySelectorAll('[data-akademie-bereich]:checked')].map(x=>x.dataset.akademieBereich);
    if(status)status.textContent='Freigaben werden gespeichert…';
    const {error}=await sb.rpc('academy_set_access',{p_user_id:id,p_areas:selected});
    if(error){if(status)status.textContent='⚠ Nicht gespeichert: '+error.message;alert('Akademie-Freigaben konnten nicht gespeichert werden: '+error.message);return;}
    window.rudelbarAcademyAccess[id]=selected;
    if(status)status.textContent='✓ Freigaben gespeichert';
  };
  const frame=document.getElementById('akademieFrame');
  document.getElementById('akademieStartBtn')?.addEventListener('click',async()=>{
    if(!aktuellerUser)return;
    // Zugriffsprüfung am Server, bevor der Akademiebereich geöffnet wird.
    const {data:role}=await sb.rpc('get_rudelbar_role');
    const admin=aktuelleRolle==='superuser'&&role==='superuser';
    if(!admin){
      const {data,error}=await sb.from('academy_access').select('area').eq('user_id',aktuellerUser.id).limit(1);
      if(error){alert('Akademie nicht bereit: Berechtigungstabelle fehlt. Bitte SQL-Einrichtung ausführen.');return;}
      if(!data?.length){alert('Für dich sind noch keine Lernfelder freigegeben.');return;}
    }
    alleHauptansichtenVerstecken();
    document.getElementById('akademieAnsicht')?.classList.remove('versteckt');
    if(!frame.getAttribute('src'))frame.src='academy/index.html';
    window.scrollTo(0,0);
  });
  document.getElementById('akademieZurueck')?.addEventListener('click',()=>startseiteZeigen());
  window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===frame.contentWindow&&e.data?.type==='rudelbar-academy-close')startseiteZeigen()});
})();
