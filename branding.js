document.addEventListener("DOMContentLoaded", () => {
  const header = document.querySelector("header");
  if (header) {
    header.innerHTML = `
      <img src="logo.png" alt="Logo Obstacle Dash" style="width:120px;height:120px;border-radius:16px;">
      <h1 style="margin-top:12px; font-size:2.2em;">Obstacle Dash</h1>
      <p style="color:#ddd; max-width:720px; margin:6px auto;">
        Điều khiển nhân vật, né chướng ngại vật rơi — ghi điểm theo thời gian.
      </p>
      <div style="margin-top:18px;">
        <a href="play.html"
           style="display:inline-block;padding:14px 26px;background:#00bfff;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
           ▶ Chơi Ngay
        </a>
      </div>
    `;
  }
});
