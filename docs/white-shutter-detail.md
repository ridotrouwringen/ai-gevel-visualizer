# Detail in lichte rolluiken — 25 oktober 2026

Basis stabilisatie fbac6f66a149420301e8034d3b4fd7780c4c364c.
De klant meldt laag ogende resolutie bij de witte variant; geen specifieke
klantfoto meegeleverd. Diagnose op actuele code en drie vaste gevelbeelden:
004, 006 en 013. Geen heropening van herkenning/schaalonderzoek.

Alle kleuren gebruiken dezelfde 1264 × 1090 producttextuur en projectie.
De eerdere lichte kleurcurve begrensde de shading hard op 1,03. Bij circa
31,52% van het goedgekeurde pantser werd hierdoor highlightvariatie op één
kleur afgekapt. Daarnaast samplede de projectie de bron bilineair zonder
voorfiltering bij minificatie; kleine, contrastrijke witte lamelpatronen
kunnen hierdoor kartelen of ongewenste patronen krijgen.

Correcties alleen voor RAL 9010/9001:
- Een gladde highlight-shoulder vervangt het harde plafond. Midtonen,
  diepe schaduwen en de beschermde technische materialen blijven behouden.
- RGB-mipmaps met oppervlakgemiddelden en trilineaire LOD-selectie op de
  inverse homografie. Transparantie wordt gewogen om zwarte randjes te
  voorkomen. De originele alpha wordt nog exact hetzelfde bemonsterd.

Antraciet en zwart gebruiken de bestaande route. Geen bronasset, dimensies,
lamelaantal, montagegeometrie, selectie, uploadresolutie of analyses gewijzigd.
De filtering verzint geen extra details en is geen verscherpingsfilter.

Validatie: 71 tests en Next.js/TypeScript-build slagen; bestaande assertions
behouden. Nieuwe tests controleren heldere gradaties, aliasonderdrukking tegen
het bekende oppervlakgemiddelde van een hoogfrequent patroon, identieke alpha,
geen zwarte transparantierand en identieke native samples zonder minificatie.
Drie echte gevelbeelden met vier varianten (oud, alleen tint, alleen filter,
beide), elk wit/crème plus antracietcontrole: overal identieke alpha;
antraciet-PNG vóór/na byte-identiek. Bron SHA256 ongewijzigd:
a8477b4c8d48616f8c2c9687042041789074c5ba2a777a38adeccc37976c49f4.
Gemiddelde losse overlaytijd op zes lichte testgevallen: circa 40 ms oud en
84 ms nieuw. Geen gemeten Vercel-p95 of extra API-kosten geclaimd.

Grenzen: bij een klein kozijn op een uitgezoomde gehele gevel blijven slechts
weinig schermpixels beschikbaar. Bij vergroting boven de oorspronkelijke
textuurresolutie ontbreekt echte brondetail. Dit is geen bewijs dat elke
klantmelding dezelfde oorzaak heeft. Een volgende echte browsercontrole van
de preview wordt als afzonderlijk bewijs vastgelegd.
