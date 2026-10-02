import {z} from 'zod';
export const providers=['GITHUB','VERCEL','NOTION'] as const;
export type Provider=typeof providers[number];
export type Connection={id:string;workspace_id:string;owner_user_id:string;provider:Provider;account_id:string;scope_id:string;label:string;account_label:string;scope_label:string;version:number;disconnected_at:string|null;connected_at:string};
export type ExternalItem={external_id:string;kind:string;scope:string;name:string;description:string;url:string;metadata:Record<string,string|number|boolean|null>;ticket?:string};
export type SourceBinding={id:string;project_id:string;provider:string;connection_id:string|null;external_id:string|null;external_kind:string|null;external_scope:string;external_name:string;canonical_url:string;sync_status:string;last_synced_at:string|null;metadata:Record<string,string|number|boolean|null>};
export type Scope={id:string;name:string};
export const importInput=z.object({connection_id:z.uuid(),items:z.array(z.object({ticket:z.string().min(1).max(20000),project_id:z.uuid().nullable()}).strict()).min(1).max(20)}).strict();
export function identity(provider:Provider,id:string){return `${provider}:${id}`;}
export function findBinding(bindings:SourceBinding[],provider:Provider,id:string){return bindings.find(s=>identity(s.provider as Provider,s.external_id??'')===identity(provider,id));}
export function safeUrl(value:unknown,fallback:string){try{const u=new URL(String(value));return u.protocol==='https:'&&!u.username&&!u.password?u.href:fallback;}catch{return fallback;}}
export function normalizeGithub(d:Record<string,unknown>,scope=''):ExternalItem{
 const owner=d.owner as {login?:string}|undefined;const id=String(d.id??'');if(!/^\d+$/.test(id))throw new Error('invalidSource');
 return {external_id:id,kind:'repository',scope,name:String(d.full_name??d.name??id).slice(0,120),description:String(d.description??'').slice(0,2000),url:safeUrl(d.html_url,`https://github.com/${encodeURIComponent(owner?.login??'')}/${encodeURIComponent(String(d.name??''))}`),metadata:{default_branch:String(d.default_branch??''),visibility:String(d.visibility??(d.private?'private':'public')),language:d.language?String(d.language):null,pushed_at:d.pushed_at?String(d.pushed_at):null}};
}
export function normalizeVercel(d:Record<string,unknown>,scope='',dashboardScope=scope):ExternalItem{
 const id=String(d.id??'');if(!/^[\w-]+$/.test(id))throw new Error('invalidSource');
 const deployment=(d.targets as {production?:Record<string,unknown>}|undefined)?.production??(d.latestDeployments as Record<string,unknown>[]|undefined)?.[0];const link=d.link as {repo?:string;org?:string}|undefined;
 return {external_id:id,kind:'project',scope,name:String(d.name??id).slice(0,120),description:'',url:`https://vercel.com/${encodeURIComponent(dashboardScope||String(d.accountId??''))}/${encodeURIComponent(String(d.name??id))}`,metadata:{framework:d.framework?String(d.framework):null,repository:link?.repo?`${link.org??''}/${link.repo}`:null,deployment_status:deployment?.readyState?String(deployment.readyState):null,deployment_url:deployment?.url?safeUrl(`https://${deployment.url}`,''):null}};
}
export function normalizeNotion(d:Record<string,unknown>,scope=''):ExternalItem{
 const id=String(d.id??'').replaceAll('-','').toLowerCase();if(!/^[a-f0-9]{32}$/i.test(id))throw new Error('invalidSource');
 const properties=Object.values((d.properties??{}) as Record<string,{type?:string;title?:{plain_text?:string;text?:{content?:string}}[]}>);const title=(d.title??properties.find(p=>p.type==='title')?.title??[]) as {plain_text?:string;text?:{content?:string}}[];
 const parent=d.parent as {database_id?:string}|undefined;const name=title.map(t=>t.plain_text??t.text?.content??'').join('');
 return {external_id:id,kind:d.object==='data_source'?'data_source':'page',scope,name:(name||'Untitled').slice(0,120),description:'',url:safeUrl(d.url,`https://www.notion.so/${id}`),metadata:{last_edited_time:d.last_edited_time?String(d.last_edited_time):null,database_id:parent?.database_id??null}};
}

export function vercelCompletionUrl(value:string|null){try{const u=new URL(value??'');return u.origin==='https://vercel.com'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
