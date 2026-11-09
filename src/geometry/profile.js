// Renkaan poikkileikkausprofiili (z = akselin suunta, r = säde).
//
// Profiili koostuu kahdesta superellipsin puolikkaasta, jotka kohtaavat sivuilla
// jakolinjalla r = rs pystysuorin tangentein:
//   ulkopuoli:  (|z|/a)^nO + ((r - rs)/bO)^nO = 1
//   sisäpuoli:  (|z|/a)^nI + ((rs - r)/bI)^nI = 1
// Kummankin puolikkaan kaarevuus on jakolinjalla nolla, joten pinta on G2-jatkuva
// ja heijastukset jatkuvat katkeamattomina – kuten kiillotetussa korussa.
//
// Sisäkuoren ja ulkokehyksen liitoskohtaan lisätään hiussauma (pieni ura).

const TAU = Math.PI * 2;
const spow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);

export function buildProfile(cfg) {
  const a = cfg.width / 2;
  const Rin = cfg.innerDiameter / 2;
  const bI = cfg.innerHalfHeight;
  const bO = cfg.thickness - bI;
  const rs = Rin + bI;
  const nO = cfg.outerExponent;
  const nI = cfg.innerExponent;

  const base = (t) => {
    const c = Math.cos(t);
    const s = Math.sin(t);
    if (s >= 0) return [a * spow(c, 2 / nO), rs + bO * Math.pow(s, 2 / nO)];
    return [a * spow(c, 2 / nI), rs - bI * Math.pow(-s, 2 / nI)];
  };

  // 1) Tiheä näytteistys parametrista t. Superellipsin parametrisointi on hyvin
  //    epätasainen, joten näytteitä otetaan runsaasti ja tasataan kaarenpituuden mukaan.
  const N = 120000;
  const dz = new Float64Array(N + 1);
  const dr = new Float64Array(N + 1);
  const ds = new Float64Array(N + 1);
  const dt = new Float64Array(N + 1);
  let acc = 0;
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * TAU;
    const [z, r] = base(t);
    if (i > 0) acc += Math.hypot(z - dz[i - 1], r - dr[i - 1]);
    dz[i] = z;
    dr[i] = r;
    ds[i] = acc;
    dt[i] = t;
  }
  const L = acc;

  const indexAtT = (t) => Math.round((t / TAU) * N);
  const sAtT = (t) => ds[indexAtT(t)];

  // Tangentti ja ulospäin osoittava normaali tiheästä polylinjasta.
  // Käyrä kiertää vastapäivään (z vaaka, r pysty), joten ulkonormaali = (dr, -dz).
  const tangentAt = (i) => {
    const i0 = Math.max(0, i - 2);
    const i1 = Math.min(N, i + 2);
    let tz = dz[i1] - dz[i0];
    let tr = dr[i1] - dr[i0];
    if (i === 0 || i === N) {
      tz = dz[2] - dz[N - 2];
      tr = dr[2] - dr[N - 2];
    }
    const l = Math.hypot(tz, tr) || 1;
    return [tz / l, tr / l];
  };

  // 2) Saumat: vasen ja oikea sivu, sisäpuolikkaan nurkkapyöristyksessä.
  const seamT = cfg.seam.t;
  const sSeamL = sAtT(Math.PI + seamT);
  const sSeamR = sAtT(TAU - seamT);
  const sCrown = sAtT(Math.PI / 2);
  const sInnerMid = sAtT(1.5 * Math.PI);
  const w = cfg.seam.width;
  const depth = cfg.seam.depth;

  const groove = (s) => {
    let g = 0;
    let dg = 0;
    for (const s0 of [sSeamL, sSeamR]) {
      const q = (s - s0) / w;
      if (Math.abs(q) < 1) {
        const k = 1 - q * q;
        g += depth * k * k;
        dg += (depth * -4 * q * k) / w;
      }
    }
    return [g, dg];
  };

  // 3) Adaptiivinen uudelleennäytteistys: tiheämmin kaarevissa kohdissa ja saumoissa.
  const maxStep = cfg.profileMaxStep;
  const maxTurn = (cfg.profileMaxTurnDeg * Math.PI) / 180;
  const seamZone = w * 3;
  const seamStep = w / 6;

  const picked = [0];
  let lastS = 0;
  let lastTan = tangentAt(0);
  for (let i = 1; i < N; i++) {
    const s = ds[i];
    const tan = tangentAt(i);
    const turn = Math.acos(Math.min(1, Math.max(-1, tan[0] * lastTan[0] + tan[1] * lastTan[1])));
    const nearSeam = Math.abs(s - sSeamL) < seamZone || Math.abs(s - sSeamR) < seamZone;
    // harjalla tiheämpi näytteistys suuntauskuopan geometriaa varten
    const nearCrown = Math.abs(s - sCrown) < (cfg.dimple.halfAxial + 0.25);
    const step = nearSeam ? seamStep : nearCrown ? 0.018 : maxStep;
    if (s - lastS >= step || turn >= maxTurn) {
      picked.push(i);
      lastS = s;
      lastTan = tan;
    }
  }
  // varmista ettei viimeinen väli ole liian lyhyt ennen sulkeutumista
  if (L - ds[picked[picked.length - 1]] < maxStep * 0.35) picked.pop();

  const samples = picked.map((i) => {
    const s = ds[i];
    const [tz, tr] = tangentAt(i);
    let nz = tr;
    let nr = -tz;
    const [g, dg] = groove(s);
    // siirretty piste ja sen normaali: N' = N + T * g'(s)
    const z = dz[i] - nz * g;
    const r = dr[i] - nr * g;
    let mz = nz + tz * dg;
    let mr = nr + tr * dg;
    const ml = Math.hypot(mz, mr);
    mz /= ml;
    mr /= ml;
    const inner = s > sSeamL && s < sSeamR;
    const cavity = 1 - 0.7 * (g / depth);
    return { z, r, nz: mz, nr: mr, tz, tr, s, v: s / L, inner, cavity, t: dt[i] };
  });

  // Interpoloitu arvio mielivaltaisessa kaarenpituuspisteessä (ilman saumaa).
  const evalAt = (s) => {
    s = ((s % L) + L) % L;
    let lo = 0;
    let hi = N;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (ds[mid] <= s) lo = mid;
      else hi = mid;
    }
    const f = (s - ds[lo]) / Math.max(1e-12, ds[hi] - ds[lo]);
    const z = dz[lo] + (dz[hi] - dz[lo]) * f;
    const r = dr[lo] + (dr[hi] - dr[lo]) * f;
    const [tz, tr] = tangentAt(f < 0.5 ? lo : hi);
    return { z, r, nz: tr, nr: -tz };
  };

  // Sisäpinnan säde akselisuunnan kohdassa z (suljettu muoto).
  const innerRadiusAt = (z) => {
    const q = Math.min(1, Math.abs(z) / a);
    return rs - bI * Math.pow(Math.max(0, 1 - Math.pow(q, nI)), 1 / nI);
  };
  const outerRadiusAt = (z) => {
    const q = Math.min(1, Math.abs(z) / a);
    return rs + bO * Math.pow(Math.max(0, 1 - Math.pow(q, nO)), 1 / nO);
  };

  return {
    samples,
    length: L,
    halfWidth: a,
    innerRadius: Rin,
    outerRadius: rs + bO,
    splitRadius: rs,
    sCrown,
    sInnerMid,
    evalAt,
    innerRadiusAt,
    outerRadiusAt,
  };
}
