// Sensorien aktiivinen tila.
//
// Oura Ring 5: kaksi tri-LEDiä (vihreä, punainen, infrapuna) ja kaksi fotodetektoria.
// Vihreä + IR mittaavat sykettä, HRV:tä ja hengitystä; punainen + IR veren happisaturaatiota.
// Rengas valitsee kuhunkin tilanteeseen sopivan LEDin ja säätää sen kirkkautta (Smart Sensing).
//
// Havainnollistus: tilat vuorottelevat pehmeällä ristihäivytyksellä, ja valo "hengittää"
// PPG-pulssiaallon tahdissa (62/min). Todellisuudessa LEDit pulssittavat satoja kertoja sekunnissa,
// mikä näkyy silmälle tasaisena valona; vaihteleva on fotodetektorin mittaama heijastus.

const BPM = 62;
const CYCLE = 15; // s: syke 0–9, vaihto, happi 10–14, vaihto
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// PPG-aalto: jyrkkä systolinen nousu, dikroottinen kuoppa ja hidas lasku (0..1)
function ppg(phase) {
  const sys = Math.exp(-(((phase - 0.16) / 0.075) ** 2));
  const dia = 0.38 * Math.exp(-(((phase - 0.44) / 0.11) ** 2));
  return Math.min(1, sys + dia);
}

export class SensorLights {
  constructor(uniforms) {
    this.u = uniforms; // { green, red, ir }
    this.on = false;
    this.level = 0;
    this.t = 0;
  }

  set(on) {
    this.on = on;
    if (on && this.level === 0) this.t = 0;
  }

  get active() {
    return this.on || this.level > 0;
  }

  // Palauttaa tilan nimen tilarivia varten (tai null)
  update(dt) {
    const target = this.on ? 1 : 0;
    const k = 1 - Math.exp(-dt / 0.28);
    this.level += (target - this.level) * k;
    if (Math.abs(this.level - target) < 0.002) this.level = target;
    if (this.level === 0) {
      this.u.green.value = this.u.red.value = this.u.ir.value = 0;
      return null;
    }
    this.t += dt;
    const c = this.t % CYCLE;
    // tilan painot: vihreä ja punainen+IR ristihäivytettynä
    const g = 1 - smooth(9, 10, c) + smooth(14, 15, c);
    const r = 1 - g;
    const beat = ppg((this.t * BPM) / 60 % 1);
    const pulse = 0.82 + 0.18 * beat;
    this.u.green.value = this.level * g * pulse;
    this.u.red.value = this.level * r * pulse;
    // IR multipleksoidaan punaisen kanssa (näkyy himmeänä)
    this.u.ir.value = this.level * (0.35 + 0.65 * r) * pulse;
    return {
      mode: g >= 0.5 ? 'hr' : 'spo2',
      beat,
    };
  }
}
