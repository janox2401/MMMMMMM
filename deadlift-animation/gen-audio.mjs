// Synthetisiert den kompletten Soundtrack (48 kHz, Stereo) passend zur Zeitleiste.
//   node gen-audio.mjs [out.wav]
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const TL = require("./timeline.js");

const SR = 48000, DUR = TL.DURATION, N = Math.round(SR * DUR);
const L = new Float32Array(N), Rr = new Float32Array(N), SEND = new Float32Array(N);
const sim = TL.simulateBar();
const IMPACT = sim.impacts[0].t;

let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const white = () => rnd() * 2 - 1;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const ss = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const idx = t => Math.round(t * SR);

function add(i, v, pan = 0, send = 0) {
  if (i < 0 || i >= N) return;
  L[i] += v * Math.min(1, 1 - pan); Rr[i] += v * Math.min(1, 1 + pan); SEND[i] += v * send;
}
// Einfache Filter
const onePoleLP = fc => { const a = Math.exp(-2 * Math.PI * fc / SR); let y = 0; return x => (y = (1 - a) * x + a * y); };
function biquadBP(fc, q) {
  const w = 2 * Math.PI * fc / SR, al = Math.sin(w) / (2 * q), a0 = 1 + al;
  const b0 = al / a0, b2 = -al / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const f = x => { const y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x; y2 = y1; y1 = y; return y; };
  f.set = (fc2, q2 = q) => { const w2 = 2 * Math.PI * fc2 / SR, al2 = Math.sin(w2) / (2 * q2), a02 = 1 + al2; f.b0 = al2 / a02; };
  return f;
}
// Bandpass mit variabler Mittenfrequenz (State-Variable-Filter)
function svf() { let lp = 0, bp = 0; return (x, fc, q) => { const f = 2 * Math.sin(Math.PI * Math.min(fc, SR / 6) / SR); const hp = x - lp - bp / q; bp += f * hp; lp += f * bp; return { lp, bp, hp }; }; }

// ---------------------------------------------------------------- Ambience --
function ambGain(t) {
  let g = ss(t / 0.8);
  g *= 1 - 0.85 * ss((t - 17) / 0.25) * (1 - ss((t - 21.4) / 0.3));
  if (t > IMPACT) g *= Math.max(0, 1 - (t - IMPACT) / 2.2);
  return g;
}
{
  // Regen: rosa Rauschen, gedämpft (durch Fenster/Keller), zwei Kanäle dekorreliert
  const mk = () => { let b0 = 0, b1 = 0, b2 = 0; const lp = onePoleLP(2200), hp = onePoleLP(180); return () => { const w = white(); b0 = 0.997 * b0 + w * 0.029591; b1 = 0.985 * b1 + w * 0.032534; b2 = 0.95 * b2 + w * 0.048056; const p = b0 + b1 + b2 + w * 0.1; const l = lp(p); return l - hp(l); }; };
  const rl = mk(), rr = mk();
  const rumble = onePoleLP(90); let brown = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR, g = ambGain(t);
    const mod = 0.85 + 0.15 * Math.sin(t * 0.7) * Math.sin(t * 1.3);
    // gelegentliche lautere Tropfen auf Metall draußen
    L[i] += rl() * 0.11 * g * mod; Rr[i] += rr() * 0.11 * g * mod;
    // Lüftungs-/Raumrumpeln
    brown = 0.995 * brown + white() * 0.02;
    const rb = rumble(brown) * 0.55 * g;
    L[i] += rb; Rr[i] += rb;
    // Netzbrummen der Röhren
    let lv = 0; for (const id of [0, 3, 4, 5]) lv += TL.light(t, id);
    const hum = (Math.sin(2 * Math.PI * 100 * t) * 0.6 + Math.sin(2 * Math.PI * 200 * t) * 0.25 + Math.sin(2 * Math.PI * 300 * t) * 0.15) * 0.0035 * lv / 4 * g;
    L[i] += hum; Rr[i] += hum;
  }
}
// Flacker-Knistern
{
  let prev = {};
  for (let i = 0; i < N; i += 48) {
    const t = i / SR;
    for (const id of [0, 3, 4, 6, "spot"]) {
      const v = TL.light(t, id);
      if (prev[id] !== undefined && v !== prev[id]) {
        const amp = id === "spot" ? 0.12 : 0.05;
        for (let k = 0; k < SR * 0.03; k++) add(i + k, white() * amp * Math.exp(-k / (SR * 0.006)), (typeof id === "number" ? (id % 2 ? -0.4 : 0.4) : 0), 0.2);
        // Buzz während an
        if (v > 0.5) for (let k = 0; k < SR * 0.05; k++) { const tt = k / SR; add(i + k, Math.sign(Math.sin(2 * Math.PI * 100 * tt)) * 0.012 * Math.exp(-tt * 40), 0, 0.1); }
      }
      prev[id] = v;
    }
  }
}
// Donner (leise, entfernt)
{
  const lp = onePoleLP(120); let br = 0;
  const t0 = TL.thunder;
  for (let k = 0; k < SR * 3.5; k++) {
    const tt = k / SR;
    br = 0.998 * br + white() * 0.03;
    const env = ss(tt / 0.35) * Math.exp(-tt / 1.1) * (0.7 + 0.3 * Math.sin(tt * 9) * Math.sin(tt * 3.1));
    add(idx(t0) + k, lp(br) * 2.2 * env, -0.2, 0.3);
  }
}

// ------------------------------------------------------------- Schritte ----
function footstep(t0, g) {
  const lp = onePoleLP(2500), bp = biquadBP(700, 1.2);
  const i0 = idx(t0);
  for (let k = 0; k < SR * 0.35; k++) {
    const tt = k / SR;
    const f = 48 + 50 * Math.exp(-tt * 30);
    const thump = Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt * 18) * 0.55;
    const slap = bp(lp(white())) * Math.exp(-tt * 70) * 1.1;
    add(i0 + k, (thump + slap) * g * 0.5, 0, 0.35);
  }
}
for (const f of TL.footsteps) footstep(f.t, f.g);

// Tropfen
for (const d of TL.drips) {
  const i0 = idx(d.t), f0 = 1600 + rnd() * 900;
  for (let k = 0; k < SR * 0.08; k++) {
    const tt = k / SR;
    add(i0 + k, Math.sin(2 * Math.PI * (f0 + 1800 * Math.exp(-tt * 60)) * tt) * Math.exp(-tt * 70) * 0.05, (d.x / 40) * 0.5, 0.4);
  }
}

// --------------------------------------------------------------- Atmung ----
{
  let level = 0.3;
  for (const b of TL.breaths) {
    const inhale = b.to > level;
    level = b.to;
    const f1 = svf(), f2 = svf(), lp = onePoleLP(inhale ? 5000 : 2500);
    const i0 = idx(b.t), n = Math.round(b.d * SR * 1.1);
    for (let k = 0; k < n; k++) {
      const u = k / n;
      const env = Math.pow(Math.sin(Math.PI * Math.min(1, u * (inhale ? 1 : 1.1))), inhale ? 1.4 : 0.8) * (inhale ? 1 : (1 - 0.3 * u));
      const w = lp(white());
      const a = f1(w, inhale ? 1500 + 700 * u : 900 - 200 * u, 3).bp;
      const c = f2(w, inhale ? 3200 : 1700, 4).bp;
      add(i0 + k, (a * 0.8 + c * 0.5) * env * b.g * 2.2, 0, 0.15);
    }
  }
}
// Pressatmung / Stöhnen beim Zug
{
  const [a, b] = TL.strain, i0 = idx(a), n = idx(b) - i0;
  const fA = svf(), fB = svf(), lpN = onePoleLP(1200);
  let ph = 0;
  for (let k = 0; k < n + SR * 0.2; k++) {
    const t = k / SR, u = k / n;
    const env = ss(u / 0.15) * (u < 1 ? (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, u * 0.9))) : Math.exp(-(k - n) / (SR * 0.05)));
    const f0 = 92 + 18 * u + 4 * Math.sin(t * 31) + 3 * (rnd() - 0.5);
    ph += 2 * Math.PI * f0 / SR;
    let src = 0; for (let h = 1; h <= 12; h++) src += Math.sin(ph * h) / h;
    src = src * 0.6 + lpN(white()) * 0.5 * (0.6 + 0.4 * Math.sin(t * 23));
    const v = fA(src, 520, 4).bp * 0.9 + fB(src, 1150, 5).bp * 0.5;
    add(i0 + k, v * env * 0.055, 0, 0.2);
  }
}

// --------------------------------------------------------- Metallklirren ---
function clink(t0, g, pan = 0, size = 1) {
  const i0 = idx(t0);
  const base = [520, 870, 1340, 2010, 2930, 4120].map(f => f * (0.9 + rnd() * 0.2) / size);
  const dec = [0.55, 0.45, 0.35, 0.25, 0.18, 0.12].map(d => d * size);
  const n = Math.round(SR * 1.6 * size);
  for (let k = 0; k < n; k++) {
    const tt = k / SR;
    let v = 0;
    for (let j = 0; j < base.length; j++) v += Math.sin(2 * Math.PI * base[j] * tt + j) * Math.exp(-tt / dec[j]) / (1 + j * 0.4);
    v += white() * Math.exp(-tt * 300) * 0.8;
    add(i0 + k, v * g * 0.35, pan, 0.5);
  }
}
function rattleBurst(t0, g, count, spread) {
  for (let i = 0; i < count; i++) clink(t0 + rnd() * spread, g * (0.4 + rnd() * 0.6), rnd() < 0.5 ? -0.6 : 0.6);
}
for (const c of TL.clinks) rattleBurst(c.t, c.g, 3, 0.06);
rattleBurst(sim.liftoff, 0.22, 7, 0.12);

// ------------------------------------------------- Spannung / Bass-Aufbau ---
{
  const tA = 8.0, tEnd = 16.95;
  const rs = svf();
  for (let i = idx(tA); i < idx(tEnd + 0.02); i++) {
    const t = i / SR, u = (t - tA) / (tEnd - tA);
    const cut = t > tEnd ? 0 : 1;
    const g = Math.pow(u, 1.8) * cut;
    const trem = 0.75 + 0.25 * Math.sin(2 * Math.PI * (0.5 + u * 3) * t);
    const drone = (Math.sin(2 * Math.PI * 41.2 * t) + 0.5 * Math.sin(2 * Math.PI * 55 * t + 1) + 0.25 * Math.sin(2 * Math.PI * 82.4 * t)) * 0.22 * g * trem;
    add(i, drone, 0, 0.05);
    // Riser
    if (t > 13.2) {
      const v = (t - 13.2) / (tEnd - 13.2);
      const r = rs(white(), 250 * Math.pow(14, v), 6).bp;
      add(i, r * 0.07 * v * v * cut, Math.sin(t * 3) * 0.3, 0.2);
    }
  }
  // Pulse (beschleunigend)
  let t = 9.0, gap = 0.95;
  while (t < 16.8) {
    const i0 = idx(t);
    for (let k = 0; k < SR * 0.3; k++) { const tt = k / SR; add(i0 + k, Math.sin(2 * Math.PI * (52 + 30 * Math.exp(-tt * 25)) * tt) * Math.exp(-tt * 9) * 0.3 * ((t - 8.5) / 8.3), 0, 0.1); }
    t += gap; gap = Math.max(0.33, gap * 0.9);
  }
  // Sub-Schlag beim Abheben
  const i0 = idx(sim.liftoff);
  for (let k = 0; k < SR * 1.6; k++) { const tt = k / SR; add(i0 + k, Math.sin(2 * Math.PI * (30 + 40 * Math.exp(-tt * 6)) * tt) * Math.exp(-tt * 2.2) * 0.55, 0, 0.2); }
}

// ---------------------------------------------------- Stille: Herzschlag ---
{
  for (let t = 17.45; t < 21.2; t += 0.82) {
    for (const [off, g] of [[0, 1], [0.24, 0.65]]) {
      const i0 = idx(t + off);
      for (let k = 0; k < SR * 0.25; k++) { const tt = k / SR; add(i0 + k, Math.sin(2 * Math.PI * (44 + 20 * Math.exp(-tt * 30)) * tt) * Math.exp(-tt * 16) * 0.22 * g, 0, 0); }
    }
  }
  // feiner Tinnitus-Ton
  for (let i = idx(17); i < idx(21.3); i++) { const t = i / SR; const e = ss((t - 17) / 0.6) * (1 - ss((t - 20.8) / 0.5)); add(i, Math.sin(2 * Math.PI * 6200 * t) * 0.0025 * e, 0, 0); }
}

// --------------------------------------------------------- Drop + Aufprall --
{
  // Luftzug beim Fallen
  const sw = svf();
  for (let i = idx(TL.RELEASE); i < idx(IMPACT); i++) { const u = (i / SR - TL.RELEASE) / (IMPACT - TL.RELEASE); add(i, sw(white(), 300 + 900 * u, 1.5).bp * 0.06 * u, 0, 0.2); }
  const i0 = idx(IMPACT);
  // Sub-Boom
  for (let k = 0; k < SR * 2.6; k++) { const tt = k / SR; add(i0 + k, Math.sin(2 * Math.PI * (26 + 60 * Math.exp(-tt * 9)) * tt) * Math.exp(-tt * 1.6) * 1.0, 0, 0.3); }
  // Knall
  const lp = onePoleLP(5000);
  for (let k = 0; k < SR * 0.25; k++) { const tt = k / SR; add(i0 + k, lp(white()) * Math.exp(-tt * 28) * 0.9, (rnd() - 0.5) * 0.4, 0.8); }
  // Metall: Scheiben + Stange klingt nach
  rattleBurst(IMPACT, 0.75, 12, 0.08);
  for (let k = 0; k < SR * 3.2; k++) {
    const tt = k / SR;
    let v = 0;
    for (const [f, d, a] of [[176, 1.6, 1], [489, 1.1, 0.6], [963, 0.8, 0.45], [1598, 0.5, 0.3], [2410, 0.35, 0.2]]) v += Math.sin(2 * Math.PI * f * tt) * Math.exp(-tt / d) * a;
    add(i0 + k, v * 0.08 * (1 + 0.3 * Math.sin(tt * 13)), 0, 0.6);
  }
  // Rückpraller
  for (const im of sim.impacts.slice(1)) { rattleBurst(im.t, 0.25, 4, 0.05); const j = idx(im.t); for (let k = 0; k < SR * 0.6; k++) { const tt = k / SR; add(j + k, Math.sin(2 * Math.PI * (40 + 40 * Math.exp(-tt * 15)) * tt) * Math.exp(-tt * 6) * 0.3, 0, 0.3); } }
  // Staub/Geröll-Rauschen
  const lp2 = onePoleLP(900);
  for (let k = 0; k < SR * 2.0; k++) { const tt = k / SR; add(i0 + k, lp2(white()) * Math.exp(-tt * 1.8) * 0.12 * ss(tt / 0.05), (rnd() - 0.5) * 0.8, 0.4); }
}

// --------------------------------------------------------------- Hall ------
function reverb(input, combs, decay) {
  const out = new Float32Array(N);
  for (const ms of combs) {
    const D = Math.round(ms * SR / 1000), buf = new Float32Array(D); let p = 0, lpS = 0;
    const fb = Math.pow(0.001, (ms / 1000) / decay);
    for (let i = 0; i < N; i++) { const y = buf[p]; lpS = lpS * 0.35 + y * 0.65; buf[p] = input[i] + lpS * fb; out[i] += y / combs.length; p = (p + 1) % D; }
  }
  for (const ms of [5.0, 1.7]) {
    const D = Math.round(ms * SR / 1000), buf = new Float32Array(D); let p = 0; const g = 0.7;
    for (let i = 0; i < N; i++) { const b = buf[p], x = out[i], y = -g * x + b; buf[p] = x + g * y; out[i] = y; p = (p + 1) % D; }
  }
  return out;
}
const revL = reverb(SEND, [29.7, 37.1, 41.1, 43.7], 2.1);
const revR = reverb(SEND, [31.3, 35.9, 40.3, 45.1], 2.1);

// -------------------------------------------------------------- Master -----
const master = t => (t < 23.0 ? 1 : Math.max(0, 1 - (t - 23.0) / 1.3));
let peak = 0;
for (let i = 0; i < N; i++) {
  const t = i / SR, m = master(t);
  L[i] = (L[i] + revL[i] * 0.55) * m; Rr[i] = (Rr[i] + revR[i] * 0.55) * m;
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(Rr[i]));
}
const drive = 1.6, norm = 1 / peak;
const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0); buf.writeUInt32LE(36 + N * 4, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(N * 4, 40);
const sat = x => Math.tanh(drive * x) / Math.tanh(drive) * 0.93;
for (let i = 0; i < N; i++) {
  buf.writeInt16LE(Math.round(sat(L[i] * norm) * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(sat(Rr[i] * norm) * 32767), 46 + i * 4);
}
const outPath = process.argv[2] || "audio.wav";
writeFileSync(outPath, buf);
console.log("Audio geschrieben:", outPath, "Peak vor Normalisierung:", peak.toFixed(3));
