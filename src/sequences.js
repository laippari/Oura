import * as THREE from 'three/webgpu';

// Showcase tours: slow, continuous camera moves that mix wide shots and close-ups. A tour never
// changes the background or the finish — it plays in whatever the user has chosen and follows
// the user's changes while it runs. The only scene state a tour sets is the exploded view (in
// the tours that have it); the sensor lights are switched on when a tour starts and stay the
// user's to toggle. Entering and leaving a tour blends smoothly with the interactive view.
//
// How a tour is built
//   • Most shots are "band shots" (see _band): the camera looks from a steady direction in the
//     studio and the ring is oriented under it. A shot is a handful of parameters — where on
//     the circumference, where around the cross-section, how tight the frame is — and a tour
//     is a smooth curve through keyed values of those parameters. Nothing is cut and nothing
//     stops: wide shot, close-up and the turn in between are one move.
//   • The signature move is the "turn": from a close-up of the sensors inside the bore, the
//     ring rolls about the band in front of the lens, so the rim and then the outer surface
//     glide past, filling most of the frame.
//   • The exploded view uses its own rig; tours glide in and out of it (mixShots).

const TAU = Math.PI * 2;
const deg = THREE.MathUtils.degToRad;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
// quintic ease: velocity and acceleration are both zero at the ends, so a glide starts and
// lands without any visible kick
const glideEase = (t) => {
  const s = clamp01(t);
  return s * s * s * (s * (s * 6 - 15) + 10);
};

const _q = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const ORIGIN = new THREE.Vector3();

// Smooth curve through keys [[time, value], …] (monotone cubic, Fritsch–Carlson): passes every
// key without overshoot, and keeps moving through the keys instead of stopping at each one.
// With `period` the curve is periodic: the first key is at 0, the last at `period`, and the
// slope carries across the seam. The last value may differ from the first (an angle that
// keeps turning); the difference is added once per lap.
export function curve(keys, period = 0) {
  let x = keys.map((k) => k[0]);
  let y = keys.map((k) => k[1]);
  const lap = period ? y[y.length - 1] - y[0] : 0;
  if (period) {
    const n = x.length;
    x = [x[n - 2] - period, ...x, x[1] + period];
    y = [y[n - 2] - lap, ...y, y[1] + lap];
  }
  const n = x.length;
  const h = [];
  const d = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(x[i + 1] - x[i]);
    d.push((y[i + 1] - y[i]) / h[i]);
  }
  const m = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] > 0) {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  const lo = period ? 1 : 0;
  const hi = period ? n - 2 : n - 1;
  return (time) => {
    let t = time;
    let add = 0;
    if (period) {
      const laps = Math.floor(t / period);
      t -= laps * period;
      add = laps * lap;
    }
    if (t <= x[lo]) return y[lo] + add;
    if (t >= x[hi]) return y[hi] + add;
    let i = lo;
    while (t > x[i + 1]) i++;
    const s = (t - x[i]) / h[i];
    const s2 = s * s;
    const s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * y[i] + (s3 - 2 * s2 + s) * h[i] * m[i] + (-2 * s3 + 3 * s2) * y[i + 1] + (s3 - s2) * h[i] * m[i + 1] + add;
  };
}

// Camera pose: position + look-at target, up = world y
function pose(pos, target, fov, near = 0.2) {
  return { pos: pos.clone(), target: target.clone(), fov, near };
}

// Blend two shots: the camera travels around the ring (spherical interpolation about the
// origin) and keeps looking at the interpolated target, so the ring never leaves the frame.
// The distance is interpolated geometrically, so a push-in closes at an even rate on screen.
function mixShots(a, b, k) {
  const ringQuat = a.ringQuat.clone().slerp(b.ringQuat, k);
  const d0 = Math.max(1e-3, a.cam.pos.length());
  const d1 = Math.max(1e-3, b.cam.pos.length());
  const u0 = a.cam.pos.clone().normalize();
  const u1 = b.cam.pos.clone().normalize();
  const ang = Math.acos(Math.min(1, Math.max(-1, u0.dot(u1))));
  let axis = new THREE.Vector3().crossVectors(u0, u1);
  if (axis.lengthSq() < 1e-8) axis = Y.clone();
  axis.normalize();
  const pos = u0.applyAxisAngle(axis, ang * k).multiplyScalar(d0 * Math.pow(d1 / d0, k));
  const cam = pose(pos, a.cam.target.clone().lerp(b.cam.target, k), a.cam.fov + (b.cam.fov - a.cam.fov) * k, Math.min(a.cam.near, b.cam.near));
  return { ringQuat, cam };
}

export class Director {
  constructor(ctx) {
    // ctx: { ring, camera, fov, ringInfo: { Ri, Ro, A, ledTheta, pdTheta }, heroQuat,
    //        explodedQuat, standardDistance(), standardTarget(), onStop() }
    this.ctx = ctx;
    this.seq = null;
    this.t = 0;
    this.blend = null; // { from: snapshot, k, dur, toSeq }
    this.state = {}; // scene state set by the running tour: { explode }
    this.progress = null; // 0..1 within the tour loop
    this.tours = buildTours(ctx.ringInfo);
  }

  get active() {
    return this.seq !== null || this.blend !== null;
  }

  get running() {
    return this.seq !== null;
  }

  start(id) {
    const { ctx } = this;
    this.seq = this.tours[id] ? id : SEQUENCES[0].id;
    this.t = 0;
    this.blend = { from: this._snapshot(this.lastTarget && this.active ? this.lastTarget : ctx.standardTarget()), k: 0, dur: 1.8, toSeq: true, q0: ctx.ring.quaternion.clone(), p0: ctx.ring.position.clone() };
  }

  stop() {
    if (!this.seq) return;
    this.seq = null;
    this.state = {};
    this.progress = null;
    this.blend = { from: this._snapshot(this.lastTarget), k: 0, dur: 1.4, toSeq: false };
    this.ctx.onStop?.();
  }

  _snapshot(target) {
    const c = this.ctx.camera;
    return { pos: c.position.clone(), target: (target || ORIGIN).clone(), fov: c.fov, near: c.near };
  }

  // Called every frame after the normal camera placement. Returns true while in control.
  update(dt) {
    const { ctx } = this;
    const cam = ctx.camera;
    let target = null;
    if (this.seq) {
      this.t += dt;
      const s = this._evaluate(this.seq, this.t);
      this.state = s.state || {};
      this.progress = s.progress ?? null;
      // ring orientation (eased in from the current one at the start)
      if (this.blend && this.blend.toSeq) {
        const k = glideEase(this.blend.k);
        ctx.ring.quaternion.slerpQuaternions(this.blend.q0, s.ringQuat, k);
        ctx.ring.position.lerpVectors(this.blend.p0, ORIGIN, k);
      } else {
        ctx.ring.quaternion.copy(s.ringQuat);
        ctx.ring.position.set(0, 0, 0);
      }
      target = s.cam;
    }

    if (target) {
      cam.position.copy(target.pos);
      cam.up.set(0, 1, 0);
      cam.lookAt(target.target);
      cam.fov = target.fov;
      cam.near = target.near;
      cam.far = 600;
      this.lastTarget = target.target.clone();
    }
    const toTarget = target ? target.target : ctx.standardTarget();

    if (this.blend) {
      // transition from the stored pose to the current one (a tour or the normal camera)
      this.blend.k += dt / this.blend.dur;
      const k = glideEase(this.blend.k);
      const f = this.blend.from;
      const mixed = mixShots({ ringQuat: _q, cam: f }, { ringQuat: _q, cam: pose(cam.position, toTarget, cam.fov, cam.near) }, k);
      cam.position.copy(mixed.cam.pos);
      cam.up.set(0, 1, 0);
      cam.lookAt(mixed.cam.target);
      cam.fov = mixed.cam.fov;
      cam.near = mixed.cam.near;
      if (this.blend.k >= 1) this.blend = null;
    }

    if (this.active) cam.updateProjectionMatrix();
    return this.active;
  }

  // --- shots --------------------------------------------------------------------------------

  // Camera distance at which a w × h mm frame at the subject just fits the view. Close-ups are
  // sized this way so they hold on any screen shape: on a phone the width decides, on a wide
  // screen the height.
  _fit(w, h, fov) {
    const vHalf = deg(fov) / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * this.ctx.camera.aspect);
    return Math.max(h / 2 / Math.tan(vHalf), w / 2 / Math.tan(hHalf));
  }

  // Band shot. The camera looks at a point of the band from a steady direction in the studio
  // and the ring is oriented under it, so every move reads as the ring turning in the light.
  //   a       where on the circumference (rad from the palm-side centre; sensors at ±0.55, ±0.96)
  //   phi     where around the cross-section the camera stands: 180° inside the bore,
  //           90° over the rim, 0° outside, facing the outer surface
  //   r, z    the focus point (radius, offset along the axis)
  //   w, h    frame size at the focus point (mm); with wide = 1 the ring's standard fit instead
  //   twist   angle of the band on screen: 0 = running vertically, ±90° = horizontally
  //   az, el  where in the studio the camera looks from
  //   centre  0 = look at the focus point … 1 = look at the centre of the ring
  //   reach   least camera distance (mm), for shots that must stay outside the ring whatever
  //           the screen shape
  _band({ a, phi, r, z = 0, w, h = w, fov = 30, twist = 0, az = 0, el = deg(12), centre = 0, wide = 0, reach = 0 }) {
    const { ctx } = this;
    const nW = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const up0 = Y.clone().addScaledVector(nW, -Y.dot(nW)).normalize();
    const right0 = new THREE.Vector3().crossVectors(up0, nW);
    const uW = up0.multiplyScalar(Math.cos(twist)).addScaledVector(right0, Math.sin(twist));
    const sW = new THREE.Vector3().crossVectors(nW, uW);
    const eR = new THREE.Vector3(Math.sin(a), -Math.cos(a), 0);
    const eT = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
    const nL = eR.clone().multiplyScalar(Math.cos(phi)).addScaledVector(Z, Math.sin(phi));
    const sL = new THREE.Vector3().crossVectors(nL, eT);
    const mW = new THREE.Matrix4().makeBasis(nW, uW, sW);
    const mL = new THREE.Matrix4().makeBasis(nL, eT, sL).transpose();
    const ringQuat = new THREE.Quaternion().setFromRotationMatrix(mW.multiply(mL));
    const target = eR.multiplyScalar(r).addScaledVector(Z, z).applyQuaternion(ringQuat).multiplyScalar(1 - centre);
    // distance: geometric blend between the close-up fit and the ring's standard fit
    const close = Math.max(this._fit(w, h, fov), reach);
    const far = (ctx.standardDistance() * Math.tan(deg(ctx.fov) / 2)) / Math.tan(deg(fov) / 2);
    const dist = close * Math.pow(far / close, wide);
    const near = Math.max(0.1, Math.min(1, dist * 0.02));
    return { ringQuat, cam: pose(target.clone().addScaledVector(nW, dist), target, fov, near) };
  }

  // Exploded stack, upright. `spin` (rad) turns it about its own axis, `zoom` > 1 moves in on
  // the part of the stack at height `y` (mm along the axis, + = top of the stack).
  _exploded(t, zoom = 1, y = 0, spin = 0) {
    const { ctx } = this;
    const ringQuat = ctx.explodedQuat.clone().multiply(_q.setFromAxisAngle(Z, spin));
    const e = deg(11 + 3 * Math.sin((t * TAU) / 23));
    const dist = (ctx.standardDistance() * 0.98) / zoom;
    const target = new THREE.Vector3(0, 0, y).applyQuaternion(ctx.explodedQuat);
    return { ringQuat, cam: pose(new THREE.Vector3(0, Math.sin(e), Math.cos(e)).multiplyScalar(dist).add(target), target, ctx.fov, 1) };
  }

  // --- tours --------------------------------------------------------------------------------

  // A tour is a list of cues. Each cue has a shot (a function of tour time) and takes over
  // from the one before it with a glide. Glides may overlap; the result is always continuous.
  _evaluate(id, t) {
    const T = this.tours[id];
    const tau = t % T.duration;
    let shot = null;
    for (const c of T.cues) {
      if (tau < c.at) break;
      const s = c.shot(this, tau);
      const k = c.glide ? glideEase((tau - c.at) / c.glide) : 1;
      shot = shot && k < 1 ? mixShots(shot, s, k) : s;
    }
    const explode = T.explode ? tau >= T.explode[0] && tau < T.explode[1] : false;
    return { ...shot, progress: tau / T.duration, state: { explode } };
  }
}

export const SEQUENCES = [
  { id: 'signature', name: 'Signature' },
  { id: 'horizon', name: 'Horizon' },
  { id: 'anatomy', name: 'Anatomy' },
  { id: 'halo', name: 'Halo' },
  { id: 'odyssey', name: 'Odyssey' },
];

// A band-shot track: keyed parameter sets joined by smooth periodic curves. Angles in degrees.
// Frame sizes are interpolated in log space (an even zoom rate). The first key is at 0 and the
// last at the tour's duration with the same pose, so the tour loops without a seam.
const ANGLES = ['a', 'phi', 'twist', 'az', 'el'];
const LOGS = ['w', 'h'];
function track(duration, keys) {
  const names = Object.keys(keys[0][1]);
  const curves = {};
  for (const n of names) curves[n] = curve(keys.map(([t, p]) => [t, LOGS.includes(n) ? Math.log(p[n]) : p[n]]), duration);
  return (director, t) => {
    const p = {};
    for (const n of names) {
      const v = curves[n](t);
      p[n] = LOGS.includes(n) ? Math.exp(v) : ANGLES.includes(n) ? deg(v) : v;
    }
    return director._band(p);
  };
}

function buildTours(info) {
  const { Ri, Ro } = info;
  const R = THREE.MathUtils.radToDeg;
  const led = R(info.ledTheta); // 31°
  const pd = R(info.pdTheta); // 55°
  const inner = Ri - 0.4;
  const outer = Ro - 0.2;
  // a full parameter set; keys override what they change
  const K = (o) => ({ a: 0, phi: 150, r: inner, z: 0, w: 4.4, h: 7, fov: 30, twist: 0, az: 0, el: 12, centre: 0, wide: 0, reach: 0, ...o });
  // the classic three-quarter view: 43.5° off the ring's plane, sensors on the far inner wall
  const hero = (o) => K({ phi: 133.5, twist: 90, centre: 1, wide: 1, fov: 18, el: 10, ...o });

  const tours = {};

  // The exploded stack as a shot: zoom, height along the stack and spin (degrees) as curves
  // of tour time. A band shot with twist −90°, phi 152° and a = 12° − spin shows the ring in
  // the stack's orientation, so tours hand over to the stack and back without a swing.
  const stack = (zoom, y, spin) => (director, t) => director._exploded(t, zoom(t), y(t), deg(spin(t)));
  const lying = (spin, o) => K({ twist: -90, phi: 152, a: 12 - spin, centre: 1, wide: 1, fov: 18, el: 10, ...o });

  // 1 — Signature. Wide three-quarter view → push in to the sensors (LED, then the photodiode)
  // → the turn: the ring rolls, the rim and then the outer surface glide past → the surface
  // drifts by → the ring rolls back as the camera retreats to the wide view.
  tours.signature = {
    duration: 27,
    cues: [
      {
        at: 0,
        shot: track(27, [
          [0, hero({ a: 0 })],
          [3.2, hero({ a: 8, phi: 137, twist: 84, wide: 0.9, az: 2 })],
          [7.0, K({ a: led + 4, phi: 151, el: 14, az: 4 })],
          [10.4, K({ a: pd - 6, phi: 147, w: 4.7, h: 8, el: 14, az: 6 })],
          [12.4, K({ a: pd - 4, phi: 114, r: Ri + 0.1, w: 5.6, h: 9, el: 18, az: 7 })],
          [14.2, K({ a: pd - 6, phi: 56, r: outer - 0.4, w: 7.2, h: 10, el: 23, az: 8 })],
          [16.2, K({ a: 44, phi: 8, r: outer, w: 7.9, h: 10, el: 26, az: 10 })],
          [19.4, K({ a: 26, phi: -16, r: outer, w: 8.4, h: 11, el: 24, az: 22, twist: -8 })],
          [23.4, hero({ a: 10, phi: 84, twist: 52, centre: 0.7, wide: 0.66, fov: 22, el: 14, az: 6 })],
          [27, hero({ a: 0 })],
        ]),
      },
    ],
  };

  // 2 — Horizon. The ring lies flat. The camera comes in low until the outer surface fills
  // the frame like the limb of a planet → it lifts and the sensor light rises over the edge →
  // over the rim to the LED, then LED and photodiode side by side → up and out to a view
  // from above, settling back to the low wide shot.
  const H = (o) => K({ twist: -90, w: 7.4, h: 7.4, el: 10, ...o });
  tours.horizon = {
    duration: 26,
    cues: [
      {
        at: 0,
        shot: track(26, [
          [0, H({ a: 58, phi: 158, centre: 1, wide: 1, fov: 18, reach: 30 })],
          [3.4, H({ a: 54, phi: 170, centre: 0.8, wide: 0.75, fov: 20, reach: 30 })],
          [6.6, H({ a: 48, phi: 176, el: 9, reach: 30 })],
          [9.8, H({ a: 43, phi: 167.5, w: 7.0, h: 7.0, reach: 28 })],
          [13.6, H({ a: led + 1.5, phi: 152, w: 3.9, h: 5, el: 14 })],
          [17.0, H({ a: 43, phi: 149, w: 8.6, h: 6, el: 14 })],
          [21.2, H({ a: 52, phi: 128, centre: 0.9, wide: 0.9, fov: 19, el: 12 })],
          [26, H({ a: 58, phi: 158, centre: 1, wide: 1, fov: 18, reach: 30 })],
        ]),
      },
    ],
  };

  // 3 — Anatomy. Looking down into the ring → down to the rim, along the seams between the
  // coloured shell, the lock ring and the titanium inner → the camera drops as the ring comes
  // apart, moves in and travels down the stack → the ring reassembles and the camera rises.
  const spinA = curve([[12.4, -4], [25.6, 40]]);
  tours.anatomy = {
    duration: 30,
    explode: [12.2, 21.8],
    cues: [
      {
        at: 0,
        shot: track(30, [
          [0, H({ a: 6, phi: 124, centre: 1, wide: 1, fov: 18 })],
          [3.4, H({ a: 12, phi: 116, centre: 0.9, wide: 0.88, fov: 19 })],
          [6.8, H({ a: 24, phi: 97, r: 11.3, z: 2.9, w: 5.2, h: 5.6, el: 15 })],
          [9.6, H({ a: 36, phi: 86, r: 11.5, z: 2.9, w: 5.6, h: 6.0, el: 17 })],
          [12.6, lying(spinA(12.6))],
          [23.6, lying(spinA(23.6))],
          [30, H({ a: 6, phi: 124, centre: 1, wide: 1, fov: 18 })],
        ]),
      },
      {
        at: 12.4,
        glide: 2.6,
        shot: stack(curve([[12.4, 1], [14.6, 1.02], [16.8, 1.6], [19.6, 1.6], [21.8, 1]]), curve([[14.6, 0], [16.8, 14], [19.6, -16], [21.8, 0]]), spinA),
      },
      { at: 22.0, glide: 3.4, shot: null }, // back to the first shot (filled in below)
    ],
  };

  // 4 — Halo. The ring face-on, a circle with the sensors glowing inside. It rolls forward
  // once, without ever turning back: the camera sinks into the bore and slides along the
  // inner wall from one sensor pair to the other, square-on to the LED → under the rim → the
  // outer surface passes as a broad slab → the ring completes its turn, face-on again.
  const A = (o) => K({ twist: 90, w: 3.7, h: 5.2, el: 12, ...o });
  tours.halo = {
    duration: 25,
    cues: [
      {
        at: 0,
        shot: track(25, [
          [0, A({ a: 0, phi: 97, centre: 1, wide: 1, fov: 18, el: 10 })],
          [3.0, A({ a: -6, phi: 107, centre: 1, wide: 0.95, fov: 18, el: 10 })],
          [6.4, A({ a: -36, phi: 152, w: 5.0, h: 6, el: 13 })],
          [10.4, A({ a: 33, phi: 172, el: 13 })],
          [12.8, A({ a: 40, phi: 206, w: 4.0, h: 6, el: 14 })],
          [15.4, A({ a: 38, phi: 286, r: 11.3, w: 4.6, h: 8, el: 18 })],
          [17.4, A({ a: 28, phi: 345, r: outer, w: 4.4, h: 9.5, el: 24 })],
          [20.0, A({ a: 6, phi: 372, r: outer, w: 4.8, h: 10.5, el: 24 })],
          [22.6, A({ a: 0, phi: 420, r: outer, centre: 0.8, wide: 0.75, fov: 20, el: 14 })],
          [25, A({ a: 0, phi: 457, centre: 1, wide: 1, fov: 18, el: 10 })],
        ]),
      },
    ],
  };

  // 5 — Odyssey. The whole story. The ring lies flat → it rises and presents its outer
  // surface until it fills the frame → the turn in reverse: over the rim and into the bore,
  // to the LED and the photodiode → the ring lies back down as the camera retreats, comes
  // apart, the camera travels the stack → it reassembles where the tour began.
  const spinO = curve([[20.8, -6], [33.2, 34]]);
  tours.odyssey = {
    duration: 35,
    explode: [20.6, 29.4],
    cues: [
      {
        at: 0,
        shot: track(35, [
          [0, lying(spinO(35), { a: 12 - spinO(35) + 4 })],
          [3.6, K({ a: 4, phi: 92, r: outer, twist: -42, centre: 0.75, wide: 0.72, fov: 20, el: 14 })],
          [7.0, K({ a: 10, phi: -8, r: outer, w: 7.9, h: 10, el: 26 })],
          [9.6, K({ a: 24, phi: 14, r: outer, w: 7.6, h: 10, el: 25 })],
          [12.2, K({ a: 34, phi: 80, r: 11.3, w: 5.8, h: 9, el: 18 })],
          [14.6, K({ a: led + 3, phi: 148, w: 4.3, h: 6.5, el: 14 })],
          [17.6, K({ a: pd - 5, phi: 152, w: 4.6, h: 7.5, el: 14 })],
          [21.4, lying(spinO(21.4))],
          [31.8, lying(spinO(31.8))],
          [35, lying(spinO(35), { a: 12 - spinO(35) + 4 })],
        ]),
      },
      {
        at: 20.8,
        glide: 3.2,
        shot: stack(curve([[20.8, 1], [23.6, 1.02], [25.6, 1.6], [28.2, 1.6], [30.0, 1]]), curve([[23.6, 0], [25.6, 14], [28.2, -16], [30.0, 0]]), spinO),
      },
      { at: 29.6, glide: 3.6, shot: null },
    ],
  };

  // a cue without a shot returns to the tour's first shot
  for (const T of Object.values(tours)) for (const c of T.cues) c.shot = c.shot || T.cues[0].shot;
  return tours;
}
