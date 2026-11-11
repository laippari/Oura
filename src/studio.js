import * as THREE from 'three/webgpu';
import { float, vec2, vec3, uv, smoothstep, screenUV, length, mix, positionWorld, uniform, select, texture, atan, asin, clamp } from 'three/tsl';
import { STUDIO_ENV } from './studioEnv.js';

// ---------------------------------------------------------------------------
// Studiovalaistus.
//
// Oletus 'oura': Ouran oma tuotekuvausstudio rekonstruoituna heidän virallisista kuvistaan
// (studioEnv.js). Ruudukko interpoloidaan kuutiollisella B-splinillä tiheämmäksi tekstuuriksi,
// joten kiillotetussa pinnassa ei näy ruudukon kulmia eikä teräviä softbox-reunoja.
// Vaihtoehto 'soft' (#soft): aiempi pehmeä liukuväri + yksi valo.
// Näkymä renderöidään kuutiokarttaan ja esisuodatetaan (PMREM) karheustasoille.
// ---------------------------------------------------------------------------

const POLE_BLUR_DEG = 3.5; // napojen lähellä tavoiteltu pehmeys pallon pinnalla

// Kuutiollinen B-spline-ylösnäytteistys (sileä, ei ylitystä): atsimuutti jaksollinen, korkeus rajattu.
function upsampleEnv(env, W, H) {
  const { width: w, height: h, data } = env;
  const at = (x, y) => data[Math.min(h - 1, Math.max(0, y)) * w + (((x % w) + w) % w)];
  const B = (t) => [(1 - t) ** 3 / 6, (3 * t ** 3 - 6 * t * t + 4) / 6, (-3 * t ** 3 + 3 * t * t + 3 * t + 1) / 6, t ** 3 / 6];
  const out = new Float32Array(W * H * 4);
  for (let j = 0; j < H; j++) {
    const fy = ((j + 0.5) / H) * h - 0.5;
    const y0 = Math.floor(fy);
    const by = B(fy - y0);
    for (let i = 0; i < W; i++) {
      const fx = ((i + 0.5) / W) * w - 0.5;
      const x0 = Math.floor(fx);
      const bx = B(fx - x0);
      let v = 0;
      for (let b = 0; b < 4; b++) for (let a = 0; a < 4; a++) v += by[b] * bx[a] * at(x0 - 1 + a, y0 - 1 + b);
      const k = (j * W + i) * 4;
      out[k] = out[k + 1] = out[k + 2] = v;
      out[k + 3] = 1;
    }
  }
  // Navat: lat-long-kartassa solun leveys kapenee napaa kohti, joten atsimuutin suuntainen
  // pehmeys terävöityy ja navalle syntyy nipistynyt piste (näkyi heijastuksena ulkopinnan
  // alaosassa). Rivit sumennetaan atsimuutissa niin, että pehmeys pallon pinnalla pysyy samana
  // (σ ∝ tan(korkeus)); navalla rivi tasoittuu keskiarvoonsa. Rakenne navan ympärillä säilyy.
  const sigma0 = (POLE_BLUR_DEG * Math.PI) / 180;
  const row = new Float32Array(W);
  for (let j = 0; j < H; j++) {
    const c = Math.max(1e-4, Math.cos(((j + 0.5) / H - 0.5) * Math.PI));
    const t = Math.min(1, Math.max(0, (0.5 - c) / 0.3));
    const ramp = t * t * (3 - 2 * t); // 0 kun |korkeus| < 60°, 1 kun > 78°
    const sig = ((sigma0 * Math.sqrt(1 / (c * c) - 1) * ramp) / (2 * Math.PI)) * W;
    if (sig < 0.5) continue;
    for (let i = 0; i < W; i++) row[i] = out[(j * W + i) * 4];
    const rad = Math.min(W >> 1, Math.ceil(sig * 3));
    const k = new Float32Array(rad * 2 + 1);
    let ksum = 0;
    for (let d = -rad; d <= rad; d++) ksum += k[d + rad] = Math.exp((-0.5 * d * d) / (sig * sig));
    for (let i = 0; i < W; i++) {
      let v = 0;
      for (let d = -rad; d <= rad; d++) v += k[d + rad] * row[(i + d + W) % W];
      const o = (j * W + i) * 4;
      out[o] = out[o + 1] = out[o + 2] = v / ksum;
    }
  }
  const tex = new THREE.DataTexture(out, W, H, THREE.RGBAFormat, THREE.FloatType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function buildOuraStudio() {
  const scene = new THREE.Scene();
  const tex = upsampleEnv(STUDIO_ENV, 384, 192);
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
  const d = positionWorld.normalize();
  const u = atan(d.x, d.z).div(Math.PI * 2).add(0.5);
  const v = asin(clamp(d.y, -1, 1)).div(Math.PI).add(0.5);
  mat.colorNode = texture(tex, vec2(u, v)).rgb;
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(40, 128, 64), mat));
  return scene;
}

function softbox(width, height, intensity, softness = 0.12, tint = [1, 1, 1]) {
  // Lisäävä sekoitus: reunat häivyttyvät taustaan eivätkä mustaan (muuten kiillotettu metalli
  // heijastaisi valon ympärille tumman kehyksen).
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const p = uv();
  const ex = smoothstep(0, softness, p.x).mul(smoothstep(0, softness, p.x.oneMinus()));
  const ey = smoothstep(0, softness * (width / height), p.y).mul(smoothstep(0, softness * (width / height), p.y.oneMinus()));
  mat.colorNode = vec3(tint[0], tint[1], tint[2]).mul(intensity).mul(ex).mul(ey);
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
}

function aim(obj, x, y, z, target = new THREE.Vector3()) {
  obj.position.set(x, y, z);
  obj.lookAt(target);
  return obj;
}

// Vaihtoehtoinen pehmeä studio (#soft): harmaa horisontti, matala kontrasti.
export function buildStudioScene() {
  const scene = new THREE.Scene();

  // Yksinkertainen valaistus: pehmeä pystysuuntainen liukuväri (kirkas yläpuoli → harmaa
  // horisontti → vaalea pöytä) ja yksi suuri, pehmeäreunainen yläpuolinen valo. Kiillotetussa
  // metallissa tämä näkyy muutamana leveänä, rauhallisena heijastusvyönä.
  const domeMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
  const dirY = positionWorld.normalize().y;
  const up = mix(vec3(0.3, 0.3, 0.305), vec3(1.0, 1.0, 1.0), smoothstep(0.0, 0.85, dirY));
  const low = mix(vec3(0.2, 0.198, 0.196), vec3(0.6, 0.595, 0.59), smoothstep(0.15, 0.7, dirY.negate()));
  domeMat.colorNode = select(dirY.greaterThanEqual(0), up, low);
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(40, 96, 48), domeMat));

  // Yksi suuri pehmeä avainvalo ylhäällä, hieman kameran puolella
  scene.add(aim(softbox(20, 14, 1.4, 0.45), 0, 13, 4));

  return scene;
}

// Environment: the base studio is prefiltered once (PMREM). The dark look is derived from it
// in the materials (see makeStudio in materials.js), so no second map is needed.
export function createStudio(renderer, size = 512, variant = 'oura') {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const scene = variant === 'soft' ? buildStudioScene() : buildOuraStudio();
  const rt = pmrem.fromScene(scene, 0, 0.1, 100, { size });
  scene.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
  pmrem.dispose();
  return { texture: rt.texture };
}

// ---------------------------------------------------------------------------
// Näkyvä tausta: vaalea, hieman lämmin neutraali harmaa ja pehmeä vinjetti.
// ---------------------------------------------------------------------------
export function createBackgroundNode() {
  const plain = uniform(0);
  const theme = uniform(0); // 0 = vaalea, 1 = tumma
  const center = uniform(new THREE.Vector2(0.5, 0.54));
  const p = screenUV;
  const d = length(p.sub(center).mul(vec2(1.0, 1.2)));
  const light = mix(vec3(0.86, 0.858, 0.852), vec3(0.6, 0.598, 0.592), smoothstep(0.1, 1.0, d));
  // tumma: lämmin lähes musta, keskellä hieman vaaleampi (varjo ja muoto erottuvat)
  const dark = mix(vec3(0.05, 0.047, 0.044), vec3(0.008, 0.0076, 0.0072), smoothstep(0.05, 0.95, d));
  const grad = mix(light, dark, theme);
  const node = mix(grad, vec3(1.0), plain);
  node.plain = plain;
  node.theme = theme;
  node.center = center;
  return node;
}

export function createGround(floorY) {
  const group = new THREE.Group();
  group.name = 'ground';

  // Kontaktivarjo vaalealla taustalla
  const shadowMat = new THREE.ShadowNodeMaterial({ color: 0x1a1816, opacity: 0.32, depthWrite: false });
  // häivytys ennen varjokameran rajaa (muuten rajasta näkyy ohut viiva taustassa)
  const shadowOpacity = uniform(0.32);
  shadowMat.opacityNode = shadowOpacity.mul(float(1).sub(smoothstep(13, 21, length(positionWorld.xz))));
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(46, 46), shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = floorY;
  shadowPlane.receiveShadow = true;
  group.add(shadowPlane);

  // Varjoa luova valo (vaikuttaa vain varjotasoon; renkaan materiaalit käyttävät vain IBL:ää)
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(2, 60, 8);
  light.target.position.set(0, floorY, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  const s = 24;
  light.shadow.camera.left = -s;
  light.shadow.camera.right = s;
  light.shadow.camera.top = s;
  light.shadow.camera.bottom = -s;
  light.shadow.camera.near = 20;
  light.shadow.camera.far = 110;
  light.shadow.radius = 30;
  light.shadow.blurSamples = 32;
  light.shadow.bias = -0.0004;
  group.add(light, light.target);

  return { group, light, shadowMat, shadowOpacity };
}
