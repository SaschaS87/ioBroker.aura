# Release notes for the NEXT version — English only (the release linter rejects German).
# One bullet per user-facing change; these become the ioBroker changelog, then this
# file is auto-reset to this template on the next stable release. Suggested style:
#   <Widget type> - <what changed>          e.g.  Thermostat - target temperature now shown inline
#   <General / widget-independent change>    e.g.  Tabs can be hidden from the tab bar
#   Settings - <what changed>               e.g.  Settings - add hex color mode for RGB lights

- Advanced chart - optional day navigation (prev day / today / next day) to browse single calendar days
- Advanced chart - per-series history aggregation option (average/minmax/max/min/total); minmax keeps true extremes for sparsely logged counters
- Advanced chart - monotone line smoothing, so flat data runs no longer wobble around their value
- Advanced chart - choose which time-range presets the frontend selector offers
- Advanced chart - a range without recorded changes draws a flat line at the current value instead of "no data"
- Advanced chart - fixed periodic chart flicker when adapters re-write unchanged values
- Panels - loop now wraps seamlessly onto the first/last slide instead of rewinding across the whole row
- Advanced chart - stale history responses no longer override a newer range/day selection after rapid day stepping
- Advanced chart - legend keeps to a single scrollable line on narrow widgets instead of wrapping
- Advanced chart - day-nav date label moved left of the buttons so they no longer shift when it appears
- Room climate - new collapsible widget type: slim temperature bar that expands inline on mobile (humidity, min/max, range presets, day navigation, history chart) and opens the same details as a popup on desktop
- Room climate - humidity datapoint, history instance, decimals and font sizes configurable per widget in the editor
- Rain station - new switcher card widget: pages through multiple rain stations (chevrons + dots) showing today's sum and last hour big, yesterday and current rate as a footer line; stations fully editor-configurable
