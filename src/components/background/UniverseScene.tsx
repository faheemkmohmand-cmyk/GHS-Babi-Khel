import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { createFormulaTextures, createGlowTexture, type FormulaSet } from "./formulas";

/* ════════════════════════════════════════════════════════════════════════
   UNIVERSE SCENE — three.js + @react-three/fiber implementation
   ────────────────────────────────────────────────────────────────────────
   Loaded lazily (only this chunk pulls in three.js). Everything here is
   tuned for low-end mobile first:

   • LOW POLY          — icosahedron(detail 2) ≈ 320 tris per shell, ONE
                         shared geometry; ~8–12 bubbles ⇒ a few thousand
                         triangles total, ~20 draw calls.
   • CHEAP MATERIALS   — one tiny fresnel shader per shell (no lights, no
                         shadow maps, no post-processing), 3 sprite layers.
   • COMPOSITOR FRiend — softness lives in the shader math (fresnel +
                         low alpha), never in CSS filters.
   • dpr clamp         — 1.5 on touch devices, 1.75 on desktop.
   • CPU per frame     — a handful of sin/cos + one 48-point sparkle pool.
   • Pauses itself     — hidden tab, open dialog ([aria-modal]) or
                         reduced-motion (single static frame, frameloop
                         "demand").

   Layout contract: bubbles live on the fixed background layer BEHIND all
   content (wrapper has z-index:-1), so they can never sit on top of text;
   opaque cards naturally occlude them. Spawn positions are biased toward
   the screen edges so the reading column stays calm.
   ════════════════════════════════════════════════════════════════════════ */

const CAM_Z = 14;
const FOV = 55;

/** One shared low-poly shell geometry for every bubble. */
const SHELL_GEO = new THREE.IcosahedronGeometry(1, 2);

/** THREE.Color / Vector3 take fixed (r, g, b) arity — spreading a tuple
 *  into them is a TS error, so the palette goes through these adapters. */
const rgbColor = (t: readonly [number, number, number]) =>
  new THREE.Color(t[0], t[1], t[2]);

const isCoarse = () =>
  typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches;

const bubbleCount = () => (isCoarse() ? 7 : 12);

/* ── Shell shader — fresnel rim with a blue↔orange iridescent band ───── */

const SHELL_VERT = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

const SHELL_FRAG = /* glsl */ `
  uniform vec3 uBlue;
  uniform vec3 uOrange;
  uniform vec3 uBody;
  uniform float uPhase;
  uniform float uDark;
  uniform float uFade;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float ndv = abs(dot(normalize(vNormal), normalize(vView)));
    float fres = pow(1.0 - ndv, 2.4);
    // The iridescent band: angle + per-bubble phase decides where the
    // sheen reads blue and where it warms to tangerine.
    float band = 0.5 + 0.5 * sin(vNormal.x * 2.6 + vNormal.y * 1.9 + uPhase + vView.x * 2.4);
    vec3 irid = mix(uBlue, uOrange, band);
    vec3 col = uBody + irid * fres * (0.95 + uDark * 0.6);
    float a = (0.045 + fres * 0.55) * uFade;
    gl_FragColor = vec4(col, a);
  }
`;

const SPARK_VERT = /* glsl */ `
  attribute float aLife;
  uniform float uPix;
  uniform float uSize;
  varying float vLife;
  void main() {
    vLife = aLife;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize * uPix * (0.55 + 0.75 * aLife) / max(0.001, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const SPARK_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vLife;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    float a = smoothstep(0.5, 0.08, d) * vLife;
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor * (0.7 + 0.6 * vLife), a);
  }
`;

/* ── Theme palettes (authored raw — the shader bypasses tone mapping) ─── */

const PALETTE = {
  light: {
    blue: [0.32, 0.70, 0.92],
    orange: [0.99, 0.60, 0.32],
    body: [1.0, 0.99, 0.95],
    gold: [0.95, 0.68, 0.22],
  },
  dark: {
    blue: [0.42, 0.78, 1.0],
    orange: [1.0, 0.65, 0.36],
    body: [0.36, 0.31, 0.27],
    gold: [1.0, 0.76, 0.32],
  },
} as const;

/* ── Bubble spawn / world-position math ────────────────────────────────── */

interface BubbleSpec {
  ux: number; // normalized screen x, -1..1 (biased toward the edges)
  uy: number; // normalized screen y, -1..1
  z: number; // depth, -8 (far) .. 3 (near)
  radius: number;
  phase: number;
  speed: number;
  spinX: number;
  spinY: number;
  texIndex: number;
  parallax: number; // 0.4 (far) .. 1.6 (near) scroll factor
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);

function makeSpec(fromBottom = false): BubbleSpec {
  // Edge bias: keep |ux| ≥ 0.45 so the central reading column stays calm.
  const side = Math.random() < 0.5 ? -1 : 1;
  const ux = side * rand(0.45, 1.04);
  const z = rand(-8, 3);
  const depth = (z + 8) / 11; // 0 far .. 1 near
  return {
    ux,
    uy: fromBottom ? rand(-1.45, -1.2) : rand(-1.05, 1.05),
    z,
    radius: rand(0.62, 1.5) * (isCoarse() ? 0.9 : 1),
    phase: rand(0, Math.PI * 2),
    speed: rand(0.25, 0.55),
    spinX: Math.random() < 0.5 ? -1 : 1,
    spinY: Math.random() < 0.5 ? -1 : 1,
    texIndex: Math.floor(rand(0, 12)),
    parallax: 0.4 + depth * 1.2,
  };
}

/** Convert a spec + viewport aspect into world position + persp scale. */
function computeWorld(spec: BubbleSpec, aspect: number) {
  const halfH = Math.tan((FOV * Math.PI) / 360) * CAM_Z;
  const halfW = halfH * aspect;
  const scale = (CAM_Z - spec.z) / CAM_Z;
  return {
    x: spec.ux * halfW * scale,
    y: spec.uy * halfH * scale,
    z: spec.z,
    scale,
  };
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

interface ScrollState {
  target: number;
  smooth: number;
}

interface BubbleHandle {
  pop: () => THREE.Vector3 | null;
  getWorldPos: (out: THREE.Vector3) => THREE.Vector3;
}

/* ── SparkleField — pooled gold burst for bubble pops ────────────────────
   3 concurrent bursts × 14 particles, ONE Points object, one small
   shader. Positions/lives are mutated in place; nothing is allocated
   per frame or per burst. */

interface SparkleApi {
  burst: (origin: THREE.Vector3) => void;
}

const BURSTS = 3;
const PER_BURST = 14;
const SPARK_N = BURSTS * PER_BURST;
const SPARK_LIFE = 0.75; // seconds
const FLASH_LIFE = 0.35;

function SparkleField({
  apiRef,
  dark,
  staticMode,
}: {
  apiRef: React.MutableRefObject<SparkleApi | null>;
  dark: boolean;
  staticMode: boolean;
}) {
  const data = useMemo(() => {
    const positions = new Float32Array(SPARK_N * 3);
    const life = new Float32Array(SPARK_N);
    const vel = new Float32Array(SPARK_N * 3);
    // Park unused particles far away with zero life.
    positions.fill(9999);
    return { positions, life, vel, age: new Float32Array(BURSTS).fill(99), flashAge: 99 };
  }, []);
  const geoRef = useRef<THREE.BufferGeometry>(null);
  const pointsRef = useRef<THREE.Points>(null);
  const flashRef = useRef<THREE.Sprite>(null);
  const slot = useRef(0);

  const glowTex = useMemo(() => createGlowTexture(), []);
  const sparkMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SPARK_VERT,
        fragmentShader: SPARK_FRAG,
        uniforms: {
          uPix: { value: 1 },
          uSize: { value: 150 },
          uColor: { value: rgbColor(PALETTE.light.gold) },
        },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );
  const flashMat = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: glowTex,
        color: rgbColor(PALETTE.light.gold),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [glowTex],
  );

  // Theme + pixel ratio sync.
  useEffect(() => {
    const gold = dark ? PALETTE.dark.gold : PALETTE.light.gold;
    (sparkMat.uniforms.uColor.value as THREE.Color).setRGB(gold[0], gold[1], gold[2]);
    (flashMat.color as THREE.Color).setRGB(gold[0], gold[1], gold[2]);
  }, [dark, sparkMat, flashMat]);
  const { gl } = useThree();
  useEffect(() => {
    sparkMat.uniforms.uPix.value = gl.getPixelRatio();
  }, [gl, sparkMat]);

  // Expose the imperative burst() API to the Director.
  useEffect(() => {
    apiRef.current = {
      burst: (origin: THREE.Vector3) => {
        if (staticMode) return;
        const s = slot.current++ % BURSTS;
        data.age[s] = 0;
        for (let k = 0; k < PER_BURST; k++) {
          const i = s * PER_BURST + k;
          const a = Math.random() * Math.PI * 2;
          const sp = rand(2.0, 4.6);
          data.positions[i * 3] = origin.x + rand(-0.08, 0.08);
          data.positions[i * 3 + 1] = origin.y + rand(-0.08, 0.08);
          data.positions[i * 3 + 2] = origin.z + 0.3;
          data.vel[i * 3] = Math.cos(a) * sp;
          data.vel[i * 3 + 1] = Math.abs(Math.sin(a)) * sp * 0.8 + 1.1; // upward bias
          data.vel[i * 3 + 2] = rand(-0.6, 0.9);
          data.life[i] = 1;
        }
        if (flashRef.current) {
          flashRef.current.position.copy(origin);
          flashRef.current.position.z += 0.25;
          flashRef.current.scale.setScalar(0.35);
          data.flashAge = 0;
        }
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, data, staticMode]);

  useFrame((_, dt) => {
    if (staticMode) return;
    const step = Math.min(dt, 0.05);
    let anyActive = false;
    for (let s = 0; s < BURSTS; s++) {
      if (data.age[s] > SPARK_LIFE) continue;
      data.age[s] += step;
      anyActive = true;
      const done = data.age[s] >= SPARK_LIFE;
      for (let k = 0; k < PER_BURST; k++) {
        const i = s * PER_BURST + k;
        if (done) {
          data.life[i] = 0;
          continue;
        }
        const drag = Math.max(0, 1 - 1.9 * step);
        data.vel[i * 3] *= drag;
        data.vel[i * 3 + 1] = data.vel[i * 3 + 1] * drag - 4.2 * step;
        data.vel[i * 3 + 2] *= drag;
        data.positions[i * 3] += data.vel[i * 3] * step;
        data.positions[i * 3 + 1] += data.vel[i * 3 + 1] * step;
        data.positions[i * 3 + 2] += data.vel[i * 3 + 2] * step;
        data.life[i] = 1 - data.age[s] / SPARK_LIFE;
      }
    }
    if (anyActive && geoRef.current) {
      (geoRef.current.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (geoRef.current.attributes.aLife as THREE.BufferAttribute).needsUpdate = true;
    }
    if (data.flashAge < FLASH_LIFE && flashRef.current) {
      data.flashAge += step;
      const p = clamp01(data.flashAge / FLASH_LIFE);
      flashRef.current.scale.setScalar(0.35 + easeOutCubic(p) * 1.5);
      flashMat.opacity = 0.85 * (1 - p);
    } else if (flashMat.opacity !== 0) {
      flashMat.opacity = 0;
    }
  });

  return (
    <>
      <points ref={pointsRef} renderOrder={3} frustumCulled={false}>
        <bufferGeometry ref={geoRef}>
          <bufferAttribute attach="attributes-position" count={SPARK_N} array={data.positions} itemSize={3} />
          <bufferAttribute attach="attributes-aLife" count={SPARK_N} array={data.life} itemSize={1} />
        </bufferGeometry>
        <primitive object={sparkMat} attach="material" />
      </points>
      <sprite ref={flashRef} renderOrder={4} frustumCulled={false}>
        <primitive object={flashMat} attach="material" />
      </sprite>
    </>
  );
}

/* ── Bubble — one iridescent shell + one formula sprite ────────────────── */

function Bubble({
  spec: initialSpec,
  entranceDelay,
  formulas,
  dark,
  staticMode,
  scrollRef,
  registry,
}: {
  spec: BubbleSpec;
  entranceDelay: number;
  formulas: { light: FormulaSet; dark: FormulaSet };
  dark: boolean;
  staticMode: boolean;
  scrollRef: React.MutableRefObject<ScrollState>;
  registry: React.MutableRefObject<BubbleHandle[]>;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.Mesh>(null);
  const spriteRef = useRef<THREE.Sprite>(null);
  const specRef = useRef(initialSpec);
  // mode: entering | live | popping
  const modeRef = useRef<"entering" | "live" | "popping">("entering");
  const t0Ref = useRef(0); // entrance start (clock time)
  const popT0 = useRef(0);
  const frameT = useRef(0); // latest clock time, so pop() can timestamp
  const { size } = useThree();
  const aspect = size.width / Math.max(1, size.height);

  const shellMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SHELL_VERT,
        fragmentShader: SHELL_FRAG,
        uniforms: {
          uBlue: { value: new THREE.Vector3(PALETTE.light.blue[0], PALETTE.light.blue[1], PALETTE.light.blue[2]) },
          uOrange: { value: new THREE.Vector3(PALETTE.light.orange[0], PALETTE.light.orange[1], PALETTE.light.orange[2]) },
          uBody: { value: new THREE.Vector3(PALETTE.light.body[0], PALETTE.light.body[1], PALETTE.light.body[2]) },
          uPhase: { value: initialSpec.phase },
          uDark: { value: 0 },
          uFade: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [initialSpec.phase],
  );
  const spriteMat = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: formulas.light.textures[specRef.current.texIndex],
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    [formulas],
  );

  useEffect(() => () => {
    shellMat.dispose();
    spriteMat.dispose();
  }, [shellMat, spriteMat]);

  // Theme sync (uniforms + which formula set the sprite samples).
  useEffect(() => {
    const p = dark ? PALETTE.dark : PALETTE.light;
    (shellMat.uniforms.uBlue.value as THREE.Vector3).set(p.blue[0], p.blue[1], p.blue[2]);
    (shellMat.uniforms.uOrange.value as THREE.Vector3).set(p.orange[0], p.orange[1], p.orange[2]);
    (shellMat.uniforms.uBody.value as THREE.Vector3).set(p.body[0], p.body[1], p.body[2]);
    shellMat.uniforms.uDark.value = dark ? 1 : 0;
    spriteMat.map = (dark ? formulas.dark : formulas.light).textures[specRef.current.texIndex];
    spriteMat.needsUpdate = true;
  }, [dark, formulas, shellMat, spriteMat]);

  const applyWorld = (t: number) => {
    const g = groupRef.current;
    if (!g) return;
    const spec = specRef.current;
    const w = computeWorld(spec, aspect);
    const e = clamp01((t - t0Ref.current) / 1.4);
    // Entrance complete → hand the bubble over to the live state machine
    // (pop picking only accepts "live" bubbles).
    if (modeRef.current === "entering" && e >= 1) modeRef.current = "live";
    const ease = easeOutCubic(e);
    // Entrance: float up from just below the spawn point.
    g.position.set(w.x, w.y - (1 - ease) * 2.4 * w.scale, w.z);
    const alphaMul = Math.min(1, e * 1.8);
    let fade = alphaMul;
    let popScale = 1;
    if (modeRef.current === "popping") {
      const p = clamp01((t - popT0.current) / 0.55);
      popScale = 1 + 0.3 * easeOutCubic(Math.min(1, p * 1.5));
      fade = alphaMul * (1 - clamp01(p * 1.9));
      if (p >= 1) {
        // Respawn below the viewport with a fresh glyph + character.
        specRef.current = makeSpec(true);
        const ns = specRef.current;
        shellMat.uniforms.uPhase.value = ns.phase;
        spriteMat.map = (dark ? formulas.dark : formulas.light).textures[ns.texIndex];
        t0Ref.current = t;
        modeRef.current = "entering";
        fade = 0;
        popScale = 1;
      }
    }
    g.scale.setScalar(spec.radius * popScale);
    shellMat.uniforms.uFade.value = fade;
    spriteMat.opacity = 0.52 * fade;
    return { w, ease };
  };

  // Initial placement (also covers resize + static mode re-layout).
  useEffect(() => {
    t0Ref.current = entranceDelay;
    applyWorld(entranceDelay);
    if (staticMode) {
      // One calm, composed arrangement — no motion at all.
      const g = groupRef.current!;
      const spec = specRef.current;
      const w = computeWorld(spec, aspect);
      g.position.set(w.x, w.y, w.z);
      shellMat.uniforms.uFade.value = 0.85;
      spriteMat.opacity = 0.44;
      if (meshRef.current) {
        meshRef.current.rotation.set(spec.phase * 0.4, spec.phase * 0.7, 0);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect, staticMode, entranceDelay]);

  // Register the imperative handle for the Director's tap picking.
  useEffect(() => {
    const handle: BubbleHandle = {
      getWorldPos: (out) => groupRef.current!.getWorldPosition(out),
      pop: () => {
        if (modeRef.current !== "live") return null;
        modeRef.current = "popping";
        popT0.current = frameT.current;
        const out = new THREE.Vector3();
        groupRef.current!.getWorldPosition(out);
        return out;
      },
    };
    registry.current.push(handle);
    return () => {
      const i = registry.current.indexOf(handle);
      if (i >= 0) registry.current.splice(i, 1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state, dt) => {
    frameT.current = state.clock.elapsedTime;
    if (staticMode) return;
    const g = groupRef.current!;
    const mesh = meshRef.current!;
    const sprite = spriteRef.current!;
    const spec = specRef.current;
    const placed = applyWorld(state.clock.elapsedTime);
    if (!placed) return;
    const t = state.clock.elapsedTime;
    const { w, ease } = placed;

    // Gentle idle drift — a slow Lissajous bob, unique per bubble.
    const live = modeRef.current === "live";
    const motion = live ? 1 : 0.4; // keep a whisper of life while entering
    const bobY = Math.sin(t * spec.speed + spec.phase) * 0.34 * w.scale * motion;
    const bobX = Math.cos(t * spec.speed * 0.77 + spec.phase * 1.7) * 0.2 * w.scale * motion;
    // Scroll parallax — far bubbles drift less, near bubbles more.
    const scroll = scrollRef.current.smooth;
    const parY = -scroll * 0.0011 * spec.parallax;
    g.position.x += bobX;
    g.position.y += bobY + parY * (modeRef.current === "entering" ? ease : 1);

    // Slow tumble + a whisper of scroll-driven rotation.
    mesh.rotation.x += dt * 0.055 * spec.spinX;
    mesh.rotation.y += dt * 0.07 * spec.spinY;
    mesh.rotation.z = scroll * 0.00012 * spec.parallax;
    // Formula sprite spins lazily the other way.
    sprite.material.rotation += dt * 0.035 * -spec.spinY;
  });

  return (
    <group ref={groupRef}>
      <mesh ref={meshRef} geometry={SHELL_GEO} material={shellMat} renderOrder={1} />
      <sprite ref={spriteRef} material={spriteMat} renderOrder={2} scale={[1.7, 0.85, 1]} />
    </group>
  );
}

/* ── Director — scroll smoothing, tap-to-pop picking ─────────────────────
   Lives inside the Canvas but renders nothing. Owns the listeners:
   • scroll (passive) → smoothed parallax target
   • pointerdown/up   → tap detection (touch taps verified as quick taps
     so scroll-swipes NEVER pop a bubble), ignores taps that land on any
     interactive element, then pops the NEAREST bubble by screen distance
     and fires the gold sparkle at its world position. */

function Director({
  scrollRef,
  registry,
  sparkleRef,
  staticMode,
  pausedRef,
}: {
  scrollRef: React.MutableRefObject<ScrollState>;
  registry: React.MutableRefObject<BubbleHandle[]>;
  sparkleRef: React.MutableRefObject<SparkleApi | null>;
  staticMode: boolean;
  pausedRef: React.MutableRefObject<boolean>;
}) {
  const { camera, size } = useThree();
  const pendingTap = useRef<{ x: number; y: number; t: number } | null>(null);

  useEffect(() => {
    if (staticMode) return;
    const onScroll = () => {
      scrollRef.current.target = window.scrollY;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staticMode]);

  useEffect(() => {
    if (staticMode) return;

    const interactive = (el: EventTarget | null): boolean => {
      const node = el as Element | null;
      if (!node || typeof node.closest !== "function") return false;
      return !!node.closest(
        'button,a,input,textarea,select,label,[role="button"],[role="menuitem"],[data-no-pop]',
      );
    };

    const popNearest = (px: number, py: number) => {
      if (pausedRef.current || registry.current.length === 0) return;
      const cam = camera as THREE.PerspectiveCamera;
      const tmp = new THREE.Vector3();
      let best: BubbleHandle | null = null;
      let bestD2 = Infinity;
      for (const h of registry.current) {
        h.getWorldPos(tmp);
        if (tmp.z > CAM_Z - 1) continue;
        tmp.project(cam);
        const sx = (tmp.x * 0.5 + 0.5) * size.width;
        const sy = (-tmp.y * 0.5 + 0.5) * size.height;
        const d2 = (sx - px) * (sx - px) + (sy - py) * (sy - py);
        if (d2 < bestD2) {
          bestD2 = d2;
          best = h;
        }
      }
      if (!best) return;
      const origin = best.pop();
      if (origin) sparkleRef.current?.burst(origin);
    };

    const onDown = (e: PointerEvent) => {
      if (interactive(e.target)) return;
      if (e.pointerType === "touch") {
        // Defer to pointerup — a scroll swipe starts exactly like a tap.
        pendingTap.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      } else {
        popNearest(e.clientX, e.clientY);
      }
    };
    const onUp = (e: PointerEvent) => {
      const p = pendingTap.current;
      pendingTap.current = null;
      if (!p) return;
      const dt = performance.now() - p.t;
      const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (dt < 320 && dist < 14) popNearest(e.clientX, e.clientY);
    };
    const onCancel = () => {
      pendingTap.current = null;
    };

    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staticMode, size.width, size.height]);

  useFrame((_, dt) => {
    if (staticMode) return;
    const s = scrollRef.current;
    s.smooth += (s.target - s.smooth) * Math.min(1, dt * 5);
  });

  return null;
}

/* ── SceneContents — wires everything together ─────────────────────────── */

function SceneContents({ staticMode, paused }: { staticMode: boolean; paused: boolean }) {
  const registry = useRef<BubbleHandle[]>([]);
  const sparkleRef = useRef<SparkleApi | null>(null);
  const scrollRef = useRef<ScrollState>({ target: 0, smooth: 0 });
  // Keep the pause flag in a stable ref the Director can read from its
  // event listeners without re-binding them.
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  // Theme sync — the site toggles .dark / .theme-lantern on <html>.
  const [dark, setDark] = useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark"),
  );
  useEffect(() => {
    const root = document.documentElement;
    const read = () =>
      setDark(
        root.classList.contains("dark") || root.classList.contains("theme-lantern"),
      );
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // Both formula sets are built once and shared; theme flips just swap maps.
  const formulas = useMemo(() => {
    if (typeof document === "undefined") return null;
    return { light: createFormulaTextures("light"), dark: createFormulaTextures("dark") };
  }, []);
  useEffect(
    () => () => {
      formulas?.light.dispose();
      formulas?.dark.dispose();
    },
    [formulas],
  );

  // NOTE: hooks above this line always run — no conditional hooks.
  const specs = useMemo(
    () => Array.from({ length: bubbleCount() }, () => makeSpec()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (!formulas) return null;

  return (
    <>
      <Director
        scrollRef={scrollRef}
        registry={registry}
        sparkleRef={sparkleRef}
        staticMode={staticMode}
        pausedRef={pausedRef}
      />
      {specs.map((spec, i) => (
        <Bubble
          key={i}
          spec={spec}
          entranceDelay={i * 0.28}
          formulas={formulas}
          dark={dark}
          staticMode={staticMode}
          scrollRef={scrollRef}
          registry={registry}
        />
      ))}
      <SparkleField apiRef={sparkleRef} dark={dark} staticMode={staticMode} />
    </>
  );
}

/* ── Public entry — the <Canvas> wrapper ────────────────────────────────── */

const UniverseScene = ({ staticMode }: { staticMode: boolean }) => {
  // Pause the whole loop while a modal dialog is open (Grand Reveal,
  // Scratch & Shine, any Radix dialog) or the tab is hidden — those
  // moments get 100% of the GPU. An interval, not a frame hook, so it
  // keeps working even while frameloop is "never".
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (staticMode) return;
    const check = () =>
      setPaused(
        document.hidden || !!document.querySelector('[aria-modal="true"]'),
      );
    check();
    const iv = setInterval(check, 450);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", check);
    };
  }, [staticMode]);

  const dpr = useMemo<[number, number]>(() => {
    const base = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    return [1, Math.min(base, isCoarse() ? 1.5 : 1.75)];
  }, []);

  const glProps = useMemo(
    () => ({
      antialias: false,
      alpha: true,
      stencil: false,
      powerPreference: "low-power" as const,
    }),
    [],
  );

  return (
    <Canvas
      flat
      dpr={dpr}
      gl={glProps}
      camera={{ fov: FOV, position: [0, 0, CAM_Z], near: 0.1, far: 60 }}
      frameloop={staticMode ? "demand" : paused ? "never" : "always"}
      style={{ pointerEvents: "none" }}
    >
      <SceneContents staticMode={staticMode} paused={paused} />
    </Canvas>
  );
};

export default UniverseScene;
