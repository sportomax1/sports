# College Movement Lab — ESPN historical roster engine

Open: https://sportomax1.github.io/sports/college-movement.html

**No credentials, API keys, GitHub Actions jobs, or Vercel project are required.** The page runs as a static application and fetches historical ESPN roster membership in the browser.

## Features

- College football and men's college basketball.
- School selector with up to **four** programs scanned per comparison.
- Season range up to **six consecutive seasons** (default: current calendar year and previous two years).
- Unique ESPN athlete IDs, new roster appearances, departures, returning players, and season snapshots.
- **Observed school switches** when the same ESPN athlete ID occurs on two selected school rosters in different years.
- Year-by-year changes, team turnover, school-to-school movement paths, player history dialogs, and CSV exports.
- Local browser caching of player profiles and roster indexes. Existing cache persists on refresh.

## ESPN API endpoints

Historical team-season roster indexes are loaded from:

```
https://sports.core.api.espn.com/v2/sports/football/leagues/college-football/seasons/{YYYY}/teams/{teamId}/athletes?limit=200
https://sports.core.api.espn.com/v2/sports/basketball/leagues/mens-college-basketball/seasons/{YYYY}/teams/{teamId}/athletes?limit=200
```

These endpoints return athlete IDs (often via `$ref`). The page resolves each ID using the corresponding league athlete endpoint to obtain the athlete name, headshot, and position. For team selectors it uses ESPN's team listing or the repository's existing `data/campus-directory/men.json`.

**Important:** Do not use `site.api.espn.com/.../teams/{teamId}/roster?season=YYYY` for past seasons; that endpoint can ignore the season parameter and return the current roster. The engine explicitly avoids that silent error.

## Interpretations and limitations

- ESPN season-roster membership is observed data; it is not an official transfer portal transaction record.
- A player switching between selected teams in different years is labelled **roster-inferred** and is not a verified portal entrant or completed transfer transaction.
- Another transfer destination may exist outside the scanned schools. Scanning only one school still supports retention, newcomer, and exit comparisons, but **cannot** establish destinations.
- A roster departure does **not** prove a transfer, graduation, draft declaration, undrafted signing, or entry to any professional league. Early departures and NFL/NBA draft selections need separate sources and are intentionally **not counted** here.
- Comparisons require **both** adjacent team seasons to load completely; missing rosters are not counted as empty.
- Year is the football season-start year and the basketball season-ending year.
- ESPN endpoints are unofficial and may occasionally fail, change, block CORS, or throttle. A CORS fallback is attempted when necessary.
- The browser may make hundreds of requests per multi-year comparison because historical roster indexes generally expose ID references, not embedded player names. Load fewer schools or years for faster results. Cached data speeds up repeats.

## Former optional implementation

`api/college-movement.js`, `scripts/build-college-movement.mjs`, and `.github/workflows/college-movement.yml` were created for the original CFBD/CBBD-key approach, which is **not used by the current dashboard**. The legacy workflow is manual-only and optional; it requires provider API credentials and is **not necessary** to use the ESPN dashboard.
