// Räjäytyskuvan animaatio: kappaleet liukuvat akselin suuntaan (paikallinen z) omiin
// kohtiinsa porrastetusti. Kokoamisessa järjestys kääntyy automaattisesti (sama funktio
// globaalista edistymästä). Sisäosat näytetään vain avattuna.

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Exploder {
  constructor({ duration = 1.9, stagger = 0.055 } = {}) {
    this.parts = [];
    this.duration = duration;
    this.stagger = stagger;
    this.g = 0; // globaali edistyminen 0..1
    this.target = 0;
  }

  // order: liikkeellelähdön järjestys (0 = ensin)
  add(obj, offset, { order = 0, internal = false } = {}) {
    this.parts.push({ obj, offset, order, internal });
    return obj;
  }

  set(on) {
    this.target = on ? 1 : 0;
  }

  get on() {
    return this.target === 1;
  }

  get moving() {
    return this.g !== this.target;
  }

  // sileä kokonaisedistyminen (kamera, lattia, kierto)
  get eased() {
    return easeInOut(this.g);
  }

  update(dt) {
    if (this.g !== this.target) {
      const step = dt / this.duration;
      this.g = this.target > this.g ? Math.min(this.target, this.g + step) : Math.max(this.target, this.g - step);
    }
    const maxOrder = Math.max(0, ...this.parts.map((p) => p.order));
    const span = 1 - maxOrder * this.stagger;
    for (const p of this.parts) {
      const local = easeInOut(Math.min(1, Math.max(0, (this.g - p.order * this.stagger) / span)));
      p.obj.position.z = p.offset * local;
      if (p.internal) p.obj.visible = this.g > 0.001;
    }
    return this.g;
  }
}
