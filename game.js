/* game.js — Obstacle Dash (reworked)
   Features:
   - multiple obstacle types (static long, medium, moving, wall-with-gap, windmill single/double)
   - spawn logic ensures passable gap (gap >= player.w * 2.5)
   - prevents spawning other obstacles inside windmill/wall zones
   - score counted per second, maxScore = 500 (YOU WIN)
   - high score saved to localStorage
*/

(() => {
  // Canvas setup
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;

  // Player
  const player = { w: 40, h: 40, x: 20, y: HEIGHT - 10 - 40, speed: 8 };
  let left = false, right = false;

  // Obstacles array
  let obstacles = []; // each obstacle has type field
  let blockedZones = []; // zones (yTop,yBottom) where we should not spawn other obstacles

  // Game state
  let obstacleSpeed = 2;
  let spawnRateBase = 1500; // ms
  let lastSpawn = Date.now();
  let lastSecondTick = Date.now();
  let score = 0;
  const maxScore = 500;
  let gameOver = false;
  let youWin = false;
  const highKey = 'obstacle-dash-high';
  let highScore = parseInt(localStorage.getItem(highKey) || '0', 10);

  // DOM HUD
  const scoreDisplay = document.getElementById('scoreDisplay');
  const highDisplay = document.getElementById('highDisplay');
  const backBtn = document.getElementById('backBtn');
  if (scoreDisplay) scoreDisplay.textContent = `Score: ${score}`;
  if (highDisplay) highDisplay.textContent = `High: ${highScore}`;

  // Utility functions
  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // Collision rectangle
  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // Base obstacle factory helpers
  function pushBlockedZone(yTop, height) {
    blockedZones.push({ top: yTop, bottom: yTop + height });
    // prune old zones
    const nowTop = obstacles.length ? Math.min(...obstacles.map(o=>o.y)) : 0;
    blockedZones = blockedZones.filter(z => z.bottom > 0);
  }

  // Obstacle types: static, moving, wall (with gap), windmill (single), windmillDouble
  let lastSpawnY = -100; // khai báo toàn cục

  function spawnObstacle() {
  const difficulty = Math.floor(score / 30);
  obstacleSpeed = 2 + difficulty * 0.25;
  const spawnRate = Math.max(spawnRateBase - difficulty * 80, 800);

  let tries = 0;
  while (tries++ < 30) {
    // ưu tiên obstacle lớn
    const r = Math.random();
    let type;
    if (r < 0.25) type = 'long';          // thanh dài
    else if (r < 0.45) type = 'moving';   // thanh di động
    else if (r < 0.7) type = 'wall';      // tường có khe
    else type = 'windmill';               // cối xoay gió

    // tránh spawn đè
    const topZoneConflict = blockedZones.some(z => z.top <= 50 && z.bottom > 0);
    if (topZoneConflict && (type === 'wall' || type === 'windmill')) continue;

    if (type === 'long') {
      const w = 150 + Math.random() * 100; // 150–250
      const h = 16;
      const x = Math.random() * (WIDTH - w);
      if (!wouldBlockAllPaths([{x,w}])) {
        obstacles.push({ type: 'static', x, y: -h-10, w, h });
        break;
      }
    } else if (type === 'moving') {
      const w = 160, h = 24;
      const x = Math.random() * (WIDTH - w);
      const dir = Math.random() < 0.5 ? 1 : -1;
      obstacles.push({ type: 'moving', x, y: -h-10, w, h, dir, speedX: 2 + difficulty*0.2 });
      break;
    } else if (type === 'wall') {
      const minGap = player.w * 2.8;  // khe rộng hơn
      const maxGap = player.w * 3.5;
      const gapW = minGap + Math.random() * (maxGap - minGap);
      const gapX = Math.random() * (WIDTH - gapW);
      obstacles.push({ type: 'wall', x: 0, y: -30, w: WIDTH, h: 30, gapX, gapW });
      blockedZones.push({ top: -30, bottom: 140 });
      break;
    } else if (type === 'windmill') {
      if (Math.random() < 0.5) {
        // 1 cối to
        const radius = 80 + Math.random() * 40;
        const x = radius + Math.random() * (WIDTH - radius*2);
        const y = -radius - 10;
        obstacles.push({ type: 'windmill', x, y, r: radius, blades: 4, angle: 0, spin: 0.05 });
        blockedZones.push({ top: y-20, bottom: y+radius*2+80 });
        break;
      } else {
        // đôi cối xoay song song
        const r = 50 + Math.random()*20;
        const gapW = player.w * 3 + 30;
        const leftX = r + 20;
        const rightX = WIDTH - r - 20;
        const y = -r - 10;
        obstacles.push({ type: 'windmillPair', 
          left: {x:leftX,y,r}, right:{x:rightX,y,r}, 
          angle:0, spin:0.05 
        });
        blockedZones.push({ top: y-20, bottom: y+r*2+80 });
        break;
      }
    }
  }
}


  // Check whether adding these new rectangles (newRects: [{x,w},...]) would cover all horizontal space leaving no gap >= minGap
  function wouldBlockAllPaths(newRects){
    // build current top-level occupation by obstacles that are near top (y < 120)
    const activeRects = [];
    obstacles.forEach(o => {
      if (o.y < 120) {
        if (o.type === 'static' || o.type === 'moving') activeRects.push({x:o.x, w:o.w});
        else if (o.type === 'wall') { activeRects.push({x:0,w:WIDTH}); }
        else if (o.type === 'windmill') activeRects.push({x:o.x - o.r, w: o.r*2});
        else if (o.type === 'windmillPair') {
          activeRects.push({x:o.left.x - o.left.r, w:o.left.r*2});
          activeRects.push({x:o.right.x - o.right.r, w:o.right.r*2});
        }
      }
    });
    // include newRects
    newRects.forEach(nr => activeRects.push({x: nr.x, w: nr.w}));

    // merge intervals
    const intervals = activeRects.map(r => [r.x, r.x + r.w]).sort((a,b)=>a[0]-b[0]);
    const merged = [];
    intervals.forEach(I=>{
      if (!merged.length || I[0] > merged[merged.length-1][1]) merged.push(I.slice());
      else merged[merged.length-1][1] = Math.max(merged[merged.length-1][1], I[1]);
    });

    // find max gap between merged intervals across [0,WIDTH]
    let prevEnd = 0;
    let maxGap = 0;
    merged.forEach(m=>{
      const gap = m[0] - prevEnd;
      if (gap > maxGap) maxGap = gap;
      prevEnd = m[1];
    });
    // tail gap
    if (WIDTH - prevEnd > maxGap) maxGap = WIDTH - prevEnd;

    const minGap = player.w * 2.5; // required passable gap
    return maxGap < minGap;
  }

  // update & draw obstacles
  function updateObstacles(){
    for (let i = obstacles.length-1; i>=0; i--) {
      const o = obstacles[i];
      if (o.type === 'static') {
        o.y += obstacleSpeed;
      } else if (o.type === 'moving') {
        o.y += obstacleSpeed;
        o.x += o.dir * o.speedX;
        // bounce horizontally
        if (o.x <= 0) { o.x = 0; o.dir = 1; }
        if (o.x + o.w >= WIDTH) { o.x = WIDTH - o.w; o.dir = -1; }
      } else if (o.type === 'wall') {
        o.y += obstacleSpeed;
      } else if (o.type === 'windmill') {
        o.y += obstacleSpeed;
        o.angle += o.spin;
      } else if (o.type === 'windmillPair') {
        o.left.y += obstacleSpeed;
        o.right.y += obstacleSpeed;
        o.angle += o.spin;
        // update their y stored at parent
        o.y = o.left.y;
      }

      // remove if off screen
      if ( (o.type==='windmill' && o.y - o.r > HEIGHT) ||
           (o.type==='windmillPair' && o.left.y - o.left.r > HEIGHT) ||
           (o.y > HEIGHT + 100) ) {
        obstacles.splice(i,1);
      }
    }

    // prune blockedZones (if their bottom has passed top of screen)
    blockedZones = blockedZones.filter(z => z.bottom > -200);
  }

  // collision checks for special types
  function checkCollisions(){
    const playerRect = { x: player.x, y: player.y, w: player.w, h: player.h };

    for (const o of obstacles) {
      if (o.type === 'static' || o.type === 'moving') {
        if (rectsOverlap(playerRect, o)) return true;
      } else if (o.type === 'wall') {
        // if player's vertical overlaps wall and player not inside gap
        if (playerRect.y < o.y + o.h && playerRect.y + playerRect.h > o.y) {
          if (!(playerRect.x > o.gapX && playerRect.x + playerRect.w < o.gapX + o.gapW)) return true;
        }
      } else if (o.type === 'windmill') {
        // approximate: if player's center is within radius + player diag/2, and also within vertical band
        const cx = player.x + player.w/2;
        const cy = player.y + player.h/2;
        const dx = cx - o.x;
        const dy = cy - (o.y + o.r); // note: o.y refers to top? we set o.y as top-of-circle? earlier we used y as top; we used y as center? ensure consistent
        // In spawning we set y = -radius - 10 (top). For easier compute, treat centerY = o.y + o.r.
        const centerY = o.y + o.r;
        const dist = Math.hypot(cx - o.x, cy - centerY);
        if (dist < o.r + Math.max(player.w, player.h)/2 - 6) return true;
      } else if (o.type === 'windmillPair') {
        const cx = player.x + player.w/2;
        const cy = player.y + player.h/2;
        const leftCenter = { x: o.left.x, y: o.left.y + o.left.r };
        const rightCenter = { x: o.right.x, y: o.right.y + o.right.r };
        if (Math.hypot(cx - leftCenter.x, cy - leftCenter.y) < o.left.r + player.w/2 - 6) return true;
        if (Math.hypot(cx - rightCenter.x, cy - rightCenter.y) < o.right.r + player.w/2 - 6) return true;
      }
    }
    return false;
  }

  // draw everything
  function draw(){
    // background
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,WIDTH,HEIGHT);

    // draw obstacles
    for (const o of obstacles) {
      if (o.type === 'static') {
        ctx.fillStyle = '#ff6347'; // tomato
        ctx.fillRect(o.x, o.y, o.w, o.h);
      } else if (o.type === 'moving') {
        ctx.fillStyle = '#ff8c42';
        ctx.fillRect(o.x, o.y, o.w, o.h);
      } else if (o.type === 'wall') {
        ctx.fillStyle = '#b22222';
        // left
        ctx.fillRect(o.x, o.y, o.gapX, o.h);
        // right
        ctx.fillRect(o.gapX + o.gapW, o.y, WIDTH - (o.gapX + o.gapW), o.h);
      } else if (o.type === 'windmill') {
        // draw circle base
        const cx = o.x;
        const cy = o.y + o.r;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(o.angle);
        ctx.fillStyle = '#cc3333';
        // draw blades as rectangles
        const bladeW = o.r;
        const bladeH = Math.max(10, Math.floor(o.r * 0.18));
        for (let i=0;i<o.blades;i++){
          ctx.fillRect(0, -bladeH/2 - 5, bladeW, bladeH);
          ctx.rotate(Math.PI * 2 / o.blades);
        }
        // hub
        ctx.fillStyle = '#2b2b2b';
        ctx.beginPath();
        ctx.arc(0,0,Math.max(8, o.r*0.12),0,Math.PI*2);
        ctx.fill();
        ctx.restore();
      } else if (o.type === 'windmillPair') {
        // left
        const leftC = { x: o.left.x, y: o.left.y + o.left.r };
        ctx.save();
        ctx.translate(leftC.x, leftC.y);
        ctx.rotate(o.angle);
        ctx.fillStyle = '#cc3333';
        for (let i=0;i<4;i++){ ctx.fillRect(0, -o.left.r*0.09, o.left.r, o.left.r*0.18); ctx.rotate(Math.PI/2); }
        ctx.restore();
        // right
        const rightC = { x: o.right.x, y: o.right.y + o.right.r };
        ctx.save();
        ctx.translate(rightC.x, rightC.y);
        ctx.rotate(-o.angle);
        ctx.fillStyle = '#cc3333';
        for (let i=0;i<4;i++){ ctx.fillRect(0, -o.right.r*0.09, o.right.r, o.right.r*0.18); ctx.rotate(Math.PI/2); }
        ctx.restore();
      }
    }

    // draw player
    ctx.fillStyle = '#7ec8ff';
    ctx.fillRect(player.x, player.y, player.w, player.h);

    // HUD score in canvas top-left small
    ctx.fillStyle = '#fff';
    ctx.font = '18px Arial';
    ctx.fillText(`Score: ${score}`, 10, 22);
  }

  // game loop
  function loop(){
    if (gameOver) {
      draw();
      drawGameOver();
      return;
    }
    if (youWin) {
      draw();
      drawYouWin();
      return;
    }

    // movement
    if (left) player.x -= player.speed;
    if (right) player.x += player.speed;
    player.x = clamp(player.x, 0, WIDTH - player.w);

    // spawn timer
    const now = Date.now();
    const difficulty = Math.floor(score / 30);
    const spawnRateNow = Math.max(spawnRateBase - difficulty * 80, 700);
    if (now - lastSpawn > spawnRateNow) {
      spawnObstacle();
      lastSpawn = now;
    }

    // update obstacles
    updateObstacles();

    // update seconds for score
    if (now - lastSecondTick > 1000) {
      lastSecondTick = now;
      if (!gameOver && !youWin) {
        score++;
        if (score >= maxScore) {
          youWin = true;
        }
        scoreDisplay && (scoreDisplay.textContent = `Score: ${score}`);
        if (score > highScore) {
          highScore = score;
          localStorage.setItem(highKey, String(highScore));
          highDisplay && (highDisplay.textContent = `High: ${highScore}`);
        }
      }
    }

    // collisions
    if (checkCollisions()) {
      gameOver = true;
      // update highscore
      if (score > highScore) {
        highScore = score;
        localStorage.setItem(highKey, String(highScore));
        highDisplay && (highDisplay.textContent = `High: ${highScore}`);
      }
    }

    // draw
    draw();

    requestAnimationFrame(loop);
  }

  // draw Game Over / You Win overlays
  function drawGameOver(){
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0,0,WIDTH,HEIGHT);
    ctx.fillStyle = '#fff';
    ctx.font = '28px Arial';
    ctx.fillText('GAME OVER', WIDTH/2 - 80, HEIGHT/2 - 20);
    ctx.font = '18px Arial';
    ctx.fillText(`Score: ${score}`, WIDTH/2 - 40, HEIGHT/2 + 10);
    ctx.fillText('Press SPACE to Restart', WIDTH/2 - 110, HEIGHT/2 + 40);
  }

  function drawYouWin(){
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0,0,WIDTH,HEIGHT);
    ctx.fillStyle = '#fff';
    ctx.font = '26px Arial';
    ctx.fillText('YOU WIN!', WIDTH/2 - 70, HEIGHT/2 - 10);
    ctx.font = '18px Arial';
    ctx.fillText(`Score: ${score}`, WIDTH/2 - 40, HEIGHT/2 + 20);
    ctx.fillText('Press SPACE to Play Again', WIDTH/2 - 120, HEIGHT/2 + 50);
  }

  // keyboard
  window.addEventListener('keydown', e => {
    if (e.code === 'ArrowLeft') left = true;
    if (e.code === 'ArrowRight') right = true;
    if ((e.code === 'Space') && (gameOver || youWin)) restart();
  });
  window.addEventListener('keyup', e => {
    if (e.code === 'ArrowLeft') left = false;
    if (e.code === 'ArrowRight') right = false;
  });

  // back button -> go to index
  if (backBtn) backBtn.addEventListener('click', ()=>{ location.href = './index.html'; });

  // restart
  function restart(){
    obstacles = [];
    blockedZones = [];
    obstacleSpeed = 2;
    lastSpawn = Date.now();
    lastSecondTick = Date.now();
    score = 0;
    gameOver = false;
    youWin = false;
    player.x = 20;
    player.y = HEIGHT - 10 - player.h;
    scoreDisplay && (scoreDisplay.textContent = `Score: ${score}`);
    requestAnimationFrame(loop);
  }

  // initial start
  // ensure HUD values set
  scoreDisplay && (scoreDisplay.textContent = `Score: ${score}`);
  highDisplay && (highDisplay.textContent = `High: ${highScore}`);

  // start the loop on page load
  requestAnimationFrame(loop);

})();
