// Oura Ring 5 – mitat ja mallin parametrit. Kaikki pituudet millimetreinä.
//
// Viralliset luvut (Oura): leveys 6.09 mm, paksuus 2.28 mm, sensorikuvun korkeus 0.7 mm,
// 2 × tri-LED + 2 × fotodiodi, titaaninen ulkokehys + titaaninen sisäkuori, PVD-pinnoite.
//
// Poikkileikkaus on käyttäjän referenssisoikio skaalattuna virallisiin mittoihin; muut
// yksityiskohdat on mitattu Ouran virallisista tuotekuvista (ks. README):
//  • kameran asento sovitettiin 8000 px:n tuotekuvan siluettiin (IoU 0.99), jolloin
//    sivupinnan vyöhykkeet, sensorien paikat ja koot voitiin mitata millimetreinä;
//  • akselin suuntaisista sivukuvista mitattiin sensorien kulma-asemat (perspektiivikorjattu).
// Virallisten kuvien sormus on sisähalkaisijaltaan ≈ 18.5–18.8 mm; katselin näyttää hieman suuremman
// koon (20.2 mm), jolloin sama 2.28 mm:n paksuus näyttää suhteessa ohuemmalta.

export const RING = {
  width: 6.09,
  thickness: 2.28,
  // Katselimen sormus: sisähalkaisija 20.2 mm (≈ US 10.5). Paksuus pysyy virallisena 2.28 mm.
  innerRadius: 10.1,
  // Vertailutila (?match) käyttää virallisten tuotekuvien sormuksen kokoa, jotta kamera ja
  // ääriviiva voidaan tarkistaa niitä vasten: 43°-tuotekuvat (sovitettu siluettiin yhdessä kameran
  // kanssa, IoU 0.995) ja akselin suuntaiset sivukuvat (reiän ja ulkoreunan suhde).
  matchInnerRadius: 9.376,
  matchInnerRadiusAxial: 9.224,

  // Poikkileikkaus: pyöristetty soikio, pyöreä myös sisäpuolelta. Kahden eksponentin superellipsi
  // |z/A|^p + |(r - rc)/B|^q = 1 sovitettu käyttäjän referenssimuotoon (keskivirhe 0.5 px) ja
  // skaalattu virallisiin mittoihin; skaalaus säilyttää eksponentit.
  // Pyöristystä loivennettu varovasti: eksponentit siirretty noin kolmannes referenssistä
  // (p 3.62, q 2.51) kohti virallisen ääriviivan suosimaa muotoa (p 4.52, q 3.07).
  crossSection: { p: 3.9, q: 2.68 },
  // Rakenteen saumat pinnalla (säteittäinen paikka ulkopinnasta, mitattu aksiaalikuvista projisoimalla
  // soikion sivupinnan pisteet ratkaistulla kameralla D = 190.7 mm, f = 24243 px):
  // värillinen kuori | rako | värillinen lukitusrengas | sauma | titaaninen sisäosa
  seams: {
    shellGap: { depthFromOuter: 0.573, halfWidth: 0.05, depth: 0.03, dark: 0.6 },
    ringSeam: { depthFromOuter: 1.023, halfWidth: 0.022, depth: 0.012, dark: 0.45 },
  },

  angularSegments: 480,
  profileMaxStep: 0.06,
  profileMaxTurnDeg: 2.0,
};

// Sensori-ikkunat (mitattu virallisista kuvista). Kulmat kämmenen puolen keskilinjasta.
export const SENSORS = {
  // Paikat kaarena sisäpintaa pitkin kämmenen puolen keskilinjasta (mitattu: 34.25° ja 60° virallisten
  // kuvien 9.224 mm:n säteellä). Fyysinen välimatka pysyy samana sormuksen koosta riippumatta.
  //
  // Linssien muoto ja korkeus mitattiin kolmen virallisen aksiaalikuvan reiän ääriviivasta
  // (tools/measure_lenses.py): LED on loiva pallokupu (säde 6.7 mm, sovitteen jäännös 4 µm) ja
  // fotodiodi tasainen ikkuna (1 µm). Korkeus = huippu sisäpinnan yläpuolella; ne iteroitiin niin,
  // että mallin aksiaaliprofiili osuu virallisiin ±0.01 mm. LEDin huippu on taskun pohjasta
  // 0.69 mm, mikä vastaa Ouran ilmoittamaa 0.7 mm:n kupukorkeutta.
  led: { arcMm: 5.514, height: 0.61, domeRadius: 6.7, edgeRadius: 0.15 },
  pd: { arcMm: 9.659, height: 0.365, domeRadius: null, edgeRadius: 0.12 },
  // halfLength kehän suunnassa (aksiaalikuvien linssin reunat ±9.6°), halfWidth akselin suunnassa
  lens: { halfLength: 1.55, halfWidth: 1.6, corner: 0.72 },
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
  { id: 'silver', name: 'Silver', f0: [0.69, 0.69, 0.69], roughness: 0.055, aniso: 0, brushed: 0, swatch: ['#f4f4f4', '#9a9a9a'] },
  { id: 'black', name: 'Black', f0: [0.049, 0.049, 0.049], roughness: 0.06, aniso: 0, brushed: 0, swatch: ['#5a5a5c', '#0c0c0d'] },
  { id: 'stealth', name: 'Stealth', f0: [0.164, 0.164, 0.164], roughness: 0.5, aniso: 0, brushed: 0, bead: 1, swatch: ['#3a3a3b', '#1d1d1e'] },
  { id: 'brushed-silver', name: 'Brushed Silver', f0: [0.63, 0.63, 0.63], roughness: 0.28, aniso: 0.1, brushed: 1, swatch: ['#e2e2e2', '#a8a8a8'] },
  { id: 'gold', name: 'Gold', f0: [0.93, 0.78, 0.51], roughness: 0.055, aniso: 0, brushed: 0, swatch: ['#f3e6c8', '#b89a62'] },
  { id: 'deep-rose', name: 'Deep Rose', f0: [0.625, 0.37, 0.27], roughness: 0.055, aniso: 0, brushed: 0, swatch: ['#efcdb9', '#8f5a45'] },
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

// Räjäytyskuva (Ouran julkaiseman räjäytysanimaation järjestys ylhäältä alas): lukitusrengas,
// titaaninen sisäkuori, akku, runkorengas, värillinen ulkokuori, piirilevy, tiivisteet,
// sensorit, lukitusrengas. Siirto akselin suuntaan (mm, + = ylös räjäytetyssä asennossa) ja
// liikkeellelähdön järjestys (0 = ensin).
export const EXPLODE = {
  parts: {
    lockA: { offset: 33, order: 0 },
    inner: { offset: 23, order: 2 },
    battery: { offset: 13.5, order: 3 },
    frame: { offset: 5, order: 4 },
    outer: { offset: -4.5, order: 4 },
    pcb: { offset: -13.5, order: 3 },
    gaskets: { offset: -20.5, order: 2 },
    sensors: { offset: -27, order: 1 },
    lockB: { offset: -34, order: 0 },
  },
  // asento räjäytettynä (Euler YXZ, astetta): akseli pystyssä, yläpää 18° kameraan päin,
  // sensorit takaseinällä linssit kameraan päin (kuten Ouran räjäytyskuvassa)
  euler: [-108, 168, 0],
  halfHeight: 42, // pinon puolikorkeus kuvassa marginaaleineen (kameran sovitus, lattia)
};
