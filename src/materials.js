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
  smoothstep,
  normalize,
  reflect,
  clamp,
  mix,
  mx_noise_float,
} from 'three/tsl';

const { Node } = THREE;

// ---------------------------------------------------------------------------
// Perusmateriaali: "Silver" – kiillotettu titaani, kova PVD-pinnoite.
// Metallin heijastusväri F0 (lineaarinen sRGB). Raaka titaani on n. (0.54, 0.50, 0.45);
// Ouran hopea PVD on vaaleampi ja neutraalimpi, lähellä kiillotettua terästä.
// ---------------------------------------------------------------------------
export const FINISH = {
  name: 'Silver',
  outerF0: new THREE.Color(0.615, 0.598, 0.572),
  innerF0: new THREE.Color(0.585, 0.566, 0.536),
  outerRoughness: 0.072,
  innerRoughness: 0.15,
  innerAnisotropy: 0.55,
};

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
// jokaisella pompulla metallin Fresnel-heijastus (Schlick). Sensorikuvut näkyvät
// heijastuksissa tummina alueina. Lopuksi karkaava säde näytteistetään ympäristöstä.
// ---------------------------------------------------------------------------
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
    if (level && level.isConstNode && level.value === 1) return pmremTexture(this.envTexture, reflWorld, level);
    if (!this._fn) this._fn = this._build();
    return this._fn(reflWorld, level);
  }

  // TSL-funktio: omassa funktiorungossaan muuttujat ja sijoitukset päätyvät oikeaan pinoon.
  _build() {
    const P = this.params;
    const env = this.envTexture;
    const bounces = P.bounces ?? 3;

    const sample = (dirLocal, lvl) => {
      const dw = normalize(modelWorldMatrix.mul(vec4(dirLocal, 0)).xyz);
      return pmremTexture(env, dw, lvl);
    };

    const domeMask = (q) => {
      // kulma kämmenen puolen keskilinjasta (θ = 0 on -Y)
      const th = atan(q.x, q.y.negate());
      let m = float(0);
      for (const tc of P.domeAngles) {
        const du = abs(th.sub(tc)).mul(P.R0).div(P.domeA);
        const dv = abs(q.z).div(P.domeB);
        const r = pow(du, P.domeN).add(pow(dv, P.domeN));
        m = max(m, float(1).sub(smoothstep(0.8, 1.1, r)));
      }
      return m;
    };

    return Fn(([reflWorld, level]) => {
      const f0 = vec3(P.wallF0.r, P.wallF0.g, P.wallF0.b);
      const p = vec3(positionLocal).toVar();
      const d = normalize(modelWorldMatrixInverse.mul(vec4(reflWorld, 0)).xyz).toVar();
      const through = vec3(1).toVar();
      const color = vec3(0).toVar();
      const lvl0 = float(level).toVar();
      const lvlHit = max(lvl0, float(P.wallRoughness)).toVar();

      for (let i = 0; i < bounces; i++) {
        // säde p + t·d leikkaa sylinterin |xy| = Rw (p on sylinterin pinnalla tai sen sisällä)
        const a = max(dot(d.xy, d.xy), 1e-5).toVar();
        const b = dot(p.xy, d.xy).toVar();
        const pp = dot(p.xy, p.xy).toVar();
        const c = pp.sub(max(pp, P.R0 * P.R0));
        const disc = max(b.mul(b).sub(a.mul(c)), 0);
        const t = b.negate().add(sqrt(disc)).div(a).toVar();
        const q = p.add(d.mul(t)).toVar();
        const valid = smoothstep(0.0, 0.02, t);
        const onWall = float(1).sub(smoothstep(P.wallHalf - 0.25, P.wallHalf + 0.35, abs(q.z)));
        const w = valid.mul(onWall).toVar();
        color.addAssign(through.mul(w.oneMinus()).mul(sample(d, i === 0 ? lvl0 : lvlHit)));
        const nrm = normalize(vec3(q.x.negate(), q.y.negate(), 0)).toVar();
        const cosT = clamp(dot(d.negate(), nrm), 0, 1);
        const fres = f0.add(vec3(1).sub(f0).mul(pow(float(1).sub(cosT), 5)));
        const wallRefl = mix(fres, vec3(0.045), domeMask(q));
        through.assign(through.mul(wallRefl).mul(w));
        d.assign(reflect(d, nrm));
        p.assign(q);
      }
      color.addAssign(through.mul(sample(d, bounces === 0 ? lvl0 : lvlHit)));
      return color;
    });
  }
}

export function createMaterials({ envTexture, profile, sensorCfg }) {
  const micro = createMicroSurfaceTexture();
  const noLights = lights([]); // rengas valaistaan vain studioympäristöllä (IBL)

  const cavity = attribute('cavity', 'float');
  const mark = attribute('mark', 'float');
  const microR = texture(micro, uv()).r;

  // Ulkokehys: kiillotettu PVD-titaani
  const outer = new THREE.MeshPhysicalNodeMaterial({
    name: 'Ti-PVD Silver (outer)',
    color: FINISH.outerF0,
    metalness: 1,
    roughness: FINISH.outerRoughness,
  });
  outer.lightsNode = noLights;
  // hyvin hienovarainen karheusvaihtelu + naarmut
  const lowFreq = mx_noise_float(positionLocal.mul(0.9)).mul(0.012);
  const polished = clamp(float(FINISH.outerRoughness).add(lowFreq).add(microR.mul(0.16)), 0.04, 0.4);
  // suuntausmerkin laseroitu pohja: mattapintainen ja hieman vaaleampi (näkyy "himmeänä merkkinä")
  const frost = mx_noise_float(positionLocal.mul(38)).mul(0.08);
  outer.roughnessNode = mix(polished, float(0.42).add(frost), mark);
  outer.colorNode = mix(vec3(FINISH.outerF0.r, FINISH.outerF0.g, FINISH.outerF0.b), vec3(0.7, 0.69, 0.67), mark);
  outer.aoNode = cavity;

  // Sisäkuori: hieno sorvattu satiini, anisotrooppinen + keskinäisheijastukset
  const interiorParams = {
    R0: profile.innerRadius,
    wallHalf: profile.halfWidth - 0.75,
    wallF0: FINISH.innerF0,
    wallRoughness: FINISH.innerRoughness,
    domeAngles: [sensorCfg.angle, -sensorCfg.angle],
    domeA: sensorCfg.halfLength,
    domeB: sensorCfg.halfWidth,
    domeN: sensorCfg.footprintExponent,
  };
  const inner = new THREE.MeshPhysicalNodeMaterial({
    name: 'Ti inner shell',
    color: FINISH.innerF0,
    metalness: 1,
    roughness: FINISH.innerRoughness,
    anisotropy: FINISH.innerAnisotropy,
  });
  inner.lightsNode = noLights;
  // sorvausjälki: kehän suuntaisia hienoja vaihteluita profiilin suunnassa
  const lathe = mx_noise_float(vec3(uv().y.mul(520), 0.0, uv().x.mul(3))).mul(0.03);
  inner.roughnessNode = clamp(float(FINISH.innerRoughness).add(lathe).add(microR.mul(0.08)), 0.06, 0.5);
  inner.envNode = new InteriorReflectionNode(envTexture, interiorParams);
  inner.aoNode = cavity;

  // Sensorikupu: tummaksi sävytetty optinen hartsi (läpäisy + taittuminen)
  const dome = new THREE.MeshPhysicalNodeMaterial({
    name: 'Sensor dome resin',
    color: new THREE.Color(1, 1, 1),
    metalness: 0,
    roughness: 0.045,
    transmission: 1,
    ior: 1.52,
    thickness: 0.55,
    attenuationColor: new THREE.Color(0.14, 0.142, 0.152),
    attenuationDistance: 0.3,
    specularIntensity: 1,
  });
  dome.lightsNode = noLights;
  dome.envNode = new InteriorReflectionNode(envTexture, { ...interiorParams, domeAngles: [] });

  const gasket = new THREE.MeshPhysicalNodeMaterial({
    name: 'Aperture gap',
    color: new THREE.Color(0.006, 0.006, 0.007),
    roughness: 0.55,
    metalness: 0,
  });
  gasket.lightsNode = noLights;

  const pcb = new THREE.MeshPhysicalNodeMaterial({
    name: 'Sensor floor',
    color: new THREE.Color(0.012, 0.013, 0.014),
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
  });
  pcb.lightsNode = noLights;

  const std = (name, params) => {
    const m = new THREE.MeshPhysicalNodeMaterial({ name, ...params });
    m.lightsNode = noLights;
    return m;
  };

  const internals = {
    ledBody: std('LED reflector body', { color: new THREE.Color(0.78, 0.77, 0.73), roughness: 0.38, clearcoat: 0.8, clearcoatRoughness: 0.12 }),
    ledCup: std('LED reflector cup', { color: new THREE.Color(0.9, 0.9, 0.88), roughness: 0.22, metalness: 0.0 }),
    dieGreen: std('InGaN die', { color: new THREE.Color(0.06, 0.1, 0.075), roughness: 0.12, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.4, sheenColor: new THREE.Color(0.1, 0.5, 0.2) }),
    dieRed: std('AlGaInP die', { color: new THREE.Color(0.18, 0.025, 0.02), roughness: 0.15, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05 }),
    dieIR: std('GaAs die', { color: new THREE.Color(0.05, 0.05, 0.055), roughness: 0.2, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.05 }),
    pdBody: std('PD body', { color: new THREE.Color(0.01, 0.01, 0.011), roughness: 0.5 }),
    silicon: std('Si photodiode (AR coated)', {
      color: new THREE.Color(0.03, 0.035, 0.09),
      roughness: 0.08,
      metalness: 0.4,
      iridescence: 1,
      iridescenceIOR: 2.0,
      iridescenceThicknessRange: [180, 320],
    }),
    aluminium: std('Al metallization', { color: new THREE.Color(0.91, 0.92, 0.92), metalness: 1, roughness: 0.32 }),
    gold: std('Au', { color: new THREE.Color(1.0, 0.766, 0.336), metalness: 1, roughness: 0.22 }),
    barrier: std('Optical barrier', { color: new THREE.Color(0.008, 0.008, 0.009), roughness: 0.7 }),
  };

  return { outer, inner, dome, gasket, pcb, internals, microTexture: micro };
}
