# Oura Ring 5 – 3D-malli

Oura Ring 5 fysikaalisesti renderöitynä mobiililaitteelle, kaikilla kuudella virallisella
värillä. Muoto, rakenne ja sensorit on **mitattu Ouran virallisista tuotekuvista** ja
validoitu niitä vasten (ks. alla). Käyttöliittymänä on vain mallin kääntäminen ja tutkiminen
sekä värivalitsin.

## Avaaminen

```sh
python3 -m http.server 8000      # → http://localhost:8000
```

Sivu toimii myös GitHub Pagesissa (repo root). three.js ladataan jsDelivr-CDN:stä
(`three@0.186.1`, lukittu versio).

| Ele | Toiminto |
| --- | --- |
| 1 sormi / hiiren vasen | vapaa kierto, hitaus |
| 2 sormea | nipistys = zoom sormien kohtaan, siirto = panorointi, kierto = rulla |
| rulla / trackpad | zoom osoittimen kohtaan |
| kaksoisnapautus | paluu alkunäkymään |
| värinapit | Silver · Black · Stealth · Brushed Silver · Gold · Deep Rose |

## Mitä mallissa on

**Mitat:** leveys 6,09 mm ja paksuus 2,28 mm (viralliset). Sisähalkaisija on 21,9 mm, eli
sama koko kuin virallisissa tuotekuvissa, jotta malli on suoraan verrattavissa niihin.

**Poikkileikkaus.** Sivupinnalla on kolme osaa, kuten Ouran purkukuvassa: värillinen kuori, ohut
värillinen lukitusrengas ja pyöreäreunainen titaaninen sisäosa. Säteittäiset rajat on mitattu
akselin suuntaisista tuotekuvista ja muoto 43°-tuotekuvan ääriviivasta (ks. *Miten muoto
validoitiin*). Syvyydet on mitattu ulkopinnasta:

| Osa | Mitta | Materiaali |
| --- | --- | --- |
| tasainen ulkopinta | – | PVD-väri |
| kuoren reuna: kaarevuus kasvaa tasaisesti (θ ∝ s^2,8) | ulottuma 1,22 mm, syvyys 0,515 mm, loppusäde ≈ 0,34 mm | PVD-väri |
| rako kuoren ja lukitusrenkaan välissä | 0,52–0,61 mm | – |
| lukitusrengas (pyöristetyt reunat, tasainen pinta 0,695–1,065 mm) | 0,61–1,11 mm | PVD-väri |
| sauma | 1,11–1,16 mm | – |
| titaaninen sisäosa: loivasti kupera pinta, 0,08 mm:n pyöristys reikään | 1,16 mm → reikä | titaani |

PVD-väri on kuoressa ja lukitusrenkaassa (Ouran purkukuvassa kultaiset ohuet renkaat
molemmilla puolilla). Titaaninen sisäosa ja reiän pinta ovat kaikissa väreissä hopeisia.

**Sensorit:** neljä erillistä ikkunaa kämmenen puolella.
- **Sijainnit:** 2 × tri-LED ±34° ja 2 × fotodiodi ±60° keskilinjasta.
- **Ikkuna:** kirkas, tasakattoinen linssi, kooltaan 3,8 × 3,2 mm ja kulmasäteeltään 0,75 mm.
  Linssin yläreuna on pyöristetty. Linssi on viistereunaisessa upotuksessa, ja sen ympärillä
  on tumma tiivisterako.
- **Linssien korkeus:** LED 0,78 mm ja fotodiodi 0,60 mm (virallinen kupukorkeus on 0,7 mm).
- **Tri-LED:** valkoinen keraaminen alusta, vihreä emitterialue isolla sirulla ja kapea
  punainen/IR-alue, jossa kaksi pientä sirua ristielektrodeineen ja kultaisine bondilankoineen.
  Punainen alue on keskilinjan puolella.
- **Fotodiodi:** heijastuksenestopinnoitettu piisiru, hienot metallisormet ja kaksi bondipadia.

**Muut yksityiskohdat:**
- suuntausmerkki ulkopinnalla kämmenen puolella: stadionin muotoinen matala upotus, 3,1 × 1,8 mm
  (lataustelakan tuotekuvasta)
- sisäpinnan yläosan tasainen levy

**Värit** (metallin F0 kalibroitu virallisia kuvia vasten): Silver, Black, Stealth (mattamusta),
Brushed Silver (kehän suuntainen harjaus, anisotrooppinen), Gold (vaalea moderni kulta) ja
Deep Rose (kuparinruusu).

## Miten muoto validoitiin

1. **Aksiaaliset sivukuvat (3840 px, Deep Rose, Black, Brushed Silver)** (`tools/axial_features.py`).
   - **Osien tunnistus:** sivupinnan osat näkyvät samankeskisinä renkaina. Värillinen ja
     titaaninen osa erotetaan värikylläisyydestä. Tasainen pinta erottuu vakiokirkkaudesta,
     kaareva pinta tasaisesta liukumasta.
   - **Perspektiivikamera** ratkaistaan kolmesta havainnosta: reiän reuna, reiän pinnan lähin
     pää ja ulkoreuna. Tulos on D ≈ 120 mm ja 112 px/mm sivupinnalla.
   - **Riippumaton tarkistus:** sama tasainen lukitusrenkaan vyö näkyy 43°-kuvan ylä- ja
     alaosassa syvyyksillä 0,99–1,32 ja 0,36–0,74 mm. Niiden keskiarvo 0,675–1,03 mm vastaa
     aksiaalista mittausta (0,695–1,065 mm) 0,03 mm:n tarkkuudella.
2. **Muoto 43°-ääriviivasta** (`tools/fit_camera.py`, `tools/fit_profile.py`). Rengas on
   pyörähdyskappale, joten ääriviiva riippuu vain poikkileikkauksesta ja kamerasta, ei
   valaistuksesta.
   - **Sovitettavat parametrit:** kuoren reunan kaarevuuden kasvu, sen kääntymiskulma ja
     sisäosan reunan muoto sovitetaan yhdessä kameran kanssa. Aksiaaliset säteet pysyvät kiinteinä.
   - **Kuoren reuna:** päätyy 90° kääntymiskulmaan. Yli 90° kaartuva, täysin pyöreä reuna ei
     paranna sovitusta.
   - **Reiän reuna:** ääriviiva vaatii reiän pinnan ulottuvan noin 0,07 mm:n päähän
     sivupinnasta. Pyöristyksen säde voi siksi olla enintään noin 0,09 mm.

   | Profiili | IoU | Ääriviivavirhe keskim. | 95 % | max |
   | --- | --- | --- | --- | --- |
   | toteutettu 3D-malli, renderöity (`?match&mask`) | 0,992 | 0,019 mm | 0,046 mm | 0,062 mm |

   Tarkistustyökalu: `tools/compare_silhouette.py`.
3. **Avoin ristiriita:** lukitusrenkaan vyö näkyy 43°-kuvassa sekä ylä- että alaosassa noin
   5–10 px (0,2–0,45 mm) alempana kuin mikään ääriviivaan sopiva kamera ennustaa.
   - **Kokeillut selitykset:** kuoren ja lukitusrenkaan keskinäinen syvyys (−0,15 … +0,4 mm)
     ja yli 90° kaartuva kuoren reuna. Kumpikaan ei sovita vyötä ja ääriviivaa yhtä aikaa.
   - **Ratkaisu:** malli perustuu johdonmukaisiin havaintoihin eli ääriviivaan ja aksiaalisiin
     säteisiin. Kuori ja lukitusrengas ovat samassa tasossa.
4. **Rinnakkaisrenderöinnit** virallisen kuvan kameralla: `?match` (43°) ja `?match=axial`
   (akselin suunta). Studiovalaistus on säädetty niin, että sivupinnan ylä- ja alaosa näyttävät
   samoilta kuin virallisessa kuvassa.

Virallisia kuvia ei ole tallennettu repoon. Ne löytyvät Ouran kauppasivulta
(ouraring.com/store/rings/oura-ring-5).

**Arvioita:** suuntausmerkin ja yläosan levyn tarkka syvyys, sensorikomponenttien sisäiset
mitat (kokoluokka kuvista), rakojen syvyydet ja titaanisen sisäosan pinnan tarkka kaarevuus.
Niitä ei näe ääriviivasta. Oura ei julkaise CAD-malleja.

## Renderöinti

- **WebGPU** three.js:n `WebGPURenderer`illä (TSL → WGSL). Jos WebGPU ei ole saatavilla,
  käytetään automaattisesti WebGL 2:ta. Käytössä oleva taustajärjestelmä näkyy oikeassa
  yläkulmassa.
- **Studio:** kirkas tuotekuvausstudio, jossa on valoisa yläpuolisko, tumma horisontti ja
  vaalea pöytä, kuten virallisissa kuvissa. Valaistus esisuodatetaan PMREM-kartaksi.
- **Sisäpinnan heijastukset:** kiillotettu sisäpinta heijastaa vastakkaista seinäänsä. Tämä
  lasketaan sävyttimessä analyyttisesti sylinteriä vasten (3 pomppua, Fresnel jokaisella
  pompulla).
- **Linssit:** kirkkaat linssit ovat oikeaa valoa läpäisevää ja taittavaa materiaalia.
- **Varjo:** pehmeä VSM-kontaktivarjo.
- **Laatu:** liikkeessä 4× MSAA, pysähtyneenä kertaalleen 8× SSAA. Kuva piirretään vain kun
  jokin muuttuu, ja resoluutio mukautuu laitteen nopeuteen.

### URL-parametrit

| Parametri | Toiminto |
| --- | --- |
| `?finish=gold` | alkuväri |
| `?webgl` | pakota WebGL 2 |
| `?still` | ei automaattista pyörintää |
| `?match` | virallisen tuotekuvan kamera ja valkoinen tausta (validointi) |
| `?match&mask` | sama siluettina ääriviivavertailua varten |
| `?match=axial` | akselin suuntaisen sivukuvan kamera |
| `?nohq` | ei SSAA:ta |
| `?rot=x,y,z&zoom=…&pan=x,y,z` | alkunäkymä |

## Rakenne

```
index.html                 sivu, import map, värivalitsin
src/config.js              mitat, sensorit, värit (mitatut arvot)
src/geometry/profile.js    poikkileikkaus (janat, kaaret, Bézier) ja adaptiivinen näytteistys
src/geometry/band.js       rungon tessellointi, materiaaliryhmät
src/geometry/features.js   sensori-ikkunat, linssit, LED/PD-komponentit, merkki, levy
src/materials.js           PBR-materiaalit, värit, sisäheijastukset, laikkumaskit
src/studio.js              studioympäristö, tausta, varjo
src/controls.js            kosketus- ja hiiriohjaus
src/main.js                renderöijä, jälkikäsittely, renderöintisilmukka, vertailutila
tools/                     validointityökalut: aksiaalikuvan mittaus, kameran ja profiilin
                           sovitus, ääriviivavertailu
```

Malli on itsenäinen havainnollistus. Se ei ole Ouran virallinen CAD-aineisto eikä käytä
Ouran logoja.
