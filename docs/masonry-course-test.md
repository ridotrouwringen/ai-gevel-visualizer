# Baksteenlagen — experimentele test op stabilisatie

## Afgesproken gedrag

Na foto-upload en vier handmatige hoeken: open Perspectief en kies **Baksteenlagen tellen**.
De telling gaat uitsluitend over de hoogte van die selectie. Vier smalle stroken naast
het kozijn worden in hetzelfde perspectief onderzocht: links/rechts, dichtbij/verder.
De stroken lopen van de geselecteerde bovenrand tot de onderrand; geen materiaal
boven of onder de selectie wordt geteld. De hoeken, productrender en oorspronkelijke
foto blijven ongewijzigd. De onderzoeksmarkeringen zijn een afzonderlijke SVG-overlay.

Roze lijnen zijn werkelijk gevonden kandidaatvoegen. De UI toont per strook het aantal
voegen en de volledige geobserveerde laagafstanden ertussen. Die aantallen worden niet
opgeteld: de stroken bekijken dezelfde selectiehoogte. Gemiste voegen worden niet
bijgetekend. Alleen bij overeenkomstige relatieve laagafstand in minstens twee stroken
wordt daarnaast een schatting over de volledige selectiehoogte getoond, inclusief
onvolledige lagen aan de boven- en onderrand. De schatting kan dus een decimaal zijn.
Afwijkende stroken blijven zichtbaar met een melding.

## Methode en grenzen

- CPU, Sharp-grijswaarden op de resolutie van de geüploade werkfoto, geen verdere
  960px-verkleining. Bestaande uploadoptimalisatie blijft gelden.
- Homografie uit de bestaande P1–P4; perspectiefcorrecte lokale bemonstering.
- Drie deelprofielen per strook, autocorrelatie en piekdetectie in beide polariteiten.
- Minimaal vijf geobserveerde voegpieken; minimaal 65% regelmatige opeenvolgende
  afstanden; voor overeenkomst tussen stroken maximaal 15% relatieve afwijking.
- Geen millimeters, steenformaat, 60mm-aanname of wijziging van productschaal.
- Herhalingsdetectie is geen materiaalclassificatie. Bekleding, schaduwen en
  kozijnstructuur kunnen een fout positief patroon geven. Controleer de roze lijnen.
- Aangrenzende stroken worden voor de proef verondersteld op hetzelfde gevelvlak te
  liggen. Een erkerhoek of terugliggende zijwand kan daarvan afwijken; er is geen
  automatische gevelvlaksegmentatie toegevoegd.
- Een kleine/verre selectie kan te weinig detail hebben. Dan volgt geen schatting.
- De selectieranden bepalen de correctie; onnauwkeurige hoeken beïnvloeden de telling.
- Geen externe modelcall of bijkomende modelkosten. Maximaal drie gedecodeerde foto's
  gedurende tien minuten gecachet; maximaal twintig recente selectieresultaten per foto
  in de browser. Analyse start pas na de knop, met annulering en bescherming tegen oude
  resultaten bij een nieuwe selectie/foto. Kleur- of montagewissel hergebruikt resultaten.

## Verificatie op 28 oktober 2026

89/89 tests geslaagd; Next-productiebuild geslaagd. Nieuwe tests dekken lichte/donkere
voegen, dubbele voegranden, gemiste voegen, lege muren/ruis, perspectief, kleine doelen,
behoud van P1–P4 en het uitsluiten van alle beeldrijen buiten de selectiehoogte.

De volledige browserflow is lokaal op de gebouwde app uitgevoerd met Chromium:
foto uploaden → vier hoeken aanwijzen → knop → echte /api/masonry-respons → UI en
roze lijnen. Bij de drie klantfoto's kwamen respectievelijk circa 23,8 / 19 / 28,4
lagen over de proefselectiehoogte uit. Deze aantallen zijn **geen goedgekeurde ground
truth en geen nauwkeurigheidsscore**. Ze zijn bedoeld om met de foto na te tellen.
De exacte browserklikcoördinaten zijn vastgelegd in masonry-course-results.json.

Bij alle drie: foto-src ongewijzigd, responscoördinaten exact behouden, getekend aantal
voeglijnen gelijk aan het API-resultaat, zoomen behoudt lijnen, uitzetten verwijdert
de overlay en opnieuw aanzetten hergebruikt de cache zonder extra analyseverzoek.
Geen JavaScript-page-errors. De kleine/verre proefselectie in 145745 gaf terecht de
melding te weinig beeldpunten en geen schatting. Een lege foto gaf geen telling en
ongeldige coördinaten werden met HTTP 400 geweigerd.

Aanvullend de bestaande vijftien referentiefoto's via de echte gebouwde API getest:
15 HTTP 200, alle hoeken behouden. Vijf met overeenkomende strookpatronen, vijf met
beperkte ondersteuning, vijf zonder patroon. Dit test de werking en onthoudingsroute;
er zijn nog geen door de producteigenaar goedgekeurde voegentellingen voor nauwkeurigheid.
Lokale verwerking inclusief verzoek 18–231 ms, niet representatief voor Vercel-latency.

React-controle: uitsluitend type-import van het analysemodel in de client, geen Sharp
in de browserbundel, begrensde cache, annulering/debounce, status en knoplabels,
geen mutaties in Zustand door de nieuwe analyse. De bestaande perspectiefanalyse,
selectie- en productgeometrie zijn niet gewijzigd. Alleen stabilisatie publiceren.
