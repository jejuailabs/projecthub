import 'server-only';
import {session} from '@/lib/session';
import {HttpError} from '@/lib/http';
import {seal,unseal} from '@/lib/encryption';
import {type Connection,type ExternalItem} from './domain';
import {type Credentials} from './providers';
export type IntegrationSession=NonNullable<Awaited<ReturnType<typeof session>>>;
export async function requireSession(){const s=await session();if(!s)throw new HttpError(401,'unauthorized');return s;}
export function credentialContext(c:Pick<Connection,'workspace_id'|'owner_user_id'|'provider'|'account_id'|'scope_id'>){return JSON.stringify(['integration',c.workspace_id,c.owner_user_id,c.provider,c.account_id,c.scope_id]);}
export async function connection(s:IntegrationSession,id:string){const r=await s.db.from('integration_connections').select('*').eq('workspace_id',s.workspace).eq('id',id).single();if(r.error||!r.data||r.data.disconnected_at)throw new HttpError(403,'reconnectRequired');const c=r.data as Connection;const secret=await s.db.rpc('integration_credential',{p_id:id});if(secret.error||!secret.data)throw new HttpError(403,'reconnectRequired');let credentials:Credentials;try{credentials=unseal(secret.data,credentialContext(c));}catch{throw new HttpError(403,'reconnectRequired');}return {c,credentials};}
export function ticket(c:Connection,item:ExternalItem){return seal({connection:c.id,version:c.version,item,expires:Date.now()+15*60*1000},`selection:${c.workspace_id}:${c.owner_user_id}`);}
export function verifyTicket(c:Connection,value:string):ExternalItem{try{const t=unseal<{connection:string;version:number;item:ExternalItem;expires:number}>(value,`selection:${c.workspace_id}:${c.owner_user_id}`);if(t.connection!==c.id||t.version!==c.version||t.expires<Date.now())throw new Error();return t.item;}catch{throw new HttpError(409,'selectionExpired');}}
export function dbError(error:{code?:string}|null){if(error)throw new HttpError(error.code==='40001'?409:error.code==='42501'?403:400,error.code==='40001'?'conflict':error.code==='23505'?'alreadyLinked':'saveFailed');}
export async function bindings(s:IntegrationSession){const all=[];for(let page=0;page<50;page++){const r=await s.db.from('project_sources').select('*').eq('workspace_id',s.workspace).neq('provider','MANUAL').order('id').range(page*1000,page*1000+999);dbError(r.error);all.push(...r.data!);if(r.data!.length<1000)return all;}throw new HttpError(413,'tooLarge');}
