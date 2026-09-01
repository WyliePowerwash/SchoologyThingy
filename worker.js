/* SchoologyThingy backend for Cloudflare Workers.
 * Required Worker secrets:
 *   SCHOOLOGY_CONSUMER_KEY
 *   SCHOOLOGY_CONSUMER_SECRET
 * Optional variable:
 *   FRONTEND_ORIGIN = https://wyliepowerwash.github.io
 */

const API='https://api.schoology.com/v1';
const REQUEST_TOKEN_URL=`${API}/oauth/request_token`;
const ACCESS_TOKEN_URL=`${API}/oauth/access_token`;
const AUTHORIZE_PATH='/oauth/authorize';
const FRONTEND_DEFAULT='https://wyliepowerwash.github.io';

function enc(v){return encodeURIComponent(String(v)).replace(/[!'()*]/g,c=>'%'+c.charCodeAt(0).toString(16).toUpperCase())}
function parseForm(text){return Object.fromEntries(new URLSearchParams(text).entries())}
async function hmac(secret,text){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text));let s='';for(const b of new Uint8Array(sig))s+=String.fromCharCode(b);return btoa(s)}
async function oauth1(method,url,credentials,extra={}){
 const u=new URL(url);const oauth={oauth_consumer_key:credentials.consumerKey,oauth_nonce:crypto.randomUUID().replaceAll('-',''),oauth_signature_method:'HMAC-SHA1',oauth_timestamp:String(Math.floor(Date.now()/1000)),oauth_version:'1.0'};
 if(credentials.token)oauth.oauth_token=credentials.token;
 const pairs=[];for(const [k,v] of u.searchParams)pairs.push([k,v]);for(const [k,v] of Object.entries(extra))pairs.push([k,v]);for(const [k,v] of Object.entries(oauth))pairs.push([k,v]);
 pairs.sort((a,b)=>enc(a[0]).localeCompare(enc(b[0]))||enc(a[1]).localeCompare(enc(b[1])));const normalized=pairs.map(([k,v])=>`${enc(k)}=${enc(v)}`).join('&');const base=`${method.toUpperCase()}&${enc(u.origin+u.pathname)}&${enc(normalized)}`;
 oauth.oauth_signature=await hmac(`${enc(credentials.consumerSecret)}&${enc(credentials.tokenSecret||'')}`,base);
 const headerParams={...oauth,...extra};return 'OAuth '+Object.entries(headerParams).map(([k,v])=>`${enc(k)}="${enc(v)}"`).join(', ')
}
function cookie(value,maxAge=3600){return `schoology_session=${enc(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`}
function readCookie(request){const raw=request.headers.get('Cookie')||'';const m=raw.match(/(?:^|;\s*)schoology_session=([^;]+)/);if(!m)return null;try{return JSON.parse(decodeURIComponent(m[1]))}catch{return null}}
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json',...headers}})}
function cors(origin){return {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Vary':'Origin'}}

async function schoologyFetch(path,session,env){
 const url=new URL(path.startsWith('http')?path:API+(path.startsWith('/')?path:'/'+path));
 const auth=await oauth1('GET',url.toString(),{consumerKey:env.SCHOOLOGY_CONSUMER_KEY,consumerSecret:env.SCHOOLOGY_CONSUMER_SECRET,token:session.oauth_token,tokenSecret:session.oauth_token_secret});
 return fetch(url,{headers:{Authorization:auth,Accept:'application/json'}})
}
async function getJson(path,session,env){const r=await schoologyFetch(path,session,env);const text=await r.text();let data=null;try{data=JSON.parse(text)}catch{}return {ok:r.ok,status:r.status,data,text}}
function arrayFrom(data,...keys){for(const key of keys){const value=data?.[key];if(Array.isArray(value))return value;if(value&&typeof value==='object'){for(const nested of Object.values(value))if(Array.isArray(nested))return nested}}return[]}
function dueValue(a){return a?.due||a?.due_date||null}
function isoOrRaw(v){if(!v)return null;const d=new Date(String(v).replace(' ','T'));return Number.isNaN(d.getTime())?String(v):d.toISOString()}

async function buildData(session,env){
 const me=await getJson('/users/me',session,env);if(me.status===401)return {expired:true};if(!me.ok)throw new Error(`Schoology /users/me returned ${me.status}`);
 const uid=me.data?.uid||me.data?.id;if(!uid)throw new Error('Schoology did not return a user id');
 const sec=await getJson(`/users/${uid}/sections?limit=50`,session,env);if(sec.status===401)return{expired:true};if(!sec.ok)throw new Error(`Schoology sections returned ${sec.status}`);
 const sections=arrayFrom(sec.data,'section','sections');
 const classes=sections.map(s=>({id:String(s.id),name:s.course_title||s.title||s.section_title||'Class',teacher:s.instructor_name||s.teacher_name||''}));
 const results=await Promise.all(classes.map(async c=>{const [a,g]=await Promise.all([getJson(`/sections/${encodeURIComponent(c.id)}/assignments?limit=50`,session,env),getJson(`/sections/${encodeURIComponent(c.id)}/grades?limit=50`,session,env)]);return{course:c,a:a.ok?arrayFrom(a.data,'assignment','assignments'):[],grades:g.ok?arrayFrom(g.data,'grade','grades'):[]}}));
 if(results.some(x=>x.a.status===401||x.grades.status===401))return{expired:true};
 const assignments=[];const grades=[];let missing=0;
 for(const r of results){for(const a of r.a){const due=dueValue(a);const completed=Number(a.completed||0)===1;let status=completed?'completed':'upcoming';if(!completed&&due&&new Date(String(due).replace(' ','T'))<new Date())status='missing';if(status==='missing')missing++;assignments.push({id:String(a.id||''),title:a.title||'Untitled assignment',course:r.course.name,date:isoOrRaw(due),status})}
  const gs=r.grades;const numeric=gs.filter(g=>g.grade!==null&&g.grade!==undefined&&g.max_points).map(g=>({p:Number(g.grade),m:Number(g.max_points)})).filter(g=>Number.isFinite(g.p)&&Number.isFinite(g.m)&&g.m>0);const pct=numeric.length?Math.round(100*numeric.reduce((s,g)=>s+g.p,0)/numeric.reduce((s,g)=>s+g.m,0)):null;grades.push({course:r.course.name,grade:pct===null?'—':`${pct}%`})}
 assignments.sort((a,b)=>(a.date||'').localeCompare(b.date||''));const now=Date.now(),week=now+7*86400000;const dueSoonCount=assignments.filter(a=>a.status==='upcoming'&&a.date&&new Date(a.date).getTime()<=week).length;
 const validGrades=grades.map(g=>parseFloat(g.grade)).filter(Number.isFinite);const overallGrade=validGrades.length?`${Math.round(validGrades.reduce((a,b)=>a+b,0)/validGrades.length)}%`:'—';
 const ev=await getJson(`/users/${uid}/events?limit=50`,session,env);if(ev.status===401)return{expired:true};const events=ev.ok?arrayFrom(ev.data,'event','events').map(e=>({title:e.title||'Event',date:isoOrRaw(e.start||e.start_time||e.date||e.due)})):[];
 return {user:{id:String(uid),name:me.data?.name||[me.data?.name_first,me.data?.name_last].filter(Boolean).join(' ')},classes,assignments,grades,events,overallGrade,missingCount:missing,dueSoonCount}
}

export default {async fetch(request,env){
 const url=new URL(request.url);const origin=env.FRONTEND_ORIGIN||FRONTEND_DEFAULT;const headers=cors(origin);if(request.method==='OPTIONS')return new Response(null,{headers});
 try{
  if(url.pathname==='/auth/start'){
   if(!env.SCHOOLOGY_CONSUMER_KEY||!env.SCHOOLOGY_CONSUMER_SECRET)return json({error:'Schoology OAuth credentials are not configured.'},500,headers);
   const callback=`${url.origin}/auth/callback`;const auth=await oauth1('POST',REQUEST_TOKEN_URL,{consumerKey:env.SCHOOLOGY_CONSUMER_KEY,consumerSecret:env.SCHOOLOGY_CONSUMER_SECRET},{oauth_callback:callback});const r=await fetch(REQUEST_TOKEN_URL,{method:'POST',headers:{Authorization:auth}});const data=parseForm(await r.text());if(!data.oauth_token||!data.oauth_token_secret)return json({error:'Schoology did not return a request token.'},502,headers);
   const state=JSON.stringify({oauth_token:data.oauth_token,oauth_token_secret:data.oauth_token_secret});const domain=env.SCHOOLOGY_DOMAIN||'https://troyschools.schoology.com';return new Response(null,{status:302,headers:{Location:`${domain}${AUTHORIZE_PATH}?oauth_token=${enc(data.oauth_token)}`,'Set-Cookie':cookie(state,600)}})
  }
  if(url.pathname==='/auth/callback'){
   const pending=readCookie(request),token=url.searchParams.get('oauth_token'),verifier=url.searchParams.get('oauth_verifier');if(!pending||!token||!verifier||pending.oauth_token!==token)return json({error:'Invalid OAuth callback.'},400,headers);
   const auth=await oauth1('POST',ACCESS_TOKEN_URL,{consumerKey:env.SCHOOLOGY_CONSUMER_KEY,consumerSecret:env.SCHOOLOGY_CONSUMER_SECRET,token,tokenSecret:pending.oauth_token_secret},{oauth_verifier:verifier});const r=await fetch(ACCESS_TOKEN_URL,{method:'POST',headers:{Authorization:auth}});const data=parseForm(await r.text());if(!data.oauth_token||!data.oauth_token_secret)return json({error:'Schoology authorization failed.'},502,headers);
   const final=JSON.stringify({oauth_token:data.oauth_token,oauth_token_secret:data.oauth_token_secret});return new Response(null,{status:302,headers:{Location:`${origin}/SchoologyThingy/?connected=1`,'Set-Cookie':cookie(final,60*60*24*90)}})
  }
  if(url.pathname==='/auth/status')return json({connected:!!readCookie(request)},200,headers);
  if(url.pathname==='/auth/logout')return json({ok:true},200,{...headers,'Set-Cookie':cookie('',0)});
  if(url.pathname==='/api/data'){
   const session=readCookie(request);if(!session)return json({error:'Not connected.'},401,headers);const data=await buildData(session,env);if(data.expired)return json({error:'Schoology authorization expired. Please reconnect.'},401,headers);return json(data,200,headers)
  }
  if(url.pathname==='/')return json({ok:true,service:'SchoologyThingy backend'},200,headers);
  return json({error:'Not found'},404,headers)
 }catch(error){console.error(error);return json({error:'Backend error',detail:String(error?.message||error)},500,headers)}
}};
