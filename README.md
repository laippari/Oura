# Oura Ring 5 – 3D-malli

Oura Ring 5 fysikaalisesti renderöitynä mobiililaitteelle, kaikilla kuudella virallisella
värillä. Muoto, rakenne ja sensorit on **mitattu Ouran virallisista tuotekuvista** ja
validoitu niitä vasten (ks. alla). Mallia käännetään ja tutkitaan eleillä; muut toiminnot ovat
alareunasta nousevassa paneelissa: värit, räjäytyskuva, sensorien valot, viisi taustaa (vaalea ja
tumma studio sekä kolme maisemaa) ja viisi esittelykierrosta.

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
| Background | Light · Dark · Dusk · Stone · Still. Light ja Dark ovat tuotestudio (vaihto liukuu saumattomasti: valaistus, tausta ja varjo yhtä aikaa). Dusk, Stone ja Still ovat maisemia (ks. alla); ne ladataan ensimmäisellä valinnalla ja vaihto on ristihäivytys. |
| Views | Signature · Horizon · Anatomy · Halo · Odyssey – viisi esittelykierrosta. Kierros ei koskaan vaihda taustaa eikä väriä: se ajetaan käyttäjän valinnoilla. Pilleri pysyy kierroksen aikana alareunassa, joten paneelin voi avata ja vaihtaa väriä tai taustaa kesken ajon; kosketus muualle lopettaa kierroksen. |

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
- **Maisemataustat** (`src/scenery.js`): kolme paikkaa, joissa sormus näytetään studion
  sijasta. Sormus leijuu niissä hieman pinnan yläpuolella, joten kaikki esittelykierrokset
  toimivat niissä sellaisinaan.
  - *Dusk:* järven ranta auringonlaskun jälkeen. Sormus märän kiven yllä, tyyni vesi peilaa
    iltataivaan, sormuksen ja kivet; kaislat huojuvat epäterävinä taaempana ja vastarannan
    tumma viiva näkyy horisontissa.
  - *Stone:* vaalea luonnonkivi myöhäisen iltapäivän auringossa. Kiven yli liikkuu lehtien
    pehmeä varjo, ja sormus heittää oman rengasmaisen varjonsa katsojaa kohti.
  - *Still:* tumma studio mustan veden yllä. Sormuksen valaistus on täsmälleen sama kuin
    Dark-taustassa; vesi peilaa sormuksen ja sensorien valon, ja hitaat rengasaallot
    pitävät pinnan elossa. Kaukana takana on himmeä hehku, josta veden pinta erottuu.

  **Rakenne.** Tämän katselimen kamera ei kierrä maailmaa (sormus kääntyy, kamera vain
  lähestyy ja loittonee), joten maisema on edestä katsottu lavaste lähikuvaa varten.
  - *Valo:* ulkomaisemilla on valokuvattu taivas (Poly Haven, CC0). Se on tallennettu
    pienenä JPEG-kuvana ja vahvistuskarttana (säteily = kuva × 2^(vahvistus × aukot);
    kaksi taivasta yhteensä alle 100 kt, virhe alkuperäiseen HDR-kuvaan 1–2 %). Horisontin
    alapuoli täydennetään sillä, mitä lavaste edellyttää – veden peilaama taivas tai
    auringon valaisema kivi – ja kartta esisuodatetaan kerran (PMREM). Sama kartta valaisee
    sormuksen (`light.setMap`, `src/materials.js`) ja on sumennettuna näkyvä kaukotausta:
    kaukana oleva on epäterävää kuten makrokuvassa.
  - *Vesi:* tasopeili (three.js:n `reflector`, puolella resoluutiolla) ja kulkevia
    aaltoja; pinta näyttää syvän värin ja peilikuvan Fresnelin mukaan. Still-taustassa
    lisäksi hitaita rengasaaltoja, joiden paikka vaihtuu joka kerta.
  - *Kivet:* vedessä pyöristyneitä kiviä (kohinalla muotoiltu pallo), pinnassa skannattu
    kivitekstuuri kolmesta suunnasta projisoituna ja korkeuskartasta laskettu pintakuvio;
    vesirajassa kivi on tumma ja kiiltävä. Sormuksen alla kivessä on pehmeä varjostus.
  - *Kaislat:* piirretään kanvaasille ja sumennetaan valmiiksi (epätarkkuus etäisyyden
    mukaan), joten ne ovat kevyitä ja näyttävät tarkennusalueen ulkopuolisilta.
  - *Lehtivarjot:* aurinko on oikea suunnattu valo, jonka väri kantaa lehtikuvion
    (`light.colorNode`), joten kuvio osuu kiveen liikkuvana varjona ja sormuksen oma varjo
    tulee varjokartasta. Kiven tekstuuri pehmenee etäisyyden mukaan (mip-taso), mikä
    jäljittelee syväterävyyttä ilman jälkikäsittelyä.
  - *Kehystys:* puhelimen pystykuvassa sormus täyttää lähes koko leveyden, joten maisema
    näkyy sormuksen yläpuolella, sen läpi ja alapuolella; lavasteet on aseteltu näihin
    ikkunoihin, ja maisemissa kamera on hieman kauempana ja omalla korkeudellaan.
  - *Vaihto:* studio ↔ studio on jatkuva liuku. Maisemaan vaihdettaessa valo, tausta ja
    lavaste vaihtuvat yhdessä ruudussa; edellinen kuva jätetään päälle ja häivytetään
    (`dissolve`, `src/main.js`).

  Aineistot (`assets/`, yhteensä 0,7 Mt, CC0): taivaat *Belfast Sunset (pure sky)* ja
  *Qwantani Late Afternoon (pure sky)*, tekstuurit *Rock Boulder Dry* ja *Rock 08* –
  kaikki polyhaven.com.
- **Esittelykierrokset** (`src/sequences.js`): viisi silmukkaa, joissa on sekä laajoja kuvia
  että lähikuvia ja joiden etenemisen näyttää ohut viiva alareunassa. Kierros **ei vaihda
  taustaa eikä väriä** – se ajetaan käyttäjän valitsemalla taustalla ja värillä ja seuraa
  niiden muutoksia kesken ajon. Sensorien valot kytketään päälle kierroksen alkaessa;
  räjäytyskuva on ainoa tila, jota kierros itse ohjaa.
  - *Signature* (27 s): kolmen neljäsosan tuotekuva → sisään sensoreihin (LED, sitten
    fotodiodi) → **käännös**: sormus kierähtää linssin edessä niin, että reuna ja sitten
    ulkopinta liukuvat kameran ohi ja ulkopinta täyttää suurimman osan kuvasta → pinta liukuu
    ohi → sormus kierähtää takaisin kameran vetäytyessä.
  - *Horizon* (26 s): sormus lappeellaan. Kamera tulee matalalta, kunnes ulkopinta täyttää
    kuvan kuin planeetan reuna → kamera nousee ja sensorien valo nousee reunan takaa →
    reunan yli LEDiin, sitten LED ja fotodiodi rinnakkain → ylös ja ulos yläviistoon.
  - *Anatomy* (30 s): katse sormuksen sisään → alas reunalle, saumoja pitkin (värillinen
    kuori, lukitusrengas, titaaninen sisäosa) → kamera laskeutuu ja sormus aukeaa
    räjäytyskuvaksi; kamera menee lähelle ja kulkee pinon ylhäältä alas → sormus kokoutuu.
  - *Halo* (25 s): sormus suoraan edestä, ympyränä. Se kierähtää kerran eteenpäin
    kääntymättä takaisin: kamera vajoaa reiän sisään ja liukuu sisäpintaa pitkin sensoriparilta
    toiselle, kohtisuoraan LEDiin → reunan ali → ulkopinta kulkee ohi leveänä laattana →
    sormus on taas suoraan edestä.
  - *Odyssey* (35 s): koko tarina. Sormus lappeellaan → nousee ja kääntää ulkopintansa
    kameraan, kunnes se täyttää kuvan → käännös toisin päin: reunan yli reiän sisään, LEDiin
    ja fotodiodiin → sormus laskeutuu kameran vetäytyessä, aukeaa, kamera kulkee pinon läpi →
    sormus kokoutuu sinne, mistä kierros alkoi.

  **Rakenne.** Lähes kaikki kuvat ovat "nauhakuvia" (`Director._band`): kamera katsoo
  nauhan pistettä vakaasta suunnasta studiossa ja sormus asetetaan sen alle, joten jokainen
  liike näyttää siltä, että sormus kääntyy valossa. Kuva on kourallinen parametreja – kohta
  kehällä (`a`), kohta poikkileikkauksen ympärillä (`phi`: 180° reiän sisällä, 90° reunan
  yllä, 0° ulkopuolella), kuvan koko nauhan kohdalla, nauhan kulma ruudulla (`twist`) – ja
  kierros on sileä jaksollinen käyrä (monotoninen kuutiollinen, Fritsch–Carlson) näiden
  avainarvojen läpi. Mikään ei leikkaa eikä pysähdy: laaja kuva, lähikuva ja käännös niiden
  välissä ovat yhtä liikettä, ja silmukan sauma on jatkuva myös nopeudeltaan. Lähikuvien
  etäisyys lasketaan kuvan koosta (mm) nauhan kohdalla, joten rajaus pitää kaikilla
  näyttömuodoilla. Räjäytyskuvalla on oma kamerarikinsä; kierros liukuu siihen ja takaisin
  (`mixShots`, kvinttinen pehmennys), ja pinon asento on sovitettu nauhakuvaan
  (`twist −90°, phi 152°`), joten vaihdossa ei tule heilahdusta.

  **Tarkistukset** (`pathcheck`, neljä näyttömuotoa 360 × 860 … 1280 × 720): kamera ei kulje
  rungon läpi (pienin välys 2,9 mm), sormuksen ja kameran keskinäinen kiertonopeus on
  enintään 45°/s eikä pysähdy missään, ja silmukan sauma on jatkuva.

  Kosketus lopettaa kierroksen; siirtymät ajoon ja takaisin ovat pehmeitä (kamera kiertää
  renkaan ympäri ja katsoo koko ajan sitä kohti).
- **Linssit:** kirkkaat linssit ovat oikeaa valoa läpäisevää ja taittavaa materiaalia.
- **Varjo:** pehmeä VSM-kontaktivarjo.
- **Laatu:** liikkeessä 4× MSAA, pysähtyneenä kertaalleen 8× SSAA. Kuva piirretään vain kun
  jokin muuttuu, ja resoluutio mukautuu laitteen nopeuteen.

### URL-parametrit

| Parametri | Toiminto |
| --- | --- |
| `?finish=gold` | alkuväri (oletus: Deep Rose) |
| `?bg=light\|dark\|dusk\|stone\|still` | tausta (oletus: `dark`; `?light` ja `#light` toimivat yhä) |
| `?sensors=0` | sensorien valot pois alussa (oletus: päällä) |
| `?webgl` | pakota WebGL 2 |
| `?still` | ei automaattista pyörintää |
| `?match` | virallisen tuotekuvan kamera ja valkoinen tausta (validointi; aina vaalea, Silver, valot pois) |
| `?match&mask` | sama siluettina ääriviivavertailua varten |
| `?match=axial` | akselin suuntaisen sivukuvan kamera |
| `?studio=soft` tai `#soft` | aiempi pehmeä studio pohjakarttana |
| `?explode` | räjäytyskuva alusta alkaen |
| `?seq=signature\|horizon\|anatomy\|halo\|odyssey` | käynnistä esittelykierros (`&seqt=` aika sekunteina) |
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
src/scenery.js             maisemataustat: taivaat, vesi, kivet, kaislat, lehtivarjot
assets/                    maisemien taivaat ja tekstuurit (Poly Haven, CC0)
src/studioEnv.js           rekonstruoitu Ouran studio (48 × 24 säteilyruudukko)
src/controls.js            kosketus- ja hiiriohjaus
src/explode.js             räjäytyksen animaatio
src/sensors.js             sensorien valotila (PPG-pulssi, mittaustilat)
src/sequences.js           esittelykierrokset: nauhakuvat, avainkäyrät, siirtymät
src/ui.js                  alapaneeli, teemanvaihto
src/main.js                renderöijä, jälkikäsittely, renderöintisilmukka, vertailutila
tools/                     validointityökalut: aksiaalikuvan mittaus, kameran ja profiilin
                           sovitus, ääriviivavertailu, linssien mittaus, studion rekonstruktio
```

Malli on itsenäinen havainnollistus. Se ei ole Ouran virallinen CAD-aineisto eikä käytä
Ouran logoja.
