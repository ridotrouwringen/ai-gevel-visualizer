# Rolluikschaal uit getelde lagen — stabilisatie

Goedgekeurde testuitgangspunten van de producteigenaar, 28 oktober 2026:

- Eén steenlaag inclusief voeg: **60 mm** als vaste testaanname.
- Kast: **180 mm hoog, 180 mm diep**. De productmaat verandert niet met het kozijn.
- Lamel: **45 mm**, dus driekwart laag.
- Alle vier systeemkleuren gebruiken dezelfde geometrie.
- Alleen de selectiehoogte bepaalt de laagmeting; er worden geen steenbreedtes geteld.

## Implementatie

De knop Baksteenlagen tellen en de deterministische rolluikgeneratie gebruiken dezelfde
`facadeCourseAnalysis` en `countMasonryCourses`. De oude losse herhalingsanalyse is niet
meer de schaalbron van de rolluikroute. Bij overeenkomst van minstens twee stroken is
`courseUnit = 1 / layersOverSelection` en de indicatieve kozijnhoogte `60 / courseUnit`.
De bestaande box- en geleidergeometrie gebruikt deze basis vóór perspectiefprojectie.
Voor 42 lagen is dit 2520 mm; 180 / 2520 = 3 / 42. Volledige geobserveerde laagafstanden
blijven zichtbaar per strook; de schatting over de hele hoogte bevat ook randgedeelten.
Een opgegeven telling van 42 is niet als constante in de herkenning ingebouwd.

De bestaande camerabenadering projecteert kastdiepte 180 mm bij OP_DE_DAG. Bij een
onbruikbare camerabenadering blijft de bestaande vlakke fallback met melding gelden.
IN_DE_DAG neemt geen nieuwe neggediepte aan. De bestaande gezamenlijke gevelreferentie
blijft productschaal op hetzelfde vlak consistent houden. Een referentie zonder telling
mag een lokaal gevonden schaal niet overschrijven. Een andere gevelrichting wordt
apart behandeld. Ook een gedeelde schaal blijft indicatief.

De brontextuur heeft in zijn herhaalbare onderblok 15 lamelcycli per 623 bronpixels.
De verticale textuurmaat wordt nu berekend uit de fysieke pantserhoogte / 45 mm en die
bronpitch. Lamellen worden daardoor bij een hoger kozijn toegevoegd; de textuur wordt
niet over elk kozijn op hetzelfde aantal lamellen uitgerekt. Bovenste materiaaldetails
blijven eenmaal aanwezig, het bestaande onderblok herhaalt voor extra hoogte. Voor
onbekende schaal blijft de bestaande indicatieve textuurweergave behouden. De bestaande
onderlijst-toeslag blijft ongewijzigd en krijgt geen nieuwe productspecificatie.

De generatie berekent de telling ook als de losse telknop niet is gebruikt en geeft die
met de geometrie terug. De client bewaart de werkelijke serveruitkomst bij het juiste
kozijn. Het resultaat toont 60 mm/laag als testuitgangspunt, kast 180 × 180 en lamellen
45; strookdetails tonen volledige laagafstanden vóór het aantal voegen. Onvoldoende
herhaling geeft geen automatische absolute schaal. De preview blijft dan indicatief.

## Verificatie

97/97 tests geslaagd, Next-build geslaagd. Nieuwe tests: 42 lagen → 2520mm-rekenbasis,
kast drie lagen, 45mm-lamelpitch bij beide montagekeuzes, gedeelde referentie en lokale
schaal, geen schaal bij onbruikbare telling, gedeelde analysecache, transport van de
servertelling en gelijke geometrie/alpha voor alle vier kleuren.

Volledige lokale browser → echte /api/replicate → echte deterministische render →
resultaat getest met de drie klantfoto's; geen gegenereerde respons onderschept.
Externe modelcalls waren in deze test uitgeschakeld. Telling via /api/masonry was exact
gelijk aan de telling die generatie teruggaf; de geometriebasis was exact dezelfde
laagafstand maal 60 mm binnen floating-pointnauwkeurigheid.

Proefselecties: 23,7647 / 19 / 28,4 lagen; rekenbasis 1425,88 / 1140 / 1704 mm.
Dit zijn proefuitkomsten, geen onafhankelijke inmetingen. Foto 144548 heeft een vlakke
kastdieptefallback; voor 145347 en 145745 is een indicatieve camera bruikbaar. Foto 145745
blijft dus een perspectieftest met expliciete beperkingen.

Aanvullend alle vier kleuren × beide montagekeuzes via de echte generatie-API: geometrie
identiek binnen elke montagekeuze en fysiek geschaalde lamelpitch. Een lege gevel gaf
onbekende schaal. Bij de drie echte foto's werden respectievelijk 2.310.174 / 2.280.224 /
2.236.352 pixels buiten het volledige productgebied gecontroleerd: RGB exact behouden.
Geen browser-page-errors. Resultaten staan in `rolluik-steenlagen-schaal-results.json`.

React-controle: type-imports houden Sharp uit de client, de server bepaalt de schaal,
geen opgegeven millimeterwaarde uit de browser wordt vertrouwd, bestaande annulering,
selectiekoppeling en resultaatretentie blijven behouden. Alleen stabilisatie publiceren.
