// 别踩白块：画面。
//   棋盘按「行」计位置：第 i 行（从 0 开始）在屏幕上的格位 slot = i - pos + 1（0 是最底下那一行）。
//   第 -1 行是起点那一条浅灰底座，经典模式第 count 行起是绿色终点。
//   黑块、按下去的灰块、红块都先画到离屏 canvas 上当贴图，每帧只贴图，60fps 很稳。

const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const clamp01 = (k) => Math.max(0, Math.min(1, k));

function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** 一块「键」：底座（厚度）+ 面 + 高光 + 投影 */
function drawKey(c, w, h, pad, look) {
  const g = Math.max(1.5, Math.round(w * 0.022));          // 和格子边的空隙
  const r = Math.min(10, w * 0.085);
  const x = pad + g, y = pad + g, kw = w - g * 2, kh = h - g * 2;
  const depth = look.depth;
  const press = look.press || 0;                            // 面往下沉多少

  // 投影
  if (look.shadow) {
    c.save();
    c.shadowColor = look.shadow;
    c.shadowBlur = 14;
    c.shadowOffsetY = 6;
    rr(c, x, y, kw, kh, r);
    c.fillStyle = look.base;
    c.fill();
    c.restore();
  }
  // 底座（露出来的那一截就是厚度）
  rr(c, x, y, kw, kh, r);
  const bg = c.createLinearGradient(0, y + kh - depth - 4, 0, y + kh);
  bg.addColorStop(0, look.base);
  bg.addColorStop(1, look.base2 || look.base);
  c.fillStyle = bg;
  c.fill();

  // 面
  const fy = y + press, fh = kh - depth - press;
  rr(c, x, fy, kw, fh, r);
  const fg = c.createLinearGradient(0, fy, 0, fy + fh);
  look.face.forEach(([o, col]) => fg.addColorStop(o, col));
  c.fillStyle = fg;
  c.fill();

  c.save();
  rr(c, x, fy, kw, fh, r);
  c.clip();
  // 上半截的光泽
  if (look.gloss) {
    const gl = c.createLinearGradient(0, fy, 0, fy + fh * 0.5);
    gl.addColorStop(0, `rgba(255,255,255,${look.gloss})`);
    gl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gl;
    c.fillRect(x, fy, kw, fh * 0.5);
    // 斜着的一道反光
    c.globalAlpha = look.gloss * 0.4;
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(x + kw * 0.58, fy);
    c.lineTo(x + kw * 0.8, fy);
    c.lineTo(x + kw * 0.36, fy + fh);
    c.lineTo(x + kw * 0.14, fy + fh);
    c.closePath();
    c.fill();
    c.globalAlpha = 1;
  }
  // 按下去的：顶上一圈内阴影
  if (look.inner) {
    const ig = c.createLinearGradient(0, fy, 0, fy + 14);
    ig.addColorStop(0, look.inner);
    ig.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = ig;
    c.fillRect(x, fy, kw, 14);
  }
  c.restore();

  // 面的上边一道细高光
  if (look.rim) {
    c.save();
    rr(c, x + 0.5, fy + 0.5, kw - 1, fh - 1, r);
    c.strokeStyle = look.rim;
    c.lineWidth = 1;
    c.stroke();
    c.restore();
  }
}

const LOOKS = {
  black: {
    face: [[0, '#41454d'], [0.18, '#2a2d33'], [0.62, '#17191d'], [1, '#0e0f12']],
    base: '#050506', base2: '#000', depth: 7, gloss: 0.16, rim: 'rgba(255,255,255,.13)', shadow: 'rgba(16,18,24,.32)',
  },
  gray: {
    face: [[0, '#e6e9ed'], [1, '#d9dde2']],
    base: '#c3c8cf', depth: 2, press: 4, inner: 'rgba(30,35,45,.10)', rim: 'rgba(255,255,255,.55)',
  },
  red: {
    face: [[0, '#ff7d70'], [0.2, '#ff4d3f'], [0.7, '#ec3326'], [1, '#d8261b']],
    base: '#9e140c', base2: '#7d0e07', depth: 7, gloss: 0.2, rim: 'rgba(255,255,255,.22)', shadow: 'rgba(200,30,20,.35)',
  },
};

export class Painter {
  constructor(canvas) {
    this.cv = canvas;
    this.c = canvas.getContext('2d');
    this.sprites = {};
    this.pad = 22;
  }

  layout(W, H, bottom, cols, rows) {
    Object.assign(this, { W, H, cols, rows });
    this.fb = Math.round(H - bottom);           // 棋盘底边（下面是底座，给大厅的横条留地方）
    this.colW = W / cols;
    this.rowH = this.fb / rows;
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.cv.width = Math.round(W * this.dpr);
    this.cv.height = Math.round(H * this.dpr);
    this.build();
  }

  build() {
    const { colW: w, rowH: h, pad, dpr } = this;
    for (const k of Object.keys(LOOKS)) {
      const cv = document.createElement('canvas');
      cv.width = Math.ceil((w + pad * 2) * dpr);
      cv.height = Math.ceil((h + pad * 2) * dpr);
      const c = cv.getContext('2d');
      c.scale(dpr, dpr);
      const look = { ...LOOKS[k], depth: Math.max(LOOKS[k].depth - 2, Math.round(LOOKS[k].depth * Math.min(1.15, h / 190))) };
      drawKey(c, w, h, pad, look);
      this.sprites[k] = cv;
    }
  }

  /** 第 i 行的上边 y（pos 是当前视图位置） */
  rowTop(i, pos) { return this.fb - (i - pos + 2) * this.rowH; }

  /** 某一块在屏幕上的位置（给提示气泡用） */
  tileRect(i, col, pos) {
    return { x: col * this.colW, y: this.rowTop(i, pos), w: this.colW, h: this.rowH };
  }

  key(name, x, y, alpha = 1, dy = 0, scale = 1) {
    const s = this.sprites[name], c = this.c, p = this.pad;
    const w = this.colW + p * 2, h = this.rowH + p * 2;
    c.globalAlpha = alpha;
    if (scale !== 1) {
      const cx = x + this.colW / 2, cy = y + this.rowH / 2;
      c.drawImage(s, cx - (w * scale) / 2, cy - (h * scale) / 2 + dy, w * scale, h * scale);
    } else {
      c.drawImage(s, x - p, y - p + dy, w, h);
    }
    c.globalAlpha = 1;
  }

  /**
   * s: { board, pos, now, shake, label: { row, text, pulse }, fail: { row, col, kind, t }, baseText, ripples }
   */
  draw(s) {
    const { c, W, H, fb, colW, rowH, dpr, cols } = this;
    const { board, pos, now } = s;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, W, H);

    // ---------- 底座（给大厅横条留的那一截） ----------
    const ft = c.createLinearGradient(0, fb, 0, H);
    ft.addColorStop(0, '#e9ebef');
    ft.addColorStop(1, '#dfe2e7');
    c.fillStyle = ft;
    c.fillRect(0, fb, W, H - fb);

    c.save();
    c.translate(s.shake || 0, 0);
    c.beginPath();
    c.rect(-20, 0, W + 40, fb);
    c.clip();

    // ---------- 白底 + 竖线 ----------
    c.fillStyle = '#fbfbfc';
    c.fillRect(-20, 0, W + 40, fb);
    c.fillStyle = '#e4e6ea';
    for (let k = 1; k < cols; k++) c.fillRect(Math.round(k * colW) - 0.5, 0, 1, fb);

    const lo = Math.floor(pos) - 2, hi = Math.ceil(pos) + this.rows + 1;

    // ---------- 横线、起点底座、终点 ----------
    for (let i = lo; i <= hi; i++) {
      const y = this.rowTop(i, pos);
      if (y > fb || y + rowH < 0) continue;
      if (i < 0) {
        const g = c.createLinearGradient(0, y, 0, y + rowH);
        g.addColorStop(0, '#f2f4f7');
        g.addColorStop(1, '#e8ebef');
        c.fillStyle = g;
        c.fillRect(-20, y, W + 40, rowH + 1);
        if (i === -1) {
          c.fillStyle = '#d9dde3';
          c.fillRect(-20, y, W + 40, 1);
          if (s.baseText) {
            c.fillStyle = '#a3a8b1';
            c.font = '800 15px -apple-system, "PingFang SC", sans-serif';
            c.textAlign = 'center';
            c.textBaseline = 'middle';
            c.fillText(s.baseText, W / 2, y + Math.min(rowH / 2, 44));
          }
        }
      } else if (board.isFinish(i)) {
        continue;
      } else {
        c.fillStyle = '#e9ebee';
        c.fillRect(-20, Math.round(y + rowH) - 0.5, W + 40, 1);
      }
    }

    // ---------- 终点：整片绿色（一个渐变铺到底，行和行之间没有接缝）+ 一道格子终点线 ----------
    if (Number.isFinite(board.finishAt)) {
      const yb = this.rowTop(board.finishAt, pos) + rowH;
      if (yb > 0) {
        const g = c.createLinearGradient(0, Math.min(0, yb - fb), 0, yb);
        g.addColorStop(0, '#41d887');
        g.addColorStop(1, '#22b863');
        c.fillStyle = g;
        c.fillRect(-20, 0, W + 40, yb);
        // 斜着的几道淡淡的光
        c.save();
        c.globalAlpha = 0.07;
        c.fillStyle = '#fff';
        for (let k = -1; k < 4; k++) {
          const x0 = k * W * 0.42 + ((yb * 0.35) % (W * 0.42));
          c.beginPath();
          c.moveTo(x0, 0); c.lineTo(x0 + W * 0.16, 0); c.lineTo(x0 + W * 0.16 - yb * 0.5, yb); c.lineTo(x0 - yb * 0.5, yb);
          c.closePath(); c.fill();
        }
        c.restore();
        this.checker(yb - 16, 16);
      }
    }

    // ---------- 块（从上往下画，下面的块盖住上面块的投影） ----------
    for (let i = hi; i >= Math.max(0, lo); i--) {
      if (board.isFinish(i)) continue;
      const y = this.rowTop(i, pos);
      if (y > fb + 10 || y + rowH < -10) continue;
      const r = board.row(i);
      const x = r.col * colW;
      const f = s.fail;

      if (f && f.row === i && f.kind === 'white') {
        // 踩错的白块：变红闪几下；黑块照常画
        this.tile(r, x, y, now, s);
        const t = now - f.t;
        const on = t > 0.9 || Math.floor(t * 8) % 2 === 0;
        if (on) this.key('red', f.col * colW, y, 1, 0, 1 + 0.05 * Math.max(0, 1 - t * 5));
        continue;
      }
      if (f && f.row === i && f.kind === 'miss') {
        const t = now - f.t;
        const on = t > 1.0 || Math.floor(t * 7) % 2 === 1;
        this.key(on ? 'red' : 'black', x, y);
        continue;
      }
      this.tile(r, x, y, now, s, s.label && s.label.row === i ? s.label : null);
    }

    // ---------- 按下去的涟漪 ----------
    for (let i = hi; i >= Math.max(0, lo); i--) {
      if (board.isFinish(i)) continue;
      const r = board.row(i);
      if (r.state !== 1) continue;
      const t = now - r.t;
      if (t < 0 || t > 0.42) continue;
      const y = this.rowTop(i, pos), x = r.col * colW;
      const e = easeOut(clamp01(t / 0.42));
      const g = Math.max(1.5, Math.round(colW * 0.022));
      c.save();
      rr(c, x + g, y + g, colW - g * 2, rowH - g * 2, Math.min(10, colW * 0.085));
      c.clip();
      const cx = x + r.rx, cy = y + r.ry;
      const rad = 12 + Math.hypot(colW, rowH) * 0.95 * e;
      const rg = c.createRadialGradient(cx, cy, rad * 0.55, cx, cy, rad);
      rg.addColorStop(0, 'rgba(40,44,52,0)');
      rg.addColorStop(0.8, `rgba(40,44,52,${0.16 * (1 - e)})`);
      rg.addColorStop(1, 'rgba(40,44,52,0)');
      c.fillStyle = rg;
      c.fillRect(x, y, colW, rowH);
      c.restore();
    }

    c.restore();

    // 底座上沿：一道阴影 + 一道高光，像琴键盖
    const sh = c.createLinearGradient(0, fb, 0, fb + 8);
    sh.addColorStop(0, 'rgba(20,24,32,.16)');
    sh.addColorStop(1, 'rgba(20,24,32,0)');
    c.fillStyle = sh;
    c.fillRect(0, fb, W, 8);
    c.fillStyle = '#cfd3da';
    c.fillRect(0, fb, W, 1);
  }

  /** 一块黑块：没踩 / 正在按下去 / 已经踩过（灰） */
  tile(r, x, y, now, s, label) {
    if (r.state === 1) {
      const k = clamp01((now - r.t) / 0.13);
      const e = easeOut(k);
      if (k < 1) this.key('black', x, y, 1 - e, e * 5, 1 - 0.03 * Math.sin(k * Math.PI));
      this.key('gray', x, y, e);
      return;
    }
    let scale = 1;
    if (label && label.pulse) scale = 1 + 0.025 * (0.5 + 0.5 * Math.sin(now * 5));
    this.key('black', x, y, 1, 0, scale);
    if (label) {
      const c = this.c;
      c.fillStyle = '#fff';
      c.font = `900 ${Math.round(Math.min(24, this.colW * 0.24))}px -apple-system, "PingFang SC", sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.globalAlpha = 0.96;
      c.fillText(label.text, x + this.colW / 2, y + (this.rowH - 7) / 2);
      c.globalAlpha = 1;
    }
  }

  /** 终点线：两排绿白格子 */
  checker(y, h) {
    const c = this.c, n = Math.max(8, Math.round(this.W / 14)), w = this.W / n, hh = h / 2;
    for (let k = 0; k < n; k++) {
      for (let j = 0; j < 2; j++) {
        c.fillStyle = (k + j) % 2 ? 'rgba(255,255,255,.92)' : 'rgba(10,90,45,.28)';
        c.fillRect(k * w, y + j * hh, w + 0.5, hh + 0.5);
      }
    }
  }
}
