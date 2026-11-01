# Grote gevelfoto's — 24 oktober 2026

Basis: stabilisatie, c0316a89014d229ad1306269cd799ed2bec98bbc.

Het verzoek faalde vóór verzending wanneer de ongewijzigde foto in base64,
selecties en eventuele referenties samen groter waren dan 4,4 MB.

De actieve upload in components/canvas/facade-canvas.tsx bereidt de foto nu
één keer lokaal voor, vóórdat hoekpunten en rastermaskers bestaan. Kleine
JPEG/PNG/WebP-bestanden houden hun bytes; grotere bestanden krijgen een
JPEG-werkfoto met maximaal 3200 pixels aan de lange zijde en maximaal
2.000.000 bytes voor de volledige data-URL (circa 1,5 MB JPEG).

Elke poging komt rechtstreeks uit de gedecodeerde bron. Kwaliteit 92/86/80%;
indien nodig daarna 15% kleinere afmetingen, tot maximaal 1024 lange zijde
als laatste fallback. Geen vergroting of beeldverhoudingwijziging.
Browserdecodering behandelt EXIF; nieuw canvas-JPEG bevat geen rotatietag.
Selectie, zoom, analyses en compositie gebruiken dezelfde werkfoto. De
originele foto op het apparaat blijft ongewijzigd. Pixelbehoud bij rendering
geldt voor de voorbereide werkfoto; compressie is bewust niet verliesvrij.

Voorbereiding/fouten worden zichtbaar gemeld, object-URL en tijdelijke canvas
worden vrijgegeven. De definitieve verzoeklimiet blijft als vangnet bestaan;
buitensporig veel/complexe masks kunnen nog steeds die limiet overschrijden.
HEIC wordt niet toegevoegd: de bestaande JPEG/PNG/WebP-ondersteuning blijft.

Validatie: alle 67 node-tests en de TypeScript/Next.js-build slagen. Nieuwe
tests: aspectratio/geen opschaling, kwaliteitsvolgorde, begrensde fallback,
ongeldige invoer en een echte grote JPEG met acht masks/drie referenties.
Browsercontrole op de preview volgt als afzonderlijk bewijs; deze notitie
claimt nog geen geslaagde browsertest.
