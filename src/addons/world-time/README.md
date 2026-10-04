# World time

A calendar for the world of a campaign, and a viewing date on every map: map objects and map images can exist only at certain dates, world events show beside the places they happened at, and a timeline pane lists them.

## Calendar file

`atlas-vtt/world/calendar.json` (Settings → World time → Calendar file). Without a readable file the built-in Arcivalian calendar of Drakar och Demoner's Altor is used (12 months of 30 days and 5 festival days).

```json
{
  "default": "my-calendar",
  "calendars": [
    {
      "id": "my-calendar",
      "name": "My reckoning",
      "months": [{ "n": 1, "name": "Firstmonth", "days": 30 }, { "n": 13, "name": "Festival days", "days": 5, "intercalary": true }],
      "weekdays": ["Moonday", "…"],
      "holy_days": [{ "month": 1, "day": 1, "name": "New year" }],
      "era_names": { "after": "AD", "before": "BC" }
    }
  ]
}
```

Dates are written `YEAR`, `YEAR-MONTH` or `YEAR-MONTH-DAY` (`1236`, `1236-4`, `-300-1-12`). The label after a year comes from `era_names`, unless Settings → World time → Year label sets another.

## Notes

The add-on reads these frontmatter fields:

| Note | Fields |
|---|---|
| any | `from`, `to` (or `born`, `died`): when it exists. A pin, token, text or drawing linked to the note follows these dates unless it has its own. |
| `type: place` | `parent`: the place it lies in. |
| `type: event` | `date`, `end`, `places`, `people`, `factions` (links), `era`, `importance` (1–5), `rumour`, `known_by`. Shown beside the pins of its places, and as a grey rumour for a while after it ended (Settings → Rumour window). |
| `type: era` | `from`, `to`: a stretch of the timeline. |
| `type: map-variant` | `map`, `scene`, `from`, `to`: another map image for the scene in those years. |

## On the map

- **Date bar**: the scene's viewing date, on any edge of the map or off (Settings, or the map's More options menu).
- **Set dates…** in the context menu of pins, tokens, texts and drawings. Objects outside the viewing date are hidden; the GM can see them faintly (Settings → Show objects from other times faintly). Players never do.
- Commands: Open world timeline, Log world event at the scene date, Edit date range and map variants of the scene, Show all times in the scene.
