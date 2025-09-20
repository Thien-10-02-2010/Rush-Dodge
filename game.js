/* game.js - Obstacle Dash (chi tiết, modular, robust)
   - Mỗi trap/thing tách class riêng
   - ObstacleManager chịu spawn + tránh chặn lối
   - StageManager chịu weights/progression
   - Local leaderboard stored in localStorage (unique names)
   - Game only starts when window.startGame() is called (from play.html)
*/

/* =========================
   CONFIG & HELPERS
   ========================= */
const CONFIG = {
  CANVAS_W: 360,
  CANVAS_H: 560,
  PLAYER_SIZE: 34,
  PLAYER_BASE_SPEED: 5,
  BASE_OBSTACLE_SPEED: 1.9,
  SPAWN_INTERVAL_MS: 1400,
  MIN_GAP_PASS_FACTOR: 2.5, // gap must be player.w * factor to be passable
  MIN_VERTICAL_GAP: 110,
  SCORE_TARGET: 500,
  INVULN_MS: 350, // invulnerability after (re)start in ms
  MAX_SPAWN_ATTEMPTS: 28
};

function clamp(v,a,b){ return Math.max(a, Math.min(b, v)); }
function rand(min,max){ return min + Math.random()*(max-min); }
function int(v){ return Math.floor(v); }

// robust rect overlap
function rectOverlap(a,b){
  if (!a || !b) return false;
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}

/* =========================
   CANVAS & DOM
   ========================= */
const canvas = document.getElementById('gameCanvas');
canvas.width = CONFIG.CANVAS_W;
canvas.height = CONFIG.CANVAS_H;
const ctx = canvas.getContext('2d');

const scoreDisplay = document.getElementById('scoreDisplay');
const highDisplay = document.getElementById('highDisplay');
const compDisplay = document.getElementById('compDisplay');
const playerTagEl = document.getElementById('playerTag');

/* =========================
   LOCAL LEADERBOARD (cục bộ)
   - stores up to 1000 entries in localStorage under key 'od_leaderboard'
   - each entry { name, highScore, completions }
   ========================= */
const LB_KEY = 'od_leaderboard';
function _loadLB(){
  try {
    const raw = localStorage.getItem(LB_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr;
  } catch(e){ return []; }
}
function _saveLB(list){
  try { localStorage.setItem(LB_KEY, JSON.stringify(list.slice(0,1000))); } catch(e){}
}
function normalizeName(name) {
  return name
    .trim()                // bỏ khoảng trắng đầu/cuối
    .replace(/\s+/g, ' '); // nhiều space -> 1 space
}

function isValidName(name) {
  // Cho phép chữ cái, số, và khoảng trắng
  // Không cho phép ký tự đặc biệt
  const regex = /^[A-Za-z0-9 ]+$/;
  return regex.test(name);
}

function OD_RegisterPlayerLocal(name){
  name = normalizeName(name);
  if (!name) return { success:false, message: 'Tên không được trống' };

  // Kiểm tra ký tự hợp lệ
  if (!isValidName(name)) {
    return { success:false, message: 'Tên chỉ được chứa chữ, số và khoảng trắng' };
  }

  // Kiểm tra độ dài
  if (name.length < 3 || name.length > 15) {
    return { success:false, message: 'Tên phải từ 3 đến 15 ký tự' };
  }

  const list = _loadLB();

  // So sánh không phân biệt hoa/thường + khoảng trắng
  const normalized = name.toLowerCase();
  if (list.find(p => normalizeName(p.name).toLowerCase() === normalized)) {
    return { success:false, message: 'Tên đã tồn tại, chọn tên khác' };
  }

  // Lưu tên gốc (giữ nguyên kiểu người nhập, chỉ chuẩn hóa space)
  const entry = { name, highScore: 0, completions: 0 };
  list.push(entry);
  _saveLB(list);

  localStorage.setItem('od_player_name', entry.name);
  if (playerTagEl) playerTagEl.textContent = `Player: ${entry.name}`;

  return { success:true, message: 'Đăng ký thành công' };
}

function OD_LoadLeaderboardLocal(){
  return _loadLB();
}
function OD_SubmitScoreLocal(name, score, completed=false){
  // update user record (create if missing)
  name = (''+name).trim();
  if (!name) return;
  const list = _loadLB();
  let rec = list.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (!rec) {
    rec = { name, highScore: 0, completions: 0 };
    list.push(rec);
  }
  if (completed) {
    rec.completions = (rec.completions || 0) + 1;
    rec.highScore = 0; // per your rule: reset high when completion
  } else {
    if (score > (rec.highScore||0)) rec.highScore = score;
  }
  _saveLB(list);
}

/* =========================
   PLAYER class
   ========================= */
class Player {
  constructor(){
    this.w = CONFIG.PLAYER_SIZE;
    this.h = CONFIG.PLAYER_SIZE;
    this.reset();
    this._bindKeyboard();
  }
  reset(){
    this.x = (CONFIG.CANVAS_W - this.w)/2;
    this.y = CONFIG.CANVAS_H - this.h - 8;
    this.speedBase = CONFIG.PLAYER_BASE_SPEED;
    this.left = false; this.right = false;
    this.alive = true;
  }
  _bindKeyboard(){
    window.addEventListener('keydown', (e) => {
      if (e.code === 'ArrowLeft') { this.left = true; e.preventDefault(); }
      if (e.code === 'ArrowRight') { this.right = true; e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'ArrowLeft') this.left = false;
      if (e.code === 'ArrowRight') this.right = false;
    });
  }
  update(deltaMs, difficultyMultiplier){
    const sp = this.speedBase + (difficultyMultiplier * 0.35);
    if (this.left) this.x -= sp;
    if (this.right) this.x += sp;
    this.x = clamp(this.x, 0, CONFIG.CANVAS_W - this.w);
  }
  draw(ctx){
    ctx.fillStyle = '#7ec8ff';
    roundRect(ctx, this.x, this.y, this.w, this.h, 6, true, false);
    ctx.fillStyle = '#034d73';
    ctx.fillRect(this.x + this.w*0.64, this.y + this.h*0.22, this.w*0.12, this.h*0.12);
  }
  getRect(){ return { x:this.x, y:this.y, w:this.w, h:this.h }; }
}

/* helper roundRect */
function roundRect(ctx,x,y,w,h,r,fill=true,stroke=false, color=null){
  if (!r) r = 4;
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
  if (fill){
    if (color) ctx.fillStyle = color;
    ctx.fill();
  }
  if (stroke) ctx.stroke();
}

/* =========================
   OBSTACLE CLASSES (each with update/draw/isOffscreen/collidesWithPlayer)
   - BasicBar, MovingBar, Wall, MovingGapWall, FallingBlock, Spinner, WindmillPair, SpikeFloor, VerticalBars
   ========================= */

class BasicBar {
  constructor(speedMult=1){
    this.w = rand(100, 220) + rand(0, 150) * Math.random();
    this.h = 14;
    this.x = rand(0, CONFIG.CANVAS_W - this.w);
    this.y = -this.h - 8;
    this.speed = CONFIG.BASE_OBSTACLE_SPEED * speedMult;
    this.type = 'basic';
    this.color = '#ff6347';
  }
  update(dt){ this.y += this.speed; }
  draw(ctx){ roundRect(ctx, this.x, this.y, this.w, this.h, 4, true, false, this.color); }
  isOffscreen(){ return this.y > CONFIG.CANVAS_H + 40; }
  collidesWithPlayer(player){ return rectOverlap(this, player.getRect()); }
}

class MovingBar {
  constructor(speedMult=1){
    this.w = rand(100, 110) + rand(0, 40) * Math.random();
    this.h = 14;
    this.x = rand(0, CONFIG.CANVAS_W - this.w);
    this.y = -this.h - 8;
    this.speed = CONFIG.BASE_OBSTACLE_SPEED * speedMult;
    this.moveSpeed = rand(1.2, 2.6) + speedMult*0.1;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.type = 'moving';
    this.color = '#ff9b57';
  }
  update(dt){
    this.y += this.speed;
    this.x += this.dir * this.moveSpeed;
    if (this.x <= 0){ this.x = 0; this.dir = 1; }
    if (this.x + this.w >= CONFIG.CANVAS_W){ this.x = CONFIG.CANVAS_W - this.w; this.dir = -1; }
  }
  draw(ctx){
    roundRect(ctx, this.x, this.y, this.w, this.h, 4, true, false, this.color);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(this.x + this.w - 16, this.y + 2, 10, this.h - 4);
  }
  isOffscreen(){ return this.y > CONFIG.CANVAS_H + 40; }
  collidesWithPlayer(player){ return rectOverlap(this, player.getRect()); }
}

class Wall {
  constructor(speedMult=1, gapW=null){
    this.h = 20;
    this.gapW = gapW || Math.max(Math.floor(CONFIG.PLAYER_SIZE * 2.6), 60) + Math.floor(rand(0,40));
    this.gapX = rand(6, CONFIG.CANVAS_W - this.gapW - 6);
    this.left = { x:0, y:-this.h - 8, w:this.gapX, h:this.h };
    this.right = { x:this.gapX + this.gapW, y:-this.h - 8, w: CONFIG.CANVAS_W - (this.gapX + this.gapW), h:this.h };
    this.speed = CONFIG.BASE_OBSTACLE_SPEED * speedMult;
    this.type = 'wall';
    this.color = '#8b0000';
  }
  update(dt){ this.left.y += this.speed; this.right.y += this.speed; }
  draw(ctx){
    if (this.left.w > 0) roundRect(ctx, this.left.x, this.left.y, this.left.w, this.left.h, 0, true, false, this.color);
    if (this.right.w > 0) roundRect(ctx, this.right.x, this.right.y, this.right.w, this.right.h, 0, true, false, this.color);
  }
  isOffscreen(){ return this.left.y > CONFIG.CANVAS_H + 40 && this.right.y > CONFIG.CANVAS_H + 40; }
  collidesWithPlayer(player){
    const pr = player.getRect();
    // only check when verticals overlap
    if (pr.y < this.left.y + this.left.h && pr.y + pr.h > this.left.y){
      if (!(pr.x > this.gapX && pr.x + pr.w < this.gapX + this.gapW)) return true;
    }
    return false;
  }
}

class MovingGapWall {
  constructor(speedMult=1){
    this.h = 22;
    this.gapW = Math.max(Math.floor(CONFIG.PLAYER_SIZE * 2.8), 60);
    this.gapX = rand(6, CONFIG.CANVAS_W - this.gapW - 6);
    this.y = -this.h - 8;
    this.speed = CONFIG.BASE_OBSTACLE_SPEED * speedMult;
    this.moveDir = Math.random() < 0.5 ? -1 : 1;
    this.moveSpeed = 1.4 + speedMult*0.05;
    this.type = 'movingGap';
    this.color = '#800000';
  }
  update(dt){
    this.y += this.speed;
    this.gapX += this.moveDir * this.moveSpeed;
    if (this.gapX <= 0) this.moveDir = 1;
    if (this.gapX + this.gapW >= CONFIG.CANVAS_W) this.moveDir = -1;
  }
  draw(ctx){
    roundRect(ctx, 0, this.y, this.gapX, this.h, 0, true, false, this.color);
    roundRect(ctx, this.gapX + this.gapW, this.y, CONFIG.CANVAS_W - (this.gapX + this.gapW), this.h, 0, true, false, this.color);
  }
  isOffscreen(){ return this.y > CONFIG.CANVAS_H + 40; }
  collidesWithPlayer(player){
    const pr = player.getRect();
    if (pr.y < this.y + this.h && pr.y + pr.h > this.y){
      if (!( pr.x > this.gapX && pr.x + pr.w < this.gapX + this.gapW )) return true;
    }
    return false;
  }
}

class FallingBlock {
  constructor(speedMult=1){
    this.size = rand(36, 68);
    this.w = this.h = this.size;
    this.x = rand(0, Math.max(0, CONFIG.CANVAS_W - this.size));
    this.y = -this.h - 8;
    this.fallSpeed = rand(3.0, 4.3) + speedMult*0.1;
    this.type = 'block';
    this.color = '#2ecc71';
  }
  update(dt){ this.y += this.fallSpeed; }
  draw(ctx){ roundRect(ctx, this.x, this.y, this.w, this.h, 6, true, false, this.color); }
  isOffscreen(){ return this.y > CONFIG.CANVAS_H + 60; }
  collidesWithPlayer(player){ return rectOverlap(this, player.getRect()); }
}

class Spinner {
  constructor(speedMult=1){
    this.r = rand(44, 78);
    this.w = this.h = this.r * 2;
    this.x = rand(this.r, CONFIG.CANVAS_W - this.r);
    this.y = - this.h - 10;
    this.angle = 0;
    this.spin = rand(0.04, 0.12) + speedMult*0.01;
    this.speed = CONFIG.BASE_OBSTACLE_SPEED * speedMult;
    this.blades = 3 + Math.floor(Math.random()*2);
    this.type = 'spinner';
    this.color = '#cc3333';
  }
  update(dt){ this.y += this.speed; this.angle += this.spin; }
  draw(ctx){
    const cx = this.x, cy = this.y + this.r;
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(this.angle);
    ctx.fillStyle = this.color;
    const bladeW = this.r, bladeH = Math.max(10, Math.floor(this.r*0.18));
    for (let i=0;i<this.blades;i++){ ctx.fillRect(0, -bladeH/2, bladeW, bladeH); ctx.rotate(Math.PI*2/this.blades); }
    ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0,0,Math.max(6,this.r*0.12),0,Math.PI*2); ctx.fill();
    ctx.restore();
  }
  isOffscreen(){ return this.y - this.r > CONFIG.CANVAS_H + 40; }
  collidesWithPlayer(player){
    const pcx = player.x + player.w/2, pcy = player.y + player.h/2;
    const scx = this.x, scy = this.y + this.r;
    const dist = Math.hypot(pcx - scx, pcy - scy);
    const pd = Math.hypot(player.w, player.h)/2;
    return dist < this.r + pd - 4;
  }
}

class WindmillPair {
  constructor(speedMult=1){
    this.r = rand(36, 54);
    this.left = { x: this.r + 12, y: -this.r*2 - 10, r: this.r, angle: 0 };
    this.right = { x: CONFIG.CANVAS_W - this.r - 12, y: -this.r*2 - 10, r: this.r, angle: 0 };
    this.spin = rand(0.06, 0.12) + speedMult*0.01;
    this.speed = CONFIG.BASE_OBSTACLE_SPEED * speedMult;
    this.type = 'windmillPair';
    this.color = '#c74b4b';
  }
  update(dt){
    this.left.y += this.speed; this.right.y += this.speed;
    this.left.angle = (this.left.angle || 0) + this.spin;
    this.right.angle = (this.right.angle || 0) - this.spin;
  }
  draw(ctx){
    drawWindmill(ctx, this.left.x, this.left.y + this.left.r, this.left.r, this.left.angle, this.color);
    drawWindmill(ctx, this.right.x, this.right.y + this.right.r, this.right.r, this.right.angle, this.color);
  }
  isOffscreen(){ return this.left.y - this.left.r > CONFIG.CANVAS_H + 60 && this.right.y - this.right.r > CONFIG.CANVAS_H + 60; }
  collidesWithPlayer(player){
    const pcx = player.x + player.w/2, pcy = player.y + player.h/2;
    if (Math.hypot(pcx - this.left.x, pcy - (this.left.y + this.left.r)) < this.left.r + player.w/2 - 4) return true;
    if (Math.hypot(pcx - this.right.x, pcy - (this.right.y + this.right.r)) < this.right.r + player.w/2 - 4) return true;
    return false;
  }
}

class SpikeFloor {
  constructor(speedMult=1){
    this.parts = [];
    for (let i=0;i<CONFIG.CANVAS_W;i+=20) this.parts.push({ x:i, y:-10, w:20, h:10 });
    this.speed = CONFIG.BASE_OBSTACLE_SPEED * speedMult;
    this.type = 'spike';
    this.color = '#c0c0c0';
  }
  update(dt){ this.parts.forEach(p => p.y += this.speed); }
  draw(ctx){ ctx.fillStyle = this.color; this.parts.forEach(p => ctx.fillRect(p.x, p.y, p.w, p.h)); }
  isOffscreen(){ return this.parts.every(p => p.y > CONFIG.CANVAS_H + 40); }
  collidesWithPlayer(player){
    const pr = player.getRect();
    // only when spike band is near bottom (active)
    for (let p of this.parts){
      if (p.y + p.h < 0) continue; // not yet visible
      if (pr.y + pr.h > CONFIG.CANVAS_H - p.h - 6) {
        // if player intersects bottom spike region and not in safe gap (spike band doesn't create gap here)
        if (rectOverlap(pr, { x:p.x, y:p.y, w:p.w, h:p.h })) return true;
      }
    }
    return false;
  }
}

class VerticalBars {
  constructor(speedMult=1){
    this.parts = [];
    const count = 3 + Math.floor(rand(0,2));
    const barW = 18;
    const gapMin = CONFIG.PLAYER_SIZE * CONFIG.MIN_GAP_PASS_FACTOR;
    const totalMin = count*barW + (count-1)*gapMin;
    const left = rand(6, Math.max(6, CONFIG.CANVAS_W - totalMin - 6));
    let curX = left;
    for (let i=0;i<count;i++){
      const h = 160 + rand(0,80);
      this.parts.push({ x: curX, y: -h - 6, w: barW, h: h });
      curX += barW + gapMin + rand(0, 40);
    }
    this.speed = CONFIG.BASE_OBSTACLE_SPEED * speedMult;
    this.type = 'verticals';
    this.color = '#1e90ff';
  }
  update(dt){ this.parts.forEach(p => p.y += this.speed); }
  draw(ctx){ ctx.fillStyle = this.color; this.parts.forEach(p => roundRect(ctx, p.x, p.y, p.w, p.h, 4, true, false)); }
  isOffscreen(){ return this.parts.every(p => p.y > CONFIG.CANVAS_H + 40); }
  collidesWithPlayer(player){
    for (let p of this.parts) {
      if (p.y + p.h < 0) continue;
      if (rectOverlap(p, player.getRect())) return true;
    }
    return false;
  }
}

/* windmill draw helper */
function drawWindmill(ctx, cx, cy, r, angle=0, color='#cc3333'){
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle || 0);
  ctx.fillStyle = color;
  const bladeW = r; const bladeH = Math.max(10, Math.floor(r*0.18));
  for (let i=0;i<4;i++){ ctx.fillRect(0, -bladeH/2 - 6, bladeW, bladeH); ctx.rotate(Math.PI/2); }
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0,0, Math.max(6, r*0.12), 0, Math.PI*2); ctx.fill();
  ctx.restore();
}

/* =========================
   STAGE / WEIGHTS MANAGER
   - returns an array of types and weights based on elapsed seconds
   ========================= */
const StageManager = {
  getWeights(s){
    const sec = Math.floor(s);
    if (sec < 20) return [{t:'basic', w:100}];
    if (sec < 50) return [{t:'basic', w:65},{t:'wall', w:35}];
    if (sec < 100) return [{t:'basic', w:50},{t:'wall', w:30},{t:'moving', w:20}];
    if (sec < 150) return [{t:'basic', w:40},{t:'wall', w:25},{t:'moving', w:20},{t:'block', w:15}];
    if (sec < 200) return [{t:'basic', w:35},{t:'wall', w:20},{t:'moving', w:20},{t:'block', w:15},{t:'spinner', w:10}];
    if (sec < 250) return [{t:'basic', w:30},{t:'wall', w:20},{t:'moving', w:15},{t:'block', w:15},{t:'spinner', w:10},{t:'spike', w:10}];
    if (sec < 300) return [{t:'basic', w:25},{t:'wall', w:20},{t:'moving', w:15},{t:'block', w:15},{t:'spinner', w:10},{t:'spike', w:10},{t:'verticals', w:5}];
    if (sec < 375) return [{t:'basic', w:20},{t:'wall', w:20},{t:'moving', w:18},{t:'block', w:12},{t:'spinner', w:12},{t:'spike', w:8},{t:'verticals', w:6},{t:'gapWall', w:4}];
    if (sec < 400) return [{t:'basic', w:12},{t:'wall', w:15},{t:'moving', w:15},{t:'block', w:14},{t:'spinner', w:15},{t:'spike', w:9},{t:'verticals', w:10},{t:'gapWall', w:10}];
    // final sprint
    return [{t:'basic', w:5},{t:'wall', w:10},{t:'moving', w:12},{t:'block', w:15},{t:'spinner', w:16},{t:'spike', w:13},{t:'verticals', w:12},{t:'gapWall', w:17}];
  },

  chooseType(score){
    const arr = this.getWeights(score);
    const total = arr.reduce((s,i)=>s+i.w,0);
    let r = Math.random()*total;
    for (let a of arr){
      if (r < a.w) return a.t;
      r -= a.w;
    }
    return arr[0].t;
  }
};

/* =========================
   OBSTACLE MANAGER
   - trySpawn(score, now): attempts multiple times; rejects placements that block all paths
   - uses blockedZones to prevent spawn overlap
   ========================= */
class ObstacleManager {
  constructor(){
    this.items = [];
    this.blockedZones = []; // { top, bottom }
    this.lastSpawnAt = 0;
    this.spawnInterval = CONFIG.SPAWN_INTERVAL_MS;
    this.speedMultiplier = 1;
  }

  update(dt){
    // update items
    for (let it of this.items) if (typeof it.update === 'function') it.update(dt);
    // remove offscreen
    this.items = this.items.filter(it => !it.isOffscreen());
    // prune blocked zones that are expired (approx)
    this.blockedZones = this.blockedZones.filter(z => z.bottom > -300);
  }

  draw(ctx){
    for (let it of this.items) if (typeof it.draw === 'function') it.draw(ctx);
  }

  // gather top-level rects to check horizontal passability near spawn line
  _gatherTopRects(){
    const rects = [];
    for (let it of this.items){
      // for basic/moving/block/spinner: use its bounding x/w if near top
      if (it.isOffscreen && typeof it.y !== 'undefined'){
        if ( (it.y) < 160 ){
          if (it.w && it.x !== undefined) rects.push({ x: it.x, w: it.w });
          else if (it.left && it.left.w !== undefined) {
            rects.push({ x: it.left.x, w: it.left.w });
            rects.push({ x: it.right.x, w: it.right.w });
          } else if (Array.isArray(it.parts)){
            it.parts.forEach(p => rects.push({ x:p.x, w:p.w }));
          } else if (it.left && it.left.r) {
            rects.push({ x: it.left.x - it.left.r, w: it.left.r*2 });
            rects.push({ x: it.right.x - it.right.r, w: it.right.r*2 });
          }
        }
      } else {
        // fallback: if item has parts and y small, include
        if (it.parts && it.parts.length) {
          it.parts.forEach(p => { if (p.y < 160) rects.push({ x:p.x, w:p.w }); });
        }
      }
    }
    return rects;
  }

  _wouldBlockAllPaths(newRects){
    // merge existing top rects + new rects, compute max gap
    const active = this._gatherTopRects();
    for (let nr of newRects) active.push({ x: nr.x, w: nr.w });
    // intervals
    const intervals = active.map(r => [r.x, r.x + r.w]).sort((a,b)=>a[0]-b[0]);
    const merged = [];
    for (let it of intervals){
      if (!merged.length) merged.push(it.slice());
      else {
        const last = merged[merged.length-1];
        if (it[0] <= last[1]) last[1] = Math.max(last[1], it[1]);
        else merged.push(it.slice());
      }
    }
    // find max gap
    let prev = 0, maxGap = 0;
    for (let m of merged){
      maxGap = Math.max(maxGap, m[0] - prev);
      prev = m[1];
    }
    maxGap = Math.max(maxGap, CONFIG.CANVAS_W - prev);
    const minPass = CONFIG.PLAYER_SIZE * CONFIG.MIN_GAP_PASS_FACTOR;
    return maxGap < minPass;
  }

  trySpawn(scoreSec, nowTime){
    // difficulty & spawnInterval adaptation
    const difficulty = Math.floor(scoreSec / 30);
    this.speedMultiplier = 1 + difficulty * 0.08;
    let interval = CONFIG.SPAWN_INTERVAL_MS - difficulty * 60;
    if (scoreSec >= 400) interval = Math.max(480, interval - 260);
    this.spawnInterval = Math.max(600, interval);

    // ensure vertical spacing: do not spawn if existing top item is too close to spawn line
    const topYs = this.items.map(it => {
      if (it.parts && it.parts.length) return Math.min(...it.parts.map(p => p.y));
      if (typeof it.y !== 'undefined') return it.y;
      return 1000;
    });
    const topMin = topYs.length ? Math.min(...topYs) : 1000;
    if (topMin > -10 && topMin < - (CONFIG.MIN_VERTICAL_GAP * 0.4)) {
      // if there is already something very near the top, skip spawn this time
    }

    // attempt spawn
    for (let attempt=0; attempt < CONFIG.MAX_SPAWN_ATTEMPTS; attempt++){
      const type = StageManager.chooseType(scoreSec);
      let candidateRects = [];

      // prepare candidate rects (for passability test)
      if (type === 'basic'){
        const w = rand(150,220); const x = rand(0, CONFIG.CANVAS_W - w);
        candidateRects.push({ x, w });
      } else if (type === 'moving'){
        const w = rand(160,220); const x = rand(0, CONFIG.CANVAS_W - w);
        candidateRects.push({ x, w });
      } else if (type === 'wall' || type === 'gapWall'){
        const gapW = Math.max(Math.floor(CONFIG.PLAYER_SIZE * 2.6), 60) + Math.floor(rand(0,40));
        const gapX = rand(6, CONFIG.CANVAS_W - gapW - 6);
        candidateRects.push({ x:0, w: gapX }); candidateRects.push({ x: gapX + gapW, w: CONFIG.CANVAS_W - (gapX + gapW) });
      } else if (type === 'block'){
        const w = rand(36,68); const x = rand(0, CONFIG.CANVAS_W - w);
        candidateRects.push({ x, w });
      } else if (type === 'spinner'){
        const r = rand(44,78); const x = rand(r, CONFIG.CANVAS_W - r);
        candidateRects.push({ x: x - r, w: r*2 });
      } else if (type === 'windmillPair'){
        const r = rand(36,52);
        candidateRects.push({ x: 12, w: r*2 }); candidateRects.push({ x: CONFIG.CANVAS_W - 12 - r*2, w: r*2 });
      } else if (type === 'verticals'){
        const count = 3 + Math.floor(rand(0,2)); const barW = 18;
        const gapMin = CONFIG.PLAYER_SIZE * CONFIG.MIN_GAP_PASS_FACTOR;
        const minTotal = count*barW + (count-1)*gapMin;
        if (minTotal > CONFIG.CANVAS_W - 20) continue;
        const left = rand(6, CONFIG.CANVAS_W - minTotal - 6);
        let cur = left;
        for (let i=0;i<count;i++){
          candidateRects.push({ x: cur, w: barW });
          cur += barW + gapMin + rand(0, 40);
        }
      } else if (type === 'spike'){
        // spike floor doesn't block top spawn significantly
      }

      // skip if would block paths
      if (this._wouldBlockAllPaths(candidateRects)) continue;

      // skip if blockedZones conflict
      const topBlocked = this.blockedZones.some(z => z.top <= 60 && z.bottom > -60);
      if (topBlocked && (type === 'wall' || type === 'spinner' || type === 'windmillPair')) continue;

      // create instance
      const sm = this.speedMultiplier;
      let inst = null;
      switch(type){
        case 'basic': inst = new BasicBar(sm); break;
        case 'moving': inst = new MovingBar(sm); break;
        case 'wall': inst = new Wall(sm); break;
        case 'gapWall': inst = new MovingGapWall(sm); break;
        case 'block': inst = new FallingBlock(sm); break;
        case 'spinner': inst = new Spinner(sm); break;
        case 'windmillPair': inst = new WindmillPair(sm); break;
        case 'spike': inst = new SpikeFloor(sm); break;
        case 'verticals': inst = new VerticalBars(sm); break;
      }
      if (inst) {
        // reserve blocked zone to avoid spawning other big obstacles immediately on same band
        this.blockedZones.push({ top: -180, bottom: 140 });
        this.items.push(inst);
        return true;
      }
    } // attempt loop
    return false;
  }
}

/* =========================
   GLOBAL GAME STATE & LOOP
   ========================= */
let player = new Player();
let manager = new ObstacleManager();
let gameState = 'intro'; // intro | playing | gameover | win
let lastFrame = 0;
let elapsed = 0; // seconds
let invulnerableUntil = 0;

// load local records
let highscoreLocal = 0;
let completionsLocal = 0;
(function loadLocal(){
  const lb = _loadLB();
  const myName = localStorage.getItem('od_player_name');
  if (myName) {
    const rec = lb.find(p => p.name.toLowerCase() === myName.toLowerCase());
    if (rec) { highscoreLocal = rec.highScore || 0; completionsLocal = rec.completions || 0; }
  }
  if (highDisplay) highDisplay.textContent = `High: ${highscoreLocal}`;
  if (compDisplay) compDisplay.textContent = `Completions: ${completionsLocal}`;
})();

// safe collision: skip obstacles not yet visible (y + h < 0) to avoid false positives
function checkCollisions(){
  if (performance.now() < invulnerableUntil) return false;
  const pr = player.getRect();
  for (let it of manager.items){
    // skip object if entirely above top (not visible) to avoid immediate death on spawn
    if (it.isOffscreen && typeof it.y !== 'undefined'){
      // check top edge of this instance (approx)
      let topY = it.y;
      if (it.parts && it.parts.length) topY = Math.min(...it.parts.map(p => p.y));
      if (topY + (it.h || 0) < 0) continue;
    }

    if (typeof it.collidesWithPlayer === 'function'){
      if (it.collidesWithPlayer(player)) return true;
    } else if (it.parts && Array.isArray(it.parts)){
      for (let p of it.parts){
        if (p.y + p.h < 0) continue;
        if (rectOverlap(p, pr)) return true;
      }
    } else {
      // fallback bounding
      if (rectOverlap(it, pr)) return true;
    }
  }
  return false;
}

// draw overlays
function drawHUD(){
  ctx.fillStyle = '#fff';
  ctx.font = '14px Arial';
  ctx.textAlign = 'left';
  ctx.fillText(`Score: ${int(elapsed)}`, 10, 20);
  ctx.fillText(`High: ${highscoreLocal}`, 10, 40);
  ctx.fillText(`Completions: ${completionsLocal}`, CONFIG.CANVAS_W - 150, 20);
}

function drawIntroScreen(){
  ctx.fillStyle = '#fff';
  ctx.font = '20px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('Obstacle Dash', CONFIG.CANVAS_W/2, 80);
  ctx.font = '14px Arial';
  ctx.fillStyle = '#cfdff0';
  ctx.fillText('Nhập tên, nhấn "Bắt đầu" và bắt đầu né!', CONFIG.CANVAS_W/2, 110);
}

function drawGameOver(){
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, CONFIG.CANVAS_H/2 - 50, CONFIG.CANVAS_W, 120);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = '22px Arial';
  ctx.fillText('GAME OVER', CONFIG.CANVAS_W/2, CONFIG.CANVAS_H/2 - 10);
  ctx.font = '14px Arial';
  ctx.fillText('Nhấn Space để chơi lại', CONFIG.CANVAS_W/2, CONFIG.CANVAS_H/2 + 18);
}

function drawWin(){
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, CONFIG.CANVAS_H/2 - 60, CONFIG.CANVAS_W, 140);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = '20px Arial';
  ctx.fillText('YOU WIN! Bạn hoàn thành 1 vòng', CONFIG.CANVAS_W/2, CONFIG.CANVAS_H/2 - 6);
  ctx.font = '14px Arial';
  ctx.fillText('Nhấn Space để chơi lại', CONFIG.CANVAS_W/2, CONFIG.CANVAS_H/2 + 18);
}

// main animation tick
function tick(ts){
  if (!lastFrame) lastFrame = ts;
  const dtMs = ts - lastFrame;
  lastFrame = ts;

  // clear
  ctx.fillStyle = '#000';
  ctx.fillRect(0,0,CONFIG.CANVAS_W, CONFIG.CANVAS_H);

  if (gameState === 'intro'){
    drawIntroScreen();
    // preview player
    player.draw(ctx);
    requestAnimationFrame(tick);
    return;
  }

  if (gameState === 'playing'){
    // update elapsed time
    elapsed += dtMs / 1000;

    // spawn controller
    if (ts - manager.lastSpawnAt > manager.spawnInterval){
      manager.trySpawn(elapsed, ts);
      manager.lastSpawnAt = ts;
    }

    // update player
    const difficulty = Math.floor(elapsed / 30);
    player.update(dtMs, difficulty);

    // update manager items
    manager.update(dtMs);

    // draw obstacles
    manager.draw(ctx);
    // draw player (on top)
    player.draw(ctx);

    // collisions
    if (checkCollisions()){
      gameState = 'gameover';
      // update local record
      const name = localStorage.getItem('od_player_name');
      if (name) {
        OD_SubmitScoreLocal(name, int(elapsed), false);
        // reload user stats
        const list = OD_LoadLeaderboardLocal(); const me = list.find(p => p.name===name);
        if (me){ highscoreLocal = me.highScore || 0; completionsLocal = me.completions || 0; }
        if (highDisplay) highDisplay.textContent = `High: ${highscoreLocal}`;
        if (compDisplay) compDisplay.textContent = `Completions: ${completionsLocal}`;
      }
    }

    // check win
    if (elapsed >= CONFIG.SCORE_TARGET && gameState === 'playing'){
      gameState = 'win';
      const name = localStorage.getItem('od_player_name');
      if (name){
        OD_SubmitScoreLocal(name, 0, true); // increment completion & reset high for that player
        const list = OD_LoadLeaderboardLocal(); const me = list.find(p => p.name===name);
        if (me){ highscoreLocal = me.highScore || 0; completionsLocal = me.completions || 0; }
        if (highDisplay) highDisplay.textContent = `High: ${highscoreLocal}`;
        if (compDisplay) compDisplay.textContent = `Completions: ${completionsLocal}`;
      }
    }
  } // endif playing

  // HUD
  drawHUD();

  if (gameState === 'gameover') drawGameOver();
  if (gameState === 'win') drawWin();

  // next frame
  requestAnimationFrame(tick);
}

/* =========================
   CONTROL API: start / restart / stop
   - exposed as window.startGame()
   ========================= */
function startGame(){
  // ensure player registered
  const name = localStorage.getItem('od_player_name');
  if (!name) {
    alert('Vui lòng đăng ký tên trước khi chơi (ở trang Intro).');
    return;
  }
  // reset player & manager
  player.reset();
  manager = new ObstacleManager();
  manager.items = [];
  manager.blockedZones = [];
  manager.lastSpawnAt = performance.now();
  manager.spawnInterval = CONFIG.SPAWN_INTERVAL_MS;
  elapsed = 0;
  lastFrame = 0;
  gameState = 'playing';
  // invulnerability short window
  invulnerableUntil = performance.now() + CONFIG.INVULN_MS;
  // set HUD initial
  scoreDisplay && (scoreDisplay.textContent = 'Score: 0');
  highDisplay && (highDisplay.textContent = `High: ${highscoreLocal}`);
  compDisplay && (compDisplay.textContent = `Completions: ${completionsLocal}`);
  requestAnimationFrame(tick);
}

// key space to restart
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    if (gameState === 'gameover' || gameState === 'win') {
      startGame();
    }
  }
});

// Expose registration and leaderboard functions to global so play.html can call them
window.OD_RegisterPlayerLocal = OD_RegisterPlayerLocal;
window.OD_LoadLeaderboardLocal = OD_LoadLeaderboardLocal;
window.startGame = startGame;

// initialize (draw intro)
(function init(){
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,CONFIG.CANVAS_W, CONFIG.CANVAS_H);
  drawIntroScreen();
})();
