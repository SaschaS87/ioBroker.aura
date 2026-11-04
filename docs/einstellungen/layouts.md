# Layouts & Theme

Jedes Layout hat eigene Tabs und Widgets — ideal für verschiedene Tablets oder Räume. Darunter Theme- und Darstellungs-Einstellungen, wahlweise global oder pro Layout (Geltungsbereich links).

## Layouts

![](./assets/layouts-theme.png)

| Element                           |                                                   |
| --------------------------------- | ------------------------------------------------- |
| Layout-Zeile                      | Name, Slug, Tab-/Widget-Anzahl                    |
| Bearbeiten                        | Öffnet das Layout im [Dashboard-Editor](./editor) |
| Aktionen                          | Duplizieren, Exportieren, Löschen                 |
| Neues Layout / Layout importieren | Anlegen bzw. aus JSON einfügen                    |

## Theme & CSS-Vars

Preset wählen (Dark, Hell, Lovelace, AMOLED, Glass, Material 3, Catppuccin, Liquid Glass …) und einzelne CSS-Variablen feinjustieren (App, Widget-Karte, Text, Akzentfarben).

Welches Design das Frontend zeigt, entscheidet diese Reihenfolge:

| Vorrang | Quelle                             |                                                                                                                                                                                                  |
| ------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1       | Lokale Wahl des Geräts             | Automatisch, Hell oder Dunkel, eingestellt im Widget [Geräte-Einstellungen](../widgets/geraete-einstellungen) und nur im Browser dieses Geräts gespeichert. Es gibt keinen Button im Header mehr |
| 2       | `aura.0.config.themeMode.frontend` | Hell/Dunkel-Modus per Datenpunkt, z. B. aus einer Automation. Gilt nur für Geräte auf „Automatisch". Leerer Wert = kein Modus |
| 3       | Gerät                              | Einstellung des Geräts (hell/dunkel), wenn das Gerät auf „Automatisch" steht und der Datenpunkt leer ist |
| 4       | Bereich → Layout → Global          | Geltungsbereich links; der engste gesetzte Wert gewinnt. Der Modus (1–3) ersetzt dieses Design nur, wenn es die falsche Helligkeit hat — durch das Design aus „Hell- und Dunkel-Design" |

Unter **Hell- und Dunkel-Design** (Design → Theme) legst du fest, welches Design ein Gerät im Hell- bzw. Dunkelmodus zeigt. Den Modus selbst wählt jedes Gerät für sich, Standard ist „Automatisch".

## Typografie & Spacing

![](./assets/layouts-typo.png)

Schriftart, Schriftgrößen und Abstände.

## Grid & Mobile

![](./assets/layouts-grid.png)

| Option                     |                                                      |
| -------------------------- | ---------------------------------------------------- |
| Rastergröße (Zeile/Spalte) | Zellgröße in px                                      |
| Mobile-Breakpoint          | Breite, ab der die mobile Einspaltenansicht greift   |
| Wizard Max-Datenpunkte     | Obergrenze der im Assistenten gescannten Datenpunkte |

## Hilfslinien

![](./assets/layouts-guidelines.png)

Rote gestrichelte Linien im Editor zur Orientierung an einer Zielgröße (Breite/Höhe), optional auch im Frontend.

## Tab-Leiste

![](./assets/layouts-tabbar.png)

Darstellung der Tab-Leiste im Frontend.

## Werte & Formatierung

Nur im Geltungsbereich **Global** — gilt für alle Layouts und Widgets.

| Option                  |                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Dezimalstellen (global) | Standard-Nachkommastellen; pro Widget überschreibbar                                                                           |
| 1000er-Trennzeichen     | `Aus` · `1.234,5` · `1,234.5` · `1 234,5` · `1'234.5`; das Dezimaltrennzeichen wechselt passend mit; pro Widget überschreibbar |
| DP-Namen bereinigen     | Suffixe entfernen (z. B. `.STATE`, `.LEVEL`); optional Punkte durch Leerzeichen ersetzen                                       |

Beide Zahlen-Optionen lassen sich pro Widget, Zelle und Listen-Eintrag überschreiben. In den Widget-Optionen stehen sie zusammen mit der Einheit in einer Reihe: **Einheit · Dezimalstellen · 1000er**. Der Knopf `Global` neben den Dezimalstellen bzw. der Eintrag `Global` in der Auswahl bedeutet: globale Vorgabe verwenden.
