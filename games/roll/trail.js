// 手指划过的白色刀光：盖在 3D 画面上面的一层 2D canvas，只画最近 150 毫秒的轨迹，
// 头粗尾细，白芯 + 一圈蓝光，在白色轨道和蓝天上都看得清。

export class Trail {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.ptrs = new Map();
    this.enabled = true;
    this.dirty = false;
    this.life = 150;
    this.resize();
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.h * this.dpr);
  }

  down(id, x, y) {
    if (!this.enabled) return;
    this.ptrs.set(id, { pts: [{ x, y, t: performance.now() }] });
  }

  move(id, x, y) {
    const p = this.ptrs.get(id);
    if (!p) return;
    const last = p.pts[p.pts.length - 1];
    if (!last) { p.pts.push({ x, y, t: performance.now() }); return; }
    if (Math.hypot(x - last.x, y - last.y) < 2) return;
    // 手指移动得快、事件少的时候补几个点，线条更圆滑
    const n = Math.min(6, Math.floor(Math.hypot(x - last.x, y - last.y) / 14));
    const now = performance.now();
    for (let i = 1; i <= n; i++) {
      const k = i / (n + 1);
      p.pts.push({ x: last.x + (x - last.x) * k, y: last.y + (y - last.y) * k, t: last.t + (now - last.t) * k });
    }
    p.pts.push({ x, y, t: now });
  }

  up(id) {
    const p = this.ptrs.get(id);
    if (p) p.up = true;
  }

  clear() {
    this.ptrs.clear();
    this.draw();
  }

  draw() {
    const { ctx, dpr } = this;
    const now = performance.now();
    const LIFE = this.life;
    let any = false;
    for (const [id, p] of this.ptrs) {
      const keep = p.pts.filter((q) => now - q.t < LIFE);
      p.pts = keep.length || p.up ? keep : p.pts.slice(-1);   // 手指按着不动：留最后一个点接着画
      if (!p.pts.length) this.ptrs.delete(id);
      if (p.pts.length > 1) any = true;
    }
    if (!any && !this.dirty) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    this.dirty = any;
    if (!any) return;
    for (const p of this.ptrs.values()) {
      const pts = p.pts;
      const n = pts.length;
      if (n < 2) continue;
      const W = 8;                                   // 刀光最粗处的半宽（像素）
      const nx = [], ny = [], ws = [];
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        let dx = b.x - a.x, dy = b.y - a.y;
        const L = Math.hypot(dx, dy) || 1;
        nx.push(-dy / L); ny.push(dx / L);
        const age = Math.min(1, (now - pts[i].t) / LIFE);
        ws.push(W * Math.pow(i / (n - 1), 0.75) * (1 - age * 0.45));
      }
      const head = pts[n - 1];
      // 同一条刀光画三遍：外圈蓝光 → 蓝色描边 → 白芯
      const shape = (mul, add) => {
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const w = ws[i] * mul + (ws[i] > 0.3 ? add : 0);
          i ? ctx.lineTo(pts[i].x + nx[i] * w, pts[i].y + ny[i] * w) : ctx.moveTo(pts[i].x + nx[i] * w, pts[i].y + ny[i] * w);
        }
        for (let i = n - 1; i >= 0; i--) {
          const w = ws[i] * mul + (ws[i] > 0.3 ? add : 0);
          ctx.lineTo(pts[i].x - nx[i] * w, pts[i].y - ny[i] * w);
        }
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.arc(head.x, head.y, ws[n - 1] * mul + add, 0, Math.PI * 2);
        ctx.fill();
      };
      ctx.save();
      ctx.shadowColor = 'rgba(0,110,255,.9)';
      ctx.shadowBlur = 18;
      ctx.fillStyle = 'rgba(90,170,255,.35)';
      shape(2, 2);
      ctx.restore();
      ctx.fillStyle = 'rgba(22,96,235,.85)';
      shape(1, 1.8);
      ctx.fillStyle = '#ffffff';
      shape(1, 0);
    }
  }
}
