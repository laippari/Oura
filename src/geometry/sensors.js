import * as THREE from 'three/webgpu';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// Sensorikuvut sisäpinnalla (kämmenen puoli).
//
// Oura Ring 5: kaksi tri-LEDiä (vihreä / punainen / IR) ja kaksi fotodiodia,
// 12 signaalipolkua (2 LED × 3 aallonpituutta × 2 PD), kuvun korkeus 0.7 mm,
// "flat-top", kotelot työntyvät titaanikuoren läpi lähemmäs ihoa.
//
// Kumpikin kupu sisältää yhden tri-LEDin ja yhden fotodiodin sekä niiden välisen
// optisen valoesteen. Kupu on tummaksi sävytettyä optista hartsia, jonka läpi
// komponentit näkyvät himmeästi.

const spow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);

export function createSensorModel(profile, cfg) {
  const A = cfg.halfLength;
  const B = cfg.halfWidth;
  const H = cfg.height;
  const n = cfg.footprintExponent;
  const k = cfg.shoulderK;
  const m = cfg.shoulderM;
  const R0 = profile.innerRadiusAt(0);

  const rho = (u, v) => Math.pow(Math.pow(Math.abs(u) / A, n) + Math.pow(Math.abs(v) / B, n), 1 / n);
  const heightAt = (u, v) => {
    const r = rho(u, v);
    if (r >= 1) return 0;
    return H * Math.pow(1 - Math.pow(r, k), 1 / m);
  };

  // Kartoitus paikallisesta (u = kaari kehän suuntaan, v = akseli, h = korkeus sisäänpäin)
  // renkaan koordinaatistoon.
  const map = (thetaC, u, v, h, out) => {
    const th = thetaC + u / R0;
    const r = profile.innerRadiusAt(v) - h;
    out[0] = r * Math.sin(th);
    out[1] = -r * Math.cos(th);
    out[2] = v;
    return out;
  };

  // Paikallinen kehys pisteessä (u, v, h): X = kehän tangentti, Y = sisäänpäin, Z = akseli.
  const frameAt = (thetaC, u, v, h) => {
    const th = thetaC + u / R0;
    const p = map(thetaC, u, v, h, [0, 0, 0]);
    const X = new THREE.Vector3(Math.cos(th), Math.sin(th), 0);
    const Y = new THREE.Vector3(-Math.sin(th), Math.cos(th), 0);
    const Z = new THREE.Vector3(0, 0, 1);
    const mtx = new THREE.Matrix4().makeBasis(X, Y, Z);
    mtx.setPosition(p[0], p[1], p[2]);
    return mtx;
  };

  // --- Kupu --------------------------------------------------------------
  function domeGeometry(thetaC) {
    const nR = 56;
    const nPhi = 200;
    const verts = [];
    const norms = [];
    const uvs = [];
    const idx = [];
    const P = [0, 0, 0];
    const a = [0, 0, 0];
    const b = [0, 0, 0];
    const c = [0, 0, 0];
    const d = [0, 0, 0];
    const e = 1e-4;
    const center = new THREE.Vector3(-Math.sin(thetaC), Math.cos(thetaC), 0);

    for (let i = 0; i <= nR; i++) {
      const t = i / nR;
      const r = 1 - Math.pow(1 - t, 2.4); // tiheämmin reunalla, jossa olkapää kaartuu
      for (let j = 0; j <= nPhi; j++) {
        const phi = (j / nPhi) * Math.PI * 2;
        const u = A * r * spow(Math.cos(phi), 2 / n);
        const v = B * r * spow(Math.sin(phi), 2 / n);
        const h = heightAt(u, v);
        map(thetaC, u, v, h, P);
        verts.push(P[0], P[1], P[2]);
        uvs.push(u / (2 * A) + 0.5, v / (2 * B) + 0.5);
        if (i === 0) {
          norms.push(center.x, center.y, center.z);
          continue;
        }
        // normaali korkeuskentän osittaisderivaatoista
        const uu = r >= 0.9999 ? u * 0.9999 : u;
        const vv = r >= 0.9999 ? v * 0.9999 : v;
        map(thetaC, uu + e, vv, heightAt(uu + e, vv), a);
        map(thetaC, uu - e, vv, heightAt(uu - e, vv), b);
        map(thetaC, uu, vv + e, heightAt(uu, vv + e), c);
        map(thetaC, uu, vv - e, heightAt(uu, vv - e), d);
        const tu = new THREE.Vector3(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        const tv = new THREE.Vector3(c[0] - d[0], c[1] - d[1], c[2] - d[2]);
        const N = new THREE.Vector3().crossVectors(tu, tv).normalize();
        // käännä osoittamaan renkaan sisään (kohti akselia)
        if (N.dot(center) < 0) N.negate();
        if (!Number.isFinite(N.x)) N.copy(center);
        norms.push(N.x, N.y, N.z);
      }
    }
    const row = nPhi + 1;
    for (let i = 0; i < nR; i++) {
      for (let j = 0; j < nPhi; j++) {
        const p0 = i * row + j;
        const p1 = p0 + 1;
        const p2 = p0 + row;
        const p3 = p2 + 1;
        idx.push(p0, p1, p2, p1, p3, p2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(norms, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    fixWinding(geo, center);
    geo.computeBoundingSphere();
    return geo;
  }

  // Kapea tumma rako kuvun ja titaanikuoren aukon välissä + kuvun alla oleva pohja.
  function footprintRing(thetaC, r0, r1, h, segs = 200) {
    const verts = [];
    const idx = [];
    const P = [0, 0, 0];
    const rings = r0 === 0 ? 12 : 3;
    for (let i = 0; i <= rings; i++) {
      const r = r0 + ((r1 - r0) * i) / rings;
      for (let j = 0; j <= segs; j++) {
        const phi = (j / segs) * Math.PI * 2;
        const u = A * r * spow(Math.cos(phi), 2 / n);
        const v = B * r * spow(Math.sin(phi), 2 / n);
        map(thetaC, u, v, h, P);
        verts.push(P[0], P[1], P[2]);
      }
    }
    const row = segs + 1;
    for (let i = 0; i < rings; i++) {
      for (let j = 0; j < segs; j++) {
        const p0 = i * row + j;
        idx.push(p0, p0 + 1, p0 + row, p0 + 1, p0 + row + 1, p0 + row);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const center = new THREE.Vector3(-Math.sin(thetaC), Math.cos(thetaC), 0);
    fixWinding(geo, center);
    // tasainen normaali kohti akselia
    const nrm = geo.getAttribute('normal');
    for (let i = 0; i < nrm.count; i++) {
      const x = verts[i * 3];
      const y = verts[i * 3 + 1];
      const l = Math.hypot(x, y);
      nrm.setXYZ(i, -x / l, -y / l, 0);
    }
    return geo;
  }

  return {
    A,
    B,
    H,
    R0,
    heightAt,
    domeGeometry,
    footprintRing,
    frameAt,
    map,
  };
}

// Varmistaa, että kolmioiden kiertosuunta vastaa normaaleja (etupuoli kohti akselia).
function fixWinding(geo, inward) {
  const idx = geo.index.array;
  const pos = geo.attributes.position.array;
  // tarkista ensimmäinen ei-degeneroitu kolmio
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-12) continue;
    const dot = nx * inward.x + ny * inward.y + nz * inward.z;
    if (dot < 0) {
      for (let i = 0; i < idx.length; i += 3) {
        const tmp = idx[i + 1];
        idx[i + 1] = idx[i + 2];
        idx[i + 2] = tmp;
      }
    }
    return;
  }
}

// --- Komponentit kuvun sisällä --------------------------------------------
// Palauttaa ryhmän yhdelle kuvulle. dir = suunta kohti kämmenen keskilinjaa (+1/-1).
export function createSensorInternals(sensor, thetaC, dir, mats) {
  const group = new THREE.Group();
  group.name = 'sensor-internals';

  const place = (obj, u, v, h) => {
    const m = sensor.frameAt(thetaC, u, v, h);
    obj.matrixAutoUpdate = false;
    obj.matrix.multiplyMatrices(m, obj.matrix.clone());
    group.add(obj);
    return obj;
  };

  const base = 0.15; // komponenttien pohja kuoren pinnasta

  // Tri-LED -paketti (valkoinen heijastinrunko, kolme sirua, kultaiset bondilangat)
  {
    const uLED = dir * 0.66;
    const pkg = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(0.98, 0.22, 0.8, 2, 0.035), mats.ledBody);
    body.position.y = 0.11;
    pkg.add(body);
    // heijastinkuppi: hieman tummempi sisäpinta
    const cup = new THREE.Mesh(new RoundedBoxGeometry(0.74, 0.012, 0.66, 2, 0.006), mats.ledCup);
    cup.position.y = 0.222;
    pkg.add(cup);
    const dies = [mats.dieGreen, mats.dieRed, mats.dieIR];
    const dieGeo = new THREE.BoxGeometry(0.19, 0.075, 0.19);
    const padGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.012, 20);
    const wireMat = mats.gold;
    for (let i = 0; i < 3; i++) {
      const vz = (i - 1) * 0.22;
      const ux = -dir * 0.14;
      const die = new THREE.Mesh(dieGeo, dies[i]);
      die.position.set(ux, 0.228 + 0.0375, vz);
      pkg.add(die);
      const pad = new THREE.Mesh(padGeo, wireMat);
      pad.position.set(ux, 0.228 + 0.075 + 0.006, vz);
      pkg.add(pad);
      // johdinkehyksen pad
      const lead = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.14), wireMat);
      lead.position.set(dir * 0.28, 0.228, vz);
      pkg.add(lead);
      // bondilanka kaarena sirulta johdinkehykselle
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(ux, 0.316, vz),
        new THREE.Vector3(ux + dir * 0.05, 0.4, vz),
        new THREE.Vector3(dir * 0.15, 0.37, vz),
        new THREE.Vector3(dir * 0.28, 0.236, vz),
      ]);
      const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.0085, 6, false), wireMat);
      pkg.add(wire);
    }
    pkg.updateMatrix();
    place(pkg, uLED, 0, base);
  }

  // Fotodiodi (musta runko, violetinsininen heijastuksenestopinnoitettu piisiru)
  {
    const uPD = -dir * 0.66;
    const pkg = new THREE.Group();
    const body = new THREE.Mesh(new RoundedBoxGeometry(1.18, 0.2, 1.18, 2, 0.035), mats.pdBody);
    body.position.y = 0.1;
    pkg.add(body);
    const chip = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.03, 0.92), mats.silicon);
    chip.position.y = 0.215;
    pkg.add(chip);
    // alumiininen kokoojakisko ja sormet
    const bus = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.86), mats.aluminium);
    bus.position.set(dir * 0.42, 0.234, 0);
    pkg.add(bus);
    for (let i = 0; i < 5; i++) {
      const finger = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.006, 0.012), mats.aluminium);
      finger.position.set(dir * 0.02, 0.233, -0.36 + i * 0.18);
      pkg.add(finger);
    }
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.01, 0.1), mats.gold);
    pad.position.set(dir * 0.42, 0.238, -0.36);
    pkg.add(pad);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(dir * 0.42, 0.243, -0.36),
      new THREE.Vector3(dir * 0.47, 0.33, -0.41),
      new THREE.Vector3(dir * 0.53, 0.29, -0.47),
      new THREE.Vector3(dir * 0.56, 0.205, -0.5),
    ]);
    pkg.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.0085, 6, false), mats.gold));
    pkg.updateMatrix();
    place(pkg, uPD, 0, base - 0.01);
  }

  // Optinen valoeste LEDin ja fotodiodin välissä
  {
    const wall = new THREE.Mesh(new RoundedBoxGeometry(0.12, 0.44, 1.62, 2, 0.03), mats.barrier);
    wall.position.y = 0.23;
    wall.updateMatrix();
    const holder = new THREE.Group();
    holder.add(wall);
    holder.updateMatrix();
    place(holder, dir * 0.06, 0, 0.02);
  }

  group.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return group;
}
