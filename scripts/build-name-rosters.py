#!/usr/bin/env python3
"""Collect public ESPN team rosters into same-origin GitHub Pages JSON snapshots."""
import concurrent.futures, json, os, time, urllib.request
from datetime import datetime, timezone
from pathlib import Path
LEAGUES={'NFL':('football','nfl'),'NBA':('basketball','nba'),'MLB':('baseball','mlb'),'NHL':('hockey','nhl'),'NCAAF':('football','college-football'),'NCAAM':('basketball','mens-college-basketball')}
BASE='https://site.api.espn.com/apis/site/v2/sports'
YEAR=datetime.now(timezone.utc).year
def get(url):
    for attempt in range(3):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 SportsNameExplorer/1.0','Accept':'application/json'})
            with urllib.request.urlopen(req,timeout=22) as response:return json.load(response)
        except Exception:
            if attempt==2:raise
            time.sleep(1.5*(attempt+1))
def collect(item):
    league,(sport,slug)=item
    url=f'{BASE}/{sport}/{slug}/teams?limit=500'
    teams=get(url).get('sports',[{}])[0].get('leagues',[{}])[0].get('teams',[])
    teams=[t.get('team',t) for t in teams]
    def roster(t):
        data=get(f"{BASE}/{sport}/{slug}/teams/{t['id']}/roster")
        out=[]
        for group in (data.get('athletes') or data.get('items') or []):
            for raw in (group.get('items') if isinstance(group,dict) and isinstance(group.get('items'),list) else [group]):
                p=raw.get('athlete',raw)
                name=p.get('fullName') or p.get('displayName') or p.get('name') or ''
                if not name or not p.get('id'):continue
                words=name.split()
                image=p.get('headshot') or {}
                out.append({'id':str(p['id']),'league':league,'year':YEAR,'team':t.get('displayName') or t.get('name') or '', 'teamLogo':(t.get('logos') or [{}])[0].get('href',''), 'name':name,'first':p.get('firstName') or words[0], 'last':p.get('lastName') or ' '.join(words[1:]),'position':(p.get('position') or {}).get('abbreviation','').upper(),'image':image.get('href','') if isinstance(image,dict) else ''})
        return out
    players=[];failed=0
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures=[pool.submit(roster,t) for t in teams if t.get('id')]
        for future in concurrent.futures.as_completed(futures):
            try:players.extend(future.result())
            except Exception as e:failed+=1;print(league,'team failed:',str(e)[:160])
    if not players:raise RuntimeError(f'{league}: no players, refusing to write empty snapshot')
    path=Path('data/name-explorer')/league/f'{YEAR}.json'
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps({'league':league,'year':YEAR,'collectedAt':datetime.now(timezone.utc).isoformat(),'teams':len(teams),'failedTeams':failed,'players':players},separators=(',',':')),encoding='utf-8')
    print(league,len(players),'players',failed,'failed teams')
failures=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    futures={pool.submit(collect,item):item[0] for item in LEAGUES.items()}
    for future in concurrent.futures.as_completed(futures):
        try:future.result()
        except Exception as e:
            failures.append(futures[future]);print('FAILED:',futures[future],e)
if len(failures)==len(LEAGUES):
    raise SystemExit('All league downloads failed; refusing to report a successful workflow')
if failures:print('Partial data coverage:',','.join(failures))
