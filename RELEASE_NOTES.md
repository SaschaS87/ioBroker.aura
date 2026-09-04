# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights
# Issue reference (optional): append (#519) — or paste the full issue URL — and the
# release turns it into a changelog link. release.ps1 also asks per entry.
- Popups - the background colour can now be set globally, per popup view and per click action; new theme tokens `--popup-bg` / `--popup-border` colour every popup of a layout (#611)
- AI (MCP) - aura_measure now computes heights for the dashboard's own font scale and widget padding instead of the default ones, and counts a section separator with a heading as the taller row it is; list heights used to come out too small from about four rows on
- Overview - new card explaining that Aura can now be controlled by an AI assistant over MCP, with the setup steps and a link to the documentation

- Advanced chart - optional day navigation (prev day / today / next day) to browse single calendar days
- Advanced chart - per-series history aggregation option (average/minmax/max/min/total); minmax keeps true extremes for sparsely logged counters
- Advanced chart - monotone line smoothing, so flat data runs no longer wobble around their value
- Advanced chart - choose which time-range presets the frontend selector offers
- Advanced chart - a range without recorded changes draws a flat line at the current value instead of "no data"
- Advanced chart - fixed periodic chart flicker when adapters re-write unchanged values
- Panels - loop now wraps seamlessly onto the first/last slide instead of rewinding across the whole row
- Advanced chart - stale history responses no longer override a newer range/day selection after rapid day stepping
- Daily rain widget (new) - one bar per calendar day computed client-side from raw rain_today history (7/14-day bars, month calendar grid); distinguishes dry days (0) from data gaps (–), today's bar grows live
- Daily rain widget - day mode with hourly bars derived from the daily counter's increments (see when it rained), day-by-day paging, and tap-a-day drill-down from the bar and month views
- Daily rain widget - month view toggles between calendar grid and day bars via a compact control in the chart's top-right corner (keeps the range chips from overflowing on phones); crowded bar views drop weekday names and always mark the period's peak
- Advanced chart - legend keeps to a single scrollable line on narrow widgets instead of wrapping
- Advanced chart - day-nav date label moved left of the buttons so they no longer shift when it appears
- Room climate - new collapsible widget type: slim temperature bar that expands inline on mobile (humidity, min/max, range presets, day navigation, history chart) and opens the same details as a popup on desktop
- Room climate - humidity datapoint, history instance, decimals and font sizes configurable per widget in the editor
- Rain station - new switcher card widget: pages through multiple rain stations (chevrons + dots) showing today's sum and last hour big, yesterday and current rate as a footer line; stations fully editor-configurable
- Rain station - values still loading right after app start show an ellipsis instead of misleading dashes
- Advanced chart - bar series keep empty windows empty instead of injecting a flat substitute line; two synthetic points on the window edges derailed the time-axis tick layout on empty day views
- Advanced chart - day stepping no longer animates the window transition (the old day edge visibly flew across the chart)
- Advanced chart - views without visible data keep a readable axis frame (time window + 0-1 value axis) instead of blank axes; the fallback is legend-aware, so hiding all series no longer blanks the chart
- Heating (new) - heat-pump widget for STIEBEL ELTRON LWZ: a mode-aware status card that turns green while heating, blue while preparing hot water and neutral when idle, showing "compressor on since X min" and pump/defrost/electric-booster indicators
- Heating - a 2x2 tile row below the status card shows flow/return temperature, spread, volume flow and outside temperature; renders frameless at full column width to match the other widgets
- Heating - all eleven displayed datapoints (mode/compressor, pump/defrost/booster, flow/return/spread/volume/outside) are now editor-configurable via picker fields grouped by section; an empty field falls back to the built-in LWZ/stiebel default, shown as a greyed placeholder
- Heating - collapsible "Heizkreis" box: a flow/return spread band (green fill between the lines) with the HK1 target line; drawn from full-resolution history so the runs read smoothly
- Heating - collapsible "Betrieb" box: the same spread band above a compact on/off timeline strip for compressor and circuit pump, so temperature runs read against their run times
- Heating - chart views Tag / 7 Tage / Monat, with prev/next paging by day, week or month; tap the date to open a Tag/Monat/Jahr wheel picker and jump straight to any past period
- Charts - one shared navigation across heating, room climate and daily rain: Tag / 7 Tage / Monat chips, a date field that opens a Tag/Monat/Jahr wheel picker, and prev / Heute / next arrows that page by the active unit
- Room climate - chart adopts the shared Tag / 7 Tage / Monat pager with the date-jump picker (replaces the old 6h/24h/7d/30d ranges)
- Daily rain - chart adopts the same shared pager; the separate 14-day view was dropped for one consistent Tag / 7 Tage / Monat set
- Heating - new collapsible "Warmwasser" box: hot-water actual temperature (sawtooth) over the reheat hysteresis band, with the target line
- Heating - Heizkreis chart uses a fixed 0–70 °C scale by default (grows only if readings exceed it); Betrieb box got extra height so its legend no longer overlaps the compressor/pump timeline
- iOS home-screen app - in landscape the header and tab bar now span the full screen width, so their divider lines run edge to edge; the side safe-area margins below the tab bar use the page background color instead of the header color, so the content no longer looks boxed in
- iOS home-screen app - page pinch-zoom is now blocked, so the header no longer shifts/misaligns after a pinch gesture (the map's own pinch-to-zoom still works)
- Heating / Room climate / Advanced chart - two-finger pinch now zooms into the currently shown time range for a closer look at the data; the zoom resets when switching Tag/7 Tage/Monat
- Weather (new) - forecast widget fed by Open-Meteo: swipeable 7-day day-strip with a shared detail view per day — linked temperature/rain/rain-probability chart with a single crosshair and tooltip, sun/moon markers at sunrise and sunset, a widening confidence band over the forecast portion, and sun/rain/temperature detail groups
- Weather - fixed a bug where reopening the app from the iOS background could show stale values even though the server already had fresh data
- Weather - data-source footer restored below the day strip (model run time, availability, next update, last fetch)
- Weather - night shading now uses the same grey as the sunset/sunrise moon marker, at a stronger opacity for better readability
- General - increased the bottom scroll buffer again (now 4rem) so the last widget on a tall tab is no longer clipped on iOS Safari when scrolling to the end
- Weather - the data-source footer (model run time, next update, last fetch) now always stays at the very bottom of the tab instead of ending up mid-tab once other widgets are added below the forecast strip
- Weather - restored the 15-minute rain nowcast strip (next ~6h) that was lost when the widget was consolidated to the day-strip variant
- Weather - day strip now includes the last 2 days in addition to the 7-day forecast; still opens scrolled to "Heute" by default
- Weather - today's upcoming hours now draw as a solid line instead of dashed, matching every other day; the confidence band no longer appears on past days, which get the same dot markers as "today, so far" instead
- Weather - the day strip now reliably reopens on "Heute" every time the Wetter tab is revisited (switching tabs and back, or resuming the app from the iOS background) — previously only worked on a fresh app load
- Weather - fixed the active day cell's square grey highlight poking past the card's rounded top corner when it sits at the left or right edge of the day strip
- Weather - new collapsible data-source health box: a header dot shows "alles aktuell" or a problem count even collapsed, expands to list each configured source with its last-update age and an optional one-click restart button
- Weather - the data-source footer (model run time, next update, last fetch) moved into the health box as a detail line under the Open-Meteo source; the standalone footer widget was removed
- Weather - rain nowcast now shows a sum + max/15min header for the 6h window, and tapping a bar reveals its exact time and mm value
- Shutter widgets (floor list / room cards) - no longer a fixed full-tab overlay; both now behave like a normal, growing widget that can sit alongside other widgets and be moved/resized in the editor
- Shutter widgets - the footer pill was replaced by the same collapsible data-source health box used on the Weather tab, now with a one-click restart button for the shutter adapter instance
