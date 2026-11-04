# Itärintama – WeGo-taktiikkapeli

Combat Missionin hengessä tehty selainpeli (TypeScript + Three.js r170). Kaksi skenaariota:

1. **Kylä Bobrin laidalla** (28.6.1941): pelaat Wehrmachtia, tukena Panzer III.
2. **Zaborjen kukkula** (24.6.1944, operaatio Bagration): pelaat puna-armeijaa, tukena T-34-85.

## Pelaa paikallisesti

```
npm install
npm run build      # → public/index.html + public/three.module.min.js
npm run serve      # http://localhost:8080
```

## Julkaisu Renderissä

Repossa on `render.yaml` (Blueprint), joka määrittelee staattisen sivuston:

1. Pushaa repo GitHubiin.
2. Renderissä: **New → Blueprint**, valitse tämä repo ja hyväksy. (Vaihtoehtoisesti **New → Static Site**: build command `npm install && npm run build`, publish directory `public`.)
3. Render rakentaa sivun jokaisesta `main`-haaran pushista automaattisesti.

Three.js tarjoillaan omalta palvelimelta (`vendor/three.module.min.js`, MIT-lisenssi: `vendor/THREE-LICENSE`), joten peli ei riipu ulkoisesta CDN:stä. Fontit tulevat Google Fontsista, ja niillä on varafontit.

---


Combat Missionin hengessä tehty WeGo-taktiikkapeli selaimeen (TypeScript + Three.js r170).

## Rakentaminen

```
tsc -p .            # kääntää src/ → dist/
node build.mjs      # niputtaa dist/-moduulit ja src/index.html:n → build/index.html
node build.mjs test # päätön simulaatiotesti → build/simtest.mjs (aja: node build/simtest.mjs)
```

`build.mjs` on tarkoituksella pieni: se liittää moduulit järjestyksessä yhteen ja poistaa paikalliset importit,
joten moduulien ylätason nimien on oltava uniikkeja. Three.js ladataan sivulla importmapin kautta jsDelivristä.
Halutessasi voit vaihtaa tilalle Viten (`vite-plugin-singlefile`) ilman muutoksia lähdekoodiin.

## Moduulit

| Tiedosto | Sisältö |
|---|---|
| `rng.ts` | Deterministinen satunnaislukugeneraattori, arvokohina |
| `terrain.ts` | Korkeuskartta (2 m), maastotyypit, talot, puut, aidat, suovat, ampumakuopat; näkölinja (`los`) ja luodin osumatesti (`bulletHit`) |
| `data.ts` | Aseet (lähtönopeus, ilmanvastus, hajonta, tulinopeus, ammukset), kokoonpanot, skenaario |
| `pathfind.ts` | A* 4 m ruudukossa + polun suoristus |
| `sim.ts` | Ydin: 20 Hz tikki, sotilaat yksilöinä, ryhmän muodostelma, havainnointi, tulenkäyttö, luotien lentoradat (10 alivaihetta / tikki, ilmanvastus + painovoima), osumat kapseliruumiiseen, ohilentojen tukahdutus, moraali, tallennus toistoa varten |
| `ai.ts` | Puolustajan tekoäly (pito, vetäytyminen, reservin vastahyökkäys, aluetuli äänikontakteihin) |
| `render.ts` | Three.js-näkymä: maasto, kylä, metsä, vehnä, sotilasmallit ja asennot, valojuovat, iskemät, räjähdykset, käskyviivat |
| `ui.ts` | WeGo-vuorot, käskyt, kamera, HUD, toisto |

## Simulaation periaatteet

- Jokainen laukaus on oikea ammus: tähtäyspiste + etäisyysarvion virhe + taisteluhajonta (sama koko sarjan ajan) + aseen hajonta.
  Luoti voi osua maastoon, puun runkoon, taloon, aitaan (voi läpäistä), heinäsuovaan tai ihmiseen.
- Ohilento alle 4 m päästä nostaa tukahdutusta. Tukahdutettu sotilas painuu maahan, ampuu harvemmin ja huonommin.
- Havainto on todennäköisyys, joka riippuu etäisyydestä, asennosta, liikkeestä, ampumisesta ja näkölinjan peitteisyydestä
  (vehnä, metsän aluskasvillisuus, latvukset). Ryhmä tietää heti omien havaintonsa, muiden havainnot viiveellä.
- Ampumakuoppa laskee sotilaan 0,75 m; reunavalli pysäyttää alle sen osuvat luodit.

## Uudemmat järjestelmät

- **Panssari ja PstTyk** (`sim.ts`: `vehHit`, `armorHit`, `gunFire`): levyt ja kulmat, läpäisy osumanopeudesta, 45 mm tykin väijytysoppi.
- **Talot** (`terrain.ts`: `buildingHit`, `wallBox`): ontot talot, ikkuna-aukot, hirsiseinän läpäisy; `occupyBuilding` asettaa ryhmän ikkunoihin.
- **Epäsuora tuli ja savu** (`mortarFire`, `solveHighAngle`, `requestArty`, `smokeAt`): heittimen numeerinen kaari ja tulenkorjaus, tykistön viive, tuulessa ajelehtiva savu näkölinjoissa.
- **Komentoketju ja lääkintä** (`updateC2`, `medical`, `doAid`): käskyviive, tiedonkulku, ensiapu ja verenvuoto.
- **Satunnainen ryhmitys** (`arrangeDefense`, `SCENARIO.defense`): `new Sim(karttasiemen, ryhmityssiemen)`.
- **Tiimit** (`splitSquad`, `mergeTeams`): kk-tiimi ja kivääritiimi.

Testit: `node build.mjs test test/<tiedosto>.js && node build/simtest.mjs` (esim. `variants.js`, `teams.js`, `gunduel.js`, `support.js`, `c2med.js`).
- **Äänet** (`audio.ts`): kaikki äänet syntetisoidaan Web Audiolla. Laukaus laukaistaan toistossa, kun ääni on ehtinyt kuulijalle (343 m/s); etäisyys vaimentaa, tummentaa ja lisää kaikua. Ohilento < 22 m kuulijasta tuottaa yliäänisen napsahduksen. Tapahtumat: `sim.shots` (ase `w`), `sim.impacts`, `sim.explosions` (koko), `sim.sfx` (heitin, vihellykset, savu, läpäisy). Testit: `test/audiotest.mjs` renderöi näytteet offline-tilassa WAV-tiedostoksi.

## Skenaariot

`data.ts`: `SCENARIOS` ja `setScenario(i)`. Puoli 0 on aina pelaaja ja puoli 1 tekoäly; kansallisuus (`nations`), puolten nimet, kartta (`map`), tykistö, valmisteleva keskitys (`prep`), ryhmitysvaihtoehdot (`defense`) ja briefing tulevat skenaariosta. Ajoneuvot ovat taulukossa `VEHICLES` (mitat, panssari [mm, kaltevuus °], aseet), kartat `terrain.ts`: `generateMap`.

1. **Kylä Bobrin laidalla** (28.6.1941): Wehrmacht + Panzer III hyökkää, puna-armeija puolustaa.
2. **Zaborjen kukkula** (24.6.1944, Bagration): puna-armeija + T-34-85 hyökkää suon yli, Wehrmacht puolustaa MG 42:lla, Panzerfaustilla ja 7,5 cm PaK 40:llä.

Osoitteen loppu `#bobr` tai `#bagr` käynnistää skenaarion suoraan. Testit: `test/bagr.js` (kartan tarkistus), `test/bagrplay.js` (pelisuunnitelmat), `test/pzf.js` (Panzerfaust), `test/bagrshot.mjs` (selain).
