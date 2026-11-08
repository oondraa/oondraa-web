// Hero wordmark as a field of dots. The word is rasterised once, sampled on a grid, and each cell
// with enough ink becomes a dot sized by its coverage. Dots are springs: the pointer pushes them
// away, a click sends a shockwave ring, and displaced dots tint towards the accent colour.
// On first view they fly in from below. Plain 2D canvas, no dependencies.
(function () {
  const root = document.querySelector("[data-halftone]");
  const canvas = root && root.querySelector("canvas");
  const ctx = canvas && canvas.getContext("2d");
  if (!ctx) return;

  const WORD = "oondraa";
  const DOT = ".";
  const INK = [12, 12, 16];
  const ACCENT = [23, 96, 240];
  const REPEL = 80;          // pointer radius, px
  const PUSH = 2.6;          // pointer strength
  const SPRING = 0.05;
  const DAMP = 0.84;
  const TINT_AT = 28;        // px of displacement for full accent
  const WAVE_SPEED = 0.9;    // px per ms
  const WAVE_WIDTH = 26;
  const WAVE_FORCE = 3.2;
  const WAVE_LIFE = 900;     // ms
  const MAX_DOTS = 9000;
  const STRIDE = 10;         // x, y, vx, vy, hx, hy, r, cr, cg, cb

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 1, H = 1, dpr = 1, dots = new Float32Array(0), n = 0;
  let px = -1e5, py = -1e5, wave = { x: 0, y: 0, t: -1 };
  let raf = 0, awake = true, visible = true, flown = false, released = false, built = false;

  const cellFor = (vw) => (vw >= 1024 ? 6 : vw >= 768 ? 5 : 4);

  // Narrow screens split the word in two so it stays big: "oon" / "draa."
  const linesFor = (w) => (w < 600 ? [WORD.slice(0, 3), WORD.slice(3)] : [WORD]);
  const GAP = 0.08; // between lines, in em

  // Fit the lines (with tracking, the last one carrying the dot) to the container width.
  // Returns the scale k from a 100px font, and each line's metrics at 100px.
  function fit(o) {
    o.font = `600 100px ${getComputedStyle(root).fontFamily}`;
    o.letterSpacing = "-0.05em";
    const lines = linesFor(W);
    const ms = lines.map((t, i) => o.measureText(t + (i === lines.length - 1 ? DOT : "")));
    const widest = Math.max(...ms.map((m) => m.actualBoundingBoxLeft + m.actualBoundingBoxRight));
    return { k: W / widest, lines, ms };
  }

  function measureHeight() {
    const { k, ms } = fit(document.createElement("canvas").getContext("2d"));
    const h = ms.reduce((a, m) => a + m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, 0);
    return Math.ceil((h + GAP * 100 * (ms.length - 1)) * k) + 2;
  }

  function rasterise() {
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const o = off.getContext("2d", { willReadFrequently: true });
    const { k, lines, ms } = fit(o);
    o.font = `600 ${100 * k}px ${getComputedStyle(root).fontFamily}`;
    o.textBaseline = "alphabetic";
    let top = 1;
    lines.forEach((t, i) => {
      const m = ms[i], x = m.actualBoundingBoxLeft * k, y = top + m.actualBoundingBoxAscent * k;
      o.fillStyle = `rgb(${INK})`;
      o.fillText(t, x, y);
      if (i === lines.length - 1) {
        o.fillStyle = `rgb(${ACCENT})`;
        o.fillText(DOT, x + o.measureText(t).width, y);
      }
      top = y + m.actualBoundingBoxDescent * k + GAP * 100 * k;
    });
    return o.getImageData(0, 0, W, H).data;
  }

  function build() {
    W = Math.max(1, Math.round(root.getBoundingClientRect().width));
    H = Math.max(1, measureHeight());
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.height = H + "px";
    const px4 = rasterise();
    let cell = cellFor(window.innerWidth), out;
    for (;;) {
      out = [];
      const cols = Math.ceil(W / cell), rows = Math.ceil(H / cell);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let a = 0, sr = 0, sg = 0, sb = 0;
          for (let j = 0; j < 3; j++) {
            for (let i = 0; i < 3; i++) {
              const x = Math.min(W - 1, Math.floor(c * cell + (i + 0.5) * cell / 3));
              const y = Math.min(H - 1, Math.floor(r * cell + (j + 0.5) * cell / 3));
              const p = (y * W + x) * 4, al = px4[p + 3];
              a += al; sr += px4[p] * al; sg += px4[p + 1] * al; sb += px4[p + 2] * al;
            }
          }
          const cover = a / (255 * 9);
          if (cover < 0.2) continue;
          const hx = c * cell + cell / 2, hy = r * cell + cell / 2;
          out.push(hx, hy, 0, 0, hx, hy, Math.sqrt(Math.min(1, cover)) * cell * 0.56 * 0.6, sr / a, sg / a, sb / a);
        }
      }
      if (out.length / STRIDE <= MAX_DOTS || cell > 12) break;
      cell++;
    }
    dots = new Float32Array(out);
    n = dots.length / STRIDE;
    if (!flown && !reduced) scatter();
    built = true;
  }

  // Start each dot below its home, spread out, so the word assembles itself.
  function scatter() {
    for (let i = 0; i < n; i++) {
      const s = i * STRIDE, a = Math.random() * Math.PI * 2;
      const d = 46 * (0.35 + 0.65 * Math.random()) * (0.6 + 0.4 * (dots[s + 4] / W));
      dots[s] = dots[s + 4] + Math.cos(a) * d * 0.5;
      dots[s + 1] = dots[s + 5] + Math.abs(Math.sin(a)) * d + 10;
      dots[s + 2] = dots[s + 3] = 0;
    }
  }

  function draw(now) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const age = wave.t < 0 ? 1e9 : now - wave.t;
    const ring = age * WAVE_SPEED;
    const live = released && !reduced;
    let moving = false;
    for (let i = 0; i < n; i++) {
      const s = i * STRIDE;
      let x = dots[s], y = dots[s + 1], vx = dots[s + 2], vy = dots[s + 3];
      const hx = dots[s + 4], hy = dots[s + 5];
      if (live) {
        if (age < WAVE_LIFE) {
          const dx = hx - wave.x, dy = hy - wave.y, d = Math.sqrt(dx * dx + dy * dy) + 0.001;
          const k = 1 - Math.min(1, Math.abs(d - ring) / WAVE_WIDTH);
          if (k > 0) { const f = k * WAVE_FORCE * (1 - age / WAVE_LIFE); vx += dx / d * f; vy += dy / d * f; }
        }
        const dx = x - px, dy = y - py, d2 = dx * dx + dy * dy;
        if (d2 < REPEL * REPEL) {
          const d = Math.sqrt(d2) + 0.001, f = (1 - d / REPEL) * PUSH;
          vx += dx / d * f; vy += dy / d * f;
        }
        vx = (vx + (hx - x) * SPRING) * DAMP;
        vy = (vy + (hy - y) * SPRING) * DAMP;
        x += vx; y += vy;
        if (Math.abs(vx) + Math.abs(vy) > 0.02 || Math.abs(x - hx) + Math.abs(y - hy) > 0.05) moving = true;
        else { x = hx; y = hy; vx = vy = 0; }
        dots[s] = x; dots[s + 1] = y; dots[s + 2] = vx; dots[s + 3] = vy;
      }
      const t = Math.min(1, Math.hypot(x - hx, y - hy) / TINT_AT);
      const r = dots[s + 7] + (ACCENT[0] - dots[s + 7]) * t;
      const g = dots[s + 8] + (ACCENT[1] - dots[s + 8]) * t;
      const b = dots[s + 9] + (ACCENT[2] - dots[s + 9]) * t;
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      ctx.beginPath();
      ctx.arc(x, y, dots[s + 6], 0, 6.2832);
      ctx.fill();
    }
    // Keep animating while anything moves, a wave is out, or the pointer is over the word.
    awake = live && (moving || age < WAVE_LIFE || px > -1e4);
  }

  function frame(now) {
    raf = 0;
    if (!visible) return;
    draw(now);
    if (awake) raf = requestAnimationFrame(frame);
  }
  function wake() {
    awake = true;
    if (!raf && visible) raf = requestAnimationFrame(frame);
  }

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  root.addEventListener("pointermove", (e) => {
    if (reduced || e.pointerType === "touch") return;
    [px, py] = local(e);
    wake();
  });
  root.addEventListener("pointerleave", () => { px = py = -1e5; wake(); });
  root.addEventListener("pointerdown", (e) => {
    if (reduced) return;
    const [x, y] = local(e);
    wave = { x, y, t: performance.now() };
    wake();
  });

  // The fly-in waits for the page intro (main.js fires "hero:intro"), with a fallback.
  function release() {
    if (released) return;
    released = true;
    flown = true;
    wake();
  }
  window.addEventListener("hero:intro", release, { once: true });
  setTimeout(release, 3200);

  let lastW = 0, pending = 0;
  new ResizeObserver(() => {
    const w = Math.round(root.getBoundingClientRect().width);
    if (w === lastW || pending || !built) return;
    pending = requestAnimationFrame(() => { pending = 0; lastW = w; build(); draw(performance.now()); wake(); });
  }).observe(root);

  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) wake();
  }).observe(root);

  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    build();
    lastW = W;
    draw(performance.now());
    wake();
  });
})();
