create table public.project_materials (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, project_id uuid not null,
 title text not null check(char_length(btrim(title)) between 1 and 200),
 category text not null check(category in ('REFERENCE','MEETING','IDEA')),
 body text not null default '' check(char_length(body)<=20000),
 file_name text check(char_length(file_name)<=255), mime_type text, byte_size bigint check(byte_size between 1 and 20971520),
 storage_path text unique, ready boolean not null default true,
 created_by uuid not null default auth.uid() references auth.users(id),
 updated_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1,
 foreign key(workspace_id,project_id) references public.projects(workspace_id,id) on delete cascade,
 check((storage_path is null and file_name is null and byte_size is null and ready) or (storage_path=workspace_id::text||'/'||project_id::text||'/'||id::text and file_name is not null and byte_size is not null and mime_type is not null))
);
create index materials_project_idx on public.project_materials(workspace_id,project_id,created_at desc);
create index materials_creator_idx on public.project_materials(created_by);
create index materials_editor_idx on public.project_materials(updated_by);
create table public.material_revisions (
 id uuid primary key default gen_random_uuid(), material_id uuid not null references public.project_materials(id) on delete cascade,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 version integer not null, title text not null, category text not null, body text not null,
 actor_id uuid references auth.users(id) on delete set null, occurred_at timestamptz not null default now(),
 unique(material_id,version)
);
create index revisions_workspace_idx on public.material_revisions(workspace_id);
create index revisions_actor_idx on public.material_revisions(actor_id);
alter table public.project_materials enable row level security;
alter table public.material_revisions enable row level security;
create policy materials_read on public.project_materials for select to authenticated using((select private.workspace_role(workspace_id)) is not null);
create policy materials_insert on public.project_materials for insert to authenticated with check(
 created_by=(select auth.uid()) and updated_by=(select auth.uid()) and (select private.workspace_role(workspace_id)) in ('OWNER','ADMIN','MEMBER')
 and exists(select 1 from public.projects p where p.id=project_id and p.workspace_id=project_materials.workspace_id and p.deleted_at is null and p.archived_at is null));
create policy materials_update on public.project_materials for update to authenticated using(
 (select private.workspace_role(workspace_id)) in ('OWNER','ADMIN','MEMBER')
 and exists(select 1 from public.projects p where p.id=project_id and p.workspace_id=project_materials.workspace_id and p.deleted_at is null and p.archived_at is null))
 with check((select private.workspace_role(workspace_id)) in ('OWNER','ADMIN','MEMBER'));
create policy revisions_read on public.material_revisions for select to authenticated using((select private.workspace_role(workspace_id)) is not null);
revoke all on public.project_materials,public.material_revisions from anon,authenticated;
grant select on public.project_materials,public.material_revisions to authenticated;
grant insert(id,workspace_id,project_id,title,category,body,file_name,mime_type,byte_size,storage_path,ready) on public.project_materials to authenticated;
grant update(title,category,body,ready) on public.project_materials to authenticated;

insert into storage.buckets(id,name,public,file_size_limit) values('project-materials','project-materials',false,20971520);
create policy material_file_read on storage.objects for select to authenticated using(bucket_id='project-materials' and exists(select 1 from public.project_materials m where m.storage_path=name));
create policy material_file_insert on storage.objects for insert to authenticated with check(bucket_id='project-materials' and exists(
 select 1 from public.project_materials m join public.projects p on p.id=m.project_id and p.workspace_id=m.workspace_id
 where m.storage_path=name and not m.ready and m.created_by=(select auth.uid())
 and (select private.workspace_role(m.workspace_id)) in ('OWNER','ADMIN','MEMBER') and p.archived_at is null and p.deleted_at is null));
-- Files are immutable. Replacements are new materials; no overwrite or delete grants.
create function private.material_before_write() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  if old.ready and not new.ready then raise exception 'INVALID_STATE'; end if;
  new.version:=old.version+1; new.updated_at:=clock_timestamp(); new.updated_by:=auth.uid();
 end if;
 if new.storage_path is not null and new.ready and not exists(
  select 1 from storage.objects o where o.bucket_id='project-materials' and o.name=new.storage_path and (o.metadata->>'size')::bigint=new.byte_size
 ) then raise exception 'UPLOAD_INCOMPLETE'; end if;
 return new;
end $$;
create trigger material_before_write before insert or update on public.project_materials for each row execute function private.material_before_write();
revoke all on function private.material_before_write() from public,anon,authenticated;
create function private.material_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.workspace_role(new.workspace_id) not in ('OWNER','ADMIN','MEMBER') then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
 if new.ready then
  insert into public.material_revisions(material_id,workspace_id,version,title,category,body,actor_id)
  values(new.id,new.workspace_id,new.version,new.title,new.category,new.body,auth.uid());
  insert into public.activities(workspace_id,project_id,actor_id,kind)
  values(new.workspace_id,new.project_id,auth.uid(),case when TG_OP='INSERT' or not old.ready then 'MATERIAL_ADDED' else 'MATERIAL_UPDATED' end);
 end if;
 return new;
end $$;
create trigger material_audit after insert or update on public.project_materials for each row execute function private.material_audit();
revoke all on function private.material_audit() from public,anon,authenticated;
