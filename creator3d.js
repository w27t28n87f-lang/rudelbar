import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';

const $ = (id) => document.getElementById(id);
const viewport = $('creator3DViewport');
if (!viewport) throw new Error('Creator-3D-Viewport fehlt.');

const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, preserveDrawingBuffer:true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 100);
camera.position.set(0, 0.05, 4.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = .08;
controls.enablePan = false;
controls.minDistance = 2.7;
controls.maxDistance = 7.2;
controls.target.set(0, 0, 0);
controls.rotateSpeed = .72;
controls.zoomSpeed = .8;
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_ROTATE;

scene.add(new THREE.HemisphereLight(0xffffff, 0x303030, 2.25));
const key = new THREE.DirectionalLight(0xffffff, 3.6); key.position.set(3.5,5,5); key.castShadow=true; scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 1.8); fill.position.set(-4,2.2,3); scene.add(fill);
const rim = new THREE.DirectionalLight(0xffffff, 1.45); rim.position.set(0,3,-5); scene.add(rim);

const floor = new THREE.Mesh(new THREE.CircleGeometry(2.2,64), new THREE.ShadowMaterial({color:0x000000, opacity:.16}));
floor.rotation.x = -Math.PI/2; floor.position.y=-1.04; floor.receiveShadow=true; scene.add(floor);

let root = null;
let printableMesh = null;
let decal = null;
let designTexture = null;
let customModelURL = null;
let loadGeneration = 0;
const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

function currentColor(){
  const active = document.querySelector('[data-cfarbe].aktiv');
  return active?.dataset.cfarbe || '#111111';
}
function rangeNumber(id, fallback){ const el=$(id); return el ? Number(el.value) : fallback; }
function activeBg(){ return document.querySelector('#creatorHintergruende [data-bg].aktiv')?.dataset.bg || 'light'; }

function updateBackground(){
  const bg = activeBg();
  viewport.classList.toggle('creator-bg-dark',bg==='dark');
  viewport.classList.toggle('creator-bg-light',bg==='light');
  viewport.classList.toggle('creator-bg-transparent',bg==='transparent');
  scene.background = null;
}

function disposeObject(obj){
  obj?.traverse?.(o=>{
    o.geometry?.dispose?.();
    if(o.material){
      const mats=Array.isArray(o.material)?o.material:[o.material];
      mats.forEach(m=>{m.map?.dispose?.();m.normalMap?.dispose?.();m.roughnessMap?.dispose?.();m.dispose?.();});
    }
  });
}

function clearModel(){
  if(root){scene.remove(root); disposeObject(root); root=null; printableMesh=null;}
  removeDecal();
}
function removeDecal(){
  if(decal){scene.remove(decal); decal.geometry.dispose(); decal.material.map?.dispose?.(); decal.material.dispose(); decal=null;}
}

function choosePrintable(gltfScene){
  let named=null, best=null, bestScore=-Infinity;
  gltfScene.traverse(o=>{
    if(!o.isMesh) return;
    if(/torso|body|shirt|front/i.test(o.name) && !named) named=o;
    o.geometry.computeBoundingBox();
    const b=o.geometry.boundingBox;
    const s=new THREE.Vector3(); b.getSize(s);
    const score=s.x*s.y;
    if(score>bestScore){bestScore=score;best=o;}
  });
  return named||best;
}

function prepareModel(gltfScene){
  clearModel();
  root=gltfScene;
  root.traverse(o=>{
    if(!o.isMesh) return;
    o.castShadow=true; o.receiveShadow=true;
    const source=Array.isArray(o.material)?o.material[0]:o.material;
    const mat=new THREE.MeshStandardMaterial({
      color:new THREE.Color(currentColor()),
      roughness:.9,
      metalness:0,
      side:THREE.DoubleSide,
      map:source?.map||null,
      normalMap:source?.normalMap||null
    });
    if(mat.map) mat.map.colorSpace=THREE.SRGBColorSpace;
    o.material=mat;
  });
  const box=new THREE.Box3().setFromObject(root);
  const size=new THREE.Vector3(), center=new THREE.Vector3(); box.getSize(size); box.getCenter(center);
  root.position.sub(center);
  const targetHeight=2.45;
  const scale=targetHeight/Math.max(.001,size.y);
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  printableMesh=choosePrintable(root);
  camera.position.set(0,.03,4.7); controls.target.set(0,0,0); controls.update();
  applyColor();
  rebuildDecal();
  $('creator3DBadge')?.classList.add('bereit');
  if($('creator360Out')) $('creator360Out').textContent='3D';
  if($('creator360Hinweis')) $('creator360Hinweis').textContent='Echtes GLB-Modell · frei mit dem Finger drehen';
  if($('creator360Status')) $('creator360Status').textContent='3D aktiv: drehen, zoomen und das Druckmotiv auf dem Modell platzieren.';
}

function loadModel(url){
  const gen=++loadGeneration;
  if($('creator360Status')) $('creator360Status').textContent='3D-Modell wird geladen …';
  loader.load(url, gltf=>{if(gen!==loadGeneration)return;prepareModel(gltf.scene);}, undefined, err=>{
    console.error('3D-Modell konnte nicht geladen werden',err);
    if($('creator360Status')) $('creator360Status').textContent='3D-Modell konnte nicht geladen werden. Prüfe hoodie.glb im GitHub-Root.';
  });
}

function loadDefault(){
  if(customModelURL){URL.revokeObjectURL(customModelURL);customModelURL=null;}
  loadModel(`hoodie.glb?v=97`);
}

function applyColor(){
  if(!root)return;
  const c=new THREE.Color(currentColor());
  root.traverse(o=>{if(o.isMesh && o.material?.color){o.material.color.copy(c);o.material.needsUpdate=true;}});
}

function makeDesignTexture(file){
  if(!file)return;
  const url=URL.createObjectURL(file);
  textureLoader.load(url, tex=>{
    URL.revokeObjectURL(url);
    designTexture?.dispose?.();
    designTexture=tex;
    designTexture.colorSpace=THREE.SRGBColorSpace;
    designTexture.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
    designTexture.wrapS=designTexture.wrapT=THREE.ClampToEdgeWrapping;
    rebuildDecal();
  },undefined,()=>URL.revokeObjectURL(url));
}

function rebuildDecal(){
  removeDecal();
  if(!printableMesh || !designTexture) return;
  printableMesh.updateWorldMatrix(true,false);
  const bbox=new THREE.Box3().setFromObject(printableMesh);
  const center=new THREE.Vector3(); bbox.getCenter(center);
  const sizeBox=new THREE.Vector3(); bbox.getSize(sizeBox);
  const x = rangeNumber('creatorX',0)/260 * sizeBox.x*.34;
  const y = -rangeNumber('creatorY',0)/260 * sizeBox.y*.34;
  const scale = rangeNumber('creatorScale',100)/100;
  const rot = THREE.MathUtils.degToRad(rangeNumber('creatorRot',0));
  const pos=new THREE.Vector3(center.x+x, center.y+y, bbox.max.z + .012);
  const orient=new THREE.Euler(0,0,rot);
  const sx=Math.max(.08,sizeBox.x*.44*scale);
  const sy=Math.max(.08,sx);
  const sz=Math.max(.18,sizeBox.z*2.5+.25);
  let geometry;
  try{ geometry=new DecalGeometry(printableMesh,pos,orient,new THREE.Vector3(sx,sy,sz)); }
  catch(e){ console.warn('Decal konnte nicht erzeugt werden',e); return; }
  const mat=new THREE.MeshStandardMaterial({map:designTexture,transparent:true,depthTest:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,roughness:.82,metalness:0,side:THREE.DoubleSide});
  decal=new THREE.Mesh(geometry,mat); decal.renderOrder=10; scene.add(decal);
}

function resize(){
  const w=Math.max(1,viewport.clientWidth), h=Math.max(1,viewport.clientHeight);
  renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport); resize();

function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera);} animate();

// UI-Verknüpfungen. Capture wird nur für 3D-Export benutzt, damit der alte 2D-Fallback nicht dazwischenfunkt.
$('creatorDatei')?.addEventListener('change',e=>makeDesignTexture(e.target.files?.[0]));
$('creatorModelFile')?.addEventListener('change',e=>{
  const file=e.target.files?.[0]; if(!file)return;
  if(customModelURL)URL.revokeObjectURL(customModelURL);
  customModelURL=URL.createObjectURL(file); loadModel(customModelURL);
});
$('creatorModelReset')?.addEventListener('click',loadDefault);
['creatorScale','creatorX','creatorY','creatorRot'].forEach(id=>$(id)?.addEventListener('input',rebuildDecal));

document.addEventListener('click',e=>{
  if(e.target.closest('[data-cfarbe]')) requestAnimationFrame(()=>{applyColor();rebuildDecal();});
  if(e.target.closest('#creatorHintergruende [data-bg]')) requestAnimationFrame(updateBackground);
  if(e.target.closest('[data-cprod]')){
    const id=e.target.closest('[data-cprod]').dataset.cprod;
    if(id==='hoodie') loadDefault();
    else if($('creator360Status')) $('creator360Status').textContent='Für dieses Produkt ist noch kein GLB-Modell hinterlegt. Hoodie ist bereits echtes 3D.';
  }
});

function export3D(){
  renderer.render(scene,camera);
  const a=document.createElement('a');
  a.download=`Rudelbar-3D-${Date.now()}.png`;
  a.href=renderer.domElement.toDataURL('image/png'); a.click();
}
$('creatorDownload')?.addEventListener('click',e=>{e.preventDefault();e.stopImmediatePropagation();export3D();},{capture:true});
$('creatorTeilen')?.addEventListener('click',async e=>{
  e.preventDefault();e.stopImmediatePropagation();
  renderer.render(scene,camera);
  const blob=await new Promise(r=>renderer.domElement.toBlob(r,'image/png'));
  const file=new File([blob],`Rudelbar-3D-${Date.now()}.png`,{type:'image/png'});
  if(navigator.share && navigator.canShare?.({files:[file]})) await navigator.share({title:'Rudelbar Mode Creator 3D',files:[file]});
  else export3D();
},{capture:true});

const obs=new MutationObserver(()=>{
  const visible=!$('creatorAnsicht')?.classList.contains('versteckt');
  if(visible){resize();updateBackground();}
});
obs.observe($('creatorAnsicht'),{attributes:true,attributeFilter:['class']});

updateBackground();
loadDefault();
