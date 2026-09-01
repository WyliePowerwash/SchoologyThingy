/* SchoologyThingy OAuth/API backend for Cloudflare Workers.
 * Secrets required in the Worker environment:
 *   SCHOOLOGY_CONSUMER_KEY
 *   SCHOOLOGY_CONSUMER_SECRET
 *   FRONTEND_ORIGIN (optional)
 *
 * This backend never asks the user for their Schoology password.
 */

const SCHOOLOGY = 'https://api.schoology.com/v1';
const REQUEST_TOKEN_URL = 'https://api.schoology.com/v1/oauth/request_token';
const AUTHORIZE_URL = 'https://app.schoology.com/oauth/authorize';
const ACCESS_TOKEN_URL = 'https://api.schoology.com/v1/oauth/access_token';

function enc(v) { return encodeURIComponent(v).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()); }
function parseForm(text) { const p = new URLSearchParams(text); return Object.fromEntries(p.entries()); }
function oauthHeader(params) { return 'OAuth ' + Object.entries(params).map(([k,v]) => `${enc(k)}="${enc(v)}"`).join(', '); }
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-1'}, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}
async function oauth1(method, url, credentials, extra={}) {
  const u = new URL(url);
  const oauth = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_nonce: crypto.randomUUID().replaceAll('-', ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now()/1000).toString(),
    oauth_version: '1.0'
  };
  if (credentials.token) oauth.oauth_token = credentials.token;
  const pairs=[];
  for (const [k,v] of u.searchParams) pairs.push([k,v]);
  for (const [k,v] of Object.entries(extra)) pairs.push([k,v]);
  for (const [k,v] of Object.entries(oauth)) pairs.push([k,v]);
  pairs.sort((a,b)=>enc(a[0]).localeCompare(enc(b[0])) || enc(a[1]).localeCompare(enc(b[1])));
  const normalized=pairs.map(([k,v])=>`${enc(k)}=${enc(v)}`).join('&');
  const base=`${method.toUpperCase()}&${enc(u.origin+u.pathname)}&${enc(normalized)}`;
  oauth.oauth_signature=await hmac(`${enc(credentials.consumerSecret)}&${enc(credentials.tokenSecret||'')}`,base);
  return oauthHeader(oauth);
}

function cookieSerialize(value, maxAge=3600) { return `schoology_session=${enc(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`; }
function getSession(request){
  const raw=request.headers.get('Cookie')||'';
  const m=raw.match(/(?:^|;\s*)schoology_session=([^;]+)/);
  if(!m) return null;
  try{return JSON.parse(decodeURIComponent(m[1]));}catch{return null;}
}
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json',...headers}})}

async function apiFetch(path, session, env){
  const url=new URL(path.startsWith('http') ? path : SCHOOLOGY + (path.startsWith('/')?path:'/'+path));
  const auth=await oauth1('GET',url.toString(),{consumerKey:env.SCHOOLOGY_CONSUMER_KEY,consumerSecret:env.SCHOOLOGY_CONSUMER_SECRET,token:session.oauth_token,tokenSecret:session.oauth_token_secret});
  const r=await fetch(url,{headers:{Authorization:auth,Accept:'application/json'}});
  return new Response(await r.text(),{status:r.status,headers:{'content-type':r.headers.get('content-type')||'application/json'}});
}

export default {
 async fetch(request, env) {
  const url=new URL(request.url);
  const origin=env.FRONTEND_ORIGIN || 'https://wyliepowerwash.github.io';
  const cors={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type'};
  if(request.method==='OPTIONS') return new Response(null,{headers:cors});

  if(url.pathname==='/auth/start'){
    if(!env.SCHOOLOGY_CONSUMER_KEY || !env.SCHOOLOGY_CONSUMER_SECRET) return json({error:'Schoology OAuth credentials are not configured on the backend.'},500,cors);
    const callback=`${url.origin}/auth/callback`;
    const auth=await oauth1('POST',REQUEST_TOKEN_URL,{consumerKey:env.SCHOOLOGY_CONSUMER_KEY,consumerSecret:env.SCHOOLOGY_CONSUMER_SECRET},{oauth_callback:callback});
    const r=await fetch(REQUEST_TOKEN_URL,{method:'POST',headers:{Authorization:auth}});
    const data=parseForm(await r.text());
    if(!data.oauth_token || !data.oauth_token_secret) return json({error:'Schoology did not return a request token.'},502,cors);
    const state=JSON.stringify({oauth_token:data.oauth_token,oauth_token_secret:data.oauth_token_secret});
    return new Response(null,{status:302,headers:{Location:`${AUTHORIZE_URL}?oauth_token=${enc(data.oauth_token)}`,'Set-Cookie':cookieSerialize(state,600)}});
  }

  if(url.pathname==='/auth/callback'){
    const pending=getSession(request);
    const token=url.searchParams.get('oauth_token');
    const verifier=url.searchParams.get('oauth_verifier');
    if(!pending || !token || !verifier) return json({error:'Missing OAuth callback information.'},400,cors);
    const auth=await oauth1('POST',ACCESS_TOKEN_URL,{consumerKey:env.SCHOOLOGY_CONSUMER_KEY,consumerSecret:env.SCHOOLOGY_CONSUMER_SECRET,token,tokenSecret:pending.oauth_token_secret},{oauth_verifier:verifier});
    const r=await fetch(ACCESS_TOKEN_URL,{method:'POST',headers:{Authorization:auth}});
    const data=parseForm(await r.text());
    if(!data.oauth_token || !data.oauth_token_secret) return json({error:'Schoology authorization failed.'},502,cors);
    const final=JSON.stringify({oauth_token:data.oauth_token,oauth_token_secret:data.oauth_token_secret});
    return new Response(null,{status:302,headers:{Location:`${origin}/SchoologyThingy/?connected=1`,'Set-Cookie':cookieSerialize(final,86400)}});
  }

  if(url.pathname==='/auth/status') return json({connected:!!getSession(request)},200,cors);
  if(url.pathname==='/auth/logout') return json({ok:true},200,{...cors,'Set-Cookie':cookieSerialize('',0)});

  if(url.pathname.startsWith('/api/')){
    const session=getSession(request);
    if(!session) return json({error:'Not connected.'},401,cors);
    const map={'/api/me':'/users/me','/api/courses':'/courses','/api/assignments':'/users/me/assignments','/api/grades':'/users/me/grades','/api/calendar':'/users/me/calendar'};
    const target=map[url.pathname];
    if(!target) return json({error:'Unknown API route.'},404,cors);
    const response=await apiFetch(target,session,env);
    return new Response(await response.text(),{status:response.status,headers:{...cors,'content-type':response.headers.get('content-type')||'application/json'}});
  }
  return json({ok:true,service:'SchoologyThingy backend'},200,cors);
 }
};
