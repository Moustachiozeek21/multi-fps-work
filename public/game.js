import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const socket=io();
const $=id=>document.getElementById(id);
let scene,camera,renderer,clock,playerId=null,roomCode='',mode='ffa',joined=false,started=false;
let yaw=0,pitch=0,velY=0,hp=100,alive=true,shooting=false,lastShot=0,weapon='RIFLE',move={};
const players=new Map(),remoteMeshes=new Map(),bullets=[],keys=new Set();
const weaponNames={RIFLE:'FULL AUTO',SHOTGUN:'SPREAD',ROCKET:'CHAOS'};
const mat=(color,roughness=1)=>new THREE.MeshStandardMaterial({color,roughness,flatShading:true});
const mats={ground:mat('#59604b'),wall:mat('#555e4d'),dark:mat('#303b32'),olive:mat('#72785a'),sand:mat('#9a9278'),metal:mat('#3c4540'),red:mat('#8b5146'),blue:mat('#526d75'),green:mat('#91a65d')};
function init3d(){
 scene=new THREE.Scene();scene.background=new THREE.Color('#8b958b');scene.fog=new THREE.Fog('#8b958b',28,85);
 camera=new THREE.PerspectiveCamera(76,innerWidth/innerHeight,.1,140);camera.position.set(0,1.65,5);
 renderer=new THREE.WebGLRenderer({antialias:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;$('game').appendChild(renderer.domElement);
 scene.add(new THREE.HemisphereLight('#dce1cb','#414a3a',2));
 const sun=new THREE.DirectionalLight('#fff1d1',2.5);sun.position.set(-15,28,12);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);scene.add(sun);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),mats.ground);ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
 const grid=new THREE.GridHelper(60,60,'#747c64','#69715d');grid.position.y=.015;grid.material.transparent=true;grid.material.opacity=.16;scene.add(grid);
 // Perimeter walls and modular low-poly cover create a readable tactical arena.
 addBox(0,1,-30,60,2,1,mats.wall);addBox(0,1,30,60,2,1,mats.wall);addBox(-30,1,0,1,2,60,mats.wall);addBox(30,1,0,1,2,60,mats.wall);
 for(let i=0;i<18;i++){
  const x=(Math.random()-.5)*44,z=(Math.random()-.5)*44;
  if(Math.abs(x)<5&&Math.abs(z)<5)continue;
  const w=1.5+Math.random()*3,h=.8+Math.random()*2.1,d=1.5+Math.random()*3;
  addBox(x,h/2,z,w,h,d,[mats.dark,mats.olive,mats.sand][i%3]);
  if(i%3===0){const crate=makeCrate();crate.position.set(x, h+0.4,z);scene.add(crate);}
 }
 // Concrete blocks around the central lane.
 for(let x=-12;x<=12;x+=8){addBox(x,.7,0,2.2,1.4,3,mats.dark);addBox(x,.55,8,3,1.1,1.4,mats.olive);addBox(x,.55,-8,3,1.1,1.4,mats.olive);}
 const hemi=new THREE.Mesh(new THREE.ConeGeometry(1.2,2.5,5),mats.olive);
 for(let i=0;i<10;i++){const tree=hemi.clone();tree.position.set((Math.random()-.5)*52,1.2,(Math.random()-.5)*52);if(Math.abs(tree.position.x)<10&&Math.abs(tree.position.z)<10)continue;scene.add(tree);}
 buildGun();clock=new THREE.Clock();window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});animate();
}
function addBox(x,y,z,w,h,d,material){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m}
function makeCrate(){const g=new THREE.Group();const a=new THREE.Mesh(new THREE.BoxGeometry(1.1,.8,1.1),mats.sand);a.castShadow=true;g.add(a);const band=new THREE.Mesh(new THREE.BoxGeometry(1.14,.1,1.14),mats.dark);band.position.y=.1;g.add(band);return g}
let gun;
function buildGun(){gun=new THREE.Group();const body=new THREE.Mesh(new THREE.BoxGeometry(.22,.18,.65),mats.dark);body.position.set(.34,-.28,-.58);gun.add(body);const barrel=new THREE.Mesh(new THREE.CylinderGeometry(.035,.045,.52,6),mats.metal);barrel.rotation.x=Math.PI/2;barrel.position.set(.34,-.25,-1.03);gun.add(barrel);const stock=new THREE.Mesh(new THREE.BoxGeometry(.16,.15,.3),mats.olive);stock.position.set(.34,-.29,-.2);gun.add(stock);camera.add(gun);scene.add(camera)}
function makeSoldier(team){const g=new THREE.Group();const color=team==='ALPHA'?'#778b69':'#7b8588';const body=new THREE.Mesh(new THREE.BoxGeometry(.65,.85,.36),mat(color));body.position.y=1.05;body.castShadow=true;g.add(body);const head=new THREE.Mesh(new THREE.IcosahedronGeometry(.25,0),mat('#b1a68b'));head.position.y=1.68;g.add(head);const helmet=new THREE.Mesh(new THREE.BoxGeometry(.5,.18,.48),mat('#4a5542'));helmet.position.y=1.86;g.add(helmet);for(const x of [-.2,.2]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.22,.65,.25),mat('#414b3c'));leg.position.set(x,.35,0);g.add(leg)}const pack=new THREE.Mesh(new THREE.BoxGeometry(.4,.52,.2),mat('#4a5542'));pack.position.set(0,1.13,.25);g.add(pack);g.userData.body=body;return g}
function setRemote(p){let g=remoteMeshes.get(p.id);if(!g){g=makeSoldier(p.team);scene.add(g);remoteMeshes.set(p.id,g)}g.position.set(p.x,0,p.z);g.rotation.y=p.yaw;g.visible=p.alive;g.userData.body.material.color.set(p.team==='ALPHA'?'#778b69':'#7b8588')}
function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.04);if(joined&&alive){updateMovement(dt);if(shooting&&document.pointerLockElement===renderer.domElement)fire()}renderer.render(scene,camera)}
function updateMovement(dt){
 const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));let dir=new THREE.Vector3();
 if(keys.has('KeyW'))dir.add(forward);if(keys.has('KeyS'))dir.sub(forward);if(keys.has('KeyD'))dir.add(right);if(keys.has('KeyA'))dir.sub(right);
 if(dir.lengthSq())dir.normalize();const speed=keys.has('ShiftLeft')?10:6.2;camera.position.addScaledVector(dir,speed*dt);
 camera.position.x=THREE.MathUtils.clamp(camera.position.x,-28,28);camera.position.z=THREE.MathUtils.clamp(camera.position.z,-28,28);
 if(keys.has('Space')&&camera.position.y<=1.66)velY=6.8;velY-=17*dt;camera.position.y+=velY*dt;if(camera.position.y<1.65){camera.position.y=1.65;velY=0}
 camera.rotation.order='YXZ';camera.rotation.y=yaw;camera.rotation.x=pitch;
 gun.position.x=Math.sin(performance.now()*.009)*.008*(dir.lengthSq()?1:0);socket.emit('move',{x:camera.position.x,y:camera.position.y,z:camera.position.z,yaw,pitch});
}
function fire(){const now=performance.now(),rate=weapon==='SHOTGUN'?500:weapon==='ROCKET'?850:145;if(now-lastShot<rate)return;lastShot=now;
 const dir=new THREE.Vector3(0,0,-1).applyEuler(new THREE.Euler(pitch,yaw,0,'YXZ')).normalize();socket.emit('shoot',{dir:{x:dir.x,y:dir.y,z:dir.z},weapon});
 gun.position.z=-.05;setTimeout(()=>gun.position.z=0,60);
 const end=camera.position.clone().addScaledVector(dir,36);const geo=new THREE.BufferGeometry().setFromPoints([camera.position.clone(),end]);const line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:weapon==='ROCKET'?'#ff9b55':'#dbe7a0',transparent:true,opacity:.75}));scene.add(line);setTimeout(()=>{scene.remove(line);geo.dispose()},70);
}
function enterGame(){joined=true;$('menu').classList.add('hidden');$('hud').classList.remove('hidden');$('roomLabel').textContent='LOBBY '+roomCode;$('startHint').style.display='block';camera.position.set(0,1.65,6);alive=true;hp=100;updateHp()}
function requestPointer(){if(joined)renderer.domElement.requestPointerLock()}
function updateHp(){ $('hp').textContent=hp;$('hpbar').style.width=hp+'%';$('hpbar').style.background=hp<30?'#e56b54':'#c3e36b'}
function connect(action,which){const name=$('name').value.trim()||'Operator';$('error').textContent='';socket.emit(action,{name,mode:which,code:$('joinCode').value},res=>{if(!res?.ok){$('error').textContent=res?.error||'Could not connect.';return}roomCode=res.code;mode=which||mode})}
$('createFfa').onclick=()=>connect('createRoom','ffa');$('createTdm').onclick=()=>connect('createRoom','tdm');$('join').onclick=()=>connect('joinRoom',mode);$('copyCode').onclick=async()=>{try{await navigator.clipboard.writeText(roomCode);$('copyCode').textContent='COPIED: '+roomCode}catch{$('copyCode').textContent='CODE: '+roomCode}};
socket.on('joined',data=>{playerId=data.id;roomCode=data.code;mode=data.mode;enterGame()});
socket.on('state',s=>{started=s.started;$('timer').textContent=Math.floor(s.remaining/60)+':'+String(s.remaining%60).padStart(2,'0');$('count').textContent=s.players.length+'/12';$('scores').innerHTML='';s.players.sort((a,b)=>b.kills-a.kills||b.score-a.score).forEach(p=>{const d=document.createElement('div');d.className='score'+(p.id===playerId?' me':'');d.innerHTML=`<span><span class="team">${p.team==='ALPHA'?'A':'B'}</span> ${escapeHtml(p.name)}${p.alive?'':' †'}</span><span>${p.kills}</span><span>${p.deaths}</span>`;$('scores').appendChild(d);if(p.id!==playerId)setRemote(p);else{hp=p.hp;alive=p.alive;updateHp()}});for(const [id,g] of remoteMeshes)if(!s.players.some(p=>p.id===id)){scene.remove(g);remoteMeshes.delete(id)}$('startHint').textContent=started?'CLICK TO LOCK AIM':'WAITING FOR OPERATORS';});
socket.on('playerMoved',p=>{const g=remoteMeshes.get(p.id);if(g){g.position.set(p.x,0,p.z);g.rotation.y=p.yaw}});
socket.on('respawn',p=>{if(p.id===playerId){camera.position.set(p.x,1.65,p.z);hp=100;alive=true;updateHp()}else{const g=remoteMeshes.get(p.id);if(g)g.visible=true}});
socket.on('shotFx',s=>{if(s.id===playerId)return;const a=new THREE.Vector3(s.origin.x,s.origin.y,s.origin.z),b=a.clone().add(new THREE.Vector3(s.dir.x,s.dir.y,s.dir.z).multiplyScalar(13));const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),new THREE.LineBasicMaterial({color:s.weapon==='ROCKET'?'#ff9457':'#d8e7a2',transparent:true,opacity:.6}));scene.add(line);setTimeout(()=>scene.remove(line),80)});
socket.on('frag',f=>{const d=document.createElement('div');d.textContent=`${f.killer}  ▸  ${f.victim}  /  ${f.weapon}`;$('feed').prepend(d);setTimeout(()=>d.remove(),4500)});
socket.on('matchEnd',()=>{const d=document.createElement('div');d.textContent='MATCH COMPLETE — CREATE A NEW LOBBY TO PLAY AGAIN';$('feed').prepend(d)});
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
document.addEventListener('keydown',e=>{keys.add(e.code);if(e.code==='Digit1'){weapon='RIFLE';$('weapon').textContent=weaponNames[weapon]}if(e.code==='Digit2'){weapon='SHOTGUN';$('weapon').textContent=weaponNames[weapon]}if(e.code==='Digit3'){weapon='ROCKET';$('weapon').textContent=weaponNames[weapon]}});
document.addEventListener('keyup',e=>keys.delete(e.code));document.addEventListener('mousemove',e=>{if(document.pointerLockElement!==renderer?.domElement)return;yaw-=e.movementX*.0022;pitch-=e.movementY*.0022;pitch=THREE.MathUtils.clamp(pitch,-1.45,1.45)});
document.addEventListener('pointerlockchange',()=>{$('startHint').style.display=document.pointerLockElement?'none':'block'});document.addEventListener('mousedown',e=>{if(e.button!==0)return;if(document.pointerLockElement!==renderer.domElement){requestPointer();return}shooting=true});document.addEventListener('mouseup',()=>shooting=false);
init3d();