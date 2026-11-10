import * as THREE from 'three/webgpu';

// Elokuvamaiset näkymät: jatkuvat, hitaat kamera-ajot. Jokainen ajo antaa ajan funktiona
// renkaan asennon ja kameran (sijainti, katsesuunta, polttoväli). Alku ja lopetus häivytetään
// pehmeästi tavalliseen näkymään; kosketus lopettaa ajon.

const TAU = Math.PI * 2;
const deg = THREE.MathUtils.degToRad;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
// kuutiollinen Hermite: sijainti ja nopeus päätepisteissä (sileä, jatkuva nopeus)
const hermite = (t, t0, t1, p0, v0, p1, v1) => {
  const d = t1 - t0;
  const s = (t - t0) / d;
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * v0 * d + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * v1 * d;
};

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);

export const SEQUENCES = [
  { id: 'hero', name: 'Esittely' },
  { id: 'sensor', name: 'Sensori' },
  { id: 'through', name: 'Läpi' },
  { id: 'profile', name: 'Profiili' },
  { id: 'exploded', name: 'Räjäytys' },
];

// Kameran asento: sijainti + kohde (tai katsesuunta), ylös = maailman y
function pose(pos, target, fov, near = 0.2) {
  return { pos: pos.clone(), target: target.clone(), fov, near };
}

export class Director {
  constructor(ctx) {
    // ctx: { ring, camera, ringInfo: { Ri, Ro, A, ledTheta }, heroQuat, explodedQuat, standardDistance(), setExplode(on), onStop() }
    this.ctx = ctx;
    this.seq = null;
    this.t = 0;
    this.blend = null; // { from: snapshot, k, dur, toSeq: bool }
    this.veil = 0; // 0..1: kuva häivytetään taustaan (silmukan sauma)
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
    this.veil = 0;
    this.blend = { from: this._snapshot(this.lastTarget), k: 0, dur: 1.2, toSeq: false };
    this.ctx.onStop?.();
  }

  _snapshot(target) {
    const c = this.ctx.camera;
    return { pos: c.position.clone(), target: (target || new THREE.Vector3()).clone(), fov: c.fov, near: c.near };
  }

  // Kutsutaan joka kuvassa tavallisen kameran sijoittelun jälkeen. Palauttaa true, jos ohjaa.
  update(dt) {
    const { ctx } = this;
    const cam = ctx.camera;
    let target = null;
    if (this.seq) {
      this.t += dt;
      const s = this._evaluate(this.seq, this.t);
      this.veil = s.veil || 0;
      // renkaan asento (alussa liu'utetaan nykyisestä)
      if (this.blend && this.blend.toSeq) {
        const k = easeInOut(Math.min(1, this.blend.k));
        ctx.ring.quaternion.slerpQuaternions(this.blend.q0, s.ringQuat, k);
        ctx.ring.position.lerpVectors(this.blend.p0, new THREE.Vector3(), k);
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
      // siirtymä tallennetusta asennosta nykyiseen (ajo tai tavallinen näkymä); kamera katsoo
      // koko ajan interpoloitua kohdetta, joten rengas pysyy kuvassa
      this.blend.k += dt / this.blend.dur;
      const k = easeInOut(Math.min(1, this.blend.k));
      const f = this.blend.from;
      const toPos = cam.position.clone();
      // sijainti pallokoordinaateissa renkaan ympäri (ei renkaan läpi)
      const d0 = f.pos.length();
      const d1 = toPos.length();
      const u0 = f.pos.clone().normalize();
      const u1 = toPos.clone().normalize();
      const ang = Math.acos(Math.min(1, Math.max(-1, u0.dot(u1))));
      let axis = new THREE.Vector3().crossVectors(u0, u1);
      if (axis.lengthSq() < 1e-8) axis = Y.clone();
      axis.normalize();
      const dir = u0.clone().applyAxisAngle(axis, ang * k);
      cam.position.copy(dir.multiplyScalar(d0 + (d1 - d0) * k));
      cam.up.set(0, 1, 0);
      cam.lookAt(f.target.clone().lerp(toTarget, k));
      cam.fov = f.fov + (cam.fov - f.fov) * k;
      cam.near = Math.min(f.near, cam.near);
      if (this.blend.k >= 1) this.blend = null;
    }

    if (this.active) cam.updateProjectionMatrix();
    return this.active;
  }

  _evaluate(id, t) {
    const { ctx } = this;
    const { Ri, Ro, ledTheta, pdTheta } = ctx.ringInfo;
    const ringQuat = new THREE.Quaternion();
    let cam;
    let veil = 0;

    if (id === 'hero') {
      // Esittely: hidas pyörintä pystyakselin ympäri, kevyt kallistuksen ja etäisyyden hengitys
      _q.setFromAxisAngle(Y, (t * TAU) / 40);
      ringQuat.copy(ctx.heroQuat).premultiply(_q);
      _q2.setFromAxisAngle(X, deg(5) * Math.sin((t * TAU) / 14));
      ringQuat.premultiply(_q2);
      const e = deg(10 + 3.5 * Math.sin((t * TAU) / 19));
      const dist = ctx.standardDistance() * (0.9 + 0.035 * Math.sin((t * TAU) / 23));
      cam = pose(new THREE.Vector3(0, Math.sin(e), Math.cos(e)).multiplyScalar(dist), new THREE.Vector3(), ctx.fov);
    } else if (id === 'sensor') {
      // Sensori: kamera renkaan aukon edessä, katse sisäpinnan sensoripariin (LED ja fotodiodi,
      // yksi valopolku); kohde liukuu hitaasti niiden välillä, etäisyys hengittää.
      ringQuat.copy(ctx.heroQuat);
      const mid = (ledTheta + pdTheta) / 2;
      const half = ((pdTheta - ledTheta) / 2) * 1.05;
      const th = mid - half * Math.cos((t * TAU) / 22);
      const thc = th * 0.82;
      const zc = 12.6 + 1.3 * Math.sin((t * TAU) / 15 + 0.7);
      const rc = Ri - 6.4 + 0.6 * Math.sin((t * TAU) / 11);
      const local = (r, a, z) => new THREE.Vector3(r * Math.sin(a), -r * Math.cos(a), z).applyQuaternion(ringQuat);
      cam = pose(local(rc, thc, zc), local(Ri - 0.45, th, 0.15), 30, 0.1);
    } else if (id === 'through') {
      // Läpi: rengas symmetrisesti keskellä akseli kameraa kohti ja pyörii hitaasti oman
      // akselinsa ympäri; kamera liukuu lähemmäs, laskeutuu sisäpinnan tuntumaan ja lentää
      // matalalla LEDin yli renkaan läpi. Silmukan sauma häivytetään taustaan.
      const T = 16;
      const tau = t % T;
      const D0 = ctx.standardDistance() * 1.08;
      const zAt = (x) => {
        if (x < 5.5) return D0 * (1 - 0.08 * smooth(0, 5.5, x));
        if (x < 11.5) return hermite(x, 5.5, 11.5, D0 * 0.92, 0, 22, -7);
        if (x < 16) return hermite(x, 11.5, 16, 22, -7, -34, -15);
        return -34 - 15 * (x - 16);
      };
      // ohitushetki (z = 0): rengas on silloin kiertynyt niin, että LED on suoraan alla
      let lo = 11.5;
      let hi = 16;
      for (let i = 0; i < 24; i++) {
        const m = (lo + hi) / 2;
        if (zAt(m) > 0) lo = m;
        else hi = m;
      }
      const tPass = lo;
      _q.setFromAxisAngle(Z, ((tau - tPass) * TAU) / 52 - ledTheta);
      ringQuat.copy(_q);
      const z = zAt(tau);
      const b = z >= 0 ? smooth(72, 10, z) : smooth(-30, -6, z);
      const y = -Ri * 0.5 * b;
      const look = new THREE.Vector3(0, -(Ri - 0.3) * b, z - (14 - 8 * b));
      cam = pose(new THREE.Vector3(0, y, z), look, 18 + 34 * b, 0.12);
      veil = 1 - smooth(0, 0.9, tau) + smooth(14.4, 15.4, tau);
    } else if (id === 'profile') {
      // Profiili: rengas pystyssä akseli vaakasuorassa, sivupinta osittain kameraan päin;
      // kamera rajaa yläosan, jolloin soikea poikkileikkaus näkyy ääriviivana ja sivupinnan
      // saumat (kuori – rako – lukitusrengas – titaani) erottuvat. Hidas edestakainen kääntö.
      const yaw = deg(-36) + deg(14) * Math.sin((t * TAU) / 28);
      _q.setFromAxisAngle(Y, Math.PI / 2 + yaw);
      ringQuat.setFromAxisAngle(Z, (t * TAU) / 80).premultiply(_q);
      const e = deg(7 + 4 * Math.sin((t * TAU) / 19 + 1));
      const tgt = new THREE.Vector3(0, Ro * 0.55, 0);
      const dist = ctx.standardDistance() * 0.62;
      cam = pose(new THREE.Vector3(0, Math.sin(e), Math.cos(e)).multiplyScalar(dist).add(tgt), tgt, ctx.fov, 1);
    } else {
      // Räjäytys: räjäytetty pino pyörii hitaasti oman akselinsa ympäri (pysyy pystyssä),
      // kamera hengittää korkeutta
      _q.setFromAxisAngle(Z, (t * TAU) / 48);
      ringQuat.copy(ctx.explodedQuat).multiply(_q);
      const e = deg(11 + 5 * Math.sin((t * TAU) / 21));
      const dist = ctx.standardDistance() * 0.98;
      cam = pose(new THREE.Vector3(0, Math.sin(e), Math.cos(e)).multiplyScalar(dist), new THREE.Vector3(), ctx.fov);
    }
    return { ringQuat, cam, veil };
  }
}
