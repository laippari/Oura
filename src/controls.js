import * as THREE from 'three/webgpu';

// Kosketus- ja hiiriohjaus tuotteen tutkimiseen.
//
//  • 1 sormi / vasen hiiri:     vapaa kierto (trackball, hitaus)
//  • 2 sormea:                  nipistys = zoom kohti sormia, siirto = panorointi, kierto = rulla
//  • rulla / trackpad-nipistys: zoom osoittimen kohtaan
//  • oikea / keski hiiri, shift: panorointi
//  • kaksoisnapautus:           palautus alkunäkymään
//
// Rengasta kierretään (ei kameraa), jolloin studion valot pysyvät paikallaan ja
// heijastukset liukuvat pinnalla kuten oikeaa korua kädessä käänneltäessä.

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _fwd = new THREE.Vector3();

export class InspectControls {
  constructor(dom, { object, camera, view, onInteract, onReset }) {
    this.dom = dom;
    this.object = object;
    this.camera = camera;
    this.view = view; // { zoom, pan: Vector3, getVisibleHeight(), fitDistance }
    this.onInteract = onInteract;
    this.onReset = onReset;

    this.pointers = new Map();
    this.velocity = new THREE.Vector2(); // rad/s kameran ylä- ja oikea-akselin ympäri
    this.rollVelocity = 0;
    this.lastMoveTime = 0;
    this.zoomTarget = view.zoom;
    this.zoomFocus = new THREE.Vector2();
    this.lastTap = { time: 0, x: 0, y: 0 };
    this.tapStart = null;
    this.active = false;
    this.mode = null;
    this.minFloorY = -Infinity;

    this._bind();
  }

  _bind() {
    const el = this.dom;
    el.addEventListener('pointerdown', (e) => this._down(e));
    el.addEventListener('pointermove', (e) => this._move(e));
    el.addEventListener('pointerup', (e) => this._up(e));
    el.addEventListener('pointercancel', (e) => this._up(e));
    el.addEventListener('lostpointercapture', (e) => this._up(e));
    el.addEventListener('wheel', (e) => this._wheel(e), { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('dblclick', (e) => e.preventDefault());
    // Safari: estä sivun omat eleet
    for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
      el.addEventListener(t, (e) => e.preventDefault());
    }
  }

  _cameraBasis() {
    this.camera.updateMatrixWorld();
    const m = this.camera.matrixWorld.elements;
    _right.set(m[0], m[1], m[2]).normalize();
    _up.set(m[4], m[5], m[6]).normalize();
    _fwd.set(-m[8], -m[9], -m[10]).normalize();
  }

  _size() {
    const r = this.dom.getBoundingClientRect();
    return { w: r.width, h: r.height, left: r.left, top: r.top };
  }

  _down(e) {
    e.preventDefault();
    this.dom.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, button: e.button, shift: e.shiftKey });
    this.velocity.set(0, 0);
    this.rollVelocity = 0;
    this.active = true;
    this.onInteract?.();
    if (this.pointers.size === 1) {
      this.tapStart = { x: e.clientX, y: e.clientY, time: e.timeStamp };
      this.mode = e.pointerType === 'mouse' && (e.button === 1 || e.button === 2 || e.shiftKey) ? 'pan' : 'rotate';
    } else {
      this.tapStart = null;
      this.mode = 'multi';
      this._multiPrev = this._multiState();
    }
    this.lastMoveTime = e.timeStamp;
  }

  _multiState() {
    const pts = [...this.pointers.values()];
    const a = pts[0];
    const b = pts[1];
    return {
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }

  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const now = e.timeStamp;
    const dt = Math.max(4, now - this.lastMoveTime) / 1000;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;

    if (this.mode === 'multi' && this.pointers.size >= 2) {
      p.x = e.clientX;
      p.y = e.clientY;
      const s = this._multiState();
      const prev = this._multiPrev;
      const f = prev.dist / s.dist;
      this._zoomAt(this.view.zoom * f, s.cx, s.cy, true);
      this._pan(s.cx - prev.cx, s.cy - prev.cy);
      let da = s.angle - prev.angle;
      if (da > Math.PI) da -= Math.PI * 2;
      if (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) > 1e-4) this._roll(da);
      this._multiPrev = s;
      this.lastMoveTime = now;
      return;
    }

    p.x = e.clientX;
    p.y = e.clientY;
    if (this.tapStart && Math.hypot(e.clientX - this.tapStart.x, e.clientY - this.tapStart.y) > 8) this.tapStart.moved = true;

    if (this.mode === 'pan') {
      this._pan(dx, dy);
    } else if (this.mode === 'rotate') {
      const { w, h } = this._size();
      const k = (3.1 / Math.min(w, h)) * Math.sqrt(Math.max(this.view.zoom, 0.2));
      const ax = dx * k;
      const ay = dy * k;
      this._rotate(ax, ay);
      // tasoitettu kulmanopeus hitautta varten
      const vx = ax / dt;
      const vy = ay / dt;
      this.velocity.x = this.velocity.x * 0.35 + vx * 0.65;
      this.velocity.y = this.velocity.y * 0.35 + vy * 0.65;
    }
    this.lastMoveTime = now;
  }

  _up(e) {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    const now = e.timeStamp;

    if (this.pointers.size === 1) {
      // nipistyksestä takaisin yhden sormen kiertoon
      this.mode = 'rotate';
      this.velocity.set(0, 0);
      this.tapStart = null;
      return;
    }
    if (this.pointers.size > 1) {
      this._multiPrev = this._multiState();
      return;
    }

    this.active = false;
    if (now - this.lastMoveTime > 90) this.velocity.set(0, 0);
    const maxV = 14;
    if (this.velocity.length() > maxV) this.velocity.setLength(maxV);

    // kaksoisnapautus
    if (this.tapStart && !this.tapStart.moved && now - this.tapStart.time < 280) {
      const lt = this.lastTap;
      if (now - lt.time < 340 && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) < 40) {
        this.lastTap = { time: 0, x: 0, y: 0 };
        this.velocity.set(0, 0);
        this.onReset?.();
      } else {
        this.lastTap = { time: now, x: e.clientX, y: e.clientY };
      }
    }
    this.tapStart = null;
    this.mode = null;
  }

  _wheel(e) {
    e.preventDefault();
    this.onInteract?.();
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 16;
    if (e.deltaMode === 2) delta *= 400;
    // trackpad-nipistys (ctrlKey) on herkempi
    const k = e.ctrlKey ? 0.012 : 0.0016;
    const target = this.zoomTarget * Math.exp(delta * k);
    this.zoomTarget = THREE.MathUtils.clamp(target, this.view.minZoom, this.view.maxZoom);
    this.zoomFocus.set(e.clientX, e.clientY);
    this._wheelActive = true;
  }

  // Zoomaa siten, että osoittimen alla oleva piste pysyy paikallaan.
  _zoomAt(zoom, clientX, clientY, immediate) {
    const z0 = this.view.zoom;
    const z1 = THREE.MathUtils.clamp(zoom, this.view.minZoom, this.view.maxZoom);
    if (Math.abs(z1 - z0) < 1e-6) return;
    const { w, h, left, top } = this._size();
    const nx = ((clientX - left) / w) * 2 - 1;
    const ny = -(((clientY - top) / h) * 2 - 1);
    const visH0 = this.view.getVisibleHeight(z0);
    const visW0 = visH0 * (w / h);
    this._cameraBasis();
    const ox = (nx * visW0) / 2;
    const oy = (ny * visH0) / 2;
    const f = 1 - z1 / z0;
    this.view.pan.addScaledVector(_right, ox * f).addScaledVector(_up, oy * f);
    this._clampPan();
    this.view.zoom = z1;
    if (immediate) this.zoomTarget = z1;
  }

  _pan(dxPx, dyPx) {
    const { h } = this._size();
    const visH = this.view.getVisibleHeight(this.view.zoom);
    const s = visH / h;
    this._cameraBasis();
    this.view.pan.addScaledVector(_right, -dxPx * s).addScaledVector(_up, dyPx * s);
    this._clampPan();
  }

  _clampPan() {
    const max = 15;
    if (this.view.pan.length() > max) this.view.pan.setLength(max);
  }

  // Kierto kameran akseleiden ympäri, kääntöpisteenä näkymän keskipiste.
  _rotate(ax, ay) {
    this._cameraBasis();
    _q.setFromAxisAngle(_up, ax);
    _q2.setFromAxisAngle(_right, ay);
    _q.multiply(_q2);
    this._applyWorldRotation(_q);
  }

  _roll(angle) {
    this._cameraBasis();
    _q.setFromAxisAngle(_fwd, angle);
    this._applyWorldRotation(_q);
  }

  _applyWorldRotation(q) {
    const obj = this.object;
    const pivot = this.view.pan;
    _v.copy(obj.position).sub(pivot).applyQuaternion(q).add(pivot);
    obj.position.copy(_v);
    if (obj.position.length() > 16) obj.position.setLength(16);
    if (obj.position.y < this.minFloorY) obj.position.y = this.minFloorY;
    obj.quaternion.premultiply(q).normalize();
  }

  // Palauttaa true, jos jotain liikkui (tarvitaan uusi kuva).
  update(dt) {
    let moving = false;
    if (!this.active) {
      const speed = this.velocity.length();
      if (speed > 0.02) {
        this._rotate(this.velocity.x * dt, this.velocity.y * dt);
        const decay = Math.exp(-dt / 0.38);
        this.velocity.multiplyScalar(decay);
        moving = true;
      } else {
        this.velocity.set(0, 0);
      }
    }
    if (Math.abs(this.zoomTarget - this.view.zoom) > 1e-4 && this.mode !== 'multi') {
      const k = 1 - Math.exp(-dt / 0.09);
      const z = this.view.zoom + (this.zoomTarget - this.view.zoom) * k;
      this._zoomAt(z, this.zoomFocus.x, this.zoomFocus.y, false);
      moving = true;
    }
    return moving || this.active;
  }

  isIdle() {
    return !this.active && this.velocity.lengthSq() === 0 && Math.abs(this.zoomTarget - this.view.zoom) <= 1e-4;
  }

  syncZoom() {
    this.zoomTarget = this.view.zoom;
  }
}
