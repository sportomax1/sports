'use strict';
// BracketLab's optional same-origin Vercel relay. No secrets or arbitrary URL proxying.
const ESPN_SITE=/^\/apis\/(?:site\/v2|v2)\/sports\/basketball\/(?:mens|womens)-college-basketball\/(?:scoreboard|rankings|teams|standings)$/;
const NCAA_SCORE=/^\/scoreboard\/basketball-(?:men|women)\/d1\/\d{4}\/\d{2}\/\d{2}\/all-conf$/;
const allowed=new Set(['site.api.espn.com','site.web.api.espn.com','ncaa-api.henrygd.me']);
module.exports=async function handler(req,res){
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({error:'GET required'});
 let target;try{const raw=req.query?.url;if(typeof raw!=='string'||raw.length>900)throw Error('Invalid URL');target=new URL(raw);if(target.protocol!=='https:'||!allowed.has(target.hostname)||target.username||target.password||target.port)throw Error('Unsupported provider');if(target.hostname==='ncaa-api.henrygd.me'?!NCAA_SCORE.test(target.pathname):!ESPN_SITE.test(target.pathname))throw Error('Unapproved endpoint');for(const k of target.searchParams.keys())if(!/^(?:dates|groups|group|limit|season|region|lang|level|type|contentorigin)$/.test(k))throw Error('Unapproved parameter');}catch(e){return res.status(400).json({error:e.message||'Invalid source URL'})}
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
 try{
  const upstream=await fetch(target.href,{headers:{Accept:'application/json','User-Agent':'BracketLab/1.0'},signal:controller.signal,redirect:'error',cache:'no-store'});
  if(!upstream.ok)return res.status(502).json({error:'Upstream '+upstream.status,source:target.hostname});
  const text=await upstream.text();if(text.length>6500000)return res.status(502).json({error:'Provider response too large'});
  let body;try{body=JSON.parse(text)}catch{return res.status(502).json({error:'Invalid JSON from '+target.hostname})}
  return res.status(200).json(body);
 }catch(error){return res.status(502).json({error:error?.name==='AbortError'?'Provider timeout':'Provider unavailable',source:target.hostname})}finally{clearTimeout(timer)}
};