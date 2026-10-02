'use client';
import {useEffect,useState} from 'react';
import {useLocale} from 'next-intl';
import {FileText,Upload,History,Paperclip,Pencil,Download} from 'lucide-react';
import {browserClient} from '@/lib/supabase/browser';
import {categories,fileInput,isTextFile,materialInput,readTextFile,type Material,type Revision} from '@/modules/materials/domain';
import {type Project} from '@/modules/projects/domain';
import {TextProjects} from './text-projects';

export type DemoMaterials=Record<string,{materials:Material[];revisions:Record<string,Revision[]>}>;
export function ProjectMaterials({project,demo,demoData,onDemoChange,onUpdated}:{project:Project;demo:boolean;demoData:DemoMaterials[string];onDemoChange:(data:DemoMaterials[string])=>void;onUpdated:(p:Project)=>void}){
 const ko=useLocale()==='ko';const say=(a:string,b:string)=>ko?a:b;const names=ko?{REFERENCE:'참조 자료',MEETING:'회의록',IDEA:'아이디어'}:{REFERENCE:'Reference',MEETING:'Meeting',IDEA:'Idea'};
 const [items,setItems]=useState<Material[]>(demoData?.materials??[]);const [filter,setFilter]=useState('');const [editing,setEditing]=useState<Material|null>(null);const [form,setForm]=useState(false);
 const [title,setTitle]=useState('');const [body,setBody]=useState('');const [category,setCategory]=useState<typeof categories[number]>('REFERENCE');const [files,setFiles]=useState<File[]>([]);
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [history,setHistory]=useState<{title:string;items:Revision[]}|null>(null);
 const readOnly=!!project.archived_at||!!project.deleted_at;
 async function call(url:string,method='GET',data?:unknown){const r=await fetch(url,{method,...(data?{headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}:{})});const v=await r.json();if(!r.ok)throw new Error(v.error);return v;}
 useEffect(()=>{if(demo)return;let active=true;fetch(`/api/projects/${project.id}/materials`).then(async r=>{if(!r.ok)throw new Error();return r.json();}).then(d=>{if(active)setItems(d.materials);}).catch(()=>{if(active)setError(ko?'자료를 불러오지 못했습니다.':'Could not load materials.');});return()=>{active=false;};},[project.id,demo,ko]);
 function begin(m?:Material){setEditing(m??null);setTitle(m?.title??'');setBody(m?.body??'');setCategory(m?.category??'REFERENCE');setFiles([]);setForm(true);setError('');}
 async function save(){setBusy(true);setError('');try{
  const input=materialInput.parse({title:title.trim()||files[0]?.name||'',body,category});for(const f of files)fileInput.parse({name:f.name,type:f.type,size:f.size});
  const added:Material[]=[];const revs={...(demoData?.revisions??{})};
  if(editing){
   const m:Material=demo?{...editing,...input,version:editing.version+1,updated_at:new Date().toISOString()}:(await call(`/api/materials/${editing.id}`,'PATCH',{version:editing.version,material:input})).material;added.push(m);
  }else for(const file of (files.length?files:[null])){
   const id=crypto.randomUUID();const now=new Date().toISOString();const value={...input,title:files.length>1?file!.name:input.title};
   let m:Material;
   if(demo)m={...value,id,project_id:project.id,file_name:file?.name??null,mime_type:file?.type??null,byte_size:file?.size??null,storage_path:null,ready:true,created_at:now,updated_at:now,version:1,url:file?URL.createObjectURL(file):undefined};
   else{
    m=(await call(`/api/projects/${project.id}/materials`,'POST',{id,material:value,file:file?{name:file.name,type:file.type,size:file.size}:null})).material;
    if(file){const upload=await browserClient().storage.from('project-materials').upload(m.storage_path!,file,{contentType:file.type||'application/octet-stream',upsert:false});if(upload.error)throw new Error('uploadFailed');m=(await call(`/api/materials/${m.id}`,'PATCH',{version:m.version,ready:true})).material;}
   }
   added.push(m);
  }
  for(const m of added)revs[m.id]=[{id:crypto.randomUUID(),version:m.version,title:m.title,category:m.category,body:m.body,occurred_at:m.updated_at},...(revs[m.id]??[])];
  const next=[...added,...items.filter(m=>!added.some(a=>a.id===m.id))];setItems(next);if(demo)onDemoChange({materials:next,revisions:revs});setForm(false);setFiles([]);
 }catch(e){setError(e instanceof Error&&e.message==='conflict'?say('다른 변경이 있습니다. 창을 다시 열어 최신 내용을 확인해 주세요.','This material changed. Reopen to load the latest version.'):say('저장하지 못했습니다. 제목·본문 길이와 파일 크기(20MB 이하)를 확인해 주세요.','Could not save. Check the title, text length and file size (up to 20MB).'));}finally{setBusy(false);}}
 async function showHistory(m:Material){setBusy(true);try{setHistory({title:m.title,items:demo?(demoData?.revisions[m.id]??[]):(await call(`/api/materials/${m.id}`)).revisions});}catch{setError(say('이력을 불러오지 못했습니다.','Could not load history.'));}finally{setBusy(false);}}
 async function download(m:Material){setBusy(true);try{const url=demo?m.url:(await call(`/api/materials/${m.id}`)).url;if(url){const a=document.createElement('a');a.href=url;a.download=m.file_name??m.title;a.rel='noopener';a.click();}}catch{setError(say('파일을 열지 못했습니다.','Could not open the file.'));}finally{setBusy(false);}}
 const date=(s:string)=>new Intl.DateTimeFormat(ko?'ko-KR':'en',{dateStyle:'medium',timeStyle:'short'}).format(new Date(s));
 return <section className='materials-section'><header><div><h3><Paperclip size={18}/>{say('프로젝트 자료','Project materials')}</h3><p>{say('회의록, 아이디어, 참조 파일과 그 변경 이력을 한곳에.','Notes, ideas, reference files and their history in one place.')}</p></div>{!readOnly&&<button className='button secondary' disabled={busy} onClick={()=>begin()}><Upload size={16}/>{say('자료 추가','Add material')}</button>}</header>
 <div className='material-tabs'>{['',...categories].map(c=><button key={c} aria-pressed={filter===c} onClick={()=>setFilter(c)}>{c?names[c as keyof typeof names]:say('전체','All')}</button>)}</div>
 {demo&&<small>{say('데모 자료는 이 화면에서만 유지됩니다.','Demo materials remain in this session only.')}</small>}
 {form&&<div className='material-form'><label>{say('종류','Category')}<select value={category} disabled={busy} onChange={e=>setCategory(e.target.value as typeof category)}>{categories.map(c=><option key={c} value={c}>{names[c]}</option>)}</select></label><label>{say('제목','Title')}<input maxLength={200} value={title} disabled={busy} onChange={e=>setTitle(e.target.value)}/></label><label>{say('내용 / 메모','Text / notes')}<textarea rows={6} maxLength={20000} value={body} disabled={busy} onChange={e=>setBody(e.target.value)} placeholder={say('대화 내용, 회의록, 떠오른 아이디어를 입력하세요.','Paste a conversation, meeting notes or a rough idea.')}/></label>
 {!editing&&<label className='material-upload'><Upload size={20}/>{say('이미지 · 문서 · 파일 선택 (파일당 20MB, 최대 5개)','Choose images or files (20MB each, up to 5)')}<input type='file' multiple disabled={busy} onChange={async e=>{const chosen=Array.from(e.target.files??[]);if(chosen.length>5||chosen.some(f=>!fileInput.safeParse({name:f.name,type:f.type,size:f.size}).success)){setError(say('파일은 최대 5개, 각각 20MB 이하로 선택하세요.','Choose up to 5 files, each under 20MB.'));e.target.value='';return;}setFiles(chosen);setError('');if(!title&&chosen[0])setTitle(chosen[0].name);if(chosen.length===1&&!body){const file=chosen[0];setBusy(true);try{if(isTextFile(file.name))setBody(await readTextFile(file));else if(!demo&&/\.(pdf|docx)$/i.test(file.name)&&file.size<=4*1024*1024){const data=new FormData();data.set('file',file);const r=await fetch('/api/documents/text',{method:'POST',body:data});const result=await r.json();if(!r.ok)throw new Error();setBody(result.text);}}catch{setError(say('본문을 자동으로 읽지 못했습니다. 원본 파일은 저장할 수 있으며, 메모는 직접 입력할 수 있습니다.','Could not extract text. You can still save the original and enter notes manually.'));}finally{setBusy(false);}}}}/>{files.map((f,i)=><small key={i}>{f.name} · {(f.size/1024).toFixed(0)} KB</small>)}</label>}
 <div className='detail-actions'><button className='button primary' disabled={busy||(!title.trim()&&!files.length)} onClick={save}>{busy?say('저장 중…','Saving…'):say('저장','Save')}</button><button className='button secondary' disabled={busy} onClick={()=>setForm(false)}>{say('취소','Cancel')}</button></div></div>}
 <div className='material-list'>{items.filter(m=>!filter||m.category===filter).map(m=><article key={m.id}><div className='material-heading'><FileText size={18}/><strong>{m.title}</strong><span>{names[m.category]}</span></div><small>{say('추가','Added')} {date(m.created_at)} · {say('수정','Updated')} {date(m.updated_at)} · v{m.version}</small>{m.body&&<details><summary>{say('내용 보기','Read content')}</summary><p className='material-body'>{m.body}</p></details>}{m.file_name&&<button className='source-link' disabled={busy} onClick={()=>download(m)}><Download size={15}/>{m.file_name} · {Math.ceil((m.byte_size??0)/1024)} KB</button>}<div className='material-actions'><button disabled={busy} onClick={()=>showHistory(m)}><History size={15}/>{say('변경 이력','History')}</button>{!readOnly&&<><button disabled={busy} onClick={()=>begin(m)}><Pencil size={15}/>{say('내용 수정','Edit')}</button>{m.body&&<TextProjects demo={demo} projects={[project]} initialText={m.body} targetProject={project} onCreated={ps=>ps.forEach(onUpdated)}/>}</>}</div></article>)}{!items.length&&<p className='materials-empty'>{say('아직 자료가 없습니다. 첫 회의록이나 아이디어를 추가해 보세요.','No materials yet. Add the first note or idea.')}</p>}</div>
 {history&&<div className='material-history'><header><h4>{history.title} · {say('변경 이력','History')}</h4><button onClick={()=>setHistory(null)}>{say('닫기','Close')}</button></header>{history.items.map(r=><details key={r.id}><summary>v{r.version} · {date(r.occurred_at)} · {r.title}</summary><p className='material-body'>{r.body||say('파일 자료 / 본문 없음','File material / no text')}</p>{r.actor_id&&<small>{say('수정자','Editor')}: {r.actor_id}</small>}</details>)}</div>}{error&&<p role='alert' className='error-message'>{error}</p>}
 </section>;
}
