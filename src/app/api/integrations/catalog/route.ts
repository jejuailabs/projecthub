import {z} from 'zod';
import {apiError} from '@/lib/http';
import {requireSession,connection,ticket} from '@/modules/integrations/server';
import {adapters} from '@/modules/integrations/providers';
export async function GET(request:Request){try{const q=z.object({connection_id:z.uuid(),scope:z.string().max(200).default(''),cursor:z.string().max(300).default(''),query:z.string().max(120).default(''),scopes:z.enum(['1','0']).default('0')}).parse(Object.fromEntries(new URL(request.url).searchParams));const s=await requireSession();const {c,credentials}=await connection(s,q.connection_id);const adapter=adapters[c.provider];if(q.scopes==='1')return Response.json({scopes:await adapter.scopes(credentials)},{headers:{'Cache-Control':'no-store'}});const result=await adapter.list(credentials,q.scope,q.cursor,q.query);return Response.json({...result,items:result.items.map(item=>({...item,ticket:ticket(c,item)}))},{headers:{'Cache-Control':'no-store'}});}catch(e){return apiError(e);}}
