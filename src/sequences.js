import * as THREE from 'three/webgpu';

// Cinematic views: slow, continuous camera moves. Each view returns, as a function of time, the
// ring orientation, the camera (position, look-at target, field of view) and optional scene
// state (sensor lights, exploded, dark studio). Entering and leaving a view blends smoothly
// with the normal interactive view; any touch stops the view.

const TAU = Math.PI * 2;
const deg = THREE.MathUtils.degToRad;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const _q = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const ORIGIN = new THREE.Vector3();

export const SEQUENCES = [
  { id: 'hero', name: 'Showcase' },
  { id: 'sensor', name: 'Sensor' },
  { id: 'profile', name: 'Profile' },
  { id: 'exploded', name: 'Exploded' },
];

// Showcase timeline (seconds). One loop:
//   hero (dark) → glide into the sensors (unlit, then lit) → dissolve to the light studio and
//   the edge profile → glide out while the ring comes apart → reassemble → dissolve back to the
//   dark hero shot, which continues seamlessly into the next loop.
export const SHOWCASE = {
  duration: 20,
  sensorIn: [3.6, 5.0], // glide hero → sensors
  lightsOn: [6.2, 9.1],
  toLight: 9.4, // dissolve + cut to the profile shot
  explodeIn: [12.0, 13.5], // glide profile → exploded framing
  exploded: [12.1, 16.0],
  toDark: 18.2, // dissolve + cut back to the hero shot
  dissolveLead: 0.4, // the studio change is requested this much before a cut
};

// Camera pose: position + look-at target, up = world y
function pose(pos, target, fov, near = 0.2) {
  return { pos: pos.clone(), target: target.clone(), fov, near };
}

// Blend two shots: the camera travels around the ring (spherical interpolation about the
// origin) and keeps looking at the interpolated target, so the ring never leaves the frame.
function mixShots(a, b, k) {
  const ringQuat = a.ringQuat.clone().slerp(b.ringQuat, k);
  const d0 = a.cam.pos.length();
  const d1 = b.cam.pos.length();
  const u0 = a.cam.pos.clone().normalize();
  const u1 = b.cam.pos.clone().normalize();
  const ang = Math.acos(Math.min(1, Math.max(-1, u0.dot(u1))));
  let axis = new THREE.Vector3().crossVectors(u0, u1);
  if (axis.lengthSq() < 1e-8) axis = Y.clone();
  axis.normalize();
  const pos = u0.applyAxisAngle(axis, ang * k).multiplyScalar(d0 + (d1 - d0) * k);
  const cam = pose(pos, a.cam.target.clone().lerp(b.cam.target, k), a.cam.fov + (b.cam.fov - a.cam.fov) * k, Math.min(a.cam.near, b.cam.near));
  return { ringQuat, cam };
}

export class Director {
  constructor(ctx) {
    // ctx: { ring, camera, fov, ringInfo: { Ri, Ro, ledTheta, pdTheta }, heroQuat, explodedQuat,
    //        standardDistance(), standardTarget(), setExplode(on), onStop() }
    this.ctx = ctx;
    this.seq = null;
    this.t = 0;
    this.blend = null; // { from: snapshot, k, dur, toSeq }
    this.state = {}; // scene state requested by the running view (null/undefined = user's own)
    this.progress = null; // 0..1 within the showcase loop, null for endless views
  }

  get active() {
    return this.seq !== null || this.blend !== null;
  }

  get running() {
    return this.seq !== null;
  }

  start(id) {
    const { ctx } = this;
    this.seq = id;
    this.t = 0;
    if (id === 'exploded') ctx.setExplode(true);
    else if (id !== 'hero') ctx.setExplode(false);
    this.blend = { from: this._snapshot(ctx.standardTarget()), k: 0, dur: 1.6, toSeq: true, q0: ctx.ring.quaternion.clone(), p0: ctx.ring.position.clone() };
  }

  stop() {
    if (!this.seq) return;
    this.seq = null;
    this.state = {};
    this.progress = null;
    this.blend = { from: this._snapshot(this.lastTarget), k: 0, dur: 1.2, toSeq: false };
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
        const k = easeInOut(Math.min(1, this.blend.k));
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
      // transition from the stored pose to the current one (a view or the normal camera)
      this.blend.k += dt / this.blend.dur;
      const k = easeInOut(Math.min(1, this.blend.k));
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

  // --- individual shots -------------------------------------------------------------------

  // Three-quarter product view; s = seconds relative to the loop start (may be negative)
  _hero(s) {
    const { ctx } = this;
    const ringQuat = new THREE.Quaternion().setFromAxisAngle(Y, deg(-14 + 6.2 * s)).multiply(ctx.heroQuat);
    const e = deg(10);
    const dist = ctx.standardDistance() * (1 - 0.14 * smooth(-2, 4.2, s));
    return { ringQuat, cam: pose(new THREE.Vector3(0, Math.sin(e), Math.cos(e)).multiplyScalar(dist), ORIGIN, ctx.fov) };
  }

  // Close-up of one LED / photodiode pair on the inner surface; u = 0 (LED) … 1 (photodiode)
  _sensor(u, t) {
    const { ctx } = this;
    const { Ri, ledTheta, pdTheta } = ctx.ringInfo;
    const ringQuat = ctx.heroQuat.clone();
    const mid = (ledTheta + pdTheta) / 2;
    const half = ((pdTheta - ledTheta) / 2) * 1.05;
    const th = mid - half * Math.cos(Math.PI * u);
    const zc = 12.6 + 1.3 * Math.sin((t * TAU) / 15 + 0.7);
    const rc = Ri - 6.4 + 0.6 * Math.sin((t * TAU) / 11);
    const local = (r, a, z) => new THREE.Vector3(r * Math.sin(a), -r * Math.cos(a), z).applyQuaternion(ringQuat);
    return { ringQuat, cam: pose(local(rc, th * 0.82, zc), local(Ri - 0.45, th, 0.15), 30, 0.1) };
  }

  // Upright ring seen from a three-quarter angle: the oval edge and the seams on the side face
  _profile(t) {
    const { ctx } = this;
    const { Ro } = ctx.ringInfo;
    const yaw = deg(-36) + deg(14) * Math.sin((t * TAU) / 28);
    const ringQuat = new THREE.Quaternion().setFromAxisAngle(Z, (t * TAU) / 80).premultiply(_q.setFromAxisAngle(Y, Math.PI / 2 + yaw));
    const e = deg(7 + 4 * Math.sin((t * TAU) / 19 + 1));
    const tgt = new THREE.Vector3(0, Ro * 0.55, 0);
    const dist = ctx.standardDistance() * 0.62;
    return { ringQuat, cam: pose(new THREE.Vector3(0, Math.sin(e), Math.cos(e)).multiplyScalar(dist).add(tgt), tgt, ctx.fov, 1) };
  }

  // Exploded stack turning slowly about its own (upright) axis
  _exploded(t) {
    const { ctx } = this;
    const ringQuat = ctx.explodedQuat.clone().multiply(_q.setFromAxisAngle(Z, (t * TAU) / 48));
    const e = deg(11 + 5 * Math.sin((t * TAU) / 21));
    const dist = ctx.standardDistance() * 0.98;
    return { ringQuat, cam: pose(new THREE.Vector3(0, Math.sin(e), Math.cos(e)).multiplyScalar(dist), ORIGIN, ctx.fov) };
  }

  // --- views ------------------------------------------------------------------------------

  _evaluate(id, t) {
    if (id === 'hero') return this._showcase(t);
    if (id === 'sensor') {
      // endless: drift between LED and photodiode; lights off first, then on for a few seconds
      const u = 0.5 - 0.5 * Math.cos((t * TAU) / 22);
      return { ...this._sensor(u, t), state: { sensors: t % 7.5 > 3 } };
    }
    if (id === 'profile') return this._profile(t);
    return this._exploded(t);
  }

  _showcase(t) {
    const S = SHOWCASE;
    const tau = t % S.duration;
    const within = (range) => tau >= range[0] && tau < range[1];
    let shot;
    if (tau < S.sensorIn[0]) {
      shot = this._hero(tau);
    } else if (tau < S.toLight) {
      // sensors: the camera settles on the LED, then drifts to the photodiode
      const u = smooth(S.sensorIn[1], S.toLight, tau) * 0.9;
      shot = this._sensor(u, tau);
      if (tau < S.sensorIn[1]) shot = mixShots(this._hero(tau), shot, easeInOut((tau - S.sensorIn[0]) / (S.sensorIn[1] - S.sensorIn[0])));
    } else if (tau < S.explodeIn[0]) {
      shot = this._profile(tau - S.toLight + 3);
    } else if (tau < S.toDark) {
      shot = this._exploded(tau - S.explodeIn[0]);
      if (tau < S.explodeIn[1]) shot = mixShots(this._profile(tau - S.toLight + 3), shot, easeInOut((tau - S.explodeIn[0]) / (S.explodeIn[1] - S.explodeIn[0])));
    } else {
      // back to the hero shot; continues without a seam into the next loop
      shot = this._hero(tau - S.duration);
    }
    return {
      ...shot,
      progress: tau / S.duration,
      state: {
        sensors: within(S.lightsOn),
        explode: within(S.exploded),
        // requested slightly early so the studio swaps exactly at the cut, under the dissolve
        dark: tau < S.toLight - S.dissolveLead || tau >= S.toDark - S.dissolveLead,
      },
    };
  }
}