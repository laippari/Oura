import * as THREE from 'three/webgpu';

// Rengasrunko: profiili pyöräytetään akselin (paikallinen Z) ympäri.
// θ = 0 on kämmenen puoli (paikallinen -Y), jossa ovat sensorit ja suuntauskuoppa.
//
// Kulmanäytteistys tihenee θ = 0:n ympärillä, jotta suuntauskuoppa saadaan
// mallinnettua todellisena geometriana (ei normaalikarttana).
//
// Materiaaliryhmät: 0 = ulkokehys (ulkopinta + sivut), 1 = sisäkuori.

const TAU = Math.PI * 2;

function angularSamples(base, fineStep, fineHalfWidth) {
  const coarse = TAU / base;
  const M = 200000;
  const density = (th) => 1 / coarse + (1 / fineStep - 1 / coarse) * Math.exp(-Math.pow(th / fineHalfWidth, 4));
  const cum = new Float64Array(M + 1);
  let acc = 0;
  for (let i = 1; i <= M; i++) {
    const th = -Math.PI + ((i - 0.5) / M) * TAU;
    acc += density(th) * (TAU / M);
    cum[i] = acc;
  }
  const n = Math.round(acc);
  const out = new Float64Array(n + 1);
  let j = 0;
  for (let k = 0; k <= n; k++) {
    const target = (k / n) * acc;
    while (j < M && cum[j + 1] < target) j++;
    const f = (target - cum[j]) / Math.max(1e-12, cum[j + 1] - cum[j]);
    out[k] = -Math.PI + ((j + Math.min(1, Math.max(0, f))) / M) * TAU;
  }
  out[0] = -Math.PI;
  out[n] = Math.PI;
  return out;
}

export function buildBandGeometry(profile, cfg) {
  const R0 = profile.outerRadius;
  const { halfArc, halfAxial, depth } = cfg.dimple;

  const thetas = angularSamples(cfg.angularSegments, 0.011 / R0, (halfArc * 4.2) / R0);
  const prof = profile.samples;
  const nP = prof.length;
  const nT = thetas.length;
  const cols = nP + 1; // suljettu silmukka, viimeinen sarake = ensimmäinen (v = 1)

  const vertCount = nT * cols;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const tangents = new Float32Array(vertCount * 4);
  const uvs = new Float32Array(vertCount * 2);
  const cavity = new Float32Array(vertCount);
  const mark = new Float32Array(vertCount); // 1 = laseroitu (matta) pinta

  // Suuntauskuoppa: ellipsimäinen, pehmeäreunainen painauma ulkopinnan harjalla.
  const sCrown = profile.sCrown;
  // Laserilla tehty matala syvennys: tasainen pohja, jyrkähköt mutta pyöristetyt reunat.
  const smooth = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  const dimpleQ = (theta, z, r) => Math.hypot((theta * r) / halfArc, z / halfAxial);
  const dimpleAt = (theta, z, r) => depth * (1 - smooth(0.6, 1.0, dimpleQ(theta, z, r)));
  const surf = (theta, s, out) => {
    const p = profile.evalAt(s);
    const d = dimpleAt(theta, p.z, p.r);
    const r = p.r - p.nr * d;
    const z = p.z - p.nz * d;
    out[0] = r * Math.sin(theta);
    out[1] = -r * Math.cos(theta);
    out[2] = z;
    return d;
  };
  const dimpleThetaLimit = (halfArc * 1.5) / R0;
  const dimpleSLimit = halfAxial * 1.5;
  const pa = [0, 0, 0];
  const pb = [0, 0, 0];
  const pc = [0, 0, 0];
  const pd = [0, 0, 0];

  let vi = 0;
  for (let k = 0; k < nT; k++) {
    const th = thetas[k];
    const sn = Math.sin(th);
    const cs = Math.cos(th);
    const u = (th + Math.PI) / TAU;
    for (let j = 0; j < cols; j++) {
      const p = prof[j % nP];
      const v = j === nP ? 1 : p.v;

      let x = p.r * sn;
      let y = -p.r * cs;
      let z = p.z;
      let nx = p.nr * sn;
      let ny = -p.nr * cs;
      let nz = p.nz;
      let cav = p.cavity;

      // Kuoppa: geometrinen siirtymä + normaali keskeisdifferensseillä.
      if (!p.inner && Math.abs(th) < dimpleThetaLimit && Math.abs(p.s - sCrown) < dimpleSLimit) {
        const d = surf(th, p.s, pa);
        if (d > 0 || Math.abs(th) < dimpleThetaLimit * 0.8) {
          x = pa[0];
          y = pa[1];
          z = pa[2];
          const et = 2e-5;
          const es = 2e-4;
          surf(th + et, p.s, pb);
          surf(th - et, p.s, pc);
          const tx = pb[0] - pc[0], ty = pb[1] - pc[1], tz = pb[2] - pc[2];
          surf(th, p.s + es, pb);
          surf(th, p.s - es, pd);
          const sx = pb[0] - pd[0], sy = pb[1] - pd[1], sz = pb[2] - pd[2];
          // normaali = dS/dθ × dS/ds, suunta tarkistetaan alkuperäistä normaalia vasten
          let cx = ty * sz - tz * sy;
          let cy = tz * sx - tx * sz;
          let cz = tx * sy - ty * sx;
          const cl = Math.hypot(cx, cy, cz) || 1;
          cx /= cl;
          cy /= cl;
          cz /= cl;
          if (cx * nx + cy * ny + cz * nz < 0) {
            cx = -cx;
            cy = -cy;
            cz = -cz;
          }
          nx = cx;
          ny = cy;
          nz = cz;
          cav *= 1 - 0.25 * (d / depth);
          mark[vi] = 1 - smooth(0.72, 0.98, dimpleQ(th, p.z, p.r));
        }
      }

      positions[vi * 3] = x;
      positions[vi * 3 + 1] = y;
      positions[vi * 3 + 2] = z;
      normals[vi * 3] = nx;
      normals[vi * 3 + 1] = ny;
      normals[vi * 3 + 2] = nz;
      // Tangentti = profiilin suunta (akselin suuntainen). Anisotropia venyttää
      // heijastusta tähän suuntaan, kuten sorvatussa sisäpinnassa kuuluukin.
      tangents[vi * 4] = p.tr * sn;
      tangents[vi * 4 + 1] = -p.tr * cs;
      tangents[vi * 4 + 2] = p.tz;
      tangents[vi * 4 + 3] = 1;
      uvs[vi * 2] = u;
      uvs[vi * 2 + 1] = v;
      cavity[vi] = cav;
      vi++;
    }
  }

  const outerIdx = [];
  const innerIdx = [];
  for (let k = 0; k < nT - 1; k++) {
    for (let j = 0; j < nP; j++) {
      const a = k * cols + j;
      const b = (k + 1) * cols + j;
      const c = (k + 1) * cols + j + 1;
      const d = k * cols + j + 1;
      const isInner = prof[j].inner && prof[(j + 1) % nP].inner;
      const list = isInner ? innerIdx : outerIdx;
      // Ulkonormaalit osoittavat profiilista ulos -> vastapäiväinen kierto ulkoa katsottuna
      list.push(a, d, b, b, d, c);
    }
  }

  const index = new Uint32Array(outerIdx.length + innerIdx.length);
  index.set(outerIdx, 0);
  index.set(innerIdx, outerIdx.length);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('tangent', new THREE.BufferAttribute(tangents, 4));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('cavity', new THREE.BufferAttribute(cavity, 1));
  geo.setAttribute('mark', new THREE.BufferAttribute(mark, 1));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.addGroup(0, outerIdx.length, 0);
  geo.addGroup(outerIdx.length, innerIdx.length, 1);
  geo.computeBoundingSphere();
  geo.computeBoundingBox();

  return { geometry: geo, stats: { vertices: vertCount, triangles: index.length / 3, angular: nT, profile: nP } };
}
