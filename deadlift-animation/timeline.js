// Gemeinsame Zeitleiste + Hantel-Physik für Bild (index.html) und Ton (gen-audio.mjs).
// Alle Zeiten in Sekunden, alle Längen in Zentimetern.
(function (root) {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ss = x => { x = clamp(x); return x * x * (3 - 2 * x); };

  const T = {
    DURATION: 25,
    FPS: 24,
    PLATE_R: 22.5,
    LOCKOUT: 77,
    RELEASE: 21.25,

    // Fersenaufsetzer (Bild: Fußbewegung, Ton: Schritte)
    footsteps: [
      { t: 0.62, g: 1.0 },
      { t: 4.2, g: 0.7 }, { t: 4.95, g: 0.75 }, { t: 5.7, g: 0.7 },
      { t: 6.45, g: 0.75 }, { t: 7.2, g: 0.7 }, { t: 7.95, g: 0.65 },
      { t: 8.3, g: 0.35 },
    ],

    // Wassertropfen: Zeitpunkt des Aufpralls, Startpunkt am Körper
    drips: [
      { t: 0.95, x: 37, y: 76 }, { t: 1.4, x: -22, y: 55 }, { t: 1.85, x: -37, y: 76 },
      { t: 2.45, x: 21, y: 55 }, { t: 3.05, x: 38, y: 75 }, { t: 3.55, x: -36, y: 76 },
    ],

    // Atmung: Brustkorb bewegt sich in d Sekunden auf Level "to" (0..1); g = Lautstärke
    breaths: [
      { t: 1.9, d: 1.0, to: 0.7, g: 0.05 }, { t: 3.0, d: 1.2, to: 0.25, g: 0.06 },
      { t: 4.6, d: 0.6, to: 0.2, g: 0.05 }, { t: 5.4, d: 0.5, to: 0.6, g: 0.04 },
      { t: 6.3, d: 0.7, to: 0.2, g: 0.05 }, { t: 7.1, d: 0.5, to: 0.6, g: 0.04 },
      { t: 7.8, d: 0.4, to: 0.3, g: 0.04 },
      { t: 8.3, d: 0.95, to: 1.0, g: 0.16 },
      { t: 9.25, d: 0.4, to: 0.45, g: 0.10 },
      { t: 10.05, d: 0.3, to: 0.75, g: 0.07 }, { t: 10.4, d: 0.3, to: 0.45, g: 0.07 },
      { t: 10.75, d: 0.3, to: 0.8, g: 0.09 }, { t: 11.05, d: 0.25, to: 0.45, g: 0.09 },
      { t: 11.35, d: 0.5, to: 1.0, g: 0.14 },
      { t: 15.35, d: 0.7, to: 0.2, g: 0.24 },
      { t: 16.0, d: 0.45, to: 0.8, g: 0.12 }, { t: 16.5, d: 0.5, to: 0.3, g: 0.12 },
      { t: 17.3, d: 1.0, to: 0.75, g: 0.035 }, { t: 18.6, d: 1.2, to: 0.35, g: 0.035 },
      { t: 19.9, d: 0.9, to: 0.85, g: 0.05 },
      { t: 21.75, d: 1.0, to: 0.2, g: 0.10 },
    ],

    // Stöhnen / Pressatmung während des Zugs
    strain: [12.85, 15.25],

    // Metallisches Klirren der Scheiben (Lift-off und Aufprall kommen aus der Physik dazu)
    clinks: [
      { t: 9.8, g: 0.05 }, { t: 10.3, g: 0.04 }, { t: 11.35, g: 0.08 }, { t: 11.52, g: 0.06 },
      { t: 11.8, g: 0.07 }, { t: 12.4, g: 0.06 }, { t: 13.3, g: 0.06 }, { t: 13.95, g: 0.07 },
      { t: 14.6, g: 0.05 }, { t: 15.3, g: 0.14 }, { t: 15.42, g: 0.08 },
    ],

    // Flackernde Leuchtstoffröhren (id = Röhre)
    flickers: [
      { id: 3, t0: 1.55, t1: 1.95 }, { id: 0, t0: 5.1, t1: 5.6 }, { id: 4, t0: 10.7, t1: 10.95 },
      { id: 3, t0: 13.9, t1: 14.3 }, { id: 6, t0: 19.5, t1: 19.75 },
    ],
    impactFlicker: [21.6, 22.6],
    lightning: [[6.2, 6.28], [6.33, 6.47]],
    thunder: 6.9,
  };

  T.hash = function (n) {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };

  // Helligkeit einer Röhre (id) bzw. des Hauptspots (id = "spot")
  T.light = function (t, id) {
    const h = T.hash;
    const [i0, i1] = T.impactFlicker;
    if (t >= i0 && t < i1) {
      const u = (t - i0) / (i1 - i0);
      const on = h(Math.floor(t * 40) * 1.7 + (id === "spot" ? 99 : id * 13)) > 0.75 * (1 - u * 0.8);
      return on ? 1 : 0.06;
    }
    if (id === 1 && t >= i1) return 0.04; // diese Röhre stirbt beim Aufprall
    if (id === "spot") return 1;
    for (const f of T.flickers) {
      if (f.id === id && t >= f.t0 && t < f.t1) {
        return h(Math.floor(t * 41) + id * 31) > 0.45 ? 1 : 0.1;
      }
    }
    return 1;
  };

  T.lightningLevel = function (t) {
    let v = 0;
    for (const [a, b] of T.lightning) if (t >= a && t < b) v = Math.max(v, 1 - (t - a) / (b - a) * 0.6);
    return v;
  };

  // Brustkorb (0..1) aus den Atem-Events
  T.chest = function (t) {
    let v = 0.3;
    for (const b of T.breaths) {
      if (t < b.t) break;
      const from = v;
      v = t < b.t + b.d ? from + (b.to - from) * ss((t - b.t) / b.d) : b.to;
    }
    return v;
  };

  // Vorgegebene Höhe der Hände (Stangenmitte) solange er die Stange hält
  T.handHeight = function (t) {
    const R = T.PLATE_R;
    if (t < 11.6) return R;
    if (t < 12.4) return R + 1.5 * ss((t - 11.6) / 0.8);
    if (t < 12.75) return R + 1.5 + 2.6 * ss((t - 12.4) / 0.35);
    if (t < 15.3) {
      const u = (t - 12.75) / 2.55;
      const f = ss(u) - 0.03 * Math.sin(2 * Math.PI * u);
      return R + 4.1 + (T.LOCKOUT - R - 4.1) * f + 0.25 * Math.sin(t * 37) * Math.sin(Math.PI * u);
    }
    return T.LOCKOUT + 0.3 * Math.sin((t - 15.3) * 2.3) * Math.exp(-(t - 15.3) * 0.3);
  };

  // Feder-Masse-Simulation: Scheiben (P) hängen an der gebogenen Stange.
  // Nach dem Loslassen hat auch die Stangenmitte (C) eigene Dynamik.
  T.simulateBar = function () {
    const dt = 0.0005, R = T.PLATE_R, g = 981;
    const k = 245, cP = 2 * 0.18 * Math.sqrt(k);
    const kc = 20 * k, cC = 2 * 0.06 * Math.sqrt(kc);
    const n = Math.round(T.DURATION * 1000) + 1;
    const Hs = new Float32Array(n), Ps = new Float32Array(n), Cs = new Float32Array(n);
    let P = R, Pv = 0, C = R, Cv = 0, prevH = R;
    let liftoff = null;
    const impacts = [];
    let step = 0;
    for (let i = 0; i < n * 2; i++) {
      const t = i * dt;
      const held = t < T.RELEASE;
      if (held) {
        const h = T.handHeight(t);
        Cv = (h - prevH) / dt; C = h; prevH = h;
        let a = k * (C - P) - cP * (Pv - Cv) - g;
        Pv += a * dt; P += Pv * dt;
      } else {
        const aP = k * (C - P) - cP * (Pv - Cv) - g;
        const aC = kc * (P - C) - cC * (Cv - Pv) - g;
        Pv += aP * dt; Cv += aC * dt;
        P += Pv * dt; C += Cv * dt;
      }
      if (P <= R) {
        if (Pv < -30 && !held) impacts.push({ t, v: -Pv });
        if (!held && Pv < 0) Pv = -Pv * 0.22;
        else Pv = Math.max(0, Pv);
        if (held) Pv = 0;
        P = R;
      }
      if (liftoff === null && t > 12 && P > R + 0.05) liftoff = t;
      if (i % 2 === 0) { Hs[step] = held ? C : NaN; Ps[step] = P; Cs[step] = C; step++; }
    }
    // Aufprall-Duplikate zusammenfassen
    const imp = [];
    for (const x of impacts) if (!imp.length || x.t - imp[imp.length - 1].t > 0.05) imp.push(x);
    return { Hs, Ps, Cs, liftoff, impacts: imp };
  };

  root.TL = T;
  if (typeof module !== "undefined") module.exports = T;
})(typeof window !== "undefined" ? window : globalThis);
