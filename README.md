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

**Poikkileikkaus.** Pyöristetty soikio, joka on pyöreä myös sisäpuolelta. Muoto on otettu
käyttäjän antamasta referenssikuvasta: sen ääriviivaan sovitettiin kahden eksponentin superellipsi

    |z / A|^3,62 + |(r − rc) / B|^2,51 = 1

(keskivirhe 0,5 px referenssikuvassa). Se on skaalattu Ouran virallisiin mittoihin
6,09 × 2,28 mm (A = 3,045, B = 1,14). Skaalaus säilyttää eksponentit, joten soikio vain venyy
vaakasuunnassa. Reiän pinta on kupera ja nousee reunoja kohti; sensori-ikkunat, suuntausmerkki ja
yläosan levy seuraavat kaarevaa pintaa.

Rakenne näkyy pinnalla ohuina saumoina, ei portaina. Saumojen säteittäiset paikat on mitattu
Ouran akselin suuntaisista tuotekuvista (syvyys ulkopinnasta):

| Osa | Paikka | Materiaali |
| --- | --- | --- |
| värillinen kuori | ulkopinta → 0,51 mm | PVD-väri |
| kapea rako (tumma ura) | 0,56 mm | – |
| ohut lukitusrengas | 0,61–1,11 mm | PVD-väri |
| sauma | 1,135 mm (soikion levein kohta) | – |
| titaaninen sisäosa ja reiän pinta | 1,16 mm → reikä | titaani |

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
2. **Poikkileikkauksen muoto** tulee käyttäjän referenssimuodosta (yllä). Aiemmat versiot
   sovitettiin 43°-tuotekuvan ääriviivaan (`tools/fit_camera.py`, `tools/fit_profile.py`).
   Vertailu viralliseen ääriviivaan, kun kamera sovitetaan uudelleen soikiolle
   (`tools/compare_silhouette.py`):

   | Poikkileikkaus | IoU | Ääriviivavirhe keskim. | 95 % | max |
   | --- | --- | --- | --- | --- |
   | referenssisoikio (p 3,62, q 2,51), kamera ja sormuksen koko sovitettu | 0,994 | 0,014 mm | 0,040 mm | 0,080 mm |
   | vertailuna: eksponentit vapaina (p 4,52, q 3,07) | 0,996 | 0,010 mm | 0,028 mm | 0,044 mm |
   | edellinen versio (kuori + lukitusrengas + sisäosa) | 0,992 | 0,019 mm | 0,046 mm | 0,062 mm |

   Referenssisoikio sopii viralliseen ääriviivaan yhtä hyvin kuin aiemmat mitatut profiilit.
   Virallinen kuva suosisi hieman kulmikkaampaa soikiota (p 4,5, q 3,1), mutta ero on alle
   0,01 mm. Sovitus suosii myös pienempää sormuskokoa (sisähalkaisija ≈ 18,4 mm), koska
   sormuksen koko ja kameran etäisyys korreloivat; mallin koko on pidetty ennallaan.

3. **Avoin ristiriita:** lukitusrenkaan vyö näkyy 43°-kuvassa sekä ylä- että alaosassa noin
   5–10 px (0,2–0,45 mm) eri kohdassa kuin ääriviivaan sopiva kamera ennustaa. Kuoren ja
   renkaan keskinäinen syvyys tai täysin pyöreä kuoren reuna eivät selittäneet eroa.
4. **Rinnakkaisrenderöinnit** virallisen kuvan kameralla: `?match` (43°) ja `?match=axial`
   (akselin suunta).

Virallisia kuvia ei ole tallennettu repoon. Ne löytyvät Ouran kauppasivulta
(ouraring.com/store/rings/oura-ring-5).

**Arvioita:** suuntausmerkin ja yläosan levyn tarkka syvyys, sensorikomponenttien sisäiset
mitat (kokoluokka kuvista) ja saumojen syvyydet. Oura ei julkaise CAD-malleja.

## Renderöinti

- **WebGPU** three.js:n `WebGPURenderer`illä (TSL → WGSL). Jos WebGPU ei ole saatavilla,
  käytetään automaattisesti WebGL 2:ta. Käytössä oleva taustajärjestelmä näkyy oikeassa
  yläkulmassa.
- **Studio:** yksinkertainen ja rauhallinen. Pehmeä pystysuuntainen liukuväri (kirkas yläpuoli,
  harmaa horisontti, vaalea pöytä) ja yksi suuri pehmeäreunainen valo ylhäällä. Valo lisätään
  taustan päälle, joten sen reunat eivät heijastu tummina kehyksinä. Kiillotetussa metallissa
  näkyy muutama leveä heijastusvyö. Valaistus esisuodatetaan PMREM-kartaksi.
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
