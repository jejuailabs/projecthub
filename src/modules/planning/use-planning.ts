'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {type Project} from '@/modules/projects/domain';
import {planInput,syncDemoNext,type PlanItem,type PlanInput} from './domain';
export function usePlanning(demo:boolean,initial:Project[],onProject:(p:Project)=>void){
 const [items,setItems]=useState<PlanItem[]>(()=>demo?initial.reduce(syncDemoNext,[] as PlanItem[]):[]);
 const [loading,setLoading]=useState(!demo);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const lock=useRef(false);const readVersion=useRef(0);
 const reload=useCallback(async(signal?:AbortSignal)=>{if(demo)return;const version=++readVersion.current;try{const r=await fetch('/api/planning',{signal});if(!r.ok)throw new Error('loadFailed');const d=await r.json();if(!signal?.aborted&&version===readVersion.current){setItems(d.items);setError('');}}catch{if(!signal?.aborted&&version===readVersion.current)setError('loadFailed');}finally{if(!signal?.aborted&&version===readVersion.current)setLoading(false);}},[demo]);
 useEffect(()=>{
  if(demo)return;
  const controller=new AbortController();const version=++readVersion.current;
  fetch('/api/planning',{signal:controller.signal}).then(async r=>{if(!r.ok)throw new Error('loadFailed');return r.json();}).then(d=>{if(!controller.signal.aborted&&version===readVersion.current){setItems(d.items);setError('');}}).catch(()=>{if(!controller.signal.aborted&&version===readVersion.current)setError('loadFailed');}).finally(()=>{if(!controller.signal.aborted&&version===readVersion.current)setLoading(false);});
  return()=>controller.abort();
 },[demo]);
 function projectChanged(p:Project){if(demo)setItems(old=>syncDemoNext(old,p));else void reload();}
 async function save(project:Project,input:PlanInput,existing?:PlanItem,remove=false){
  if(lock.current)return false;lock.current=true;setBusy(true);setError('');
  try{
   const data=planInput.parse(input);if(project.archived_at||project.deleted_at)throw new Error('forbidden');
   if(demo){
    const at=new Date().toISOString();const id=existing?.id??crypto.randomUUID();
    const item:PlanItem={...data,id,project_id:project.id,workspace_id:project.workspace_id,version:(existing?.version??0)+1,created_at:existing?.created_at??at,updated_at:at,deleted_at:remove?at:null,is_next:remove?false:data.is_next};
    let next=items.filter(i=>i.id!==id);if(item.is_next)next=next.map(i=>i.project_id===project.id?{...i,is_next:false}:i);if(!remove)next.push(item);setItems(next);
    const representative=next.find(i=>i.project_id===project.id&&i.is_next);
    onProject({...project,next_action:representative?.title??'',next_action_due_on:representative?.due_on??null,version:project.version+1,last_activity_at:at,confirmed_at:at});
   }else{
    readVersion.current++;const r=await fetch('/api/planning',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_id:project.id,id:existing?.id??crypto.randomUUID(),version:existing?.version??0,item:data,remove})});const d=await r.json();if(!r.ok)throw new Error(d.error);
    setItems(old=>[...old.filter(i=>i.project_id!==project.id),...d.items]);onProject(d.project);
   }
   return true;
  }catch(e){setError(e instanceof Error&&e.message==='conflict'?'conflict':'saveFailed');return false;}
  finally{lock.current=false;setBusy(false);setLoading(false);}
 }
 return {items,busy,loading,error,reload,save,projectChanged};
}
