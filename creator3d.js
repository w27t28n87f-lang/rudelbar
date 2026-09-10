import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = (id) => document.getElementById(id);
const viewport = $('creator3DViewport');
if (!viewport) throw new Error('Creator-3D-Viewport fehlt.');

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, preserveDrawingBuffer:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.replaceChildren(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, 1, 0.03, 100);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.enablePan = false;
controls.enableZoom = true;
controls.minDistance = 2.35;
controls.maxDistance = 7.5;
controls.rotateSpeed = 0.68;
controls.zoomSpeed = 0.9;
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;
controls.target.set(0,0,0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x292929, 2.7));
const key = new THREE.DirectionalLight(0xffffff, 4.4); key.position.set(3.6,5.5,5.5); key.castShadow=true; scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 2.4); fill.position.set(-4,2.2,4); scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 2.0); rim.position.set(0,3.0,-5.5); scene.add(rim);

const floorMat = new THREE.ShadowMaterial({ color:0x000000, opacity:.18 });
const floor = new THREE.Mesh(new THREE.CircleGeometry(2.5,80), floorMat);
floor.rotation.x=-Math.PI/2; floor.receiveShadow=true; floor.position.y=-1.32; scene.add(floor);

let root=null;
let printableMesh=null;
let printMesh=null;
let designTexture=null;
let customModelURL=null;
let loadGeneration=0;
const loader=new GLTFLoader();
const textureLoader=new THREE.TextureLoader();

function status(text, ok=false){
  if($('creator360Status')){
    $('creator360Status').textContent=text;
    $('creator360Status').classList.toggle('bereit',ok);
  }
}
function currentColor(){ return document.querySelector('[data-cfarbe].aktiv')?.dataset.cfarbe || '#111111'; }
function rangeNumber(id,fallback){ const el=$(id); return el ? Number(el.value) : fallback; }
function activeBg(){ return document.querySelector('#creatorHintergruende [data-bg].aktiv')?.dataset.bg || 'light'; }
function updateBackground(){
  const bg=activeBg();
  viewport.classList.toggle('creator-bg-dark',bg==='dark');
  viewport.classList.toggle('creator-bg-light',bg==='light');
  viewport.classList.toggle('creator-bg-transparent',bg==='transparent');
  floorMat.opacity=bg==='dark'?.30:.18;
}
function disposeMaterial(m){
  if(!m)return;
  [m.map,m.normalMap,m.roughnessMap,m.metalnessMap,m.aoMap,m.alphaMap].forEach(t=>t?.dispose?.());
  m.dispose?.();
}
function removePrint(){
  if(!printMesh)return;
  printMesh.parent?.remove(printMesh);
  printMesh.geometry?.dispose?.();
  disposeMaterial(printMesh.material);
  printMesh=null;
}
function clearModel(){
  removePrint();
  if(root){
    scene.remove(root);
    root.traverse(o=>{ if(o.isMesh){ o.geometry?.dispose?.(); if(Array.isArray(o.material)) o.material.forEach(disposeMaterial); else disposeMaterial(o.material); } });
  }
  root=null; printableMesh=null;
}
function choosePrintable(gltfScene){
  let named=null,best=null,bestScore=-Infinity;
  gltfScene.traverse(o=>{
    if(!o.isMesh)return;
    o.geometry.computeBoundingBox();
    const b=o.geometry.boundingBox, s=new THREE.Vector3(); b.getSize(s);
    const name=(o.name||'').toLowerCase();
    if(!named && /(torso|body|shirt|chest|front)/.test(name)) named=o;
    const score=s.x*s.y - s.z*.1;
    if(score>bestScore){bestScore=score;best=o;}
  });
  return named||best;
}
function makeFallbackHoodie(){
  const g=new THREE.Group(); g.name='FallbackHoodie';
  const fabric=()=>new THREE.MeshStandardMaterial({color:new THREE.Color(currentColor()),roughness:.96,metalness:0});
  const detail=()=>new THREE.MeshStandardMaterial({color:new THREE.Color(currentColor()).multiplyScalar(.75),roughness:1});
  const torso=new THREE.Mesh(new THREE.BoxGeometry(1.32,1.62,.46,8,10,4),fabric()); torso.name='Torso'; torso.position.y=.02; g.add(torso);
  const shoulderGeo=new THREE.SphereGeometry(.28,32,20);
  for(const sx of [-1,1]){const sh=new THREE.Mesh(shoulderGeo.clone(),fabric());sh.scale.set(1,.9,.82);sh.position.set(sx*.72,.57,0);g.add(sh);}
  const armGeo=new THREE.CapsuleGeometry(.19,1.02,10,24);
  for(const sx of [-1,1]){const a=new THREE.Mesh(armGeo.clone(),fabric());a.position.set(sx*1.0,-.10,0);a.rotation.z=sx*.16;g.add(a);}
  const hood=new THREE.Mesh(new THREE.TorusGeometry(.39,.13,18,48,Math.PI*1.75),fabric());hood.rotation.x=Math.PI/2;hood.rotation.z=.4;hood.position.set(0,.91,-.04);g.add(hood);
  const pocket=new THREE.Mesh(new THREE.BoxGeometry(.72,.30,.055),detail());pocket.position.set(0,-.42,.258);g.add(pocket);
  const band=new THREE.Mesh(new THREE.BoxGeometry(1.36,.14,.49),detail());band.position.set(0,-.82,0);g.add(band);
  return g;
}
function normalizeAndShow(model){
  clearModel();
  root=model;
  let meshCount=0;
  root.traverse(o=>{
    if(!o.isMesh)return;
    meshCount++;
    if(!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
    o.geometry.computeBoundingBox();
    o.castShadow=true; o.receiveShadow=true;
    const src=Array.isArray(o.material)?o.material[0]:o.material;
    const mat=new THREE.MeshStandardMaterial({
      color:new THREE.Color(currentColor()),
      roughness:src?.roughness ?? .9,
      metalness:0,
      side:THREE.FrontSide,
      map:src?.map || null,
      normalMap:src?.normalMap || null,
      aoMap:src?.aoMap || null
    });
    if(mat.map) mat.map.colorSpace=THREE.SRGBColorSpace;
    o.material=mat;
  });
  if(!meshCount) throw new Error('GLB enthält kein Mesh.');
  scene.add(root);
  root.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(root);
  const size=new THREE.Vector3(),center=new THREE.Vector3(); box.getSize(size);box.getCenter(center);
  root.position.sub(center);
  const targetH=2.38;
  const scale=targetH/Math.max(size.y,.001); root.scale.setScalar(scale); root.updateMatrixWorld(true);
  printableMesh=choosePrintable(root);
  const finalBox=new THREE.Box3().setFromObject(root), finalSize=new THREE.Vector3(); finalBox.getSize(finalSize);
  floor.position.y=finalBox.min.y-.07;
  const dist=Math.max(3.25,finalSize.y/Math.tan(THREE.MathUtils.degToRad(camera.fov*.5))*0.64);
  camera.position.set(0,.03,dist); controls.target.set(0,0,0); controls.minDistance=Math.max(2.1,dist*.58);controls.maxDistance=dist*2.2;controls.update();
  applyColor(); rebuildPrint();
  $('creator3DBadge')?.classList.add('bereit');
  if($('creator360Out')) $('creator360Out').textContent='360°';
  if($('creator360Hinweis')) $('creator360Hinweis').textContent='Mit einem Finger frei drehen · mit zwei Fingern zoomen';
  status('3D aktiv: Modell sichtbar. Druckmotiv liegt auf der Brust-Druckfläche und dreht sich mit dem Hoodie.',true);
}
function loadModel(url){
  const gen=++loadGeneration; status('3D-Modell wird geladen …');
  loader.load(url,gltf=>{ if(gen!==loadGeneration)return; try{normalizeAndShow(gltf.scene);}catch(e){console.error(e);normalizeAndShow(makeFallbackHoodie());status('GLB war fehlerhaft. Sicherheitsmodell geladen.',true);} },undefined,err=>{console.error('GLB laden:',err);normalizeAndShow(makeFallbackHoodie());status('hoodie.glb konnte nicht geladen werden. Sicherheitsmodell geladen.',true);});
}
function loadDefault(){ if(customModelURL){URL.revokeObjectURL(customModelURL);customModelURL=null;} loadModel(`hoodie.glb?v=98`); }
function applyColor(){
  if(!root)return;
  const c=new THREE.Color(currentColor());
  root.traverse(o=>{if(o.isMesh&&o!==printMesh&&o.material?.color){o.material.color.copy(c);o.material.needsUpdate=true;}});
}
function makeDesignTexture(file){
  if(!file)return;
  if(file.type!=='image/png'){status('Bitte eine PNG-Datei verwenden.');return;}
  const url=URL.createObjectURL(file);
  textureLoader.load(url,tex=>{URL.revokeObjectURL(url);designTexture?.dispose?.();designTexture=tex;designTexture.colorSpace=THREE.SRGBColorSpace;designTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());rebuildPrint();status('PNG geladen. Motiv kann jetzt verschoben, skaliert und gedreht werden.',true);},undefined,()=>{URL.revokeObjectURL(url);status('PNG konnte nicht geladen werden.');});
}
function rebuildPrint(){
  removePrint();
  if(!printableMesh||!designTexture)return;
  printableMesh.geometry.computeBoundingBox();
  const b=printableMesh.geometry.boundingBox; const s=new THREE.Vector3();b.getSize(s);const c=new THREE.Vector3();b.getCenter(c);
  const scale=rangeNumber('creatorScale',100)/100;
  const x=rangeNumber('creatorX',0)/260*s.x*.30;
  const y=-rangeNumber('creatorY',0)/260*s.y*.30;
  const rot=THREE.MathUtils.degToRad(rangeNumber('creatorRot',0));
  const w=Math.max(.12,s.x*.40*scale), h=w;
  const geo=new THREE.PlaneGeometry(w,h);
  const mat=new THREE.MeshStandardMaterial({map:designTexture,transparent:true,alphaTest:.02,depthWrite:false,roughness:.86,metalness:0,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-5});
  printMesh=new THREE.Mesh(geo,mat); printMesh.name='RudelbarPrint'; printMesh.renderOrder=20;
  printMesh.position.set(c.x+x,c.y+y,b.max.z+.012); printMesh.rotation.z=rot;
  printableMesh.add(printMesh);
}
function resize(){const w=Math.max(1,viewport.clientWidth),h=Math.max(1,viewport.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();}
new ResizeObserver(resize).observe(viewport); resize();
function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);}animate();

$('creatorDatei')?.addEventListener('change',e=>makeDesignTexture(e.target.files?.[0]));
$('creatorModelFile')?.addEventListener('change',e=>{const file=e.target.files?.[0];if(!file)return;if(customModelURL)URL.revokeObjectURL(customModelURL);customModelURL=URL.createObjectURL(file);loadModel(customModelURL);});
$('creatorModelReset')?.addEventListener('click',loadDefault);
['creatorScale','creatorX','creatorY','creatorRot'].forEach(id=>$(id)?.addEventListener('input',rebuildPrint));
document.addEventListener('click',e=>{
  if(e.target.closest('[data-cfarbe]'))requestAnimationFrame(()=>{applyColor();rebuildPrint();});
  if(e.target.closest('#creatorHintergruende [data-bg]'))requestAnimationFrame(updateBackground);
  const p=e.target.closest('[data-cprod]'); if(p){ if(p.dataset.cprod==='hoodie')loadDefault(); else status('Für dieses Produkt ist noch kein 3D-Modell hinterlegt. Der Hoodie ist bereits vollständig drehbar.'); }
});
function export3D(){renderer.render(scene,camera);const a=document.createElement('a');a.download=`Rudelbar-3D-${Date.now()}.png`;a.href=renderer.domElement.toDataURL('image/png');a.click();}
$('creatorDownload')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();export3D();},{capture:true});
$('creatorTeilen')?.addEventListener('click',async e=>{e.preventDefault();e.stopImmediatePropagation();renderer.render(scene,camera);const blob=await new Promise(r=>renderer.domElement.toBlob(r,'image/png'));const file=new File([blob],`Rudelbar-3D-${Date.now()}.png`,{type:'image/png'});if(navigator.share&&navigator.canShare?.({files:[file]}))await navigator.share({title:'Rudelbar Mode Creator 3D',files:[file]});else export3D();},{capture:true});
const obs=new MutationObserver(()=>{if(!$('creatorAnsicht')?.classList.contains('versteckt')){resize();updateBackground();}});obs.observe($('creatorAnsicht'),{attributes:true,attributeFilter:['class']});
updateBackground(); loadDefault();
