#!/usr/bin/env python3
"""Build same-origin NCAA Division I team directories for Campus Roster Timeline."""
from __future__ import annotations
import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

BASE = "https://site.api.espn.com"
OUTPUT = Path("data/campus-directory")
UA = "Mozilla/5.0 (compatible; SportomaxCampusRoster/1.0; public ESPN data)"
LEAGUES = {"men": "mens-college-basketball", "women": "womens-college-basketball"}


def get_json(url: str, retries: int = 3):
    errors = []
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=30) as res:
                return json.load(res)
        except (urllib.error.URLError, TimeoutError, ValueError, OSError) as exc:
            errors.append(str(exc))
            if attempt + 1 < retries:
                time.sleep(2 ** attempt)
    raise RuntimeError(f"ESPN request failed {url}: {'; '.join(errors)}")


def normalize(raw):
    output = {}
    for item in raw:
        team = item.get("team", item)
        tid = str(team.get("id") or "").strip()
        name = team.get("displayName") or team.get("name") or ""
        if not tid.isdigit() or not name:
            continue
        logos = team.get("logos") or []
        logo = (logos[0] or {}).get("href") if logos else None
        logo = logo or team.get("logo") or f"https://a.espncdn.com/i/teamlogos/ncaa/500/{tid}.png"
        output[tid] = {"id": tid, "name": name, "abbr": team.get("abbreviation") or "", "logo": logo}
    return output


def standings_teams(obj):
    result = []
    def visit(node):
        for item in ((node.get("standings") or {}).get("entries") or []):
            if item.get("team"):
                result.append(item["team"])
        for child in node.get("children") or []:
            visit(child)
    visit(obj)
    return result


def run(league, slug, year):
    teams_url = f"{BASE}/apis/site/v2/sports/basketball/{slug}/teams?groups=50&limit=500"
    standings_url = f"{BASE}/apis/v2/sports/basketball/{slug}/standings?group=50&level=3&season={year}&region=us&lang=en&contentorigin=espn"
    all_teams = {}
    errors = []
    for url, extract in ((teams_url, lambda j: (j.get("sports") or [{}])[0].get("leagues", [{}])[0].get("teams", [])),
                         (standings_url, standings_teams)):
        try:
            all_teams.update(normalize(extract(get_json(url))))
        except (RuntimeError, IndexError, KeyError, TypeError) as exc:
            errors.append(str(exc))
    if len(all_teams) < 300:
        raise RuntimeError(f"{league}: only {len(all_teams)} teams. Rejecting incomplete Division I directory. {'; '.join(errors)}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    path = OUTPUT / f"{league}.json"
    payload = {"league": league, "season": year, "fetchedAt": datetime.now(timezone.utc).isoformat(),
               "source": "ESPN NCAA Division I team directory and standings", "count": len(all_teams),
               "teams": sorted(all_teams.values(), key=lambda x: x["name"].casefold())}
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{league}: {len(all_teams)} Division I schools -> {path}")


def main():
    now = datetime.now(timezone.utc)
    season = now.year + (now.month >= 8)
    for league, slug in LEAGUES.items():
        run(league, slug, season)


if __name__ == "__main__":
    main()
