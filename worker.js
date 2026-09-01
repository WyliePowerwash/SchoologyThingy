/* SchoologyThingy OAuth/API backend scaffold for Cloudflare Workers.
 * IMPORTANT: put SCHOOLOGY_CONSUMER_KEY and SCHOOLOGY_CONSUMER_SECRET in Worker secrets.
 * This file does not collect or store a user's Schoology password.
 */

const SCHOOLOGY = 'https://api.schoology.com/v1';
const REQUEST_TOKEN_URL = 'https://api.schoology.com/oauth/request_token';
const AUTHORIZE_URL = 'https://app.schoology.com/oauth/authorize';
const ACCESS_TOKEN_URL = 'https://api.schoology.com/oauth/access_token';

function enc(v) { return encodeURIComponent(v).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase()); }
function parseForm(text) { const p = new URLSearchParams(text); return Object.fromEntries(p.entries()); }
function oauthHeader(params) { return 'OAuth ' + Object.entries(params).map(([k,v]) => `${enc(k)}="${enc(v)}"`).join(', '); }
async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC',hash:'SHA-1'}, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
async function oauth1(method, url, credentials, extra={}) {
  const u = new URL(url);
  const oauth = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_nonce: crypto.randomUUID().replaceAll('-',''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now()/1000).toString(),
    oauth_version: '1.0'
  };
  if (credentials.token) oauth.oauth_token = credentials.token;
  const all = {...oauth, ...extra};
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

function cookieSerialize(value, maxAge=3600) {
  return `schoology_session=${enc(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}
function getSession(request){
  const raw=request.headers.get('Cookie')||'';
  const m=raw.match(/(?:^|;\s*)schoology_session=([^;]+)/);
  if(!m) return null;
  try{return JSON.parse(decodeURIComponent(m[1]));}catch{return null;}
}
function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json',...headers}})}

async function apiFetch(path, session, env){
  const url=new URL(SCHOOLY_FIX(path));
  const auth=await oauth1('GET',url.toString(),{consumerKey:env.SCHOOLOGY_CONSUMER_KEY,consumerSecret:env.SCHOOLOGY_CONSUMER_SECRET,token:session.oauth_token,tokenSecret:session.oauth_token_secret});
  const r=await fetch(url,{headers:{Authorization:auth,Accept:'application/json'}});
  const text=await r.text();
  return new Response(text,{status:r.status,headers:{'content-type':r.headers.get('content-type')||'application/json'}});
}
function SCHOOLY_FIX(path){ return path.startsWith('http') ? path : SCHOOLOGY + (path.startsWith('/')?path:'/'+path); }

export default {
 async fetch(request, env) {
  const url=new URL(request.url);
  const origin=env.FRONTEND_ORIGIN || 'https://wyliepowerwash.github.io';
  if(request.method==='OPTIONS') return new Response(null,{headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type'}});

  if(url.pathname==='/auth/start'){
    if(!env.SCHOOLOGY_CONSUMER_KEY || !env.SCHOOLOGY_CONSUMER_SECRET) return json({error:'Schoology OAuth credentials are not configured on the backend.'},500);
    const callback=`${url.origin}/auth/callback`;
    const extra={oauth_callback:callback};
    const auth=await oauth1('POST',REQUEST_TOKEN_URL,{consumerKey:env.SCHOOLOGY_CONSUMER_KEY,consumerSecret:env.SCHOOLOGY_CONSUMER_SECRET},extra);
    const r=await fetch(REQUEST_TOKEN_URL,{method:'POST',headers:{Authorization:auth,'Content-Type':'application/x-www-form-urlencoded'}});
    const data=parseForm(await r.text());
    if(!data.oauth_token) return json({error:'Schoology did not return a request token.'},502);
    const state=JSON.stringify({oauth_token:data.oauth_token,oauth_token_secret:data.oauth_token_secret});
    const location=`${AUTHORIZE_URL}?oauth_token=${enc(data.oauth_token)}`;
    return new Response(null,{status:302,headers:{Location:location,'Set-Cookie':cookieSerialize(state,600)}});
  }

  if(url.pathname==='/auth/callback'){
    const session=getSession(request);
    const token=url.searchParams.get('oauth_token');
    const verifier=url.searchParams.get('oauth_verifier');
    if(!session || !token || !verifier) return json({error:'Missing OAuth callback information.'},400);
    const auth=await oauth1('POST',ACCESS_TOKEN_URL,{consumerKey:env.SCHOOLOGY_CONSUMER_KEY,consumerSecret:env.SCHOOLOGY_CONSUMER_SECRET,token,tokenSecret:session.oauth_token_secret},{oauth_verifier:verifier});
    const r=await fetch(ACCESS_TOKEN_URL,{method:'POST',headers:{Authorization:auth,'Content-Type':'application/x-www-form-urlencoded'}});
    const data=parseForm(await r.text());
    if(!data.oauth_token) return json({error:'Schoology authorization failed.'},502);
    const final=JSON.stringify({oauth_token:data.oauth_token,oauth_token_secret:data.oauth_token_secret});
    return new Response(null,{status:302,headers:{Location:`${origin}/SchoologyThingy/?connected=1`,'Set-Cookie':cookieSerialize(final,86400)}});
  }

  if(url.pathname==='/auth/status') return json({connected:!!getSession(request)},{headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true'}});
  if(url.pathname==='/auth/logout') return json({ok:true},{headers:{'Set-Cookie':cookieSerialize('',0),'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true'}});

  if(url.pathname.startsWith('/api/')){
    const session=getSession(request);
    if(!session) return json({error:'Not connected.'},401,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true'});
    const map={
      '/api/me':'/users/me',
      '/api/courses':'/courses',
      '/api/assignments':'/users/me/assignments',
      '/api/grades':'/users/me/grades',
      '/api/calendar':'/users/me/calendar'
    };
    const target=map[url.pathname];
    if(!target) return json({error:'Unknown API route.'},404);
    const response=await apiFetch(target,session,env);
    const body=await response.text();
    return new Response(body,{status:response.status,headers:{'content-type':response.headers.get('content-type')||'application/json','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true'}});
  }
  return json({ok:true,service:'SchoologyThingy backend'});
 }
};
