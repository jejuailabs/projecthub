import {session} from '@/lib/session';
import {getSupabaseConfig} from '@/lib/env';
import {redirect} from '@/i18n/navigation';
import {Dashboard} from '@/components/workspace-dashboard';
import type {Project} from '@/modules/projects/domain';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const {locale}=await params;const query=await searchParams;
 if(!getSupabaseConfig())return redirect({href:'/login',locale});
 const s=await session();if(!s)return redirect({href:'/login',locale});
 const data:Project[]=[];
 for(let page=0;;page++){const result=await s.db.from('projects').select('*,project_sources(*)').eq('workspace_id',s.workspace).order('id').range(page*1000,page*1000+999);if(result.error)throw new Error('PROJECTS_UNAVAILABLE');data.push(...result.data as Project[]);if(result.data.length<1000)break;if(page>=49)throw new Error('PROJECT_LIMIT');}
 const {data:workspace}=await s.db.from('workspaces').select('timezone').eq('id',s.workspace).single();
 return <Dashboard initialProjects={(data??[]) as Project[]} demo={false} initialSection={query.section==='integrations'?'integrations':'overview'} connectionResult={typeof query.connection==='string'?query.connection:undefined} timezone={workspace?.timezone??'UTC'} />;
}