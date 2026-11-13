import * as THREE from 'three/webgpu';
import {
  Fn,
  attribute,
  float,
  vec3,
  vec4,
  uv,
  texture,
  positionLocal,
  normalLocal,
  modelWorldMatrix,
  modelWorldMatrixInverse,
  pmremTexture,
  lights,
  dot,
  max,
  sqrt,
  abs,
  pow,
  atan,
  asin,
  smoothstep,
  normalize,
  reflect,
  clamp,
  mix,
  mx_noise_float,
  uniform,
  vec2,
  length,
  min,
  sin,
  cos,
  sign,
  select,
  exp,
} from 'three/tsl';

const { Node } = THREE;

// ---------------------------------------------------------------------------
// Perusmateriaali: "Silver" – kiillotettu titaani, kova PVD-pinnoite.
// Metallin heijastusväri F0 (lineaarinen sRGB). Raaka titaani on n. (0.54, 0.50, 0.45);
// Ouran hopea PVD on vaaleampi ja neutraalimpi, lähellä kiillotettua terästä.
// ---------------------------------------------------------------------------
// Hienot kiillotusnaarmut ja mikrovaihtelu karheuskarttana (kanvaasilla, ajonaikaisesti).
// u kulkee kehää pitkin (~74 mm), v profiilia pitkin (~16 mm) -> 4:1 kuvasuhde.
function createMicroSurfaceTexture(seed = 7) {
  const W = 2048;
  const H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);

  ctx.fillStyle = 'rgb(0,0,0)';
  ctx.fillRect(0, 0, W, H);

  // pehmeä kiillotusvaihtelu
  for (let i = 0; i < 900; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 6 + rnd() * 40;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const a = 0.025 + rnd() * 0.04;
    g.addColorStop(0, `rgba(255,255,255,${a})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // hiusnaarmut: lyhyitä, hieman kaartuvia, pääosin kehän suuntaisia (kiillotussuunta)
  ctx.lineCap = 'round';
  const drawScratch = (x, y, len, ang, alpha, width) => {
    for (const ox of [-W, 0, W]) {
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.moveTo(x + ox, y);
      const cx = x + ox + Math.cos(ang) * len * 0.5 + (rnd() - 0.5) * 4;
      const cy = y + Math.sin(ang) * len * 0.5 + (rnd() - 0.5) * 4;
      ctx.quadraticCurveTo(cx, cy, x + ox + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx.stroke();
    }
  };
  for (let i = 0; i < 520; i++) {
    const ang = (rnd() < 0.7 ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.9;
    drawScratch(rnd() * W, rnd() * H, 8 + rnd() * 70, ang, 0.08 + rnd() * 0.22, 0.6 + rnd() * 0.6);
  }
  for (let i = 0; i < 40; i++) {
    drawScratch(rnd() * W, rnd() * H, 30 + rnd() * 140, rnd() * Math.PI, 0.18 + rnd() * 0.25, 0.8);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Sisäpinnan keskinäisheijastukset.
//
// Kiillotetun renkaan sisäpinta heijastaa ennen kaikkea vastakkaista sisäseinää,
// ei studiota. Ympäristökartta ei voi esittää tätä, joten heijastussäde jäljitetään
// analyyttisesti renkaan omassa koordinaatistossa sylinteriä vasten (enintään 3 pomppua),
// jokaisella pompulla metallin Fresnel-heijastus (Schlick). Sensori-ikkunat näkyvät
// heijastuksissa tummempina alueina. Lopuksi karkaava säde näytteistetään ympäristöstä.
// ---------------------------------------------------------------------------
// Studio lighting as a function of direction.
//
// One prefiltered map (Oura's reconstructed product studio = true colours) is the base. The
// dark look is derived from it analytically: the map is dimmed toward the horizon and the back,
// and two narrow rim lights are added behind the ring. `theme` (0 = light, 1 = dark) blends
// between the two, so the lighting can change continuously with nothing to swap.
//   dir   = world-space direction of the lookup (the map applies the scene's env rotation)
//   level = roughness of the lookup (prefilter level)
// A scenery backdrop brings its own prefiltered map: `setMap` swaps it into every lookup (with
// theme and rims at 0 and `gain` as its exposure), so the ring is lit by the scene it is in.
function makeStudio(envTexture, { theme, rims, gain, elev }) {
  const lookups = [];
  let current = envTexture;
  const c = Math.cos(elev);
  const s = Math.sin(elev);
  // one soft vertical strip light at azimuth az0 / elevation el0 (radians)
  const strip = (d, level, az0, el0, halfW, halfH, intensity) => {
    const el = asin(clamp(d.y, -1, 1));
    const az = atan(d.x, d.z).sub(az0);
    const dAz = atan(sin(az), cos(az)).mul(cos(el));
    const w = float(halfW).add(level.mul(0.5)); // rougher surfaces see a wider, dimmer strip
    const across = float(1).sub(smoothstep(w.mul(0.16), w, abs(dAz)));
    const along = float(1).sub(smoothstep(halfH * 0.86, halfH, abs(el.sub(el0))));
    return across.mul(along).mul(float(halfW).div(w)).mul(intensity);
  };
  const studio = (dir, level) => {
    // direction in studio coordinates (the environment is tilted with the camera)
    const d = vec3(dir.x, dir.y.mul(c).add(dir.z.mul(s)), dir.z.mul(c).sub(dir.y.mul(s)));
    const up = mix(float(0.1), float(0.8), smoothstep(-0.1, 0.8, d.y));
    const front = mix(float(0.45), float(1.0), smoothstep(-0.5, 0.5, d.z));
    const dim = mix(float(1), up.mul(front), theme);
    const lvl = float(level);
    const rim = strip(d, lvl, -2.061, 0.059, 0.094, 0.574, 1.2).add(strip(d, lvl, 2.007, 0.06, 0.096, 0.585, 0.95));
    const map = pmremTexture(current, dir, level);
    lookups.push(map);
    return map.mul(dim.mul(gain)).add(vec3(rim.mul(rims)));
  };
  studio.setMap = (tex) => {
    current = tex;
    for (const m of lookups) m.value = tex;
  };
  return studio;
}

// Environment node for ordinary materials: the studio evaluated for the material's own
// reflection (or normal, for diffuse light) direction.
class StudioEnvNode extends Node {
  static get type() {
    return 'StudioEnvNode';
  }

  constructor(studio) {
    super('vec3');
    this.studio = studio;
  }

  setup(builder) {
    const ctx = builder.context;
    const dir = ctx.getUV ? ctx.getUV(this, builder) : vec3(0, 1, 0);
    const level = ctx.getTextureLevel ? ctx.getTextureLevel(this) : float(0);
    return this.studio(dir, level);
  }
}

class InteriorReflectionNode extends Node {
  static get type() {
    return 'InteriorReflectionNode';
  }

  constructor(envTexture, params) {
    super('vec3');
    this.envTexture = envTexture;
    this.params = params;
  }

  setup(builder) {
    const ctx = builder.context;
    const reflWorld = ctx.getUV ? ctx.getUV(this, builder) : vec3(0, 1, 0);
    const level = ctx.getTextureLevel ? ctx.getTextureLevel(this) : float(0);
    // Irradianssikonteksti (diffuusi; tasolla 1.0): metallilla merkityksetön -> halpa näyte.
    if (level && level.isConstNode && level.value === 1) return this.params.studio(reflWorld, level);
    if (!this._fn) this._fn = this._build();
    return this._fn(reflWorld, level);
  }

  // TSL-funktio: omassa funktiorungossaan muuttujat ja sijoitukset päätyvät oikeaan pinoon.
  _build() {
    const P = this.params;
    const bounces = P.bounces ?? 3;

    const sample = (dirLocal, lvl) => {
      const dw = normalize(modelWorldMatrix.mul(vec4(dirLocal, 0)).xyz);
      return P.studio(dw, lvl);
    };

    // Sensori-ikkunat osumapisteessä: pyöristetyn suorakaiteen etäisyysfunktio (terävä, peilimäinen
    // reuna). Palauttaa ikkunan peiton (kaikki ikkunat) ja LED-ikkunoiden säteilyn painon.
    const windowsAt = (q) => {
      // kulma kämmenen puolen keskilinjasta (θ = 0 on -Y)
      const th = atan(q.x, q.y.negate());
      let cover = float(0);
      let led = float(0);
      for (const w of P.windows) {
        const u = th.sub(w.th).mul(P.R0);
        const dq = abs(vec2(u, q.z)).sub(vec2(w.hA - w.rc, w.hB - w.rc));
        const sdf = length(max(dq, 0)).add(min(max(dq.x, dq.y), 0)).sub(w.rc);
        const inside = float(1).sub(smoothstep(-0.05, 0.05, sdf));
        cover = max(cover, inside);
        if (w.led) {
          // ikkunan tasainen hehku + kirkas ydin emitterien kohdalla + kapea kehä reunan ulkopuolella
          const core = exp(dot(vec2(u, q.z), vec2(u, q.z)).mul(-1 / 0.85));
          const halo = exp(max(sdf, 0).mul(-1 / 0.75)).mul(0.15);
          led = max(led, inside.mul(float(1.25).add(core.mul(2.7))).add(halo.mul(inside.oneMinus())));
        }
      }
      return { cover, led };
    };

    // Reiän todellinen pinta (soikion sisäpuolisko): r(z) = rc − B·(1 − |z/A|^p)^(1/q).
    // Aiempi versio oletti suoran sylinterin; soikiolla se tuotti reunoille teräviä vääriä juovia.
    const { A, B, rc, p: ep, q: eq } = P.bore;
    const uMax = 0.995;
    const rIn = (z) => {
      const u = min(abs(z).div(A), uMax);
      return float(rc).sub(float(B).mul(pow(float(1).sub(pow(u, ep)), 1 / eq)));
    };
    const rInD = (z) => {
      // dr/dz (positiivinen kun |z| kasvaa: reikä nousee reunoja kohti)
      const u = max(min(abs(z).div(A), uMax), 1e-4);
      const g = float(1).sub(pow(u, ep));
      return float(B / eq).mul(pow(g, 1 / eq - 1)).mul(float(ep).mul(pow(u, ep - 1))).div(A).mul(sign(z));
    };

    // Sisätilan valo: Ouran kuvissa koveran sisäpinnan heijastukset ovat kirkkaampia ja tasaisempia
    // kuin pelkkä kaukainen studio selittäisi (lähellä olevat valkoiset heijastinpinnat valaisevat
    // renkaan sisustaa, ulkopinta ei niitä näe). Mitattu virallisesta 43°-kuvasta:
    // L_sisä ≈ gain · L_studio + fill. Painotetaan pinnan sisäänpäin osoittavuudella, joten
    // kuperat titaanisivut saavat pelkän studion.
    // Lisävalo on suunnattu: virallisen kuvan mukaan sitä tulee eniten akselin suunnasta (aukoista
    // sisään), fill = fill0 + fill1 · (d · akseli)². Tasainen lisävalo teki metallista muovisen
    // näköisen, suunnattu säilyttää heijastusten muodon.
    const asNode = (v, d) => (v == null ? float(d) : typeof v === 'number' ? float(v) : v);
    const gain = asNode(P.interiorLight?.gain, 1);
    const fill0 = asNode(P.interiorLight?.fill0, 0);
    const fill1 = asNode(P.interiorLight?.fill1, 0);
    // LEDien valo (aktiivinen tila): ikkunat säteilevät, ja valo kulkee peiliheijastuksina
    const ledLight = P.ledLight || vec3(0);

    return Fn(([reflWorld, level]) => {
      const f0 = vec3(P.wallF0.r, P.wallF0.g, P.wallF0.b);
      const p = vec3(positionLocal).toVar();
      const radial = normalize(vec3(positionLocal.x, positionLocal.y, 0));
      const wIn = smoothstep(0.35, 0.85, dot(normalize(normalLocal), radial.negate())).toVar();
      const k = float(1).add(wIn.mul(gain.sub(1))).toVar();
      const lit = (dir, lvl) => sample(dir, lvl).mul(k).add(vec3(wIn.mul(fill0.add(fill1.mul(dir.z.mul(dir.z))))));
      const d = normalize(modelWorldMatrixInverse.mul(vec4(reflWorld, 0)).xyz).toVar();
      const through = vec3(1).toVar();
      const color = vec3(0).toVar();
      const lvl0 = float(level).toVar();
      const lvlHit = max(lvl0, float(P.wallRoughness)).toVar();

      for (let i = 0; i < bounces; i++) {
        // 1) alkuarvaus: sylinteri, jonka säde on pinnan säde lähtöpisteen kohdalla
        const a = max(dot(d.xy, d.xy), 1e-5).toVar();
        const b = dot(p.xy, d.xy).toVar();
        const pp = dot(p.xy, p.xy).toVar();
        const rw = max(rIn(p.z), sqrt(pp));
        const c = pp.sub(rw.mul(rw));
        const disc = max(b.mul(b).sub(a.mul(c)), 0);
        const t = b.negate().add(sqrt(disc)).div(a).toVar();
        // 2) Newton-iteraatiot todellista pintaa vasten: f(t) = |xy| − r(z)
        for (let k = 0; k < 4; k++) {
          const qk = p.add(d.mul(t));
          const rho = max(length(qk.xy), 1e-4);
          const f = rho.sub(rIn(qk.z));
          const fp = dot(qk.xy, d.xy).div(rho).sub(rInD(qk.z).mul(d.z));
          const safe = abs(fp).greaterThan(0.02);
          t.assign(select(safe, t.sub(f.div(fp)), t));
        }
        const q = p.add(d.mul(t)).toVar();
        const residual = abs(length(q.xy).sub(rIn(q.z)));
        // osuma kelpaa: eteenpäin, konvergoitunut ja reiän pinnalla (ei reunojen yli)
        const ok = smoothstep(0.0, 0.01, t)
          .mul(float(1).sub(smoothstep(0.01, 0.03, residual)))
          .mul(float(1).sub(smoothstep(A * 0.9, A * 0.99, abs(q.z))));
        const w = ok.toVar();
        color.addAssign(through.mul(w.oneMinus()).mul(lit(d, i === 0 ? lvl0 : lvlHit)));
        // pinnan normaali (sisäänpäin): −normalize(x/ρ, y/ρ, −r'(z))
        const rq = max(length(q.xy), 1e-4);
        const nrm = normalize(vec3(q.x.div(rq), q.y.div(rq), rInD(q.z).negate())).negate().toVar();
        const cosT = clamp(dot(d.negate(), nrm), 0, 1);
        const fres = f0.add(vec3(1).sub(f0).mul(pow(float(1).sub(cosT), 5)));
        const win = windowsAt(q);
        // LED-ikkuna näkyy heijastuksessa valonlähteenä
        color.addAssign(through.mul(w).mul(win.led).mul(ledLight));
        const wallRefl = mix(fres, fres.mul(P.windowReflect ?? 0.35), win.cover);
        through.assign(through.mul(wallRefl).mul(w));
        d.assign(reflect(d, nrm));
        p.assign(q);
      }
      color.addAssign(through.mul(lit(d, bounces === 0 ? lvl0 : lvlHit)));
      return color;
    });
  }
}


// Harjausjälki (Brushed Silver): virallisissa kuvissa jäljet kulkevat poikittain renkaan leveyden
// suuntaan (ulkopinnalla akselin suuntaan, sivupinnalla säteittäin). Kanvaasissa pystyviivoja:
// u = kehä (vaaka), v = profiili (pysty).
function createBrushTexture(seed = 11) {
  const W = 1024;
  const H = 1024;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  ctx.fillStyle = 'rgb(128,128,128)';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    const y = rnd() * H;
    const x = rnd() * W;
    const len = 60 + rnd() * 900;
    const g = Math.floor(128 + (rnd() - 0.5) * 150);
    ctx.strokeStyle = `rgba(${g},${g},${g},${0.25 + rnd() * 0.5})`;
    ctx.lineWidth = 0.6 + rnd() * 1.1;
    for (const oy of [-H, 0, H]) {
      ctx.beginPath();
      ctx.moveTo(x, y + oy);
      ctx.lineTo(x + (rnd() - 0.5) * 0.8, y + oy + len);
      ctx.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// Laikkualueet, joilla rungon pinta piilotetaan (pyöristetyn suorakaiteen SDF renkaan omassa
// koordinaatistossa). Laikku on reunastaan täsmälleen rungon pinnalla, joten saumaa ei näy.
function patchMaskNode(regions, surfaceRadius, surfaceTol = 0.3) {
  if (!regions.length) return null;
  const p = positionLocal;
  const th = atan(p.x, p.y.negate());
  const rr = length(p.xy);
  let inside = float(0);
  for (const g of regions) {
    const dth = atan(sin(th.sub(g.thetaC)), cos(th.sub(g.thetaC)));
    const u = dth.mul(g.R);
    const v = p.z.sub(g.zc);
    const q = abs(vec2(u, v)).sub(vec2(g.hA - g.rc, g.hB - g.rc));
    const sdf = length(max(q, 0)).add(min(max(q.x, q.y), 0)).sub(g.rc);
    const inPatch = float(1).sub(smoothstep(g.margin * 0.7, g.margin * 0.72, sdf));
    inside = max(inside, inPatch);
  }
  const onSurface = float(1).sub(smoothstep(surfaceTol, surfaceTol * 1.2, abs(rr.sub(surfaceRadius))));
  // maskNode: true = piirrä
  return inside.mul(onSurface).lessThan(0.5);
}

export function createMaterials({ envTexture, profile, windows, outerPatches, borePatches, params }) {
  // lighting state: theme 0 = light (true colours), 1 = dark; rims = strength of the rim lights
  const light = { theme: uniform(0), rims: uniform(1), gain: uniform(1) };
  const studio = makeStudio(envTexture, { theme: light.theme, rims: light.rims, gain: light.gain, elev: params?.envElevation ?? 0 });
  light.setMap = studio.setMap;
  light.studio = studio; // direction → radiance, for anything else that should show the same lighting
  light.envNode = () => new StudioEnvNode(studio); // the same lighting as an environment for other materials
  const studioEnv = () => new StudioEnvNode(studio);
  const micro = createMicroSurfaceTexture();
  const brush = createBrushTexture();
  const noLights = lights([]); // rengas valaistaan studioympäristöllä (IBL); suunnattu valo vain varjolle

  const cavity = attribute('cavity', 'float');
  const mark = attribute('mark', 'float');
  const gapA = attribute('gap', 'float');
  const microR = texture(micro, uv()).r;
  const brushT = texture(brush, uv().mul(vec2(7, 1))).r.sub(0.5);

  // --- Ulkokehys: valittava virallinen viimeistely (uniformeilla, ei uudelleenkääntöä) ---
  const fin = {
    color: uniform(new THREE.Color(0.64, 0.63, 0.61)),
    roughness: uniform(0.055),
    aniso: uniform(0),
    brushed: uniform(0),
    bead: uniform(0),
  };
  const makeFrame = (name, maskRegions) => {
    const m = new THREE.MeshPhysicalNodeMaterial({ name, metalness: 1 });
    m.lightsNode = noLights;
    m.envNode = studioEnv();
    const lowFreq = mx_noise_float(positionLocal.mul(0.9)).mul(0.01);
    const beadN = mx_noise_float(positionLocal.mul(25)).mul(0.07);
    let rough = fin.roughness.add(lowFreq).add(microR.mul(0.12).mul(fin.brushed.oneMinus()));
    rough = rough.add(brushT.mul(0.3).mul(fin.brushed)).add(beadN.mul(fin.bead));
    rough = rough.add(mark.mul(0.06));
    m.roughnessNode = clamp(rough, 0.035, 0.75);
    m.colorNode = vec3(fin.color).mul(float(1).add(brushT.mul(0.34).mul(fin.brushed)));
    // anisotropia kehän suuntaan (bitangentti): poikittaiset harjausjäljet venyttävät heijastuksia kehää pitkin
    m.anisotropyNode = vec2(0, fin.aniso);
    m.aoNode = cavity;
    if (maskRegions) m.maskNode = patchMaskNode(maskRegions, profile.outerRadius);
    return m;
  };
  const outer = makeFrame('Frame (PVD finish)', outerPatches);
  const outerPatch = makeFrame('Frame patch', null);

  // --- Sensorien valot (aktiivinen tila) ---------------------------------------------
  // Tri-LED: vihreä (syke, HRV), punainen + infrapuna (veren happi). IR näkyy silmälle vain
  // himmeänä tummanpunaisena. Uniformit päivitetään animaatiossa (sensors.js).
  const sensor = {
    green: uniform(0),
    red: uniform(0),
    ir: uniform(0),
    explode: uniform(0),
    reflect: uniform(1), // LEDien peiliheijastusten voimakkuus sisäpinnassa
  };
  const GREEN = vec3(0.12, 1.0, 0.36);
  const RED = vec3(1.0, 0.045, 0.025);
  const IRC = vec3(0.32, 0.01, 0.025);
  const ledLight = GREEN.mul(sensor.green).add(RED.mul(sensor.red)).add(IRC.mul(sensor.ir));
  // Metalli ei sirota valoa: LEDien valo näkyy sisäpinnassa peiliheijastuksina (ks.
  // InteriorReflectionNode). Vain linssin reunan vieressä on hyvin pieni hajavalo (epoksin
  // reunasta vuotava valo). Koottuna vain (räjäytyskuvassa LEDit ovat muualla).
  const ledWindows = windows.filter((w) => w.kind === 'led');
  const assembled = sensor.explode.oneMinus();
  const spill = (() => {
    let acc = float(0);
    for (const w of ledWindows) {
      const s0 = Math.sin(w.thetaC);
      const c0 = Math.cos(w.thetaC);
      const d = positionLocal.sub(vec3(profile.innerRadius * s0, -profile.innerRadius * c0, 0));
      acc = acc.add(exp(dot(d, d).mul(-1 / 2.4)));
    }
    return ledLight.mul(acc).mul(0.24).mul(assembled);
  })();

  // --- Sisäkuori: kiillotettu titaani, keskinäisheijastukset -------------------------
  const shellF0 = new THREE.Color(0.6, 0.6, 0.6); // titaani; sama F0 kuin studion rekonstruktiossa (sivupinnat täsmäävät ±1 %)
  const interiorParams = {
    R0: profile.innerRadius,
    bore: { A: profile.halfWidth, B: profile.halfThickness, rc: profile.centerRadius, p: profile.exponents.p, q: profile.exponents.q },
    wallF0: shellF0,
    wallRoughness: 0.1,
    // ikkuna heijastuksissa = linssi + tiivisterako
    windows: windows.map((w) => ({ th: w.thetaC, led: w.kind === 'led', hA: w.hA + 0.1, hB: w.hB + 0.1, rc: 0.82 })),
    windowReflect: 0.45,
    ledLight: ledLight.mul(sensor.reflect).mul(assembled),
    studio,
    // sisätilan lisävalo (vaalea studio: mitattu virallisesta kuvasta, ks. InteriorReflectionNode;
    // tumma studio asettaa omat arvonsa)
    interiorLight: { gain: uniform(1.2), fill0: uniform(0.16), fill1: uniform(0.36) },
  };

  const makeShell = (name, maskRegions, withWindows = false) => {
    const m = new THREE.MeshPhysicalNodeMaterial({ name, metalness: 1 });
    m.lightsNode = noLights;
    const lathe = mx_noise_float(vec3(uv().y.mul(520), 0.0, uv().x.mul(3))).mul(0.02);
    const base = clamp(float(0.09).add(lathe).add(microR.mul(0.06)), 0.05, 0.4);
    m.roughnessNode = mix(mix(base, float(0.22).add(mx_noise_float(positionLocal.mul(45)).mul(0.04)), mark), float(0.45), gapA);
    m.colorNode = mix(vec3(shellF0.r, shellF0.g, shellF0.b), vec3(0.06, 0.06, 0.062), gapA);
    if (withWindows) {
      // räjäytyskuvassa linssin paikka on avoin ikkuna (tumma aukko)
      const open = attribute('win', 'float').mul(sensor.explode);
      m.colorNode = mix(m.colorNode, vec3(0.012, 0.012, 0.013), open);
      m.roughnessNode = mix(m.roughnessNode, float(0.7), open);
    }
    m.envNode = new InteriorReflectionNode(envTexture, interiorParams);
    m.emissiveNode = spill;
    m.aoNode = cavity;
    if (maskRegions) m.maskNode = patchMaskNode(maskRegions, profile.innerRadius);
    return m;
  };
  const inner = makeShell('Inner shell (titanium)', borePatches);
  const innerPatch = makeShell('Inner shell patch', null, true);

  // --- Sensori-ikkunan linssi: kirkas optinen epoksi --------------------------------
  const lens = new THREE.MeshPhysicalNodeMaterial({
    name: 'Sensor lens',
    color: new THREE.Color(1, 1, 1),
    metalness: 0,
    roughness: 0.03,
    transmission: 1,
    ior: 1.5,
    // pieni paksuusparametri: näytön tilassa taitettu näyte pysyy linssin alla olevassa
    // vaaleassa alustassa (suuri arvo poimi tumman raon → tumma reunus, ei virallisissa kuvissa)
    thickness: params?.lensThickness ?? 0.18,
    attenuationColor: new THREE.Color(0.97, 0.98, 0.975),
    attenuationDistance: 4,
    specularIntensity: 1,
  });
  lens.lightsNode = noLights;
  lens.envNode = studioEnv();
  // LED-linssi hehkuu sisältä, kun sensorit ovat päällä (sironta optisessa epoksissa)
  const lensLED = lens.clone();
  lensLED.name = 'Sensor lens (LED)';
  lensLED.lightsNode = noLights;
  lensLED.envNode = studioEnv();
  lensLED.emissiveNode = ledLight.mul(0.38);

  const std = (name, params) => {
    const m = new THREE.MeshPhysicalNodeMaterial({ name, ...params });
    m.lightsNode = noLights;
    m.envNode = studioEnv();
    return m;
  };

  const glow = (base, baseK, col, chan, k) => vec3(...base).mul(baseK).add(col.mul(chan.mul(k)));
  const internals = {
    ledSubstrate: std('LED package (white)', { color: new THREE.Color(0.9, 0.9, 0.885), roughness: 0.5 }),
    greenZone: std('Green emitter (silicone)', {
      color: new THREE.Color(0.72, 0.9, 0.76),
      roughness: 0.25,
    }),
    redZone: std('Red/IR emitter (silicone)', {
      color: new THREE.Color(0.95, 0.7, 0.6),
      roughness: 0.25,
    }),
    dieGreen: std('InGaN die', { color: new THREE.Color(0.32, 0.62, 0.42), roughness: 0.15, metalness: 0.1, clearcoat: 1 }),
    dieRed: std('AlGaInP die', { color: new THREE.Color(0.78, 0.13, 0.08), roughness: 0.22 }),
    dieIR: std('GaAs IR die', { color: new THREE.Color(0.16, 0.085, 0.08), roughness: 0.25 }),
    pdBody: std('PD package', { color: new THREE.Color(0.02, 0.02, 0.022), roughness: 0.5 }),
    silicon: std('Si photodiode (AR coated)', {
      // heijastuksenestopinnoite: lähes musta, heikko sinertävä heijastus
      color: new THREE.Color(0.006, 0.008, 0.018),
      roughness: 0.2,
      metalness: 0,
      specularIntensity: 0.35,
      specularColor: new THREE.Color(0.55, 0.65, 1.0),
    }),
    pdFinger: std('PD finger metallization', { color: new THREE.Color(0.12, 0.125, 0.13), metalness: 1, roughness: 0.55 }),
    pdEdge: std('PD die edge (AR coating)', { color: new THREE.Color(0.03, 0.3, 0.27), roughness: 0.3, metalness: 0.4 }),
    dieStripe: std('LED top electrode', { color: new THREE.Color(0.07, 0.03, 0.03), roughness: 0.5 }),
    gold: std('Au', { color: new THREE.Color(1.0, 0.766, 0.336), metalness: 1, roughness: 0.2 }),
  };
  // emitterit: lepotilassa hieman fluoresoiva sävy (kuten virallisissa kuvissa), aktiivisena kirkas
  internals.greenZone.emissiveNode = glow([0.2, 0.9, 0.42], 0.32, GREEN, sensor.green, 6.6);
  internals.dieGreen.emissiveNode = glow([0.25, 1, 0.5], 0.35, GREEN, sensor.green, 12.5);
  internals.redZone.emissiveNode = glow([1.0, 0.4, 0.26], 0.3, RED, sensor.red, 5.6);
  internals.dieRed.emissiveNode = glow([1, 0.2, 0.12], 0.12, RED, sensor.red, 11.5);
  internals.dieIR.emissiveNode = glow([0.5, 0.1, 0.08], 0.03, IRC, sensor.ir, 6.5);

  // --- Räjäytyskuvan sisäosat --------------------------------------------------------
  const parts = {
    // leikkauspinnat: käsittelemätön titaani (PVD-pinnoite on vain ulkopinnoissa)
    cut: std('Raw titanium (cut faces)', { color: new THREE.Color(0.36, 0.355, 0.35), metalness: 1, roughness: 0.32 }),
    frame: std('Inner frame (polished titanium)', { color: new THREE.Color(0.6, 0.6, 0.6), metalness: 1, roughness: 0.07 }),
    battery: std('Li-ion cell (black wrap)', { color: new THREE.Color(0.02, 0.02, 0.021), roughness: 0.62 }),
    pcb: std('Flex PCB (black coverlay)', { color: new THREE.Color(0.016, 0.016, 0.018), roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
    gasket: std('Sensor gasket', { color: new THREE.Color(0.035, 0.035, 0.037), roughness: 0.7 }),
    base: std('Sensor module base', { color: new THREE.Color(0.03, 0.03, 0.032), roughness: 0.4 }),
  };
  // akun kääre: hieno rakeinen pinta (virallisen räjäytyskuvan mukaan)
  const grain = mx_noise_float(positionLocal.mul(38));
  parts.battery.roughnessNode = float(0.6).add(grain.mul(0.18));
  parts.battery.colorNode = vec3(0.02, 0.02, 0.021).mul(float(1).add(grain.mul(0.35)));

  const setFinish = (f) => {
    fin.color.value.setRGB(f.f0[0], f.f0[1], f.f0[2]);
    fin.roughness.value = f.roughness;
    fin.aniso.value = f.aniso;
    fin.brushed.value = f.brushed;
    fin.bead.value = f.bead || 0;
  };

  const setInteriorLight = (gain, fill0, fill1) => {
    interiorParams.interiorLight.gain.value = gain;
    interiorParams.interiorLight.fill0.value = fill0;
    interiorParams.interiorLight.fill1.value = fill1;
  };

  return { outer, outerPatch, inner, innerPatch, lens, lensLED, internals, parts, sensor, light, setFinish, setInteriorLight };
}
