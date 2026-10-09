const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: process.env.CORS_ORIGIN || false } });
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, game: 'TAC FPS' }));

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 12, MATCH_SECONDS = 600;
const rooms = new Map();
const safeName = v => String(v || 'Operator').replace(/[<>]/g, '').trim().slice(0, 18) || 'Operator';
const code = () => crypto.randomBytes(3).toString('hex').toUpperCase();
const clamp = (n,a,b) => Math.max(a, Math.min(b, Number(n) || 0));
const spawn = () => ({ x: (Math.random()-.5)*16, y: 1.65, z: (Math.random()-.5)*16 });

function publicRoom(room) {
  const now = Date.now();
  return {
    code: room.code, mode: room.mode, players: [...room.players.values()].map(p => ({
      id:p.id, name:p.name, team:p.team, kills:p.kills, deaths:p.deaths, score:p.score,
      x:p.x, y:p.y, z:p.z, yaw:p.yaw, pitch:p.pitch, hp:p.hp, alive:p.alive
    })),
    started: room.started, remaining: Math.max(0, room.started ? MATCH_SECONDS - Math.floor((now-room.startedAt)/1000) : MATCH_SECONDS)
  };
}
function emitRoom(room) { io.to(room.code).emit('state', publicRoom(room)); }
function makeRoom(mode) {
  let c; do { c=code(); } while(rooms.has(c));
  const room = { code:c, mode: mode === 'tdm' ? 'tdm' : 'ffa', players:new Map(), started:false, startedAt:0, timer:null };
  rooms.set(c, room); return room;
}
function startIfReady(room) {
  if (!room.started && room.players.size >= 2) {
    room.started = true; room.startedAt = Date.now();
    room.timer = setInterval(() => {
      if (!rooms.has(room.code)) return clearInterval(room.timer);
      if (Date.now()-room.startedAt >= MATCH_SECONDS*1000) {
        room.started = false; room.players.forEach(p => { p.alive=false; });
        io.to(room.code).emit('matchEnd', publicRoom(room));
        clearInterval(room.timer); room.timer=null;
      }
      emitRoom(room);
    }, 1000);
  }
}
function dropRoomIfEmpty(room) {
  if (room.players.size) return;
  if (room.timer) clearInterval(room.timer);
  rooms.delete(room.code);
}
io.on('connection', socket => {
  socket.on('createRoom', ({ name, mode } = {}, cb = () => {}) => {
    const room = makeRoom(mode);
    joinRoom(socket, room, name);
    cb({ ok:true, code:room.code });
  });
  socket.on('joinRoom', ({ name, code:rawCode } = {}, cb = () => {}) => {
    const room = rooms.get(String(rawCode || '').trim().toUpperCase());
    if (!room) return cb({ ok:false, error:'No lobby with that code.' });
    if (room.players.size >= MAX_PLAYERS) return cb({ ok:false, error:'Lobby is full (12 players max).' });
    joinRoom(socket, room, name); cb({ ok:true, code:room.code });
  });
  function joinRoom(sock, room, rawName) {
    const s=spawn();
    const p={ id:sock.id, name:safeName(rawName), team:room.players.size%2?'BRAVO':'ALPHA',
      kills:0,deaths:0,score:0,hp:100,alive:true,x:s.x,y:s.y,z:s.z,yaw:0,pitch:0,lastShot:0 };
    room.players.set(sock.id,p); sock.join(room.code); sock.data.room=room.code;
    sock.emit('joined',{ code:room.code, id:sock.id, mode:room.mode, maxPlayers:MAX_PLAYERS });
    startIfReady(room); emitRoom(room);
  }
  socket.on('move', data => {
    const room=rooms.get(socket.data.room), p=room?.players.get(socket.id);
    if (!p || !p.alive || !data) return;
    // Server clamps movement to a playable arena; clients cannot teleport arbitrarily.
    p.x=clamp(data.x,-28,28); p.z=clamp(data.z,-28,28);
    p.y=1.65; p.yaw=clamp(data.yaw,-Math.PI*100,Math.PI*100); p.pitch=clamp(data.pitch,-1.5,1.5);
    socket.to(room.code).emit('playerMoved',{id:p.id,x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch});
  });
  socket.on('shoot', data => {
    const room=rooms.get(socket.data.room), shooter=room?.players.get(socket.id);
    if (!room || !shooter || !shooter.alive || !room.started) return;
    const now=Date.now(); if(now-shooter.lastShot<140) return; shooter.lastShot=now;
    const origin={x:shooter.x,y:shooter.y,z:shooter.z};
    const dir=data?.dir || {};
    const dx=clamp(dir.x,-1,1), dy=clamp(dir.y,-1,1), dz=clamp(dir.z,-1,1);
    // Server-side ray-vs-player spheres. Range and direction are bounded; clients only send aim vector.
    let target=null, best=36;
    for(const p of room.players.values()) {
      if(p.id===shooter.id || !p.alive) continue;
      if(room.mode==='tdm' && p.team===shooter.team) continue;
      const vx=p.x-origin.x, vy=1.1-origin.y, vz=p.z-origin.z;
      const along=vx*dx+vy*dy+vz*dz;
      if(along<0 || along>36) continue;
      const px=vx-along*dx, py=vy-along*dy, pz=vz-along*dz;
      const miss=Math.sqrt(px*px+py*py+pz*pz);
      if(miss<0.95 && along<best) { best=along; target=p; }
    }
    io.to(room.code).emit('shotFx',{id:shooter.id,origin,dir:{x:dx,y:dy,z:dz},weapon:String(data?.weapon||'RIFLE').slice(0,12)});
    if(target) {
      target.hp-=data?.weapon==='ROCKET'?100:data?.weapon==='SHOTGUN'?55:34;
      if(target.hp<=0) {
        target.hp=0; target.alive=false; target.deaths++;
        shooter.kills++; shooter.score+=100;
        if(room.mode==='tdm') shooter.team==='ALPHA' ? room.alpha=(room.alpha||0)+1 : room.bravo=(room.bravo||0)+1;
        io.to(room.code).emit('frag',{killer:shooter.name,victim:target.name,weapon:String(data?.weapon||'RIFLE')});
        setTimeout(() => {
          const r=rooms.get(room.code), dead=r?.players.get(target.id);
          if(!dead) return;
          const s=spawn(); Object.assign(dead,{x:s.x,y:s.y,z:s.z,hp:100,alive:true});
          io.to(room.code).emit('respawn',{id:dead.id,x:dead.x,y:dead.y,z:dead.z,hp:100});
          emitRoom(r);
        }, 2500);
      }
      emitRoom(room);
    }
  });
  socket.on('disconnect', () => {
    const room=rooms.get(socket.data.room); if(!room) return;
    room.players.delete(socket.id); emitRoom(room); dropRoomIfEmpty(room);
  });
});

server.listen(PORT, '0.0.0.0', () => console.log(`TAC FPS listening on ${PORT}`));
