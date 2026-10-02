import 'server-only';
import {HttpError} from '@/lib/http';
import {normalizeGithub,normalizeNotion,normalizeVercel,type Provider,type ExternalItem,type Scope} from './domain';
export type Credentials={access_token:string;expires_at?:number;scope:string;scope_slug?:string};
export type TokenResult={credentials:Credentials;accountId:string;accountLabel:string;scopeId:string;scopeLabel:string};
export type Adapter={scopes:(c:Credentials)=>Promise<Scope[]>;list:(c:Credentials,scope:string,cursor:string,query:string)=>Promise<{items:ExternalItem[];cursor:string|null}>;fetch:(c:Credentials,id:string,kind:string,scope:string)=>Promise<ExternalItem>};
const origins={GITHUB:'https://api.github.com',VERCEL:'https://api.vercel.com',NOTION:'https://api.notion.com'};
export function configured(p:Provider){return !!process.env[`${p}_CLIENT_ID`]&&!!process.env[`${p}_CLIENT_SECRET`]&&(p!=='VERCEL'||!!process.env.VERCEL_INTEGRATION_SLUG);}
export async function remote(url:string,init:RequestInit={}){
 let response:Response;try{response=await fetch(url,{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw new HttpError(502,'providerUnavailable');}
 if(!response.ok){if(response.status===429||(response.status===403&&response.headers.get('x-ratelimit-remaining')==='0'))throw new HttpError(429,'rateLimited');if([401,403].includes(response.status))throw new HttpError(403,'reconnectRequired');if(response.status===404)throw new HttpError(404,'sourceUnavailable');throw new HttpError(502,'providerUnavailable');}
 const length=Number(response.headers.get('content-length')??0);if(length>4_000_000)throw new HttpError(502,'providerUnavailable');
 const reader=response.body?.getReader();if(!reader)throw new HttpError(502,'providerUnavailable');let total=0;const chunks:Uint8Array[]=[];
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>4_000_000){await reader.cancel();throw new HttpError(502,'providerUnavailable');}chunks.push(value);}}finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new HttpError(502,'providerUnavailable');}
}
async function api(p:Provider,c:Credentials,path:string,body?:unknown){
 if(c.expires_at&&Date.now()>c.expires_at-30000)throw new HttpError(403,'reconnectRequired');
 const headers:Record<string,string>={Authorization:`Bearer ${c.access_token}`,Accept:'application/json','Content-Type':'application/json'};
 if(p==='GITHUB'){headers['X-GitHub-Api-Version']='2022-11-28';headers['User-Agent']='ProjectHub';}
 if(p==='NOTION')headers['Notion-Version']='2025-09-03';
 return remote(`${origins[p]}${path}`,{headers,method:body?'POST':'GET',...(body?{body:JSON.stringify(body)}:{})});
}
function pageNumber(cursor:string){const page=cursor?Number(cursor):1;if(!Number.isSafeInteger(page)||page<1||page>1000)throw new HttpError(400,'validation');return page;}
function externalId(id:string,pattern:RegExp){if(!pattern.test(id))throw new HttpError(400,'validation');return encodeURIComponent(id);}
const github:Adapter={
 async scopes(c){const scopes:Scope[]=[];for(let page=1;page<=100;page++){const d=await api('GITHUB',c,`/user/installations?per_page=100&page=${page}`);for(const i of d.installations??[])scopes.push({id:String(i.id),name:String(i.account?.login??i.id)});if((d.installations??[]).length<100)return scopes;}throw new HttpError(413,'tooLarge');},
 async list(c,scope,cursor){const page=pageNumber(cursor);const id=externalId(scope,/^\d+$/);const d=await api('GITHUB',c,`/user/installations/${id}/repositories?per_page=50&page=${page}`);return {items:(d.repositories??[]).map((r:Record<string,unknown>)=>normalizeGithub(r,scope)),cursor:(d.repositories??[]).length===50?String(page+1):null};},
 async fetch(c,id,_kind,scope){return normalizeGithub(await api('GITHUB',c,`/repositories/${externalId(id,/^\d+$/)}`),scope);}
};
const vercel:Adapter={
 async scopes(c){return [{id:c.scope,name:c.scope||'Personal'}];},
 async list(c,_scope,cursor,query){const q=new URLSearchParams({limit:'50'});if(c.scope)q.set('teamId',c.scope);if(cursor){externalId(cursor,/^\d+$/);q.set('until',cursor);}if(query)q.set('search',query);const d=await api('VERCEL',c,`/v9/projects?${q}`);return {items:(d.projects??[]).map((r:Record<string,unknown>)=>normalizeVercel(r,c.scope,c.scope_slug)),cursor:d.pagination?.next?String(d.pagination.next):null};},
 async fetch(c,id){const q=new URLSearchParams();if(c.scope)q.set('teamId',c.scope);return normalizeVercel(await api('VERCEL',c,`/v9/projects/${externalId(id,/^[\w-]+$/)}?${q}`),c.scope,c.scope_slug);}
};
const notion:Adapter={
 async scopes(c){return [{id:c.scope,name:c.scope}];},
 async list(c,_scope,cursor,query){const d=await api('NOTION',c,'/v1/search',{page_size:50,...(cursor?{start_cursor:cursor}:{}),...(query?{query}:{}),sort:{direction:'descending',timestamp:'last_edited_time'}});return {items:(d.results??[]).filter((r:{object:string;archived?:boolean;in_trash?:boolean})=>['page','data_source'].includes(r.object)&&!r.archived&&!r.in_trash).map((r:Record<string,unknown>)=>normalizeNotion(r,c.scope)),cursor:d.has_more?d.next_cursor:null};},
 async fetch(c,id,kind){const d=await api('NOTION',c,`/v1/${kind==='data_source'?'data_sources':'pages'}/${externalId(id,/^[a-f0-9-]{32,36}$/i)}`);if(d.archived||d.in_trash)throw new HttpError(404,'sourceUnavailable');return normalizeNotion(d,c.scope);}
};
export const adapters:Record<Provider,Adapter>={GITHUB:github,VERCEL:vercel,NOTION:notion};
export function authorizationUrl(p:Provider,redirect:string,state:string,challenge:string){
 if(!configured(p))throw new HttpError(503,'notConfigured');
 const id=process.env[`${p}_CLIENT_ID`]!;
 const url=new URL(p==='GITHUB'?'https://github.com/login/oauth/authorize':p==='NOTION'?'https://api.notion.com/v1/oauth/authorize':`https://vercel.com/integrations/${encodeURIComponent(process.env.VERCEL_INTEGRATION_SLUG!)}/new`);
 url.searchParams.set('state',state);
 if(p!=='VERCEL'){url.searchParams.set('client_id',id);url.searchParams.set('redirect_uri',redirect);url.searchParams.set('response_type','code');}
 if(p==='GITHUB'){url.searchParams.set('code_challenge',challenge);url.searchParams.set('code_challenge_method','S256');url.searchParams.set('prompt','select_account');}
 if(p==='NOTION')url.searchParams.set('owner','user');
 return url.href;
}
export async function exchange(p:Provider,code:string,redirect:string,verifier:string):Promise<TokenResult>{
 const id=process.env[`${p}_CLIENT_ID`]!,secret=process.env[`${p}_CLIENT_SECRET`]!;
 if(!configured(p))throw new HttpError(503,'notConfigured');
 let d;
 if(p==='NOTION')d=await remote('https://api.notion.com/v1/oauth/token',{method:'POST',headers:{Authorization:`Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,'Content-Type':'application/json'},body:JSON.stringify({grant_type:'authorization_code',code,redirect_uri:redirect})});
 else d=await remote(p==='GITHUB'?'https://github.com/login/oauth/access_token':'https://api.vercel.com/v2/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:id,client_secret:secret,code,redirect_uri:redirect,...(p==='GITHUB'?{code_verifier:verifier}:{})})});
 if(typeof d.access_token!=='string'||!d.access_token)throw new HttpError(403,'reconnectRequired');
 const scope=p==='NOTION'?String(d.workspace_id??''):p==='VERCEL'?String(d.team_id??''):'';
 const credentials:Credentials={access_token:d.access_token,scope,...(d.expires_in?{expires_at:Date.now()+Number(d.expires_in)*1000}:{})};
 if(p==='GITHUB'){const user=await api(p,credentials,'/user');return {credentials,accountId:String(user.id),accountLabel:String(user.login),scopeId:'',scopeLabel:'GitHub App'};}
 if(p==='NOTION'){if(!scope)throw new HttpError(502,'providerUnavailable');return {credentials,accountId:scope,accountLabel:String(d.workspace_name??'Notion'),scopeId:scope,scopeLabel:String(d.workspace_name??'Notion')};}
 if(!d.user_id)throw new HttpError(502,'providerUnavailable');
 const user=await api('VERCEL',credentials,'/v2/user');const team=scope?await api('VERCEL',credentials,`/v2/teams/${externalId(scope,/^[\w-]+$/)}`):null;
 if(String(user.user?.id)!==String(d.user_id)||!user.user?.username||(scope&&!team?.slug))throw new HttpError(502,'providerUnavailable');
 credentials.scope_slug=String(team?.slug??user.user.username);
 return {credentials,accountId:String(d.user_id),accountLabel:String(user.user.username),scopeId:scope,scopeLabel:String(team?.name??user.user.username)};
}
