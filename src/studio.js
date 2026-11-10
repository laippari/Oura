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

export function createEnvironment(renderer, size = 512, variant = 'oura') {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = variant === 'oura' ? buildOuraStudio() : buildStudioScene();
  const rt = pmrem.fromScene(studio, 0, 0.1, 100, { size });
  studio.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
      o.material.colorNode?.value?.dispose?.();
    }
  });
  pmrem.dispose();
  return rt.texture;
}

// ---------------------------------------------------------------------------
// Näkyvä tausta: vaalea, hieman lämmin neutraali harmaa ja pehmeä vinjetti.
// ---------------------------------------------------------------------------
export function createBackgroundNode() {
  const plain = uniform(0);
  const p = screenUV;
  const d = length(p.sub(vec2(0.5, 0.54)).mul(vec2(1.0, 1.2)));
  const inner = vec3(0.86, 0.858, 0.852);
  const outer = vec3(0.6, 0.598, 0.592);
  const grad = mix(inner, outer, smoothstep(0.1, 1.0, d));
  const node = mix(grad, vec3(1.0), plain);
  node.plain = plain;
  return node;
}

export function createGround(floorY) {
  const group = new THREE.Group();
  group.name = 'ground';

  // Kontaktivarjo vaalealla taustalla
  const shadowMat = new THREE.ShadowNodeMaterial({ color: 0x1a1816, opacity: 0.32, depthWrite: false });
  // häivytys ennen varjokameran rajaa (muuten rajasta näkyy ohut viiva taustassa)
  shadowMat.opacityNode = float(0.32).mul(float(1).sub(smoothstep(13, 21, length(positionWorld.xz))));
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

  return { group, light, shadowMat };
}
