# Geräte-Einstellungen

Lässt jedes Gerät für sich wählen, ob Aura **hell**, **dunkel** oder **automatisch** erscheint. Die Wahl gilt nur für dieses Gerät und wird im Browser gespeichert, nicht in ioBroker. Standard ist „Automatisch".

::: warning Ohne dieses Widget keine Umschaltung
Der Hell/Dunkel-Knopf im Header ist entfernt. Hell und Dunkel lässt sich nur noch über dieses Widget ändern. Legt man es nirgends ab, gibt es auf dem Gerät keine Umschaltmöglichkeit mehr, und es gilt „Automatisch".
:::

::: tip Eigener Bereich „Einstellungen"
Am besten legst du das Widget in einen eigenen Bereich „Einstellungen" (URL `/s/einstellungen`) und gibst dem Bereich ein Symbol. So erreichen es alle Geräte über das Bereichsmenü.
:::

## Datenpunkt

Keiner. Das Widget liest und schreibt keinen Datenpunkt. Die Wahl steht im Browserspeicher des Geräts (`localStorage`, Schlüssel `aura-device-theme`).

## Bedienung

Das Widget ist aufgebaut wie die Einstellungen auf dem iPhone: eine **Übersicht** mit einer Zeile je Einstellung und eine **Unterseite** je Einstellung. Aktuell gibt es die Zeile **Darstellung**. Rechts in der Zeile steht die aktuelle Wahl (Automatisch, Hell oder Dunkel).

**Schmal (unter 640 px Breite des Widgets, zum Beispiel Handy):** Beim Öffnen siehst du die Übersicht. Tippst du auf die Zeile, schiebt sich die Unterseite von rechts herein. Oben links bringt dich der **Zurück-Pfeil** („Einstellungen") zur Übersicht. Die Zurück-Wischgeste des Geräts wirkt auf den Browser und nicht auf das Widget: Sie springt zur vorigen Seite des Browsers, nicht zur Übersicht. Dafür ist der Pfeil da.

**Breit (ab 640 px Breite des Widgets):** Links steht die Übersicht, rechts die Unterseite der gewählten Einstellung. „Darstellung" ist beim Öffnen schon gewählt, du kannst also sofort umstellen. Einen Zurück-Pfeil gibt es hier nicht. Gemessen wird die Breite des Widgets selbst, nicht die des Fensters. Eine Hälfte-Spalte kann also auch auf einem großen Bildschirm schmal wirken. Für die breite Ansicht das Widget über die ganze Breite ziehen (neu angelegt: 42 Spalten).

Auf der Unterseite **Darstellung** steht ein Häkchen hinter der gewählten Zeile:

| Zeile | Wirkung |
| --- | --- |
| Automatisch | Folgt dem Gerät (Hell/Dunkel-Einstellung des Systems). Gibt eine Automation über `aura.0.config.themeMode.frontend` einen Modus vor, gilt dieser, und die Unterseite sagt es dazu |
| Hell | Immer hell, auch wenn das System dunkel ist |
| Dunkel | Immer dunkel, auch wenn das System hell ist |

Die Zeilen sind mindestens 54 px hoch, der Zurück-Pfeil mindestens 44 px. Das Widget hat keinen eigenen Kartenrahmen, die Gruppen bringen ihren eigenen mit, und es wächst mit seinem Inhalt. Im Editor und im Admin sind die Auswahlzeilen gesperrt (nur Vorschau). Zwischen Übersicht und Unterseite lässt sich dort trotzdem wechseln.

## Welches Design erscheint

Der gewählte Modus ersetzt das eingestellte Design nur, wenn es die falsche Helligkeit hat. Dann zeigt Aura das Design aus **Hell- und Dunkel-Design** (Design → Theme). Die Reihenfolge steht unter [Theme & CSS-Vars](../einstellungen/layouts#theme-css-vars).

## Einstellungen

Das Widget hat keine eigenen Optionen. Größe und Abstände wie bei jedem Widget im Editor unter **Widget bearbeiten**.
