// 手指划过的白色刀光：盖在 3D 画面上面的一层 canvas
export class Trail {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.pts = []; // {x, y, t}
  }

  resize(w, h, dpr) {
    this.cv.width = Math.round(w * dpr);
    this.cv.height = Math.round(h * dpr);
    this.cv.style.width = `${w}px`;
    this.cv.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w; this.h = h;
  }

  add(x, y) {
    this.pts.push({ x, y, t: performance.now() });
  }

  end() { /* 点会自己淡出 */ }

  clear() { this.pts.length = 0; this.ctx.clearRect(0, 0, this.w, this.h); }

  draw(now) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    // 只保留 260ms 内的点
    while (this.pts.length && now - this.pts[0].t > 260) this.pts.shift();
    if (this.pts.length < 2) return;

    // 画一条从头到尾变宽变透明的带子
    for (let i = 1; i < this.pts.length; i++) {
      const a = this.pts[i - 1], b = this.pts[i];
      const age = (now - b.t) / 260;              // 0 新 → 1 旧
      const k = i / this.pts.length;              // 0 尾 → 1 头
      const w = 2 + k * 10;                       // 越靠近手指越宽
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineCap = 'round';
      ctx.lineWidth = w * (1 - age);
      ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - age) * (0.35 + 0.65 * k)})`;
      ctx.stroke();
    }
  }
}
