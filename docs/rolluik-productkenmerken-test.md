# Rolluik productkenmerken en praktijktest

Status: testvoorbereiding op branch `stabilisatie`. Dit document legt zichtbare productkenmerken vast en is geen maatvoeringstekening.

## Geselecteerde bibliotheekfoto's

De map `/rolluiken` bevat na opschoning negen foto's. De voorgestelde referentieset is:

- `ZSrolluiken_0011.jpg`: detailreferentie voor rolbak, pantser/lamellen en zijdetail.
- `ZSrolluiken_0008.jpg`: witte rolluiken van voren, bruikbaar voor samenhang en herhaling.
- `ZSrolluiken_0000.jpg`: donkere uitvoering, meerdere formaten en gevelcontext.
- `ZSrolluiken_0002.jpg`: aanvullende donkere uitvoering.
- `ZSrolluiken_0003.jpg`: witte uitvoering op meerdere ramen.
- `ZSrolluiken_0010.jpg`: donkere uitvoering op een andere gevel.
- `ZSrolluiken_0014.jpg`: afzonderlijke dakkapel-/dakvlakreferentie.

Voor de eerste standaardtest wordt aangeraden maximaal drie aanvullende foto's mee te geven: `0011`, `0008` en `0000`. De bestaande repository-afbeelding `public/products/rolluik.png` blijft de eerste, geïsoleerde productreferentie. De extra foto's zijn alleen aanvullende visuele referenties en worden niet automatisch uit de ChatGPT-bibliotheek geladen: de gebruiker selecteert lokale kopieën via de testinterface.

## Zichtbare productkenmerken

1. **Rolbak:** gesloten behuizing boven het pantser, over de breedte van het product. De precieze vorm en verhouding moeten de aangeleverde productfoto volgen.
2. **Zijgeleiders:** twee doorlopende, verticale geleiders aan weerszijden van het pantser. Hun exacte profielmaat is niet betrouwbaar uit de foto's af te leiden.
3. **Pantser:** volledig gesloten uitvoering met horizontale, regelmatig verdeelde lamellen. Geen zichtbaar glas of open stroken tussen de lamellen.
4. **Onderlijst:** herkenbare eindlijst onderaan het pantser, passend tussen/aansluitend op de geleiders.
5. **Samenhang:** alle vier onderdelen vormen één technisch plausibel product, met een consistente kleur/afwerking.
6. **Plaatsing:** de door de gebruiker getekende vierpuntsselectie is de grens voor de montage. Montagekeuze blijft de bestaande configuratie volgen: in de dag of op de dag.

## Wat bewust niet wordt vastgezet

De foto's geven geen betrouwbare, absolute productmaten of exacte profieldoorsneden. Daarom worden geen vaste millimeterwaarden, cassettepercentages of geleiderbreedtes verzonnen. Deze kunnen later alleen worden toegevoegd op basis van geverifieerde productspecificaties of metingen.

## Eerste test

- Product: één rolluik.
- Referenties: repository-productasset plus de drie aanvullende referentiefoto's `0011`, `0008` en `0000`.
- Kleur: kies een bestaande kleur in de configurator.
- Selectie: één duidelijk raamvlak, vier hoekpunten in volgorde rond het vlak.
- Beoordeling: rolbak, beide geleiders, gesloten lamellen, onderlijst, perspectief/uitlijning, kleur en ongewijzigde pixels buiten het masker.

Dit is een gecontroleerde visuele test van de bestaande generatieaanpak. Het voegt geen LoRA-training toe en wijzigt de vierpuntsselectie niet.
