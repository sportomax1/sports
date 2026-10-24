#!/usr/bin/env node
/**
 * Builds same-origin, GitHub Pages-compatible team/roster snapshots.
 * Run: node scripts/build-jersey-data.mjs [NFL NBA MLB NHL NCAAF NCAAM WNBA NCAAW]
 * Undocumented ESPN endpoints; fail safely and retain valid prior snapshots.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const LEAGUES = {
  NFL: ['football', 'nfl'],
  NBA: ['basketball', 'nba'],
  MLB: ['baseball', 'mlb'],
  NHL: ['hockey', 'nhl'],
  NCAAF: ['football', 'college-football'],
  NCAAM: ['basketball', 'mens-college-basketball'],
  WNBA: ['basketball', 'wnba'],
  NCAAW: ['basketball', 'womens-college-basketball']
};
const keys = process.argv.slice(2).filter(k => LEAGUES[k]);
const selected = keys.length ? keys : Object.keys(LEAGUES);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const str = x => String(x ?? '').trim();
const validUrl = x => /^https:\/\//i.test(str(x)) ? x : '';
const endpoint = (sport, slug) => 'https://site.api.espn.com/apis/site/v2/sports/' + sport + '/' + slug;
const outputDir = join('data', 'jersey');
await mkdir(outputDir, { recursive: true });
const chunkDir=join(outputDir,'chunks');
await mkdir(chunkDir,{recursive:true});

async function getJSON(url) {
  let error;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 16000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
          'user-agent': 'SportomaxJerseySnapshot/1.0 (+https://github.com/sportomax1/sports)'
        }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      if (!j || typeof j !== 'object') throw new Error('No JSON body');
      return j;
    } catch (e) {
      error = e;
      if (attempt < 2) await delay((attempt + 1) * 1750);
    } finally { clearTimeout(timer); }
  }
  throw error;
}
function team(raw) {
  const t = raw?.team || raw || {};
  if (!t.id) return null;
  return {
    id: str(t.id),
    name: str(t.displayName || t.name || t.shortDisplayName || t.id),
    abbr: str(t.abbreviation),
    logo: validUrl(t.logos?.[0]?.href || t.logo),
    color: /^[a-f0-9]{6}$/i.test(str(t.color)) ? '#' + t.color : '#496783',
    players: []
  };
}
function player(raw, pos = '') {
  const p = raw?.athlete || raw || {};
  if (!p.id) return null;
  const name = str(p.displayName || p.fullName || [p.firstName,p.lastName].filter(Boolean).join(' '));
  if (!name) return null;
  return {
    id: str(p.id), name,
    jersey: str(p.jersey ?? raw?.jersey),
    position: str(p.position?.abbreviation || raw?.position?.abbreviation || pos || '—'),
    head: validUrl(p.headshot?.href || p.headshot?.url || p.head),
    height: str(p.displayHeight || p.height),
    weight: str(p.displayWeight || p.weight),
    age: p.age || '',
    college: str(p.college?.name || p.college),
    country: str(p.birthPlace?.country),
    status: str(p.status?.name || p.status),
    experience: p.experience?.years ?? '',
    links: Array.isArray(p.links) ? p.links.filter(x => validUrl(x?.href)).slice(0, 3) : []
  };
}
function roster(data) {
  let groups = data?.athletes || data?.items || data?.players || [];
  if (!Array.isArray(groups)) groups = Object.values(groups);
  const all = [];
  for (const group of groups) {
    if (Array.isArray(group?.items)) {
      const pos = group.position?.abbreviation || group.position?.name || group.name || '';
      for (const item of group.items) all.push(player(item,pos));
    } else if (Array.isArray(group?.athletes)) {
      for (const item of group.athletes) all.push(player(item,group.position?.abbreviation || ''));
    } else all.push(player(group));
  }
  return [...new Map(all.filter(Boolean).map(p => [p.id,p])).values()]
    .sort((a,b) => (Number(a.jersey)||9999)-(Number(b.jersey)||9999) || a.name.localeCompare(b.name));
}
async function eachLimited(items, max, fn) {
  let next=0, result=new Array(items.length);
  await Promise.all(Array.from({length: Math.min(max,items.length)}, async () => {
    while (next < items.length) {
      const i=next++;
      try { result[i]=await fn(items[i],i); }
      catch(e) { result[i]={error:e.message}; }
      await delay(220);
    }
  }));
  return result;
}
for (const league of selected) {
  const [sport,slug] = LEAGUES[league];
  const dest=join(outputDir,league.toLowerCase()+'.json');
  let prior={teams:[]};
  try { prior=JSON.parse(await readFile(dest,'utf8')); } catch {}
  const previous=new Map((prior.teams||[]).map(t=>[str(t.id),t]));
  const previousChunks=[...new Set((prior.teams||[]).map(t=>t.chunk).filter(x=>x!=null))];
  for(const ch of previousChunks){try{const old=JSON.parse(await readFile(join(chunkDir,league.toLowerCase()+'-'+ch+'.json'),'utf8'));for(const t of old.teams||[])previous.set(str(t.id),t)}catch{}}
  console.log('['+league+'] Fetching team directory');
  let rawTeams;
  try {
    const listing=await getJSON(endpoint(sport,slug)+'/teams?limit=500');
    rawTeams=listing?.sports?.[0]?.leagues?.[0]?.teams || listing?.teams || [];
    if(!Array.isArray(rawTeams)) rawTeams=Object.values(rawTeams);
    if(!rawTeams.length) throw new Error('No teams in directory');
  } catch(e) {
    console.error('['+league+'] Team directory failure. Keeping old snapshot:',e.message);
    continue;
  }
  let teams=rawTeams.map(team).filter(Boolean);
  teams=[...new Map(teams.map(t=>[t.id,t])).values()];
  if(teams.length<3) {console.error('['+league+'] Too few teams returned; preserving previous snapshot');continue;}
  let succeeded=0,failed=0;
  const hydrated=await eachLimited(teams,5,async (t,i)=>{
    try {
      const raw=await getJSON(endpoint(sport,slug)+'/teams/'+encodeURIComponent(t.id)+'/roster');
      const players=roster(raw);
      if(!players.length) throw new Error('Empty roster');
      succeeded++;
      if(i%40===0)console.log('['+league+'] team '+(i+1)+' / '+teams.length);
      return {...t,players};
    } catch(e) {
      failed++;
      const old=previous.get(t.id);
      if(old?.players?.length) return {...t,players:old.players};
      return {...t,players:[]};
    }
  });
  const coverage=hydrated.filter(t=>Array.isArray(t.players)&&t.players.length).length;
  // Protect good data when ESPN is down or a league shape changes unexpectedly.
  if(coverage<Math.max(2,Math.ceil(teams.length*0.6))) {
    console.error('['+league+'] Coverage too low ('+coverage+'/'+teams.length+'); retaining old snapshot');
    continue;
  }
  hydrated.sort((a,b)=>a.name.localeCompare(b.name));
  const generatedAt=new Date().toISOString();
  let catalog=hydrated;
  if(league.startsWith('NCAA')){
    const shardSize=16;
    catalog=hydrated.map((t,i)=>({...t,players:[],chunk:Math.floor(i/shardSize)}));
    for(let start=0;start<hydrated.length;start+=shardSize){
      const ch=Math.floor(start/shardSize);
      const chunk={generatedAt,league,teams:hydrated.slice(start,start+shardSize)};
      await writeFile(join(chunkDir,league.toLowerCase()+'-'+ch+'.json'),JSON.stringify(chunk));
    }
  }
  const payload={
    generatedAt,league,source:'ESPN public site API snapshot',
    successfulTeams:succeeded,failedTeams:failed,teams:catalog
  };
  await writeFile(dest,JSON.stringify(payload));
  console.log('['+league+'] Wrote '+hydrated.length+' teams; '+succeeded+' fresh, '+failed+' fallback/empty; '+(catalog===hydrated?'full bundle':'chunked catalog'));
}
