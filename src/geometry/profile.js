// Renkaan poikkileikkausprofiili (z = akselin suunta, r = säde).
//
// Mitattu virallisista tuotekuvista (ks. README). Sivupinnan rakenne ulkoa sisään:
//   tasainen ulkopinta ─ loiva kaksikaarinen reuna (R1 ≈ 2.7 mm → R2 ≈ 0.05 mm) ─ tasainen sivupinta ─ terävä reunalinja ─
//   loiva viiste ─ sauma (ura) ─ sisäkuoren reunus ─ pieni pyöristys ─ tasainen sisäpinta.
// Värillinen PVD-ulkokehys kattaa ulkopinnan, ulkoreunan pyöristyksen ja kapean reunarenkaan
// sivupinnalla (raja on ohut sauma; purkukuvassa erilliset ohuet reunarenkaat);
// sivupinta, viiste, ura ja sisäpinta ovat sisäkuoren titaania kaikissa väreissä
// (näkyy selvästi virallisissa Black-, Gold- ja Deep Rose -kuvissa).
//
// Profiili rakennetaan oikeasta puolikkaasta (z ≥ 0) janoista, kaarista ja Bézier-käyristä,
// peilataan ja näytteistetään adaptiivisesti. Kierto on vastapäivään (z vaaka, r pysty),
// joten ulkonormaali on (dr, -dz).

export function buildProfile(cfg) {
  const a = cfg.width / 2;
  const Ri = cfg.innerRadius;
  const Ro = Ri + cfg.thickness;

  // Ulkoreunan kulma: kaksi tangentiaalista kaarta (iso "roll-off" R1 kulmassa phi, sitten pieni R2
  // sivupintaan). Parametrit sovitettu virallisen tuotekuvan ääriviivaan (tools/fit_profile.py).
  const { R1, R2, phiDeg } = cfg.outerCorner;
  const phi = (phiDeg * Math.PI) / 180;
  const cornerPts = [];
  {
    const k1 = 160;
    const k2 = 120;
    for (let i = 0; i <= k1; i++) {
      const al = (phi * i) / k1;
      cornerPts.push([R1 * Math.sin(al), -R1 * (1 - Math.cos(al))]);
    }
    const [z0, r0] = cornerPts[cornerPts.length - 1];
    for (let i = 1; i <= k2; i++) {
      const al = phi + ((Math.PI / 2 - phi) * i) / k2;
      cornerPts.push([z0 + R2 * (Math.sin(al) - Math.sin(phi)), r0 - R2 * (Math.cos(phi) - Math.cos(al))]);
    }
  }
  const cornerAxial = cornerPts[cornerPts.length - 1][0];
  const cornerRadial = -cornerPts[cornerPts.length - 1][1];
  const rFilletStart = Ro - cornerRadial;
  const rCrease = Ro - cfg.creaseFromOuter;
  const rCoveBottom = rCrease - cfg.cove;
  const rLipTop = rCoveBottom - cfg.gap;
  const zLip = a - cfg.lipRecess;
  const zGroove = zLip - cfg.gapDepth;
  const zCoveIn = a - cfg.coveRecess;
  const e = cfg.lipEdge;

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
  const arc = (cz, cr, rad, a0, a1, region) => {
    const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * rad) / step));
    for (let i = 0; i < n; i++) {
      const t = a0 + ((a1 - a0) * i) / n;
      push(cz + rad * Math.cos(t), cr + rad * Math.sin(t), region);
    }
  };
  const bez = (p0, p1, p2, region, cav = 1) => {
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const u = 1 - t;
      push(u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1], region, cav);
    }
  };
  const corner = (p0, c, p1, region, cav = 1) => bez(p0, c, p1, region, cav);

  const cs = 0.012; // pienet särmäpyöristykset uran nurkissa
  // 1) sisäpinta keskeltä reunaan (ääriviivasovituksen mukaan sisäpinta päättyy ~0.2 mm sivusta)
  const ch = cfg.lipChamfer;
  line(0, Ri, zLip - ch - e, Ri, 'shell');
  // 2) pieni pyöristys + 45° reunaviiste
  corner([zLip - ch - e, Ri], [zLip - ch, Ri], [zLip - ch + e * 0.7, Ri + e * 0.7], 'shell');
  line(zLip - ch + e * 0.7, Ri + e * 0.7, zLip - e * 0.3, Ri + ch - e * 0.3, 'shell');
  corner([zLip - e * 0.3, Ri + ch - e * 0.3], [zLip, Ri + ch], [zLip, Ri + ch + e], 'shell');
  // 3) sisäkuoren tasainen reunus (hieman sivupinnan tason alapuolella) ylös uraan asti
  line(zLip, Ri + ch + e, zLip, rLipTop - cs, 'shell');
  // 4) ura: sisäänpäin, pohjan yli, takaisin ulos
  corner([zLip, rLipTop - cs], [zLip, rLipTop], [zLip - cs, rLipTop], 'shell', 0.75);
  line(zLip - cs, rLipTop, zGroove + cs, rLipTop, 'shell', 0.6, 0.25);
  corner([zGroove + cs, rLipTop], [zGroove, rLipTop], [zGroove, rLipTop + cs], 'shell', 0.2);
  const rMid = (rLipTop + rCoveBottom) / 2;
  line(zGroove, rLipTop + cs, zGroove, rMid, 'shell', 0.15, 0.12);
  line(zGroove, rMid, zGroove, rCoveBottom - cs, 'shell', 0.12, 0.15);
  corner([zGroove, rCoveBottom - cs], [zGroove, rCoveBottom], [zGroove + cs, rCoveBottom], 'shell', 0.2);
  line(zGroove + cs, rCoveBottom, zCoveIn - cs, rCoveBottom, 'shell', 0.25, 0.65);
  corner([zCoveIn - cs, rCoveBottom], [zCoveIn, rCoveBottom], [zCoveIn + cs * 0.3, rCoveBottom + cs], 'shell', 0.85);
  // 5) viiste: loivasti kupera Bézier
  const c0 = [zCoveIn + cs * 0.3, rCoveBottom + cs];
  const c2 = [a - 0.012, rCrease - 0.035];
  const dz = c2[0] - c0[0];
  const dr = c2[1] - c0[1];
  const dl = Math.hypot(dz, dr);
  const bulge = cfg.coveBulge;
  const c1 = [(c0[0] + c2[0]) / 2 + (dr / dl) * bulge * 2, (c0[1] + c2[1]) / 2 - (dz / dl) * bulge * 2];
  bez(c0, c1, c2, 'shell');
  // 6) terävä reunalinja (pieni pyöristys) ja tasainen sivupinta (titaania)
  corner(c2, [a, rCrease], [a, rCrease + cfg.creaseRadius], 'shell');
  const sw = 0.014; // sauma värillisen ulkokehyksen ja titaanin välissä
  const sd = 0.016;
  const rSeam = Ro - cfg.pvdSeamFromOuter;
  line(a, rCrease + cfg.creaseRadius, a, rSeam - sw, 'shell');
  line(a, rSeam - sw, a - sd, rSeam - 0.003, 'shell', 1, 0.35);
  line(a - sd, rSeam - 0.003, a - sd, rSeam + 0.003, 'frame', 0.3, 0.3);
  line(a - sd, rSeam + 0.003, a, rSeam + sw, 'frame', 0.35, 1);
  // värillinen reunarengas sivupinnalla kulman alkuun asti
  line(a, rSeam + sw, a, rFilletStart, 'frame');
  // 7) ulkoreunan kaksikaarinen pyöristys (sivupinnalta ulkopinnalle) ja ulkopinta
  const zc0 = a - cornerAxial;
  for (let i = cornerPts.length - 1; i >= 0; i--) {
    const [dz, dr] = cornerPts[i];
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
    // tiheämpi näytteistys pienissä yksityiskohdissa (ura, reunalinja)
    const fine = loop[i][1] < rCrease + 0.08 && loop[i][1] > rLipTop - 0.03 && Math.abs(loop[i][0]) > zGroove - 0.03;
    const lim = fine ? Math.min(maxStep, 0.03) : maxStep;
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
    flatOuterHalf: a - cornerAxial,
    flatInnerHalf: zLip - cfg.lipChamfer - e,
    stations: { rFilletStart, rCrease, rCoveBottom, rLipTop, zLip, zGroove, zCoveIn },
  };
}
