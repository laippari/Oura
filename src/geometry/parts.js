import * as THREE from 'three/webgpu';
import { buildBandGeometry } from './band.js';

// Räjäytyskuvan kappaleet.
//
// Sormus leikataan pinnan saumoista neljäksi suljetuksi kappaleeksi (Ouran räjäytysanimaation
// mukaisesti): värillinen ulkokuori, kaksi ohutta värillistä lukitusrengasta ja ohut titaaninen
// sisäkuori. Leikkauspinnat ("cut") ovat koottuna sormuksen sisällä piilossa.
//
// Sisäosat (koottuna piilossa, mitat arvioita Ouran räjäytyskuvista): kaareva akku,
// kiillotettu runkorengas, taipuisa piirilevy sensorityynyineen, sensorien tiivisteet ja
// sensorimoduulien alustat. Koordinaatisto kuten rungossa: z = akseli, θ = 0 kämmenen puoli
// (paikallinen −Y), x = r·sin θ, y = −r·cos θ.

const TAU = Math.PI * 2;

// --- Rungon jako -------------------------------------------------------------------------

export function splitBand(profile, cfg) {
  const S = profile.samples;
  const n = S.length; // viimeinen näyte = ensimmäinen (suljettu silmukka)
  const nearest = (s0) => {
    let best = 0;
    for (let i = 1; i < n; i++) if (Math.abs(S[i].s - s0) < Math.abs(S[best].s - s0)) best = i;
    return best;
  };
  const g = profile.grooves; // [lukitusrengas +z, rako +z, rako −z, lukitusrengas −z] kierron järjestyksessä
  if (g.length !== 4) throw new Error('odotettiin neljä saumaa');
  const [iA, iB, iC, iD] = g.map((x) => nearest(x.s0));

  const lockA = S.slice(iA, iB + 1);
  const outer = S.slice(iB, iC + 1);
  const lockB = S.slice(iC, iD + 1);
  const inner = S.slice(iD, n - 1).concat(S.slice(0, iA + 1));

  const seg = angularSegmentsFor(cfg);
  const surf = (samples) => buildBandGeometry(profile, cfg, samples, seg).geometry;

  // Sulkevat polut (jatkavat silmukan kiertosuuntaa materiaalin sisällä): lukitusrenkaissa ja
  // ulkokuoressa suora jänne, sisäkuoressa pinnan suuntainen seinämä.
  const closeInner = () => {
    const t = 0.4; // sisäkuoren seinämän paksuus
    const off = inner.map((p) => ({ z: p.z - p.nz * t, r: p.r - p.nr * t })).reverse();
    const a = inner[inner.length - 1];
    const d = inner[0];
    return [
      [pt(a), off[0]],
      off,
      [off[off.length - 1], pt(d)],
    ];
  };

  return {
    lockA: { surface: surf(lockA), cut: latheLines([[pt(lockA[lockA.length - 1]), pt(lockA[0])]], seg) },
    outer: { surface: surf(outer), cut: latheLines([[pt(outer[outer.length - 1]), pt(outer[0])]], seg) },
    lockB: { surface: surf(lockB), cut: latheLines([[pt(lockB[lockB.length - 1]), pt(lockB[0])]], seg) },
    inner: { surface: surf(inner), cut: latheLines(closeInner(), seg) },
  };
}

const pt = (p) => ({ z: p.z, r: p.r });
const angularSegmentsFor = (cfg) => cfg.angularSegments;

// Pyöräyttää 2D-murtoviivat (z, r) koko kierroksen. Jokainen murtoviiva on oma sileä pintansa
// (kulmissa terävä reuna). Ulkonormaali = (t_r, −t_z) kulkusuunnan tangentista.
export function latheLines(lines, segs) {
  const pos = [];
  const nrm = [];
  const idx = [];
  const nT = segs + 1;
  for (const line of lines) {
    const m = line.length;
    if (m < 2) continue;
    const base = pos.length / 3;
    const nz = [];
    const nr = [];
    for (let j = 0; j < m; j++) {
      const a = line[Math.max(0, j - 1)];
      const b = line[Math.min(m - 1, j + 1)];
      let tz = b.z - a.z;
      let tr = b.r - a.r;
      const l = Math.hypot(tz, tr) || 1;
      tz /= l;
      tr /= l;
      nz.push(tr);
      nr.push(-tz);
    }
    for (let k = 0; k < nT; k++) {
      const th = -Math.PI + (k / segs) * TAU;
      const sn = Math.sin(th);
      const cs = Math.cos(th);
      for (let j = 0; j < m; j++) {
        const p = line[j];
        pos.push(p.r * sn, -p.r * cs, p.z);
        nrm.push(nr[j] * sn, -nr[j] * cs, nz[j]);
      }
    }
    for (let k = 0; k < segs; k++) {
      for (let j = 0; j < m - 1; j++) {
        const a = base + k * m + j;
        const b = base + (k + 1) * m + j;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
  }
  return makeGeometry(pos, nrm, idx);
}

// --- Pyöristetyn suorakaiteen poikkileikkaus, pyyhkäisy kulmavälille ------------------------

// Silmukka vastapäivään (z oikealle, r ylös), pisteet ja analyyttiset normaalit.
export function roundRectSection(zc, rc, hz, hr, c, nArc = 6) {
  c = Math.min(c, hz, hr);
  const out = [];
  const corners = [
    [zc + hz - c, rc - hr + c, -Math.PI / 2], // oikea ala
    [zc + hz - c, rc + hr - c, 0], // oikea ylä
    [zc - hz + c, rc + hr - c, Math.PI / 2], // vasen ylä
    [zc - hz + c, rc - hr + c, Math.PI], // vasen ala
  ];
  for (const [cz, cr, a0] of corners) {
    for (let k = 0; k <= nArc; k++) {
      const a = a0 + (Math.PI / 2) * (k / nArc);
      out.push({ z: cz + c * Math.cos(a), r: cr + c * Math.sin(a), nz: Math.cos(a), nr: Math.sin(a) });
    }
  }
  return out;
}

// Pyyhkäisee suljetun poikkileikkauksen kulmavälin [θ0, θ1] yli; päätyihin kannet.
export function sweepSection(section, th0, th1, segs, caps = true) {
  const pos = [];
  const nrm = [];
  const idx = [];
  const m = section.length;
  const full = Math.abs(th1 - th0 - TAU) < 1e-6;
  // pinnan reunat: jokainen poikkileikkauspiste kahdesti (terävät kulmat suoraan reunojen väliin)
  const ring = [];
  for (let j = 0; j < m; j++) {
    const a = section[j];
    const b = section[(j + 1) % m];
    ring.push([a, b]);
  }
  for (let e = 0; e < ring.length; e++) {
    const [a, b] = ring[e];
    const base = pos.length / 3;
    for (let k = 0; k <= segs; k++) {
      const th = th0 + (k / segs) * (th1 - th0);
      const sn = Math.sin(th);
      const cs = Math.cos(th);
      for (const p of [a, b]) {
        pos.push(p.r * sn, -p.r * cs, p.z);
        nrm.push(p.nr * sn, -p.nr * cs, p.nz);
      }
    }
    for (let k = 0; k < segs; k++) {
      const v = base + k * 2;
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
  }
  if (caps && !full) {
    for (const [th, sgn] of [[th0, -1], [th1, 1]]) {
      const sn = Math.sin(th);
      const cs = Math.cos(th);
      const n = [sgn * cs, sgn * sn, 0];
      const base = pos.length / 3;
      let cz = 0;
      let cr = 0;
      for (const p of section) {
        cz += p.z / m;
        cr += p.r / m;
      }
      pos.push(cr * sn, -cr * cs, cz);
      nrm.push(...n);
      for (const p of section) {
        pos.push(p.r * sn, -p.r * cs, p.z);
        nrm.push(...n);
      }
      for (let j = 0; j < m; j++) idx.push(base, base + 1 + j, base + 1 + ((j + 1) % m));
    }
  }
  return makeGeometry(pos, nrm, idx);
}

// --- Sisäosat ---------------------------------------------------------------------------

export function buildInternalGeometries(profile, windows, pocket) {
  const Ri = profile.innerRadius;
  const deg = Math.PI / 180;
  const g = {};

  // Kaareva litiumakku sormuksen yläosassa (sensorien vastapuolella) + liitäntäkieleke
  g.battery = sweepSection(roundRectSection(0, Ri + 1.0, 2.25, 0.4, 0.22), 68 * deg, 292 * deg, 200);
  g.batteryTab = sweepSection(roundRectSection(0.6, Ri + 1.02, 1.05, 0.22, 0.1), 292 * deg, 300 * deg, 12);

  // Kiillotettu runkorengas
  g.frame = sweepSection(roundRectSection(0, Ri + 1.57, 2.1, 0.075, 0.07, 4), -Math.PI, Math.PI, 240, false);

  // Taipuisa piirilevy: kapea nauha + leveät tyynyt sensorien kohdalla
  g.pcbStrip = sweepSection(roundRectSection(0, Ri + 0.46, 1.6, 0.06, 0.05, 3), -158 * deg, 158 * deg, 220);
  const pads = [];
  for (const w of windows) {
    const half = (pocket.hA + 0.25) / Ri;
    pads.push(sweepSection(roundRectSection(0, Ri + 0.46, 2.35, 0.066, 0.3, 4), w.thetaC - half, w.thetaC + half, 24));
  }
  g.pcbPads = mergeAll(pads);
  return g;
}

// --- Apufunktiot -------------------------------------------------------------------------

export function makeGeometry(pos, nrm, idx) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setIndex(idx);
  fixWinding(geo);
  geo.computeBoundingSphere();
  return geo;
}

// Kolmioiden kiertosuunta normaalien mukaiseksi (kolmio kerrallaan)
function fixWinding(geo) {
  const p = geo.attributes.position.array;
  const n = geo.attributes.normal.array;
  const ia = geo.index.array;
  for (let t = 0; t < ia.length; t += 3) {
    const a = ia[t] * 3;
    const b = ia[t + 1] * 3;
    const c = ia[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const s = nx * (n[a] + n[b] + n[c]) + ny * (n[a + 1] + n[b + 1] + n[c + 1]) + nz * (n[a + 2] + n[b + 2] + n[c + 2]);
    if (s < 0) {
      const tmp = ia[t + 1];
      ia[t + 1] = ia[t + 2];
      ia[t + 2] = tmp;
    }
  }
}

export function mergeAll(geos) {
  const pos = [];
  const nrm = [];
  const idx = [];
  for (const g of geos) {
    const base = pos.length / 3;
    pos.push(...g.attributes.position.array);
    nrm.push(...g.attributes.normal.array);
    for (const i of g.index.array) idx.push(base + i);
  }
  return makeGeometry(pos, nrm, idx);
}
