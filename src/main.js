import * as THREE from 'three/webgpu';
import { pass, renderOutput, screenUV, screenCoordinate, rand, vec2, vec3, vec4, float, length, smoothstep, mix, uniform, reflectVector, dot, normalize, normalLocal, positionLocal } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ssaaPass } from 'three/addons/tsl/display/SSAAPassNode.js';

import { RING, SENSORS, FEATURES, FINISHES, VIEW, EXPLODE } from './config.js';
import { buildProfile } from './geometry/profile.js';
import { splitBand, buildInternalGeometries } from './geometry/parts.js';
import { buildRecessPatch, buildLens, buildLEDInternals, buildPDInternals, mergeByMaterial, buildGasket, buildModuleBase } from './geometry/features.js';
import { createMaterials } from './materials.js';
import { createStudio, createBackgroundNode, createGround } from './studio.js';
import { InspectControls } from './controls.js';
import { Exploder } from './explode.js';
import { SensorLights } from './sensors.js';
import { Director, SEQUENCES } from './sequences.js';
import { createUI } from './ui.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const deg = THREE.MathUtils.degToRad;

async function main() {
  const container = $('viewer');
  const forceWebGL = params.has('webgl');

  const renderer = new THREE.WebGPURenderer({
    antialias: false,
    forceWebGL,
    powerPreference: 'high-performance',
  });
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;
  container.appendChild(renderer.domElement);
  await renderer.init();

  const backendName = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2';
  document.documentElement.dataset.backend = backendName;
  $('backend').textContent = backendName;

  // --- Näkymä ---------------------------------------------------------------
  const scene = new THREE.Scene();
  const background = createBackgroundNode(); // pysyvä viittaus (siluettitila vaihtaa näkymän taustan)
  scene.backgroundNode = background;
  // Vaalea studio: Ouran rekonstruoitu studio (oletus) tai #soft = aiempi pehmeä studio.
  // Tumma studio valitaan paneelista (tai ?dark / #dark).
  const lightVariant = params.get('studio') === 'soft' || location.hash === '#soft' ? 'soft' : 'oura';
  addEventListener('hashchange', () => location.reload());
  const matchMode = params.has('match');
  // Oletukset: tumma studio, Deep Rose ja sensorien valot päällä. ?light / #light (tai #soft)
  // avaa vaaleassa studiossa, ?finish=… valitsee värin ja ?sensors=0 sammuttaa valot.
  // Vertailutila (?match) on aina vaalea, Silver ja valot pois.
  const startDark = !matchMode && !params.has('light') && location.hash !== '#light' && lightVariant !== 'soft';
  const studio = createStudio(renderer, params.has('lowenv') ? 256 : 512, startDark ? 'dark' : lightVariant);
  const envTexture = studio.texture;
  scene.environment = envTexture;

  if (matchMode) document.body.classList.add('match');
  // ?match = 43° tuotekuva (lineItem), ?match=axial = akselin suuntainen sivukuva (hero side view)
  const matchAxial = params.get('match') === 'axial';
  const MATCH = matchAxial
    ? { fov: 9.06, dist: 190.7, near: 170, far: 210, offset: [0, 0], euler: [0, 0, 0] }
    : { fov: 8.7761, dist: 176.001, near: 150, far: 200, offset: [500 - 499.6583, 500 - 540.372], euler: [0.7534, 0.00103, 0] };

  // --- Malli -----------------------------------------------------------------
  const profile = buildProfile(matchMode ? { ...RING, innerRadius: matchAxial ? RING.matchInnerRadiusAxial : RING.matchInnerRadius } : RING);
  const Ri = profile.innerRadius;
  const Ro = profile.outerRadius;

  // Sensori-ikkunat: 2 × tri-LED ja 2 × fotodiodi (paikat kaarena, mitattu virallisista kuvista)
  const L = SENSORS.lens;
  const P = SENSORS.pocket;
  const windows = [];
  for (const sgn of [1, -1]) {
    windows.push({ kind: 'led', thetaC: (sgn * SENSORS.led.arcMm) / Ri, sgn, hA: L.halfLength, hB: L.halfWidth });
    windows.push({ kind: 'pd', thetaC: (sgn * SENSORS.pd.arcMm) / Ri, sgn, hA: L.halfLength, hB: L.halfWidth });
  }
  const pocketA = L.halfLength + P.margin;
  const pocketB = L.halfWidth + P.margin;
  const pocketR = L.corner + P.margin;
  const patchMargin = 0.28;
  const borePatches = windows.map((w) => ({ thetaC: w.thetaC, R: Ri, zc: 0, hA: pocketA, hB: pocketB, rc: pocketR, margin: patchMargin }));
  const F = FEATURES;
  borePatches.push({ thetaC: Math.PI, R: Ri, zc: 0, hA: F.pad.halfLength, hB: F.pad.halfWidth, rc: F.pad.corner, margin: patchMargin });
  const outerPatches = [{ thetaC: 0, R: Ro, zc: 0, hA: F.mark.halfLength, hB: F.mark.halfWidth, rc: F.mark.corner, margin: patchMargin }];

  const mats = createMaterials({ envTexture, profile, windows, outerPatches, borePatches, params: { lensThickness: params.has('lt') ? Number(params.get('lt')) : undefined } });

  const ring = new THREE.Group();
  ring.name = 'Oura Ring 5';
  const exploder = new Exploder();
  const cutMeshes = [];
  const mesh = (geo, mat, name, parent) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const group = (name) => {
    const g = new THREE.Group();
    g.name = name;
    ring.add(g);
    return g;
  };
  const E = EXPLODE.parts;

  // Runko neljänä kappaleena (koottuna sama pinta kuin yhtenäinen runko)
  const split = splitBand(profile, RING);
  const partGroups = {};
  for (const key of ['lockA', 'outer', 'lockB', 'inner']) {
    const g = group(key);
    const surf = mesh(split[key].surface, [mats.outer, mats.inner], key + '-surface', g);
    surf.userData.band = true;
    const cut = mesh(split[key].cut, mats.parts.cut, key + '-cut', g);
    cut.visible = false;
    cutMeshes.push(cut);
    exploder.add(g, E[key].offset, { order: E[key].order });
    partGroups[key] = g;
  }

  const sOfBore = (z) => z;
  const sOfOuter = (z) => profile.sOuterMid - z;
  const lensShape = (S) => ({ H: S.height, rr: S.edgeRadius, domeRadius: S.domeRadius });
  const sensorsGroup = group('sensors');
  const basesGroup = group('sensor-bases');
  const gasketsGroup = group('gaskets');
  for (const w of windows) {
    mesh(
      buildRecessPatch({ surface: 'bore', R: Ri, thetaC: w.thetaC, hA: pocketA, hB: pocketB, rc: pocketR, margin: patchMargin, depth: P.depth, bevel: P.bevel, floorGap: 1, gapEnd: P.margin + 0.03, sOf: sOfBore, L: profile.length, Rf: profile.innerRadiusAt }),
      mats.innerPatch,
      w.kind + '-pocket',
      partGroups.inner
    );
    const isLED = w.kind === 'led';
    const lens = mesh(
      buildLens({ R: Ri, thetaC: w.thetaC, hA: L.halfLength, hB: L.halfWidth, rc: L.corner, ...lensShape(isLED ? SENSORS.led : SENSORS.pd), base: -P.depth, Rf: profile.innerRadiusAt }),
      isLED ? mats.lensLED : mats.lens,
      w.kind + '-lens',
      sensorsGroup
    );
    lens.renderOrder = 2;
    // dir = suunta kohti fotodiodia u-akselilla (LED) / poispäin keskilinjasta (PD)
    sensorsGroup.add(mergeByMaterial(isLED ? buildLEDInternals(Ri, w.thetaC, w.sgn, mats.internals) : buildPDInternals(Ri, w.thetaC, w.sgn, mats.internals)));
    // räjäytyskuvan osat: moduulin alusta ja tiiviste
    mesh(buildModuleBase({ R: Ri, thetaC: w.thetaC, hA: L.halfLength + 0.08, hB: L.halfWidth + 0.08, rc: L.corner + 0.08, h0: -0.42, h1: -0.085, Rf: profile.innerRadiusAt }), mats.parts.base, w.kind + '-base', basesGroup);
    mesh(buildGasket({ R: Ri, thetaC: w.thetaC, hA: pocketA - 0.01, hB: pocketB - 0.01, rc: pocketR, width: P.margin + 0.06, h0: -0.09, h1: 0.03, Rf: profile.innerRadiusAt }), mats.parts.gasket, w.kind + '-gasket', gasketsGroup);
  }
  mesh(
    buildRecessPatch({ surface: 'bore', R: Ri, thetaC: Math.PI, hA: F.pad.halfLength, hB: F.pad.halfWidth, rc: F.pad.corner, margin: patchMargin, depth: F.pad.depth, bevel: F.pad.bevel, floorMark: 1, sOf: sOfBore, L: profile.length, Rf: profile.innerRadiusAt }),
    mats.innerPatch,
    'inner-pad',
    partGroups.inner
  );
  mesh(
    buildRecessPatch({ surface: 'outer', R: Ro, thetaC: 0, hA: F.mark.halfLength, hB: F.mark.halfWidth, rc: F.mark.corner, margin: patchMargin, depth: F.mark.depth, bevel: F.mark.bevel, floorMark: 0.5, sOf: sOfOuter, L: profile.length, Rf: profile.outerRadiusAt }),
    mats.outerPatch,
    'orientation-mark',
    partGroups.outer
  );

  // Sisäosat (koottuna piilossa)
  const ig = buildInternalGeometries(profile, windows, { hA: pocketA });
  const batteryGroup = group('battery');
  mesh(ig.battery, mats.parts.battery, 'battery', batteryGroup);
  mesh(ig.batteryTab, mats.internals.gold, 'battery-tab', batteryGroup);
  const frameGroup = group('frame');
  mesh(ig.frame, mats.parts.frame, 'inner-frame', frameGroup);
  const pcbGroup = group('pcb');
  mesh(ig.pcbStrip, mats.parts.pcb, 'flex-pcb', pcbGroup);
  mesh(ig.pcbPads, mats.parts.pcb, 'flex-pcb-pads', pcbGroup);
  exploder.add(batteryGroup, E.battery.offset, { order: E.battery.order, internal: true });
  exploder.add(frameGroup, E.frame.offset, { order: E.frame.order, internal: true });
  exploder.add(pcbGroup, E.pcb.offset, { order: E.pcb.order, internal: true });
  exploder.add(gasketsGroup, E.gaskets.offset, { order: E.gaskets.order, internal: true });
  exploder.add(sensorsGroup, E.sensors.offset, { order: E.sensors.order });
  exploder.add(basesGroup, E.sensors.offset, { order: E.sensors.order, internal: true });
  exploder.update(0);
  scene.add(ring);

  // --- Lattia + kontaktivarjo ----------------------------------------------------------------
  const boundR = Math.hypot(profile.outerRadius, profile.halfWidth);
  const floorY = -(boundR + 1.6);
  const floorYExploded = -(EXPLODE.halfHeight + 2.5);
  const ground = createGround(floorY);
  scene.add(ground.group);
  if (matchMode) {
    ground.group.visible = false;
    background.plain.value = 1;
  }

  // --- Kamera ----------------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(VIEW.fov, 1, 0.1, 500);
  const elev = deg(VIEW.elevationDeg);
  const camDir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));
  // Studio kääntyy kameran kallistuksen mukana: alkunäkymän heijastukset vastaavat
  // virallisen tuotekuvan asetelmaa (vaakasuora kamera, sormus 43.5° kallistettuna).
  // (etumerkki +: three.js:n PMREM-näytteistys peilaa y-akselin ennen kiertoa)
  if (!matchMode) scene.environmentRotation.set(elev, 0, 0);
  let fitScale = 1; // räjäytyskuvassa kamera vetäytyy kauemmas
  let fitScaleExploded = 2.5;
  const view = {
    zoom: 1,
    pan: new THREE.Vector3(),
    minZoom: VIEW.minZoom,
    maxZoom: VIEW.maxZoom,
    fitDistance: 80,
    getVisibleHeight(z) {
      return 2 * Math.tan(deg(VIEW.fov) / 2) * this.fitDistance * fitScale * z;
    },
  };
  // paneelin ollessa auki kuvaa siirretään ylös, jotta sormus on näkyvän alueen keskellä
  let shift = 0;
  let shiftTarget = 0;
  const placeCamera = () => {
    if (matchMode) {
      // Vertailutila: kamera täsmälleen Ouran virallisen tuotekuvan asennossa (sovitettu siluettiin)
      camera.fov = MATCH.fov;
      camera.position.set(0, 0, MATCH.dist);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      camera.near = MATCH.near;
      camera.far = MATCH.far;
      // kuvakeskipisteen siirto (sovituksen cx, cy 1000 px kuvassa) – ei sormuksen siirtoa 3D:ssä.
      // ?crop=x,y,w,h rajaa saman näkymän (1000 px asteikko) lähikuvavertailuja varten.
      const [cx0, cy0, cw, ch] = params.has('crop') ? params.get('crop').split(',').map(Number) : [0, 0, 1000, 1000];
      camera.aspect = 1;
      camera.setViewOffset(1000, 1000, MATCH.offset[0] + cx0, MATCH.offset[1] + cy0, cw, ch);
      camera.updateProjectionMatrix();
      return;
    }
    const dist = view.fitDistance * fitScale * view.zoom;
    camera.fov = VIEW.fov;
    camera.up.set(0, 1, 0);
    camera.position.copy(view.pan).addScaledVector(camDir, dist);
    camera.lookAt(view.pan);
    camera.near = Math.max(0.05, dist * 0.02);
    camera.far = dist + 250;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (shift > 0.5) camera.setViewOffset(w, h, 0, shift, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  };

  // Sankariasento: kolmen neljäsosan näkymä, sensorit näkyvät renkaan sisällä
  const heroQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...VIEW.heroEuler.map(deg), 'YXZ'));
  const explodedQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...EXPLODE.euler.map(deg), 'YXZ'));
  ring.quaternion.copy(heroQuat);
  if (matchMode) {
    ring.quaternion.setFromEuler(new THREE.Euler(...MATCH.euler, 'YXZ'));
    if (params.has('mask')) {
      // Ääriviivavalidointi: valkoinen siluetti mustalla taustalla
      scene.overrideMaterial = new THREE.MeshBasicNodeMaterial({ color: 0xffffff });
      scene.backgroundNode = vec3(0);
    }
  }

  // --- Jälkikäsittely ---------------------------------------------------------
  const vignetteAmount = uniform(matchMode ? 0 : 1);
  const veil = uniform(0); // kamera-ajon sauma: kuva häivytetään täsmälleen taustaan
  const bgNode = background;
  const finish = (colorNode) => {
    const glow = bloom(colorNode, 0.1, 0.35, 1.2);
    const d = length(screenUV.sub(vec2(0.5)).mul(vec2(1.0, 1.15)));
    const vignette = mix(float(1), mix(float(1), float(0.86), vignetteAmount), smoothstep(0.35, 0.95, d));
    const graded = mix(colorNode.rgb.add(glow.rgb), bgNode.rgb, veil).mul(vignette);
    const out = renderOutput(vec4(graded, 1));
    // ±½ LSB:n kohina estää tummien liukuvärien raitautumisen 8-bittisillä näytöillä
    const n = rand(screenCoordinate.xy).sub(0.5).div(255);
    return vec4(out.rgb.add(vec3(n)), 1);
  };

  const fastPass = pass(scene, camera, { samples: 4 });
  const fastPipeline = new THREE.RenderPipeline(renderer);
  fastPipeline.outputColorTransform = false;
  fastPipeline.outputNode = finish(fastPass.getTextureNode('output'));

  const hqPass = ssaaPass(scene, camera);
  hqPass.sampleLevel = params.has('ssaa') ? Number(params.get('ssaa')) : 3; // 2^3 = 8 jitteröityä näytettä
  hqPass.unbiased = true;
  const hqPipeline = new THREE.RenderPipeline(renderer);
  hqPipeline.outputColorTransform = false;
  hqPipeline.outputNode = finish(hqPass.getTextureNode('output'));

  // --- Resoluutio ja kameran sovitus ------------------------------------------
  const maxPR = Math.min(window.devicePixelRatio || 1, params.has('pr') ? Number(params.get('pr')) : 2);
  let pixelRatio = maxPR;
  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const vHalf = deg(VIEW.fov) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    const fitR = boundR * VIEW.fitMargin;
    view.fitDistance = Math.max(fitR / Math.tan(vHalf), fitR / Math.tan(hHalf));
    // räjäytetty pino: korkea ja kapea
    const fitE = Math.max((EXPLODE.halfHeight * 1.06) / Math.tan(vHalf), (Ro * 1.25) / Math.tan(hHalf));
    fitScaleExploded = Math.max(1, fitE / view.fitDistance);
    placeCamera();
    requestRender();
  };

  // --- Tila: räjäytys, asento, sensorit, teema, näkymät -------------------------------------
  let autoRotate = !params.has('still') && !matchMode;
  let orientAnim = null;
  const hint = $('hint');
  const dismissHint = () => hint.classList.add('hidden');
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const sensors = new SensorLights(mats.sensor);

  const director = new Director({
    ring,
    camera,
    fov: VIEW.fov,
    heroQuat,
    explodedQuat,
    ringInfo: { Ri, Ro, A: profile.halfWidth, ledTheta: SENSORS.led.arcMm / Ri, pdTheta: SENSORS.pd.arcMm / Ri },
    standardDistance: () => view.fitDistance * fitScale,
    standardTarget: () => view.pan.clone(),
    setExplode: (on) => setExplode(on, { fromSequence: true }),
    onStop: () => {
      ui.hideSequence();
      view.zoom = 1;
      view.pan.set(0, 0, 0);
      controls.syncZoom();
    },
  });

  function setExplode(on, { fromSequence = false } = {}) {
    if (exploder.on === on) return;
    exploder.set(on);
    ui.setExplode(on);
    if (!fromSequence) {
      // asento: pino pystyyn (räjäytetty) tai takaisin sankariasentoon
      orientAnim = { t: 0, q0: ring.quaternion.clone(), q1: on ? explodedQuat : heroQuat, p0: ring.position.clone(), pan0: view.pan.clone(), z0: view.zoom };
    }
    requestRender();
  }

  const setSensors = (on) => {
    sensors.set(on);
    ui.setSensors(on);
    requestRender();
  };

  let dark = false;
  const applyTheme = (on, renderEnv = true) => {
    dark = on;
    if (renderEnv) studio.set(on ? 'dark' : lightVariant);
    background.theme.value = on ? 1 : 0;
    ground.shadowOpacity.value = on ? 0.6 : 0.32;
    if (on) mats.setInteriorLight(1.0, 0.015, 0.045);
    else mats.setInteriorLight(1.2, 0.16, 0.36);
    document.body.dataset.theme = on ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]').setAttribute('content', on ? '#0b0a0a' : '#d6d5d2');
    requestRender();
  };
  const setDark = (on, instant = false) => {
    ui.setDark(on);
    if (instant) applyTheme(on);
    else ui.transition(on ? '#0f0e0d' : '#d9d8d5', () => applyTheme(on));
  };

  const startSequence = (id) => {
    autoRotate = false;
    orientAnim = null;
    controls.velocity.set(0, 0);
    director.start(id);
    ui.showSequence(SEQUENCES.find((s) => s.id === id)?.name || '');
    requestRender();
  };

  // --- Ohjaus ----------------------------------------------------------------
  let resetAnim = null;
  const controls = new InspectControls(renderer.domElement, {
    object: ring,
    camera,
    view,
    onInteract: () => {
      autoRotate = false;
      resetAnim = null;
      orientAnim = null;
      if (director.running) director.stop();
      ui.close();
      dismissHint();
      requestRender();
    },
    onReset: () => {
      resetAnim = {
        t: 0,
        q0: ring.quaternion.clone(),
        q1: exploder.on ? explodedQuat : heroQuat,
        p0: ring.position.clone(),
        pan0: view.pan.clone(),
        z0: view.zoom,
      };
    },
  });
  controls.minFloorY = floorY + boundR + 0.3;

  const ui = createUI({
    finishes: FINISHES,
    onFinish: (i) => applyFinish(i),
    onExplode: (on) => setExplode(on),
    onSensors: (on) => setSensors(on),
    onDark: (on) => setDark(on),
    onSequence: (id) => startSequence(id),
    onSheet: (open, height) => {
      shiftTarget = open ? height * 0.5 : 0;
      if (open) dismissHint();
      requestRender();
    },
  });

  // --- Viimeistely (viralliset värit) -----------------------------------------
  let finishIndex = Math.max(0, FINISHES.findIndex((f) => f.id === (params.get('finish') || (matchMode ? 'silver' : 'deep-rose'))));
  function applyFinish(i) {
    finishIndex = i;
    mats.setFinish(FINISHES[i]);
    ui.setFinish(i);
    requestRender();
  }

  // --- Renderöintisilmukka ---------------------------------------------------
  // Renderöidään vain kun jokin muuttuu. Kun kuva on pysähtynyt, piirretään kerran
  // supernäytteistetty (8×) versio terävimpiä heijastuksia varten.
  let dirty = true;
  let hqDone = false;
  let lastMotion = performance.now();
  let lastTime = performance.now();
  let frameTimes = [];
  let firstFrame = true;
  function requestRender() {
    dirty = true;
    hqDone = false;
    lastMotion = performance.now();
  }

  const yAxis = new THREE.Vector3(0, 1, 0);
  const zAxis = new THREE.Vector3(0, 0, 1);
  const tmpQ = new THREE.Quaternion();
  const origin = new THREE.Vector3();

  const adaptResolution = (dt) => {
    frameTimes.push(dt);
    if (frameTimes.length < 24) return;
    const avg = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    frameTimes = [];
    if (avg > 0.03 && pixelRatio > 1) {
      pixelRatio = Math.max(1, pixelRatio * 0.85);
      resize();
    } else if (avg < 0.0185 && pixelRatio < maxPR) {
      pixelRatio = Math.min(maxPR, pixelRatio * 1.08);
      resize();
    }
  };

  const updateScene = (dt) => {
    let moving = controls.update(dt);

    // räjäytys: kappaleet, lattia, kameran etäisyys
    const wasMoving = exploder.moving;
    const g = exploder.update(dt);
    const ge = exploder.eased;
    mats.sensor.explode.value = g;
    for (const c of cutMeshes) c.visible = g > 0.001;
    // paneelin ollessa auki räjäytetty pino mahtuu sen yläpuolelle
    const H = container.clientHeight || 1;
    const sheetFactor = H / Math.max(H * 0.4, H - 2 * shift);
    fitScale = 1 + (fitScaleExploded * sheetFactor - 1) * ge;
    const fy = (floorYExploded - floorY) * ge;
    ground.group.position.y = fy;
    ground.light.position.y = 60 - fy; // valo pysyy paikallaan maailmassa
    controls.minFloorY = floorY + fy + boundR + (EXPLODE.halfHeight - boundR) * ge + 0.3;
    if (wasMoving) moving = true;

    if (!director.active) {
      if (orientAnim) {
        orientAnim.t = Math.min(1, orientAnim.t + dt / 1.6);
        const k = ease(orientAnim.t);
        ring.quaternion.slerpQuaternions(orientAnim.q0, orientAnim.q1, k);
        ring.position.lerpVectors(orientAnim.p0, origin, k);
        view.pan.lerpVectors(orientAnim.pan0, origin, k);
        view.zoom = orientAnim.z0 + (1 - orientAnim.z0) * k;
        controls.syncZoom();
        if (orientAnim.t >= 1) orientAnim = null;
        moving = true;
      } else if (resetAnim) {
        resetAnim.t = Math.min(1, resetAnim.t + dt / 0.9);
        const k = ease(resetAnim.t);
        ring.quaternion.slerpQuaternions(resetAnim.q0, resetAnim.q1, k);
        ring.position.lerpVectors(resetAnim.p0, origin, k);
        view.pan.lerpVectors(resetAnim.pan0, origin, k);
        view.zoom = resetAnim.z0 + (1 - resetAnim.z0) * k;
        controls.syncZoom();
        if (resetAnim.t >= 1) {
          resetAnim = null;
          autoRotate = true;
        }
        moving = true;
      } else if (autoRotate) {
        if (exploder.on) {
          // räjäytetty pino pyörii oman akselinsa ympäri (pysyy pystyssä)
          tmpQ.setFromAxisAngle(zAxis, dt * 0.24);
          ring.quaternion.multiply(tmpQ);
        } else {
          tmpQ.setFromAxisAngle(yAxis, dt * 0.24);
          ring.quaternion.premultiply(tmpQ);
        }
        moving = true;
      }
    }

    // sensorien valot
    sensors.update(dt);
    if (sensors.active) moving = true;

    // paneelin aiheuttama kuvan siirto
    if (Math.abs(shift - shiftTarget) > 0.25) {
      shift += (shiftTarget - shift) * (1 - Math.exp(-dt / 0.12));
      moving = true;
    } else shift = shiftTarget;

    return moving;
  };

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    let moving = updateScene(dt);
    if (director.active) {
      placeCamera();
      director.update(dt);
      moving = true;
    }
    veil.value = director.veil;

    if (moving) {
      dirty = true;
      hqDone = false;
      lastMotion = now;
    }

    if (params.has('offscreen')) {
      // testitila: ei esitystä kanvaasille, kuvat luetaan __capture()-funktiolla
      hqDone = true;
      document.body.classList.add('ready');
      return;
    }

    if (dirty) {
      if (!director.active) placeCamera();
      fastPipeline.render();
      dirty = false;
      if (moving) adaptResolution(dt);
      if (firstFrame) {
        firstFrame = false;
        document.body.classList.add('ready');
        setTimeout(dismissHint, 7000);
      }
    } else if (!hqDone && now - lastMotion > 260 && controls.isIdle() && !params.has('nohq')) {
      placeCamera();
      hqPipeline.render();
      hqDone = true;
      window.__hqFrames = (window.__hqFrames || 0) + 1;
    }
  });

  applyFinish(finishIndex);
  new ResizeObserver(resize).observe(container);
  resize();

  // Testiapu / jaetut linkit: alkutila URL-parametreilla
  if (params.has('rot')) {
    const [x, y, z] = params.get('rot').split(',').map(Number);
    heroQuat.setFromEuler(new THREE.Euler(...[x, y, z].map(deg), 'YXZ'));
    ring.quaternion.copy(heroQuat);
  }
  if (params.has('zoom')) {
    view.zoom = Number(params.get('zoom'));
    controls.syncZoom();
  }
  if (params.has('pan')) {
    const [x, y, z] = params.get('pan').split(',').map(Number);
    view.pan.set(x, y, z);
  }
  // alkutila (ympäristö on jo renderöity oikealla studiolla)
  ui.setDark(startDark);
  applyTheme(startDark, false);
  if (!matchMode && params.get('sensors') !== '0') {
    setSensors(true);
    if (params.has('sensors')) sensors.level = 1; // testit: täysi kirkkaus heti
  }
  if (params.has('explode')) {
    setExplode(true, { fromSequence: true });
    exploder.g = 1;
    if (!params.has('rot')) ring.quaternion.copy(explodedQuat);
  }
  if (params.has('seq')) {
    startSequence(params.get('seq'));
    if (params.has('seqt')) {
      director.t = Number(params.get('seqt'));
      director.blend = null;
    }
  }

  // Testiapu: lukee lopullisen kuvan GPU:lta (headless-selaimissa WebGPU-kanvaasia ei voi kaapata).
  // WebGPU-luennassa rivit on tasattu 256 tavuun (viimeinen rivi ilman täytettä); WebGL: tiivis.
  const rowStride = (px, w, h) => {
    const padded = Math.ceil((w * 4) / 256) * 256;
    return px.length >= padded * (h - 1) + w * 4 && padded !== w * 4 ? padded : w * 4;
  };
  const poseCamera = () => {
    placeCamera();
    if (director.active) director.update(0);
    veil.value = director.veil;
  };
  window.__capture = async (hq = true) => {
    const w = Math.round(container.clientWidth * pixelRatio);
    const h = Math.round(container.clientHeight * pixelRatio);
    const rt = new THREE.RenderTarget(w, h, { depthBuffer: false });
    poseCamera();
    renderer.setRenderTarget(rt);
    (hq ? hqPipeline : fastPipeline).render();
    renderer.setRenderTarget(null);
    const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h);
    rt.dispose();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(w, h);
    const flip = !renderer.backend.isWebGPUBackend;
    const stride = rowStride(px, w, h);
    for (let y = 0; y < h; y++) {
      const src = (flip ? h - 1 - y : y) * stride;
      img.data.set(px.subarray(src, src + w * 4), y * w * 4);
    }
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  };

  // Testiapu: raakapassi ilman jälkikäsittelyä. mode 'refl' = heijastussuunta (maailma, 0.5 + 0.5·R),
  // 'id' = pinta-alue (punainen = värillinen ulkokehys, vihreä = titaanin sisäosa, sininen = muut).
  window.__captureDebug = async (mode) => {
    const w = Math.round(container.clientWidth * pixelRatio);
    const h = Math.round(container.clientHeight * pixelRatio);
    const rt = new THREE.RenderTarget(w, h, { depthBuffer: true });
    const mk = (c) => {
      const m = new THREE.MeshBasicNodeMaterial();
      // 'inward': pinnan normaalin suunta kohti akselia (1 = reiän sisäpinta, 0 = ulospäin)
      const inward = dot(normalLocal, normalize(vec3(positionLocal.x, positionLocal.y, 0)).negate()).mul(0.5).add(0.5);
      m.colorNode = mode === 'refl' ? reflectVector.mul(0.5).add(0.5) : mode === 'inward' ? vec3(inward) : vec3(...c);
      return m;
    };
    const saved = [];
    ring.traverse((o) => {
      if (!o.isMesh) return;
      saved.push([o, o.material]);
      o.material = o.userData.band ? [mk([1, 0, 0]), mk([0, 1, 0])] : mk([0, 0, 1]);
    });
    const bg = scene.backgroundNode;
    const tm = renderer.toneMapping;
    const cs = renderer.outputColorSpace;
    scene.backgroundNode = vec3(0);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    poseCamera();
    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h);
    for (const [o, m] of saved) o.material = m;
    scene.backgroundNode = bg;
    renderer.toneMapping = tm;
    renderer.outputColorSpace = cs;
    rt.dispose();
    const stride = rowStride(px, w, h);
    const flip = !renderer.backend.isWebGPUBackend;
    const out = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) out.set(px.subarray((flip ? h - 1 - y : y) * stride, (flip ? h - 1 - y : y) * stride + w * 4), y * w * 4);
    let bin = '';
    for (let i = 0; i < out.length; i += 0x8000) bin += String.fromCharCode.apply(null, out.subarray(i, i + 0x8000));
    return { w, h, data: btoa(bin) };
  };

  window.__viewer = {
    renderer,
    scene,
    camera,
    ring,
    view,
    stats: { vertices: 0 },
    backend: backendName,
    controls,
    exploder,
    director,
    sensors,
    ui,
    setExplode,
    setSensors,
    setDark,
    startSequence,
    get hqDone() {
      return hqDone;
    },
  };
  let verts = 0;
  ring.traverse((o) => {
    if (o.isMesh) verts += o.geometry.attributes.position.count;
  });
  window.__viewer.stats.vertices = verts;
}

main().catch((err) => {
  console.error(err);
  const el = $('error');
  el.textContent = 'Renderöinti ei käynnistynyt: ' + (err?.message || err);
  el.hidden = false;
  document.body.classList.add('ready');
});
