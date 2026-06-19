/**
 * CodePlayground.tsx
 * Live HTML/CSS/JS code playground — runs in a sandboxed iframe with srcdoc.
 * No external API needed, no Pyodide, fully offline.
 *
 * Usage: <CodePlayground subjectColor="#8b5cf6" />
 */
import { useState, useMemo, useEffect } from "react";
import { Code2, Play, RotateCcw, ExternalLink } from "lucide-react";

const DEFAULT_CODE = `<!-- Try editing me! -->
<h1>Hello, World! 👋</h1>
<p>Click the button:</p>
<button onclick="onClick()">Count: <span id="c">0</span></button>

<style>
  body { font-family: system-ui; padding: 16px; color: #1f2937; }
  h1 { color: #3b82f6; }
  button {
    background: #3b82f6; color: white; border: none;
    padding: 8px 16px; border-radius: 8px; cursor: pointer;
    font-size: 14px;
  }
  button:hover { background: #2563eb; }
</style>

<script>
  let count = 0;
  function onClick() {
    count++;
    document.getElementById('c').textContent = count;
  }
</script>
`;

const EXAMPLES = {
  "Counter": DEFAULT_CODE,
  "FizzBuzz": `<h2>FizzBuzz (1-20)</h2>
<div id="out"></div>
<style>body{font-family:monospace;padding:16px}.row{padding:4px;border-bottom:1px solid #eee}</style>
<script>
  const out = document.getElementById('out');
  for (let i = 1; i <= 20; i++) {
    const div = document.createElement('div');
    div.className = 'row';
    if (i % 15 === 0) div.textContent = 'FizzBuzz';
    else if (i % 3 === 0) div.textContent = 'Fizz';
    else if (i % 5 === 0) div.textContent = 'Buzz';
    else div.textContent = i;
    out.appendChild(div);
  }
</script>`,
  "Canvas Drawing": `<canvas id="c" width="300" height="200" style="border:1px solid #ccc;border-radius:8px"></canvas>
<p>Click on the canvas to draw a circle 👆</p>
<style>body{font-family:system-ui;padding:16px;text-align:center}</style>
<script>
  const c = document.getElementById('c');
  const ctx = c.getContext('2d');
  const colors = ['#ef4444','#3b82f6','#10b981','#f59e0b','#8b5cf6'];
  c.addEventListener('click', e => {
    const rect = c.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ctx.fillStyle = colors[Math.floor(Math.random()*colors.length)];
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI*2);
    ctx.fill();
  });
</script>`,
  "Math Quiz": `<h2>Quick Math Quiz ➗</h2>
<p id="q">Loading...</p>
<input id="a" type="number" placeholder="Your answer" style="padding:6px;border:1px solid #ccc;border-radius:6px;width:80px">
<button onclick="check()">Check</button>
<p id="r"></p>
<p>Score: <span id="s">0</span> / <span id="t">0</span></p>
<style>body{font-family:system-ui;padding:16px}button{background:#3b82f6;color:white;border:none;padding:6px 14px;border-radius:6px;cursor:pointer}</style>
<script>
  let answer, score = 0, total = 0;
  function newQ() {
    const a = Math.floor(Math.random()*12)+1, b = Math.floor(Math.random()*12)+1;
    const op = ['+','-','×'][Math.floor(Math.random()*3)];
    answer = op==='+' ? a+b : op==='-' ? a-b : a*b;
    document.getElementById('q').textContent = a+' '+op+' '+b+' = ?';
    document.getElementById('a').value = '';
    document.getElementById('a').focus();
  }
  function check() {
    total++;
    const v = parseInt(document.getElementById('a').value);
    if (v === answer) { score++; document.getElementById('r').textContent = '✓ Correct!'; }
    else document.getElementById('r').textContent = '✗ Answer: ' + answer;
    document.getElementById('s').textContent = score;
    document.getElementById('t').textContent = total;
    setTimeout(newQ, 1000);
  }
  newQ();
</script>`,
};

export default function CodePlayground({ subjectColor = "#8b5cf6" }: { subjectColor?: string }) {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [srcDoc, setSrcDoc] = useState(DEFAULT_CODE);
  const [activeTab, setActiveTab] = useState<"examples" | "code">("code");

  const run = () => setSrcDoc(code);
  const reset = () => { setCode(DEFAULT_CODE); setSrcDoc(DEFAULT_CODE); };

  // Auto-run on first load
  useEffect(() => { setSrcDoc(code); /* eslint-disable-next-line */ }, []);

  const openInNewTab = () => {
    const blob = new Blob([code], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 p-3 border-b border-border bg-secondary/30">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{ backgroundColor: subjectColor + "20" }}>
          <Code2 className="w-4 h-4" style={{ color: subjectColor }} />
        </div>
        <span className="font-bold text-sm text-foreground">Code Playground</span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={run} className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold flex items-center gap-1 hover:opacity-90"
            style={{ backgroundColor: subjectColor }}>
            <Play className="w-3 h-3" /> Run
          </button>
          <button onClick={reset} className="text-xs px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/70 text-muted-foreground flex items-center gap-1">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
          <button onClick={openInNewTab} className="text-xs px-2 py-1.5 rounded-lg bg-secondary hover:bg-secondary/70 text-muted-foreground"
            title="Open in new tab">
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("code")}
          className={`px-3 py-2 text-xs font-semibold ${activeTab === "code" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}
        >
          Code
        </button>
        <button
          onClick={() => setActiveTab("examples")}
          className={`px-3 py-2 text-xs font-semibold ${activeTab === "examples" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}
        >
          Examples
        </button>
      </div>

      {activeTab === "examples" && (
        <div className="p-3 flex flex-wrap gap-1.5">
          {Object.entries(EXAMPLES).map(([name, c]) => (
            <button
              key={name}
              onClick={() => { setCode(c); setSrcDoc(c); setActiveTab("code"); }}
              className="text-xs px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/70 text-foreground font-medium"
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {activeTab === "code" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 border-t border-border">
          {/* Code editor */}
          <div className="border-b lg:border-b-0 lg:border-r border-border">
            <div className="px-3 py-1.5 bg-secondary/30 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              HTML / CSS / JS
            </div>
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              spellCheck={false}
              className="w-full h-64 lg:h-80 p-3 font-mono text-xs bg-background text-foreground resize-none focus:outline-none"
              placeholder="Write your code here..."
            />
          </div>

          {/* Live preview */}
          <div>
            <div className="px-3 py-1.5 bg-secondary/30 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center justify-between">
              <span>Live Preview</span>
              <span className="text-green-500">● Running</span>
            </div>
            <iframe
              srcDoc={srcDoc}
              title="Code Preview"
              sandbox="allow-scripts"
              className="w-full h-64 lg:h-80 bg-white border-0"
            />
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-center p-2 border-t border-border">
        Runs entirely in your browser • Sandboxed for safety • Edit HTML/CSS/JS together
      </p>
    </div>
  );
}
