import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Paikalliset pinnan yksityiskohdat, mitattu virallisista tuotekuvista:
//  • neljä sensori-ikkunaa sisäpinnalla (2 × tri-LED ±34°, 2 × fotodiodi ±60°):
//    upotus titaaniin viistetyllä reunalla, tumma tiivisterako, kirkas "flat-top"-linssi,
//    linssin sisällä komponentit;
//  • suuntausmerkki ulkopinnalla kämmenen puolella (stadionin muotoinen matala upotus);
//  • sisäpinnan yläosan tasainen levy.
//
// Pinnat rakennetaan pyöristetyn suorakaiteen samankeskisistä offset-ääriviivoista, joten
// reunat ja viisteet ovat tarkkaa geometriaa. Paikallinen koordinaatisto: u = kaari kehän
// suuntaan (mm), v = akselin suunta (mm), h = korkeus pinnasta (sisäpinnalla kohti akselia).

const TAU = Math.PI * 2;

// Pyöristetty suorakaide vakiotopologialla (sama pistemäärä kaikilla offseteilla).
export function rrContour(hA, hB, rc, nE = 22, nC = 14) {
  const out = [];
  const r = Math.max(0, rc);
  const ax = Math.max(0, hA - r);
  const bx = Math.max(0, hB - r);
  const corners = [
    [ax, bx, 0],
    [-ax, bx, Math.PI / 2],
    [-ax, -bx, Math.PI],
    [ax, -bx, 1.5 * Math.PI],
  ];
  for (let i = 0; i < 4; i++) {
    const [cx, cy, a0] = corners[i];
    for (let k = 0; k < nC; k++) {
      const t = a0 + (Math.PI / 2) * (k / (nC - 1));
      out.push({ u: cx + r * Math.cos(t), v: cy + r * Math.sin(t), nu: Math.cos(t), nv: Math.sin(t) });
    }
    const [nx, ny] = corners[(i + 1) % 4];
    const t1 = a0 + Math.PI / 2;
    const e0 = [cx + r * Math.cos(t1), cy + r * Math.sin(t1)];
    const e1 = [nx + r * Math.cos(t1), ny + r * Math.sin(t1)];
    for (let k = 1; k <= nE; k++) {
      const f = k / (nE + 1);
      out.push({ u: e0[0] + (e1[0] - e0[0]) * f, v: e0[1] + (e1[1] - e0[1]) * f, nu: Math.cos(t1), nv: Math.sin(t1) });
    }
  }
  return out;
}

// Kartoitus (u, v, h) -> renkaan koordinaatisto.
function makeMapper(surface, R, thetaC, zc) {
  const sign = surface === 'bore' ? -1 : 1; // h kasvaa sisäpinnalla kohti akselia
  return (u, v, h) => {
    const th = thetaC + u / R;
    const rad = R + sign * h;
    const s = Math.sin(th);
    const c = Math.cos(th);
    return {
      p: [rad * s, -rad * c, zc + v],
      eu: [c, s, 0],
      ev: [0, 0, 1],
      eh: [sign * s, -sign * c, 0],
      th,
    };
  };
}

function finishGeometry(pos, nrm, idx, extra, front) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  for (const [name, arr, size] of extra) geo.setAttribute(name, new THREE.Float32BufferAttribute(arr, size));
  geo.setIndex(idx);
  // kiertosuunta normaalien mukaiseksi
  const ia = geo.index.array;
  for (let t = 0; t < ia.length; t += 3) {
    const a = ia[t] * 3, b = ia[t + 1] * 3, c = ia[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (Math.hypot(nx, ny, nz) < 1e-14) continue;
    if (nx * nrm[a] + ny * nrm[a + 1] + nz * nrm[a + 2] < 0) {
      for (let i = 0; i < ia.length; i += 3) {
        const tmp = ia[i + 1];
        ia[i + 1] = ia[i + 2];
        ia[i + 2] = tmp;
      }
    }
    break;
  }
  geo.computeBoundingSphere();
  return geo;
}

function ringIndices(nRings, nPer, idx) {
  for (let i = 0; i < nRings - 1; i++) {
    for (let k = 0; k < nPer; k++) {
      const a = i * nPer + k;
      const b = i * nPer + ((k + 1) % nPer);
      const c = (i + 1) * nPer + k;
      const d = (i + 1) * nPer + ((k + 1) % nPer);
      idx.push(a, b, c, b, d, c);
    }
  }
}

// Upotettu laikku: reunassa (offset = margin) pinnan tasalla, viiste alas, tasainen pohja.
// Runko piilotetaan materiaalissa laikun alueelta, joten saumaa ei synny.
export function buildRecessPatch(o) {
  const { surface, R, thetaC, zc = 0, hA, hB, rc, margin, depth, bevel, floorGap = 0, floorMark = 0, sOf, L } = o;
  const map = makeMapper(surface, R, thetaC, zc);
  const dmin = -Math.min(hA, hB) + 1e-4;
  const offs = [margin, margin * 0.6, margin * 0.3, margin * 0.1, 0];
  for (let k = 1; k <= 9; k++) offs.push(-bevel * (k / 9));
  offs.push(-bevel - 0.01, -bevel - 0.03, -bevel - 0.08);
  const floorStart = -bevel - 0.08;
  for (let k = 1; k <= 5; k++) offs.push(floorStart + (dmin - floorStart) * Math.pow(k / 5, 0.8));
  const depthAt = (d) => (d >= 0 ? 0 : d <= -bevel ? depth : depth * (0.5 - 0.5 * Math.cos(Math.PI * (-d / bevel))));
  const slopeAt = (d) => (d >= 0 || d <= -bevel ? 0 : -depth * 0.5 * Math.PI * Math.sin(Math.PI * (-d / bevel)) / bevel);

  const pos = [], nrm = [], uvs = [], tan = [], cav = [], mk = [], gp = [], idx = [];
  let nPer = 0;
  for (const d of offs) {
    const contour = rrContour(hA + d, hB + d, rc + d);
    nPer = contour.length;
    const dep = depthAt(d);
    const g = slopeAt(d);
    for (const c of contour) {
      const m = map(c.u, c.v, -dep);
      const nl = [g * c.nu, g * c.nv, 1];
      const ll = Math.hypot(nl[0], nl[1], nl[2]);
      const n = [0, 1, 2].map((i) => (nl[0] * m.eu[i] + nl[1] * m.ev[i] + nl[2] * m.eh[i]) / ll);
      pos.push(...m.p);
      nrm.push(...n);
      uvs.push((m.th + Math.PI) / TAU - Math.floor((m.th + Math.PI) / TAU), sOf(zc + c.v) / L);
      tan.push(0, 0, 1, 1);
      const t = Math.min(1, Math.max(0, (-d - bevel * 0.5) / (bevel * 0.5)));
      cav.push(1 - 0.35 * (dep / depth));
      mk.push(floorMark * t);
      gp.push(floorGap * t);
    }
  }
  ringIndices(offs.length, nPer, idx);
  return finishGeometry(pos, nrm, idx, [['uv', uvs, 2], ['tangent', tan, 4], ['cavity', cav, 1], ['mark', mk, 1], ['gap', gp, 1]]);
}

// Kirkas linssi: pystysuora sivuseinä, pyöristetty yläreuna, tasainen yläpinta.
export function buildLens(o) {
  const { R, thetaC, hA, hB, rc, H, rr, base } = o;
  const map = makeMapper('bore', R, thetaC, 0);
  const rings = [];
  rings.push({ d: 0, h: base, n: [1, 0] });
  rings.push({ d: 0, h: H - rr, n: [1, 0] });
  const nArc = 14;
  for (let k = 1; k <= nArc; k++) {
    const phi = (Math.PI / 2) * (k / nArc);
    rings.push({ d: -rr + rr * Math.cos(phi), h: H - rr + rr * Math.sin(phi), n: [Math.cos(phi), Math.sin(phi)] });
  }
  const dmin = -Math.min(hA, hB) + 1e-4;
  for (let k = 1; k <= 6; k++) {
    const d = -rr + (dmin + rr) * (k / 6);
    rings.push({ d, h: H, n: [0, 1] });
  }
  const pos = [], nrm = [], idx = [];
  let nPer = 0;
  for (const rg of rings) {
    const contour = rrContour(hA + rg.d, hB + rg.d, rc + rg.d, 26, 16);
    nPer = contour.length;
    for (const c of contour) {
      const m = map(c.u, c.v, rg.h);
      const nl = [rg.n[0] * c.nu, rg.n[0] * c.nv, rg.n[1]];
      const n = [0, 1, 2].map((i) => nl[0] * m.eu[i] + nl[1] * m.ev[i] + nl[2] * m.eh[i]);
      pos.push(...m.p);
      nrm.push(...n);
    }
  }
  ringIndices(rings.length, nPer, idx);
  return finishGeometry(pos, nrm, idx, []);
}

// Paikallinen kehys pisteessä (u, v, h) sisäpinnalla: X = kehän tangentti, Y = kohti akselia, Z = akseli.
export function frameOnBore(R, thetaC, u, v, h) {
  const th = thetaC + u / R;
  const r = R - h;
  const X = new THREE.Vector3(Math.cos(th), Math.sin(th), 0);
  const Y = new THREE.Vector3(-Math.sin(th), Math.cos(th), 0);
  const Z = new THREE.Vector3(0, 0, 1);
  const m = new THREE.Matrix4().makeBasis(X, Y, Z);
  m.setPosition(r * Math.sin(th), -r * Math.cos(th), v);
  return m;
}

function placeOnBore(group, obj, R, thetaC, u, v, h) {
  obj.updateMatrix();
  const m = frameOnBore(R, thetaC, u, v, h);
  obj.matrixAutoUpdate = false;
  obj.matrix.premultiply(m);
  group.add(obj);
}

function wire(points, radius, mat) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 6, false), mat);
}

// Ristin muotoinen yläelektrodi pienellä LED-sirulla (näkyy virallisissa kuvissa)
function crossElectrode(size, mat) {
  const g = new THREE.Group();
  const t = size * 0.16;
  g.add(new THREE.Mesh(new THREE.BoxGeometry(size, 0.008, t), mat));
  g.add(new THREE.Mesh(new THREE.BoxGeometry(t, 0.008, size), mat));
  const dot = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.2, size * 0.2, 0.012, 16), mat);
  g.add(dot);
  return g;
}

// Tri-LED: valkoinen keraaminen alusta, vihreä emitteri (iso siru) sekä kapea punainen/IR-alue,
// jossa kaksi pientä sirua ristielektrodeineen. dir = suunta kohti fotodiodia (u-akselilla).
export function buildLEDInternals(R, thetaC, dir, mats) {
  const group = new THREE.Group();
  group.name = 'tri-LED';
  const top = 0.17;

  const sub = new THREE.Mesh(new RoundedBoxGeometry(2.8, 0.14, 2.42, 2, 0.04), mats.ledSubstrate);
  sub.position.y = top - 0.07;
  placeOnBore(group, sub, R, thetaC, 0, 0, 0);

  // vihreä emitterialue (läpikuultava silikoni) ja siru
  const gz = new THREE.Mesh(new RoundedBoxGeometry(1.24, 0.03, 1.62, 2, 0.012), mats.greenZone);
  gz.position.set(dir * 0.42, top + 0.012, 0);
  placeOnBore(group, gz, R, thetaC, 0, 0, 0);
  const gd = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.6), mats.dieGreen);
  gd.position.set(dir * 0.34, top + 0.07, 0.22);
  placeOnBore(group, gd, R, thetaC, 0, 0, 0);
  const gpad = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 20), mats.gold);
  gpad.position.set(dir * 0.56, top + 0.116, -0.0);
  placeOnBore(group, gpad, R, thetaC, 0, 0, 0);
  const gw = wire(
    [
      [dir * 0.56, top + 0.12, 0.0],
      [dir * 0.62, top + 0.26, -0.3],
      [dir * 0.7, top + 0.2, -0.55],
      [dir * 0.78, top + 0.02, -0.7],
    ],
    0.009,
    mats.gold
  );
  placeOnBore(group, gw, R, thetaC, 0, 0, 0);

  // punainen + IR -alue: kaksi pientä sirua ristielektrodeilla
  const rz = new THREE.Mesh(new RoundedBoxGeometry(0.56, 0.03, 1.48, 2, 0.012), mats.redZone);
  rz.position.set(-dir * 0.66, top + 0.012, 0.02);
  placeOnBore(group, rz, R, thetaC, 0, 0, 0);
  const dies = [mats.dieRed, mats.dieIR];
  for (let i = 0; i < 2; i++) {
    const vz = 0.12 + i * 0.36;
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.3), dies[i]);
    d.position.set(-dir * 0.66, top + 0.06, vz);
    placeOnBore(group, d, R, thetaC, 0, 0, 0);
    const x = crossElectrode(0.22, mats.gold);
    x.position.set(-dir * 0.66, top + 0.1, vz);
    placeOnBore(group, x, R, thetaC, 0, 0, 0);
    const w = wire(
      [
        [-dir * 0.66, top + 0.105, vz],
        [-dir * 0.8, top + 0.22, vz + 0.04],
        [-dir * 0.98, top + 0.16, vz + 0.08],
        [-dir * 1.1, top + 0.01, vz + 0.1],
      ],
      0.008,
      mats.gold
    );
    placeOnBore(group, w, R, thetaC, 0, 0, 0);
  }
  return group;
}

// Fotodiodi: musta paketti, heijastuksenestopinnoitettu piisiru, hienot alumiinisormet,
// kaksi bondipadia johtimineen.
export function buildPDInternals(R, thetaC, dir, mats) {
  const group = new THREE.Group();
  group.name = 'photodiode';
  const top = 0.08;
  const pkg = new THREE.Mesh(new RoundedBoxGeometry(3.0, 0.1, 2.5, 2, 0.035), mats.pdBody);
  pkg.position.y = top - 0.05;
  placeOnBore(group, pkg, R, thetaC, 0, 0, 0);
  const si = new THREE.Mesh(new THREE.BoxGeometry(2.72, 0.02, 2.22), mats.silicon);
  si.position.y = top + 0.01;
  placeOnBore(group, si, R, thetaC, 0, 0, 0);
  const n = 13;
  for (let i = 0; i < n; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.006, 2.1), mats.aluminium);
    f.position.set(-1.2 + (2.4 * i) / (n - 1), top + 0.022, 0);
    placeOnBore(group, f, R, thetaC, 0, 0, 0);
  }
  const bus = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.006, 0.05), mats.aluminium);
  bus.position.set(0, top + 0.022, -1.07);
  placeOnBore(group, bus, R, thetaC, 0, 0, 0);
  for (const vz of [0.3, 0.72]) {
    const x = crossElectrode(0.16, mats.aluminium);
    x.position.set(dir * 0.95, top + 0.03, vz);
    placeOnBore(group, x, R, thetaC, 0, 0, 0);
    const w = wire(
      [
        [dir * 0.95, top + 0.035, vz],
        [dir * 1.1, top + 0.17, vz + 0.05],
        [dir * 1.28, top + 0.12, vz + 0.1],
        [dir * 1.42, top - 0.04, vz + 0.12],
      ],
      0.006,
      mats.aluminium
    );
    placeOnBore(group, w, R, thetaC, 0, 0, 0);
  }
  return group;
}
