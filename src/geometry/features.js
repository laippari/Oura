import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeGeometry } from './parts.js';

// Paikalliset pinnan yksityiskohdat, mitattu virallisista tuotekuvista:
//  • neljä sensori-ikkunaa sisäpinnalla (2 × tri-LED ±34°, 2 × fotodiodi ±60°):
//    upotus titaaniin viistetyllä reunalla, tumma tiivisterako, kirkas linssi (LED: loiva kupu, fotodiodi: tasainen ikkuna),
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

// Kartoitus (u, v, h) -> renkaan koordinaatisto. Pinta seuraa poikkileikkauksen kaarevuutta:
// Rf(z) antaa pinnan säteen akselin kohdassa z, ja h mitataan pinnan todellista normaalia pitkin.
export function makeMapper(surface, R, thetaC, zc, Rf = () => R) {
  const sign = surface === 'bore' ? -1 : 1; // h kasvaa sisäpinnalla kohti akselia
  const e = 1e-4;
  return (u, v, h) => {
    const th = thetaC + u / R;
    const z = zc + v;
    const rs = Rf(z);
    const dR = (Rf(z + e) - Rf(z - e)) / (2 * e);
    const k = 1 / Math.hypot(1, dR);
    const s = Math.sin(th);
    const c = Math.cos(th);
    // pinnan normaali (z, r)-tasossa: ulkopinnalla (-R', 1), reiässä (R', -1)
    const nz = -sign * dR * k;
    const nr = sign * k;
    const er = [s, -c, 0];
    const eh = [nr * er[0], nr * er[1], nz];
    return {
      p: [rs * er[0] + h * eh[0], rs * er[1] + h * eh[1], z + h * eh[2]],
      eu: [c, s, 0],
      ev: [dR * k * er[0], dR * k * er[1], k],
      eh,
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
  const { surface, R, thetaC, zc = 0, hA, hB, rc, margin, depth, bevel, floorGap = 0, floorMark = 0, sOf, L, Rf } = o;
  const map = makeMapper(surface, R, thetaC, zc, Rf);
  const dmin = -Math.min(hA, hB) + 1e-4;
  const offs = [margin, margin * 0.6, margin * 0.3, margin * 0.1, 0];
  for (let k = 1; k <= 9; k++) offs.push(-bevel * (k / 9));
  offs.push(-bevel - 0.01, -bevel - 0.03, -bevel - 0.08);
  const floorStart = -bevel - 0.08;
  for (let k = 1; k <= 5; k++) offs.push(floorStart + (dmin - floorStart) * Math.pow(k / 5, 0.8));
  // tumma tiivisterako vain kapeana renkaana upotuksen reunan ja linssin välissä (gapIn..gapOut)
  const gapOut = -(o.gapEnd ?? bevel + 0.08); // raon ulkoraja (offset upotuksen reunasta, linssin reuna + rako)
  if (floorGap) offs.push(gapOut, gapOut - 0.02, gapOut - 0.04, gapOut - 0.08);
  offs.sort((a, b) => b - a);
  for (let i = offs.length - 1; i > 0; i--) if (Math.abs(offs[i] - offs[i - 1]) < 1e-6) offs.splice(i, 1);
  const depthAt = (d) => (d >= 0 ? 0 : d <= -bevel ? depth : depth * (0.5 - 0.5 * Math.cos(Math.PI * (-d / bevel))));
  const slopeAt = (d) => (d >= 0 || d <= -bevel ? 0 : -depth * 0.5 * Math.PI * Math.sin(Math.PI * (-d / bevel)) / bevel);

  const pos = [], nrm = [], uvs = [], tan = [], cav = [], mk = [], gp = [], win = [], idx = [];
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
      const tOut = Math.min(1, Math.max(0, (d - (gapOut - 0.04)) / 0.04)); // 1 raossa, 0 linssin alla
      cav.push(1 - 0.35 * (dep / depth));
      mk.push(floorMark * t);
      gp.push(floorGap * t * tOut);
      win.push(floorGap * t * (1 - tOut)); // linssin alla: räjäytyskuvassa avoin ikkuna
    }
  }
  ringIndices(offs.length, nPer, idx);
  return finishGeometry(pos, nrm, idx, [['uv', uvs, 2], ['tangent', tan, 4], ['cavity', cav, 1], ['mark', mk, 1], ['gap', gp, 1], ['win', win, 1]]);
}

// Kirkas linssi: pystysuora sivuseinä, pyöristetty yläreuna, tasainen yläpinta.
export function buildLens(o) {
  const { R, thetaC, hA, hB, rc, H, rr, base, Rf, domeRadius = null } = o;
  const map = makeMapper('bore', R, thetaC, 0, Rf);
  // Yläpinta on linssin omassa tangenttitasossa joko taso (fotodiodi) tai loiva pallokupu
  // (LED, säde domeRadius) – mitattu virallisten aksiaalikuvien linssiprofiileista.
  // crown(u, v) = pudotus huipusta korkeutena kaarevan sisäpinnan yläpuolella: tason jänne
  // kehän suunnassa + soikean reiän pullistuma akselin suunnassa + kuvun nuoli.
  const R0 = Rf(0);
  const sag = (s) => (domeRadius ? domeRadius - Math.sqrt(Math.max(0, domeRadius * domeRadius - s * s)) : 0);
  const crown = (u, v) => (R - H) * (1 / Math.cos(u / R) - 1) - (Rf(v) - R0) + sag(Math.hypot(u, v));
  const e = 1e-4;
  const rings = [];
  rings.push({ d: 0, h: base, n: [1, 0], fixed: true });
  rings.push({ d: 0, h: H - rr, n: [1, 0] });
  const nArc = 12;
  for (let k = 1; k <= nArc; k++) {
    const phi = (Math.PI / 2) * (k / nArc);
    rings.push({ d: -rr + rr * Math.cos(phi), h: H - rr + rr * Math.sin(phi), n: [Math.cos(phi), Math.sin(phi)] });
  }
  const dmin = -Math.min(hA, hB) + 1e-4;
  for (let k = 1; k <= 8; k++) {
    const d = -rr + (dmin + rr) * Math.pow(k / 8, 0.85);
    rings.push({ d, h: H, n: [0, 1] });
  }
  const pos = [], nrm = [], idx = [];
  let nPer = 0;
  for (const rg of rings) {
    const contour = rrContour(hA + rg.d, hB + rg.d, rc + rg.d, 26, 16);
    nPer = contour.length;
    for (const c of contour) {
      let h = rg.h;
      let nl = [rg.n[0] * c.nu, rg.n[0] * c.nv, rg.n[1]];
      if (!rg.fixed) {
        h -= crown(c.u, c.v);
        // kallistetaan normaalia pudotuksen gradientin verran (pystyseinä ei muutu)
        const gu = (crown(c.u + e, c.v) - crown(c.u - e, c.v)) / (2 * e);
        const gv = (crown(c.u, c.v + e) - crown(c.u, c.v - e)) / (2 * e);
        nl = [nl[0] + nl[2] * gu, nl[1] + nl[2] * gv, nl[2]];
        const l = Math.hypot(nl[0], nl[1], nl[2]);
        nl = nl.map((x) => x / l);
        h = Math.max(h, base + 0.01);
      }
      const m = map(c.u, c.v, h);
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

// ku skaalaa komponentit kehän suunnassa (ikkunan pituus seuraa mitattua kulmaa ja sormuksen kokoa)
function placeOnBore(group, obj, R, thetaC, u, v, h, ku = 1) {
  obj.updateMatrix();
  const m = frameOnBore(R, thetaC, u, v, h);
  obj.matrixAutoUpdate = false;
  obj.matrix.premultiply(new THREE.Matrix4().makeScale(ku, 1, 1)).premultiply(m);
  group.add(obj);
}

// Pyöristetyn suorakaiteen polku (keskipiste cx, cy)
function rrPath(path, cx, cy, w, d, r) {
  const x0 = cx - w / 2, y0 = cy - d / 2;
  path.moveTo(x0 + r, y0);
  path.lineTo(x0 + w - r, y0);
  path.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
  path.lineTo(x0 + w, y0 + d - r);
  path.quadraticCurveTo(x0 + w, y0 + d, x0 + w - r, y0 + d);
  path.lineTo(x0 + r, y0 + d);
  path.quadraticCurveTo(x0, y0 + d, x0, y0 + d - r);
  path.lineTo(x0, y0 + r);
  path.quadraticCurveTo(x0, y0, x0 + r, y0);
  return path;
}

// Pyöristetty litteä levy (paksuus y-suunnassa, keskitetty). holes: [{ x, z, w, d, r }] = läpi
// menevät pyöristetyt aukot (LED-kotelon kupit).
function roundedSlab(w, d, h, r, holes = []) {
  const sh = rrPath(new THREE.Shape(), 0, 0, w, d, r);
  // kierto vie muodon y-akselin −z:ksi, joten aukon z-paikka peilataan
  for (const o of holes) sh.holes.push(rrPath(new THREE.Path(), o.x, -o.z, o.w, o.d, o.r));
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 10 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -h / 2, 0);
  return g;
}

// Bondilanka: putki pisteiden kautta (palauttaa geometrian)
function wire(points, radius) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.TubeGeometry(curve, 24, radius, 6, false);
}

// Yhdistää ryhmän staattiset osat materiaaleittain (vähemmän piirtokutsuja mobiilissa).
export function mergeByMaterial(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map();
  group.traverse((o) => {
    if (!o.isMesh) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
  });
  const out = new THREE.Group();
  out.name = group.name;
  for (const [mat, geos] of byMat) out.add(new THREE.Mesh(mergeGeometries(geos), mat));
  return out;
}

// Sensorien sisäosat on mallinnettu oikean sormuksen makrokuvan ja Ouran lähirenderöinnin
// mukaan. Paikallinen kehys ikkunan keskellä: x = kehän suunta, y = korkeus (kohti akselia),
// z = akselin suunta. Mitat millimetreinä 3.1 × 3.2 mm:n ikkunalle.

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// Tri-LED: valkoinen kotelo, jossa kaksi upotettua heijastinkuppia. Isommassa kupissa vihreä
// siru (InGaN, kellanvihreä, liitostyyny kulmassa), kapeammassa punainen (raidallinen
// elektrodi) ja infrapunasiru (tumma) päällekkäin akselin suunnassa; kultaiset bondilangat.
// dir = suunta kohti fotodiodia (x-akselilla): vihreä kuppi on fotodiodin puolella.
export function buildLEDInternals(R, thetaC, dir, mats) {
  const group = new THREE.Group();
  group.name = 'tri-LED';
  const put = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    placeOnBore(group, m, R, thetaC, 0, 0, 0);
    return m;
  };
  const floor = 0.07; // kuppien pohjan korkeus
  const rim = 0.2; // kotelon yläpinta
  const gx = dir * 0.48; // vihreän kupin keskikohta
  const rx = -dir * 0.72; // punaisen/IR-kupin keskikohta
  const cupD = 1.72;

  // kotelo: pohjalevy + kehys, jossa kuppien aukot
  put(roundedSlab(2.8, 2.9, floor + 0.05, 0.5), mats.ledSubstrate, 0, (floor - 0.05) / 2, 0);
  put(
    roundedSlab(2.8, 2.9, rim - floor, 0.5, [
      { x: gx, z: 0, w: 1.2, d: cupD, r: 0.2 },
      { x: rx, z: 0, w: 0.6, d: cupD, r: 0.16 },
    ]),
    mats.ledSubstrate,
    0,
    (rim + floor) / 2,
    0
  );
  // kuppien sävytetty pohja (silikonitäyte)
  put(roundedSlab(1.19, cupD - 0.01, 0.02, 0.2), mats.greenZone, gx, floor + 0.01, 0);
  put(roundedSlab(0.59, cupD - 0.01, 0.02, 0.16), mats.redZone, rx, floor + 0.01, 0);

  // vihreä siru + kulmatyyny + lanka kupin reunan tyynylle
  const gz = 0.12;
  put(box(0.62, 0.09, 0.62), mats.dieGreen, gx - dir * 0.05, floor + 0.065, gz);
  put(box(0.15, 0.012, 0.15), mats.gold, gx - dir * 0.05 + dir * 0.2, floor + 0.116, gz - 0.2);
  put(box(0.2, 0.012, 0.16), mats.gold, gx + dir * 0.42, floor + 0.026, -0.62);
  put(
    wire(
      [
        [gx + dir * 0.15, floor + 0.12, gz - 0.2],
        [gx + dir * 0.22, floor + 0.24, gz - 0.38],
        [gx + dir * 0.34, floor + 0.2, gz - 0.58],
        [gx + dir * 0.42, floor + 0.035, -0.62],
      ],
      0.011,
      mats.gold
    ),
    mats.gold,
    0,
    0,
    0
  );

  // punainen (ylempi) ja infrapunasiru (alempi): keskipiste-elektrodi, lanka kupin päätyyn
  for (const [mat, vz, striped] of [[mats.dieRed, 0.33, true], [mats.dieIR, -0.33, false]]) {
    put(box(0.3, 0.07, 0.3), mat, rx, floor + 0.055, vz);
    if (striped) for (const o of [-0.09, 0, 0.09]) put(box(0.26, 0.006, 0.02), mats.dieStripe, rx, floor + 0.093, vz + o);
    put(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 14), mats.gold, rx, floor + 0.097, vz);
    const end = Math.sign(vz) * 0.74;
    put(box(0.2, 0.012, 0.12), mats.gold, rx, floor + 0.026, end);
    put(
      wire(
        [
          [rx, floor + 0.1, vz],
          [rx + dir * 0.03, floor + 0.2, vz + (end - vz) * 0.35],
          [rx + dir * 0.02, floor + 0.17, vz + (end - vz) * 0.75],
          [rx, floor + 0.035, end],
        ],
        0.01,
        mats.gold
      ),
      mats.gold,
      0,
      0,
      0
    );
  }
  return group;
}

// Fotodiodi: musta kotelo linssin reunaan asti, neliömäinen piisiru (heijastuksenestopinnoite,
// sinivihreä reuna, hienot sormet) siirrettynä kohti LEDiä, kaksi kultaista liitostyynyä
// vastakkaisella reunalla ja bondilangat sirun kulmiin.
// dir = suunta poispäin LEDistä (x-akselilla).
export function buildPDInternals(R, thetaC, dir, mats) {
  const group = new THREE.Group();
  group.name = 'photodiode';
  const put = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    placeOnBore(group, m, R, thetaC, 0, 0, 0);
    return m;
  };
  const top = 0.05; // kotelon pohjan yläpinta
  const dx = -dir * 0.22; // sirun keskikohta
  const half = 0.88;

  put(roundedSlab(2.86, 2.96, 0.11, 0.56), mats.pdBody, 0, top - 0.055, 0);
  // siru: reunus (pinnoitteen sinivihreä reuna) + aktiivinen pinta
  put(box(half * 2 + 0.09, 0.05, half * 2 + 0.09), mats.pdEdge, dx, top + 0.025, 0);
  put(box(half * 2, 0.054, half * 2), mats.silicon, dx, top + 0.03, 0);
  // hienot sormet akselin suuntaan + kokoojakisko
  const n = 11;
  for (let i = 0; i < n; i++) put(box(0.007, 0.004, half * 2 - 0.2), mats.pdFinger, dx - half + 0.16 + ((half * 2 - 0.32) * i) / (n - 1), top + 0.059, 0);
  put(box(half * 2 - 0.24, 0.004, 0.03), mats.pdFinger, dx, top + 0.059, -half + 0.1);

  // liitostyynyt alustalla ja sirun kulmissa, langat niiden välillä
  const padX = dir * 1.12;
  const dieEdge = dx + dir * (half - 0.11);
  for (const vz of [0.56, -0.56]) {
    put(box(0.3, 0.014, 0.24), mats.gold, padX, top + 0.007, vz);
    put(box(0.13, 0.008, 0.13), mats.gold, dieEdge, top + 0.061, vz * 1.25);
    put(
      wire(
        [
          [padX - dir * 0.02, top + 0.016, vz],
          [padX - dir * 0.12, top + 0.15, vz * 1.06],
          [dieEdge + dir * 0.14, top + 0.17, vz * 1.2],
          [dieEdge, top + 0.066, vz * 1.25],
        ],
        0.011,
        mats.gold
      ),
      mats.gold,
      0,
      0,
      0
    );
  }
  // kapea kultainen johdinliuska LEDin puoleisella reunalla
  put(box(0.1, 0.012, 0.5), mats.gold, -dir * 1.24, top + 0.006, 0.72);
  return group;
}

// Räjäytyskuvan osat sisäpinnalla: sensorin tiiviste (pyöristetty kehys taskun ja linssin
// välissä) ja sensorimoduulin alusta (laatta taskun pohjan alla). Koottuna piilossa.
function boreSolid(o, frame) {
  const { R, thetaC, hA, hB, rc, width = 0, h0, h1, Rf } = o;
  const map = makeMapper('bore', R, thetaC, 0, Rf);
  const outerC = rrContour(hA, hB, rc, 18, 10);
  const innerC = frame ? rrContour(hA - width, hB - width, Math.max(0.05, rc - width), 18, 10) : null;
  const pos = [];
  const nrm = [];
  const idx = [];
  const put = (c, h, nl) => {
    const m = map(c.u, c.v, h);
    pos.push(...m.p);
    nrm.push(...[0, 1, 2].map((i) => nl[0] * m.eu[i] + nl[1] * m.ev[i] + nl[2] * m.eh[i]));
  };
  const strip = (cA, hA_, nA, cB, hB_, nB) => {
    const base = pos.length / 3;
    const n = cA.length;
    for (let k = 0; k < n; k++) {
      put(cA[k], hA_, nA(cA[k]));
      put(cB[k], hB_, nB(cB[k]));
    }
    for (let k = 0; k < n; k++) {
      const a = base + k * 2;
      const b = base + ((k + 1) % n) * 2;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  };
  const fan = (c, h, nl) => {
    const base = pos.length / 3;
    put({ u: 0, v: 0 }, h, nl);
    for (const p of c) put(p, h, nl);
    for (let k = 0; k < c.length; k++) idx.push(base, base + 1 + k, base + 1 + ((k + 1) % c.length));
  };
  const side = (c) => [c.nu, c.nv, 0];
  const up = () => [0, 0, 1];
  const down = () => [0, 0, -1];
  strip(outerC, h0, side, outerC, h1, side);
  if (frame) {
    const inward = (c) => [-c.nu, -c.nv, 0];
    strip(outerC, h1, up, innerC, h1, up);
    strip(innerC, h1, inward, innerC, h0, inward);
    strip(innerC, h0, down, outerC, h0, down);
  } else {
    fan(outerC, h1, [0, 0, 1]);
    fan(outerC, h0, [0, 0, -1]);
  }
  return makeGeometry(pos, nrm, idx);
}

export const buildGasket = (o) => boreSolid(o, true);
export const buildModuleBase = (o) => boreSolid(o, false);
