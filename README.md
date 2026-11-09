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

**Mitat:** leveys 6,09 mm ja paksuus 2,28 mm (viralliset). Sisähalkaisija on 21,8 mm, eli
sama koko kuin virallisissa tuotekuvissa, jotta malli on suoraan verrattavissa niihin.

**Poikkileikkaus** ulkoa sisään. Säteittäiset mitat ovat sivupinnalla, ja ne on mitattu
perspektiivikorjatusta aksiaalikuvasta:

| Osa | Mitta | Materiaali |
| --- | --- | --- |
| tasainen ulkopinta | – | PVD-väri |
| ulkoreunan pyöristys | r 0,55 mm | PVD-väri |
| ohut sauma (PVD-raja) | 0,016 mm | – |
| tasainen sivupinta | 0,38 mm | titaani |
| terävä reunalinja | r 0,05 mm | titaani |
| loivasti kupera viiste | 0,68 mm | titaani |
| ura | 0,16 × 0,24 mm | titaani |
| sisäkuoren viiste | 0,36 mm | titaani |
| tasainen sisäpinta | – | titaani |

Värillinen PVD-pinnoite on vain ulkopinnassa ja ulkoreunan pyöristyksessä. Sivupinnat ja
sisäkuori ovat kaikissa väreissä hopeista titaania, kuten virallisissa Black-, Gold- ja
Deep Rose -kuvissa.

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

1. **Kameran sovitus siluettiin.** Ouran 8000 px:n tuotekuvalle sovitettiin kameran asento,
   etäisyys ja polttoväli niin, että mallin siluetti peittää kuvan siluetin
   (`tools/fit_camera.py`). IoU = 0,99 virallisilla mitoilla. Sama tulos toistuu muista
   värikuvista (IoU 0,990, sisäsäde 10,8–10,9 mm, kallistus 43°).
2. **Aksiaaliset sivukuvat (3840 px).** Sensorien kulma-asemat, pituudet ja korkeudet
   mitattiin alfa-kanavasta, ja sivupinnan vyöhykkeet kirkkausprofiileista. Kuvissa on
   perspektiivi (kamera n. 150 mm), ja kun se korjataan, mitat täsmäävät virallisiin
   6,09 × 2,28 mm:iin.
3. **Profiiliviivojen projisointi.** Jokainen reunaviiva (pyöristys, PVD-raja, reunalinja,
   ura, viiste) projisoitiin sovitetulla kameralla virallisiin kuviin (`tools/overlay_profile.py`).
   Viivat osuvat kuvien näkyviin viivoihin noin 0,1–0,2 mm:n tarkkuudella.
4. **Rinnakkaisrenderöinnit.** Malli renderöitiin täsmälleen virallisen kuvan kameralla
   (`?match`-tila) kaikilla kuudella värillä ja verrattiin kuviin. Näin löytyivät esim.
   PVD-alueen rajaus, sisäkuoren viiste ja studiovalaistuksen luonne.

Virallisia kuvia ei ole tallennettu repoon. Ne löytyvät Ouran kauppasivulta
(ouraring.com/store/rings/oura-ring-5).

**Arvioita:** suuntausmerkin ja yläosan levyn tarkka syvyys, sensorikomponenttien sisäiset
mitat (kokoluokka kuvista) ja viisteen tarkka kaarevuus. Oura ei julkaise CAD-malleja.

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
tools/                     validointityökalut (kameran sovitus, profiiliviivojen projisointi)
```

Malli on itsenäinen havainnollistus. Se ei ole Ouran virallinen CAD-aineisto eikä käytä
Ouran logoja.
