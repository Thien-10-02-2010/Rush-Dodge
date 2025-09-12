const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

// 👾 Người chơi
let player = { x: 180, y: 550, w: 40, h: 40, speed: 7 };
let leftPressed = false;
let rightPressed = false;

// 🚧 Chướng ngại vật
let obstacles = [];
let obstacleSpeed = 2;
let spawnRate = 1500; // ms
let lastSpawn = Date.now();

// 📊 Điểm số
let score = 0;
let gameOver = false;

// ⌨️ Điều khiển bàn phím
document.addEventListener("keydown", e => {
    if (e.code === "ArrowLeft") leftPressed = true;
    if (e.code === "ArrowRight") rightPressed = true;

    if (gameOver && e.code === "Space") {
        restartGame();
    }
});
document.addEventListener("keyup", e => {
    if (e.code === "ArrowLeft") leftPressed = false;
    if (e.code === "ArrowRight") rightPressed = false;
});

// 🚧 Hàm tạo chướng ngại vật
function spawnObstacle() {
    let type = Math.random();

    if (type < 0.4) {
        // 🟥 Block dài
        let w = 120 + Math.random() * 100; // 120 - 220 px
        let x = Math.random() * (canvas.width - w);
        obstacles.push({ x: x, y: -30, w: w, h: 20, type: "static" });

    } else if (type < 0.7) {
        // ⬛ Block vừa
        let w = 80, h = 20;
        let x = Math.random() * (canvas.width - w);
        obstacles.push({ x: x, y: -h, w: w, h: h, type: "static" });

    } else if (type < 0.9) {
        // 🔲 Block di chuyển qua lại
        let w = 100, h = 20;
        let x = Math.random() * (canvas.width - w);
        let dir = Math.random() < 0.5 ? 1 : -1;
        obstacles.push({ x: x, y: -h, w: w, h: h, type: "moving", dir: dir, speedX: 2 });

    } else {
    // 🧱 Tường chắn toàn khung, chừa khe hẹp
    let minGap = player.w * 2.5;  // khe ít nhất = 2.5 lần chiều rộng nhân vật
    let maxGap = player.w * 3.5;  // khe nhiều nhất = 3.5 lần nhân vật
    let gapWidth = minGap + Math.random() * (maxGap - minGap); 
    let gapX = Math.random() * (canvas.width - gapWidth);

    obstacles.push({
        x: 0, 
        y: -20, 
        w: canvas.width, 
        h: 20, 
        type: "wall", 
        gapX: gapX, 
        gapW: gapWidth
    });
}
}

// ⏱️ Cộng điểm mỗi giây
setInterval(() => {
    if (!gameOver) score++;
}, 1000);

// 🔍 Hàm check collision
function checkCollision(a, b) {
    return (
        a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y
    );
}

// 🎮 Vòng lặp game
function update() {
    if (gameOver) {
        drawGameOver();
        return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ⌨️ Di chuyển nhân vật
    if (leftPressed && player.x > 0) player.x -= player.speed;
    if (rightPressed && player.x < canvas.width - player.w) player.x += player.speed;

    // Vẽ nhân vật
    ctx.fillStyle = "skyblue";
    ctx.fillRect(player.x, player.y, player.w, player.h);

    // ⏱️ Spawn obstacle
    if (Date.now() - lastSpawn > spawnRate) {
        spawnObstacle();
        lastSpawn = Date.now();
    }

    // Vẽ & cập nhật obstacle
    for (let o of obstacles) {
        o.y += obstacleSpeed;

        if (o.type === "static") {
            ctx.fillStyle = "tomato";
            ctx.fillRect(o.x, o.y, o.w, o.h);
            if (checkCollision(player, o)) gameOver = true;

        } else if (o.type === "moving") {
            o.x += o.dir * o.speedX;
            if (o.x <= 0 || o.x + o.w >= canvas.width) o.dir *= -1;

            ctx.fillStyle = "orange";
            ctx.fillRect(o.x, o.y, o.w, o.h);
            if (checkCollision(player, o)) gameOver = true;

        } else if (o.type === "wall") {
            ctx.fillStyle = "red";
            ctx.fillRect(o.x, o.y, o.gapX, o.h); // trái khe
            ctx.fillRect(o.gapX + o.gapW, o.y, canvas.width - (o.gapX + o.gapW), o.h); // phải khe

            // Va chạm: nếu player không lọt khe
            if (!(player.x > o.gapX && player.x + player.w < o.gapX + o.gapW)) {
                if (player.y < o.y + o.h && player.y + player.h > o.y) {
                    gameOver = true;
                }
            }
        }
    }

    // Xóa obstacle ra ngoài màn
    obstacles = obstacles.filter(o => o.y < canvas.height);

    // Điểm
    ctx.fillStyle = "white";
    ctx.font = "20px Arial";
    ctx.fillText("Score: " + score, 10, 30);

    // 🎮 Tăng độ khó từ từ
    let difficulty = Math.floor(score / 30); // mỗi 30 giây tăng một bậc
    obstacleSpeed = 2 + difficulty * 0.3;
    player.speed = 7 + difficulty * 0.2;
    spawnRate = Math.max(1500 - difficulty * 100, 700);

    requestAnimationFrame(update);
}

// 🛑 Game Over
function drawGameOver() {
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "white";
    ctx.font = "28px Arial";
    ctx.fillText("GAME OVER", canvas.width / 2 - 80, canvas.height / 2 - 40);

    ctx.font = "20px Arial";
    ctx.fillText("Score: " + score, canvas.width / 2 - 40, canvas.height / 2);
    ctx.fillText("Press SPACE to Restart", canvas.width / 2 - 110, canvas.height / 2 + 40);
}

// 🔄 Restart
function restartGame() {
    player.x = 180;
    obstacles = [];
    obstacleSpeed = 2;
    spawnRate = 1500;
    score = 0;
    lastSpawn = Date.now();
    gameOver = false;
    update();
}

// 🚀 Start game
update();
