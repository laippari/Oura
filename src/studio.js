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

export function buildStudioScene() {
  const scene = new THREE.Scene();

  // Yksinkertainen valaistus: pehmeä pystysuuntainen liukuväri (kirkas yläpuoli → harmaa
  // horisontti → vaalea pöytä) ja yksi suuri, pehmeäreunainen yläpuolinen valo. Kiillotetussa
  // metallissa tämä näkyy muutamana leveänä, rauhallisena heijastusvyönä.
  const domeMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
  const dirY = positionWorld.normalize().y;
  const zenith = vec3(1.0, 1.0, 1.0);
  const horizon = vec3(0.3, 0.3, 0.305);
  const below = vec3(0.2, 0.198, 0.196);
  const table = vec3(0.6, 0.595, 0.59);
  const up = mix(horizon, zenith, smoothstep(0.0, 0.85, dirY));
  const low = mix(below, table, smoothstep(0.15, 0.7, dirY.negate()));
  domeMat.colorNode = select(dirY.greaterThanEqual(0), up, low);
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(40, 96, 48), domeMat));

  // Yksi suuri pehmeä avainvalo ylhäällä, hieman kameran puolella
  scene.add(aim(softbox(20, 14, 1.4, 0.45), 0, 13, 4));

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
