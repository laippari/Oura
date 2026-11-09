// Oura Ring 5 – mitat ja mallin parametrit.
// Kaikki pituudet millimetreinä (1 yksikkö = 1 mm).
//
// Viralliset luvut (Oura, "Discover Oura Ring 5" / "Introducing Oura Ring 5"):
//   leveys 6.09 mm, paksuus 2.28 mm, sensorikuvun korkeus 0.7 mm,
//   2 × tri-LED + 2 × fotodiodi (12 signaalipolkua), titaanirunko + titaaninen sisäkuori,
//   PVD-pinnoite, suuntausmerkki (kuoppa) kämmenen puolella.
// Muut muodot (profiilin kaarevuudet, kupujen jalanjälki ja sijoittelu) on arvioitu
// tuotekuvien ja Ring 4:n rakenteen perusteella.

export const RING = {
  width: 6.09,
  thickness: 2.28,
  innerDiameter: 18.95, // US-koko 9

  // Poikkileikkaus: kaksi superellipsin puolikasta, jotka kohtaavat sivuilla
  // pystysuorin tangentein (G2-jatkuva, "pillow"-profiili).
  innerHalfHeight: 0.86, // sisäpuolikkaan korkeus jakolinjasta
  outerExponent: 2.3, // ulkopinnan kaarevuus (2 = ellipsi, suurempi = kulmikkaampi)
  innerExponent: 3.7, // sisäpinnan "comfort fit" -muoto

  // Sisäkuoren ja ulkokehyksen välinen hiussauma sivupinnoilla
  seam: { t: 0.34, width: 0.018, depth: 0.011 },

  // Suuntauskuoppa ulkopinnalla, kämmenen puolella (θ = 0)
  dimple: { halfArc: 0.17, halfAxial: 0.5, depth: 0.03 },

  // Tessellointi
  angularSegments: 420,
  profileMaxStep: 0.07,
  profileMaxTurnDeg: 1.25,
};

export const SENSORS = {
  height: 0.7, // virallinen kuvun korkeus
  halfLength: 1.68, // kehän suuntaan
  halfWidth: 1.14, // akselin suuntaan
  footprintExponent: 3.4,
  shoulderK: 4.2, // tasaisen "flat-top" -kuvun olkapään muoto
  shoulderM: 2.3,
  angle: 0.305, // kupujen keskikohdat ±θ kämmenen puolen keskilinjasta (rad)
};

export const VIEW = {
  fov: 26,
  elevationDeg: 13,
  fitMargin: 1.18,
  minZoom: 0.11,
  maxZoom: 1.6,
  // alkuasento (astetta, järjestys YXZ)
  heroEuler: [24, -36, 0],
};
