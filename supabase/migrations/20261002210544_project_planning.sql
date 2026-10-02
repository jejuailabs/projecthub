alter table public.projects add column start_date date;
alter table public.projects add constraint project_date_order check(start_date is null or target_date is null or start_date<=target_date);
grant insert(start_date),update(start_date) on public.projects to authenticated;
create table public.project_plan_items (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, project_id uuid not null,
 kind text not null check(kind in ('TODO','MILESTONE')), title text not null check(char_length(btrim(title)) between 1 and 300),
 due_on date, done boolean not null default false, is_next boolean not null default false,
 version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 foreign key(workspace_id,project_id) references public.projects(workspace_id,id) on delete cascade,
 check(kind<>'MILESTONE' or due_on is not null),check(not is_next or (kind='TODO' and not done and deleted_at is null))
);
create index plan_project_idx on public.project_plan_items(workspace_id,project_id);
create index plan_due_idx on public.project_plan_items(workspace_id,due_on) where deleted_at is null;
create unique index plan_one_next_idx on public.project_plan_items(project_id) where is_next;
alter table public.project_plan_items enable row level security;
create policy plan_read on public.project_plan_items for select to authenticated using((select private.workspace_role(workspace_id)) is not null);
revoke all on public.project_plan_items from anon,authenticated;
grant select on public.project_plan_items to authenticated;
-- Preserve existing next actions as real todos before enabling synchronization.
insert into public.project_plan_items(workspace_id,project_id,kind,title,due_on,is_next)
select workspace_id,id,'TODO',next_action,next_action_due_on,true from public.projects where btrim(next_action)<>'';

create function private.plan_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(private.workspace_role(new.workspace_id),'') not in ('OWNER','ADMIN','MEMBER') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if TG_OP='UPDATE' then new.version:=old.version+1;new.updated_at:=clock_timestamp();end if;
 insert into public.activities(workspace_id,project_id,actor_id,kind) values(new.workspace_id,new.project_id,auth.uid(),case when new.deleted_at is not null then 'PLAN_REMOVED' when new.done then 'PLAN_COMPLETED' when TG_OP='INSERT' then 'PLAN_ADDED' else 'PLAN_UPDATED' end);
 return new;
end $$;
create trigger plan_audit before insert or update on public.project_plan_items for each row execute function private.plan_audit();
revoke all on function private.plan_audit() from public,anon,authenticated;

-- Existing project forms and AI review remain compatible: their next action edits
-- edit the representative todo, not a separate task store.
create function private.project_next_todo() returns trigger language plpgsql security definer set search_path='' as $$
declare current_item public.project_plan_items;
begin
 if auth.uid() is null or coalesce(private.workspace_role(new.workspace_id),'') not in ('OWNER','ADMIN','MEMBER') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if TG_OP='UPDATE' and new.next_action is not distinct from old.next_action and new.next_action_due_on is not distinct from old.next_action_due_on then return new;end if;
 select * into current_item from public.project_plan_items where project_id=new.id and is_next;
 if btrim(new.next_action)='' then
  if current_item.id is not null then update public.project_plan_items set done=true,is_next=false where id=current_item.id;end if;
 elsif current_item.id is null then
  insert into public.project_plan_items(workspace_id,project_id,kind,title,due_on,is_next) values(new.workspace_id,new.id,'TODO',new.next_action,new.next_action_due_on,true);
 elsif current_item.title is distinct from new.next_action or current_item.due_on is distinct from new.next_action_due_on then
  update public.project_plan_items set title=new.next_action,due_on=new.next_action_due_on where id=current_item.id;
 end if;
 return new;
end $$;
create trigger project_next_todo after insert or update on public.projects for each row execute function private.project_next_todo();
revoke all on function private.project_next_todo() from public,anon,authenticated;

-- Privileged mutation is confined to this private function to prevent bypassing
-- project locks, immutable metadata and representative-todo invariants via REST.
create function private.save_plan_item(w uuid,p uuid,item uuid,expected integer,data jsonb,remove_item boolean)
returns public.project_plan_items language plpgsql security definer set search_path='' as $$
declare project public.projects; previous public.project_plan_items; result public.project_plan_items; representative public.project_plan_items;
begin
 if auth.uid() is null or coalesce(private.workspace_role(w),'') not in ('OWNER','ADMIN','MEMBER') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 select * into project from public.projects where id=p and workspace_id=w for update;
 if not found or project.archived_at is not null or project.deleted_at is not null then raise exception 'PROJECT_UNAVAILABLE' using errcode='42501';end if;
 select * into previous from public.project_plan_items where id=item and workspace_id=w and project_id=p;
 if expected=0 and previous.id is null then
  if remove_item then raise exception 'NOT_FOUND' using errcode='P0002';end if;
 elsif previous.id is null or previous.version<>expected then raise exception 'VERSION_CONFLICT' using errcode='40001';end if;
 if coalesce((data->>'is_next')::boolean,false) and not remove_item then
  update public.project_plan_items set is_next=false where project_id=p and is_next and id<>item;
 end if;
 if previous.id is null then
  insert into public.project_plan_items(id,workspace_id,project_id,kind,title,due_on,done,is_next)
  values(item,w,p,data->>'kind',data->>'title',nullif(data->>'due_on','')::date,coalesce((data->>'done')::boolean,false),coalesce((data->>'is_next')::boolean,false)) returning * into result;
 elsif remove_item then
  update public.project_plan_items set deleted_at=now(),is_next=false where id=item returning * into result;
 else
  if previous.deleted_at is not null then raise exception 'ITEM_REMOVED';end if;
  update public.project_plan_items set kind=data->>'kind',title=data->>'title',due_on=nullif(data->>'due_on','')::date,done=(data->>'done')::boolean,is_next=(data->>'is_next')::boolean where id=item returning * into result;
 end if;
 select * into representative from public.project_plan_items where project_id=p and is_next;
 update public.projects set next_action=coalesce(representative.title,''),next_action_due_on=representative.due_on where id=p;
 return result;
end $$;
revoke all on function private.save_plan_item(uuid,uuid,uuid,integer,jsonb,boolean) from public,anon;
grant execute on function private.save_plan_item(uuid,uuid,uuid,integer,jsonb,boolean) to authenticated;
create function public.save_plan_item(p_workspace uuid,p_project uuid,p_id uuid,p_version integer,p_data jsonb,p_remove boolean default false)
returns public.project_plan_items language sql security invoker set search_path='' as $$select private.save_plan_item(p_workspace,p_project,p_id,p_version,p_data,p_remove)$$;
revoke all on function public.save_plan_item(uuid,uuid,uuid,integer,jsonb,boolean) from public,anon;
grant execute on function public.save_plan_item(uuid,uuid,uuid,integer,jsonb,boolean) to authenticated;

create or replace function public.create_project(p_workspace uuid,p_request_id uuid,p_data jsonb) returns public.projects
language plpgsql security invoker set search_path='' as $$
declare r public.project_requests; result public.projects;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED' using errcode='42501';end if;
 insert into public.project_requests(workspace_id,request_id,payload_hash,result_id) values(p_workspace,p_request_id,md5(p_data::text),gen_random_uuid()) on conflict do nothing;
 select * into r from public.project_requests where workspace_id=p_workspace and user_id=auth.uid() and request_id=p_request_id for update;
 if r.payload_hash is distinct from md5(p_data::text) then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505';end if;
 select * into result from public.projects where id=r.result_id and workspace_id=p_workspace;if found then return result;end if;
 insert into public.projects(id,workspace_id,name,description,lifecycle_status,workflow_stage,owner_label,next_action,next_action_due_on,start_date,target_date,coordination_state,coordination_note)
 values(r.result_id,p_workspace,p_data->>'name',coalesce(p_data->>'description',''),coalesce(p_data->>'lifecycle_status','IDEA'),coalesce(p_data->>'workflow_stage','DISCOVERY'),coalesce(p_data->>'owner_label',''),coalesce(p_data->>'next_action',''),nullif(p_data->>'next_action_due_on','')::date,nullif(p_data->>'start_date','')::date,nullif(p_data->>'target_date','')::date,coalesce(p_data->>'coordination_state','CLEAR'),coalesce(p_data->>'coordination_note','')) returning * into result;
 return result;
end $$;
