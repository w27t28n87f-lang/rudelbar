/* Lerntransfer: locally stored reflection, no grading and no XP manipulation. */
(function(){'use strict';
const original=window.openLesson;
if(typeof original!=='function')return;
window.openLesson=function(mid,lid){original(mid,lid);const box=document.querySelector('#content .lesson');if(!box)return;
const m=modules.find(x=>x.id===mid),l=m?.lessons.find(x=>x.id===lid);if(!l)return;
const section=document.createElement('section');section.className='card';
const title=document.createElement('h3');title.textContent='Lerntransfer: '+l.title;
const prompt=document.createElement('p');prompt.textContent='Beschreibe eine Entscheidung aus deinem Betrieb, bei der dieses Thema relevant ist. Notiere deine Annahmen, zwei mögliche Handlungsoptionen, Risiken und eine messbare Kennzahl zur späteren Kontrolle.';
const area=document.createElement('textarea');area.rows=5;area.style.cssText='width:100%;box-sizing:border-box;max-width:100%;resize:vertical';area.placeholder='Deine begründete Analyse (nicht automatisch bewertet)';
const key='rb-reflection-v171:'+((typeof user!=='undefined'&&user?.id)||'guest')+':'+lid;
try{area.value=localStorage.getItem(key)||''}catch(e){}
const status=document.createElement('p');status.className='muted';status.textContent='Nur auf diesem Gerät gespeichert. Kein Prüfungsnachweis.';
const save=document.createElement('button');save.className='btn secondary';save.textContent='Notiz lokal speichern';save.onclick=function(){try{localStorage.setItem(key,area.value);status.textContent='Lokal gespeichert.'}catch(e){status.textContent='Speichern nicht möglich.'}};
section.append(title,prompt,area,save,status);box.append(section);
};
})();
