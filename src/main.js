import * as THREE from 'three/webgpu';
import { pass, renderOutput, screenUV, screenCoordinate, rand, vec2, vec3, vec4, float, length, smoothstep, mix } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { ssaaPass } from 'three/addons/tsl/display/SSAAPassNode.js';

import { RING, SENSORS, VIEW } from './config.js';
import { buildProfile } from './geometry/profile.js';
import { buildBandGeometry } from './geometry/band.js';
import { createSensorModel, createSensorInternals } from './geometry/sensors.js';
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
  const mats = createMaterials({ envTexture, profile, sensorCfg: SENSORS });

  const ring = new THREE.Group();
  ring.name = 'Oura Ring 5';
  const bandMesh = new THREE.Mesh(band.geometry, [mats.outer, mats.inner]);
  bandMesh.name = 'titanium-band';
  bandMesh.castShadow = true;
  ring.add(bandMesh);

  const sensor = createSensorModel(profile, SENSORS);
  for (const sgn of [1, -1]) {
    const th = sgn * SENSORS.angle;
    const dome = new THREE.Mesh(sensor.domeGeometry(th), mats.dome);
    dome.name = 'sensor-dome';
    dome.castShadow = true;
    dome.renderOrder = 2;
    const gap = new THREE.Mesh(sensor.footprintRing(th, 0.992, 1.065, 0.0035), mats.gasket);
    const floor = new THREE.Mesh(sensor.footprintRing(th, 0, 0.995, 0.05), mats.pcb);
    const internals = createSensorInternals(sensor, th, -sgn, mats.internals);
    ring.add(dome, gap, floor, internals);
  }
  scene.add(ring);

  // Lattia + kontaktivarjo
  const boundR = Math.hypot(profile.outerRadius, profile.halfWidth);
  const floorY = -(boundR + 1.6);
  const ground = createGround(floorY);
  scene.add(ground.group);

  // --- Kamera ----------------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(VIEW.fov, 1, 0.1, 500);
  const elev = THREE.MathUtils.degToRad(VIEW.elevationDeg);
  const camDir = new THREE.Vector3(0, Math.sin(elev), Math.cos(elev));
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

  // --- Jälkikäsittely ---------------------------------------------------------
  const finish = (colorNode) => {
    const glow = bloom(colorNode, 0.14, 0.38, 0.9);
    const d = length(screenUV.sub(vec2(0.5)).mul(vec2(1.0, 1.15)));
    const vignette = mix(float(1), float(0.82), smoothstep(0.35, 0.95, d));
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
  let autoRotate = !params.has('still');
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
