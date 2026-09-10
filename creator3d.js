import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const $ = id => document.getElementById(id);
const viewport = $('creator3DViewport');
if (!viewport) throw new Error('Creator-3D-Viewport fehlt.');

const STATE_KEY = 'rudelbar_creator3d_v99';
const DRAFT_KEY = 'rudelbar_creator3d_entwuerfe_v99';
const state = Object.assign({ color:'#111111', scale:1, x:0, y:0, rot:0, flipX:1, flipY:1, bg:'light' }, safeJSON(localStorage.getItem(STATE_KEY), {}));

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, preserveDrawingBuffer:true, powerPreference:'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.replaceChildren(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .075;
controls.enablePan = false;
controls.enableZoom = true;
controls.minPolarAngle = Math.PI * .18;
controls.maxPolarAngle = Math.PI * .82;
controls.rotateSpeed = .62;
controls.zoomSpeed = .85;
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

scene.add(new THREE.HemisphereLight(0xffffff, 0x232323, 2.1));
const key = new THREE.DirectionalLight(0xffffff, 4.8); key.position.set(4.5,6.5,5.8); key.castShadow=true; scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 2.1); fill.position.set(-4.5,2.2,4.2); scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 2.8); rim.position.set(0,4,-6); scene.add(rim);
const soft = new THREE.DirectionalLight(0xfff4df, 1.1); soft.position.set(0,-1,4); scene.add(soft);

const floorMat = new THREE.ShadowMaterial({color:0x000000,opacity:.20});
const floor = new THREE.Mesh(new THREE.CircleGeometry(2.5,96),floorMat); floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; scene.add(floor);

let root = null;
let printableMesh = null;
let designTexture = null;
let decal = null;
let customModelURL = null;
let sourceIsExternal = false;
const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

function safeJSON(v,f){ try{return v?JSON.parse(v):f}catch{return f} }
function status(text,ok=false){ const el=$('creator360Status'); if(el){el.textContent=text;el.classList.toggle('bereit',ok)} }
function persist(){ localStorage.setItem(STATE_KEY,JSON.stringify(state)); }
function currentColor(){ return document.querySelector('[data-cfarbe].aktiv')?.dataset.cfarbe || state.color || '#111111'; }
function val(id,f=0){ const el=$(id); return el?Number(el.value):f; }
function updateOutputs(){
  if($('creatorScaleOut')) $('creatorScaleOut').textContent=`${Math.round(val('creatorScale',100))} %`;
  if($('creatorXOut')) $('creatorXOut').textContent=String(val('creatorX',0));
  if($('creatorYOut')) $('creatorYOut').textContent=String(val('creatorY',0));
  if($('creatorRotOut')) $('creatorRotOut').textContent=`${Math.round(val('creatorRot',0))}°`;
}
function updateBackground(){
  const chosen=document.querySelector('#creatorHintergruende [data-bg].aktiv')?.dataset.bg || state.bg || 'light';
  state.bg=chosen; persist();
  viewport.classList.toggle('creator-bg-dark',chosen==='dark');
  viewport.classList.toggle('creator-bg-light',chosen==='light');
  viewport.classList.toggle('creator-bg-transparent',chosen==='transparent');
  floorMat.opacity=chosen==='dark'?.32:.18;
}
function fabricMaterial(mult=1){
  const c=new THREE.Color(currentColor()).multiplyScalar(mult);
  return new THREE.MeshPhysicalMaterial({color:c,roughness:.91,metalness:0,clearcoat:.04,clearcoatRoughness:.92,sheen:1,sheenRoughness:.8,sheenColor:new THREE.Color(c).multiplyScalar(1.08)});
}
function disposeMaterial(m){ if(!m)return; [m.map,m.normalMap,m.roughnessMap,m.metalnessMap,m.aoMap,m.alphaMap].forEach(t=>t?.dispose?.()); m.dispose?.(); }
function clearModel(){
  removeDecal();
  if(root){scene.remove(root);root.traverse(o=>{if(o.isMesh){o.geometry?.dispose?.(); if(Array.isArray(o.material))o.material.forEach(disposeMaterial);else disposeMaterial(o.material)}})}
  root=null;printableMesh=null;
}
function removeDecal(){ if(!decal)return; decal.parent?.remove(decal); decal.geometry?.dispose?.(); disposeMaterial(decal.material); decal=null; }

function makeStudioHoodie(){
  const g=new THREE.Group(); g.name='RudelbarStudioHoodie';
  const torsoGeo=new RoundedBoxGeometry(1.48,1.82,.42,10,.16);
  const torso=new THREE.Mesh(torsoGeo,fabricMaterial()); torso.name='Torso_Print'; torso.scale.set(1,.98,1); g.add(torso);
  // slight taper illusion
  torso.geometry.translate(0,-.03,0);
  const shoulderGeo=new THREE.SphereGeometry(.34,48,32);
  for(const sx of [-1,1]){
    const sh=new THREE.Mesh(shoulderGeo.clone(),fabricMaterial(.99)); sh.scale.set(1.25,.75,.78); sh.position.set(sx*.78,.62,-.01); g.add(sh);
    const upper=new THREE.Mesh(new THREE.CapsuleGeometry(.205,.66,12,32),fabricMaterial(.985)); upper.position.set(sx*.93,.20,0); upper.rotation.z=sx*.18; g.add(upper);
    const lower=new THREE.Mesh(new THREE.CapsuleGeometry(.19,.58,12,32),fabricMaterial(.98)); lower.position.set(sx*1.05,-.43,.015); lower.rotation.z=sx*.08; g.add(lower);
    const cuff=new THREE.Mesh(new THREE.CylinderGeometry(.20,.18,.16,40),fabricMaterial(.78)); cuff.position.set(sx*1.08,-.82,.02); g.add(cuff);
  }
  // hood outer shell using torus + back volume
  const hoodBack=new THREE.Mesh(new THREE.SphereGeometry(.56,56,40,0,Math.PI*2,0,Math.PI*.72),fabricMaterial(.95)); hoodBack.scale.set(.92,1.05,.72); hoodBack.position.set(0,.96,-.16); hoodBack.rotation.x=.13; g.add(hoodBack);
  const hoodOpening=new THREE.Mesh(new THREE.TorusGeometry(.38,.075,24,72,Math.PI*1.88),fabricMaterial(.72)); hoodOpening.position.set(0,.83,.20); hoodOpening.rotation.z=.10; g.add(hoodOpening);
  // pocket with beveled-like shape
  const pocket=new THREE.Mesh(new RoundedBoxGeometry(.86,.34,.075,8,.07),fabricMaterial(.80)); pocket.position.set(0,-.48,.245); g.add(pocket);
  const band=new THREE.Mesh(new RoundedBoxGeometry(1.5,.16,.44,6,.055),fabricMaterial(.72)); band.position.set(0,-.91,0); g.add(band);
  // drawstrings
  for(const sx of [-1,1]){const cord=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.48,16),new THREE.MeshStandardMaterial({color:0x151515,roughness:.8}));cord.position.set(sx*.16,.60,.25);g.add(cord)}
  return g;
}

function choosePrintable(model){
  let named=null,best=null,bestScore=-Infinity;
  model.traverse(o=>{ if(!o.isMesh)return; o.geometry.computeBoundingBox(); const s=new THREE.Vector3();o.geometry.boundingBox.getSize(s); const n=(o.name||'').toLowerCase(); if(!named&&/(torso|body|shirt|chest|front|print)/.test(n))named=o; const score=s.x*s.y-(s.z*.4);if(score>bestScore){bestScore=score;best=o} });
  return named||best;
}
function normalize(model,external=false){
  clearModel(); root=model; sourceIsExternal=external;
  let count=0;
  root.traverse(o=>{if(!o.isMesh)return;count++;if(!o.geometry.attributes.normal)o.geometry.computeVertexNormals();o.castShadow=true;o.receiveShadow=true;const src=Array.isArray(o.material)?o.material[0]:o.material;const m=new THREE.MeshPhysicalMaterial({color:new THREE.Color(currentColor()),roughness:src?.roughness??.88,metalness:0,map:src?.map||null,normalMap:src?.normalMap||null,aoMap:src?.aoMap||null,sheen:.6,sheenRoughness:.82});if(m.map)m.map.colorSpace=THREE.SRGBColorSpace;o.material=m});
  if(!count)throw new Error('3D-Datei enthält kein Mesh.');
  scene.add(root); root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(root),size=new THREE.Vector3(),center=new THREE.Vector3();box.getSize(size);box.getCenter(center); root.position.sub(center);
  const scale=2.55/Math.max(size.y,.001);root.scale.setScalar(scale);root.updateMatrixWorld(true);
  printableMesh=choosePrintable(root);
  const finalBox=new THREE.Box3().setFromObject(root),fs=new THREE.Vector3();finalBox.getSize(fs);floor.position.y=finalBox.min.y-.075;
  const dist=Math.max(3.65,fs.y/Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))*.60);camera.position.set(0,.05,dist);controls.target.set(0,0,0);controls.minDistance=dist*.62;controls.maxDistance=dist*2;controls.update();
  applyColor(); rebuildDecal();
  $('creator3DBadge')?.classList.add('bereit'); if($('creator360Out'))$('creator360Out').textContent='3D LIVE';
  status(external?'Eigenes GLB geladen. 360°-Ansicht und Druckwerkzeuge sind aktiv.':'3D-Studio aktiv. Hoodie drehen, zoomen und Druckmotiv platzieren.',true);
}
function loadDefault(){
  if(customModelURL){URL.revokeObjectURL(customModelURL);customModelURL=null}
  // v99 deliberately uses the smoother studio mesh instead of the old blocky demo GLB.
  normalize(makeStudioHoodie(),false);
}
function loadExternal(file){
  if(!file)return;if(customModelURL)URL.revokeObjectURL(customModelURL);customModelURL=URL.createObjectURL(file);status('3D-Modell wird geladen …');
  loader.load(customModelURL,g=>{try{normalize(g.scene,true)}catch(e){console.error(e);status('Dieses GLB konnte nicht verwendet werden. Studio-Hoodie bleibt aktiv.');loadDefault()}},undefined,e=>{console.error(e);status('GLB konnte nicht geladen werden.');loadDefault()});
}
function applyColor(){ if(!root)return;state.color=currentColor();persist(); const c=new THREE.Color(state.color);root.traverse(o=>{if(o.isMesh&&o!==decal&&o.material?.color){o.material.color.copy(c);o.material.needsUpdate=true}}); }
function readDesign(file){
  if(!file)return;if(file.type!=='image/png'){status('Bitte eine PNG-Datei mit transparentem Hintergrund verwenden.');return}
  const url=URL.createObjectURL(file);textureLoader.load(url,t=>{URL.revokeObjectURL(url);designTexture?.dispose?.();designTexture=t;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());rebuildDecal();status('PNG geladen. Motiv ist auf der Brust verankert.',true)},undefined,()=>{URL.revokeObjectURL(url);status('PNG konnte nicht geladen werden.')});
}
function rebuildDecal(){
  removeDecal(); if(!printableMesh||!designTexture)return;
  root.updateMatrixWorld(true); printableMesh.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(printableMesh),size=new THREE.Vector3(),center=new THREE.Vector3();box.getSize(size);box.getCenter(center);
  const scale=val('creatorScale',100)/100; const ox=val('creatorX',0)/260*size.x*.30; const oy=-val('creatorY',0)/260*size.y*.28; const rot=THREE.MathUtils.degToRad(val('creatorRot',0));
  state.scale=scale;state.x=val('creatorX',0);state.y=val('creatorY',0);state.rot=val('creatorRot',0);persist();updateOutputs();
  // project from camera-facing/front side. Deeper size lets geometry conform to chest curvature.
  const pos=new THREE.Vector3(center.x+ox,center.y+oy,box.max.z+.03);
  const orientation=new THREE.Euler(0,0,rot);
  const w=Math.max(.18,size.x*.42*scale),h=w;
  try{
    const geometry=new DecalGeometry(printableMesh,pos,orientation,new THREE.Vector3(w,h,.55));
    const material=new THREE.MeshPhysicalMaterial({map:designTexture,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-8,roughness:.82,metalness:0,side:THREE.DoubleSide});
    decal=new THREE.Mesh(geometry,material);decal.name='RudelbarPrint';decal.renderOrder=20;scene.add(decal);
    decal.scale.x=state.flipX;decal.scale.y=state.flipY;
  }catch(e){ console.warn('Decal fallback',e); }
}
function resize(){const w=Math.max(1,viewport.clientWidth),h=Math.max(1,viewport.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
new ResizeObserver(resize).observe(viewport);resize();
function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)}animate();

function resetDesign(){state.scale=1;state.x=0;state.y=0;state.rot=0;state.flipX=1;state.flipY=1;[['creatorScale',100],['creatorX',0],['creatorY',0],['creatorRot',0]].forEach(([id,v])=>{if($(id))$(id).value=v});updateOutputs();rebuildDecal();}
function exportBlob(){return new Promise(resolve=>{renderer.render(scene,camera);renderer.domElement.toBlob(resolve,'image/png',.96)})}
async function sharePreview(){const blob=await exportBlob();if(!blob)throw new Error('Vorschau konnte nicht erstellt werden.');const file=new File([blob],`Rudelbar-3D-${Date.now()}.png`,{type:'image/png'});if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:'Rudelbar Creator 3D',files:[file]});return}downloadPreview(blob)}
function downloadPreview(blob=null){const go=b=>{const url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download=`Rudelbar-3D-${Date.now()}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};if(blob)go(blob);else exportBlob().then(go)}
function saveDraft(){const drafts=safeJSON(localStorage.getItem(DRAFT_KEY),[]);drafts.unshift({id:crypto.randomUUID(),date:new Date().toISOString(),color:currentColor(),scale:val('creatorScale',100),x:val('creatorX',0),y:val('creatorY',0),rot:val('creatorRot',0)});localStorage.setItem(DRAFT_KEY,JSON.stringify(drafts.slice(0,20)));renderDrafts();status('Entwurf gespeichert.',true)}
function renderDrafts(){const el=$('creatorEntwuerfe');if(!el)return;const d=safeJSON(localStorage.getItem(DRAFT_KEY),[]);if(!d.length){el.innerHTML='<div class="creator-keine">Noch keine 3D-Entwürfe gespeichert.</div>';return}el.innerHTML=d.map(x=>`<button class="creator-draft-v99" data-draft="${x.id}" type="button"><strong>3D Hoodie</strong><small>${new Date(x.date).toLocaleString('de-DE')}</small></button>`).join('');el.querySelectorAll('[data-draft]').forEach(b=>b.onclick=()=>{const x=d.find(i=>i.id===b.dataset.draft);if(!x)return;[['creatorScale',x.scale],['creatorX',x.x],['creatorY',x.y],['creatorRot',x.rot]].forEach(([id,v])=>{if($(id))$(id).value=v});state.color=x.color||state.color;updateOutputs();rebuildDecal();status('Gespeicherte Einstellungen geladen.',true)})}

// Capture phase wins over the old 2D creator handlers still present in app.js.
function bindClick(id,fn){const el=$(id);if(!el)return;el.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();fn(e)},{capture:true})}
bindClick('creatorDateiBtn',()=> $('creatorDatei')?.click());
bindClick('creatorModelReset',loadDefault);
bindClick('creatorFlipX',()=>{state.flipX*=-1;persist();rebuildDecal()});
bindClick('creatorFlipY',()=>{state.flipY*=-1;persist();rebuildDecal()});
bindClick('creatorReset',resetDesign);
bindClick('creatorDownload',()=>downloadPreview());
bindClick('creatorTeilen',()=>sharePreview().catch(e=>{console.error(e);status('Teilen ist auf diesem Gerät gerade nicht möglich.')}));
bindClick('creatorSpeichern',saveDraft);
$('creatorDatei')?.addEventListener('change',e=>readDesign(e.target.files?.[0]));
$('creatorModelFile')?.addEventListener('change',e=>loadExternal(e.target.files?.[0]));
['creatorScale','creatorX','creatorY','creatorRot'].forEach(id=>$(id)?.addEventListener('input',rebuildDecal));

document.addEventListener('click',e=>{
  if(e.target.closest('[data-cfarbe]'))requestAnimationFrame(()=>{applyColor();rebuildDecal()});
  if(e.target.closest('#creatorHintergruende [data-bg]'))requestAnimationFrame(updateBackground);
  const p=e.target.closest('[data-cprod]'); if(p&&p.dataset.cprod!=='hoodie')status('Für echtes 3D braucht auch dieser Artikel ein eigenes GLB-Modell. Hoodie ist aktuell vollständig aktiv.');
});

const obs=new MutationObserver(()=>{if(!$('creatorAnsicht')?.classList.contains('versteckt')){resize();updateBackground();}});obs.observe($('creatorAnsicht'),{attributes:true,attributeFilter:['class']});
updateOutputs(); updateBackground(); renderDrafts(); loadDefault();
