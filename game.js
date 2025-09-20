// =================== CONFIG ===================
const CONFIG = {
  CANVAS_W: 360,
  CANVAS_H: 480,
  PLAYER_SIZE: 20,
  PLAYER_SPEED: 4.5,
  BASE_OBSTACLE_SPEED: 2.0,
  SPAWN_INTERVAL: 1200, // ms
  STORAGE_KEYS: {
    NAME: 'od_player_name',
    LB: 'od_leaderboard'
  }
};

// =================== UTILS ===================
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max)); }
function clamp(v, min, max) { return Math.max(min, Math.min(v, max)); }
function rectOverlap(a, b) {
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}
function roundRect(ctx, x, y, w, h, r, fill, stroke, color) {
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
  ctx.fillStyle = color || '#fff';
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// =================== PLAYER ===================
class Player {
  constructor() {
    this.w = CONFIG.PLAYER_SIZE;
    this.h = CONFIG.PLAYER_SIZE;
    this.reset();
    this._bindKeyboard();
  }
  reset() {
    this.x = (CONFIG.CANVAS_W - this.w) / 2;
    this.y = CONFIG.CANVAS_H - this.h - 8;
    this.left = false;
    this.right = false;
    this.alive = true;
  }
  _bindKeyboard() {
    document.addEventListener('keydown', e => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.right = true;
      if (e.code === 'Space' && gameState === 'gameover') startGame();
    });
    document.addEventListener('keyup', e => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.right = false;
    });
  }
  update(dt) {
    const sp = CONFIG.PLAYER_SPEED * dt;
    if (this.left) this.x -= sp;
    if (this.right) this.x += sp;
    this.x = clamp(this.x, 0, CONFIG.CANVAS_W - this.w);
  }
  draw(ctx) {
    ctx.fillStyle = '#4cafef';
    ctx.fillRect(this.x, this.y, this.w, this.h);
  }
  getRect() { return {x: this.x, y: this.y, w: this.w, h: this.h}; }
}

// =================== OBSTACLES ===================

// Basic horizontal bar
class BasicBar {
  constructor(speedMult=1) {
    this.w = randInt(80, 200);
    this.h = 14;
    this.x = randInt(0, CONFIG.CANVAS_W - this.w);
    this.y = -this.h;
    this.speed = CONFIG.BASE_OBSTACLE_SPEED * speedMult;
  }
  update(dt) { this.y += this.speed * dt; }
  draw(ctx) { ctx.fillStyle = '#ff6666'; ctx.fillRect(this.x, this.y, this.w, this.h); }
  isOffscreen() { return this.y > CONFIG.CANVAS_H; }
  collides(p) { return rectOverlap(this, p.getRect()); }
}

// Wall with a gap
class Wall {
  constructor() {
    this.h = 16;
    this.y = -this.h;
    const gap = randInt(60, 100);
    const gapX = randInt(40, CONFIG.CANVAS_W - 40 - gap);
    this.parts = [
      {x:0,y:this.y,w:gapX,h:this.h},
      {x:gapX+gap,y:this.y,w:CONFIG.CANVAS_W-(gapX+gap),h:this.h}
    ];
    this.speed = CONFIG.BASE_OBSTACLE_SPEED;
  }
  update(dt){ this.y += this.speed * dt; for(let p of this.parts) p.y=this.y; }
  draw(ctx){ ctx.fillStyle='#ffcc00'; for(let p of this.parts) ctx.fillRect(p.x,p.y,p.w,p.h); }
  isOffscreen(){ return this.y > CONFIG.CANVAS_H; }
  collides(p){ return this.parts.some(b=>rectOverlap(b,p.getRect())); }
}

// Moving bar
class MovingBar {
  constructor() {
    this.w = randInt(110, 160);
    this.h = 14;
    this.x = randInt(0, CONFIG.CANVAS_W - this.w);
    this.y = -this.h;
    this.speed = CONFIG.BASE_OBSTACLE_SPEED;
    this.moveSpeed = rand(1.2, 2.2);
    this.dir = Math.random() < 0.5 ? -1 : 1;
  }
  update(dt){
    this.y += this.speed * dt;
    this.x += this.dir * this.moveSpeed * dt;
    if(this.x<=0){this.x=0; this.dir=1;}
    if(this.x+this.w>=CONFIG.CANVAS_W){this.x=CONFIG.CANVAS_W-this.w; this.dir=-1;}
  }
  draw(ctx){ ctx.fillStyle='#ff9b57'; ctx.fillRect(this.x,this.y,this.w,this.h); }
  isOffscreen(){ return this.y > CONFIG.CANVAS_H; }
  collides(p){ return rectOverlap(this,p.getRect()); }
}

// Block
class Block {
  constructor() {
    this.w = randInt(30,60);
    this.h = randInt(30,60);
    this.x = randInt(0, CONFIG.CANVAS_W - this.w);
    this.y = -this.h;
    this.speed = CONFIG.BASE_OBSTACLE_SPEED;
  }
  update(dt){ this.y += this.speed * dt; }
  draw(ctx){ ctx.fillStyle='#66bb6a'; ctx.fillRect(this.x,this.y,this.w,this.h); }
  isOffscreen(){ return this.y > CONFIG.CANVAS_H; }
  collides(p){ return rectOverlap(this,p.getRect()); }
}

// Spinner (rotating fan)
class Spinner {
  constructor() {
    this.r = 40;
    this.x = CONFIG.CANVAS_W/2;
    this.y = -this.r;
    this.angle = 0;
    this.speed = CONFIG.BASE_OBSTACLE_SPEED;
    this.rotSpeed = 0.05;
  }
  update(dt){ this.y += this.speed*dt; this.angle+=this.rotSpeed*dt; }
  draw(ctx){
    ctx.save();
    ctx.translate(this.x,this.y);
    ctx.rotate(this.angle);
    ctx.fillStyle='#bb66ff';
    for(let i=0;i<4;i++){
      ctx.rotate(Math.PI/2);
      ctx.fillRect(0,-8,this.r,16);
    }
    ctx.restore();
  }
  isOffscreen(){ return this.y > CONFIG.CANVAS_H+this.r; }
  collides(p){ return rectOverlap({x:this.x-this.r,y:this.y-8,w:this.r*2,h:16},p.getRect()); }
}

// Spike floor
class SpikeFloor {
  constructor() {
    this.h = 20;
    this.y = -this.h;
    this.speed = CONFIG.BASE_OBSTACLE_SPEED;
    this.spikes=[];
    for(let i=0;i<CONFIG.CANVAS_W;i+=20){
      this.spikes.push({x:i,y:this.y,w:20,h:this.h});
    }
  }
  update(dt){ this.y += this.speed*dt; for(let s of this.spikes) s.y=this.y; }
  draw(ctx){ ctx.fillStyle='#ff4444'; for(let s of this.spikes) ctx.fillRect(s.x,s.y,s.w,s.h); }
  isOffscreen(){ return this.y>CONFIG.CANVAS_H; }
  collides(p){ return this.spikes.some(s=>rectOverlap(s,p.getRect())); }
}

// Vertical bars
class VerticalBars {
  constructor(){
    this.h=CONFIG.CANVAS_H;
    this.w=20;
    this.y=-this.h;
    this.speed=CONFIG.BASE_OBSTACLE_SPEED;
    this.gap=randInt(60,100);
    const gapY=randInt(80,CONFIG.CANVAS_H-80-this.gap);
    this.parts=[
      {x:100,y:this.y,w:this.w,h:gapY},
      {x:100,y:this.y+gapY+this.gap,w:this.w,h:this.h-(gapY+this.gap)}
    ];
  }
  update(dt){ this.y+=this.speed*dt; for(let p of this.parts)p.y=this.y; }
  draw(ctx){ ctx.fillStyle='#ffaa00'; for(let p of this.parts)ctx.fillRect(p.x,p.y,p.w,p.h); }
  isOffscreen(){ return this.y>CONFIG.CANVAS_H; }
  collides(p){ return this.parts.some(b=>rectOverlap(b,p.getRect())); }
}

// Gap wall (small moving gap)
class GapWall {
  constructor(){
    this.h=16;
    this.y=-this.h;
    this.speed=CONFIG.BASE_OBSTACLE_SPEED;
    this.gap=randInt(50,80);
    this.gapX=randInt(20,CONFIG.CANVAS_W-20-this.gap);
    this.parts=[
      {x:0,y:this.y,w:this.gapX,h:this.h},
      {x:this.gapX+this.gap,y:this.y,w:CONFIG.CANVAS_W-(this.gapX+this.gap),h:this.h}
    ];
  }
  update(dt){ this.y+=this.speed*dt; for(let p of this.parts)p.y=this.y; }
  draw(ctx){ ctx.fillStyle='#33cc99'; for(let p of this.parts)ctx.fillRect(p.x,p.y,p.w,p.h); }
  isOffscreen(){ return this.y>CONFIG.CANVAS_H; }
  collides(p){ return this.parts.some(b=>rectOverlap(b,p.getRect())); }
}

// =================== OBSTACLE MANAGER ===================
class ObstacleManager {
  constructor(){ this.items=[]; this.lastSpawn=0; }
  spawn(timestamp,elapsed){
    if(timestamp-this.lastSpawn<CONFIG.SPAWN_INTERVAL) return;
    let obs;
    if(elapsed<20000) obs=new BasicBar();
    else if(elapsed<50000) obs=Math.random()<0.6?new BasicBar():new Wall();
    else if(elapsed<100000) {
      const r=Math.random();
      if(r<0.4) obs=new BasicBar();
      else if(r<0.6) obs=new Wall();
      else if(r<0.8) obs=new MovingBar();
      else obs=new Block();
    } else {
      const arr=[BasicBar,Wall,MovingBar,Block,Spinner,SpikeFloor,VerticalBars,GapWall];
      const Cls=arr[randInt(0,arr.length)];
      obs=new Cls();
    }
    this.items.push(obs);
    this.lastSpawn=timestamp;
  }
  update(dt){ this.items.forEach(o=>o.update(dt)); this.items=this.items.filter(o=>!o.isOffscreen()); }
  draw(ctx){ this.items.forEach(o=>o.draw(ctx)); }
  checkCollision(p){ return this.items.some(o=>o.collides(p)); }
}

// =================== LEADERBOARD ===================
function normalizeName(name){ return name.trim().replace(/\s+/g,' '); }
function loadLB(){ try{return JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.LB))||[]}catch(e){return[];} }
function saveLB(list){ localStorage.setItem(CONFIG.STORAGE_KEYS.LB,JSON.stringify(list)); }
function registerPlayer(name){
  const n=normalizeName(name);
  if(!n) return {ok:false,msg:"Tên không hợp lệ"};
  let list=loadLB();
  if(list.find(p=>normalizeName(p.name).toLowerCase()===n.toLowerCase())){
    return {ok:false,msg:"Tên đã tồn tại"};
  }
  list.push({name:n,highScore:0,completions:0});
  saveLB(list);
  localStorage.setItem(CONFIG.STORAGE_KEYS.NAME,n);
  return {ok:true};
}
function updateLB(score){
  const name=localStorage.getItem(CONFIG.STORAGE_KEYS.NAME);
  if(!name) return;
  let list=loadLB();
  let p=list.find(e=>e.name===name);
  if(!p) return;
  if(score>=500){
    p.completions++;
    p.highScore=0;
  } else {
    if(score>p.highScore) p.highScore=score;
  }
  saveLB(list);
}

// =================== GAME LOOP ===================
let canvas,ctx;
let player,manager;
let gameState='intro';
let lastFrame=0;
let elapsed=0;
let score=0;

function startGame(){
  player=new Player();
  manager=new ObstacleManager();
  elapsed=0;
  score=0;
  lastFrame=0;
  gameState='playing';
  requestAnimationFrame(tick);
}

function tick(timestamp){
  if(!lastFrame) lastFrame=timestamp;
  let dt=(timestamp-lastFrame)/16.67;
  dt=Math.min(Math.max(dt,0),1.5);
  elapsed+=timestamp-lastFrame;
  lastFrame=timestamp;

  if(gameState==='playing'){
    player.update(dt);
    manager.spawn(timestamp,elapsed);
    manager.update(dt);
    if(manager.checkCollision(player)){
      gameState='gameover';
      updateLB(Math.floor(elapsed/1000));
    }
    score=Math.floor(elapsed/1000);
  }

  draw();
  requestAnimationFrame(tick);
}

// =================== DRAW ===================
function draw(){
  ctx.fillStyle='#111';
  ctx.fillRect(0,0,CONFIG.CANVAS_W,CONFIG.CANVAS_H);

  if(gameState==='intro'){
    ctx.fillStyle='#fff';
    ctx.font='20px sans-serif';
    ctx.fillText('Nhấn SPACE để chơi',60,CONFIG.CANVAS_H/2);
    return;
  }
  if(gameState==='gameover'){
    ctx.fillStyle='#fff';
    ctx.font='20px sans-serif';
    ctx.fillText('Game Over!',100,CONFIG.CANVAS_H/2-20);
    ctx.fillText('Nhấn SPACE để chơi lại',40,CONFIG.CANVAS_H/2+20);
  }

  manager.draw(ctx);
  player.draw(ctx);

  ctx.fillStyle='#fff';
  ctx.font='14px sans-serif';
  ctx.fillText('Score: '+score,10,20);
}

// =================== INIT ===================
window.onload=()=>{
  canvas=document.getElementById('gameCanvas');
  ctx=canvas.getContext('2d');

  const input = document.getElementById('playerNameInput');
  const btn = document.getElementById('registerBtn');
  const msg = document.getElementById('registerMsg');
  const panel = document.getElementById('registerPanel');

  // Kiểm tra nếu đã có tên thì bỏ qua đăng ký
  const existing = localStorage.getItem(CONFIG.STORAGE_KEYS.NAME);
  if(existing){
    panel.style.display="none";
    draw();
  }

  // Xử lý khi nhấn nút đăng ký
  btn.onclick=()=>{
    const name=input.value;
    const res=registerPlayer(name);
    if(res.ok){
      msg.style.color="lime";
      msg.textContent="Đăng ký thành công!";
      panel.style.display="none";
      draw();
    } else {
      msg.style.color="red";
      msg.textContent=res.msg;
    }
  };

  document.addEventListener('keydown',e=>{
    if(e.code==='Space' && gameState==='intro' && localStorage.getItem(CONFIG.STORAGE_KEYS.NAME)){
      startGame();
    }
  });

  draw();
};


