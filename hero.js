// Hero: raymarched liquid-metal blobs that drift on their own and follow the pointer.
// Plain WebGL, one full-screen fragment shader. Falls back to a CSS gradient without WebGL.
(function () {
  const canvas = document.querySelector(".hero-gl");
  if (!canvas) return;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const gl = canvas.getContext("webgl", { alpha: true, premultipliedAlpha: false, antialias: false });
  if (!gl) { canvas.classList.add("is-fallback"); return; }

  const vert = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  const frag = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uMouse;
uniform float uScroll;

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

vec3 offset() {
  float a = uRes.x / uRes.y;
  // Sit to the right on wide screens, centred and higher on phones.
  return a > 1.0 ? vec3(min(1.25, (a - 1.0) * 1.7), 0.3, 0.0) : vec3(0.0, 0.85, 0.0);
}

float map(vec3 p) {
  p -= offset();
  p.y += uScroll * 1.6;
  float t = uTime;
  float d = 1e5;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec3 c = vec3(
      sin(t * 0.31 * (1.0 + fi * 0.13) + fi * 1.7) * 0.85,
      cos(t * 0.27 * (1.0 + fi * 0.11) + fi * 2.3) * 0.6,
      sin(t * 0.23 + fi * 1.3) * 0.5
    );
    float r = 0.3 + 0.11 * sin(fi * 3.1 + 1.0);
    d = smin(d, length(p - c) - r, 0.5 + uScroll * 0.3);
  }
  vec3 m = vec3(uMouse * vec2(1.9, 1.2), 0.35) - offset() * vec3(1.0, 1.0, 0.0);
  d = smin(d, length(p - m) - 0.24, 0.5);
  return d;
}

vec3 normalAt(vec3 p) {
  const vec2 e = vec2(0.0015, -0.0015);
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

// Fake studio: soft top light, ember key from the left, cool fill from below.
vec3 env(vec3 r) {
  vec3 c = vec3(0.02, 0.02, 0.026);
  c += vec3(1.0) * smoothstep(0.6, 0.85, r.y) * 1.3;
  c += vec3(1.0, 0.31, 0.1) * smoothstep(0.3, 0.9, -r.x) * smoothstep(0.6, -0.2, r.y) * 1.6;
  c += vec3(0.35, 0.45, 1.0) * smoothstep(0.45, 1.0, -r.y) * 0.5;
  c += vec3(1.0) * smoothstep(0.82, 0.9, r.x) * smoothstep(0.98, 0.9, r.x) * 1.2;
  return c;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 ro = vec3(0.0, 0.0, uRes.x > uRes.y ? 4.2 : 5.6);
  vec3 rd = normalize(vec3(uv, -1.55));
  float t = 0.0;
  float dmin = 1e5;
  bool hit = false;
  for (int i = 0; i < 72; i++) {
    float d = map(ro + rd * t);
    dmin = min(dmin, d);
    if (d < 0.001) { hit = true; break; }
    t += d;
    if (t > 8.0) break;
  }
  if (!hit) {
    // Soft contact glow around the shapes so the edge isn't a hard cut.
    float g = exp(-dmin * 14.0) * 0.12;
    gl_FragColor = vec4(0.05, 0.05, 0.07, g);
    return;
  }
  vec3 p = ro + rd * t;
  vec3 n = normalAt(p);
  vec3 r = reflect(rd, n);
  float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
  vec3 col = env(r) * (0.2 + 1.0 * fres);
  col += vec3(1.0, 0.31, 0.1) * pow(fres, 2.0) * 0.35;
  float spec = pow(max(dot(r, normalize(vec3(-0.4, 0.8, 0.5))), 0.0), 48.0);
  col += spec * 1.4;
  col = col / (1.0 + col);
  col = pow(col, vec3(0.85));
  gl_FragColor = vec4(col, 1.0);
}`;

  function shader(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  let prog;
  try {
    prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, vert));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  } catch (e) {
    console.error(e);
    canvas.classList.add("is-fallback");
    return;
  }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const uMouse = gl.getUniformLocation(prog, "uMouse");
  const uScroll = gl.getUniformLocation(prog, "uScroll");

  // Raymarching is per pixel, so cap the pixel count and let CSS scale the canvas up.
  const MAX_PIXELS = 1.1e6;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const scale = Math.min(dpr, Math.sqrt(MAX_PIXELS / (w * h)));
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  }
  resize();
  window.addEventListener("resize", resize);

  const target = { x: 0.6, y: 0.2 }, mouse = { x: 0.6, y: 0.2 };
  window.addEventListener("pointermove", (e) => {
    target.x = (e.clientX / window.innerWidth) * 2 - 1;
    target.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }, { passive: true });

  let visible = true, raf = 0;
  const start = performance.now();
  function frame(now) {
    raf = 0;
    mouse.x += (target.x - mouse.x) * 0.06;
    mouse.y += (target.y - mouse.y) * 0.06;
    const scroll = Math.min(1, window.scrollY / Math.max(1, canvas.clientHeight));
    gl.uniform1f(uTime, reduced ? 4.0 : (now - start) / 1000 + 4.0);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.uniform1f(uScroll, scroll);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (visible && !reduced) raf = requestAnimationFrame(frame);
  }
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && !raf) raf = requestAnimationFrame(frame);
  }).observe(canvas);
  raf = requestAnimationFrame(frame);
  if (reduced) {
    window.addEventListener("resize", () => requestAnimationFrame(frame));
  }
})();
