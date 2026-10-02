import {apiError,requestBody,HttpError} from '@/lib/http';
import {importInput} from '@/modules/integrations/domain';
import {requireSession,connection,verifyTicket,dbError} from '@/modules/integrations/server';
import {adapters} from '@/modules/integrations/providers';
export const maxDuration=120;
export async function POST(request:Request){try{
 const input=importInput.parse(await requestBody(request,450000));const s=await requireSession();const {c,credentials}=await connection(s,input.connection_id);
 const verified=input.items.map(i=>({...verifyTicket(c,i.ticket),project_id:i.project_id}));const items=[];
 for(let i=0;i<verified.length;i+=3){items.push(...await Promise.all(verified.slice(i,i+3).map(async item=>{const fetched=await adapters[c.provider].fetch(credentials,item.external_id,item.kind,item.scope);if(fetched.external_id!==item.external_id)throw new HttpError(409,'sourceUnavailable');return {...fetched,project_id:item.project_id};})));}
 const r=await s.db.rpc('import_integration',{p_connection:c.id,p_version:c.version,p_items:items});dbError(r.error);
 const projects=await s.db.from('projects').select('*,project_sources(*)').in('id',[...new Set(r.data as string[])]).eq('workspace_id',s.workspace);dbError(projects.error);
 return Response.json({projects:projects.data},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
