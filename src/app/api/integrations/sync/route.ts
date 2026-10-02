import {z} from 'zod';
import {apiError,requestBody,HttpError} from '@/lib/http';
import {requireSession,connection,dbError} from '@/modules/integrations/server';
import {adapters} from '@/modules/integrations/providers';
export async function POST(request:Request){try{
 const v=z.object({source_id:z.uuid()}).strict().parse(await requestBody(request));const s=await requireSession();const r=await s.db.from('project_sources').select('*').eq('id',v.source_id).eq('workspace_id',s.workspace).single();if(r.error||!r.data?.connection_id)throw new HttpError(404,'sourceUnavailable');const source=r.data;const {c,credentials}=await connection(s,source.connection_id);
 let item;try{item=await adapters[c.provider].fetch(credentials,source.external_id,source.external_kind,source.external_scope);}catch(e){await s.db.rpc('sync_integration_source',{p_connection:c.id,p_version:c.version,p_source:source.id,p_data:null});throw e;}
 const saved=await s.db.rpc('sync_integration_source',{p_connection:c.id,p_version:c.version,p_source:source.id,p_data:item});dbError(saved.error);
 const project=await s.db.from('projects').select('*,project_sources(*)').eq('id',source.project_id).eq('workspace_id',s.workspace).single();dbError(project.error);return Response.json({project:project.data},{headers:{'Cache-Control':'no-store'}});
}catch(e){return apiError(e);}}
