"use client";

import { useEffect, useRef } from "react";

function initSuiCascades(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let animationFrameId = 0;
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const FALL_SPEED = 1.1;
  const COLUMN_DENSITY = 0.75;
  const FONT_SIZE = Math.max(12, Math.round(14));
  const WAVE_RESOLUTION = 4;
  const MAX_RIPPLES = 40;

  // Premium cryptographic and mathematical symbol streams
  const mathSymbols = "\u00D7\u00F7\u2206\u03A3\u03A0\u221A\u221E\u2248\u2260\u2264\u2265\u222B\u2202\u03B1\u03B2\u03B3\u03B8\u03C6\u03C8\u03C9";
  const numbers = "0123456789";
  const allChars = numbers + mathSymbols;
  const randomChar = () => allChars[Math.floor(Math.random() * allChars.length)];

  interface CharState {
    char: string;
    cycleTimer: number;
    cycleRate: number;
  }

  interface Column {
    x: number;
    y: number;
    speed: number;
    length: number;
    chars: CharState[];
    active: boolean;
    restartDelay: number;
    opacity: number;
    hitWater: boolean;
  }

  interface Ripple {
    x: number;
    y: number;
    radius: number;
    maxRadius: number;
    speed: number;
    life: number;
    decay: number;
  }

  interface WavePoint {
    y: number;
    vy: number;
  }

  let columns: Column[] = [];
  let waterSurface = 0;
  let ripples: Ripple[] = [];
  let wavePoints: WavePoint[] = [];

  function createColumn(index: number, scatter: boolean): Column {
    const length = 10 + Math.floor(Math.random() * 18);
    const chars: CharState[] = Array.from({ length: length + 5 }, () => ({
      char: randomChar(),
      cycleTimer: Math.random() * 3,
      cycleRate: 0.4 + Math.random() * 1.8,
    }));

    let y: number;
    if (scatter) {
      if (Math.random() < COLUMN_DENSITY) {
        y = Math.random() * (waterSurface + length * FONT_SIZE) - length * FONT_SIZE * 0.3;
      } else {
        y = -length * FONT_SIZE - Math.random() * height * 0.5;
      }
    } else {
      y = -length * FONT_SIZE * Math.random() * 0.3;
    }

    return {
      x: index * FONT_SIZE,
      y,
      speed: 1.0 + Math.random() * 2.0,
      length,
      chars,
      active: scatter ? Math.random() < (COLUMN_DENSITY + 0.2) : Math.random() < COLUMN_DENSITY,
      restartDelay: 0,
      opacity: 0.4 + Math.random() * 0.6,
      hitWater: false,
    };
  }

  function initSystems() {
    waterSurface = height * 0.82; // Set water ripple boundary line
    const colCount = Math.floor(width / FONT_SIZE);
    columns = Array.from({ length: colCount }, (_, i) => createColumn(i, true));
    const waveCount = Math.ceil(width / WAVE_RESOLUTION) + 1;
    wavePoints = Array.from({ length: waveCount }, () => ({ y: 0, vy: 0 }));
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    initSystems();
  }

  function spawnRipple(x: number, y: number) {
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push({
      x,
      y,
      radius: 0,
      maxRadius: 25 + Math.random() * 40,
      speed: 15 + Math.random() * 20,
      life: 1.0,
      decay: 0.4 + Math.random() * 0.2,
    });
  }

  function disturbWave(x: number, force: number) {
    const idx = Math.floor(x / WAVE_RESOLUTION);
    const spread = 3;
    for (let i = -spread; i <= spread; i++) {
      const wi = idx + i;
      if (wi >= 0 && wi < wavePoints.length) {
        wavePoints[wi].vy += force * (1 - Math.abs(i) / (spread + 1));
      }
    }
  }

  let lastTime = 0;

  function render(timestamp: number) {
    const dt = Math.min((timestamp - (lastTime || timestamp)) / 1000, 0.05);
    lastTime = timestamp;
    const time = timestamp / 1000;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#02040A"; // Deep Sui dark background
    ctx.fillRect(0, 0, width, height);

    if (!prefersReduced) {
      // Update columns
      for (const col of columns) {
        if (!col.active) {
          col.restartDelay -= dt;
          if (col.restartDelay <= 0) {
            if (Math.random() < COLUMN_DENSITY) {
              Object.assign(col, createColumn(Math.floor(col.x / FONT_SIZE), false), { active: true });
            } else {
              col.restartDelay = 0.4 + Math.random() * 1.5;
            }
          }
          continue;
        }

        const prevY = col.y;
        col.y += col.speed * FALL_SPEED * dt * 60;

        for (const c of col.chars) {
          c.cycleTimer -= dt;
          if (c.cycleTimer <= 0) {
            c.char = randomChar();
            c.cycleTimer = c.cycleRate;
          }
        }

        if (!col.hitWater && col.y >= waterSurface && prevY < waterSurface) {
          col.hitWater = true;
          spawnRipple(col.x + FONT_SIZE * 0.5, waterSurface);
          disturbWave(col.x + FONT_SIZE * 0.5, -1.5 - Math.random() * 2);
        }

        if (col.y - col.length * FONT_SIZE > waterSurface + 30) {
          col.active = false;
          col.restartDelay = 0.3 + Math.random() * 2;
        }
      }

      // Update ripples
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        r.radius += r.speed * dt;
        r.life -= r.decay * dt;
        if (r.life <= 0 || r.radius > r.maxRadius) {
          ripples.splice(i, 1);
        }
      }

      // Update wave physics
      for (const p of wavePoints) {
        p.vy += -0.03 * p.y;
        p.vy *= 0.97;
        p.y += p.vy;
      }

      // Neighbor propagation
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < wavePoints.length; i++) {
          if (i > 0) {
            wavePoints[i].vy += 0.25 * (wavePoints[i - 1].y - wavePoints[i].y);
          }
          if (i < wavePoints.length - 1) {
            wavePoints[i].vy += 0.25 * (wavePoints[i + 1].y - wavePoints[i].y);
          }
        }
      }
    }

    // Draw columns with Electric Sui Blue hues
    ctx.font = `${FONT_SIZE}px "Space Grotesk", "SF Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    for (const col of columns) {
      if (!col.active) continue;
      for (let j = 0; j < col.length; j++) {
        const charY = col.y - j * FONT_SIZE;
        if (charY > waterSurface || charY < -FONT_SIZE) continue;

        let brightness: number;
        if (j === 0) brightness = 1.0;
        else if (j === 1) brightness = 0.9;
        else if (j < 4) brightness = 0.75 - (j - 2) * 0.08;
        else brightness = Math.max(0, 0.5 * (1 - j / col.length));

        const distToWater = waterSurface - charY;
        if (distToWater < FONT_SIZE * 3) {
          brightness *= Math.max(0, distToWater / (FONT_SIZE * 3));
        }
        brightness *= col.opacity;
        if (brightness < 0.02) continue;

        // Custom Sui Blue HSL Gradient
        let r: number, g: number, b: number;
        if (j === 0) { r = 240; g = 248; b = 255; }          // Ice White Head
        else if (j < 3) { r = 30; g = 106; b = 255; }       // Electric blue
        else { r = 10; g = 38; b = 88; }                    // Deep Navy tail

        ctx.fillStyle = `rgba(${r},${g},${b},${brightness})`;
        if (j === 0) {
          ctx.shadowColor = "rgba(30, 106, 255, 0.8)";
          ctx.shadowBlur = 10;
        }
        ctx.fillText(col.chars[j % col.chars.length].char, col.x + FONT_SIZE * 0.5, charY);
        if (j === 0) {
          ctx.shadowBlur = 0;
        }
      }
    }

    // Draw water surface ambient gradient
    const waterGrad = ctx.createLinearGradient(0, waterSurface, 0, height);
    waterGrad.addColorStop(0, "rgba(2, 4, 10, 0.7)");
    waterGrad.addColorStop(1, "rgba(4, 10, 24, 0.98)");
    ctx.fillStyle = waterGrad;
    ctx.fillRect(0, waterSurface - 2, width, height - waterSurface + 2);

    // Draw waterline path with high-tech waves
    ctx.beginPath();
    for (let x = 0; x <= width; x += WAVE_RESOLUTION) {
      const idx = Math.floor(x / WAVE_RESOLUTION);
      const waveY = idx < wavePoints.length ? wavePoints[idx].y : 0;
      const ambient = Math.sin(x * 0.015 + time * 1.0) * 1.2 + Math.sin(x * 0.03 + time * 0.6);
      const py = waterSurface + waveY + ambient;
      if (x === 0) ctx.moveTo(x, py);
      else ctx.lineTo(x, py);
    }
    ctx.strokeStyle = "rgba(30, 106, 255, 0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw interactive ripple rings
    for (const r of ripples) {
      const alpha = r.life * 0.4;
      for (let ring = 0; ring < 3; ring++) {
        const ringRadius = r.radius - ring * 6;
        if (ringRadius <= 0) continue;
        ctx.beginPath();
        ctx.ellipse(r.x, r.y + ring * 2, ringRadius, ringRadius * 0.35, 0, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(30, 106, 255, ${alpha * (1 - ring * 0.3)})`;
        ctx.lineWidth = 1.2 - ring * 0.2;
        ctx.stroke();
      }
    }

    animationFrameId = requestAnimationFrame(render);
  }

  function handleInteract(e: MouseEvent | TouchEvent) {
    const touch = "touches" in e ? e.touches[0] : null;
    const x = touch ? touch.clientX : (e as MouseEvent).clientX;
    const y = touch ? touch.clientY : (e as MouseEvent).clientY;

    disturbWave(x, -3.5 - Math.random() * 2.5);
    spawnRipple(x, waterSurface);

    const colIdx = Math.floor(x / FONT_SIZE);
    for (let di = -1; di <= 1; di++) {
      if (columns[colIdx + di]) {
        Object.assign(columns[colIdx + di], {
          active: true,
          y: y,
          speed: 2.0 + Math.random() * 1.5,
          hitWater: false,
        });
      }
    }
  }

  window.addEventListener("resize", resize);
  canvas.addEventListener("click", handleInteract);
  canvas.addEventListener("touchstart", handleInteract as EventListener, { passive: false });

  resize();
  animationFrameId = requestAnimationFrame(render);

  return () => {
    window.removeEventListener("resize", resize);
    canvas.removeEventListener("click", handleInteract);
    canvas.removeEventListener("touchstart", handleInteract as EventListener);
    cancelAnimationFrame(animationFrameId);
  };
}

export default function NeuralVaultMatrix() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const cleanup = initSuiCascades(canvasRef.current);
    return cleanup;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: -5,
        pointerEvents: "auto",
        display: "block",
      }}
    />
  );
}
