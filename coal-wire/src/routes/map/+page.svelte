<script lang="ts">
  import { onMount } from 'svelte';

  interface Point {
    id: number; x: number; y: number;
    title: string; date: string; section: string;
    issue_number: number; url?: string;
  }

  interface Cluster {
    id: number; centroid: [number, number];
    count: number; label: string;
    scale: 'macro' | 'meso' | 'micro';
  }

  let canvas: HTMLCanvasElement;
  let points = $state<Point[]>([]);
  let clusters = $state<Cluster[]>([]);
  let loading = $state(true);
  let hovered = $state<Point | null>(null);
  let tooltipPos = $state({ x: 0, y: 0 });

  // Camera — actual (rendered) and target (where we're heading)
  let cx = 0.5, cy = 0.5, zoom = 1;
  let targetCx = 0.5, targetCy = 0.5, targetZoom = 1;
  let dragging = false;
  let dragLast = { x: 0, y: 0 };
  let animating = false;

  onMount(() => {
    window.addEventListener('resize', handleResize);
    handleResize();

    fetch('/api/embeddings-2d')
      .then(r => r.json())
      .then(data => {
        points = data.points;
        clusters = data.clusters;
        loading = false;
        requestAnimationFrame(draw);
      });

    return () => { window.removeEventListener('resize', handleResize); };
  });

  function handleResize() {
    if (!canvas) return;
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    requestAnimationFrame(draw);
  }

  // World (0-1) → screen
  function toScreen(wx: number, wy: number): [number, number] {
    const w = canvas.width / devicePixelRatio;
    const h = canvas.height / devicePixelRatio;
    const scale = Math.min(w, h) * zoom;
    return [
      w / 2 + (wx - cx) * scale,
      h / 2 + (wy - cy) * scale,
    ];
  }

  // Screen → world
  function toWorld(sx: number, sy: number): [number, number] {
    const w = canvas.width / devicePixelRatio;
    const h = canvas.height / devicePixelRatio;
    const scale = Math.min(w, h) * zoom;
    return [
      cx + (sx - w / 2) / scale,
      cy + (sy - h / 2) / scale,
    ];
  }

  function activeScale(): 'macro' | 'meso' | 'micro' {
    if (zoom > 3) return 'micro';
    if (zoom > 1.5) return 'meso';
    return 'macro';
  }

  const devicePixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

  function draw() {
    if (!canvas || !points.length) return;
    const ctx = canvas.getContext('2d')!;
    const dpr = devicePixelRatio;
    const w = canvas.width / dpr;
    const h = canvas.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue('--color-bg-primary').trim() || '#ffffff';
    ctx.fillRect(0, 0, w, h);

    const textColor = getComputedStyle(canvas).getPropertyValue('--color-text-primary').trim() || '#1d4961';
    const tertiaryColor = getComputedStyle(canvas).getPropertyValue('--color-text-tertiary').trim() || '#9eaaad';

    // Date extent for opacity
    let dMin = Infinity, dMax = -Infinity;
    for (const p of points) {
      const t = new Date(p.date).getTime();
      if (!isNaN(t)) { if (t < dMin) dMin = t; if (t > dMax) dMax = t; }
    }
    const dRange = dMax - dMin || 1;

    // Cluster labels
    const scale = activeScale();
    const visible = clusters.filter(c => c.scale === scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const c of visible) {
      const [sx, sy] = toScreen(c.centroid[0], c.centroid[1]);
      if (sx < -100 || sx > w + 100 || sy < -100 || sy > h + 100) continue;

      const fontSize = scale === 'macro' ? 11 : scale === 'meso' ? 9 : 8;
      ctx.font = `600 ${fontSize}px 'Barlow Semi Condensed', sans-serif`;
      ctx.fillStyle = tertiaryColor;
      ctx.globalAlpha = 0.45;
      ctx.fillText(c.label.toUpperCase(), sx, sy);
      ctx.globalAlpha = 1;
    }

    // Points
    const r = Math.max(1, Math.min(2.5, 2 / Math.sqrt(zoom)));
    for (const p of points) {
      const [sx, sy] = toScreen(p.x, p.y);
      if (sx < -5 || sx > w + 5 || sy < -5 || sy > h + 5) continue;

      const t = new Date(p.date).getTime();
      const age = isNaN(t) ? 0 : (t - dMin) / dRange;
      const isHovered = hovered?.id === p.id;

      ctx.beginPath();
      ctx.arc(sx, sy, isHovered ? r * 2.5 : r, 0, Math.PI * 2);
      ctx.fillStyle = textColor;
      ctx.globalAlpha = isHovered ? 1 : 0.08 + 0.5 * age;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Hovered ring
    if (hovered) {
      const [sx, sy] = toScreen(hovered.x, hovered.y);
      ctx.beginPath();
      ctx.arc(sx, sy, r * 4, 0, Math.PI * 2);
      ctx.strokeStyle = textColor;
      ctx.lineWidth = 0.5;
      ctx.globalAlpha = 0.3;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Zoom indicator
    if (zoom !== 1) {
      ctx.font = `600 10px 'Barlow Semi Condensed', sans-serif`;
      ctx.fillStyle = tertiaryColor;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(`${zoom.toFixed(1)}×  ${scale}`, w - 16, h - 12);
    }
  }

  function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

  function tick() {
    const ease = 0.15;
    const dz = Math.abs(zoom - targetZoom);
    const dp = Math.abs(cx - targetCx) + Math.abs(cy - targetCy);

    if (dz > 0.001 || dp > 0.00001) {
      zoom = lerp(zoom, targetZoom, ease);
      cx = lerp(cx, targetCx, ease);
      cy = lerp(cy, targetCy, ease);
      draw();
      requestAnimationFrame(tick);
    } else {
      zoom = targetZoom;
      cx = targetCx;
      cy = targetCy;
      draw();
      animating = false;
    }
  }

  function scheduleAnimation() {
    if (!animating) {
      animating = true;
      requestAnimationFrame(tick);
    }
  }

  // Redraw on state changes that don't go through animation
  $effect(() => {
    void points; void clusters; void hovered;
    requestAnimationFrame(draw);
  });

  function findNearest(screenX: number, screenY: number): Point | null {
    const [wx, wy] = toWorld(screenX, screenY);
    let best: Point | null = null;
    let bestDist = Infinity;
    const threshold = 15 / (Math.min(canvas.width / devicePixelRatio, canvas.height / devicePixelRatio) * zoom);
    for (const p of points) {
      const dx = p.x - wx, dy = p.y - wy;
      const d = dx * dx + dy * dy;
      if (d < bestDist && d < threshold * threshold) {
        bestDist = d;
        best = p;
      }
    }
    return best;
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // Use current (not target) camera to find world point under cursor
    const [wx, wy] = toWorld(mx, my);

    const factor = e.deltaY > 0 ? 0.85 : 1.18;
    const newZoom = Math.max(0.5, Math.min(25, targetZoom * factor));

    // Zoom toward cursor
    targetCx = wx - (wx - targetCx) * (targetZoom / newZoom);
    targetCy = wy - (wy - targetCy) * (targetZoom / newZoom);
    targetZoom = newZoom;
    scheduleAnimation();
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    dragging = true;
    dragLast = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    tooltipPos = { x: mx, y: my };

    if (dragging) {
      const s = Math.min(rect.width, rect.height) * zoom;
      const dx = (e.clientX - dragLast.x) / s;
      const dy = (e.clientY - dragLast.y) / s;
      cx -= dx; cy -= dy;
      targetCx -= dx; targetCy -= dy;
      dragLast = { x: e.clientX, y: e.clientY };
      hovered = null;
      requestAnimationFrame(draw);
    } else {
      hovered = findNearest(mx, my);
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    canvas.releasePointerCapture(e.pointerId);
  }

  function onClick(e: MouseEvent) {
    if (!hovered?.url) return;
    window.open(hovered.url, '_blank', 'noopener');
  }

  function onDblClick(e: MouseEvent) {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const [wx, wy] = toWorld(e.clientX - rect.left, e.clientY - rect.top);
    targetCx = wx; targetCy = wy;
    targetZoom = Math.min(25, targetZoom * 2);
    scheduleAnimation();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape' || e.key === '0') {
      targetCx = 0.5; targetCy = 0.5; targetZoom = 1;
      scheduleAnimation();
    }
  }
</script>

<svelte:head>
  <title>Embedding Map — Coal Wire</title>
  <style>body { margin: 0; overflow: hidden; }</style>
</svelte:head>

<svelte:window onkeydown={onKeyDown} />

<canvas
  bind:this={canvas}
  onwheel={onWheel}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onclick={onClick}
  ondblclick={onDblClick}
  class:dragging
  style="--color-bg-primary: #fffffe; --color-text-primary: #1d4961; --color-text-tertiary: #9eaaad;"
></canvas>

{#if loading}
  <div class="overlay">Computing UMAP...</div>
{/if}

{#if hovered && !dragging}
  <div
    class="tooltip"
    style:left="{Math.min(tooltipPos.x + 16, window.innerWidth - 250)}px"
    style:top="{Math.max(tooltipPos.y - 48, 8)}px"
  >
    <span class="tt-meta">#{hovered.issue_number} · {hovered.date}{hovered.section ? ` · ${hovered.section}` : ''}</span>
    <span class="tt-title">{hovered.title}</span>
  </div>
{/if}

<div class="chrome-top">
  <span class="chrome-title">Coal Wire · {points.length} articles</span>
</div>

<div class="chrome-bottom">
  <span class="chrome-hint">scroll zoom · drag pan · click open · dbl-click dive · esc reset</span>
</div>

<style>
  canvas {
    display: block;
    cursor: crosshair;
    touch-action: none;
  }

  canvas.dragging {
    cursor: grabbing;
  }

  .overlay {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #9eaaad;
    background: #fffffe;
  }

  .tooltip {
    position: fixed;
    background: #fffffe;
    border: 1px solid #dce3e5;
    padding: 6px 10px;
    pointer-events: none;
    max-width: 240px;
    z-index: 10;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  }

  .tt-meta {
    display: block;
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 10px;
    color: #9eaaad;
    margin-bottom: 2px;
  }

  .tt-title {
    display: block;
    font-size: 13px;
    font-weight: 500;
    color: #1d4961;
    line-height: 1.3;
  }

  .chrome-top {
    position: fixed;
    top: 12px;
    left: 16px;
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #9eaaad;
    pointer-events: none;
  }

  .chrome-bottom {
    position: fixed;
    bottom: 12px;
    right: 16px;
    font-family: 'Barlow Semi Condensed', sans-serif;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #becccf;
    pointer-events: none;
  }
</style>
