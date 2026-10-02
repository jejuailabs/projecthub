import 'server-only';
import {createClient} from '@/lib/supabase/server';
export async function session(){
 const db=await createClient();const {data,error}=await db.auth.getUser();
 if(error||!data.user)return null;
 const {data:workspace,error:workspaceError}=await db.rpc('ensure_workspace');
 if(workspaceError||!workspace)throw new Error('WORKSPACE_UNAVAILABLE');
 return {db,user:data.user,workspace:String(workspace)};
}