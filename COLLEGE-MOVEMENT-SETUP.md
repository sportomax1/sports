# College Movement Lab — Nationwide ESPN roster tracker

**Live site:** https://sportomax1.github.io/sports/college-movement.html

The national dashboard loads prebuilt season-level player membership indexes from ESPN. **No API key is required.**

For real-time checks of up to four specific schools, use [Live School Compare](https://sportomax1.github.io/sports/college-movement-live.html).

## National coverage

* Football: all teams returned by ESPN's college-football team directory, including lower-division schools. **Being listed does not mean ESPN publishes a usable historical roster**. This population was 762 schools in the October 2026 scan.
* Men's basketball: ESPN-listed college teams (362 in the October 2026 scan).
* 2024, 2025, and 2026 season snapshots are created and refreshed through GitHub Actions; each version includes the team directory and exactly which schools had valid or missing roster indexes.
* The initial dashboard compares 2024–2026; you can select a subset or additional years **only if** matching snapshots are published.
* Background GitHub Actions refresh [national season indexes](https://github.com/sportomax1/sports/actions/workflows/national-college-rosters.yml) weekly and publish a compact **player-name lookup** for inferred transfer candidates.
* Every team-season is marked `ok`, `partial` or `missing`. Unknowns are *never* counted as zero athlete movement.

## What the metrics mean

* **Observed switch:** Same unique ESPN athlete ID appears on exactly one school’s roster in year N, and a different school’s roster in N+1. No switch is inferred from matching names alone. IDs linked to multiple schools in either season are excluded.
* **New roster appearance:** An athlete on a school’s current roster whose athlete ID is absent from that school's prior-year *complete* roster.
* **Roster departure:** Present on prior-year roster but absent from the school’s current-year *complete* roster; outcome unknown without another source.
* **Retention:** Returning athlete IDs divided by the prior-year roster membership count. Rates pool numerators/denominators over *comparable adjacent school-season pairs*; a mean of team percentages would be incorrect.
* **School pipeline:** Counts of observed switches between two schools, not proof of portal transactions.
* **"Going pro":** Not determined. Neither disappearance from a roster nor ESPN athlete IDs establish NFL/NBA draft status, early declarations, or signing contracts.

**Important limitations:** Some seasons have sparse or inconsistent ESPN historical membership records. A roster with fewer than **35 football athletes** or **10 basketball athletes** is rejected as incomplete. Counts of observed transfers may vary dramatically across years due to differences in historical source coverage, and should not be treated as official portal trend totals. The dashboard warns about these discrepancies. A listed school with a missing year is excluded from both retention numerator and denominator. ESPN endpoints are undocumented and may change.

## Architecture

| File | Purpose |
| --- | --- |
| `college-movement.html` | Nationwide charts, all-school picker, sortable team leaderboard, player routes, roster audit and coverage |
| `college-national-engine.js` | Data validation and deterministic inference, plus lazy athlete/profile discovery |
| `data/college-rosters/football/YYYY.json` | Versioned football team-season roster membership observations and per-team coverage |
| `data/college-rosters/basketball/YYYY.json` | Versioned basketball team-season roster membership observations |
| `data/college-rosters/profiles/{sport}.json` | Names and positions for athletes observed switching schools; refreshed after snapshots |
| `scripts/build-national-college-rosters.mjs` | ESPN collection, retry, coverage and sparse-roster validation, one sport/year per job |
| `scripts/build-college-player-index.mjs` | Resolve names for inferred school-switch candidates |
| `.github/workflows/national-college-rosters.yml` | Automated six-shard refresh and player-name index, plus manual runs |
| `scripts/test-national-college.mjs` | Fixture and real-data regression tests: identities, duplicate memberships, missingness, aggregates |
| `scripts/test-national-page.mjs` | UI boot, team picker, views and filtering integration test |
| `scripts/test-college-roster.mjs` | Live ESPN football/basketball endpoint smoke tests |
| `college-movement-live.html` | On-demand small-school comparison, independent of snapshots |

## Using the dashboard

1. Choose **football** or **men's basketball**.
2. Choose the beginning and ending season.
3. Keep **All ESPN-listed schools** for national results, or choose one school to filter the entire analysis to its incoming/outgoing movement.
4. Explore observed switches, team rankings, pipelines, unresolved exits, individual roster audit, and national coverage. Use CSV export to inspect your filtered records.
5. Click an athlete for the source-linked season/school history. Names may load from the generated lookup or directly from ESPN.

To expand historical coverage beyond the default three years, add the desired season(s) to the workflow matrix and run a backfill. Current snapshots are intentionally scoped to 2024–2026 to keep recurring GitHub Actions work bounded.

## Validation

Every code change triggers GitHub Actions checks:
- JavaScript syntax for the engine and data scripts
- Fixture testing for moves, duplicate same-year memberships, sparse data, and incomplete years
- Regression tests using the actual published national snapshots
- UI integration boot, all-schools dropdown, charts, navigation and school filters
- Live ESPN football/basketball season-roster and athlete-profile smoke tests

The dashboard is a **roster movement inference tool** and must not be represented as an official NCAA transfer-portal feed.
