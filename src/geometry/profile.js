// Renkaan poikkileikkausprofiili (z = akselin suunta, r = säde).
//
// Rakenne (Ouran purkukuva + aksiaaliset tuotekuvat), sivupinnalla ulkoa sisään:
//   värillinen kuori: tasainen ulkopinta, jonka reuna kaartuu kaarevuuden kasvaessa tasaisesti
//     (G2-jatkuva alku, pyöreä loppu) 0.515 mm:n syvyyteen; kuoren pää jää lukitusrenkaan
//     pinnan tason sisäpuolelle
//   kapea rako
//   värillinen ohut lukitusrengas (tasainen pinta, pyöristetyt reunat) – sormuksen levein kohta
//   sauma
//   titaaninen sisäosa: pyöreäreunainen, kaartuu sivupinnalta reiän pinnaksi
// Mitat: säteittäiset rajat aksiaalikuvasta (perspektiivikamera ratkaistu reiän reunasta,
// lähireunan peittorajasta ja ulkoreunasta), muoto 43°-tuotekuvan ääriviivasta
// (tools/fit_profile.py, tools/axial_features.py).
//
// Profiili rakennetaan oikeasta puolikkaasta (z ≥ 0), peilataan ja näytteistetään
// adaptiivisesti. Kierto on vastapäivään (z vaaka, r pysty), joten ulkonormaali on (dr, -dz).

// Kuoren reuna: normaalin kääntymiskulma theta(u) = Phi * u^(ramp+1) kaarenpituuden suhteen (u = s/S).
// Kaarevuus kasvaa tasaisesti nollasta (G2-liitos ulkopintaan). Kun Phi > 90°, reuna kaartuu
// levein kohdan ohi takaisin sisäänpäin (täysin pyöreä reuna) ja päättyy säteittäiseen syvyyteen drop.
export function cornerCurve(ramp, drop, endAngleDeg = 90, k = 400) {
  const Phi = (endAngleDeg * Math.PI) / 180;
  const M = 20000;
  const z = new Float64Array(M + 1);
  const d = new Float64Array(M + 1);
  for (let i = 1; i <= M; i++) {
    const t0 = Phi * Math.pow((i - 1) / M, ramp + 1);
    const t1 = Phi * Math.pow(i / M, ramp + 1);
    z[i] = z[i - 1] + (0.5 * (Math.cos(t0) + Math.cos(t1))) / M;
    d[i] = d[i - 1] + (0.5 * (Math.sin(t0) + Math.sin(t1))) / M;
  }
  const S = drop / d[M];
  const pts = [];
  let iMax = 0;
  for (let j = 0; j <= k; j++) {
    const i = Math.round((j / k) * M);
    pts.push([z[i] * S, -d[i] * S]);
    if (pts[j][0] > pts[iMax][0]) iMax = j;
  }
  return { pts, iMax, zMax: pts[iMax][0], depthAtMax: -pts[iMax][1], arcLength: S, endRadius: S / ((ramp + 1) * Phi) };
}

export function buildProfile(cfg) {
  const a = cfg.width / 2;
  const Ri = cfg.innerRadius;
  const Ro = Ri + cfg.thickness;
  const C = cfg.corner;
  const G = cfg.shellGap;
  const LR = cfg.lockingRing;
  const SM = cfg.seam;
  const F = cfg.innerEdge;

  const corner = cornerCurve(C.ramp, C.drop, C.endAngleDeg);

  // --- Oikea puolikas tiheänä polylinjana ------------------------------------
  const pts = []; // [z, r, region, cavity]
  const step = 0.0005;
  const push = (z, r, region, cav = 1) => pts.push([z, r, region, cav]);
  const line = (z0, r0, z1, r1, region, cav0 = 1, cav1 = cav0) => {
    const n = Math.max(2, Math.ceil(Math.hypot(z1 - z0, r1 - r0) / step));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      push(z0 + (z1 - z0) * t, r0 + (r1 - r0) * t, region, cav0 + (cav1 - cav0) * t);
    }
  };
  // pyöristys kahden suoran välillä (neliöllinen Bézier, kontrollipiste kulmassa)
  const round = (p0, c, p1, region, cav0 = 1, cav1 = cav0) => {
    const n = 600;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const u = 1 - t;
      push(u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1], region, cav0 + (cav1 - cav0) * t);
    }
  };

  // 1) reiän pinta keskeltä sisäosan reunan pyöristykseen
  //    Ääriviiva vaatii reiän pinnan ulottuvan ~0.07 mm:n päähän sivupinnan tasosta, joten reunan
  //    pyöristyssäde on enintään ~0.09 mm (tukifunktioehto); pinta sen yläpuolella on loivasti kupera.
  const rho = F.edgeRadius;
  const zEdgeC = a - F.edgeInset - rho; // pyöristyksen keskipiste (z)
  line(0, Ri, zEdgeC, Ri, 'shell');
  // 2) pyöristys reiän pinnasta sivupinnalle (neljännesympyrä)
  {
    const M = 240;
    for (let i = 0; i < M; i++) {
      const t = -Math.PI / 2 + (Math.PI / 2) * (i / M);
      push(zEdgeC + rho * Math.cos(t), Ri + rho + rho * Math.sin(t), 'shell');
    }
  }
  //    ja loivasti kupera pinta ylös saumaan (alkaa pystysuorana, kallistuu hieman sisään)
  {
    const p0 = [zEdgeC + rho, Ri + rho];
    const c = [zEdgeC + rho, Ri + rho + (F.height - rho) * 0.45];
    const p1 = [a - F.recess, Ri + F.height];
    const M = 1200;
    for (let i = 0; i < M; i++) {
      const t = i / M;
      const u = 1 - t;
      push(u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1], 'shell');
    }
  }
  // 3) sisäosan yläreunan pieni pyöristys ja sauma lukitusrenkaaseen
  const zF = a - F.recess;
  const rF = Ri + F.height;
  const rS0 = rF + F.topEdge; // sauman sisäseinä
  const rS1 = Ro - LR.inner; // sauman ulkoseinä = lukitusrenkaan sisäreuna
  const zSm = a - SM.depth;
  round([zF, rF], [zF, rS0], [zF - F.topEdge, rS0], 'shell', 1, 0.6);
  line(zF - F.topEdge, rS0, zSm, rS0, 'shell', 0.6, 0.15);
  line(zSm, rS0, zSm, (rS0 + rS1) / 2, 'shell', 0.12, 0.1);
  line(zSm, (rS0 + rS1) / 2, zSm, rS1, 'frame', 0.1, 0.12);
  // 4) lukitusrengas – sormuksen levein kohta (pinta z = a): sisäreunan pyöristys, tasainen pinta,
  //    ulkoreunan pyöristys alas renkaan ulkoseinälle
  const zL = a - LR.recess;
  line(zSm, rS1, zL - LR.innerEdge, rS1, 'frame', 0.15, 0.6);
  round([zL - LR.innerEdge, rS1], [zL, rS1], [zL, rS1 + LR.innerEdge], 'frame', 0.6, 1);
  const rLout = Ro - LR.outer;
  line(zL, rS1 + LR.innerEdge, zL, rLout - LR.outerEdge, 'frame');
  round([zL, rLout - LR.outerEdge], [zL, rLout], [zL - LR.outerEdge, rLout], 'frame', 1, 0.7);
  // 5) rako lukitusrenkaan ja kuoren välissä
  const zShellMax = a - C.recess; // kuoren levein kohta
  const zc0 = zShellMax - corner.zMax; // kulman alku ulkopinnalla
  const endPt = corner.pts[corner.pts.length - 1];
  const zShellEnd = zc0 + endPt[0];
  const zG = Math.min(zShellEnd, zL - LR.outerEdge) - G.depth;
  const rGs = Ro - G.shellWall; // kuoren puoleinen seinä
  line(zL - LR.outerEdge, rLout, zG, rLout, 'frame', 0.7, 0.12);
  line(zG, rLout, zG, rGs, 'frame', 0.1, 0.1);
  line(zG, rGs, zShellEnd - G.edge, rGs, 'frame', 0.12, 0.6);
  // kuoren pään pieni pyöristys kulmakaaren loppuun
  round([zShellEnd - G.edge, rGs], [zShellEnd, rGs], [zShellEnd, Ro - C.drop], 'frame', 0.6, 1);
  // 6) kuoren pyöreä reuna (käännetty: päästä ulkopinnalle) ja ulkopinta
  for (let i = corner.pts.length - 1; i >= 0; i--) {
    const [dz, dr] = corner.pts[i];
    const prev = pts[pts.length - 1];
    line(prev[0], prev[1], zc0 + dz, Ro + dr, 'frame');
  }
  line(zc0, Ro, 0, Ro, 'frame');
  push(0, Ro, 'frame');

  // --- Koko silmukka: oikea puolikas + peilattu vasen puolikas -------------------
  const right = pts;
  const left = right
    .slice(0, -1)
    .reverse()
    .map(([z, r, reg, cav]) => [-z, r, reg, cav]);
  const loop = right.concat(left.slice(1));
  // silmukka alkaa ja päättyy sisäpinnan keskelle (z = 0, r = Ri)

  const N = loop.length;
  const ds = new Float64Array(N);
  for (let i = 1; i < N; i++) ds[i] = ds[i - 1] + Math.hypot(loop[i][0] - loop[i - 1][0], loop[i][1] - loop[i - 1][1]);
  const L = ds[N - 1];

  const tangentAt = (i) => {
    const i0 = Math.max(0, i - 2);
    const i1 = Math.min(N - 1, i + 2);
    let tz = loop[i1][0] - loop[i0][0];
    let tr = loop[i1][1] - loop[i0][1];
    if (i === 0 || i === N - 1) {
      tz = loop[2][0] - loop[N - 3][0];
      tr = loop[2][1] - loop[N - 3][1];
    }
    const l = Math.hypot(tz, tr) || 1;
    return [tz / l, tr / l];
  };

  // --- Adaptiivinen uudelleennäytteistys --------------------------------------
  const maxStep = cfg.profileMaxStep;
  const maxTurn = (cfg.profileMaxTurnDeg * Math.PI) / 180;
  const picked = [0];
  let lastS = 0;
  let lastT = tangentAt(0);
  for (let i = 1; i < N - 1; i++) {
    const t = tangentAt(i);
    const turn = Math.acos(Math.min(1, Math.max(-1, t[0] * lastT[0] + t[1] * lastT[1])));
    // tiheämpi näytteistys sivupinnan pienissä yksityiskohdissa (sauma, lukitusrengas, rako)
    const fine = Math.abs(loop[i][0]) > a - 0.2 && loop[i][1] > rF - 0.05 && loop[i][1] < Ro - C.drop + 0.02;
    const lim = fine ? Math.min(maxStep, 0.01) : maxStep;
    const dS = ds[i] - lastS;
    if (dS >= lim || (turn >= maxTurn && dS >= 0.004)) {
      picked.push(i);
      lastS = ds[i];
      lastT = t;
    }
  }
  picked.push(N - 1);

  const samples = picked.map((i) => {
    const [tz, tr] = tangentAt(i);
    const [z, r, region, cavity] = loop[i];
    return { z, r, nz: tr, nr: -tz, tz, tr, s: ds[i], v: ds[i] / L, inner: region === 'shell', region, cavity };
  });

  return {
    samples,
    length: L,
    halfWidth: a,
    innerRadius: Ri,
    outerRadius: Ro,
    sBoreMid: 0,
    sOuterMid: L / 2,
    flatOuterHalf: a - C.recess - corner.zMax,
    cornerEndRadius: corner.endRadius,
    flatInnerHalf: zEdgeC,
  };
}
