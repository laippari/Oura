import * as THREE from 'three/webgpu';
import { pass, renderOutput, screenUV, screenCoordinate, rand, vec2, vec3, vec4, float, length, smoothstep, mix, uniform } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ssaaPass } from 'three/addons/tsl/display/SSAAPassNode.js';

import { RING, SENSORS, FEATURES, FINISHES, VIEW } from './config.js';
import { buildProfile } from './geometry/profile.js';
import { buildBandGeometry } from './geometry/band.js';
import { buildRecessPatch, buildLens, buildLEDInternals, buildPDInternals } from './geometry/features.js';
import { createMaterials } from './materials.js';
import { createEnvironment, createBackgroundNode, createGround } from './studio.js';
import { InspectControls } from './controls.js';

const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

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
  scene.backgroundNode = createBackgroundNode();
  const envTexture = createEnvironment(renderer, params.has('lowenv') ? 256 : 512);
  scene.environment = envTexture;

  // --- Malli -----------------------------------------------------------------
  const profile = buildProfile(RING);
  const band = buildBandGeometry(profile, RING);
  const Ri = profile.innerRadius;
  const Ro = profile.outerRadius;
  const deg = THREE.MathUtils.degToRad;

  // Sensori-ikkunat: LEDit ±34°, fotodiodit ±60° (mitattu virallisista kuvista)
  const L = SENSORS.lens;
  const P = SENSORS.pocket;
  const windows = [];
  for (const sgn of [1, -1]) {
    windows.push({ kind: 'led', thetaC: sgn * deg(SENSORS.led.angleDeg), sgn, hA: L.halfLength, hB: L.halfWidth });
    windows.push({ kind: 'pd', thetaC: sgn * deg(SENSORS.pd.angleDeg), sgn, hA: L.halfLength, hB: L.halfWidth });
  }
  const pocketA = L.halfLength + P.margin;
  const pocketB = L.halfWidth + P.margin;
  const pocketR = L.corner + P.margin;
  const patchMargin = 0.28;
  const borePatches = windows.map((w) => ({ thetaC: w.thetaC, R: Ri, zc: 0, hA: pocketA, hB: pocketB, rc: pocketR, margin: patchMargin }));
  const F = FEATURES;
  borePatches.push({ thetaC: Math.PI, R: Ri, zc: 0, hA: F.pad.halfLength, hB: F.pad.halfWidth, rc: F.pad.corner, margin: patchMargin });
  const outerPatches = [{ thetaC: 0, R: Ro, zc: 0, hA: F.mark.halfLength, hB: F.mark.halfWidth, rc: F.mark.corner, margin: patchMargin }];

  const mats = createMaterials({ envTexture, profile, windows, outerPatches, borePatches });

  const ring = new THREE.Group();
  ring.name = 'Oura Ring 5';
  const bandMesh = new THREE.Mesh(band.geometry, [mats.outer, mats.inner]);
  bandMesh.name = 'band';
  bandMesh.castShadow = true;
  ring.add(bandMesh);

  const sOfBore = (z) => z;
  const sOfOuter = (z) => profile.sOuterMid - z;
  const add = (geo, mat, name) => {
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = true;
    ring.add(m);
    return m;
  };
  for (const w of windows) {
    add(
      buildRecessPatch({ surface: 'bore', R: Ri, thetaC: w.thetaC, hA: pocketA, hB: pocketB, rc: pocketR, margin: patchMargin, depth: P.depth, bevel: P.bevel, floorGap: 1, sOf: sOfBore, L: profile.length }),
      mats.innerPatch,
      w.kind + '-pocket'
    );
    const isLED = w.kind === 'led';
    const lens = add(
      buildLens({ R: Ri, thetaC: w.thetaC, hA: L.halfLength, hB: L.halfWidth, rc: L.corner, H: isLED ? SENSORS.led.height : SENSORS.pd.height, rr: isLED ? L.edgeRadiusLED : L.edgeRadiusPD, base: -P.depth }),
      mats.lens,
      w.kind + '-lens'
    );
    lens.renderOrder = 2;
    // dir = suunta kohti fotodiodia u-akselilla (LED) / poispäin keskilinjasta (PD)
    const dir = w.sgn;
    ring.add(isLED ? buildLEDInternals(Ri, w.thetaC, dir, mats.internals) : buildPDInternals(Ri, w.thetaC, dir, mats.internals));
  }
  add(
    buildRecessPatch({ surface: 'bore', R: Ri, thetaC: Math.PI, hA: F.pad.halfLength, hB: F.pad.halfWidth, rc: F.pad.corner, margin: patchMargin, depth: F.pad.depth, bevel: F.pad.bevel, floorMark: 1, sOf: sOfBore, L: profile.length }),
    mats.innerPatch,
    'inner-pad'
  );
  add(
    buildRecessPatch({ surface: 'outer', R: Ro, thetaC: 0, hA: F.mark.halfLength, hB: F.mark.halfWidth, rc: F.mark.corner, margin: patchMargin, depth: F.mark.depth, bevel: F.mark.bevel, floorMark: 0.5, sOf: sOfOuter, L: profile.length }),
    mats.outerPatch,
    'orientation-mark'
  );
  scene.add(ring);

  // --- Viimeistely (viralliset värit) -----------------------------------------
  let finishIndex = Math.max(0, FINISHES.findIndex((f) => f.id === (params.get('finish') || 'silver')));
  const applyFinish = (i) => {
    finishIndex = i;
    const f = FINISHES[i];
    mats.setFinish(f);
    document.querySelectorAll('#finishes button').forEach((b, k) => b.setAttribute('aria-pressed', k === i ? 'true' : 'false'));
    $('finish-name').textContent = f.name;
    requestRender?.();
  };

  // Lattia + kontaktivarjo
  const boundR = Math.hypot(profile.outerRadius, profile.halfWidth);
  const matchMode = params.has('match');
  const floorY = -(boundR + 1.6);
  const ground = createGround(floorY);
  scene.add(ground.group);
  if (matchMode) {
    ground.group.visible = false;
    scene.backgroundNode.plain.value = 1;
  }

  // --- Kamera ----------------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(VIEW.fov, 1, 0.1, 500);
  const elev = THREE.MathUtils.degToRad(VIEW.elevationDeg);
  const camDir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));
  // Studio kääntyy kameran kallistuksen mukana: alkunäkymän heijastukset vastaavat
  // virallisen tuotekuvan asetelmaa (vaakasuora kamera, sormus 43.5° kallistettuna).
  // (etumerkki +: three.js:n PMREM-näytteistys peilaa y-akselin ennen kiertoa)
  if (!matchMode) scene.environmentRotation.set(elev, 0, 0);
  const view = {
    zoom: 1,
    pan: new THREE.Vector3(),
    minZoom: VIEW.minZoom,
    maxZoom: VIEW.maxZoom,
    fitDistance: 80,
    getVisibleHeight(z) {
      return 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * this.fitDistance * z;
    },
  };
  const placeCamera = () => {
    if (matchMode) {
      // Vertailutila: kamera täsmälleen Ouran virallisen tuotekuvan asennossa (sovitettu siluettiin)
      camera.fov = 9.4157;
      camera.position.set(0, 0, 187.21);
      camera.up.set(0, 1, 0);
      camera.lookAt(0, 0, 0);
      camera.near = 150;
      camera.far = 230;
      // kuvakeskipisteen siirto (sovituksen cx, cy 1000 px kuvassa) – ei sormuksen siirtoa 3D:ssä
      camera.setViewOffset(1000, 1000, 500 - 499.7783, 500 - 541.2199, 1000, 1000);
      camera.updateProjectionMatrix();
      return;
    }
    const dist = view.fitDistance * view.zoom;
    camera.position.copy(view.pan).addScaledVector(camDir, dist);
    camera.lookAt(view.pan);
    camera.near = Math.max(0.05, dist * 0.02);
    camera.far = dist + 250;
    camera.updateProjectionMatrix();
  };

  // Sankariasento: kolmen neljäsosan näkymä, sensorit näkyvät renkaan sisällä
  const heroQuat = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(...VIEW.heroEuler.map((d) => THREE.MathUtils.degToRad(d)), 'YXZ')
  );
  ring.quaternion.copy(heroQuat);
  if (matchMode) {
    ring.quaternion.setFromEuler(new THREE.Euler(0.75705, 0.00076, 0, 'YXZ'));
    if (params.has('mask')) {
      // Ääriviivavalidointi: valkoinen siluetti mustalla taustalla
      scene.overrideMaterial = new THREE.MeshBasicNodeMaterial({ color: 0xffffff });
      scene.backgroundNode = vec3(0);
    }
  }

  // --- Jälkikäsittely ---------------------------------------------------------
  const vignetteAmount = uniform(matchMode ? 0 : 1);
  const finish = (colorNode) => {
    const glow = bloom(colorNode, 0.1, 0.35, 1.2);
    const d = length(screenUV.sub(vec2(0.5)).mul(vec2(1.0, 1.15)));
    const vignette = mix(float(1), mix(float(1), float(0.86), vignetteAmount), smoothstep(0.35, 0.95, d));
    const graded = colorNode.rgb.add(glow.rgb).mul(vignette);
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

  // --- Resoluutio -----------------------------------------------------------
  const maxPR = Math.min(window.devicePixelRatio || 1, params.has('pr') ? Number(params.get('pr')) : 2);
  let pixelRatio = maxPR;
  const resize = () => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const fitR = boundR * VIEW.fitMargin;
    const vHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * camera.aspect);
    view.fitDistance = Math.max(fitR / Math.tan(vHalf), fitR / Math.tan(hHalf));
    placeCamera();
    requestRender();
  };

  // --- Ohjaus ----------------------------------------------------------------
  let autoRotate = !params.has('still') && !matchMode;
  let resetAnim = null;
  const hint = $('hint');
  const dismissHint = () => hint.classList.add('hidden');

  const controls = new InspectControls(renderer.domElement, {
    object: ring,
    camera,
    view,
    onInteract: () => {
      autoRotate = false;
      resetAnim = null;
      dismissHint();
      requestRender();
    },
    onReset: () => {
      resetAnim = {
        t: 0,
        q0: ring.quaternion.clone(),
        p0: ring.position.clone(),
        pan0: view.pan.clone(),
        z0: view.zoom,
      };
    },
  });
  controls.minFloorY = floorY + boundR + 0.3;

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
  const tmpQ = new THREE.Quaternion();
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

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

  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    let moving = controls.update(dt);

    if (resetAnim) {
      resetAnim.t = Math.min(1, resetAnim.t + dt / 0.9);
      const k = ease(resetAnim.t);
      ring.quaternion.slerpQuaternions(resetAnim.q0, heroQuat, k);
      ring.position.lerpVectors(resetAnim.p0, new THREE.Vector3(), k);
      view.pan.lerpVectors(resetAnim.pan0, new THREE.Vector3(), k);
      view.zoom = resetAnim.z0 + (1 - resetAnim.z0) * k;
      controls.syncZoom();
      if (resetAnim.t >= 1) {
        resetAnim = null;
        autoRotate = true;
      }
      moving = true;
    } else if (autoRotate) {
      tmpQ.setFromAxisAngle(yAxis, dt * 0.24);
      ring.quaternion.premultiply(tmpQ);
      moving = true;
    }

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
      placeCamera();
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

  // Värivalitsin
  const bar = $('finishes');
  FINISHES.forEach((f, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = 'finish-' + f.id;
    b.title = f.name;
    b.setAttribute('aria-label', f.name);
    b.style.setProperty('--sw-a', f.swatch[0]);
    b.style.setProperty('--sw-b', f.swatch[1]);
    if (f.brushed) b.classList.add('brushed');
    b.addEventListener('click', () => applyFinish(i));
    bar.appendChild(b);
  });
  applyFinish(finishIndex);

  new ResizeObserver(resize).observe(container);
  resize();

  // Testiapu: näkymän ohjaus URL-parametreilla (?rot=x,y,z&zoom=…)
  if (params.has('rot')) {
    const [x, y, z] = params.get('rot').split(',').map(Number);
    heroQuat.setFromEuler(new THREE.Euler(...[x, y, z].map((d) => THREE.MathUtils.degToRad(d)), 'YXZ'));
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

  // Testiapu: lukee lopullisen kuvan GPU:lta (headless-selaimissa WebGPU-kanvaasia ei voi kaapata).
  window.__capture = async (hq = true) => {
    const w = Math.round(container.clientWidth * pixelRatio);
    const h = Math.round(container.clientHeight * pixelRatio);
    const rt = new THREE.RenderTarget(w, h, { depthBuffer: false });
    placeCamera();
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
    const stride = Math.floor(px.length / h / 4) * 4; // WebGPU: rivit tasataan 256 tavuun
    for (let y = 0; y < h; y++) {
      const src = (flip ? h - 1 - y : y) * stride;
      img.data.set(px.subarray(src, src + w * 4), y * w * 4);
    }
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    ctx.putImageData(img, 0, 0);
    return c.toDataURL('image/png');
  };

  window.__viewer = {
    renderer,
    scene,
    camera,
    ring,
    view,
    stats: band.stats,
    backend: backendName,
    controls,
    get hqDone() {
      return hqDone;
    },
  };
}

main().catch((err) => {
  console.error(err);
  const el = $('error');
  el.textContent = 'Renderöinti ei käynnistynyt: ' + (err?.message || err);
  el.hidden = false;
  document.body.classList.add('ready');
});
