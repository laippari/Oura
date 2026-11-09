import * as THREE from 'three/webgpu';
import { float, vec2, vec3, uv, smoothstep, screenUV, length, mix, positionWorld, pow, clamp, max } from 'three/tsl';

// ---------------------------------------------------------------------------
// Studioympäristö kiillotetulle metallille.
//
// Kiillotettu metalli näyttää vain sen, mitä se heijastaa. Siksi valaistus on
// rakennettu kuten tuotekuvausstudio: suuret pehmeäreunaiset softboxit, kapeat
// "strip light" -valot reunaheijastuksia varten, takavalo sekä tumma ympäristö,
// joka antaa heijastuksille kontrastia. Näkymä renderöidään kuutiokarttaan ja
// esisuodatetaan (PMREM) karheustasoille.
// ---------------------------------------------------------------------------

function softbox(width, height, intensity, softness = 0.12, tint = [1, 1, 1], hotspot = 0.25) {
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide });
  const p = uv();
  const ex = smoothstep(0, softness, p.x).mul(smoothstep(0, softness, p.x.oneMinus()));
  const ey = smoothstep(0, softness * (width / height), p.y).mul(smoothstep(0, softness * (width / height), p.y.oneMinus()));
  // diffuusorikankaan lievä keskikirkkaus
  const c = length(p.sub(0.5).mul(vec2(1, 1))).mul(1.6);
  const center = float(1 - hotspot).add(float(hotspot).mul(float(1).sub(clamp(c, 0, 1))));
  mat.colorNode = vec3(tint[0], tint[1], tint[2]).mul(intensity).mul(ex).mul(ey).mul(center);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  return mesh;
}

function aim(obj, x, y, z, target = new THREE.Vector3()) {
  obj.position.set(x, y, z);
  obj.lookAt(target);
  return obj;
}

export function buildStudioScene() {
  const scene = new THREE.Scene();

  // Ympäröivä kupoli: tumma, hieman lämpimämpi alhaalta (lattian heijastus)
  const domeMat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
  const dirY = positionWorld.normalize().y;
  const top = vec3(0.34, 0.342, 0.35);
  const horizon = vec3(0.17, 0.17, 0.175);
  const floor = vec3(0.2, 0.195, 0.188);
  domeMat.colorNode = mix(mix(horizon, top, smoothstep(0.0, 0.8, dirY)), floor, smoothstep(0.02, 0.4, dirY.negate()));
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(40, 64, 32), domeMat));

  // Lattia: valon "allas" pääsoftboxin alla
  const floorMat = new THREE.MeshBasicNodeMaterial();
  const fr = length(positionWorld.xz).div(14);
  floorMat.colorNode = mix(vec3(0.42, 0.41, 0.395), vec3(0.09, 0.088, 0.085), smoothstep(0.0, 1.0, fr));
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = -6;
  scene.add(floorMesh);

  // Pääsoftbox ylhäällä, hieman kameran puolella
  scene.add(aim(softbox(16, 10, 9, 0.2), 0, 11, 3.5));
  // Suuri valkoinen heijastinkangas kameran takana: hopean "kirkas" perussävy
  scene.add(aim(softbox(22, 9, 2.2, 0.45, [1, 0.99, 0.975], 0.4), 0, 2.5, 13));
  // Vasen ja oikea pystystrip: pitkät kirkkaat reunaheijastukset
  scene.add(aim(softbox(1.8, 14, 14, 0.22, [1, 0.985, 0.96]), -10.5, 1.5, 2.5));
  scene.add(aim(softbox(1.5, 14, 10, 0.22, [0.96, 0.98, 1]), 10.5, 1.0, -1.5));
  // Takavalo (rim) ylhäällä takana
  scene.add(aim(softbox(14, 2.2, 8, 0.25), 0, 6.5, -10));
  // Matalat sivukankaat: pehmeä täyte alapuolisille pinnoille
  scene.add(aim(softbox(10, 5, 1.6, 0.4), -9, -3, -6));
  scene.add(aim(softbox(10, 5, 1.3, 0.4), 9, -3.5, 7));
  // Pienet aksentit: tuovat eloa kaareviin pintoihin
  scene.add(aim(softbox(2.4, 2.4, 9, 0.3), -6, 7, -6));
  scene.add(aim(softbox(3.5, 1.2, 6, 0.3), 7.5, -2.5, 6));
  // Tummat "flagit": syvät tummat juovat määrittävät muodon kiillotetussa metallissa
  const flagMat = new THREE.MeshBasicNodeMaterial({ color: 0x000000, side: THREE.DoubleSide });
  scene.add(aim(new THREE.Mesh(new THREE.PlaneGeometry(3.2, 18), flagMat), -6.5, 1, 8.5));
  scene.add(aim(new THREE.Mesh(new THREE.PlaneGeometry(2.6, 18), flagMat), 7.5, 1, 7));
  scene.add(aim(new THREE.Mesh(new THREE.PlaneGeometry(18, 2.5), flagMat), 0, 9.5, -7));

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
// Näkyvä tausta: neutraali grafiitti, pehmeä vinjetti. Lattiataso näkyy vain
// valon altaana ja renkaan pehmeänä kontaktivarjona.
// ---------------------------------------------------------------------------
export function createBackgroundNode() {
  const p = screenUV;
  const d = length(p.sub(vec2(0.5, 0.56)).mul(vec2(1.0, 1.25)));
  const inner = vec3(0.034, 0.034, 0.036);
  const outer = vec3(0.006, 0.006, 0.007);
  return mix(inner, outer, smoothstep(0.05, 0.85, d));
}

export function createGround(floorY) {
  const group = new THREE.Group();
  group.name = 'ground';

  // Valon allas lattialla (pehmeästi häivytetty taustaan)
  const poolMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const r = length(positionWorld.xz).div(34);
  const fall = pow(max(float(1).sub(r), 0), 2.2);
  poolMat.colorNode = vec3(0.105, 0.103, 0.1);
  poolMat.opacityNode = fall.mul(0.85);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = floorY;
  pool.renderOrder = -2;
  group.add(pool);

  // Kontaktivarjo
  const shadowMat = new THREE.ShadowNodeMaterial({ color: 0x000000, opacity: 0.62, depthWrite: false });
  const shadowPlane = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), shadowMat);
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = floorY + 0.01;
  shadowPlane.receiveShadow = true;
  shadowPlane.renderOrder = -1;
  group.add(shadowPlane);

  // Varjoa luova valo (vaikuttaa vain varjotasoon; renkaan materiaalit käyttävät vain IBL:ää)
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(3, 60, 9);
  light.target.position.set(0, floorY, 0);
  light.castShadow = true;
  light.shadow.mapSize.set(512, 512);
  const s = 22;
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

  return { group, light, shadowMat, poolMat };
}
