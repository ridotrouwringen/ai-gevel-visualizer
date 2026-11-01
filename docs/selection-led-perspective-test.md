# Selectiegestuurde perspectiefcontrole — 27 oktober 2026

Goedgekeurde productrichting: de boven- en onderrand van de handmatige P1–P4-selectie zijn de eerste horizontale referenties; linker- en rechterrand bepalen de verticale richting. Het programma zoekt daarna tweede, derde, vierde en vijfde onafhankelijke beeldlijnen die deze richtingen bevestigen.

De preview voegt een zichtbare controle toe aan de bestaande configurator. Geel toont de selectieranden, groen de horizontale en blauw de verticale bevestigingslijnen, tot vijf per richting. De selectie blijft leidend; een lange dak- of zijgevelrand kan haar niet roteren. Perspectief wordt via homogene verdwijnrichtingen getoetst, inclusief parallelle randen. Ontbrekende steun geeft een expliciete melding.

De bestaande productprojectie gebruikt de vier punten al. Deze wijziging verplaatst geen punten, wijzigt geen montage-/kleur-/schaalregels en verandert geen gegenereerde fotopixels. Het is een testbare bevestigingsfunctie, geen heropening van Fase1 of auto-snap en geen metrische maatcontrole.

De nieuwe /api/perspective-route detecteert onafhankelijke beeldlijnen op een grijsbeeld van maximaal960px. Een kleine CPU-gradient/Hough-detector met continuïteitscontrole gebruikt alleen Sharp en TypeScript; geen extra provider, API-token of betaalde inferentie. Dit is een andere implementatie dan de eerder apart geteste Python-LSD-experimenten; hun scores worden hier niet overgenomen. Richtingsteun is geometrisch, geen bewezen semantische voeg- of gevelvlakherkenning.

Lijnextractie wordt per foto begrensd gecachet (maximaal3 foto’s,10 minuten) en een clientcache bewaart recente selecties. Kleur- en montagewissels hoeven geen nieuwe perspectiefanalyse te starten. Bij slepen is er een debounce, oude requests worden afgebroken en oude uitkomsten horen nooit bij nieuwe punten of een andere foto.

Testflow: upload foto → wijs P1–P4 om het kozijn aan → automatische bevestigingslijnen en status → versleep een punt → nieuwe controle → zet de lijnen desgewenst uit → genereer de bestaande productvisualisatie. Geen extra klantklik om de analyse te starten. Werk uitsluitend op stabilisatie/preview.

Verificatie vóór publicatie: 82/82 tests geslaagd, TypeScript en Next.js-productiebuild geslaagd. De echte gebouwde Next.js-route is met alle15 bestaande bronfoto’s aangeroepen: 15/15 HTTP200, alle punten exact behouden, maximaal5 lijnen per as en alle gerapporteerde hoekafwijkingen <=1,5°. Een lege foto levert geen bevestiging; ongeldige JSON/selecties worden afgewezen. Herhaling met warme fotocache geeft identieke uitvoer. Eenmalige CPU-metingen van deze route: 90–335ms; warme herhaling foto002:10ms. Dit zijn geen Vercel-latency- of herkenningsnauwkeurigheidsscores. Detailmetingen staan in selection-led-perspective-api-results.json.

Een interactieve browsercontrole is bij deze codecommit nog niet afgerond: de beschikbare testomgeving kon geen Chromium-binary downloaden. Vercel-inspectie via de koppeling gaf403 wegens ontbrekende teamtoestemming. Deze beperkingen mogen niet als geslaagde browsertest of geverifieerde preview worden voorgesteld; deployment en browser moeten afzonderlijk worden bevestigd.
