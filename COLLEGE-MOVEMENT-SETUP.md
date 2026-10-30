# College Movement Lab — setup and data contract

**Files:** `college-movement.html` · `api/college-movement.js` · `scripts/build-college-movement.mjs` · `.github/workflows/college-movement.yml`.

This dashboard compares college football and **men's college basketball** transfer portal history (2021+) and corresponding NFL/NBA draft picks. It has two access levels:

| Mode | Host | Data visible | Configuration |
|---|---|---|---|
| Public aggregate dashboard | Static host (GitHub Pages or Vercel) | Yearly portal counts, known destinations, departures/arrivals by school, school-to-school transfer totals, aggregate college draft counts | CFBD + CBBD GitHub Actions secrets; run snapshot job |
| Private player analytics | Vercel host with serverless functions | Individual portal entries, named destinations, player candidate timeline, draft-pick directory, team roster comparisons | Provider secrets + `DASHBOARD_ACCESS_TOKEN` on Vercel; user unlocks the page |

**No API keys or raw player-level snapshots should be checked into the public GitHub repository.** The snapshot builder writes only *derived aggregate counts* to `data/college-movement/summaries/...`. Private player records are served from an authenticated backend for owner use and are not cached as a public feed.

## 1. Obtain API keys

- Request a CFBD API key: https://collegefootballdata.com/
- Request a CBBD API key: https://collegebasketballdata.com/
- Review their current API quotas, endpoints, and terms: https://collegefootballdata.com/terms and https://collegebasketballdata.com/terms. Both APIs share a quota pool.

## 2. Activate the public trends on GitHub Pages

1. Open `https://github.com/sportomax1/sports/settings/secrets/actions`.
2. Under **Repository secrets**, configure `CFBD_API_KEY` and `CBBD_API_KEY`, each with the matching provider token.
3. Open `https://github.com/sportomax1/sports/actions/workflows/college-movement.yml`.
4. Select **Run workflow** and enable **history** for initial 2021-through-current backfill.
5. Confirm a successful workflow and inspect `data/college-movement/manifest.json` and `data/college-movement/summaries/football/YYYY.json` (and basketball).
6. Visit `college-movement.html` on the host that publishes this repository.

The workflow runs every Monday at 12:45 UTC for current/previous-cycle updates. Missing years should be treated as **unavailable**, not as zero. Github Actions may have to be enabled in repository Settings. Partial/missing snapshots are identified as incomplete coverage.

## 3. Optional: enable private player-level detail

This requires a **Vercel project connected to this GitHub repository**, not only a GitHub Pages deployment.

1. In Vercel's project **Environment Variables**, set `CFBD_API_KEY`, `CBBD_API_KEY`, and `DASHBOARD_ACCESS_TOKEN`.
2. Generate a unique random access token of at least 24 characters; avoid a reused password.
3. Set the environment variables for Production (and Preview only if needed), redeploy, and ensure Vercel's API route `/api/college-movement?type=status` responds (metadata only).
4. On your deployed `college-movement.html`, select **Unlock private player data** and enter the **dashboard access token** (NOT the provider keys). It is kept in in-memory JavaScript state only, not local storage, URL query, cookies, or GitHub.
5. Click **Lock player data** when finished. For strongest privacy, use Vercel Deployment Protection or other authentication in addition to this access token.

The backend returns HTTP 401 for private reads without the access token. Do not distribute the private token or embed it in any public-facing page. No connected Vercel project was detected in the current account during development, so the private deployment is **not** currently activated.

## Data definitions and limitations

- **Portal entries:** Player records in the provider's portal dataset, **not** completed transfers.
- **Known destinations:** Entries that list a destination school; these are not confirmed enrollments by themselves.
- **Departures:** Number of portal entries from a school. Not all roster departures.
- **Arrivals:** Number of entries listing the school as destination.
- **Net listed:** Recorded incoming minus recorded outgoing entries; not roster growth.
- **Roster retention:** Matched athletes on consecutive team roster snapshots in private mode. Missing IDs and name changes can affect comparisons.
- **Going pro:** NFL/NBA **draft selections**, not all players who declared or signed professionally. **Early departure status** requires validated class-year, eligibility, or declaration evidence, which is not currently provided by this dashboard.
- **Player path modal:** Cross-season exact-name matches are candidate matches, not identity-verified when player identifiers differ.
- **Current season and current portal cycles** can be incomplete. Basketball rosters use season-ending years while draft and portal cycle years follow separate calendars.
- **Scope:** Men's college basketball through CBBD. The existing `campus-roster-timeline.html` handles women's basketball roster history separately.
- **Provider source and terms:** https://api.collegefootballdata.com/data-availability · https://api.collegebasketballdata.com/data-availability · https://collegefootballdata.com/terms.

No provider observations have been added as sample or invented records. Real values appear only after keys are configured and data has been successfully retrieved.
