import { useEffect, useRef } from "react";
import type { Note } from "../vault/types";
import { buildGraph } from "../vault/parse";

interface Props {
  notes: Note[];
  current: string | null;
  onOpen: (name: string) => void;
}

interface Node {
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  deg: number;
}

/**
 * Graf powiązań notatek. Prosta symulacja siłowa rysowana na canvasie:
 * - odpychanie między wszystkimi węzłami,
 * - przyciąganie wzdłuż krawędzi (linków [[...]]),
 * - delikatne ściąganie do środka.
 */
export function GraphView({ notes, current, onOpen }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    // Aliasy nie-nullowe – ułatwiają TypeScriptowi analizę wewnątrz domknięć.
    const cv: HTMLCanvasElement = canvas;
    const ctx: CanvasRenderingContext2D = context;

    const { nodes: names, edges } = buildGraph(notes);
    const deg = new Map<string, number>();
    for (const e of edges) {
      deg.set(e.source, (deg.get(e.source) ?? 0) + 1);
      deg.set(e.target, (deg.get(e.target) ?? 0) + 1);
    }

    const dpr = window.devicePixelRatio || 1;
    let W = canvas.clientWidth;
    let H = canvas.clientHeight;

    const nodes: Node[] = names.map((name, i) => ({
      name,
      // Rozłóż wstępnie na okręgu, by symulacja zbiegała ładniej.
      x: W / 2 + Math.cos((i / Math.max(1, names.length)) * Math.PI * 2) * 120,
      y: H / 2 + Math.sin((i / Math.max(1, names.length)) * Math.PI * 2) * 120,
      vx: 0,
      vy: 0,
      deg: deg.get(name) ?? 0,
    }));
    const byName = new Map(nodes.map((n) => [n.name, n]));

    function resize() {
      W = cv.clientWidth;
      H = cv.clientHeight;
      cv.width = W * dpr;
      cv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();

    let raf = 0;
    let alpha = 1; // „temperatura" symulacji – stygnie z czasem

    function step() {
      // Odpychanie (każdy z każdym).
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i];
          const b = nodes[j];
          let dx = a.x - b.x;
          let dy = a.y - b.y;
          let d2 = dx * dx + dy * dy || 0.01;
          const force = 2000 / d2;
          const d = Math.sqrt(d2);
          dx /= d;
          dy /= d;
          a.vx += dx * force;
          a.vy += dy * force;
          b.vx -= dx * force;
          b.vy -= dy * force;
        }
      }
      // Przyciąganie wzdłuż krawędzi.
      for (const e of edges) {
        const a = byName.get(e.source);
        const b = byName.get(e.target);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const force = (d - 90) * 0.01;
        const ux = (dx / d) * force;
        const uy = (dy / d) * force;
        a.vx += ux;
        a.vy += uy;
        b.vx -= ux;
        b.vy -= uy;
      }
      // Grawitacja do środka + tłumienie + ruch.
      for (const n of nodes) {
        n.vx += (W / 2 - n.x) * 0.002;
        n.vy += (H / 2 - n.y) * 0.002;
        n.vx *= 0.85;
        n.vy *= 0.85;
        n.x += n.vx * alpha;
        n.y += n.vy * alpha;
      }
      alpha *= 0.992;
      if (alpha < 0.02) alpha = 0.02;
      draw();
      raf = requestAnimationFrame(step);
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      // Krawędzie.
      ctx.strokeStyle = "rgba(120,130,160,0.35)";
      ctx.lineWidth = 1;
      for (const e of edges) {
        const a = byName.get(e.source);
        const b = byName.get(e.target);
        if (!a || !b) continue;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      // Węzły.
      for (const n of nodes) {
        const r = 5 + Math.min(10, n.deg * 1.5);
        const isCurrent = n.name === current;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isCurrent ? "#7c5cff" : "#8a93ff";
        ctx.fill();
        ctx.fillStyle = "rgba(220,225,245,0.9)";
        ctx.font = "12px system-ui, sans-serif";
        ctx.fillText(n.name, n.x + r + 3, n.y + 4);
      }
    }

    function pick(mx: number, my: number): Node | null {
      for (const n of nodes) {
        const r = 7 + Math.min(10, n.deg * 1.5);
        if ((mx - n.x) ** 2 + (my - n.y) ** 2 <= r * r) return n;
      }
      return null;
    }

    // Przeciąganie węzłów + klik otwiera notatkę.
    let dragging: Node | null = null;
    let moved = false;
    function onDown(ev: MouseEvent) {
      const rect = cv.getBoundingClientRect();
      dragging = pick(ev.clientX - rect.left, ev.clientY - rect.top);
      moved = false;
    }
    function onMove(ev: MouseEvent) {
      if (!dragging) return;
      const rect = cv.getBoundingClientRect();
      dragging.x = ev.clientX - rect.left;
      dragging.y = ev.clientY - rect.top;
      dragging.vx = 0;
      dragging.vy = 0;
      moved = true;
      alpha = Math.max(alpha, 0.5);
    }
    function onUp(ev: MouseEvent) {
      if (dragging && !moved) {
        const rect = cv.getBoundingClientRect();
        const hit = pick(ev.clientX - rect.left, ev.clientY - rect.top);
        if (hit) onOpenRef.current(hit.name);
      }
      dragging = null;
    }

    cv.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("resize", resize);
    step();

    return () => {
      cancelAnimationFrame(raf);
      cv.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("resize", resize);
    };
  }, [notes, current]);

  return (
    <div className="graph">
      {notes.length === 0 ? (
        <p className="muted center">Dodaj notatki i linki [[...]], aby zobaczyć graf.</p>
      ) : (
        <canvas ref={canvasRef} className="graph-canvas" />
      )}
    </div>
  );
}
