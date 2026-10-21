// Hero background: rows of "OONDRAA" sit as a faint outline. Moving the pointer leaves a trail that
// reveals iridescent, refracted colour inside the letters, then slowly fades like ink.
// Plain WebGL: a low-res trail buffer (ping-pong) and one composite pass over a mask of the letters.
// Without WebGL the outline (CSS text-stroke) is all you see, which still reads fine.
(function () {
  const canvas = document.querySelector(".hero-gl");
  const words = document.querySelector(".hero-bg");
  if (!canvas || !words) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(hover: none), (pointer: coarse)").matches;
  const gl = canvas.getContext("webgl", { alpha: false, antialias: false });
  if (!gl) return;

  const vert = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

  const trailFrag = `
precision highp float;
uniform sampler2D uPrev;
uniform vec2 uRes;
uniform float uAspect;
uniform vec2 uA;
uniform vec2 uB;
uniform float uRadius;
uniform float uForce;
uniform float uTime;

float seg(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  // A slow swirl so the trail drifts like ink instead of fading in place.
  vec2 flow = vec2(sin(uv.y * 9.0 + uTime * 0.7), cos(uv.x * 7.0 - uTime * 0.6)) * 0.0012;
  float prev = texture2D(uPrev, uv - flow).r;
  vec2 k = vec2(uAspect, 1.0);
  float d = seg(uv * k, uA * k, uB * k);
  float s = exp(-d * d / (uRadius * uRadius)) * uForce;
  // The small subtraction lets 8-bit values actually reach zero.
  gl_FragColor = vec4(clamp(max(prev * 0.975 - 0.002, 0.0) + s, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

  const drawFrag = `
precision highp float;
uniform sampler2D uText;   // r: letters, b: letters blurred
uniform sampler2D uTrail;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uBg;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// Oil-on-glass colours: deep blue, magenta, ember orange, cyan, looping.
vec3 iri(float x) {
  x = fract(x) * 4.0;
  vec3 a = vec3(0.08, 0.16, 1.0), b = vec3(0.85, 0.08, 0.45), c = vec3(1.0, 0.36, 0.06), d = vec3(0.15, 0.75, 1.0);
  return x < 1.0 ? mix(a, b, smoothstep(0.0, 1.0, x)) : x < 2.0 ? mix(b, c, smoothstep(1.0, 2.0, x))
       : x < 3.0 ? mix(c, d, smoothstep(2.0, 3.0, x)) : mix(d, a, smoothstep(3.0, 4.0, x));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float tr = texture2D(uTrail, uv).r;
  // Bend the letters along the trail's slope, like looking through moving glass,
  // and split the channels a little so the edges fringe red and blue.
  vec2 e = vec2(6.0 / uRes.x, 0.0), f = vec2(0.0, 6.0 / uRes.y);
  vec2 grad = vec2(texture2D(uTrail, uv + e).r - texture2D(uTrail, uv - e).r,
                   texture2D(uTrail, uv + f).r - texture2D(uTrail, uv - f).r);
  vec2 off = grad * 0.04;
  vec3 m = vec3(texture2D(uText, uv + off * 1.4).r, texture2D(uText, uv + off).r, texture2D(uText, uv + off * 0.6).r);
  float blur = texture2D(uText, uv + off).b;
  // Bright near the edges of each letter, dark glass in the middle.
  float rim = clamp((m.g - blur) * 3.0, 0.0, 1.0);
  float n = noise(uv * vec2(3.0, 2.0) + uTime * 0.08) + 0.5 * noise(uv * 7.0 - uTime * 0.12);
  vec3 col = iri(n * 0.7 + tr * 0.5 + uv.x * 0.35 - uTime * 0.03);
  float streak = smoothstep(0.55, 0.95, noise(uv * vec2(14.0, 4.0) + vec2(uTime * 0.2, 0.0)));
  vec3 glow = col * (0.06 + 0.35 * streak + 1.5 * pow(rim, 1.4)) + vec3(1.0) * pow(rim, 5.0) * 0.5;
  float reveal = smoothstep(0.03, 0.55, tr);
  gl_FragColor = vec4(uBg + glow * m * reveal, 1.0);
}`;

  function program(fragSrc) {
    const p = gl.createProgram();
    [[gl.VERTEX_SHADER, vert], [gl.FRAGMENT_SHADER, fragSrc]].forEach(([type, src]) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    });
    gl.bindAttribLocation(p, 0, "p");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (let i = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i--; ) {
      const name = gl.getActiveUniform(p, i).name;
      u[name] = gl.getUniformLocation(p, name);
    }
    return { p, u };
  }
  let trailProg, drawProg;
  try {
    trailProg = program(trailFrag);
    drawProg = program(drawFrag);
  } catch (e) {
    console.error(e);
    return;
  }

  // One full-screen triangle shared by both passes.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function texture(w, h, src) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    return t;
  }
  function target(w, h) {
    const tex = texture(w, h);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb };
  }

  // The letters, drawn glyph by glyph where the browser laid them out. Red is the shape,
  // blue a blurred copy (via an off-canvas shadow, which works everywhere) used to find the rims.
  const maskCanvas = document.createElement("canvas");
  let textTex = null;
  function drawText() {
    const hr = canvas.getBoundingClientRect();
    const s = canvas.width / hr.width;
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    const ctx = maskCanvas.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
    ctx.globalCompositeOperation = "lighter";
    const cs = getComputedStyle(words);
    const size = parseFloat(cs.fontSize) * s;
    ctx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;
    ctx.textBaseline = "alphabetic";
    const ascent = ctx.measureText("H").fontBoundingBoxAscent;
    const upper = cs.textTransform === "uppercase";
    const away = maskCanvas.width + size;
    const range = document.createRange();
    [...words.children].forEach((row) => {
      const walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
      for (let n; (n = walker.nextNode()); ) {
        for (let k = 0; k < n.length; k++) {
          if (!n.data[k].trim()) continue;
          range.setStart(n, k);
          range.setEnd(n, k + 1);
          const r = range.getBoundingClientRect();
          // Rows run past the edges; skip what's off screen.
          if (r.right < hr.left || r.left > hr.right) continue;
          const ch = upper ? n.data[k].toLocaleUpperCase("cs") : n.data[k];
          const x = (r.left - hr.left) * s;
          const y = (r.top - hr.top) * s + ascent;
          ctx.shadowColor = "transparent";
          ctx.fillStyle = "#f00";
          ctx.fillText(ch, x, y);
          ctx.shadowColor = "#00f";
          ctx.shadowBlur = size * 0.06;
          ctx.shadowOffsetX = away;
          ctx.fillText(ch, x - away, y);
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
        }
      }
    });
    if (textTex) gl.deleteTexture(textTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    textTex = texture(0, 0, maskCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  // The fill only needs to be soft, so cap the pixel count; the crisp outline is the DOM text on top.
  const MAX_PIXELS = 2.2e6;
  let trail = [], tw = 1, th = 1;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const scale = Math.min(dpr, Math.sqrt(MAX_PIXELS / (w * h)));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    trail.forEach(({ tex, fb }) => { gl.deleteTexture(tex); gl.deleteFramebuffer(fb); });
    tw = Math.ceil(canvas.width / 4);
    th = Math.ceil(canvas.height / 4);
    trail = [target(tw, th), target(tw, th)];
    drawText();
  }

  // Pointer, in hero uv (0..1, y up). When it's idle, or on touch screens, a virtual pointer
  // wanders across the hero so the effect is never just sitting there unseen.
  const client = { x: -1, y: -1 };
  let lastMove = -1e9, tgt = { x: 0.2, y: 0.4 }, pos = { x: 0.2, y: 0.4 }, prev = { x: 0.2, y: 0.4 };
  window.addEventListener("pointermove", (e) => {
    client.x = e.clientX;
    client.y = e.clientY;
    lastMove = performance.now();
  }, { passive: true });

  let visible = true, raf = 0, ping = 0;
  const start = performance.now();
  const bg = [12 / 255, 12 / 255, 16 / 255];
  function frame(now) {
    raf = 0;
    const t = (now - start) / 1000;
    const r = canvas.getBoundingClientRect();
    if (!coarse && now - lastMove < 2500) {
      tgt.x = (client.x - r.left) / r.width;
      tgt.y = 1 - (client.y - r.top) / r.height;
    } else if (!reduced) {
      tgt.x = 0.5 + Math.sin(t * 0.55) * 0.42;
      tgt.y = 0.5 + Math.sin(t * 1.1 + 1.3) * 0.36;
    }
    prev.x = pos.x; prev.y = pos.y;
    pos.x += (tgt.x - pos.x) * 0.25;
    pos.y += (tgt.y - pos.y) * 0.25;
    // Only movement paints, so a resting cursor lets the colour fade out.
    const moved = Math.hypot((pos.x - prev.x) * r.width, (pos.y - prev.y) * r.height);

    gl.useProgram(trailProg.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, trail[1 - ping].fb);
    gl.viewport(0, 0, tw, th);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, trail[ping].tex);
    gl.uniform1i(trailProg.u.uPrev, 0);
    gl.uniform2f(trailProg.u.uRes, tw, th);
    gl.uniform1f(trailProg.u.uAspect, r.width / r.height);
    gl.uniform2f(trailProg.u.uA, prev.x, prev.y);
    gl.uniform2f(trailProg.u.uB, pos.x, pos.y);
    gl.uniform1f(trailProg.u.uRadius, 0.07);
    gl.uniform1f(trailProg.u.uForce, Math.min(0.45, moved / (Math.min(r.width, r.height) * 0.045)));
    gl.uniform1f(trailProg.u.uTime, t);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    ping = 1 - ping;

    gl.useProgram(drawProg.p);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textTex);
    gl.uniform1i(drawProg.u.uText, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, trail[ping].tex);
    gl.uniform1i(drawProg.u.uTrail, 1);
    gl.uniform2f(drawProg.u.uRes, canvas.width, canvas.height);
    gl.uniform1f(drawProg.u.uTime, t);
    gl.uniform3fv(drawProg.u.uBg, bg);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    if (visible) raf = requestAnimationFrame(frame);
  }

  resize();
  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });
  // Geist may still be loading on the first draw; redraw the mask once it's in.
  if (document.fonts) document.fonts.ready.then(drawText);
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(frame);
  }).observe(canvas);
  raf = requestAnimationFrame(frame);
})();
