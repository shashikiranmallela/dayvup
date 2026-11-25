/* ============================================================
   shadow3d.js  -  Dayvup's real-3D pet companion (Three.js r128)

   A dog that follows your cursor on every page:
     click empty space   throws a ball - he runs, grabs it, brings it back
     click him           happy bark + tail wag
     double-click him    a trick (sit / spin / shake)
     you start focusing  he trots to his house (bottom-left) and lies down
     you stop focusing   he gets back up and comes to find you

   This reuses the renderer / camera / resize / particle / speech-bubble /
   settings-panel plumbing from the original build (that part was already
   solid) and replaces the warrior rig + combat with a dog, a doghouse and
   a ball. All art is original, built from primitives - no textures, no
   external assets. Needs three.js r128 loaded first.
   ============================================================ */
(function () {
  "use strict";
  if (window.Shadow3D) return;
  if (typeof THREE === "undefined") { console.warn("shadow3d: three.js missing - keeping the 2D companion"); return; }

  const reduce = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const coarse = !!(window.matchMedia && matchMedia("(pointer: coarse)").matches);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, k) => a + (b - a) * k;
  const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const isLite = () => document.documentElement.classList.contains("lite");
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  /* ------------------------------------------------------------
     SHADERS  (one lit material family; fur/wood/rubber all share it)
     ------------------------------------------------------------ */
  const VERT = `
    varying vec3 vN; varying vec3 vV;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = -mv.xyz;
      gl_Position = projectionMatrix * mv;
    }`;
  const FRAG_BODY = `
    uniform vec3 uBase; uniform vec3 uRim; uniform float uRimK; uniform float uPulse; uniform float uSpec;
    varying vec3 vN; varying vec3 vV;
    void main(){
      vec3 n = normalize(vN);
      vec3 v = normalize(vV);
      float nv = clamp(dot(n, v), 0.0, 1.0);
      float rim = pow(1.0 - nv, 2.3);
      vec3 L = normalize(vec3(-0.45, 0.75, 0.55));
      float diff = max(dot(n, L), 0.0);
      float sp = pow(max(dot(reflect(-L, n), v), 0.0), 22.0);
      vec3 col = uBase * (0.85 + 1.5 * diff);
      col += uRim * rim * uRimK * (1.0 + uPulse * 1.1);
      col += vec3(1.0) * sp * uSpec;
      col += uRim * 0.1 * clamp(-n.y, 0.0, 1.0);
      gl_FragColor = vec4(col, 1.0);
    }`;
  const FRAG_GLOW = `
    uniform vec3 uColor; uniform float uTime;
    void main(){ gl_FragColor = vec4(uColor * (1.15 + 0.2 * sin(uTime * 3.0)), 1.0); }`;

  const PREMUL = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor };

  function shade(uni, base, rimK, spec) {
    return new THREE.ShaderMaterial({
      uniforms: { uRim: uni.uRim, uPulse: uni.uPulse, uBase: { value: new THREE.Color(base) }, uRimK: { value: rimK }, uSpec: { value: spec } },
      vertexShader: VERT, fragmentShader: FRAG_BODY
    });
  }
  function glow(uni, hex) {
    return new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color(hex || "#fff") }, uTime: uni.uTime }, vertexShader: VERT, fragmentShader: FRAG_GLOW });
  }

  /* ------------------------------------------------------------
     GEOMETRY helpers (shared + cached)
     ------------------------------------------------------------ */
  const gcache = {};
  const geo = (key, make) => gcache[key] || (gcache[key] = make());
  const cyl = (rt, rb, h, s) => geo("c" + [rt, rb, h, s || 8], () => new THREE.CylinderGeometry(rt, rb, h, s || 8));
  const box = (w, h, d) => geo("b" + [w, h, d], () => new THREE.BoxGeometry(w, h, d));
  const sph = (r, w, h) => geo("s" + [r, w || 12, h || 9], () => new THREE.SphereGeometry(r, w || 12, h || 9));
  function mesh(g, mat, parent, x, y, z, rx, ry, rz) {
    const o = new THREE.Mesh(g, mat);
    o.position.set(x || 0, y || 0, z || 0);
    if (rx || ry || rz) o.rotation.set(rx || 0, ry || 0, rz || 0);
    parent.add(o);
    return o;
  }
  function pivot(parent, x, y, z) {
    const o = new THREE.Object3D();
    o.position.set(x || 0, y || 0, z || 0);
    parent.add(o);
    return o;
  }

  /* ------------------------------------------------------------
     THE DOG  -  feet on y=0, about 0.42 tall at the shoulder, faces +z
     ------------------------------------------------------------ */
  const LEG_POS = [
    { x: -0.11, z: 0.155, front: true }, { x: 0.11, z: 0.155, front: true },
    { x: -0.115, z: -0.135, front: false }, { x: 0.115, z: -0.135, front: false }
  ];

  function buildLeg(parent, spec, M) {
    const hip = pivot(parent, spec.x, 0.235, spec.z);
    mesh(cyl(0.028, 0.022, 0.15, 6), M.body, hip, 0, -0.075, 0);
    const paw = mesh(sph(0.026, 8, 6), M.dark, hip, 0, -0.148, 0.006);
    hip.userData.paw = paw;
    return hip;
  }

  function buildDog(spec) {
    spec = spec || {};
    const rimHex = spec.rim || "#e8734a";
    const coatHex = spec.coat || 0xf0b855;
    const bellyHex = spec.belly || 0xfbe8c6;
    const uni = { uTime: { value: Math.random() * 20 }, uRim: { value: new THREE.Color(rimHex) }, uPulse: { value: 0 } };
    const M = {
      body: shade(uni, coatHex, 1.0, 0.35),
      belly: shade(uni, bellyHex, 0.7, 0.3),
      dark: shade(uni, 0x1c1410, 0.4, 0.5),
      collar: shade(uni, 0x5a3320, 0.6, 0.5), tag: shade(uni, 0xe0b24a, 0.9, 0.9),
      eye: glow(uni, "#3a2416"), nose: shade(uni, 0x2a1a14, 0.5, 0.7),
      tongue: shade(uni, 0xe8879a, 0.4, 0.35)
    };

    const root = new THREE.Group();
    const yaw = pivot(root);
    const body = pivot(yaw, 0, 0, 0);

    // ground contact glow (screen-facing blob)
    const blob = new THREE.Mesh(geo("petblob", () => new THREE.PlaneGeometry(1, 1)), new THREE.ShaderMaterial(Object.assign({
      uniforms: { uRim: uni.uRim },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 uRim; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.0) * 0.45; gl_FragColor = vec4(uRim * a, a); }"
    }, PREMUL)));
    blob.scale.set(0.85, 0.24, 1); blob.position.y = 0.004; blob.renderOrder = -1;
    root.add(blob);

    // torso: a stretched, slightly tapered barrel
    const torso = pivot(body, 0, 0.235, 0);
    mesh(sph(0.135, 12, 9), M.body, torso, 0, 0, 0).scale.set(1, 0.86, 1.5);
    mesh(sph(0.1, 10, 8), M.belly, torso, 0, -0.05, 0).scale.set(0.9, 0.55, 1.5);
    mesh(cyl(0.10, 0.075, 0.08, 10), M.body, torso, 0, 0.02, 0.235).scale.set(1, 0.9, 1); // chest taper toward neck

    // neck + head
    const neck = pivot(torso, 0, 0.05, 0.24);
    const headYaw = pivot(neck, 0, 0.02, 0.05);
    const headPitch = pivot(headYaw);
    mesh(cyl(0.062, 0.085, 0.11, 10), M.body, headPitch, 0, 0, -0.02, 0.35, 0, 0);
    const skull = mesh(sph(0.1, 14, 10), M.body, headPitch, 0, 0.03, 0.05);
    skull.scale.set(1.05, 0.95, 1.05);
    const muzzle = mesh(sph(0.058, 10, 8), M.body, headPitch, 0, -0.008, 0.15);
    muzzle.scale.set(0.85, 0.72, 1.05);
    mesh(sph(0.026, 8, 6), M.nose, headPitch, 0, 0.0, 0.2);
    // eyes
    [-1, 1].forEach((s) => mesh(sph(0.021, 9, 7), M.eye, headPitch, s * 0.06, 0.06, 0.13));
    // open, happy mouth with a little pink tongue
    mesh(box(0.05, 0.012, 0.02), M.dark, headPitch, 0, -0.048, 0.165, 0.15, 0, 0);
    mesh(sph(0.022, 8, 6), M.tongue, headPitch, 0, -0.062, 0.155).scale.set(0.62, 0.4, 0.9);
    // ears (floppy, hinge at the top of the skull so they swing)
    const ears = [-1, 1].map((s) => {
      const hinge = pivot(headPitch, s * 0.075, 0.09, 0.01);
      const ear = mesh(sph(0.045, 8, 6), M.body, hinge, 0, -0.05, 0);
      ear.scale.set(0.55, 1.35, 0.32);
      hinge.rotation.z = s * 0.35;
      return hinge;
    });
    // collar + a small round tag
    mesh(geo("collar", () => new THREE.TorusGeometry(0.095, 0.012, 6, 16)), M.collar, neck, 0, -0.02, -0.02, Math.PI / 2, 0, 0);
    mesh(cyl(0.02, 0.02, 0.006, 10), M.tag, neck, 0, -0.075, 0.01, 1.5708, 0, 0);

    // legs
    const legs = LEG_POS.map((spec) => buildLeg(torso, spec, M));

    // tail: two segments hinged so it can wag and curl
    const tailBase = pivot(torso, 0, 0.09, -0.245);
    tailBase.rotation.x = -0.7;
    mesh(cyl(0.026, 0.018, 0.14, 7), M.body, tailBase, 0, 0.07, 0);
    const tailMid = pivot(tailBase, 0, 0.14, 0);
    tailMid.rotation.x = 0.5;
    mesh(cyl(0.018, 0.01, 0.12, 7), M.body, tailMid, 0, 0.06, 0);

    function pose(p) {
      p = p || {};
      const t = p.t || 0, walk = p.walk || 0, phase = p.phase || 0, sit = clamp(p.sit || 0, 0, 1);
      const spin = p.spin || 0, shake = p.shake || 0, bounce = p.bounce || 0, wagK = clamp(p.wag == null ? 0.3 : p.wag, 0, 1);
      const breathe = Math.sin(t * 1.6) * 0.012 * (1 - sit * 0.5);

      yaw.rotation.y = (p.yaw || 0) + spin * Math.PI * 2;
      headYaw.rotation.y = clamp(p.headYaw || 0, -0.7, 0.7);
      headPitch.rotation.x = clamp((p.headPitch || 0) - sit * 0.08, -0.5, 0.55) + shake * Math.sin(t * 26) * 0.25;
      headYaw.rotation.z = shake * Math.sin(t * 22) * 0.18;

      const standY = 0.03 + breathe + Math.abs(Math.sin(phase)) * walk * 0.012 + bounce;
      const sitY = -0.045;
      body.position.y = lerp(standY, sitY, sit);
      body.rotation.x = lerp(0, -0.12, sit) - walk * 0.02;

      legs.forEach((hip, i) => {
        const spec = LEG_POS[i];
        const ph = phase + (spec.front ? (i === 0 ? 0 : Math.PI) : (i === 2 ? Math.PI : 0));
        const walkAng = Math.sin(ph) * 0.55 * walk;
        if (sit > 0.02) {
          const target = spec.front ? -0.1 : -1.95;
          hip.rotation.x = lerp(walkAng, target, sit);
        } else {
          hip.rotation.x = walkAng;
        }
        hip.position.y = 0.235 + (spec.front ? 0 : lerp(0, 0.02, sit));
      });

      const wagSpeed = lerp(2.2, 11, wagK);
      const wagAmp = lerp(0.18, 0.95, wagK);
      tailBase.rotation.y = Math.sin(t * wagSpeed) * wagAmp;
      tailMid.rotation.y = Math.sin(t * wagSpeed + 0.6) * wagAmp * 0.8;
      tailBase.rotation.x = lerp(-0.7, -0.15, sit) + Math.sin(t * wagSpeed * 0.5) * 0.05;

      ears.forEach((hinge, i) => {
        const s = i ? 1 : -1;
        hinge.rotation.z = s * (0.35 - wagK * 0.12) + Math.sin(t * 3 + i) * 0.03;
      });

      uni.uPulse.value = damp(uni.uPulse.value, p.pulse || 0, 6, 1 / 60);
    }

    return {
      root, yaw, body, uni, mats: M, pose,
      setRim(hex, k) { const c = new THREE.Color(hex); if (k) uni.uRim.value.lerp(c, k); else uni.uRim.value.copy(c); },
      dispose() { root.traverse((o) => { if (o.material && o.material.dispose) o.material.dispose(); }); }
    };
  }

  /* ------------------------------------------------------------
     THE HOUSE  -  a small doghouse pinned to the bottom-left corner
     ------------------------------------------------------------ */
  function buildHouse(rimHex) {
    const uni = { uRim: { value: new THREE.Color(rimHex) }, uPulse: { value: 0 } };
    const wood = shade(uni, 0x5a3a24, 0.5, 0.15);
    const roof = shade(uni, 0x7a2f2f, 0.7, 0.2);
    const dark = shade(uni, 0x0c0806, 0.3, 0.1);
    const root = new THREE.Group();
    mesh(box(0.62, 0.34, 0.5), wood, root, 0, 0.17, 0);
    mesh(box(0.2, 0.26, 0.02), dark, root, 0, 0.13, 0.246); // doorway shadow
    const roofG = geo("roofprism", () => {
      const g = new THREE.CylinderGeometry(0, 0.4, 0.6, 3, 1);
      g.rotateZ(Math.PI / 2); g.rotateX(Math.PI / 2);
      return g;
    });
    mesh(roofG, roof, root, 0, 0.34, 0.03).scale.set(0.62, 1, 1.08);
    const blob = new THREE.Mesh(geo("houseblob", () => new THREE.PlaneGeometry(1, 1)), new THREE.ShaderMaterial(Object.assign({
      uniforms: { uRim: uni.uRim },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 uRim; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(clamp(1.0 - d, 0.0, 1.0), 2.0) * 0.3; gl_FragColor = vec4(uRim * a, a); }"
    }, PREMUL)));
    blob.scale.set(1.3, 0.4, 1); blob.position.y = 0.003; blob.renderOrder = -1;
    root.add(blob);
    return { root, setRim(hex, k) { const c = new THREE.Color(hex); if (k) uni.uRim.value.lerp(c, k); else uni.uRim.value.copy(c); } };
  }

  /* ------------------------------------------------------------
     THE BALL
     ------------------------------------------------------------ */
  function buildBall() {
    const uni = { uRim: { value: new THREE.Color("#ff5252") }, uPulse: { value: 0 } };
    const mat = shade(uni, 0xe23b3b, 0.55, 0.8);
    const root = new THREE.Group();
    mesh(sph(0.045, 12, 9), mat, root, 0, 0, 0);
    root.visible = false;
    return { root };
  }

  /* ------------------------------------------------------------
     THE COMPANION  (full-screen transparent 3D overlay)
     ------------------------------------------------------------ */
  const LINES = {
    focus: ["Off to my house.", "Call me when you're free.", "I'll wait right here."],
    break: ["I'm back!", "Play time?"],
    alert: ["Woof! Don't forget today.", "Come on, let's go."],
    cheerSmall: ["Woof!", "Good one!"],
    cheerBig: ["WOOF WOOF!", "That's my human!"],
    poke: ["Hey!", "Pet me?", "Woof?"],
    idle: ["*tail wag*", "Got a ball?", "..."],
    fetch: ["Got it!", "Woof!"]
  };
  const MOOD = { idle: { rim: null }, focus: { rim: "#e8734a" }, break: { rim: "#4fb397" }, alert: { rim: "#d2785a" } };
  const INTERACTIVE = 'a,button,input,select,textarea,label,summary,[role="button"],[role="tab"],[data-go],.chip,.seg,.switch,.dock,.topbar';
  const IGNORE = "#arise,#palette,.palette-backdrop,.zen-exit";

  const prefs = (function () {
    let p = { on: true, sfx: false };
    try { p = Object.assign(p, JSON.parse(localStorage.getItem("sf_s3d") || "{}")); } catch (e) { /* ignore */ }
    return p;
  })();
  const savePrefs = () => { try { localStorage.setItem("sf_s3d", JSON.stringify(prefs)); } catch (e) { /* ignore */ } };

  const C = {
    ready: false, on: false, renderer: null, scene: null, camera: null, canvas: null, W: 0, H: 0, dpr: 1, S: 150, camZ: 2000,
    dog: null, house: null, ball: null, pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, cursor: { x: 0, y: 0, has: false },
    mood: "idle", t: 0, phase: 0, yaw: 0, sit: 0, homeState: "out", home: { x: 0, y: 0 }, fetchState: null, fetchT: 0, trick: null,
    hopT: 0, cheerT: 0, wag: 0.25, enter: 1, fx: [], sparks: null, line: null, lineTimer: 0, lastSave: 0,
    lastMove: performance.now(), nextIdle: performance.now() + 60000, raf: 0, last: 0, lastRender: 0
  };

  const wx = (x) => x - C.W / 2;
  const wy = (y) => C.H / 2 - y;
  const clampX = (x) => clamp(x, C.S * 0.35, C.W - C.S * 0.35);
  const clampY = (y) => clamp(y, C.S + 70, C.H - 6);
  const depthScale = (y) => lerp(0.85, 1.12, clamp(y / Math.max(1, C.H), 0, 1));

  function accentHex() {
    const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
    return /^#[0-9a-f]{3,8}$/i.test(v) ? v : "#e8734a";
  }
  function houseCorner() {
    C.home.x = C.S * 0.62 + 14; C.home.y = C.H - (C.W < 760 ? 108 : 30);
  }

  /* ---------- sound (opt-in) ---------- */
  let ac = null;
  function yip(happy) {
    if (!prefs.sfx) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === "suspended") ac.resume();
      const t = ac.currentTime;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "triangle";
      const base = happy ? 620 : 460;
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * (happy ? 1.7 : 1.3), t + 0.07);
      o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.16);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(happy ? 0.22 : 0.14, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 0.22);
      if (happy) {
        const o2 = ac.createOscillator(), g2 = ac.createGain();
        o2.type = "triangle"; o2.frequency.setValueAtTime(base * 1.3, t + 0.12);
        o2.frequency.exponentialRampToValueAtTime(base * 2, t + 0.19);
        g2.gain.setValueAtTime(0.0001, t + 0.12); g2.gain.linearRampToValueAtTime(0.16, t + 0.14); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
        o2.connect(g2); g2.connect(ac.destination); o2.start(t + 0.12); o2.stop(t + 0.32);
      }
    } catch (e) { /* audio not available */ }
  }

  /* ---------- effects: rings + sparks (reused for paw-print poofs) ---------- */
  const RING_GEO = () => geo("ring", () => new THREE.RingGeometry(0.9, 1, 48));
  function fxMaterial(frag, uniforms) {
    return new THREE.ShaderMaterial(Object.assign({ uniforms: uniforms, vertexShader: "varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }", fragmentShader: frag }, PREMUL));
  }
  function ring(x, y, R, dur, hex) {
    const m = fxMaterial("uniform vec3 uColor; uniform float uA; void main(){ gl_FragColor = vec4(uColor * uA, uA); }", { uColor: { value: new THREE.Color(hex || C.rimHex) }, uA: { value: 1 } });
    const o = new THREE.Mesh(RING_GEO(), m);
    o.position.set(wx(x), wy(y), 20); o.scale.set(4, 4, 1); o.frustumCulled = false;
    C.scene.add(o);
    let a = 0;
    C.fx.push((dt) => {
      a += dt / dur; const e = easeOut(a), r = lerp(4, R, e);
      o.scale.set(r, r * 0.35, 1); m.uniforms.uA.value = (1 - a) * 0.85;
      if (a >= 1) { C.scene.remove(o); m.dispose(); return false; }
      return true;
    });
  }
  const SP_N = 200;
  const sp = { i: 0, x: new Float32Array(SP_N), y: new Float32Array(SP_N), vx: new Float32Array(SP_N), vy: new Float32Array(SP_N), life: new Float32Array(SP_N), max: new Float32Array(SP_N), size: new Float32Array(SP_N), col: new Float32Array(SP_N * 3) };
  function initSparks() {
    const g = new THREE.BufferGeometry();
    sp.pos = new THREE.BufferAttribute(new Float32Array(SP_N * 3), 3);
    sp.aSize = new THREE.BufferAttribute(new Float32Array(SP_N), 1);
    sp.aA = new THREE.BufferAttribute(new Float32Array(SP_N), 1);
    sp.aCol = new THREE.BufferAttribute(sp.col, 3);
    [sp.pos, sp.aSize, sp.aA].forEach((a) => a.setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("position", sp.pos); g.setAttribute("aSize", sp.aSize); g.setAttribute("aA", sp.aA); g.setAttribute("aCol", sp.aCol);
    sp.mat = new THREE.ShaderMaterial(Object.assign({
      uniforms: { uDpr: { value: C.dpr } },
      vertexShader: "attribute float aSize; attribute float aA; attribute vec3 aCol; uniform float uDpr; varying vec3 vC; varying float vA;" +
        "void main(){ vC = aCol; vA = aA; gl_PointSize = aSize * uDpr; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
      fragmentShader: "varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.05, d) * vA; gl_FragColor = vec4(vC * a * 1.3, a * 0.8); }"
    }, PREMUL));
    sp.points = new THREE.Points(g, sp.mat);
    sp.points.frustumCulled = false; sp.points.position.z = 30;
    C.scene.add(sp.points);
  }
  function burst(x, y, n, o) {
    if (!sp.points || reduce) return;
    o = o || {};
    const c = new THREE.Color(o.color || C.rimHex), white = new THREE.Color("#ffffff");
    for (let k = 0; k < n; k++) {
      const i = sp.i = (sp.i + 1) % SP_N, a = Math.random() * 6.283, v = (o.speed || 200) * (0.3 + Math.random() * 0.9);
      sp.x[i] = wx(x); sp.y[i] = wy(y);
      sp.vx[i] = Math.cos(a) * v; sp.vy[i] = Math.sin(a) * v + (o.up || 60);
      sp.life[i] = 0; sp.max[i] = (o.life || 0.6) * (0.6 + Math.random() * 0.8);
      sp.size[i] = (o.size || 8) * (0.5 + Math.random());
      const m = c.clone().lerp(white, Math.random() * 0.5);
      sp.col[i * 3] = m.r; sp.col[i * 3 + 1] = m.g; sp.col[i * 3 + 2] = m.b;
    }
    sp.aCol.needsUpdate = true;
  }
  function updateSparks(dt) {
    if (!sp.points) return;
    const P = sp.pos.array, Z = sp.aSize.array, A = sp.aA.array;
    for (let i = 0; i < SP_N; i++) {
      if (sp.life[i] >= sp.max[i]) { Z[i] = 0; A[i] = 0; continue; }
      sp.life[i] += dt;
      sp.vx[i] *= 0.96; sp.vy[i] = sp.vy[i] * 0.96 - 220 * dt;
      sp.x[i] += sp.vx[i] * dt; sp.y[i] += sp.vy[i] * dt;
      const k = sp.life[i] / sp.max[i];
      P[i * 3] = sp.x[i]; P[i * 3 + 1] = sp.y[i]; P[i * 3 + 2] = 0;
      Z[i] = sp.size[i] * (1 - k * 0.6); A[i] = 1 - k;
    }
    sp.pos.needsUpdate = true; sp.aSize.needsUpdate = true; sp.aA.needsUpdate = true;
  }

  /* ---------- speech bubble ---------- */
  function say(text, ms) {
    if (!C.line || !text || !C.on) return;
    C.line.textContent = text; C.line.classList.add("on");
    clearTimeout(C.lineTimer);
    C.lineTimer = setTimeout(() => C.line.classList.remove("on"), ms || 3200);
  }

  /* ---------- actions ---------- */
  function poke() {
    C.hopT = 0.4; C.wag = 1; yip(true); say(pick(LINES.poke), 2200);
    ring(C.pos.x, C.pos.y, C.S * 0.6, 0.4, null);
    burst(C.pos.x, C.pos.y - 6, 10, { speed: 140, size: 6 });
  }
  function cheer(big) {
    C.cheerT = big ? 1.3 : 0.8; C.hopT = 0.5; C.wag = 1;
    burst(C.pos.x, C.pos.y - C.S * 0.55, big ? 40 : 16, { speed: 220, up: 140, size: 8, color: big ? "#ffd27a" : null });
    if (big) ring(C.pos.x, C.pos.y, C.S * 1.2, 0.7, null);
    yip(true);
    say(pick(big ? LINES.cheerBig : LINES.cheerSmall), big ? 3600 : 2200);
  }
  function goHome() {
    if (C.homeState === "home" || C.homeState === "going") return;
    C.homeState = "going"; C.fetchState = null; C.trick = null;
  }
  function comeOut() {
    if (C.homeState === "out") return;
    C.homeState = "out"; C.wag = 0.6;
  }
  function throwBall(x, y) {
    if (C.homeState !== "out" || C.fetchState) return;
    C.ball.pos = { x: x, y: y };
    C.fetchState = "run";
    C.wag = 1;
    ring(x, y, C.S * 0.35, 0.4, "#ff5252");
  }
  function doTrick() {
    if (C.homeState !== "out" && C.homeState !== "home") return;
    if (C.trick) return;
    const list = C.homeState === "home" ? ["shake"] : ["spin", "shake"];
    C.trick = { kind: pick(list), t: 0 };
    yip(true);
  }
  function setMood(next, line) {
    if (!MOOD[next]) next = "idle";
    C.mood = next;
    if (next === "focus") { goHome(); if (line) say(line); else say(pick(LINES.focus), 2600); }
    else {
      if (C.mood !== "focus") comeOut();
      if (line) say(line);
      else if (LINES[next] && next !== "idle") say(pick(LINES[next]), 2600);
    }
  }

  /* ---------- per-frame update ---------- */
  function update(dt, now) {
    C.t += dt;
    const S = C.S;
    houseCorner();

    let fetchTarget = null;
    if (C.fetchState === "run") {
      C.ball.root.visible = true;
      fetchTarget = C.ball.pos;
      const d = Math.hypot(C.pos.x - C.ball.pos.x, (C.pos.y - S * 0.4) - C.ball.pos.y);
      if (d < S * 0.28) { C.fetchState = "grab"; C.fetchT = 0; burst(C.ball.pos.x, C.ball.pos.y, 8, { speed: 90, size: 5 }); }
    } else if (C.fetchState === "grab") {
      C.fetchT += dt;
      if (C.fetchT > 0.35) { C.fetchState = "return"; say(pick(LINES.fetch), 1400); }
    } else if (C.fetchState === "return") {
      fetchTarget = { x: clamp(C.cursor.has ? C.cursor.x : C.W / 2, S, C.W - S), y: clampY((C.cursor.has ? C.cursor.y : C.H * 0.6) + S * 0.5) };
      const d = Math.hypot(C.pos.x - fetchTarget.x, C.pos.y - fetchTarget.y);
      if (d < S * 0.4) { C.fetchState = null; C.ball.root.visible = false; C.wag = 0.7; C.hopT = 0.3; }
    }

    let tx = C.pos.x, ty = C.pos.y, wantSit = 0;
    if (C.homeState === "going" || C.homeState === "home") {
      tx = C.home.x; ty = C.home.y;
      const d = Math.hypot(C.pos.x - tx, C.pos.y - ty);
      if (C.homeState === "going" && d < S * 0.22) { C.homeState = "home"; C.wag = 0.15; }
      if (C.homeState === "home") wantSit = 1;
    } else if (fetchTarget) {
      tx = clampX(fetchTarget.x); ty = clampY(fetchTarget.y + (C.fetchState === "return" ? 0 : -S * 0.35));
    } else if (C.trick) {
      tx = C.pos.x; ty = C.pos.y; wantSit = C.trick.kind === "shake" ? 1 : 0;
    } else {
      const park = reduce || !C.cursor.has;
      if (park) { tx = S * 0.7 + 10; ty = C.H - (C.W < 760 ? 104 : 26); wantSit = 1; }
      else {
        const cx = C.cursor.x, cy = C.cursor.y;
        const dx = C.pos.x - cx, dy = (C.pos.y - S * 0.4) - cy, d = Math.hypot(dx, dy) || 1, keep = S * 0.9;
        if (d > keep * 1.2 || d < keep * 0.55) { tx = cx + dx / d * keep; ty = cy + dy / d * keep + S * 0.4; }
        else wantSit = 1;                       // already at a good spot - sit and look cheerful, puppy-mascot style
      }
    }
    tx = clampX(tx); ty = clampY(ty);

    const ex = tx - C.pos.x, ey = ty - C.pos.y, dist = Math.hypot(ex, ey);
    const running = C.fetchState === "run" || C.fetchState === "return";
    const maxSp = running ? 460 : 230;
    const want = dist < 5 ? 0 : Math.min(maxSp, dist * 3.2);
    C.vel.x = damp(C.vel.x, dist ? ex / dist * want : 0, 7, dt);
    C.vel.y = damp(C.vel.y, dist ? ey / dist * want : 0, 7, dt);
    C.pos.x += C.vel.x * dt; C.pos.y += C.vel.y * dt;

    const speed = Math.hypot(C.vel.x, C.vel.y);
    const walk = clamp(speed / 160, 0, 1);
    C.phase += (speed / S) * 5.5 * dt;

    let yawT = 0;
    if (speed > 20) yawT = Math.atan2(C.vel.x, Math.max(1, Math.abs(C.vel.y)) * (C.vel.y < 0 ? -1 : 1)) * 0.55;
    C.yaw = damp(C.yaw, clamp(yawT, -1.1, 1.1), 8, dt);
    const idleFor = (now - C.lastMove) / 1000;
    let aim = C.cursor.has ? clamp((C.cursor.x - C.pos.x) / (S * 2.2), -1, 1) * 0.6 : 0;
    let pitch = C.cursor.has ? -clamp(((C.pos.y - S * 0.8) - C.cursor.y) / (C.H * 0.5), -1, 1) * 0.35 : 0;
    if ((idleFor > 8 && !running) || !C.cursor.has) { aim = Math.sin(C.t * 0.5) * 0.4; pitch = Math.sin(C.t * 0.35) * 0.08; }

    C.sit = damp(C.sit || 0, wantSit && speed < 20 ? 1 : 0, 6, dt);
    C.wag = damp(C.wag, C.homeState === "home" ? 0.2 : (running ? 0.85 : 0.3), 3, dt);
    if (C.hopT > 0) C.hopT -= dt;
    if (C.cheerT > 0) C.cheerT -= dt;
    const hop = C.hopT > 0 ? Math.sin(Math.PI * clamp(1 - C.hopT / 0.4, 0, 1)) * 0.05 : 0;
    let spin = 0, shake = 0;
    if (C.trick) {
      C.trick.t += dt;
      if (C.trick.kind === "spin") { spin = clamp(C.trick.t / 0.9, 0, 1); if (C.trick.t > 0.9) C.trick = null; }
      else { shake = Math.sin(clamp(C.trick.t / 1.1, 0, 1) * Math.PI); if (C.trick.t > 1.1) C.trick = null; }
    }

    const rimTarget = MOOD[C.mood].rim || C.accent;
    C.rimHex = rimTarget;
    C.dog.setRim(rimTarget, Math.min(1, dt * 4));
    C.house.setRim(rimTarget, Math.min(1, dt * 3));

    C.enter = Math.min(1, C.enter + dt / 0.7);
    const sc = S * depthScale(C.pos.y) * 0.72;
    C.dog.pose({
      t: C.t, walk: walk, phase: C.phase, yaw: C.yaw, sit: C.sit, spin: spin, shake: shake,
      headYaw: aim - C.yaw * 0.4, headPitch: pitch, bounce: hop + (C.cheerT > 0 ? Math.max(0, Math.sin(C.cheerT * 14)) * 0.06 : 0),
      wag: C.cheerT > 0 ? 1 : C.wag, pulse: C.cheerT > 0 ? 1 : 0.15
    });
    const rise = easeOut(C.enter);
    C.dog.root.position.set(wx(C.pos.x), wy(C.pos.y), (C.pos.y / C.H) * 80);
    C.dog.root.scale.set(sc, sc * Math.max(0.02, rise), sc);

    const hsc = S * 0.66;
    C.house.root.position.set(wx(C.home.x), wy(C.home.y + hsc * 0.02), 5);
    C.house.root.scale.set(hsc, hsc, hsc);

    if (C.ball.root.visible && C.fetchState === "run") {
      const bsc = S * 0.5;
      const bob = Math.abs(Math.sin(C.t * 6)) * 0.15;
      C.ball.root.position.set(wx(C.ball.pos.x), wy(C.ball.pos.y) + bsc * 0.02 + bob * bsc * 0.3, 18);
      C.ball.root.scale.setScalar(bsc);
    } else if (C.fetchState === "grab" || C.fetchState === "return") {
      const bsc = S * 0.24;
      C.ball.root.position.set(wx(C.pos.x), wy(C.pos.y - S * 0.3), 22);
      C.ball.root.scale.setScalar(bsc);
    }

    C.fx = C.fx.filter((f) => f(dt));
    updateSparks(dt);

    if (C.line && C.line.classList.contains("on")) {
      const bx = clamp(C.pos.x, 80, C.W - 80), by = C.pos.y - sc * 1.3 - 6;
      C.line.style.transform = "translate3d(" + Math.round(bx) + "px," + Math.round(Math.max(72, by)) + "px,0) translate(-50%,-100%)";
    }

    if (now > C.nextIdle && C.mood !== "focus" && idleFor > 20 && !C.fetchState) { say(pick(LINES.idle), 2600); C.nextIdle = now + 90000 + Math.random() * 60000; }
    if (now - C.lastSave > 600) {
      C.lastSave = now;
      try { sessionStorage.setItem("sf_s3d_pos", JSON.stringify({ x: C.pos.x / C.W, y: C.pos.y / C.H, home: C.homeState })); } catch (e) { /* ignore */ }
    }
  }

  function resize() {
    C.dpr = Math.min(window.devicePixelRatio || 1, isLite() ? 1 : 1.5);
    C.W = window.innerWidth; C.H = window.innerHeight;
    C.S = clamp(Math.min(C.W, C.H) * 0.2, 108, 176);
    C.renderer.setPixelRatio(C.dpr);
    C.renderer.setSize(C.W, C.H, false);
    const fov = 30;
    C.camZ = (C.H / 2) / Math.tan(fov / 2 * Math.PI / 180);
    C.camera.fov = fov; C.camera.aspect = C.W / C.H; C.camera.near = C.camZ * 0.35; C.camera.far = C.camZ * 2.2;
    C.camera.position.set(0, 0, C.camZ); C.camera.updateProjectionMatrix();
    if (sp.mat) sp.mat.uniforms.uDpr.value = C.dpr;
    C.pos.x = clampX(C.pos.x); C.pos.y = clampY(C.pos.y);
  }

  function frame(now) {
    C.raf = 0;
    if (!C.on || document.hidden) return;
    if (isLite() && now - C.lastRender < 33) { C.raf = requestAnimationFrame(frame); return; }
    const dt = Math.min(0.05, (now - C.last) / 1000 || 0.016);
    C.last = now; C.lastRender = now;
    try {
      update(dt, now);
      C.renderer.render(C.scene, C.camera);
    } catch (e) { console.error("shadow3d frame error", e); setEnabled(false, true); return; }
    C.raf = requestAnimationFrame(frame);
  }
  function kick() { if (C.ready && C.on && !C.raf && !document.hidden) { C.last = performance.now(); C.raf = requestAnimationFrame(frame); } }

  function setEnabled(on, silent) {
    C.on = !!on && C.ready;
    document.documentElement.classList.toggle("s3d-off", !C.on);
    if (!silent) { prefs.on = !!on; savePrefs(); }
    const t = document.getElementById("s3dToggle"); if (t) t.checked = C.on;
    if (C.on) kick();
  }

  /* ---------- input ---------- */
  function onMove(e) {
    if (e.pointerType === "touch") return;
    C.cursor.x = e.clientX; C.cursor.y = e.clientY; C.cursor.has = true; C.lastMove = performance.now();
  }
  function onDown(e) {
    if (!C.on || (e.pointerType !== "touch" && e.button !== 0)) return;
    const el = e.target && e.target.closest ? e.target : null;
    if (el && el.closest(IGNORE)) return;
    const x = e.clientX, y = e.clientY;
    C.cursor.x = x; C.cursor.y = y; C.cursor.has = true; C.lastMove = performance.now();
    const sc = C.S * depthScale(C.pos.y) * 0.72;
    if (Math.abs(x - C.pos.x) < sc * 0.9 && y < C.pos.y + 8 && y > C.pos.y - sc * 1.4) { poke(); return; }
    const hsc = C.S * 0.66;
    if (Math.abs(x - C.home.x) < hsc * 0.7 && Math.abs(y - C.home.y) < hsc * 0.6) {
      if (C.mood !== "focus") { if (C.homeState === "out") goHome(); else comeOut(); }
      return;
    }
    if (el && el.closest(INTERACTIVE)) return;
    if (C.mood !== "focus" && C.homeState === "out") throwBall(x, y);
  }
  function onDbl(e) {
    if (!C.on) return;
    const el = e.target && e.target.closest ? e.target : null;
    if (el && (el.closest(IGNORE) || el.closest(INTERACTIVE))) return;
    doTrick();
  }

  /* ---------- settings toggles + init ---------- */
  function injectSettings() {
    const pop = document.getElementById("settingsPop");
    if (!pop || document.getElementById("s3dToggle")) return;
    const row = (id, title, sub, on) => {
      const l = document.createElement("label");
      l.className = "set-row";
      l.innerHTML = "<span>" + title + " <small>" + sub + "</small></span><span class=\"switch\"><input type=\"checkbox\" id=\"" + id + "\"" + (on ? " checked" : "") + "><i></i></span>";
      pop.appendChild(l);
      return l.querySelector("input");
    };
    row("s3dToggle", "Pet companion", "3D dog that follows you around", C.on).addEventListener("change", (e) => setEnabled(e.target.checked));
    row("s3dSfx", "Pet sounds", "a little yip now and then", prefs.sfx).addEventListener("change", (e) => { prefs.sfx = e.target.checked; savePrefs(); });
  }

  function init() {
    try {
      C.canvas = document.createElement("canvas");
      C.canvas.id = "s3dCanvas"; C.canvas.setAttribute("aria-hidden", "true");
      document.body.appendChild(C.canvas);
      C.renderer = new THREE.WebGLRenderer({ canvas: C.canvas, alpha: true, antialias: !coarse, premultipliedAlpha: true, powerPreference: "low-power" });
      C.renderer.setClearColor(0x000000, 0);
    } catch (e) {
      console.warn("shadow3d: WebGL unavailable - keeping the 2D companion", e);
      if (C.canvas && C.canvas.parentNode) C.canvas.parentNode.removeChild(C.canvas);
      return;
    }
    C.canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); setEnabled(false, true); });

    const st = document.createElement("style");
    st.textContent =
      "#s3dCanvas{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:45}" +
      ".s3d-line{position:fixed;left:0;top:0;z-index:46;pointer-events:none;padding:7px 13px;border-radius:999px;white-space:nowrap;font-size:.82rem;font-weight:500;color:var(--ink,#eee);background:var(--panel-solid,#1a1530);border:1px solid var(--line,rgba(255,255,255,.14));box-shadow:var(--shadow,0 10px 30px rgba(0,0,0,.4));opacity:0;transition:opacity .25s}" +
      ".s3d-line.on{opacity:1}html.s3d-off #s3dCanvas,html.s3d-off .s3d-line{display:none}" +
      "@media (max-width:760px){.s3d-line{font-size:.74rem;padding:6px 11px}}";
    document.head.appendChild(st);
    C.line = document.createElement("div"); C.line.className = "s3d-line"; C.line.setAttribute("role", "status");
    document.body.appendChild(C.line);

    C.scene = new THREE.Scene();
    C.camera = new THREE.PerspectiveCamera(30, 1, 10, 5000);
    C.accent = C.rimHex = accentHex();
    setInterval(() => { C.accent = accentHex(); }, 1000);

    C.dog = buildDog({ rim: C.rimHex });
    C.scene.add(C.dog.root);
    C.house = buildHouse(C.rimHex);
    C.scene.add(C.house.root);
    C.ball = buildBall();
    C.scene.add(C.ball.root);

    resize();
    initSparks();

    let restored = false;
    try {
      const s = JSON.parse(sessionStorage.getItem("sf_s3d_pos") || "null");
      if (s && isFinite(s.x) && isFinite(s.y)) {
        C.pos.x = clampX(s.x * C.W); C.pos.y = clampY(s.y * C.H);
        if (s.home === "home" || s.home === "going") C.homeState = "going";
        restored = true;
      }
    } catch (e) { /* ignore */ }
    if (!restored) {
      C.pos.x = C.S * 0.7 + 10; C.pos.y = C.H - (C.W < 760 ? 104 : 26); C.enter = 0;
      setTimeout(() => { ring(C.pos.x, C.pos.y, C.S * 0.9, 0.8, null); burst(C.pos.x, C.pos.y - 8, 20, { speed: 180 }); }, 200);
    } else C.enter = 1;

    C.ready = true;
    window.addEventListener("resize", resize);
    document.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerdown", onDown, { capture: true, passive: true });
    document.addEventListener("dblclick", onDbl, { passive: true });
    document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(); });
    window.addEventListener("pagehide", () => { try { sessionStorage.setItem("sf_s3d_pos", JSON.stringify({ x: C.pos.x / C.W, y: C.pos.y / C.H, home: C.homeState })); } catch (e) { /* ignore */ } });

    const old = document.getElementById("companion");
    if (old && old.parentNode) old.parentNode.removeChild(old);

    setEnabled(prefs.on, true);
    injectSettings();
  }

  const api = { set: setMood, cheer: cheer, say: say };
  window.Shadow3D = { companion: api, setEnabled: setEnabled, throwBall: throwBall, doTrick: doTrick, goHome: goHome, comeOut: comeOut };
  if (window.SF) window.SF.companion = api;      // same API script.js already calls

  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();