# Logo-Werkstatt

Erzeugt aus zwei freigestellten Quellbildern (Schwarz und Weiß) alle Icon-Varianten der Aura-App.
Die Icons folgen automatisch dem Hell/Dunkel-Modus der App und des Browsers.

    npm run logo:build                 # neue Bilder verarbeiten
    npm run logo:build -- --dry-run    # nur pruefen
    npm run logo:build -- --force      # auch Unveraendertes neu erzeugen
    npm run logo:restore               # letztes Backup zurueckholen
    npm run logo:restore -- --liste    # Backups auflisten
    npm run logo:restore -- --backup <name>  # bestimmtes Backup zurueckholen

Quellordner (Standard): `<Benutzer>/OneDrive - viadico GmbH/Dokumente/DENKFABRIK/02 Arbeitsbereich/ioBroker/Logo-Eingang`
Anders per `--quelle <pfad>` oder Umgebungsvariable `AURA_LOGO_EINGANG`.

**Hinweis:** Die beiden Header-Logos (`aura-header-logo-schwarz.png` und `-weiss.png`) sind derzeit Platzhalter 
(alte Motive aus der App-Vorversion). Sie werden beim ersten echten `/logo-tausch` durch echte schwarze und weiße 
Motive ersetzt. Bis dahin funktioniert die Umschaltmechanik, zeigt aber noch das alte Design.

## Quellen

| Datei | Format | Erforderlich | Verwendung |
|---|---|---|---|
| logo-schwarz.png | PNG 1024x1024, transparent | Ja | Motiv in Schwarz fuer helle Themes, Header-Logo und Tab-Symbol |
| logo-weiss.png | PNG 1024x1024, transparent | Ja | Motiv in Weiß fuer dunkle Themes und Homescreen-Symbol |
| logo-hintergrund.png | PNG 1024x1024, deckend | Optional | fertiges Quadrat mit Hintergrund fuer Homescreen-Symbol; ohne dieses Bild wird das weiße Logo auf #111827 gesetzt |

## Ziele

| Ziel | Größe | Ursprung | Zweck |
|---|---|---|---|
| src-vis/assets/aura-header-logo-schwarz.png | 160x160 | logo-schwarz | Header-Logo bei hellem Theme |
| src-vis/assets/aura-header-logo-weiss.png | 160x160 | logo-weiss | Header-Logo bei dunklem Theme |
| public/favicon-32.png | 32x32 | logo-schwarz | Browser-Tab (Fallback) |
| public/favicon-64.png | 64x64 | logo-schwarz | Lesezeichen (Fallback) |
| public/favicon-theme.svg | 64x64 | logo-schwarz + logo-weiss | Browser-Tab, folgt dem Hell/Dunkel-Modus des Browsers |
| public/icons/icon-192.png | 192x192 | logo-hintergrund oder logo-weiss | iPhone-Homescreen |
| public/icons/icon-512.png | 512x512 | logo-hintergrund oder logo-weiss | iPad, Android, Startbildschirm |

**Wichtig:** Beide Motive (Schwarz und Weiß) sind erforderlich, damit die App zwischen Themes umschalten kann.
Ohne diese Dateien wird das Script mit einer Fehlermeldung abgebrochen.

## Homescreen-Symbol

Wenn Sascha kein eigenes Hintergrundbild (`logo-hintergrund.png`) liefert, wird das Homescreen-Symbol
automatisch aus dem weißen Logo auf der Farbe `#111827` (Dunkelblau) erzeugt.
Android schneidet maskable Icons rund zu – deshalb wird das Motiv mit 15 % Rand eingepasst.

Skaliert wird mit dem Chromium aus der vorhandenen Playwright-Abhängigkeit
(Canvas, schrittweise halbierend). Bewusst ohne `sharp`, damit package.json
gegenüber dem Upstream-Repo schlank bleibt.

Das Adapter-Icon `admin/aura.*` wird bewusst NICHT angefasst.
