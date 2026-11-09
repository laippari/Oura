import * as THREE from 'three/webgpu';
import { vec2, vec3, uv, smoothstep, screenUV, length, mix, positionWorld, uniform, select } from 'three/tsl';

// ---------------------------------------------------------------------------
// Kirkas tuotekuvausstudio (kuten Ouran virallisissa kuvissa).
//
// Kiillotettu metalli näyttää vain sen, mitä se heijastaa: valkoinen "valoteltta"
// (kupoli + suuret softboxit) antaa hopealle sen kirkkaan perussävyn, ja kapeat mustat
// "flagit" piirtävät reunoihin terävät tummat juovat, jotka määrittävät muodon.
// Näkymä renderöidään kuutiokarttaan ja esisuodatetaan (PMREM) karheustasoille.
// ---------------------------------------------------------------------------

function softbox(width, height, intensity, softness = 0.12, tint = [1, 1, 1]) {
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const p = uv();
  const ex = smoothstep(0, softness, p.x).mul(smoothstep(0, softness, p.x.oneMinus()));
  const ey = smoothstep(0, softness * (width / height), p.y).mul(smoothstep(0, softness * (width / height), p.y.oneMinus()));
  mat.colorNode = vec3(tint[0], tint[1], tint[2]).mul(intensity).mul(ex).mul(ey);
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
}

function flag(width, height) {
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const p = uv();
  // pehmeäreunainen musta kartonki
  const ex = smoothstep(0, 0.06, p.x).mul(smoothstep(0, 0.06, p.x.oneMinus()));
  const ey = smoothstep(0, 0.02, p.y).mul(smoothstep(0, 0.02, p.y.oneMinus()));
  mat.colorNode = vec3(0.0);
  mat.opacityNode = ex.mul(ey);
  mat.transparent = true;
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
}

function aim(obj, x, y, z, target = new THREE.Vector3()) {
  obj.position.set(x, y, z);
  obj.lookAt(target);
  return obj;
}

export function buildStudioScene() {
  const scene = new THREE.Scene();

  // Kupoli: kirkas yläpuolisko, lähes musta horisontti, harmaa pöytä.
  // (Virallisissa kuvissa sivupinnat ja kyljet heijastavat tummaa horisonttia,
  //  yläpuoliset pinnat ja sisäpinta kirkasta kattovaloa.)
  const domeMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
  const dirY = positionWorld.normalize().y;
  const zenith = vec3(1.05, 1.05, 1.06);
  const upper = vec3(0.62, 0.62, 0.63);
  const horizon = vec3(0.018, 0.018, 0.019);
  const lower = vec3(0.5, 0.497, 0.492);
  const up = mix(mix(horizon, upper, smoothstep(0.12, 0.42, dirY)), zenith, smoothstep(0.5, 0.92, dirY));
  // Pöytä suoraan alla: keskiharmaa. Sivupinta heijastaa 43°-asennossa lähes suoraan alas sekä
  // ylä- että alaosassa, ja virallisissa kuvissa molemmat ovat yhtä harmaita.
  const table = lower;
  const low = mix(horizon, table, smoothstep(0.12, 0.5, dirY.negate()));
  domeMat.colorNode = select(dirY.greaterThanEqual(0), up, low);
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(40, 96, 48), domeMat));

  // Suuri kattosoftbox
  scene.add(aim(softbox(22, 22, 1.6, 0.35), 0, 14, 0));
  // Viistot ylävalot: liukuvat korostukset pyöristyksiin
  scene.add(aim(softbox(12, 5, 2.4, 0.3), -9, 9, 5));
  scene.add(aim(softbox(12, 5, 2.0, 0.3), 9, 9, -4));
  // Kapeat stripit matalalla sivuilla: ohuet kirkkaat reunaviivat
  scene.add(aim(softbox(0.9, 6, 7, 0.25), -11, 2.2, -3));
  scene.add(aim(softbox(0.9, 6, 6, 0.25), 11, 2.2, 3));

  return scene;
}

export function createEnvironment(renderer, size = 512) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const studio = buildStudioScene();
  const rt = pmrem.fromScene(studio, 0, 0.1, 100, { size });
  studio.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
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
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), shadowMat);
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
