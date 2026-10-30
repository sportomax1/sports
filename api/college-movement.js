// Vercel serverless API for College Movement Lab.
// Keep CFBD_API_KEY and CBBD_API_KEY in Vercel environment variables, not client code.
'use strict';
const SOURCES = {
  football: { base:'https://api.collegefootballdata.com', key:'CFBD_API_KEY', portal:'/player/portal', draft:'/draft/picks', roster:'/roster' },
  basketball: { base:'https://api.collegebasketballdata.com', key:'CBBD_API_KEY', portal:'/recruiting/portal', draft:'/draft/picks', roster:'/teams/roster' }
};
const val = (obj, ...keys) => {for(const k of keys) if(obj && obj[k] !== undefined && obj[k] !== null) return obj[k];return null;};
const name = r => String(val(r,'name','fullName','full_name') || [val(r,'firstName','first_name'),val(r,'lastName','last_name')].filter(Boolean).join(' ')).trim();
const school = x => typeof x==='string' ? x.trim() : String(val(x,'name','displayName','team')||'').trim();
const numeric = x => x===null||x===undefined||x==='' ? null : Number.isFinite(Number(x))?Number(x):null;
function normalize(type, sport, raw, year, requestedTeam) {
 if(type==='portal') return raw.map((r,i)=>({
   id:String(val(r,'sourceId','source_id','id')||[sport,year,i].join('-')),
   year:numeric(val(r,'season','year'))||year,
   player:name(r),position:String(val(r,'position')||''),
   origin:school(val(r,'origin','sourceTeam','source_team')),
   destination:school(val(r,'destination','destinationTeam','destination_team')),
   originConference:String(val(val(r,'origin'),'conference')||''),
   destinationConference:String(val(val(r,'destination'),'conference')||''),
   date:val(r,'transferDate','transfer_date')||null,
   stars:numeric(val(r,'stars')),rating:numeric(val(r,'rating')),
   eligibility:val(r,'yearsRemaining','years_remaining')??val(r,'eligibility')??null,
   source:sport==='football'?'CFBD':'CBBD'
 })).filter(r=>r.player);
 if(type==='draft') return raw.map((r,i)=>({
   id:String(val(r,'collegeAthleteId','athleteId','athlete_id')||[sport,year,i].join('-')),
   year:numeric(val(r,'year'))||year,player:name(r),
   college:sport==='football'?
     school(val(r,'collegeTeam','college_team')):
     school(val(r,'sourceTeamLocation','source_team_location'))||school(val(r,'sourceTeamName','source_team_name')),
   proTeam:school(val(r,'nflTeam','nfl_team','draftTeam','draft_team')),
   round:numeric(val(r,'round')),pick:numeric(val(r,'overall')),position:val(r,'position')||'',
   source:sport==='football'?'CFBD':'CBBD'
 })).filter(r=>r.player);
 let players=[];
 if(sport==='basketball'){
   for(const teamBlock of raw) {
     if(Array.isArray(teamBlock.players)) {
       const t=school(val(teamBlock,'team'))||requestedTeam;
       for(const p of teamBlock.players) players.push({...p,team:t});
     } else players.push(teamBlock);
   }
 } else players=raw;
 return players.map((r,i)=>({
    id:String(val(r,'sourceId','source_id','id')||''),
    player:name(r),team:school(val(r,'team'))||requestedTeam,
    position:String(val(r,'position')||''),year:year
 })).filter(r=>r.player && (!requestedTeam || r.team.toLowerCase()===requestedTeam.toLowerCase()));
}
module.exports=async function handler(req,res) {
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(req.method!=='GET') return res.status(405).json({error:'GET required'});
 const q=req.query||{};
 const sport=String(q.sport||'football').toLowerCase();
 const type=String(q.type||'status').toLowerCase();
 if(type==='status') return res.status(200).json({
   available:{football:!!process.env.CFBD_API_KEY,basketball:!!process.env.CBBD_API_KEY},
   message:'Configure CFBD_API_KEY and CBBD_API_KEY as private Vercel environment variables.',
   sources:{football:SOURCES.football.base,basketball:SOURCES.basketball.base}
 });
 if(!SOURCES[sport] || !['portal','draft','roster'].includes(type)) return res.status(400).json({error:'Invalid sport or dataset'});
 const year=Number(q.year);
 const max=new Date().getUTCFullYear()+1;
 if(!Number.isInteger(year)||year<2001||year>max) return res.status(400).json({error:'Invalid year'});
 if(type==='portal'&&year<2021) return res.status(400).json({error:'Portal data starts in 2021'});
 const team=String(q.team||'').trim();
 if(type==='roster'&&(!team||team.length>90||!/^[-A-Za-z0-9 .&'()]+$/.test(team)))
    return res.status(400).json({error:'A valid school name is required for roster comparisons'});
 const src=SOURCES[sport],key=process.env[src.key];
 if(!key) return res.status(503).json({error:src.key+' is not configured on the server',code:'KEY_MISSING'});
 const params=new URLSearchParams();
 params.set(sport==='basketball' && type!=='draft'?'season':type==='portal'&&sport==='football'?'year':'year',String(year));
 if(sport==='basketball'&&type==='portal') {params.delete('season');params.set('year',String(year));}
 if(type==='roster') params.set('team',team);
 const url=src.base+src[type]+'?'+params.toString();
 try{
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),12500);
  let response;
  try{response=await fetch(url,{headers:{Authorization:'Bearer '+key,Accept:'application/json'},signal:controller.signal});}
  finally{clearTimeout(timer);}
  const body=await response.text();
  if(!response.ok){
    const message=response.status===401?'API authentication failed':response.status===429?'API quota or rate limit exceeded':'Data provider returned HTTP '+response.status;
    return res.status(response.status===401?502:response.status===429?429:502).json({error:message,source:src.base,upstreamStatus:response.status});
  }
  let raw=JSON.parse(body);
  if(!Array.isArray(raw)) return res.status(502).json({error:'Unexpected provider response',source:src.base});
  const records=normalize(type,sport,raw,year,team);
  res.setHeader('Cache-Control',type==='portal'?'s-maxage=900, stale-while-revalidate=3600':'s-maxage=86400, stale-while-revalidate=604800');
  return res.status(200).json({sport,type,year,team:team||null,records,source:src.base,updatedAt:new Date().toISOString(),count:records.length});
 }catch(e){return res.status(502).json({error:e.name==='AbortError'?'Provider request timed out':'Provider data could not be loaded',source:src.base});}
};