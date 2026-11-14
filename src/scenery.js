import * as THREE from 'three/webgpu';
import {
  Fn,
  float,
  vec2,
  vec3,
  uniform,
  texture,
  pmremTexture,
  positionWorld,
  positionLocal,
  normalWorld,
  cameraPosition,
  normalize,
  dot,
  max,
  mix,
  pow,
  sin,
  cos,
  exp,
  exp2,
  abs,
  length,
  smoothstep,
  clamp,
  select,
  atan,
  asin,
  floor,
  fract,
  reflector,
  bumpMap,
  triplanarTexture,
  uv,
  lights,
} from 'three/tsl';

// ---------------------------------------------------------------------------------------------
// Scenery backdrops: places the ring can be shown in, besides the product studio.
//
//   Dusk   a lake shore after sunset: the ring hovers over a wet stone, still water around it
//          mirrors the evening sky, reeds stand out of focus further back.
//   Stone  pale natural stone in late-afternoon sun, with the soft moving shadow of leaves.
//   Still  the dark studio over black water: the ring and its sensor light mirrored in a
//          surface that slow rings of ripples keep alive.
//
// How they are put together
//   • The camera of this viewer never orbits the world — the ring turns, the camera only moves
//     in and out — so a backdrop is a stage set seen from the front, close up.
//   • Light: each outdoor scene has a photographed sky (Poly Haven, CC0) stored as a small JPEG
//     plus a gain map (radiance = image × 2^(gain × stops)). Below the horizon the map is
//     completed with what the set implies — the mirrored sky for water, lit stone for stone —
//     and prefiltered once. That map lights the ring (materials.js: light.setMap) and, blurred,
//     is the visible far background: a far background out of focus, as in a macro photograph.
//   • Water is a planar mirror (three's reflector) with travelling ripples: it reflects the
//     ring, the set and the sky, weighted by Fresnel.
//   • Everything is loaded and built the first time a backdrop is chosen.
// ---------------------------------------------------------------------------------------------

const TAU = Math.PI * 2;
const deg = THREE.MathUtils.degToRad;

export const BACKDROPS = [
  { id: 'light', name: 'Light', theme: 0, ui: 'light' },
  { id: 'dark', name: 'Dark', theme: 1, ui: 'dark' },
  { id: 'white', name: 'White', theme: 0, ui: 'light', scene: true },
  { id: 'black', name: 'Black', theme: 1, ui: 'dark', scene: true },
  { id: 'dusk', name: 'Dusk', theme: 0, ui: 'dark', scene: true },
  { id: 'stone', name: 'Stone', theme: 0, ui: 'light', scene: true },
  { id: 'still', name: 'Still', theme: 1, ui: 'dark', scene: true },
];

// What each scenery backdrop asks of the viewer (main.js applies these).
//   elevation  camera elevation in the interactive view (degrees)
//   far        far plane (mm): the sets reach much further than the studio floor
//   shadow     opacity of the soft contact shadow under the ring (0 = none)
//   interior   light inside the bore: [gain, fill0, fill1] (see InteriorReflectionNode)
//   gain       exposure of the scene's light on the ring
//   blur       how far out of focus the far background is (prefilter level)
//   distance   how much further back the camera stands than in the studio: on a phone the ring
//              fills the width of the picture, and a place needs room around it to be seen
//   aim        the camera looks this far (mm) above (+) or below (−) the centre of the ring
//   rims       strength of the studio's two rim lights (only with a light of its own)
//   paper      the plain background behind the ring: [centre, edge] (linear RGB)
//   bloom      strength of the glow around the brightest highlights (default 0.1)
const LOOKS = {
  white: { elevation: 10, distance: 1, far: 0, shadow: 0.2, interior: [1.6, 0.34, 0.6], gain: 1.0, blur: 0, rims: 0, bloom: 0.06, paper: [[0.93, 0.93, 0.925], [0.8, 0.8, 0.795]], themeColor: '#f1f1ef' },
  black: { elevation: 10, distance: 1, far: 0, shadow: 0.6, interior: [1.1, 0.05, 0.12], gain: 1.0, blur: 0, rims: 0.3, bloom: 0.035, paper: [[0.012, 0.012, 0.012], [0.0, 0.0, 0.0]], themeColor: '#000000' },
  dusk: { elevation: 5, distance: 1.32, far: 4000, shadow: 0, interior: [1.1, 0.05, 0.12], gain: 1.45, blur: 0.09, themeColor: '#191a24' },
  stone: { elevation: 13, distance: 1.15, far: 4000, shadow: 0, interior: [1.2, 0.2, 0.4], gain: 1.0, blur: 0.16, themeColor: '#cfc6b8' },
  still: { elevation: 9, distance: 1.22, aim: -6, far: 2500, shadow: 0, interior: [1.0, 0.015, 0.045], gain: 1.0, blur: 0.035, themeColor: '#0b0a0a' },
};

const noLights = lights([]);

// --- small deterministic helpers ---------------------------------------------------------------

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// smooth 3D value noise in [-1, 1]
function makeNoise(seed) {
  const hash = (x, y, z) => {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647) + seed * 144665) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 2147483648 - 1;
  };
  const fade = (t) => t * t * (3 - 2 * t);
  return (x, y, z) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const zi = Math.floor(z);
    const u = fade(x - xi);
    const v = fade(y - yi);
    const w = fade(z - zi);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
      l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v),
      w
    );
  };
}

function loadTexture(url, { srgb = false, repeat = false, mip = true } = {}) {
  return new THREE.TextureLoader().loadAsync(url).then((t) => {
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.generateMipmaps = mip;
    t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    t.anisotropy = mip ? 8 : 1;
    return t;
  });
}

// --- sky → prefiltered environment -------------------------------------------------------------

// Radiance of a stored sky in direction d (JPEG × gain map), turned by `turn` (fraction of a
// full circle) about the vertical.
function skyRadiance(sky, d, turn) {
  const st = vec2(atan(d.x, d.z).div(TAU).add(0.5 + turn), asin(clamp(d.y, -1, 1)).div(Math.PI).add(0.5));
  return texture(sky.base, st).level(0).rgb.mul(exp2(texture(sky.gain, st).level(0).r.mul(sky.stops)));
}

// The far shore of the lake: a low, uneven dark band on the horizon.
function shoreMask(d) {
  const az = atan(d.x, d.z);
  const top = float(0.02).add(sin(az.mul(7).add(1.3)).mul(0.008)).add(sin(az.mul(19).add(0.4)).mul(0.005)).add(sin(az.mul(47)).mul(0.003));
  return float(1).sub(smoothstep(top.sub(0.004), top.add(0.004), abs(d.y)));
}

// Schlick reflectance of still water seen at the given cosine to its normal
const waterFresnel = (c) => float(0.02).add(float(0.98).mul(pow(float(1).sub(clamp(c, 0, 1)), 5)));

function prefilter(renderer, colorOf, size) {
  const scene = new THREE.Scene();
  const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide });
  mat.colorNode = colorOf(positionWorld.normalize());
  const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 128, 64), mat);
  scene.add(dome);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0, 0.1, 100, { size });
  dome.geometry.dispose();
  mat.dispose();
  pmrem.dispose();
  return rt.texture;
}

// --- water --------------------------------------------------------------------------------------

// A horizontal mirror with ripples. `waves`: [direction°, wavelength mm, speed mm/s, height mm].
// `drops` > 0 adds that many slow rings spreading from points that move on after each ring.
// The surface shows deep colour and the mirror image (ring, set, sky), mixed by Fresnel.
function createWater({ radius, waves, drops = 0, deep, mirror = 1, sheen = null, clock }) {
  const refl = reflector({ resolutionScale: 0.5 });
  const p = vec2(positionWorld.x, positionWorld.z);
  const dist = length(positionWorld.sub(cameraPosition));

  const slope = Fn(() => {
    const s = vec2(0, 0).toVar();
    for (const [dirDeg, len, speed, height] of waves) {
      const k = TAU / len;
      const dx = Math.cos(deg(dirDeg));
      const dz = Math.sin(deg(dirDeg));
      const phase = p.x.mul(dx * k).add(p.y.mul(dz * k)).sub(clock.mul(speed * k));
      s.addAssign(vec2(dx, dz).mul(cos(phase).mul(height * k)));
    }
    for (let i = 0; i < drops; i++) {
      const period = 5.2 + i * 1.7;
      const turn = clock.div(period).add(i * 0.37);
      const n = floor(turn);
      const age = fract(turn).mul(period); // seconds since this ring started
      // a new place for every ring, in a band around (not under) the ring
      const a = fract(sin(n.mul(12.9898).add(i * 78.233)).mul(43758.5453)).mul(TAU);
      const r0 = fract(sin(n.mul(39.3468).add(i * 11.135)).mul(24634.6345)).mul(46).add(26);
      const c = vec2(cos(a).mul(r0), sin(a).mul(r0).mul(0.8).sub(10));
      const q = p.sub(c);
      const r = length(q).add(1e-3);
      const front = age.mul(11); // mm/s
      // (squares written out: pow() of a negative base is undefined on the GPU)
      const off = r.sub(front).div(5.5);
      const life = float(1).sub(age.div(period));
      const env = exp(off.mul(off).negate()).mul(life.mul(life)).mul(smoothstep(0, 0.5, age));
      s.addAssign(q.div(r).mul(cos(r.sub(front).mul(TAU / 4.2)).mul(env).mul(0.32)));
    }
    // far ripples are smaller than a pixel: let them fade instead of shimmering
    return s.div(float(1).add(dist.div(420).pow(2)));
  })();

  const n = normalize(vec3(slope.x.negate(), 1, slope.y.negate()));
  const view = normalize(cameraPosition.sub(positionWorld));
  const f = waterFresnel(dot(n, view));
  refl.uvNode = refl.uvNode.add(slope.mul(vec2(1, -1)).mul(float(14).div(dist.add(40))));

  const mat = new THREE.MeshBasicNodeMaterial();
  let color = mix(deep, refl.rgb.mul(mirror), f);
  if (sheen) color = color.add(sheen(n, view, f));
  mat.colorNode = color;
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 72), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.add(refl.target);
  mesh.name = 'water';
  return mesh;
}

// --- rocks --------------------------------------------------------------------------------------

// A water-worn stone: a sphere pushed around by a few octaves of noise, optionally with a
// nearly flat top (y = 0 is the top; the stone hangs below it).
function rockGeometry(seed, [sx, sy, sz], { flat = 0, bumps = 1 } = {}) {
  const noise = makeNoise(seed);
  const geo = new THREE.SphereGeometry(1, 112, 72);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    // squarer than a sphere, then uneven
    const box = (c) => Math.sign(c) * Math.pow(Math.abs(c), 0.82);
    let r = 1 + bumps * (0.16 * noise(v.x * 1.4 + 3, v.y * 1.4, v.z * 1.4) + 0.07 * noise(v.x * 3.3, v.y * 3.3 + 7, v.z * 3.3) + 0.025 * noise(v.x * 8, v.y * 8, v.z * 8 + 2));
    let x = box(v.x) * r * sx;
    let y = box(v.y) * r * sy;
    let z = box(v.z) * r * sz;
    if (flat > 0) {
      // press the crown down to a gently domed table
      const top = sy * (1 - flat);
      if (y > top) y = top + (y - top) * 0.1;
      y -= top + (sy - top) * 0.1 * 1.25;
    } else {
      y -= sy;
    }
    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

// --- reeds --------------------------------------------------------------------------------------

// Reeds drawn soft, as they look far out of focus; `soft` = how far (1 = sharpest).
function reedTexture(seed, soft) {
  const W = 256;
  const H = 512;
  const sharp = document.createElement('canvas');
  sharp.width = W;
  sharp.height = H;
  const g = sharp.getContext('2d');
  const rnd = rng(seed);
  g.lineCap = 'round';
  const blades = 9 + Math.floor(rnd() * 5);
  for (let i = 0; i < blades; i++) {
    const x0 = W * (0.3 + 0.4 * rnd());
    const lean = (rnd() - 0.5) * 0.9;
    const h = H * (0.5 + 0.48 * rnd());
    const x1 = x0 + lean * h * 0.55;
    const cx = x0 + lean * h * 0.1;
    const tone = 0.55 + 0.45 * rnd();
    const steps = 26;
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps;
      const t1 = (k + 1) / steps;
      const at = (t) => [(1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1, H - 4 - t * h];
      const [ax, ay] = at(t0);
      const [bx, by] = at(t1);
      // dark at the waterline, catching a little of the evening light toward the tip
      const lit = 0.25 + 0.75 * t0;
      g.strokeStyle = `rgb(${Math.round(70 * tone * lit + 18)}, ${Math.round(62 * tone * lit + 16)}, ${Math.round(38 * tone * lit + 14)})`;
      g.lineWidth = (5.2 - 4.2 * t0) * (0.7 + 0.5 * tone);
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
    }
    if (rnd() < 0.45) {
      // seed head
      g.fillStyle = 'rgb(58, 44, 32)';
      g.save();
      g.translate(x1, H - 4 - h);
      g.rotate(lean * 0.6);
      g.beginPath();
      g.ellipse(0, 10, 3.6, 17, 0, 0, TAU);
      g.fill();
      g.restore();
    }
  }
  // out of focus: through a small copy and back (works in every browser, unlike canvas filters)
  const small = document.createElement('canvas');
  small.width = Math.max(8, Math.round(W / soft));
  small.height = Math.max(16, Math.round(H / soft));
  const gs = small.getContext('2d');
  gs.imageSmoothingQuality = 'high';
  gs.drawImage(sharp, 0, 0, small.width, small.height);
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const go = out.getContext('2d');
  go.imageSmoothingQuality = 'high';
  go.drawImage(small, 0, 0, W, H);
  const tex = new THREE.CanvasTexture(out);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// --- leaf shadows ---------------------------------------------------------------------------------

// Sunlight through leaves: white where the sun gets through, with soft edges. Tiles.
function leafShadowTexture(seed) {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, S, S);
  const rnd = rng(seed);
  g.fillStyle = '#000';
  const leaf = (x, y, len, wid, ang) => {
    for (const ox of [-S, 0, S]) {
      for (const oy of [-S, 0, S]) {
        g.save();
        g.translate(x + ox, y + oy);
        g.rotate(ang);
        g.beginPath();
        g.moveTo(0, 0);
        g.bezierCurveTo(len * 0.3, -wid, len * 0.75, -wid * 0.8, len, 0);
        g.bezierCurveTo(len * 0.75, wid * 0.8, len * 0.3, wid, 0, 0);
        g.fill();
        g.restore();
      }
    }
  };
  // a few sprays: leaves in pairs along a stem
  for (let s = 0; s < 5; s++) {
    let x = rnd() * S;
    let y = rnd() * S;
    let ang = rnd() * TAU;
    const n = 5 + Math.floor(rnd() * 4);
    for (let i = 0; i < n; i++) {
      const len = 78 + rnd() * 50;
      const wid = len * (0.2 + rnd() * 0.08);
      leaf(x, y, len, wid, ang + 0.75 + (rnd() - 0.5) * 0.3);
      leaf(x, y, len * 0.92, wid, ang - 0.75 + (rnd() - 0.5) * 0.3);
      g.lineWidth = 5;
      g.strokeStyle = '#000';
      const nx = x + Math.cos(ang) * 46;
      const ny = y + Math.sin(ang) * 46;
      for (const ox of [-S, 0, S]) {
        for (const oy of [-S, 0, S]) {
          g.beginPath();
          g.moveTo(x + ox, y + oy);
          g.lineTo(nx + ox, ny + oy);
          g.stroke();
        }
      }
      x = (nx + S) % S;
      y = (ny + S) % S;
      ang += (rnd() - 0.5) * 0.5;
    }
  }
  // penumbra: three box blurs, wrapping at the edges
  const img = g.getImageData(0, 0, S, S);
  let a = new Float32Array(S * S);
  let b = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) a[i] = img.data[i * 4] / 255;
  const R = 4;
  for (let pass = 0; pass < 3; pass++) {
    for (const horizontal of [true, false]) {
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          let sum = 0;
          for (let k = -R; k <= R; k++) sum += horizontal ? a[y * S + ((x + k + S) % S)] : a[((y + k + S) % S) * S + x];
          b[y * S + x] = sum / (2 * R + 1);
        }
      }
      [a, b] = [b, a];
    }
  }
  for (let i = 0; i < S * S; i++) {
    const v = Math.round(a[i] * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// --- the backdrops --------------------------------------------------------------------------------

export function createScenery({ renderer, scene, mats, floorY, envSize = 512, assets = 'assets/', tilt = 0 }) {
  const clock = uniform(0); // seconds, runs while a scenery backdrop is shown
  const root = new THREE.Group();
  root.name = 'scenery';
  scene.add(root);
  // set coordinates: world position without the drop of the floor in the exploded view
  const drop = uniform(0);
  const P = positionWorld.sub(vec3(0, drop, 0));

  const sky = (name, stops) =>
    Promise.all([loadTexture(`${assets}${name}.jpg`, { srgb: true, repeat: true, mip: false }), loadTexture(`${assets}${name}_gain.png`, { repeat: true, mip: false })]).then(([base, gain]) => ({ base, gain, stops }));

  // ---- White / Black: the lighting of Oura's own product picture ----
  // Oura lights each colour of the ring differently. Silver (which the Light and Dark studio
  // was reconstructed from) is lit fairly evenly; Deep Rose gets a far more sculpted light: a
  // very large, bright softbox above and behind, flags that keep the back corners dark, a small
  // box low at the front right, and a dark floor. This map is that light, read off the official
  // Deep Rose picture direction by direction (tools/build_showroom.py). It is given in the
  // frame of that picture, whose camera is level; here the camera looks down by `tilt`, so the
  // map is tipped with it and the ring's usual pose shows what the picture shows.
  // The two backdrops share the map and have no set: White and Black are only the paper.
  let showroom = null;
  const buildShowroom = () => {
    showroom ||= sky('showroom', 2).then((S) => {
      const c = Math.cos(tilt);
      const sn = Math.sin(tilt);
      return prefilter(renderer, (d) => vec3(skyRadiance(S, vec3(d.x, d.y.mul(c).sub(d.z.mul(sn)), d.y.mul(sn).add(d.z.mul(c))), 0).r), envSize);
    });
    return showroom.then((env) => ({ group: new THREE.Group(), env, backdrop: null, still: true }));
  };

  // ---- Dusk: lake shore after sunset ----
  // On a phone the picture is tall and narrow and the ring fills most of its width, so the
  // place shows above the ring (far shore, afterglow, reed tips), through it (water running
  // back) and below it (the stone, the near water). Everything is placed for those windows.
  async function buildDusk() {
    const [S, rockD, rockH] = await Promise.all([sky('sky_dusk', 4.2), loadTexture(`${assets}rock_d.jpg`, { srgb: true, repeat: true }), loadTexture(`${assets}rock_h.jpg`, { repeat: true })]);
    const turn = 0.532; // the sun has set a little to the left: warm from that side, blue-violet ahead
    const exposure = 0.6; // evening
    const deep = vec3(0.006, 0.009, 0.013);
    const far = (d) => mix(skyRadiance(S, d, turn).mul(exposure), vec3(0.006, 0.007, 0.008), shoreMask(d));
    const env = prefilter(
      renderer,
      (d) => {
        const above = far(vec3(d.x, abs(d.y), d.z));
        // below the horizon: the lake, mirroring the sky
        return select(d.y.greaterThan(0), above, mix(deep, above, waterFresnel(abs(d.y)).mul(0.92).add(0.06)));
      },
      envSize
    );

    const group = new THREE.Group();
    const waterY = floorY - 6;
    const water = createWater({
      radius: 1400,
      deep,
      clock,
      waves: [
        [18, 46, 5.5, 0.12],
        [-52, 27, 4.2, 0.06],
        [74, 15, 3.4, 0.024],
        [140, 80, 6.5, 0.2],
        [-115, 8.5, 2.6, 0.01],
      ],
    });
    water.position.y = waterY;
    group.add(water);

    // stones: granite worn smooth, dark and glossy where the water reaches
    const rockMat = new THREE.MeshStandardNodeMaterial({ metalness: 0 });
    rockMat.lightsNode = noLights;
    rockMat.envNode = mats.light.envNode();
    const scale = float(1 / 40);
    const wet = smoothstep(waterY + 7, waterY + 1.2, P.y).mul(0.7).add(0.3);
    // the ring keeps the sky off the stone beneath it: a soft occlusion on the surfaces that face up
    const shade = float(1).sub(exp(dot(P.xz, P.xz).div(-150)).mul(smoothstep(0.5, 0.95, normalWorld.y)).mul(0.5));
    rockMat.colorNode = triplanarTexture(texture(rockD), null, null, scale, P, normalWorld).rgb.mul(vec3(0.84, 0.87, 0.96)).mul(mix(float(0.8), float(0.3), wet)).mul(shade);
    rockMat.roughnessNode = mix(float(0.66), float(0.13), wet);
    rockMat.normalNode = bumpMap(triplanarTexture(texture(rockH), null, null, scale, P, normalWorld).r, float(0.8));
    const stone = (seed, size, x, y, z, turnY, opts) => {
      const m = new THREE.Mesh(rockGeometry(seed, size, opts), rockMat);
      m.position.set(x, y, z);
      m.rotation.y = turnY;
      group.add(m);
      return m;
    };
    stone(11, [23, 11, 18], 1, floorY - 0.2, -1, 0.25, { flat: 0.5 }); // the one under the ring
    stone(23, [6.5, 4, 5.5], -29, waterY + 2.6, 15, 1.1);
    stone(47, [4.5, 3, 4], 27, waterY + 1.7, 21, 0.4);
    stone(31, [15, 8, 11], 24, waterY + 5, -78, 2.2);
    stone(53, [21, 10, 15], -38, waterY + 6.5, -150, 0.9);
    stone(61, [10, 5, 8], 14, waterY + 3, -215, 2.9);
    stone(67, [36, 14, 26], 62, waterY + 9, -330, 0.3);
    stone(71, [30, 12, 22], -120, waterY + 8, -210, 1.7);

    // reeds, out of focus: [x, z, width, height, softness, seed]
    const tint = vec3(0.62, 0.56, 0.52);
    for (const [x, z, w, h, soft, seed] of [
      [-27, -165, 36, 70, 4.5, 3],
      [31, -250, 46, 92, 6, 5],
      [-50, -360, 64, 118, 7.5, 8],
      [58, -470, 80, 140, 9, 9],
      [-110, -240, 70, 120, 6, 4],
      [128, -330, 90, 150, 7.5, 7],
    ]) {
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
      const t = texture(reedTexture(seed, soft), uv());
      m.colorNode = t.rgb.mul(tint);
      m.opacityNode = t.a;
      // a slow sway in the evening air, more toward the tips
      m.positionNode = positionLocal.add(vec3(sin(clock.mul(0.55).add(seed * 1.7)).mul(uv().y.pow(2)).mul(h * 0.018), 0, 0));
      const card = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 8), m);
      card.position.set(x, waterY + h / 2 - 2, z);
      card.renderOrder = 1;
      group.add(card);
    }
    return { group, env };
  }

  // ---- Stone: pale stone in late sun, leaf shadows ----
  async function buildStone() {
    const [S, stoneD, stoneH] = await Promise.all([sky('sky_day', 8.8), loadTexture(`${assets}stone_d.jpg`, { srgb: true, repeat: true }), loadTexture(`${assets}stone_h.jpg`, { repeat: true })]);
    const sunAz = deg(-157); // from behind, a little to the left: shadows fall toward the viewer
    const sunEl = deg(19.2);
    const turn = 0.6 - 0.5 - sunAz / TAU;
    const sunDir = new THREE.Vector3(Math.sin(sunAz) * Math.cos(sunEl), Math.sin(sunEl), Math.cos(sunAz) * Math.cos(sunEl));
    const litStone = vec3(0.7, 0.62, 0.51); // what the sunlit slab sends back up
    const env = prefilter(
      renderer,
      (d) => {
        // a clear sky tints polished metal blue; as on a set with diffusers, most of that is taken out
        const blue = skyRadiance(S, vec3(d.x, abs(d.y), d.z), turn);
        const grey = dot(blue, vec3(0.2126, 0.7152, 0.0722));
        return mix(litStone, mix(vec3(grey), blue, 0.45).mul(vec3(1.04, 1.0, 0.95)), smoothstep(-0.03, 0.03, d.y));
      },
      envSize
    );

    const group = new THREE.Group();
    const dist = length(positionWorld.sub(cameraPosition));
    // the slab goes out of focus with distance: softer texture, flatter relief, then one tone
    const soft = clamp(dist.sub(230).div(150), 0, 5);
    const farK = smoothstep(500, 1700, dist);
    const p = vec2(P.x, P.z);
    const st = p.div(170);
    const st2 = vec2(p.x.mul(0.62).add(p.y.mul(0.78)), p.y.mul(0.62).sub(p.x.mul(0.78))).div(71).add(0.37);
    const slabMat = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 0.82 });
    // the scanned stone, lifted to a pale limestone and evened out a little
    const scan = texture(stoneD, st).bias(soft).rgb.mul(0.62).add(texture(stoneD, st2).bias(soft).rgb.mul(0.38));
    const albedo = mix(vec3(0.63, 0.58, 0.51), scan.mul(vec3(2.0, 1.92, 1.8)), 0.62);
    slabMat.colorNode = mix(albedo, vec3(0.63, 0.58, 0.51), farK);
    slabMat.normalNode = bumpMap(texture(stoneH, st).r.mul(0.7).add(texture(stoneH, st2).r.mul(0.3)), float(1.1).mul(float(1).sub(clamp(soft.div(2.5), 0, 1))));
    slabMat.envNode = vec3(0.3, 0.36, 0.47); // skylight: cool shadows against the warm sun

    // the sun, through leaves: the light itself carries the leaf pattern, so it lands on the
    // slab as moving shade while the ring's own shadow comes from the shadow map
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    const leaves = leafShadowTexture(5);
    const along = vec2(Math.sin(sunAz), Math.cos(sunAz));
    // (a low sun draws shadows out along its own direction; kept milder than the true 3×, so
    // that they still read as leaves)
    const guv = vec2(dot(p, along).mul(0.6), dot(p, vec2(along.y, along.x.negate())))
      .div(165)
      .add(vec2(sin(clock.mul(0.42)).mul(0.012).add(sin(clock.mul(1.07).add(1)).mul(0.004)), cos(clock.mul(0.36)).mul(0.008)))
      .add(vec2(0.31, 0.12));
    const shade = mix(float(0.1), float(1), texture(leaves, guv).bias(soft.mul(0.8)).r);
    sun.colorNode = vec3(9.4, 8.3, 6.8).mul(shade); // irradiance; a matte surface returns 1/π of it
    sun.position.copy(sunDir).multiplyScalar(90).add(new THREE.Vector3(0, floorY, 0));
    sun.target.position.set(0, floorY, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const e = 30;
    Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 20, far: 220 });
    sun.shadow.radius = 9;
    sun.shadow.blurSamples = 16;
    sun.shadow.bias = -0.0004;
    slabMat.lightsNode = lights([sun]);
    group.add(sun, sun.target);

    const slab = new THREE.Mesh(new THREE.CircleGeometry(3000, 96), slabMat);
    slab.rotation.x = -Math.PI / 2;
    slab.position.y = floorY;
    slab.receiveShadow = true;
    group.add(slab);
    return { group, env };
  }

  // ---- Still: the dark studio over black water ----
  // The ring keeps the dark studio's light. Around it there is only a faint glow low on the far
  // side; the water mirrors it, so the surface is seen by what the ripples do to that glow.
  async function buildStill() {
    const group = new THREE.Group();
    const deep = vec3(0.0022, 0.0021, 0.002);
    const backdrop = prefilter(
      renderer,
      (d) => {
        const el = asin(clamp(abs(d.y), 0, 1));
        const behind = smoothstep(0.2, -0.9, d.z); // strongest straight behind the ring
        const sq = (x) => x.mul(x);
        const glow = exp(sq(el.div(0.045)).negate()).mul(0.085).add(exp(sq(el.div(0.16)).negate()).mul(0.03)).add(exp(sq(el.div(0.45)).negate()).mul(0.014));
        const above = vec3(1.0, 0.92, 0.84).mul(glow.mul(behind.mul(0.9).add(0.1))).add(vec3(0.003, 0.0028, 0.0026));
        // below the horizon the same water as in the set, so its far edge cannot be seen
        return select(d.y.greaterThan(0), above, mix(deep, above, waterFresnel(abs(d.y))));
      },
      256
    );
    const water = createWater({
      radius: 900,
      deep,
      clock,
      drops: 3,
      waves: [
        [25, 52, 3.4, 0.17],
        [-70, 31, 2.7, 0.08],
        [110, 19, 2.2, 0.03],
      ],
    });
    water.position.y = floorY - 1.2;
    group.add(water);
    return { group, env: null, backdrop };
  }

  const builders = { white: buildShowroom, black: buildShowroom, dusk: buildDusk, stone: buildStone, still: buildStill };
  const built = {};
  const pending = {};
  let current = null;

  return {
    looks: LOOKS,
    root,
    isReady: (id) => !builders[id] || !!built[id],
    // Fetch and build a backdrop (once). Resolves when it can be shown.
    load(id) {
      if (!builders[id] || built[id]) return Promise.resolve();
      if (!pending[id]) {
        pending[id] = builders[id]().then((b) => {
          b.group.visible = false;
          root.add(b.group);
          built[id] = b;
        });
      }
      return pending[id];
    },
    // Show a backdrop's set; returns its maps and look.
    show(id) {
      current = builders[id] ? id : null;
      for (const [key, b] of Object.entries(built)) b.group.visible = key === current;
      const b = current && built[current];
      // env lights the ring (null = the studio's own light); backdrop is what is seen far away
      // (null = the plain paper of the studio)
      return b ? { env: b.env, backdrop: b.backdrop === undefined ? b.env : b.backdrop, look: LOOKS[current] } : { env: null, backdrop: null, look: null };
    },
    // the floor drops in the exploded view; the set goes with it
    setDrop(y) {
      root.position.y = y;
      drop.value = y;
    },
    // advance the scene's own motion (water, leaves, reeds); true while something moves
    update(dt) {
      if (!current || built[current].still) return false;
      clock.value += dt;
      return true;
    },
  };
}
