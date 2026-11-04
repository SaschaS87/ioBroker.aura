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

| Taste | Wirkung |
| --- | --- |
| Automatisch | Folgt dem Gerät (Hell/Dunkel-Einstellung des Systems). Gibt eine Automation über `aura.0.config.themeMode.frontend` einen Modus vor, gilt dieser, und das Widget sagt es dazu |
| Hell | Immer hell, auch wenn das System dunkel ist |
| Dunkel | Immer dunkel, auch wenn das System hell ist |

Die Tasten sind mindestens 44 px hoch. Im Editor und im Admin ist das Widget nur eine Vorschau.

## Welches Design erscheint

Der gewählte Modus ersetzt das eingestellte Design nur, wenn es die falsche Helligkeit hat. Dann zeigt Aura das Design aus **Hell- und Dunkel-Design** (Design → Theme). Die Reihenfolge steht unter [Theme & CSS-Vars](../einstellungen/layouts#theme-css-vars).

## Einstellungen

Das Widget hat keine eigenen Optionen. Größe und Abstände wie bei jedem Widget im Editor unter **Widget bearbeiten**.
