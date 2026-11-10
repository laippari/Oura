import * as THREE from 'three/webgpu';

// Rengasrunko: profiili pyöräytetään akselin (paikallinen Z) ympäri.
// θ = 0 on kämmenen puoli (paikallinen -Y): sensorit ja suuntausmerkki.
// Materiaaliryhmät: 0 = ulkokehys (PVD-väri), 1 = sisäkuori (titaani).
// Pinnan paikalliset yksityiskohdat (sensoriupotukset, merkki, levy) ovat erillisiä
// tiheästi tesselloituja "laikkuja", ja rungon pinta piilotetaan niiden kohdalta materiaalissa.

const TAU = Math.PI * 2;

// samples: koko profiili tai sen osa (räjäytyskuvan kappaleet) – kierros pysyy samana.
export function buildBandGeometry(profile, cfg, samples = profile.samples, angularSegments = cfg.angularSegments) {
  const prof = samples;
  const nP = prof.length;
  const nT = angularSegments + 1;
  const cols = nP;

  const vertCount = nT * cols;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const tangents = new Float32Array(vertCount * 4);
  const uvs = new Float32Array(vertCount * 2);
  const cavity = new Float32Array(vertCount);
  const mark = new Float32Array(vertCount);
  const gap = new Float32Array(vertCount);

  let vi = 0;
  for (let k = 0; k < nT; k++) {
    const th = -Math.PI + (k / (nT - 1)) * TAU;
    const sn = Math.sin(th);
    const cs = Math.cos(th);
    for (let j = 0; j < cols; j++) {
      const p = prof[j];
      positions[vi * 3] = p.r * sn;
      positions[vi * 3 + 1] = -p.r * cs;
      positions[vi * 3 + 2] = p.z;
      normals[vi * 3] = p.nr * sn;
      normals[vi * 3 + 1] = -p.nr * cs;
      normals[vi * 3 + 2] = p.nz;
      // Tangentti = profiilin suunta. Anisotropia venyttää heijastuksia tähän suuntaan,
      // mikä vastaa kehän suuntaista harjausta / sorvausta.
      tangents[vi * 4] = p.tr * sn;
      tangents[vi * 4 + 1] = -p.tr * cs;
      tangents[vi * 4 + 2] = p.tz;
      tangents[vi * 4 + 3] = 1;
      uvs[vi * 2] = (th + Math.PI) / TAU;
      uvs[vi * 2 + 1] = p.v;
      cavity[vi] = p.cavity;
      vi++;
    }
  }

  const outerIdx = [];
  const innerIdx = [];
  for (let k = 0; k < nT - 1; k++) {
    for (let j = 0; j < nP - 1; j++) {
      const a = k * cols + j;
      const b = (k + 1) * cols + j;
      const c = (k + 1) * cols + j + 1;
      const d = k * cols + j + 1;
      const isInner = prof[j].inner && prof[j + 1].inner;
      (isInner ? innerIdx : outerIdx).push(a, d, b, b, d, c);
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
  geo.setAttribute('gap', new THREE.BufferAttribute(gap, 1));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  if (outerIdx.length) geo.addGroup(0, outerIdx.length, 0);
  if (innerIdx.length) geo.addGroup(outerIdx.length, innerIdx.length, 1);
  geo.computeBoundingSphere();
  geo.computeBoundingBox();

  return { geometry: geo, stats: { vertices: vertCount, triangles: index.length / 3, angular: nT, profile: nP } };
}
