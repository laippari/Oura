// Oura Ring 5 – mitat ja mallin parametrit. Kaikki pituudet millimetreinä.
//
// Viralliset luvut (Oura): leveys 6.09 mm, paksuus 2.28 mm, sensorikuvun korkeus 0.7 mm,
// 2 × tri-LED + 2 × fotodiodi, titaaninen ulkokehys + titaaninen sisäkuori, PVD-pinnoite.
//
// Muoto ja yksityiskohdat on mitattu Ouran virallisista tuotekuvista (ks. README):
//  • kameran asento sovitettiin 8000 px:n tuotekuvan siluettiin (IoU 0.99), jolloin
//    sivupinnan vyöhykkeet, sensorien paikat ja koot voitiin mitata millimetreinä;
//  • akselin suuntaisista sivukuvista mitattiin sensorien kulma-asemat (perspektiivikorjattu).
// Virallisten kuvien sormus on kooltaan sisähalkaisijaltaan ≈ 21.8 mm; malli käyttää samaa kokoa,
// jotta se on suoraan verrattavissa kuviin.

export const RING = {
  width: 6.09,
  thickness: 2.28,
  innerRadius: 10.938,

  // Sivupinnan rakenne (säteittäiset mitat ulkopinnasta, mm) – mitattu aksiaalisista
  // tuotekuvista (tools/axial_features.py), muoto 43°-kuvan ääriviivasta (tools/fit_profile.py).
  // Kuoren reuna: kaarevuus kasvaa tasaisesti (theta ~ s^(ramp+1)) 1.22 mm:n matkalla ja päättyy
  // sivupinnan tasoon pyöreästi (loppusäde ≈ 0.34 mm). Sovitettu 43°-kuvan ääriviivaan (tools/fit_profile.py).
  corner: { drop: 0.515, ramp: 1.8, endAngleDeg: 90, recess: 0.0 },
  shellGap: { shellWall: 0.545, depth: 0.12, edge: 0.03 }, // rako kuoren ja lukitusrenkaan välissä
  lockingRing: { outer: 0.61, inner: 1.11, recess: 0.0, outerEdge: 0.085, innerEdge: 0.04 },
  seam: { depth: 0.12 }, // sauma lukitusrenkaan ja titaanisen sisäosan välissä
  // Titaaninen sisäosa: pyöreä reuna sivupinnan tasosta (korkeus reiän pinnasta) reiän pintaan
  innerEdge: { height: 1.09, edgeRadius: 0.08, edgeInset: 0.024, recess: 0.1, topEdge: 0.03 },

  angularSegments: 480,
  profileMaxStep: 0.06,
  profileMaxTurnDeg: 2.0,
};

// Sensori-ikkunat (mitattu virallisista kuvista). Kulmat kämmenen puolen keskilinjasta.
export const SENSORS = {
  led: { angleDeg: 34, height: 0.78 },
  pd: { angleDeg: 60, height: 0.6 },
  lens: { halfLength: 1.9, halfWidth: 1.6, corner: 0.75, edgeRadiusLED: 0.56, edgeRadiusPD: 0.44 },
  pocket: { margin: 0.13, depth: 0.08, bevel: 0.07 },
};

// Muut pinnan yksityiskohdat
export const FEATURES = {
  // Suuntausmerkki ulkopinnalla kämmenen puolella (θ = 0): stadionin muotoinen upotus
  mark: { halfLength: 0.9, halfWidth: 1.55, corner: 0.88, depth: 0.05, bevel: 0.05 },
  // Sisäpinnan yläosan tasainen levy (θ = 180°)
  pad: { halfLength: 2.3, halfWidth: 1.4, corner: 0.9, depth: 0.018, bevel: 0.04 },
};

// Viralliset värivaihtoehdot. Ulkokehys saa värin, sisäkuori on aina luonnonvärinen titaani.
// F0 = metallin heijastusväri lineaarisena sRGB:nä (kalibroitu virallisia kuvia vasten).
export const FINISHES = [
  { id: 'silver', name: 'Silver', f0: [0.64, 0.63, 0.61], roughness: 0.055, aniso: 0, brushed: 0, swatch: ['#f4f4f4', '#9a9a9a'] },
  { id: 'black', name: 'Black', f0: [0.042, 0.042, 0.045], roughness: 0.06, aniso: 0, brushed: 0, swatch: ['#5a5a5c', '#0c0c0d'] },
  { id: 'stealth', name: 'Stealth', f0: [0.075, 0.075, 0.078], roughness: 0.45, aniso: 0, brushed: 0, bead: 1, swatch: ['#3a3a3b', '#1d1d1e'] },
  { id: 'brushed-silver', name: 'Brushed Silver', f0: [0.63, 0.62, 0.605], roughness: 0.27, aniso: 0, brushed: 1, swatch: ['#e2e2e2', '#a8a8a8'] },
  { id: 'gold', name: 'Gold', f0: [0.9, 0.78, 0.56], roughness: 0.055, aniso: 0, brushed: 0, swatch: ['#f3e6c8', '#b89a62'] },
  { id: 'deep-rose', name: 'Deep Rose', f0: [0.79, 0.555, 0.45], roughness: 0.055, aniso: 0, brushed: 0, swatch: ['#efcdb9', '#8f5a45'] },
];

export const VIEW = {
  fov: 18,
  elevationDeg: 10,
  fitMargin: 1.12,
  minZoom: 0.09,
  maxZoom: 1.6,
  // Alkuasento: sama suhteellinen kulma kuin Ouran virallisessa tuotekuvassa (43.5°)
  heroEuler: [33.5, 0, 0],
};
