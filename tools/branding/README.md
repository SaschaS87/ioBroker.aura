# Logo-Werkstatt

Erzeugt aus zwei freigestellten Quellbildern (Schwarz und Weiß) alle Icon-Varianten der Aura-App.
Die Icons folgen automatisch dem Hell/Dunkel-Modus der App und des Browsers.

    npm run logo:build                 # neue Bilder verarbeiten
    npm run logo:build -- --dry-run    # nur pruefen
    npm run logo:build -- --force      # auch Unveraendertes neu erzeugen
    npm run logo:restore               # letztes Backup zurueckholen
    npm run logo:restore -- --liste    # Backups auflisten
    npm run logo:restore -- --backup <name>  # bestimmtes Backup zurueckholen

    npm run logo:stil -- --kreis ja --logo-groesse 96 --logo-x -1 --logo-y 1
    npm run logo:vorschau -- --logo-groesse 96 --logo-x -1 --logo-y 1

## Logo im Kreis ausrichten

Sitzt das Kopfzeilen-Logo in einem Kreis (`--kreis ja`), laesst sich das Motiv
**darin** vergroessern und verschieben. Der Kreis selbst bleibt immer 32x32 px –
er muss zu den runden Knoepfen rechts in der Kopfzeile passen.

| Angabe | Bedeutung | Bereich | Standard |
|---|---|---|---|
| `--logo-groesse` | Prozent der Kreisflaeche. Ueber 100 ragt das Motiv hinaus und wird an der Rundung beschnitten (randfuellend). | 50–150 | 88 |
| `--logo-x` | Verschiebung in px, minus = links | −8 … 8 | 0 |
| `--logo-y` | Verschiebung in px, minus = oben | −8 … 8 | 0 |

Der Standard 88 % ergibt genau die 28 px, die frueher fest verdrahtet waren –
ein frisch erzeugtes Logo sieht also aus wie vorher.

`npm run logo:vorschau` schreibt `branding/vorschau-kopfzeile.png`: die Kopfzeile
in echter Groesse (mit den Knoepfen als Massstab) und 6-fach vergroessert, hell
und dunkel. Es aendert **nichts** an der App – nur ein Bild zum Anschauen. Der
Assistent (`npm run logo`) zeigt es nach jedem Einstellversuch automatisch an.

Ohne Kreis gibt es nichts einzustellen: das Motiv nutzt dort immer die volle
Flaeche (40x40). Wer es trotzdem versucht, bekommt eine Fehlermeldung statt
einer wirkungslosen Einstellung.

## Wo die Quellbilder liegen

Der Pfad steht **nicht** im Quelltext – er enthält Benutzer- und Firmennamen.
Gesucht wird in dieser Reihenfolge:

1. `--quelle <pfad>` (einmalig, nur für diesen Aufruf)
2. Umgebungsvariable `AURA_LOGO_EINGANG`
3. `branding/eingang.txt` – die gemerkte Angabe. Der Ordner `branding/` ist
   von der Versionierung ausgenommen, die Datei bleibt also auf dem Rechner.

Ist nichts davon gesetzt (frisch geklontes Repo, zweiter Rechner), fragt der
Assistent (`npm run logo`) **einmal** danach und merkt sich die Antwort.
Die anderen Befehle brechen mit einer Meldung ab, die erklärt, was zu tun ist.

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
