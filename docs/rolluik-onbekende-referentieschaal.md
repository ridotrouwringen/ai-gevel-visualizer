# Te grote kast na een onbekende referentieschaal

## Melding, 1 november 2026

De producteigenaar leverde `download(1).png`: twee antraciete rolluiken met opvallend
hoge/diepe bakken op een schuin gefotografeerde gevel. Dit is een afgewerkt resultaat,
niet de oorspronkelijke upload met P1–P4, laagtelling en requestgegevens. De exacte
gebruikerssessie en oorspronkelijke foto zijn niet beschikbaar. De conclusie hieronder
is een gereproduceerd foutmechanisme, geen bewezen reconstructie van alle sessiegegevens.

## Diagnose

De eerdere kleurencontrole was terecht gelijk voor exact dezelfde geometrie, maar
sloot een verkeerde gemeenschappelijke schaal niet uit. De geometriecode gebruikt
1500 als expliciet ongemeten stijlhoogte wanneer geen steenlaagschaal beschikbaar is.
De vastgehouden referentie kon die onbekende stijlhoogte ook doorrekenen naar een later
kleiner kozijn. Een referentie die 2,5 keer hoger is dan het doel maakte de doelbasis
600 in plaats van de zelfstandige indicatieve basis 1500. De vaste kast van 180 mm
nam daardoor ongeveer 2,5 keer zoveel van de selectiehoogte in beslag. Hetzelfde
mechanisme vergrootte de schijnbare diepte en geleiderbreedte, onafhankelijk van kleur.

Met operatorpunten afgeleid uit het aangeleverde beeld kan dit mechanisme een
vergelijkbaar opgeblazen kastbeeld geven. Het numerieke voorbeeld gebruikt een
synthetische referentie en is niet de oorspronkelijke referentie van de gebruiker.
De lokale voegtest op het resultaatbeeld heeft te smalle stroken voor een telling;
dat bewijst niet dat de oorspronkelijke upload dezelfde resolutie of telling had.

## Correctie

Wanneer referentie én doel geen gevonden steenlaagschaal hebben en het doel kleiner is
dan de referentie, wordt de onbekende basis niet meer naar beneden geëxtrapoleerd.
Het doel behoudt zijn eigen bestaande indicatieve verhouding. `referenceStatus` wordt
`unscaled`, met een melding dat geen betrouwbare gedeelde schaal is gevonden.

Een werkelijk gevonden steenlaagschaal blijft wél overdraagbaar, ook naar een kleiner
kozijn. Een lokaal gevonden schaal blijft eveneens behouden. De bestaande ongemeten
visuele verhouding voor een gelijk of groter doel blijft ongewijzigd. Dit is een
conservatieve fallback en geen nieuwe absolute inmeting of bewijs van een baksteenformaat.

Kast 180 × 180 mm, geleiders 50 mm breed / 25 mm diep en lamellen 45 mm zijn niet
gewijzigd. Kleurbehandeling, P1–P4, montageankers en de geheugende gevelreferentie zijn
ongewijzigd; alleen het onterecht hergebruiken van de onbekende basis is begrensd.

## Verificatie

- Nieuwe regressietest faalde vóór de correctie: onbekende referentie gaf basis 600
  in plaats van de zelfstandige basis 1500. Na correctie slaagt exact die test.
- 104/104 tests en schone Next-build geslaagd, inclusief de bestaande referentietests
  voor gelijke/grotere selecties en materiaal-/pixelbehoud.
- Extra test: bekende referentie met rekenhoogte 3000 geeft voor hetzelfde kleinere
  doel nog steeds correct 1200; de 180mm-kast en 25mm-geleider blijven vast.
- Echte browser + echte generatie-API, zonder modelcalls: neutrale wand uploaden,
  grotere onbekende selectie genereren, verwijderen, kleiner doel aanwijzen, genereren.
  Alle vier kleuren × beide montagekeuzes krijgen dezelfde zelfstandige basis 1500,
  `unknown`/`unscaled`, identieke geometrie per montagewijze en ongewijzigde productmaten.
- Geen browser-page-errors. Deze test gebruikt een neutrale fixture en gereconstrueerde
  punten; hij bewerkt niet opnieuw de al samengestelde gebruikersafbeelding.

Alleen stabilisatie; de oorzaak in de oorspronkelijke sessie blijft zonder de originele
foto en analysegegevens niet met zekerheid vast te stellen. Opnieuw genereren in de
bijgewerkte preview moet bevestigen of dit het gemelde geval oplost.
