# Gelijke productverhoudingen — 25 oktober 2026

Productbesluit: de eigenaar keurt wit/crème IN DE DAG goed en wil dezelfde
verhoudingen voor zwart/antraciet. Bij vijf gelijke en één breder/hoger
rolluik mogen kast en lamelhoogte niet met het grotere frame meegroeien.
Dit vervangt de eerdere eis om overal hetzelfde volledige lamelaantal te
behouden. De goedgekeurde eerste IN DE DAG-uitvoering blijft de referentie.

Diagnose op basis stabilisatie 230a5b7466f629de4c7bc56b67969ce3f7546da1:
- Geometrie was al kleuronafhankelijk; IN DE DAG had geen geëxtrudeerde zijden.
- RGB-filtering was alleen actief voor wit/crème, nu voor alle vier kleuren.
- Bij onbekende schaal kreeg elk frame opnieuw een 1500-eenheden stijlhoogte,
  waardoor een groter frame ook een grotere zichtbare kast kreeg.
- Eén pantsertextuur met een vast aantal lamellen werd over elke hoogte gerekt.

Correctie:
- Eén vaste referentievierhoek/montagemodus per werkfoto, pas opgeslagen na
  geslaagde generatie. Geen nieuwe invoer door de klant. Kleur-/puntwijziging,
  verwijderen en herhalen behouden die referentie. Een andere foto kiest opnieuw.
- De bestaande homografie brengt andere compatibele selecties terug naar dit
  gevelvlak; vaste kasthoogte 180 en geleiderbreedte 50 delen één verhouding.
  De referentie behoudt exact haar bestaande geometrie en pantsertextuur.
- Hogere producten krijgen meer bronrijen/lamellen in plaats van uitgerekte
  lamellen. De eerste 885 pantserrijen blijven gelijk; aanvullende rijen
  herhalen een lager deel met vijftien broncycli (623 pixels). Kortere producten
  worden in de hoogte afgesneden; de onderlijst blijft een apart onderdeel.
- Alle vier kleuren lopen door dezelfde componentenconstructie en RGB-filter.
  Het oorspronkelijke PNG-bestand is ongewijzigd.

Schaal is nog steeds indicatief. Bij ontbrekende schaal is de referentie een
visuele stijlmaat, geen gemeten millimeterhoogte. Lamelpitch wordt overgenomen
van het goedgekeurde referentiebeeld, niet als onafhankelijk bewezen 45 mm
geclaimd. Andere gevelrichtingen worden niet stilzwijgend als hetzelfde vlak
behandeld: inverse-plane-asafwijking >8% geeft afzonderlijke indicatieve route
met melding. Deze geometrische compatibiliteit is geen bewezen sceneclassificatie.

Verificatie:
- 76/76 bestaande en nieuwe tests; TypeScript/Next.js-build geslaagd.
- Eerste goedgekeurde IN DE DAG-geometrie exact gelijk, textuur 885 rijen.
- Vijf gelijke plus één breder/dubbelhoog product: constante kast/geleiders,
  vaste lamelhoogte en meer lamellen; geen zijvlakken bij IN DE DAG.
- Bevroren referentie blijft gelijk bij aanpassen/verwijderen; nieuw foto-ID
  reset de referentie; ongeldige referenties worden afgewezen.
- Alle vier kleuren hebben identieke alpha en geometrie op het grotere product.
- Gebouwde echte Next.js API met foto 004 en zes synthetische stressselecties
  (geen nieuwe kozijn-ground-truth): vier kleuren slagen. Zes kasten allemaal
  34,398 pixels hoog; vijf pantsertexturen 885 rijen en de hogere 1926 rijen.
  Herhalen geeft identieke PNG; andere selecties houden identieke geometrie
  na één kleurwissel, verplaatsen of verwijderen. Geen gemockte API-resultaten.
- Circa 4,6–5,0 seconden per zes rolluiken lokaal, eenmalige metingen; geen
  Vercel-p95. Lokale API zonder externe foreground-provider getest.

Werk uitsluitend op stabilisatie; geen main- of productie-deployment. De drie
specifieke klantfoto's waren niet als bestanden in deze chat beschikbaar;
geen claim van visuele verificatie op die foto's. Previewverificatie en
bewijsarchief volgen afzonderlijk. Geen nieuwe herkennings- of schaalmodellen.
