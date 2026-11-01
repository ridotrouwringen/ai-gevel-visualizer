# OP_DE_DAG: geleiders 25 mm vóór het metselwerk

Productbesluit 1 november 2026: de geleiders staan bij OP_DE_DAG op de bakstenen en
hebben 25 mm diepte vanaf dat muurvlak. De bestaande breedte van 50 mm en de
muurankers blijven behouden. Dit geldt voor alle vier systeemkleuren. IN_DE_DAG
krijgt geen nieuwe diepteaanname. Kast 180 × 180 mm, lamellen 45 mm, steenlagen en
selectiepunten blijven ongewijzigd.

## Implementatie

`COMPONENT_DIMENSIONS.guideDepth = 25`. De muurzijde blijft z=0 in het bestaande
lokale gevelstelsel; het geleiderfront wordt z=25. De bestaande camera projecteert
beide. Alleen camera-gerichte zijvlakken worden getekend (projectieve winding),
met subtiele materiaaltoon per vlak. Het materiaal komt uit het ondoorzichtige
middengedeelte van dezelfde, op systeemkleur gebrachte geleidertextuur. Er worden
geen losse doppen of extra uitstekende blokjes toegevoegd.

De voorvlakken behouden hun bestaande bronmateriaal. De kast blijft na de geleiders
getekend zodat de aansluiting onder de kast behouden blijft. Pantser en onderlijst
krijgen geen extra diepte; deze wijziging voegt geen nieuwe schaduw-/lichtschatting toe.
Als de bestaande camera onbruikbaar is, blijven kast en geleiders vlak met een melding.
De 25 mm volgt dezelfde schaalreferentie als de bestaande productmaten; de preview
blijft indicatief. De nieuwe diepte hoort bij de fysieke productgeometrie en is geen
vaste pixel-offset die voor iedere foto hetzelfde blijft.

## Validatie

102/102 tests geslaagd; Next-build geslaagd. Nieuwe onafhankelijke camerafixures met
links/rechts en omhoog/omlaag kijken, twee afstanden: de fronten komen exact overeen
met projectie op 25 mm (16 camera's, beide geleiders). Zichtbare zijvlakken kloppen
met de positie van het onafhankelijke camerastandpunt. De 180mm-kast, pantser en
onderlijst blijven exact op hun vorige vlakken. IN_DE_DAG blijft zonder zijvlakken
op de oorspronkelijke geometrie. Bij een ontbrekende camera volgt een vlakke fallback.
Vier kleuren houden exact dezelfde alpha/silhouet. Alle pixels buiten de gerenderde
productdekking zijn bij de samengestelde test exact behouden.

Volledige lokale browserflow met echte deterministische generatie op de drie klantfoto's,
zonder onderschepte generatierespons en zonder externe modelcalls. 144548 gebruikt de
bestaande vlakke fallback; 145347 en 145745 tonen geleiderzijvlakken. Controle op alle
vier kleuren × beide montagekeuzes via de echte API slaagt. Laagtellingen en
kast-/lamelmaatvoering zijn gelijk gebleven. Fotopixels buiten het volledige
productgebied exact behouden; geen browser-page-errors. Detailuitsneden vóór en na
visueel gecontroleerd: de diepte is subtiel bij de bijna frontale foto en duidelijker
bij de schuine gevel. Er is geen kunstmatig grotere diepte gebruikt om het effect te
versterken. Ruwe geometrie-uitkomsten staan in `rolluik-geleiderdiepte-results.json`.

Publicatie uitsluitend op stabilisatie; productie/main niet wijzigen.
