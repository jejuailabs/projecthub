import {session} from '@/lib/session';
import {getSupabaseConfig} from '@/lib/env';
import {redirect} from '@/i18n/navigation';
import {Dashboard} from '@/components/dashboard';
import type {Project} from '@/modules/projects/domain';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(!getSupabaseConfig())return redirect({href:'/login',locale});
 const s=await session();if(!s)return redirect({href:'/login',locale});
 const {data,error}=await s.db.from('projects').select('*,project_sources(*)').eq('workspace_id',s.workspace).order('last_activity_at',{ascending:false}).limit(200);
 if(error)throw new Error('PROJECTS_UNAVAILABLE');
 const {data:workspace}=await s.db.from('workspaces').select('timezone').eq('id',s.workspace).single();
 return <Dashboard initialProjects={(data??[]) as Project[]} demo={false} timezone={workspace?.timezone??'UTC'} />;
}