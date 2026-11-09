// Renkaan poikkileikkausprofiili (z = akselin suunta, r = säde).
//
// Muoto: pyöristetty soikio, joka on pyöreä myös sisäpuolelta (käyttäjän referenssimuoto).
// Referenssin ääriviivaan sovitettiin kahden eksponentin superellipsi
//     |z / A|^p + |(r - rc) / B|^q = 1,   p ≈ 3.62 (vaaka), q ≈ 2.51 (pysty)
// (keskivirhe 0.5 px), ja se skaalataan Ouran virallisiin mittoihin 6.09 × 2.28 mm.
// Skaalaus säilyttää eksponentit, joten muodon luonne pysyy samana – soikio vain venyy vaakaan.
//
// Rakenne näkyy pinnalla ohuina saumoina (ei portaita): värillinen kuori – kapea rako –
// ohut värillinen lukitusrengas – sauma – titaaninen sisäosa. Saumojen säteittäiset paikat on
// mitattu Ouran akselin suuntaisista tuotekuvista (tools/axial_features.py).
//
// Kierto on vastapäivään (z vaaka, r pysty), joten ulkonormaali on (dr, -dz).
// Silmukka alkaa ja päättyy reiän pinnan keskelle (z = 0, r = Ri).

const spow = (x, e) => Math.sign(x) * Math.pow(Math.abs(x), e);

export function buildProfile(cfg) {
  const A = cfg.width / 2;
  const B = cfg.thickness / 2;
  const Ri = cfg.innerRadius;
  const Ro = Ri + cfg.thickness;
  const rc = Ri + B;
  const { p, q } = cfg.crossSection;

  // 1) Tiheä näytteistys parametrista t ∈ [-π/2, 3π/2]
  const N = 160000;
  const dz = new Float64Array(N + 1);
  const dr = new Float64Array(N + 1);
  const ds = new Float64Array(N + 1);
  let acc = 0;
  for (let i = 0; i <= N; i++) {
    const t = -Math.PI / 2 + (i / N) * Math.PI * 2;
    const z = A * spow(Math.cos(t), 2 / p);
    const r = rc + B * spow(Math.sin(t), 2 / q);
    if (i > 0) acc += Math.hypot(z - dz[i - 1], r - dr[i - 1]);
    dz[i] = z;
    dr[i] = r;
    ds[i] = acc;
  }
  dz[N] = dz[0];
  dr[N] = dr[0];
  const L = acc;

  const tangentAt = (i) => {
    const a0 = (((i - 2) % N) + N) % N;
    const a1 = (i + 2) % N;
    const tz = dz[a1] - dz[a0];
    const tr = dr[a1] - dr[a0];
    const l = Math.hypot(tz, tr) || 1;
    return [tz / l, tr / l];
  };

  // 2) Saumat: kaarenpituudet, joissa käyrä ylittää saumojen säteet (oikea ja vasen puoli)
  const crossings = (rTarget) => {
    const out = [];
    for (let i = 1; i <= N; i++) {
      if ((dr[i - 1] - rTarget) * (dr[i] - rTarget) <= 0 && dr[i] !== dr[i - 1]) {
        const f = (rTarget - dr[i - 1]) / (dr[i] - dr[i - 1]);
        out.push(ds[i - 1] + f * (ds[i] - ds[i - 1]));
      }
    }
    return out;
  };
  const S = cfg.seams;
  const grooves = [];
  for (const g of [S.shellGap, S.ringSeam]) {
    for (const s0 of crossings(Ro - g.depthFromOuter)) grooves.push({ s0, w: g.halfWidth, d: g.depth, dark: g.dark });
  }
  const rRegion = Ro - S.ringSeam.depthFromOuter; // värillinen (PVD) yläpuolella, titaani alapuolella

  const groove = (s) => {
    let g = 0;
    let dg = 0;
    let dark = 0;
    for (const gr of grooves) {
      const u = (s - gr.s0) / gr.w;
      if (Math.abs(u) < 1) {
        const k = 1 - u * u;
        g += gr.d * k * k;
        dg += (gr.d * -4 * u * k) / gr.w;
        dark = Math.max(dark, gr.dark * k * k);
      }
    }
    return [g, dg, dark];
  };

  // 3) Adaptiivinen uudelleennäytteistys: tiheämmin kaarevissa kohdissa ja saumoissa
  const maxStep = cfg.profileMaxStep;
  const maxTurn = (cfg.profileMaxTurnDeg * Math.PI) / 180;
  const nearGroove = (s) => grooves.some((g) => Math.abs(s - g.s0) < g.w * 2.5);
  const picked = [0];
  let lastS = 0;
  let lastT = tangentAt(0);
  for (let i = 1; i < N; i++) {
    const t = tangentAt(i);
    const turn = Math.acos(Math.min(1, Math.max(-1, t[0] * lastT[0] + t[1] * lastT[1])));
    const lim = nearGroove(ds[i]) ? 0.006 : maxStep;
    if (ds[i] - lastS >= lim || turn >= maxTurn) {
      picked.push(i);
      lastS = ds[i];
      lastT = t;
    }
  }
  picked.push(N);

  const samples = picked.map((i) => {
    const s = ds[i];
    const [tz, tr] = tangentAt(i === N ? 0 : i);
    const nz = tr;
    const nr = -tz;
    const [g, dg, dark] = groove(s);
    // siirretty piste ja sen normaali: N' = N + T * g'(s)
    const z = dz[i] - nz * g;
    const r = dr[i] - nr * g;
    let mz = nz + tz * dg;
    let mr = nr + tr * dg;
    const ml = Math.hypot(mz, mr);
    mz /= ml;
    mr /= ml;
    const region = dr[i] > rRegion ? 'frame' : 'shell';
    return { z, r, nz: mz, nr: mr, tz, tr, s, v: s / L, inner: region === 'shell', region, cavity: 1 - dark };
  });

  // Pinnan säde akselin kohdassa z (sisä- ja ulkopinta, suljettu muoto)
  const halfHeight = (z) => B * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(z) / A), p)), 1 / q);
  const innerRadiusAt = (z) => rc - halfHeight(z);
  const outerRadiusAt = (z) => rc + halfHeight(z);

  return {
    samples,
    length: L,
    halfWidth: A,
    innerRadius: Ri,
    outerRadius: Ro,
    centerRadius: rc,
    sBoreMid: 0,
    sOuterMid: ds[Math.round(N / 2)],
    innerRadiusAt,
    outerRadiusAt,
  };
}
