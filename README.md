# Oura Ring 5 – 3D-malli (Silver)

Oura Ring 5 -sormuksen perusmalli fysikaalisesti renderöitynä mobiililaitteelle.
Ainoa käyttöliittymä on mallin kääntäminen ja tutkiminen.

**Materiaali:** *Silver*, eli kiillotettu titaani kovalla PVD-pinnoitteella. Se on toinen
perusmallin ($399) värivaihtoehdoista; toinen on Black.

## Avaaminen

Mikä tahansa staattinen palvelin riittää, esim.

```sh
python3 -m http.server 8000
# → http://localhost:8000
```

Voit myös ottaa GitHub Pagesin käyttöön tälle haaralle (repo root), jolloin malli aukeaa
suoraan puhelimella. three.js ladataan jsDelivr-CDN:stä (versio lukittu: `three@0.186.1`).

### Ohjaus

| Ele | Toiminto |
| --- | --- |
| 1 sormi / hiiren vasen | vapaa kierto, hitaus |
| 2 sormea | nipistys = zoom sormien kohtaan, siirto = panorointi, kierto = rulla |
| rulla / trackpad | zoom osoittimen kohtaan |
| hiiren oikea / shift + veto | panorointi |
| kaksoisnapautus | paluu alkunäkymään |

Kameran sijaan käännetään sormusta, joten studion valot pysyvät paikallaan ja heijastukset
liukuvat pinnalla kuten oikeaa korua kädessä käänneltäessä.

## Malli

Kaikki mitat ovat millimetreinä, ja koko on US 9 (sisähalkaisija 18,95 mm).

| Ominaisuus | Arvo | Lähde |
| --- | --- | --- |
| Leveys | 6,09 mm | Oura (virallinen) |
| Paksuus | 2,28 mm | Oura (virallinen) |
| Sensorikuvun korkeus | 0,7 mm, "flat-top" | Oura (virallinen) |
| Sensorit | 2 × tri-LED (vihreä/punainen/IR), 2 × fotodiodi, 12 signaalipolkua | Oura (virallinen) |
| Rakenne | titaaninen ulkokehys + titaaninen sisäkuori, PVD-pinnoite | Oura (virallinen) |
| Suuntausmerkki | kuoppa ulkopinnalla kämmenen puolella | Oura (tuki) / arvostelut |
| Profiilin kaarevuus, kupujen jalanjälki ja sijoittelu, komponenttien asettelu | arvio | tuotekuvat, Ring 4:n rakenne |

### Geometria

- **Runko:** poikkileikkaus on kaksi superellipsin puolikasta, jotka kohtaavat sivuilla
  pystysuorin tangentein. Näin pinta on G2-jatkuva ja heijastukset kulkevat katkeamatta kuten
  kiillotetussa korussa. Sisäpinta on "comfort fit" -muotoinen. Profiili näytteistetään
  adaptiivisesti (tiheämmin kaarevissa kohdissa, harjalla ja saumoissa) ja pyöräytetään akselin
  ympäri. Rungossa on noin 250 000 kärkipistettä.
- **Hiussauma** sisäkuoren ja ulkokehyksen liitoksessa on todellinen 0,011 mm syvä ura.
- **Suuntausmerkki** on todellista geometriaa: matala, laseroitu syvennys, jonka pohja on matta.
  Kulmanäytteistys tihenee sen kohdalla noin 0,011 mm:n välein.
- **Sensorikuvut:** pyöristetyn suorakaiteen muotoinen tasakattoinen kupu, joka nousee titaanikuoren
  aukosta (aukossa on tumma rako). Kuvun sisällä:
  - tri-LED-paketti: valkoinen heijastinrunko, kolme sirua ja kultaiset bondilangat
  - fotodiodi: heijastuksenestopinnoitettu piisiru, jossa on iridesenssiä ja alumiinisormet
  - optinen valoeste LEDin ja fotodiodin välissä

### Materiaalit ja valaistus

- **PVD-titaani (ulko):** metallin F0 ≈ (0,615; 0,598; 0,572) lineaarisena. Karheus on 0,07, ja
  pintaan on lisätty hienovarainen kiillotusvaihtelu ja hiusnaarmukartta. Kartta luodaan
  ajonaikaisesti, joten kuvatiedostoja ei tarvita.
- **Sisäkuori:** sorvattu satiini. Pinta on anisotrooppinen, ja anisotropian tangentti seuraa
  profiilia.
- **Sisäpinnan keskinäisheijastukset:** kiillotettu sormus heijastaa sisältä lähinnä omaa
  vastakkaista seinäänsä. Ympäristökartta ei pysty esittämään tätä, joten heijastussäde
  jäljitetään sävyttimessä analyyttisesti sylinteriä vasten (3 pomppua, Fresnel jokaisella
  pompulla). Sensorikuvut näkyvät heijastuksissa tummina.
- **Sensorikupu:** sävytetty optinen hartsi, joka sekä läpäisee että taittaa valoa.
- **Studio:** softboxit, strip-valot, takavalo ja tummat flagit renderöidään kuutiokarttaan ja
  esisuodatetaan (PMREM 512). Kontaktivarjo on pehmeä VSM-varjo.

### Renderöinti

- **WebGPU** three.js:n `WebGPURenderer`illä. Varjostimet kirjoitetaan TSL:llä ja käännetään
  WGSL:ksi. Jos WebGPU ei ole saatavilla, käytetään automaattisesti WebGL 2:ta. Käytössä oleva
  taustajärjestelmä näkyy oikeassa yläkulmassa.
- Liikkeen aikana kuva reunanpehmennetään 4× MSAA:lla, ja resoluutio mukautuu ruudunpäivitysnopeuteen.
- Kun kuva pysähtyy, siitä piirretään kerran 8× supernäytteistetty (SSAA) versio, jossa ohuet
  heijastukset ovat täysin terävät.
- Kuva piirretään vain kun jokin muuttuu, mikä säästää akkua.
- Jälkikäsittelynä on hienovarainen bloom, vinjetti, Neutral-sävykartoitus ja dithering, joka
  estää tummien liukuvärien raitautumisen.

### URL-parametrit (testaus)

`?webgl` pakottaa WebGL 2:n, `?still` poistaa automaattisen pyörinnän, `?nohq` ohittaa
SSAA-kuvan, `?pr=1.5` asettaa resoluutiokertoimen ylärajan, `?ssaa=4` asettaa SSAA-tason
(2^n näytettä), ja `?rot=x,y,z&zoom=0.3&pan=x,y,z` asettaa alkunäkymän.

## Rakenne

```
index.html               sivu, import map, kosketusasetukset
src/config.js            mitat ja parametrit
src/geometry/profile.js  poikkileikkaus, saumat
src/geometry/band.js     rungon tessellointi, suuntausmerkki
src/geometry/sensors.js  sensorikuvut ja niiden sisäiset komponentit
src/materials.js         PBR-materiaalit, keskinäisheijastukset
src/studio.js            studioympäristö, tausta, varjo
src/controls.js          kosketus- ja hiiriohjaus
src/main.js              renderöijä, jälkikäsittely, renderöintisilmukka
```

Malli on itsenäinen havainnollistus. Se ei ole Ouran virallinen CAD-aineisto eikä käytä Ouran
logoja.
