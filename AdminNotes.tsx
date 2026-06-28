import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { RichTextEditor } from "@/components/notes/RichTextEditor";
import { HtmlPasteEditor } from "@/components/notes/HtmlPasteEditor";
import { SRSReviewPanel } from "@/components/notes/SRSReviewPanel";
const AdminTests = lazy(() => import("../admin/tabs/AdminTests"));
import {
  useNoteSubjects, useNoteChapters, useNoteQuiz, useNoteQuestions,
  useFlashcards, useMutateSubject, useMutateChapter, useMutateQuestion, useMutateFlashcard,
  useStudentSearch, type StudentLite,
  NoteSubject, NoteChapter, NoteQuestion, Flashcard
} from "@/hooks/useNotes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Plus, Pencil, Trash2, BookOpen, ChevronRight, ArrowLeft,
  Loader2, Save, Zap, HelpCircle, RotateCcw, Play, Eye, EyeOff,
  Brain, ClipboardCheck, Code2, PencilLine, Search, X, User as UserIcon
} from "lucide-react";
import toast from "react-hot-toast";

type View = "subjects" | "chapters" | "chapter-edit" | "quiz" | "flashcards";

// ── Animation wrapper — Three.js r128 + p5.js universal patcher ──────────────
// This is used for admin preview. Identical logic to ChapterPage buildSrcDoc.
// Patches ANY valid Three.js code to work: handles wrong container ids,
// document.body.appendChild, ES module imports, missing window.__renderer etc.
function wrapP5Code(code: string): string {
  const trimmedLower = code.trim().toLowerCase();

  const isThree = /\bTHREE\s*\./.test(code)
    || /new\s+THREE\s*\./.test(code)
    || /import\s+.*['"']three['"]/.test(code)
    || /require\s*\(\s*['"]three['"]\s*\)/.test(code);

  const isP5 = /\bfunction\s+setup\s*\(/.test(code) || /\bfunction\s+draw\s*\(/.test(code);

  function patchThreeCode(src: string): string {
    let out = src;

    // ── Sanitize invalid JS lines FIRST (before any other processing) ────────
    // Users often write decorative headers like: === MY CODE === or =========
    // These are syntax errors in JS (=== needs operands).
    // Also strip lines that are pure punctuation separators: ---, ***, ###, etc.
    out = out.split('\n').map(line => {
      const t = line.trim();
      // Line is just punctuation/separator: ===, ---, ***, ###, ===...===
      if (/^[=\-*#~^]{3,}.*[=\-*#~^]{0,}$/.test(t) && !/^(const|let|var|if|for|while|function|class|return|import|export|\/\/)/.test(t)) {
        return '// ' + line; // convert to comment
      }
      // Line starts with === but is not a real JS expression (no identifier/keyword before it)
      if (/^={2,}/.test(t)) {
        return '// ' + line;
      }
      return line;
    }).join('\n');

    // Strip ES module imports (THREE is global from CDN)
    out = out.replace(/^\s*import\s+[\s\S]*?from\s+['"]three['"]\s*;?\s*$/gm, '// [three.js loaded from CDN]');
    out = out.replace(/^\s*import\s+[\s\S]*?from\s+['"]https?:\/\/[^'"]+three[^'"]*['"]\s*;?\s*$/gm, '// [three.js loaded from CDN]');
    out = out.replace(/^\s*import\s+[\s\S]*?from\s+['"][^'"]*three[^'"]*['"]\s*;?\s*$/gm, '// [addon import skipped]');
    // Fix container: document.body.appendChild → #c
    out = out.replace(
      /document\.body\.appendChild\s*\(\s*renderer\.domElement\s*\)/g,
      'document.getElementById("c").appendChild(renderer.domElement)'
    );
    out = out.replace(
      /document\.body\.append\s*\(\s*renderer\.domElement\s*\)/g,
      'document.getElementById("c").append(renderer.domElement)'
    );
    // Fix wrong container ids
    out = out.replace(
      /document\.getElementById\s*\(\s*["'](container|canvas-container|webgl|scene|app|root|three-container|mount|canvas)["']\s*\)/g,
      'document.getElementById("c")'
    );
    out = out.replace(
      /document\.querySelector\s*\(\s*["']#(container|canvas-container|webgl|scene|app|root|three-container|mount|canvas)["']\s*\)/g,
      'document.getElementById("c")'
    );
    // Auto-register renderer
    out = out.replace(
      /((?:const|let|var)\s+(\w+)\s*=\s*new\s+THREE\.WebGLRenderer\s*\([^)]*\))/g,
      (match: string, fullAssign: string, varName: string) => fullAssign + '; window.__renderer = ' + varName
    );
    out = out.replace(
      /(^|[\n;,\s])(renderer\s*=\s*new\s+THREE\.WebGLRenderer\s*\([^)]*\))/gm,
      (match: string, pre: string, assign: string) => pre + assign + '; window.__renderer = renderer'
    );
    // Auto-register camera
    out = out.replace(
      /((?:const|let|var)\s+(\w+)\s*=\s*new\s+THREE\.PerspectiveCamera\s*\([^)]*\))/g,
      (match: string, fullAssign: string, varName: string) => fullAssign + '; window.__camera = ' + varName
    );
    out = out.replace(
      /(^|[\n;,\s])(camera\s*=\s*new\s+THREE\.PerspectiveCamera\s*\([^)]*\))/gm,
      (match: string, pre: string, assign: string) => pre + assign + '; window.__camera = camera'
    );
    // Stub OrbitControls
    if (/OrbitControls/.test(out)) {
      out = 'if(!THREE.OrbitControls){THREE.OrbitControls=function(cam,el){this.enableDamping=false;this.dampingFactor=0.05;this.update=function(){};this.dispose=function(){};};}'
        + '\n' + out;
    }
    return out;
  }

  if (trimmedLower.startsWith("<!doctype") || trimmedLower.startsWith("<html")) {
    let html = code;
    if (isThree) {
      html = html.replace(
        /(<script(?![^>]*src)[^>]*>)([\s\S]*?)(<\/script>)/gi,
        (_: string, open: string, js: string, close: string) => open + patchThreeCode(js) + close
      );
      if (!html.includes('three.js') && !html.includes('three.min.js')) {
        html = html.replace('</head>', '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></scr'+'ipt>\n</head>');
      }
    }
    return html;
  }

  const resizeHelper = [
    'window.__container = document.getElementById("c") || document.body;',
    'window.addEventListener("resize", function() {',
    '  if (typeof onWindowResize === "function") { onWindowResize(); return; }',
    '  if (window.__renderer) {',
    '    var w = window.__container.clientWidth || innerWidth;',
    '    var h = window.__container.clientHeight || innerHeight;',
    '    window.__renderer.setSize(w, h);',
    '    if (window.__camera) { window.__camera.aspect = w / h; window.__camera.updateProjectionMatrix(); }',
    '  }',
    '});',
  ].join('\n');

  if (isThree) {
    const safeCode = patchThreeCode(code).replace(/<\/script>/gi, "<\\/script>");
    return [
      '<!DOCTYPE html><html><head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">',
      '<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:#0a0a1a}body{position:relative}#c{position:fixed;top:0;left:0;width:100%;height:100%;overflow:hidden}#c canvas{display:block!important;outline:none;touch-action:none}</style>',
      '</head>','<body>','<script>window.onerror=function(msg,src,line,col,err){','var d=document.createElement("div");','d.style="position:fixed;top:0;left:0;right:0;background:#c00;color:#fff;font:13px monospace;padding:10px;z-index:9999;white-space:pre-wrap";','d.textContent="JS Error: "+msg+"\\nLine: "+line+(err?"\\n"+err.stack:"");','document.body.appendChild(d);return false;};','</script>','<div id="c"></div>',
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></scr'+'ipt>',
      '<script>',
      resizeHelper,
      safeCode,
      '</script></body></html>',
    ].join('\n');
  }

  if (isP5) {
    const safeP5 = patch2DCode(code).replace(/<\/script>/gi, "<\\/script>");
    return [
      '<!DOCTYPE html><html><head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">',
      '<style>*{margin:0;padding:0}html,body{width:100%;height:100%;overflow:hidden;background:#f8f9ff}canvas{display:block;touch-action:none;width:100%!important;height:100%!important}</style>',
      '</head><body>',
      '<script>window.onerror=function(msg,src,line,col,err){var d=document.createElement("div");d.style="position:fixed;top:0;left:0;right:0;background:#c00;color:#fff;font:13px monospace;padding:10px;z-index:9999;white-space:pre-wrap";d.textContent="JS Error: "+msg+"\\nLine: "+line+(err?"\\n"+err.stack:"");document.body.appendChild(d);return false;};</script>',
      '<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.4/p5.min.js"></scr'+'ipt>',
      '<script>function windowResized(){if(typeof resizeCanvas==="function")resizeCanvas(windowWidth,windowHeight);}',
      safeP5,
      '</script></body></html>',
    ].join('\n');
  }

  // ── 2D / Vanilla JS — detect what kind of 2D code it is ─────────────────
  const isCanvas2D = /getContext\s*\(\s*["\'](2d)["\']/i.test(code)
    || /new\s+CanvasRenderingContext2D/.test(code)
    || /ctx\.(fillRect|arc|beginPath|strokeRect|clearRect|drawImage|fillText)/.test(code);

  const isGSAP  = /\bgsap\b/i.test(code) || /\bTween(Max|Lite|Line)?\b/.test(code);
  const isAnime = /\banime\s*\(/.test(code) || /\banime\./.test(code);
  const isD3    = /\bd3\s*\./.test(code);
  const isSVG   = /<svg/i.test(code);

  // Patch 2D code: fix canvas sizing, fix container references
  function patch2DCode(src: string): string {
    let out = src;
    // Sanitize invalid JS lines (same as 3D)
    out = out.split('\n').map(line => {
      const t = line.trim();
      if (!t) return line;
      if (/^[=\-*#~^]{3,}/.test(t) && !/^(const|let|var|if|for|while|function|class|return|import|export|\/\/)/.test(t)) return '// ' + line;
      if (/^={2,}/.test(t)) return '// ' + line;
      return line;
    }).join('\n');
    // Fix document.body references to use #main-container
    out = out.replace(/document\.body\.appendChild\s*\(/g, 'document.getElementById("main-container").appendChild(');
    out = out.replace(/document\.body\.append\s*\(/g, 'document.getElementById("main-container").append(');
    out = out.replace(/document\.body\.prepend\s*\(/g, 'document.getElementById("main-container").prepend(');
    // Fix getElementById for common container names
    out = out.replace(
      /document\.getElementById\s*\(\s*["\'](container|canvas-container|app|root|mount|wrapper|scene|main)["\']/g,
      'document.getElementById("main-container"'
    );
    out = out.replace(
      /document\.querySelector\s*\(\s*["\'](#container|#app|#root|#mount|#wrapper|body)["\']/g,
      'document.getElementById("main-container"'
    );
    return out;
  }

  const safeVanilla = patch2DCode(code).replace(/<\/script>/gi, "<\\/script>");

  // External CDN libraries for common 2D libraries
  const extraLibs: string[] = [];
  if (isGSAP)  extraLibs.push('<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js"></scr'+'ipt>');
  if (isAnime) extraLibs.push('<script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js"></scr'+'ipt>');
  if (isD3)    extraLibs.push('<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></scr'+'ipt>');

  return [
    '<!DOCTYPE html><html><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">',
    '<style>',
    '*{margin:0;padding:0;box-sizing:border-box}',
    'html,body{width:100%;height:100%;overflow:hidden;background:#0a0a1a;font-family:sans-serif}',
    // Canvas fills viewport automatically
    'canvas{display:block;touch-action:none}',
    'canvas:not([style]){width:100%!important;height:100%!important}',
    '#main-container{position:fixed;top:0;left:0;width:100%;height:100%;overflow:hidden}',
    '</style>',
    '</head>',
    '<body>',
    '<script>',
    // Error handler
    'window.onerror=function(msg,src,line,col,err){',
    '  var d=document.createElement("div");',
    '  d.style="position:fixed;top:0;left:0;right:0;background:#c00;color:#fff;font:13px monospace;padding:10px;z-index:9999;white-space:pre-wrap";',
    '  d.textContent="JS Error: "+msg+"\\nLine: "+line+(err?"\\n"+err.stack:"");',
    '  document.body.appendChild(d);return false;',
    '};',
    '</script>',
    '<div id="main-container"></div>',
    ...extraLibs,
    '<script>',
    // Helpers: make innerWidth/innerHeight always correct
    'Object.defineProperty(window,"innerWidth",{get:function(){return document.documentElement.clientWidth||window.screen.width;}});',
    'Object.defineProperty(window,"innerHeight",{get:function(){return document.documentElement.clientHeight||window.screen.height;}});',
    // Auto-resize helper
    'window.addEventListener("resize",function(){',
    '  var cnvs=document.querySelectorAll("canvas");',
    '  cnvs.forEach(function(c){',
    '    if(!c.style.width&&!c.style.height){',
    '      c.width=innerWidth;c.height=innerHeight;',
    '    }',
    '  });',
    '  if(typeof onWindowResize==="function") onWindowResize();',
    '  if(typeof windowResized==="function") windowResized();',
    '});',
    '</script>',
    '<script>',
    safeVanilla,
    '</script>',
    '</body></html>',
  ].join('\n');
}

// ── Three.js animation templates ────────────────────────────────────────────
const THREE_TEMPLATES: Record<string, { label: string; emoji: string; code: string }> = {
  orbit3d: {
    label: "Atom / Orbit",
    emoji: "⚛️",
    code: `// Three.js — Atom with orbiting electrons
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
document.getElementById("c").appendChild(renderer.domElement);
window.__renderer = renderer; window.__camera = camera;

// Nucleus
const nucleus = new THREE.Mesh(
  new THREE.SphereGeometry(0.6, 32, 32),
  new THREE.MeshPhongMaterial({ color:0xff4444, emissive:0x881111 })
);
scene.add(nucleus);

// Orbit rings + electrons
const orbits = [1.8, 2.8, 3.8];
const colors = [0x4488ff, 0x44ff88, 0xffaa44];
const electrons = [];
orbits.forEach((r, i) => {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(r, 0.03, 8, 64),
    new THREE.MeshBasicMaterial({ color: colors[i], opacity:0.4, transparent:true })
  );
  ring.rotation.x = Math.PI/2 + i * 0.5;
  ring.rotation.y = i * 1.2;
  scene.add(ring);

  const e = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 16, 16),
    new THREE.MeshPhongMaterial({ color: colors[i], emissive: colors[i] })
  );
  e.userData = { r, speed: 0.8 + i*0.3, angle: i*2.1, ring };
  scene.add(e);
  electrons.push(e);
});

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.4));
const dLight = new THREE.DirectionalLight(0xffffff, 1);
dLight.position.set(5,5,5);
scene.add(dLight);
scene.add(new THREE.PointLight(0x4488ff, 0.8, 10));

camera.position.set(0, 2, 7);
camera.lookAt(0,0,0);

// Labels (HTML overlay)
const label = document.createElement("div");
label.style.cssText="position:absolute;bottom:16px;left:0;right:0;text-align:center;color:#fff;font:bold 14px sans-serif;text-shadow:0 0 8px #000;pointer-events:none";
label.textContent="⚛️  Atomic Model — Electrons orbiting Nucleus";
document.getElementById("c").appendChild(label);

let t = 0;
function animate() {
  requestAnimationFrame(animate);
  t += 0.016;
  nucleus.rotation.y = t * 0.5;
  electrons.forEach(e => {
    e.userData.angle += e.userData.speed * 0.016;
    const a = e.userData.angle;
    const r = e.userData.r;
    const rx = e.userData.ring.rotation.x;
    const ry = e.userData.ring.rotation.y;
    // Place electron on its tilted orbit
    e.position.set(
      r * Math.cos(a) * Math.cos(ry) - r * Math.sin(a) * Math.sin(ry),
      r * Math.sin(a) * Math.sin(rx),
      r * Math.cos(a) * Math.sin(ry) + r * Math.sin(a) * Math.cos(ry)
    );
  });
  scene.rotation.y = t * 0.1;
  renderer.render(scene, camera);
}
animate();`,
  },
  wave3d: {
    label: "Wave / SHM",
    emoji: "🌊",
    code: `// Three.js — 3D Standing Wave (Physics)
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);
const camera = new THREE.PerspectiveCamera(55, innerWidth/innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(innerWidth, innerHeight);
document.getElementById("c").appendChild(renderer.domElement);
window.__renderer=renderer; window.__camera=camera;

// Wave particles
const N = 80;
const geometry = new THREE.BufferGeometry();
const positions = new Float32Array(N * 3);
const geometry2 = new THREE.BufferGeometry();
const pos2 = new Float32Array(N * 3);

for(let i=0;i<N;i++){
  positions[i*3]   = (i/N)*12 - 6;
  positions[i*3+1] = 0;
  positions[i*3+2] = 0;
  pos2[i*3]   = (i/N)*12 - 6;
  pos2[i*3+1] = 0;
  pos2[i*3+2] = 2;
}
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
geometry2.setAttribute('position', new THREE.BufferAttribute(pos2, 3));

const mat1 = new THREE.LineBasicMaterial({ color:0x4488ff, linewidth:2 });
const mat2 = new THREE.LineBasicMaterial({ color:0xff6644, linewidth:2 });
scene.add(new THREE.Line(geometry, mat1));
scene.add(new THREE.Line(geometry2, mat2));

// Axis
const axisGeo = new THREE.BufferGeometry().setFromPoints([
  new THREE.Vector3(-6,0,0), new THREE.Vector3(6,0,0)
]);
scene.add(new THREE.Line(axisGeo, new THREE.LineBasicMaterial({color:0x334466})));

// Lights
scene.add(new THREE.AmbientLight(0xffffff,0.5));
scene.add(new THREE.PointLight(0x4488ff, 1, 20));

camera.position.set(0, 3, 8);
camera.lookAt(0,0,1);

// Label
const lbl = document.createElement("div");
lbl.style.cssText="position:absolute;bottom:12px;left:0;right:0;text-align:center;color:#88aaff;font:bold 13px monospace;pointer-events:none";
lbl.innerHTML="y = A·sin(kx − ωt) &nbsp;|&nbsp; Transverse Wave";
document.getElementById("c").appendChild(lbl);

let t=0;
function animate(){
  requestAnimationFrame(animate); t+=0.02;
  const pos=geometry.attributes.position;
  const pos2a=geometry2.attributes.position;
  for(let i=0;i<N;i++){
    const x=(i/N)*12-6;
    pos.setY(i, 1.2*Math.sin(x*1.2-t));
    pos2a.setY(i, 0.8*Math.sin(x*1.5-t*1.3+1));
  }
  pos.needsUpdate=true; pos2a.needsUpdate=true;
  scene.rotation.y=Math.sin(t*0.15)*0.3;
  renderer.render(scene,camera);
}
animate();`,
  },
  solar3d: {
    label: "Solar System",
    emoji: "🪐",
    code: `// Three.js — Mini Solar System
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000008);
const camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(innerWidth, innerHeight);
document.getElementById("c").appendChild(renderer.domElement);
window.__renderer=renderer; window.__camera=camera;

// Stars
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(3000);
for(let i=0;i<3000;i++) starPos[i]=(Math.random()-0.5)*200;
starGeo.setAttribute('position',new THREE.BufferAttribute(starPos,3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({color:0xffffff,size:0.15})));

// Sun
const sun = new THREE.Mesh(
  new THREE.SphereGeometry(1.2,32,32),
  new THREE.MeshBasicMaterial({color:0xffcc00})
);
scene.add(sun);
scene.add(new THREE.PointLight(0xffee88, 2, 60));

// Planets: [name, radius, orbitR, speed, color]
const planets = [
  ['Mercury',0.18,2.5,2.0,0xaaaaaa],
  ['Venus',  0.28,4.0,1.3,0xffaa44],
  ['Earth',  0.30,5.8,1.0,0x4488ff],
  ['Mars',   0.22,7.5,0.6,0xff4422],
  ['Jupiter',0.60,10.5,0.25,0xddaa77],
];

const planetMeshes = planets.map(([name,r,orbit,speed,color])=>{
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(r,24,24),
    new THREE.MeshPhongMaterial({color})
  );
  // Orbit ring
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(orbit,0.02,4,96),
    new THREE.MeshBasicMaterial({color:0x334455,opacity:0.5,transparent:true})
  );
  ring.rotation.x=Math.PI/2;
  scene.add(ring);
  scene.add(mesh);
  return {mesh,orbit,speed,angle:Math.random()*Math.PI*2};
});

scene.add(new THREE.AmbientLight(0xffffff,0.15));
camera.position.set(0,8,18);
camera.lookAt(0,0,0);

function animate(){
  requestAnimationFrame(animate);
  sun.rotation.y+=0.005;
  planetMeshes.forEach(p=>{
    p.angle+=p.speed*0.008;
    p.mesh.position.set(Math.cos(p.angle)*p.orbit,0,Math.sin(p.angle)*p.orbit);
    p.mesh.rotation.y+=0.02;
  });
  renderer.render(scene,camera);
}
animate();`,
  },
  dna3d: {
    label: "DNA Helix",
    emoji: "🧬",
    code: `// Three.js — DNA Double Helix
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x04081a);
const camera = new THREE.PerspectiveCamera(50, innerWidth/innerHeight, 0.1, 100);
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(innerWidth, innerHeight);
document.getElementById("c").appendChild(renderer.domElement);
window.__renderer=renderer; window.__camera=camera;

const N = 60;
const pairs = [0xff4488,0x44ffaa,0xffcc44,0x4488ff];

for(let i=0;i<N;i++){
  const t = (i/N)*Math.PI*8 - Math.PI*4;
  const y = (i/N)*10 - 5;

  // Strand A
  const sA = new THREE.Mesh(
    new THREE.SphereGeometry(0.12,12,12),
    new THREE.MeshPhongMaterial({color:0x4488ff,emissive:0x112244})
  );
  sA.position.set(Math.cos(t)*1.2, y, Math.sin(t)*1.2);
  scene.add(sA);

  // Strand B (180° offset)
  const sB = new THREE.Mesh(
    new THREE.SphereGeometry(0.12,12,12),
    new THREE.MeshPhongMaterial({color:0xff4488,emissive:0x441122})
  );
  sB.position.set(Math.cos(t+Math.PI)*1.2, y, Math.sin(t+Math.PI)*1.2);
  scene.add(sB);

  // Base pair connector (every 3)
  if(i%3===0){
    const points=[sA.position.clone(), sB.position.clone()];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const color = pairs[Math.floor(i/3)%4];
    scene.add(new THREE.Line(geo, new THREE.LineBasicMaterial({color,opacity:0.7,transparent:true})));

    // Base pair sphere
    const mid = sA.position.clone().lerp(sB.position,0.5);
    const bp = new THREE.Mesh(
      new THREE.SphereGeometry(0.09,8,8),
      new THREE.MeshBasicMaterial({color})
    );
    bp.position.copy(mid);
    scene.add(bp);
  }
}

scene.add(new THREE.AmbientLight(0xffffff,0.4));
scene.add(new THREE.PointLight(0x4488ff,1.5,20));
scene.add(new THREE.PointLight(0xff4488,1.0,20));

camera.position.set(4,0,8);
camera.lookAt(0,0,0);

const lbl=document.createElement("div");
lbl.style.cssText="position:absolute;bottom:12px;left:0;right:0;text-align:center;color:#88ccff;font:bold 13px sans-serif;pointer-events:none";
lbl.textContent="DNA Double Helix — Base Pairs: A-T and G-C";
document.getElementById("c").appendChild(lbl);

let t2=0;
function animate(){
  requestAnimationFrame(animate);
  t2+=0.005;
  scene.rotation.y=t2;
  renderer.render(scene,camera);
}
animate();`,
  },
  blank3d: {
    label: "Blank Three.js",
    emoji: "📦",
    code: `// Three.js blank starter — paste your Three.js code here
// THREE is available globally (r128)
// The renderer auto-resizes. No need to write resize handlers.

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);

const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 1000);
camera.position.set(0, 2, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.getElementById("c").appendChild(renderer.domElement);
// Register for auto-resize:
window.__renderer = renderer;
window.__camera = camera;

// Example: rotating cube
const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
const material = new THREE.MeshPhongMaterial({ color: 0x6644ff, wireframe: false });
const cube = new THREE.Mesh(geometry, material);
scene.add(cube);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 7);
scene.add(light);

function animate() {
  requestAnimationFrame(animate);
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.015;
  renderer.render(scene, camera);
}
animate();`,
  },
};


// ── Animation Playground (Admin) — Three.js + p5.js ─────────────────────────
const P5Playground = ({
  animCode, onAnimChange
}: {
  animCode: string;
  onAnimChange: (v: string) => void;
}) => {
  const [code, setCode] = useState(animCode || "");
  const [showPreview, setShowPreview] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);
  const [blobUrl, setBlobUrl] = useState<string>("");

  // Use blob URL for preview — bypasses parent-page CSP so p5.js CDN loads fine
  useEffect(() => {
    if (!code.trim()) { setBlobUrl(""); return; }
    const html = wrapP5Code(code);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [code, previewKey]);

  const handleChange = (v: string) => {
    setCode(v);
    onAnimChange(v);
  };

  const applyTemplate = (key: string) => {
    const t = THREE_TEMPLATES[key];
    if (!t) return;
    handleChange(t.code);
    setShowPreview(true);
    setPreviewKey(k => k + 1);
  };

  return (
    <Card>
      <CardContent className="pt-5 space-y-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 dark:from-violet-900/20 dark:to-indigo-900/20 border border-violet-200 dark:border-violet-700/30 rounded-2xl p-4">
          <p className="text-sm font-bold text-violet-700 dark:text-violet-300 mb-1 flex items-center gap-2">
            <Zap className="w-4 h-4" /> 3D Interactive Animation — Three.js
          </p>
          <p className="text-xs text-violet-600 dark:text-violet-400 leading-relaxed">
            Paste <strong>Three.js 3D</strong> code (uses <code className="bg-violet-100 dark:bg-violet-900/40 px-1 rounded">THREE</code> global, r128) <strong>or any 2D Canvas / JavaScript animation</strong>.
            The system auto-detects 3D vs 2D. No character limit. Students see it live below the chapter notes.
          </p>
        </div>

        {/* Templates */}
        <div className="space-y-2">
          <Label className="block text-sm font-semibold">Three.js Templates (3D)</Label>
          <div className="flex flex-wrap gap-2">
            {Object.entries(THREE_TEMPLATES).map(([key, t]) => (
              <button key={"3-"+key} onClick={() => (applyTemplate as any)(key, "three")}
                className="px-3 py-1.5 bg-violet-100 dark:bg-violet-900/30 hover:bg-primary hover:text-primary-foreground border border-violet-300 dark:border-violet-700 rounded-xl text-xs font-semibold transition-all text-violet-700 dark:text-violet-300">
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Editor + preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-semibold">Three.js Code</Label>
            <button
              onClick={() => { setShowPreview(v => !v); setPreviewKey(k => k + 1); }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity">
              {showPreview ? <><EyeOff className="w-3.5 h-3.5" /> Hide</> : <><Eye className="w-3.5 h-3.5" /> Preview</>}
            </button>
          </div>

          <div className={`grid gap-4 ${showPreview ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
            {/* Code area */}
            <div>
              <textarea
                value={code}
                onChange={e => handleChange(e.target.value)}
                rows={showPreview ? 24 : 22}
                spellCheck={false}
                placeholder={"// Paste your Three.js code here\n// Uses THREE global (r128)\n\n// const scene = new THREE.Scene();\n// const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 1000);\n// const renderer = new THREE.WebGLRenderer({ antialias: true });\n// window.__renderer = renderer; window.__camera = camera;\n// renderer.setSize(innerWidth, innerHeight);\n// document.body.appendChild(renderer.domElement);\n// // ... your scene ...\n// function animate() { requestAnimationFrame(animate); renderer.render(scene, camera); }\n// animate();"}
                className="w-full rounded-xl border border-input bg-background px-4 py-3 text-xs font-mono outline-none focus:ring-2 focus:ring-ring resize-y leading-relaxed"
                style={{ minHeight: "600px", tabSize: 2 }}
              />
              <p className="text-[10px] text-muted-foreground mt-1.5 flex flex-wrap items-center gap-2">
                <span>{code.length.toLocaleString()} chars</span>
                <span>•</span>
                <span className="text-green-600 dark:text-green-400 font-semibold">No character limit</span>
                <span>•</span>
                <span>Three.js 3D + Canvas 2D — auto-detected</span>
                <span>•</span>
                <span>Auto-resizes on mobile</span>
              </p>
            </div>

            {/* Live preview */}
            {showPreview && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">Live Preview</p>
                  <button onClick={() => setPreviewKey(k => k + 1)}
                    className="flex items-center gap-1 text-[10px] text-primary hover:underline px-2">
                    <RotateCcw className="w-3 h-3" /> Reload
                  </button>
                </div>
                <div className="rounded-2xl overflow-hidden border-2 border-violet-200 dark:border-violet-700/40 shadow-lg" style={{ height: "440px" }}>
                  {blobUrl ? (
                    <iframe
                      key={previewKey}
                      src={blobUrl}
                      style={{ width: "100%", height: "100%", border: "none", display: "block" }}
                      title="p5.js Preview"
                      allow="accelerometer; gyroscope"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm bg-muted/30">
                      Paste code to see preview
                    </div>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1 text-center">
                  🔒 Sandboxed — exactly what students see
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Tips */}
        <div className="bg-muted/50 rounded-xl p-3 border border-border">
          <p className="text-xs font-semibold text-muted-foreground mb-2">💡 Three.js tips</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-xs text-muted-foreground">
            <p>• Set <code className="bg-background px-1 rounded">window.__renderer = renderer</code> for auto-resize</p>
            <p>• Set <code className="bg-background px-1 rounded">window.__camera = camera</code> for auto aspect ratio</p>
            <p>• Use <code className="bg-background px-1 rounded">innerWidth / innerHeight</code> for viewport size</p>
            <p>• Use <code className="bg-background px-1 rounded">renderer.setPixelRatio(devicePixelRatio)</code> for sharp mobile</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ── Subject Form ──────────────────────────────────────────────────────────────
const SubjectForm = ({ initial, onSave, onCancel }: { initial?: NoteSubject | null; onSave: (d: Partial<NoteSubject>) => void; onCancel: () => void }) => {
  const [form, setForm] = useState({
    name: initial?.name||"", slug: initial?.slug||"", emoji: initial?.emoji||"📚",
    color: initial?.color||"#6366f1", description: initial?.description||"",
    class_level: initial?.class_level||"6-10", is_visible: initial?.is_visible??true,
  });
  const set = (k: string, v: any) => setForm(p=>({...p,[k]:v}));
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{initial?"Edit Subject":"New Subject"}</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><Label>Name *</Label><Input value={form.name} onChange={e=>{set("name",e.target.value);if(!initial)set("slug",e.target.value.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,""));}} placeholder="Mathematics" className="mt-1" /></div>
          <div><Label>Slug</Label><Input value={form.slug} onChange={e=>set("slug",e.target.value)} className="mt-1" /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><Label>Emoji</Label><Input value={form.emoji} onChange={e=>set("emoji",e.target.value)} className="mt-1 text-2xl" /></div>
          <div><Label>Color</Label>
            <div className="flex gap-2 mt-1"><input type="color" value={form.color} onChange={e=>set("color",e.target.value)} className="w-11 h-10 rounded cursor-pointer border" /><Input value={form.color} onChange={e=>set("color",e.target.value)} className="font-mono flex-1" /></div>
          </div>
          <div><Label>Class Level</Label><Input value={form.class_level} onChange={e=>set("class_level",e.target.value)} placeholder="6-10" className="mt-1" /></div>
        </div>
        <div><Label>Description</Label><Input value={form.description} onChange={e=>set("description",e.target.value)} className="mt-1" /></div>
        <div className="flex items-center gap-3"><Switch checked={form.is_visible} onCheckedChange={v=>set("is_visible",v)} /><Label>Visible to students</Label></div>
        <div className="flex gap-2 pt-2">
          <Button onClick={()=>onSave({...form,...(initial?{id:initial.id}:{})})} className="gap-2 flex-1 sm:flex-none"><Save className="w-4 h-4" /> Save</Button>
          <Button variant="outline" onClick={onCancel} className="flex-1 sm:flex-none">Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
};

// ── Chapter Form ──────────────────────────────────────────────────────────────
const ChapterForm = ({ initial, subjectId, onSave, onCancel }: {
  initial?: NoteChapter|null; subjectId: string; onSave: (d: Partial<NoteChapter>)=>void; onCancel: ()=>void;
}) => {
  const [tab, setTab] = useState("content");
  const [editorMode, setEditorMode] = useState<"rich" | "html">(() => {
    try { return (localStorage.getItem("notes-editor-mode") as "rich" | "html") || "rich"; } catch { return "rich"; }
  });
  useEffect(() => { try { localStorage.setItem("notes-editor-mode", editorMode); } catch {} }, [editorMode]);
  const [form, setForm] = useState({
    title: initial?.title||"", slug: initial?.slug||"",
    description: initial?.description||"", content: initial?.content||"",
    animation_code: initial?.animation_code||"",
    graph_config: initial?.graph_config?JSON.stringify(initial.graph_config,null,2):"",
    pdf_url: initial?.pdf_url||"", read_time_mins: initial?.read_time_mins??5,
    difficulty: initial?.difficulty??"medium", chapter_number: initial?.chapter_number??1,
    is_published: initial?.is_published??false, audio_enabled: initial?.audio_enabled??true,
    audio_url: (initial as any)?.audio_url||"", audio_duration: (initial as any)?.audio_duration??0,
  });
  // Mirrors `form` synchronously so handleSave can read the latest content
  // even if it was just flushed by a blur event in the same tick (React's
  // setForm/state update is async, but this ref is updated immediately).
  const formRef = useRef(form);
  useEffect(() => { formRef.current = form; }, [form]);
  const set = (k: string, v: any) => setForm(p=>{ const next = {...p,[k]:v}; formRef.current = next; return next; });

  const handleSave = () => {
    if (!formRef.current.title.trim()) { toast.error("Title required"); return; }
    // Defensive flush: if the user pasted HTML and tapped Save without the
    // textarea ever losing focus (rare on some mobile browsers), force any
    // focused input to blur first so HtmlPasteEditor's onBlur flush runs.
    // `set()` above keeps formRef updated synchronously, so reading
    // formRef.current right after blur() always has the latest content —
    // unlike `form`, which would still be stale in this same tick.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const current = formRef.current;
    let gc = null;
    if (current.graph_config.trim()) {
      try { gc = JSON.parse(current.graph_config); } catch { toast.error("Graph config: invalid JSON"); return; }
    }
    onSave({...current, subject_id:subjectId, graph_config:gc, ...(initial?{id:initial.id}:{})});
  };

  const tabs = [
    { id:"content",     label:"📝 Content",     short:"📝" },
    { id:"interactive", label:"⚡ Interactive",  short:"⚡" },
    { id:"settings",    label:"⚙️ Settings",    short:"⚙️" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onCancel} className="gap-1 shrink-0"><ArrowLeft className="w-4 h-4" /> Back</Button>
        <h2 className="text-lg font-bold truncate">{initial?`Edit: ${initial.title}`:"New Chapter"}</h2>
      </div>

      {/* Tab bar */}
      <div className="flex rounded-2xl bg-secondary p-1 gap-1">
        {tabs.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${tab===t.id?"bg-card text-foreground shadow-sm":"text-muted-foreground hover:text-foreground"}`}>
            <span className="sm:hidden">{t.short}</span>
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {tab==="content" && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2"><Label>Chapter Title *</Label><Input value={form.title} onChange={e=>{set("title",e.target.value);if(!initial)set("slug",e.target.value.toLowerCase().replace(/\s+/g,"-").replace(/[^a-z0-9-]/g,""));}} placeholder="Introduction to Algebra" className="mt-1" /></div>
              <div><Label>Chapter #</Label><Input type="number" value={form.chapter_number} onChange={e=>set("chapter_number",+e.target.value)} className="mt-1" /></div>
            </div>
            <div><Label>Short Description</Label><Input value={form.description} onChange={e=>set("description",e.target.value)} className="mt-1" /></div>

            {/* Content editor — ONLY ONE mode is active at a time.
                Switching modes clears the previous mode's content (after
                confirmation) so there's never a mix of Rich Text leftovers
                and pasted HTML sitting in the same chapter. */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                <Label className="block">Content</Label>
                <div className="flex rounded-xl bg-secondary p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      if (editorMode === "rich") return;
                      if (form.content.trim() && !confirm("Switch to Rich Text editor? This will clear the HTML you pasted, so only Rich Text content is saved.")) return;
                      set("content", "");
                      setEditorMode("rich");
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${editorMode === "rich" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <PencilLine className="w-3.5 h-3.5" /> Rich Text
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (editorMode === "html") return;
                      if (form.content.trim() && !confirm("Switch to Paste HTML editor? This will clear your Rich Text notes, so only the pasted HTML is saved.")) return;
                      set("content", "");
                      setEditorMode("html");
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${editorMode === "html" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Code2 className="w-3.5 h-3.5" /> Paste HTML
                  </button>
                </div>
              </div>

              {editorMode === "rich" ? (
                <>
                  <RichTextEditor
                    value={form.content}
                    onChange={v => set("content", v)}
                    placeholder="Start writing your chapter content here..."
                    minHeight={380}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    ✨ WYSIWYG editor — what you see is exactly what students will see. Only this mode's content is saved; switching to Paste HTML will clear it.
                  </p>
                </>
              ) : (
                <>
                  <HtmlPasteEditor
                    value={form.content}
                    onChange={v => set("content", v)}
                    placeholder="Paste your HTML here, e.g. <h2>Simple Harmonic Motion</h2><p>...</p>"
                    minHeight={380}
                  />
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    ⚡ Faster on mobile — paste ready-made HTML and it renders live below, using the same renderer students see. Only this mode's content is saved; switching to Rich Text will clear it.
                  </p>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {tab==="interactive" && (
        <P5Playground
          animCode={form.animation_code}
          onAnimChange={v=>set("animation_code",v)}
        />
      )}

      {tab==="settings" && (
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div><Label>Difficulty</Label>
                <select value={form.difficulty} onChange={e=>set("difficulty",e.target.value)}
                  className="w-full mt-1 rounded-xl border border-input bg-background px-3 py-2.5 text-sm">
                  <option value="easy">🟢 Easy</option><option value="medium">🟡 Medium</option><option value="hard">🔴 Hard</option>
                </select>
              </div>
              <div><Label>Read Time (min)</Label><Input type="number" value={form.read_time_mins} onChange={e=>set("read_time_mins",+e.target.value)} className="mt-1" /></div>
              <div><Label>PDF URL</Label><Input value={form.pdf_url} onChange={e=>set("pdf_url",e.target.value)} placeholder="https://..." className="mt-1" /></div>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-3"><Switch checked={form.is_published} onCheckedChange={v=>set("is_published",v)} /><Label>Published (visible to students)</Label></div>
              <div className="flex items-center gap-3"><Switch checked={form.audio_enabled} onCheckedChange={v=>set("audio_enabled",v)} /><Label>Enable Read Aloud for this chapter</Label></div>
            </div>
            {/* Audio Notes — Pre-recorded Audio Upload */}
            <div className="space-y-3 pt-3 border-t border-border">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">🎧 Audio Notes</h4>
              <p className="text-xs text-muted-foreground">Upload pre-recorded audio for students to listen while reading. Supports MP3, WAV, OGG.</p>
              <div><Label>Audio URL</Label><Input value={form.audio_url} onChange={e=>set("audio_url",e.target.value)} placeholder="https://res.cloudinary.com/.../audio.mp3" className="mt-1" /></div>
              <div><Label>Audio Duration (seconds)</Label><Input type="number" value={form.audio_duration} onChange={e=>set("audio_duration",+e.target.value)} placeholder="0" className="mt-1" /></div>
              {form.audio_url && (
                <div className="bg-muted rounded-xl p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Audio Preview:</p>
                  <audio controls className="w-full" style={{height:36}}>
                    <source src={form.audio_url} />
                    Your browser does not support audio.
                  </audio>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sticky save button */}
      <div className="sticky bottom-0 bg-background/95 backdrop-blur-sm py-3 border-t border-border -mx-4 px-4 flex gap-3">
        <Button onClick={handleSave} className="gap-2 flex-1 sm:flex-none"><Save className="w-4 h-4" /> Save Chapter</Button>
        <Button variant="outline" onClick={onCancel} className="flex-1 sm:flex-none">Cancel</Button>
      </div>
    </div>
  );
};

// ── Quiz Manager ──────────────────────────────────────────────────────────────
const QuizManager = ({ chapterId, onBack }: { chapterId: string; onBack: ()=>void }) => {
  const qc = useQueryClient();
  const { data: quiz } = useNoteQuiz(chapterId);
  const { data: questions = [], isLoading } = useNoteQuestions(quiz?.id);
  const { upsert, remove } = useMutateQuestion();
  const [editQ, setEditQ] = useState<Partial<NoteQuestion>|null>(null);
  const [saving, setSaving] = useState(false);

  const blank = (): Partial<NoteQuestion> => ({
    question:"", option_a:"", option_b:"", option_c:"", option_d:"",
    correct:"a", explanation:"", display_order:questions.length, difficulty:"medium"
  });

  const [creating, setCreating] = useState(false);

  const createQuiz = async () => {
    if (quiz || creating) return;
    setCreating(true);
    const { data: newQuiz, error } = await supabase
      .from("note_quizzes")
      .insert({ chapter_id: chapterId, title: "Chapter Quiz", pass_score: 60, time_limit_secs: 0, is_active: true })
      .select()
      .single();
    if (error || !newQuiz) {
      toast.error("Failed to create quiz: " + (error?.message ?? "No data returned"));
      setCreating(false);
      return;
    }
    qc.setQueryData(["note-quiz", chapterId], newQuiz);
    qc.invalidateQueries({ queryKey: ["note-quiz", chapterId] });
    toast.success("Quiz created! Now add questions below.");
    setCreating(false);
  };

  const saveQ = async () => {
    if (!editQ||!quiz) return;
    if (!editQ.question?.trim()) { toast.error("Question required"); return; }
    setSaving(true);
    await upsert.mutateAsync({...editQ, quiz_id:quiz.id});
    toast.success("Saved!"); setEditQ(null); setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 shrink-0"><ArrowLeft className="w-4 h-4" /> Back</Button>
        <h2 className="text-lg font-bold flex items-center gap-2"><HelpCircle className="w-5 h-5 text-violet-500" /> Quiz Manager</h2>
      </div>

      {!quiz ? (
        <Card><CardContent className="py-12 text-center">
          <HelpCircle className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="font-semibold mb-3">No quiz yet</p>
          <Button onClick={createQuiz} disabled={creating} className="gap-2">{creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} {creating ? "Creating..." : "Create Quiz"}</Button>
        </CardContent></Card>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <Badge variant="secondary">{questions.length} questions</Badge>
            <Button onClick={()=>setEditQ(blank())} size="sm" className="gap-2"><Plus className="w-4 h-4" /> Add Question</Button>
          </div>

          {editQ && (
            <Card className="border-primary/30">
              <CardHeader><CardTitle className="text-base">{editQ.id?"Edit Question":"New Question"}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Question *</Label>
                  <textarea value={editQ.question} onChange={e=>setEditQ(p=>({...p!,question:e.target.value}))}
                    rows={3} className="w-full mt-1 rounded-xl border border-input bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(["a","b","c","d"] as const).map(opt=>(
                    <div key={opt}>
                      <Label>Option {opt.toUpperCase()}</Label>
                      <Input value={(editQ as any)[`option_${opt}`]||""} onChange={e=>setEditQ(p=>({...p!,[`option_${opt}`]:e.target.value}))} placeholder={`Option ${opt.toUpperCase()}`} className="mt-1" />
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><Label>Correct</Label>
                    <select value={editQ.correct} onChange={e=>setEditQ(p=>({...p!,correct:e.target.value as any}))}
                      className="w-full mt-1 rounded-xl border border-input bg-background px-3 py-2 text-sm">
                      <option value="a">A</option><option value="b">B</option><option value="c">C</option><option value="d">D</option>
                    </select>
                  </div>
                  <div><Label>Difficulty</Label>
                    <select value={editQ.difficulty||"medium"} onChange={e=>setEditQ(p=>({...p!,difficulty:e.target.value as any}))}
                      className="w-full mt-1 rounded-xl border border-input bg-background px-3 py-2 text-sm">
                      <option value="easy">🟢 Easy</option><option value="medium">🟡 Medium</option><option value="hard">🔴 Hard</option>
                    </select>
                  </div>
                  <div><Label>Explanation</Label><Input value={editQ.explanation||""} onChange={e=>setEditQ(p=>({...p!,explanation:e.target.value}))} className="mt-1" /></div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={saveQ} disabled={saving} className="gap-2 flex-1 sm:flex-none">
                    {saving?<Loader2 className="w-4 h-4 animate-spin" />:<Save className="w-4 h-4" />} Save
                  </Button>
                  <Button variant="outline" onClick={()=>setEditQ(null)} className="flex-1 sm:flex-none">Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {isLoading ? <Skeleton className="h-32 rounded-2xl" /> : questions.map((q,i)=>(
            <Card key={q.id}>
              <CardContent className="p-4 flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-black flex items-center justify-center shrink-0 text-sm">{i+1}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm mb-1.5">{q.question}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {(["a","b","c","d"] as const).map(opt=>(
                      <p key={opt} className={`text-xs px-2 py-1 rounded-lg ${q.correct===opt?"bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-bold":"text-muted-foreground"}`}>
                        {opt.toUpperCase()}. {(q as any)[`option_${opt}`]} {q.correct===opt?"✓":""}
                      </p>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="secondary" className="text-[10px]">{q.difficulty||"medium"}</Badge>
                    {q.explanation && <span className="text-[10px] text-muted-foreground">💡 Has explanation</span>}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={()=>setEditQ(q)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={()=>remove.mutate(q.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </>
      )}
    </div>
  );
};

// ── Flashcard Manager ─────────────────────────────────────────────────────────
const FlashcardManager = ({ chapterId, onBack }: { chapterId: string; onBack: ()=>void }) => {
  const { data: cards = [], isLoading } = useFlashcards(chapterId);
  const { upsert, remove } = useMutateFlashcard();
  const [editF, setEditF] = useState<Partial<Flashcard>|null>(null);

  const blank = (): Partial<Flashcard> => ({ front:"", back:"", display_order:cards.length, chapter_id:chapterId });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 shrink-0"><ArrowLeft className="w-4 h-4" /> Back</Button>
        <h2 className="text-lg font-bold flex items-center gap-2">📇 Flashcard Manager</h2>
      </div>

      <div className="flex justify-between items-center">
        <Badge variant="secondary">{cards.length} flashcards</Badge>
        <Button onClick={()=>setEditF(blank())} size="sm" className="gap-2"><Plus className="w-4 h-4" /> Add Card</Button>
      </div>

      {editF && (
        <Card className="border-emerald-300 dark:border-emerald-700">
          <CardHeader><CardTitle className="text-base">{editF.id?"Edit Card":"New Flashcard"}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Front (Question / Term)</Label>
              <textarea value={editF.front} onChange={e=>setEditF(p=>({...p!,front:e.target.value}))} rows={3}
                className="w-full mt-1 rounded-xl border border-input bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            <div>
              <Label>Back (Answer / Definition)</Label>
              <textarea value={editF.back} onChange={e=>setEditF(p=>({...p!,back:e.target.value}))} rows={3}
                className="w-full mt-1 rounded-xl border border-input bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring resize-none" />
            </div>
            <div className="flex gap-2">
              <Button onClick={async()=>{if(!editF.front?.trim()||!editF.back?.trim()){toast.error("Both sides required");return;}await upsert.mutateAsync(editF);toast.success("Card saved!");setEditF(null);}} className="gap-2 flex-1 sm:flex-none"><Save className="w-4 h-4" /> Save Card</Button>
              <Button variant="outline" onClick={()=>setEditF(null)} className="flex-1 sm:flex-none">Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? <Skeleton className="h-32 rounded-2xl" /> : cards.length === 0 && !editF ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          <p className="text-3xl mb-2">📇</p><p className="font-medium">No flashcards yet</p>
        </CardContent></Card>
      ) : cards.map((c,i)=>(
        <Card key={c.id}>
          <CardContent className="p-4 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 font-black flex items-center justify-center shrink-0 text-sm">{i+1}</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground">{c.front}</p>
              <p className="text-xs text-muted-foreground mt-1 border-t border-border pt-1">{c.back}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="icon" variant="ghost" onClick={()=>setEditF(c)}><Pencil className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" className="text-destructive" onClick={()=>remove.mutate(c.id)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

// ── Main AdminNotes ───────────────────────────────────────────────────────────
const AdminNotes = () => {
  const [view, setView] = useState<View>("subjects");
  const [selectedSubject, setSelectedSubject] = useState<NoteSubject|null>(null);
  const [editingSubject, setEditingSubject] = useState<NoteSubject|null|"new">(null);
  const [selectedChapter, setSelectedChapter] = useState<NoteChapter|null>(null);
  const [editingChapter, setEditingChapter] = useState<NoteChapter|null|"new">(null);

  const { data: subjects = [], isLoading: loadingSubjects } = useNoteSubjects(true);
  const { data: chapters = [], isLoading: loadingChapters } = useNoteChapters(selectedSubject?.id, true);
  const { upsert: upsertSubject, remove: removeSubject } = useMutateSubject();
  const { upsert: upsertChapter, remove: removeChapter } = useMutateChapter();

  // SRS panel state — admin picks which STUDENT's spaced-repetition queue to
  // inspect. Previously this defaulted to the logged-in admin's own user ID
  // (via supabase.auth.getUser()), which showed the admin's personal SRS
  // data — meaningless in an admin tool, since admins don't take quizzes.
  const [srsOpen, setSrsOpen] = useState(false);
  const [srsStudent, setSrsStudent] = useState<StudentLite | null>(null);
  const [srsSearch, setSrsSearch] = useState("");
  const { data: srsStudentResults = [], isLoading: srsSearching } = useStudentSearch(srsSearch);

  // SUBJECTS
  if (view==="subjects" && !editingSubject) return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-heading font-bold flex items-center gap-2"><BookOpen className="w-5 h-5 md:w-6 md:h-6 text-primary" /> Notes Manager</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Manage subjects, chapters, quizzes and flashcards</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={srsOpen ? "default" : "outline"}
            onClick={() => setSrsOpen(v => !v)}
            className="gap-2"
          >
            <Brain className="w-4 h-4" />
            SRS Review
          </Button>
          <Button onClick={()=>setEditingSubject("new")} className="gap-2"><Plus className="w-4 h-4" /> Add Subject</Button>
        </div>
      </div>

      {srsOpen && (
        <div className="rounded-2xl border border-violet-200 dark:border-violet-800/50 bg-violet-50/40 dark:bg-violet-900/10 p-4 space-y-4">
          {/* Student picker — SRS data is per-student, so the admin must choose who to inspect */}
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              Viewing spaced-repetition queue for
            </Label>
            {srsStudent ? (
              <div className="flex items-center justify-between bg-card rounded-xl border border-border px-3 py-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
                    <UserIcon className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold leading-tight">{srsStudent.full_name || "Unnamed student"}</p>
                    <p className="text-xs text-muted-foreground leading-tight">
                      {srsStudent.class ? `Class ${srsStudent.class}` : ""}
                      {srsStudent.roll_number ? ` · Roll #${srsStudent.roll_number}` : ""}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSrsStudent(null)} className="gap-1.5">
                  <X className="w-3.5 h-3.5" /> Change
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={srsSearch}
                    onChange={(e) => setSrsSearch(e.target.value)}
                    placeholder="Search student by name or roll number…"
                    className="pl-9"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto rounded-xl border border-border divide-y divide-border bg-card">
                  {srsSearching ? (
                    <div className="p-3 text-sm text-muted-foreground">Searching…</div>
                  ) : srsStudentResults.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">
                      {srsSearch.trim() ? "No matching students." : "Start typing to find a student."}
                    </div>
                  ) : (
                    srsStudentResults.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSrsStudent(s)}
                        className="w-full text-left px-3 py-2.5 hover:bg-secondary transition-colors flex items-center gap-2.5"
                      >
                        <UserIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-sm font-medium leading-tight">{s.full_name || "Unnamed student"}</p>
                          <p className="text-xs text-muted-foreground leading-tight">
                            {s.class ? `Class ${s.class}` : ""}{s.roll_number ? ` · Roll #${s.roll_number}` : ""}
                          </p>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {srsStudent && <SRSReviewPanel userId={srsStudent.id} readOnly />}
        </div>
      )}

      {loadingSubjects ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{[...Array(4)].map((_,i)=><Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      ) : subjects.length===0 ? (
        <Card><CardContent className="py-16 text-center"><BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" /><p className="font-semibold mb-3">No subjects yet</p><Button onClick={()=>setEditingSubject("new")} className="gap-2"><Plus className="w-4 h-4" /> Add First Subject</Button></CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects.map(s=>(
            <Card key={s.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-1.5" style={{backgroundColor:s.color}} />
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-3xl shrink-0">{s.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-foreground truncate">{s.name}</h3>
                    <p className="text-xs text-muted-foreground">Class {s.class_level} {!s.is_visible&&"· Hidden"}</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" className="flex-1 gap-1 min-w-0"
                    onClick={()=>{setSelectedSubject(s);setView("chapters");}}>
                    <ChevronRight className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">Chapters</span>
                  </Button>
                  <Button size="icon" variant="ghost" onClick={()=>setEditingSubject(s)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive"
                    onClick={()=>{if(confirm(`Delete "${s.name}" and all chapters?`))removeSubject.mutate(s.id);}}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  if (editingSubject) return (
    <SubjectForm
      initial={editingSubject==="new"?null:editingSubject}
      onSave={async d=>{await upsertSubject.mutateAsync(d);toast.success("Subject saved!");setEditingSubject(null);}}
      onCancel={()=>setEditingSubject(null)}
    />
  );

  // CHAPTERS
  if (view==="chapters" && selectedSubject && !editingChapter) return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={()=>{setView("subjects");setSelectedSubject(null);}} className="gap-1 shrink-0"><ArrowLeft className="w-4 h-4" /> Subjects</Button>
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-2xl shrink-0">{selectedSubject.emoji}</span>
            <div className="min-w-0">
              <h2 className="text-lg font-bold truncate">{selectedSubject.name}</h2>
              <p className="text-xs text-muted-foreground">{chapters.length} chapters</p>
            </div>
          </div>
        </div>
        <Button onClick={()=>setEditingChapter("new")} className="gap-2 shrink-0"><Plus className="w-4 h-4" /> Add Chapter</Button>
      </div>

      {loadingChapters ? (
        <div className="space-y-3">{[...Array(3)].map((_,i)=><Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
      ) : chapters.length===0 ? (
        <Card><CardContent className="py-16 text-center"><BookOpen className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" /><p className="font-semibold mb-3">No chapters</p><Button onClick={()=>setEditingChapter("new")} className="gap-2"><Plus className="w-4 h-4" /> Add First Chapter</Button></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {chapters.map(ch=>(
            <Card key={ch.id}>
              <CardContent className="p-4 flex items-center gap-3 flex-wrap">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black shrink-0 text-base"
                  style={{backgroundColor:selectedSubject.color}}>{ch.chapter_number}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-foreground truncate">{ch.title}</h3>
                    <Badge className={ch.is_published?"bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400":"bg-muted text-muted-foreground"}>
                      {ch.is_published?"Published":"Draft"}
                    </Badge>
                    {ch.animation_code&&<Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400"><Zap className="w-3 h-3 mr-1" />Interactive</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{ch.read_time_mins} min · {ch.difficulty} · {ch.view_count} views</p>
                </div>
                <div className="flex gap-1.5 flex-wrap shrink-0">
                  <Button size="sm" variant="outline" className="gap-1 text-xs"
                    onClick={()=>{setSelectedChapter(ch);setView("quiz");}}>
                    <HelpCircle className="w-3.5 h-3.5" /> Quiz
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1 text-xs"
                    onClick={()=>{setSelectedChapter(ch);setView("flashcards");}}>
                    📇 Cards
                  </Button>
                  <Button size="icon" variant="ghost" onClick={()=>setEditingChapter(ch)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive"
                    onClick={()=>{if(confirm("Delete this chapter?"))removeChapter.mutate(ch.id);}}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  if (editingChapter && selectedSubject) return (
    <ChapterForm
      initial={editingChapter==="new"?null:editingChapter}
      subjectId={selectedSubject.id}
      onSave={async d=>{await upsertChapter.mutateAsync(d);toast.success("Chapter saved!");setEditingChapter(null);}}
      onCancel={()=>setEditingChapter(null)}
    />
  );

  if (view==="quiz" && selectedChapter) return (
    <QuizManager chapterId={selectedChapter.id} onBack={()=>{setView("chapters");setSelectedChapter(null);}} />
  );

  if (view==="flashcards" && selectedChapter) return (
    <FlashcardManager chapterId={selectedChapter.id} onBack={()=>{setView("chapters");setSelectedChapter(null);}} />
  );

  return null;
};

const AdminNotesWithTests = () => (
  <div className="space-y-4">
    <div>
      <h2 className="text-xl md:text-2xl font-heading font-bold flex items-center gap-2">
        <BookOpen className="w-5 h-5 md:w-6 md:h-6 text-primary" /> Notes Manager
      </h2>
      <p className="text-sm text-muted-foreground mt-0.5">Manage notes content and MCQ tests</p>
    </div>
    <Tabs defaultValue="notes" className="w-full">
      <TabsList className="w-full grid grid-cols-2 sm:inline-flex sm:w-auto">
        <TabsTrigger value="notes" className="gap-1.5 text-xs sm:text-sm">
          <BookOpen className="w-3.5 h-3.5" />
          <span>Notes</span>
        </TabsTrigger>
        <TabsTrigger value="tests" className="gap-1.5 text-xs sm:text-sm">
          <ClipboardCheck className="w-3.5 h-3.5" />
          <span>MCQ Tests</span>
        </TabsTrigger>
      </TabsList>
      <TabsContent value="notes" className="mt-4">
        <AdminNotes />
      </TabsContent>
      <TabsContent value="tests" className="mt-4">
        <Suspense fallback={<div className="space-y-2">{[...Array(4)].map((_,i)=><div key={i} className="h-12 rounded-lg bg-muted animate-pulse"/>)}</div>}>
          <AdminTests />
        </Suspense>
      </TabsContent>
    </Tabs>
  </div>
);

export default AdminNotesWithTests;
