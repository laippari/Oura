# Oura Ring 5 – 3D-malli

Oura Ring 5 fysikaalisesti renderöitynä mobiililaitteelle, kaikilla kuudella virallisella
värillä. Muoto, rakenne ja sensorit on **mitattu Ouran virallisista tuotekuvista** ja
validoitu niitä vasten (ks. alla). Mallia käännetään ja tutkitaan eleillä; muut toiminnot ovat
alareunasta nousevassa paneelissa: värit, räjäytyskuva, sensorien valot, vaalea/tumma studio ja
viisi elokuvamaista näkymää.

## Avaaminen

```sh
python3 -m http.server 8000      # → http://localhost:8000
```

**Julkaisu:** jokainen `main`-haaran push julkaisee sivun GitHub Pagesiin
(`.github/workflows/pages.yml`; kertaluonteinen asetus: Settings → Pages → Source → GitHub
Actions). Sivu on staattinen, joten käännösvaihetta ei ole; julkaisuun menevät `index.html` ja
`src/`. three.js ladataan jsDelivr-CDN:stä (`three@0.186.1`, lukittu versio).

| Ele | Toiminto |
| --- | --- |
| 1 sormi / hiiren vasen | vapaa kierto, hitaus |
| 2 sormea | nipistys = zoom sormien kohtaan, siirto = panorointi, kierto = rulla |
| rulla / trackpad | zoom osoittimen kohtaan |
| kaksoisnapautus | paluu alkunäkymään |
| alareunan pilleri | avaa paneelin (sulkeutuu vetämällä alas, napauttamalla mallia tai Esc) |

**Paneeli** (kelluva kortti näkymän päällä, avautuu pienellä joustolla; tummassa tilassa tumma).
Käyttöliittymä on englanniksi:

| Kohta | Toiminto |
| --- | --- |
| Finish | Silver · Black · Stealth · Brushed Silver · Gold · Deep Rose (toimii myös räjäytettynä). Näytteet ovat "kiviä": sormuksen poikkileikkausprofiili pyöräytettynä, renderöitynä oikealla kehysmateriaalilla samassa valaistuksessa. Värin vaihto liukuu pehmeästi. |
| Display → Explode | sormus aukeaa räjäytyskuvaksi ja kokoutuu takaisin; räjäytettyä pinoa voi pyöritellä |
| Display → Sensors | LEDit päälle: vihreä sekä punainen + infrapuna vuorottelevat |
| Display → Dark | vaalea ↔ tumma; valaistus, tausta ja varjo liukuvat yhtä aikaa saumattomasti |
| Views | Showcase · Pulse · Sensor · Profile – kamera-ajot; kosketus lopettaa ja palauttaa omat asetukset |

## Mitä mallissa on

**Mitat:** leveys 6,09 mm ja paksuus 2,28 mm (viralliset). Katselimen sormuksen sisähalkaisija on
20,2 mm (noin US 10,5). Virallisten tuotekuvien sormus on pienempi (18,75 mm 43°-kuvissa ja
18,45 mm akselin suuntaisissa kuvissa), jolloin sama 2,28 mm:n paksuus näyttää suhteessa
paksummalta. Koko on yksi arvo (`RING.innerRadius`); vertailutila `?match` käyttää kuvien kokoa.

**Poikkileikkaus.** Pyöristetty soikio, joka on pyöreä myös sisäpuolelta. Muoto on otettu
käyttäjän antamasta referenssikuvasta: sen ääriviivaan sovitettiin kahden eksponentin superellipsi

    |z / A|^p + |(r − rc) / B|^q = 1,   referenssi p = 3,62, q = 2,51

(keskivirhe 0,5 px referenssikuvassa). Se on skaalattu Ouran virallisiin mittoihin
6,09 × 2,28 mm (A = 3,045, B = 1,14). Skaalaus säilyttää eksponentit, joten soikio vain venyy
vaakasuunnassa. Pyöristystä on loivennettu varovasti: eksponentit on siirretty kolmannes
matkasta kohti virallisen ääriviivan suosimaa muotoa (p 4,52, q 3,07), eli **p = 3,9, q = 2,68**.
Muutos parantaa myös sovitusta viralliseen ääriviivaan (IoU 0,9936 → 0,9947). Reiän pinta on kupera ja nousee reunoja kohti; sensori-ikkunat, suuntausmerkki ja
yläosan levy seuraavat kaarevaa pintaa.

Rakenne näkyy pinnalla ohuina saumoina, ei portaina. Saumojen säteittäiset paikat on mitattu
Ouran akselin suuntaisista tuotekuvista (syvyys ulkopinnasta):

| Osa | Paikka | Materiaali |
| --- | --- | --- |
| värillinen kuori | ulkopinta → 0,52 mm | PVD-väri |
| kapea rako (tumma ura) | 0,57 mm | – |
| ohut lukitusrengas | 0,63–1,02 mm | PVD-väri |
| sauma | 1,02 mm (hieman soikion leveimmän kohdan yläpuolella) | – |
| titaaninen sisäosa ja reiän pinta | 1,02 mm → reikä | titaani |

PVD-väri on kuoressa ja lukitusrenkaassa (Ouran purkukuvassa kultaiset ohuet renkaat
molemmilla puolilla). Titaaninen sisäosa ja reiän pinta ovat kaikissa väreissä hopeisia.

**Sensorit:** neljä erillistä ikkunaa kämmenen puolella.
- **Sijainnit:** 2 × tri-LED ja 2 × fotodiodi, keskilinjasta 5,51 mm ja 9,66 mm sisäpintaa
  pitkin (34,25° ja 60° virallisten kuvien sormuksessa). Välimatka pysyy samana, vaikka
  sormuksen koko muuttuu.
- **Ikkuna:** kirkas linssi, 3,1 mm kehän suunnassa × 3,2 mm akselin suunnassa, kulmasäde
  0,72 mm. Linssi on viistereunaisessa upotuksessa, ja sen ympärillä on kapea tumma
  tiivisterako; linssin alla upotuksen pohja on titaania, joten lasin reunat näkyvät kirkkaina.
- **Linssien muoto ja korkeus** mitattiin kolmen virallisen aksiaalikuvan reiän ääriviivasta
  (`tools/measure_lenses.py`):

  | Linssi | Muoto | Huippu sisäpinnasta | Reunan pyöristys |
  | --- | --- | --- | --- |
  | tri-LED | loiva pallokupu, säde 6,7 mm (sovitteen jäännös 4 µm) | 0,61 mm (ennen 0,78) | 0,15 mm |
  | fotodiodi | tasainen ikkuna (jäännös 1 µm) | 0,365 mm (ennen 0,60) | 0,12 mm |

  Korkeudet haettiin renderöimällä malli samalla kameralla ja säätämällä, kunnes mallin
  profiili osui virallisiin ±0,01 mm:n tarkkuudella. LEDin huippu on upotuksen pohjasta
  0,69 mm, mikä vastaa Ouran ilmoittamaa 0,7 mm:n kupukorkeutta.
- **Tri-LED** (oikean sormuksen makrokuvan ja Ouran lähirenderöinnin mukaan): valkoinen kotelo,
  jossa kaksi upotettua heijastinkuppia. Isommassa kupissa on vihreä siru liitostyynyineen,
  kapeammassa punainen siru (raidallinen elektrodi) ja tumma infrapunasiru päällekkäin;
  kultaiset bondilangat kuppien reunoille. Vihreä kuppi on fotodiodin puolella.
- **Fotodiodi:** musta kotelo linssin reunaan asti, neliömäinen lähes musta piisiru
  (heijastuksenestopinnoite, sinivihreä reuna, hienot sormet) siirrettynä kohti LEDiä, kaksi
  kultaista liitostyynyä vastakkaisella reunalla ja bondilangat sirun kulmiin.
- Komponentit yhdistetään materiaaleittain (34 meshiä 92:n sijaan), mikä vähentää
  piirtokutsuja mobiililaitteilla.

**Räjäytyskuva** (järjestys Ouran julkaisemasta räjäytysanimaatiosta, ylhäältä alas):

| Osa | Toteutus |
| --- | --- |
| lukitusrengas | värillinen, leikattu pinnan saumoista (rako – sauma) |
| sisäkuori | titaani, 0,4 mm seinämä; sensoriaukot ja yläosan levy, räjäytettynä ikkunat avoimia |
| akku | kaareva kenno 200° kaarella sensorien vastapuolella, hienorakeinen musta kääre, kieleke |
| runkorengas | kiillotettu titaani |
| ulkokuori | värillinen kuori suuntausmerkkeineen, sisäpinta käsittelemätöntä titaania |
| piirilevy | taipuisa musta nauha, leveät tyynyt sensorien kohdalla |
| tiivisteet | neljä mustaa kehystä sensorien ympärillä |
| sensorit | 2 × tri-LED ja 2 × fotodiodi linsseineen ja alustoineen |
| lukitusrengas | värillinen |

Kuoret ja lukitusrenkaat leikataan samasta pinnasta, joten koottuna sormus on täsmälleen sama
kuin ennen (siluetti ja sävyt ennallaan). Sisäosien mitat ovat arvioita Ouran kuvista.
Räjäytettynä pino kääntyy pystyyn (sensorit takaseinällä linssit kameraan päin, kuten Ouran
kuvassa), kamera vetäytyy ja lattia laskeutuu. Kappaleet lähtevät liikkeelle porrastetusti.

**Sensorien valot** (`src/sensors.js`). Oura Ring 5:ssä on kaksi tri-LEDiä (vihreä, punainen,
infrapuna) ja kaksi fotodetektoria: 2 LEDiä × 3 aallonpituutta × 2 detektoria = 12 valopolkua.
Vihreä ja infrapuna mittaavat sykettä, HRV:tä ja hengitystä; punainen ja infrapuna veren
happisaturaatiota. Rengas valitsee tilanteeseen sopivan LEDin ja säätää kirkkautta (Smart Sensing).
Havainnollistuksessa tilat vuorottelevat (syke 9 s, happi 4 s, ristihäivytys), ja valo sykkii
PPG-pulssiaallon tahdissa (76/min) himmeten lyöntien välissä noin viidennekseen. Infrapuna näkyy
vain himmeänä tummanpunaisena. Todellisuudessa LEDit välkkyvät satoja kertoja sekunnissa, mikä
näkyy silmälle tasaisena valona. Kiillotettu metalli ei sirota valoa, joten LEDien valo näkyy
sisäpinnassa **peiliheijastuksina**: valaisevat ikkunat ovat valonlähteitä samassa
säteenjäljityksessä, joka laskee sisäpinnan keskinäisheijastukset, ja niiden kuvat toistuvat
seinää pitkin. (Aiempi tasainen hehku sai metallin näyttämään muovilta.)

**Muut yksityiskohdat:**
- suuntausmerkki ulkopinnalla kämmenen puolella: stadionin muotoinen matala upotus, 3,1 × 1,8 mm
  (lataustelakan tuotekuvasta)
- sisäpinnan yläosan tasainen levy

**Värit** (metallin F0 kalibroitu virallisia kuvia vasten mittaamalla ulkopinnan sävy ja
kirkkaus samalla kameralla):

| Väri | Huomio |
| --- | --- |
| Silver | neutraali peilikiillotus |
| Black | neutraali kiiltävä musta |
| Stealth | mattamusta, vaaleampi kuin Black (kuten virallisessa kuvassa) |
| Brushed Silver | satiini; harjausjäljet poikittain renkaan leveyden suuntaan (ulkopinnalla akselin suuntaan), heijastukset venyvät kehää pitkin |
| Gold | vaalea moderni kulta |
| Deep Rose | syvä kuparinruusu; sävy (lineaarinen RGB-suhde 1,00 / 0,56 / 0,36) vastaa virallista (1,00 / 0,58 / 0,39) |

Sisäpuolen titaani on neutraalin harmaa (F0 0,6) kuten virallisissa kuvissa.

Vertailu virallisiin 43°-kuviin samalla kameralla (lineaarisen säteilyn suhde, 1,00 = sama):
sisäpinta 0,97–1,03, titaaniset sivupinnat 0,92–1,09 ja ulkopinnan yläosa 0,88–1,08. Brushed Silverin F0 ja karheus säädettiin tämän vertailun perusteella
(F0 0,63, karheus 0,28).

## Miten muoto validoitiin

1. **Aksiaaliset sivukuvat (3840 px, Deep Rose, Black, Brushed Silver)** (`tools/axial_features.py`).
   - **Osien tunnistus:** sivupinnan osat näkyvät samankeskisinä renkaina. Värillinen ja
     titaaninen osa erotetaan värikylläisyydestä. Tasainen pinta erottuu vakiokirkkaudesta,
     kaareva pinta tasaisesta liukumasta.
   - **Perspektiivikamera** ratkaistaan reiän reunasta ja ulkoreunasta soikion geometrialla:
     D ≈ 191 mm, f ≈ 24 240 px (3840 px kuvassa). Saumojen syvyydet saadaan projisoimalla
     soikion sivupinnan pisteet tällä kameralla. (Aiempi laatikkomainen profiili antoi
     D ≈ 120 mm; `tools/axial_features.py` käyttää vielä sitä yksinkertaistusta.)
     `tools/fit_profile.py` sovittaa samoin aiempaa kuori–rengas–sisäosa-profiilia; nykyinen
     soikio tarkistetaan `tools/compare_silhouette.py`:llä.
   - **Riippumaton tarkistus:** sama tasainen lukitusrenkaan vyö näkyy 43°-kuvan ylä- ja
     alaosassa syvyyksillä 0,99–1,32 ja 0,36–0,74 mm. Niiden keskiarvo 0,675–1,03 mm vastaa
     aksiaalista mittausta (0,695–1,065 mm) 0,03 mm:n tarkkuudella.
2. **Poikkileikkauksen muoto** tulee käyttäjän referenssimuodosta (yllä). Aiemmat versiot
   sovitettiin 43°-tuotekuvan ääriviivaan (`tools/fit_camera.py`, `tools/fit_profile.py`).
   Vertailu viralliseen ääriviivaan, kun kamera sovitetaan uudelleen soikiolle
   (`tools/compare_silhouette.py`):

   | Poikkileikkaus | IoU | Ääriviivavirhe keskim. | 95 % | max |
   | --- | --- | --- | --- | --- |
   | toteutettu 3D-malli (p 3,9, q 2,68), renderöity (`?match&mask`) | 0,993 | 0,014 mm | 0,041 mm | 0,078 mm |
   | soikio p 3,9, q 2,68, kamera ja sormuksen koko sovitettu | 0,995 | 0,013 mm | 0,041 mm | 0,081 mm |
   | referenssisoikio (p 3,62, q 2,51), kamera ja koko sovitettu | 0,994 | 0,014 mm | 0,040 mm | 0,080 mm |
   | vertailuna: eksponentit vapaina (p 4,52, q 3,07) | 0,996 | 0,010 mm | 0,028 mm | 0,044 mm |
   | referenssisoikio aiemmalla koolla (sisähalkaisija 21,9 mm) | 0,905 | 0,218 mm | 0,446 mm | 0,495 mm |

   - **Koko:** soikio sopii viralliseen ääriviivaan vain pienemmällä sormuksella. Akselin
     suuntainen kuva vahvistaa tämän: koolla 18,45 mm kameraetäisyys on 191 mm (43°-kuvassa
     176 mm, koko 18,75 mm), kun taas 21,9 mm:n koko vaatisi 68 mm:n etäisyyden. Vertailutila
     käyttää siksi kuvien kokoa; katselin näyttää suuremman 20,2 mm:n sormuksen.
   - **Muoto:** virallinen kuva suosisi kulmikkaampaa soikiota (p 4,5, q 3,1). Ero ääriviivassa
     on alle 0,01 mm, joten malli pysyy lähellä referenssimuotoa (p 3,9, q 2,68).

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
  käytetään automaattisesti WebGL 2:ta.
- **Studio: Ouran oma tuotekuvausstudio, rekonstruoitu heidän virallisista kuvistaan**
  (`tools/recover_studio.py` → `src/studioEnv.js`). Virallisen 43°-kuvan jokaiselle kuperan
  pinnan pikselille laskettiin heijastussuunta mallin geometriasta ja sovitetusta kamerasta.
  Säteily saadaan kaavalla L = TM⁻¹(pikseli) / F, jossa TM⁻¹ on Neutral-sävykartoituksen
  käänteisfunktio ja F Schlickin Fresnel tunnetulla F0:lla. Lähteinä ovat Silver-ulkopinta ja
  kaikkien kuuden värin titaaniset sivut. Säteily ryhmiteltiin 7,5°:n soluihin (dataa 1050 /
  1152 solussa), peilattiin vasen–oikea-symmetriseksi ja tasoitettiin log-asteikolla (jäännös
  0,16 rms, ≈ 17 %). Ruudukko interpoloidaan kuutiollisella B-splinillä, joten heijastuksissa ei
  näy ruudukon kulmia eikä teräviä softbox-reunoja. Napojen lähellä rivit sumennetaan
  atsimuutissa niin, että pehmeys pallon pinnalla pysyy vakiona (3,5°): muuten suoraan alas
  osoittavaan heijastukseen syntyy nipistynyt piste. Lopuksi kartta esisuodatetaan
  PMREM-kartaksi.
  Aiempi pehmeä studio on vaihtoehtona: `#soft`.
- **Sisäpinnan heijastukset:** kiillotettu sisäpinta heijastaa vastakkaista seinäänsä. Säde
  jäljitetään sävyttimessä soikean reiän todellista pintaa vasten (Newton-iteraatio, oikeat
  normaalit, 3 pomppua, Fresnel jokaisella pompulla). Aiempi versio oletti suoran sylinterin,
  mikä tuotti pyöritettäessä sisäpuolelle terävän väärän varjojuovan.
- **Sisätilan valo:** virallisissa kuvissa koveran sisäpinnan heijastukset ovat kirkkaampia
  ja tasaisempia kuin pelkkä kaukainen studio selittäisi. Renkaan sisustaa valaisevat lähellä
  olevat valkoiset pinnat, joita kuperat ulkopinnat eivät näe. Virallisesta kuvasta mitattiin,
  että lisävaloa tulee eniten akselin suunnasta (aukoista sisään):
  L_sisä ≈ 1,2 · L_studio + 0,16 + 0,36 · (d · akseli)². Suunnattu lisävalo säilyttää
  heijastusten muodon (tasainen lisä teki metallista muovisen näköisen). Se painotetaan pinnan
  sisäänpäin osoittavuudella, joten titaaniset sivupinnat saavat pelkän studion. Samalla
  studion tumma horisonttivyö ei enää piirry sisäpintaan terävänä varjona.
- **Vaalea ja tumma tila yhdestä studiokartasta:** pohjana on aina Ouran rekonstruoitu studio
  (yllä), joka antaa värit oikein. Tumma ilme johdetaan siitä laskennallisesti heijastuksen
  suunnan funktiona (`makeStudio`, `src/materials.js`): kartta himmennetään horisonttia ja
  takaosaa kohti, ja sormuksen taakse lisätään kaksi kapeaa reunavaloa. Yksi arvo (0 = vaalea,
  1 = tumma) liu'uttaa valaistuksen, taustan sävyn, kontaktivarjon ja sisäpinnan lisävalon
  yhtä aikaa, joten vaihto on jatkuva eikä mitään renderöidä uudelleen tai peitetä. Vaalealla
  taustalla sormus on tuotekuvien mukaisen kirkas, tummalla dramaattisempi; reunavalot ovat
  mukana molemmissa. Vertailutilassa reunavalot ovat pois.
- **Näkymät** (`src/sequences.js`):
  - *Showcase:* 20 sekunnin silmukka, jonka etenemisen näyttää ohut viiva alareunassa. Tumma
    tuotekuva → liuku sensoreihin (ensin ilman valoja, sitten valot päällä noin kolme sekuntia)
    → liuku reunaprofiiliin tilan vaaletessa → sormus purkautuu räjäytyskuvaksi ja kokoutuu
    → liuku takaisin tuotekuvaan tilan tummuessa; jatkuu saumatta uuteen kierrokseen. Koko
    ajo on yksi jatkuva kameraliike ilman leikkauksia.
  - *Pulse:* 24 sekunnin silmukka sensorien ympärille. Kuparinvärinen (Deep Rose) sormus
    tummalla, sensorien pulssi päällä alusta loppuun → liuku LEDiin, joka pysyy kuvassa pitkään,
    ja siitä fotodiodiin → kamera kiertää renkaan vastakkaisen laidan taakse ja katsoo sen reunan
    yli hehkuviin sensoreihin (runko täyttää alakuvan kuin planeetan horisontti) → runko nousee
    ja peittää koko kuvan → sen takaa paljastuu vaalea tausta ja Brushed Silver hitaassa
    tuotekuvassa → takaisin tummaan ja kupariin. Näkymä voi vaihtaa väriä tilapäisesti.
  - *Sensor:* lähikuva sensoriparista (LED ja fotodiodi); kohde liukuu hitaasti niiden välillä,
    valot ovat ensin pois ja syttyvät sitten muutamaksi sekunniksi.
  - *Profile:* pystyssä oleva rengas kolmen neljäsosan kulmasta, soikea profiili ja saumat.

  Näkymä voi tilapäisesti ohjata valoja, räjäytystä ja studiota; kosketus lopettaa näkymän ja
  palauttaa käyttäjän omat asetukset. Siirtymät ajoon ja takaisin ovat pehmeitä (kamera kiertää
  renkaan ympäri ja katsoo koko ajan sitä kohti).
- **Linssit:** kirkkaat linssit ovat oikeaa valoa läpäisevää ja taittavaa materiaalia.
- **Varjo:** pehmeä VSM-kontaktivarjo.
- **Laatu:** liikkeessä 4× MSAA, pysähtyneenä kertaalleen 8× SSAA. Kuva piirretään vain kun
  jokin muuttuu, ja resoluutio mukautuu laitteen nopeuteen.

### URL-parametrit

| Parametri | Toiminto |
| --- | --- |
| `?finish=gold` | alkuväri (oletus: Deep Rose) |
| `?light` tai `#light` | vaalea tila (oletus: tumma) |
| `?sensors=0` | sensorien valot pois alussa (oletus: päällä) |
| `?webgl` | pakota WebGL 2 |
| `?still` | ei automaattista pyörintää |
| `?match` | virallisen tuotekuvan kamera ja valkoinen tausta (validointi; aina vaalea, Silver, valot pois) |
| `?match&mask` | sama siluettina ääriviivavertailua varten |
| `?match=axial` | akselin suuntaisen sivukuvan kamera |
| `?studio=soft` tai `#soft` | aiempi pehmeä studio pohjakarttana |
| `?explode` | räjäytyskuva alusta alkaen |
| `?seq=hero\|pulse\|sensor\|profile` | käynnistä näkymä (`hero` = Showcase; `&seqt=` aika sekunteina) |
| `?match&crop=x,y,w,h` | vertailunäkymän rajaus lähikuviin (1000 px asteikko) |
| `?nohq` | ei SSAA:ta |
| `?offscreen` | testitila: ei esitystä kanvaasille, kuvat luetaan `__capture()`:lla |
| `?rot=x,y,z&zoom=…&pan=x,y,z` | alkunäkymä |

## Rakenne

```
index.html                 sivu, import map, käyttöliittymän rakenne ja tyylit
src/config.js              mitat, sensorit, värit (mitatut arvot)
src/geometry/profile.js    poikkileikkaus (superellipsi + saumaurat) ja adaptiivinen näytteistys
src/geometry/band.js       rungon tessellointi, materiaaliryhmät
src/geometry/features.js   sensori-ikkunat, linssit, LED/PD-komponentit, merkki, levy, tiivisteet
src/geometry/parts.js      räjäytyskuvan kappaleet: rungon jako, leikkauspinnat, sisäosat
src/materials.js           PBR-materiaalit, värit, sisäheijastukset, laikkumaskit
src/studio.js              studioympäristö, tausta, varjo
src/studioEnv.js           rekonstruoitu Ouran studio (48 × 24 säteilyruudukko)
src/controls.js            kosketus- ja hiiriohjaus
src/explode.js             räjäytyksen animaatio
src/sensors.js             sensorien valotila (PPG-pulssi, mittaustilat)
src/sequences.js           elokuvamaiset näkymät ja pehmeät siirtymät
src/ui.js                  alapaneeli, teemanvaihto
src/main.js                renderöijä, jälkikäsittely, renderöintisilmukka, vertailutila
tools/                     validointityökalut: aksiaalikuvan mittaus, kameran ja profiilin
                           sovitus, ääriviivavertailu, linssien mittaus, studion rekonstruktio
```

Malli on itsenäinen havainnollistus. Se ei ole Ouran virallinen CAD-aineisto eikä käytä
Ouran logoja.
