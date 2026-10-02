create table public.integration_connections (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces(id) on delete cascade,
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 provider text not null check(provider in ('GITHUB','VERCEL','NOTION')),
 account_id text not null check(length(account_id) between 1 and 200), scope_id text not null default '',
 label text not null check(length(label) between 1 and 160), account_label text not null, scope_label text not null,
 version integer not null default 1, connected_at timestamptz not null default now(), disconnected_at timestamptz,
 unique(workspace_id,owner_user_id,provider,account_id,scope_id),unique(workspace_id,id)
);
alter table public.integration_connections enable row level security;
create policy connections_read on public.integration_connections for select to authenticated using(owner_user_id=(select auth.uid()) and (select private.workspace_role(workspace_id)) is not null);
revoke all on public.integration_connections from anon,authenticated;
grant select on public.integration_connections to authenticated;
create table private.integration_credentials (
 connection_id uuid primary key references public.integration_connections(id) on delete cascade,
 ciphertext text not null check(length(ciphertext) between 1 and 30000)
);
alter table private.integration_credentials enable row level security;
create policy credentials_owner on private.integration_credentials for select to authenticated using(exists(select 1 from public.integration_connections c where c.id=connection_id and c.owner_user_id=(select auth.uid()) and c.disconnected_at is null));
revoke all on private.integration_credentials from public,anon,authenticated;
grant select on private.integration_credentials to authenticated;
create function public.integration_credential(p_id uuid) returns text language sql security invoker set search_path='' as $$select ciphertext from private.integration_credentials where connection_id=p_id$$;
revoke all on function public.integration_credential(uuid) from public,anon;
grant execute on function public.integration_credential(uuid) to authenticated;

alter table public.project_sources drop constraint project_sources_provider_check;
alter table public.project_sources add constraint project_sources_provider_check check(provider in ('MANUAL','GITHUB','VERCEL','NOTION'));
alter table public.project_sources add column connection_id uuid;
alter table public.project_sources add column external_id text;
alter table public.project_sources add column external_kind text;
alter table public.project_sources add column external_scope text not null default '';
alter table public.project_sources add column metadata jsonb not null default '{}';
alter table public.project_sources add column last_synced_at timestamptz;
alter table public.project_sources add column sync_status text not null default 'MANUAL' check(sync_status in ('MANUAL','OK','ERROR','DISCONNECTED'));
alter table public.project_sources add foreign key(workspace_id,connection_id) references public.integration_connections(workspace_id,id);
create unique index source_external_unique on public.project_sources(workspace_id,provider,external_id) where external_id is not null;
create index source_connection_idx on public.project_sources(workspace_id,connection_id);

create function private.save_integration(w uuid, p_provider text, p_account text,p_scope text,p_label text,p_account_label text,p_scope_label text,p_ciphertext text)
returns public.integration_connections language plpgsql security definer set search_path='' as $$
declare c public.integration_connections;
begin
 if auth.uid() is null or coalesce(private.workspace_role(w),'') not in ('OWNER','ADMIN','MEMBER') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 insert into public.integration_connections(workspace_id,owner_user_id,provider,account_id,scope_id,label,account_label,scope_label)
 values(w,auth.uid(),p_provider,p_account,p_scope,p_label,p_account_label,p_scope_label)
 on conflict(workspace_id,owner_user_id,provider,account_id,scope_id) do update set version=integration_connections.version+1,disconnected_at=null,connected_at=now(),account_label=excluded.account_label,scope_label=excluded.scope_label returning * into c;
 insert into private.integration_credentials values(c.id,p_ciphertext) on conflict(connection_id) do update set ciphertext=excluded.ciphertext;
 update public.project_sources set sync_status='ERROR' where connection_id=c.id and sync_status='DISCONNECTED';
 return c;
end $$;
create function public.save_integration(w uuid,p_provider text,p_account text,p_scope text,p_label text,p_account_label text,p_scope_label text,p_ciphertext text)
returns public.integration_connections language sql security invoker set search_path='' as $$select private.save_integration(w,p_provider,p_account,p_scope,p_label,p_account_label,p_scope_label,p_ciphertext)$$;
revoke all on function private.save_integration(uuid,text,text,text,text,text,text,text), public.save_integration(uuid,text,text,text,text,text,text,text) from public,anon;
grant execute on function private.save_integration(uuid,text,text,text,text,text,text,text), public.save_integration(uuid,text,text,text,text,text,text,text) to authenticated;

create function private.edit_integration(p_id uuid,p_version integer,p_label text,p_disconnect boolean)
returns void language plpgsql security definer set search_path='' as $$
declare c public.integration_connections;
begin
 select * into c from public.integration_connections where id=p_id for update;
 if c.id is null or auth.uid() is null or c.owner_user_id<>auth.uid() or coalesce(private.workspace_role(c.workspace_id),'') not in ('OWNER','ADMIN','MEMBER') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if c.version<>p_version then raise exception 'CONFLICT' using errcode='40001';end if;
 if p_disconnect then
  delete from private.integration_credentials where connection_id=c.id;
  update public.integration_connections set disconnected_at=now(),version=version+1 where id=c.id;
  update public.project_sources set sync_status='DISCONNECTED' where connection_id=c.id;
 else update public.integration_connections set label=p_label,version=version+1 where id=c.id;end if;
end $$;
create function public.edit_integration(p_id uuid,p_version integer,p_label text,p_disconnect boolean) returns void language sql security invoker set search_path='' as $$select private.edit_integration(p_id,p_version,p_label,p_disconnect)$$;
revoke all on function private.edit_integration(uuid,integer,text,boolean),public.edit_integration(uuid,integer,text,boolean) from public,anon;
grant execute on function private.edit_integration(uuid,integer,text,boolean),public.edit_integration(uuid,integer,text,boolean) to authenticated;

-- One transaction: validate all selections, create/link projects and register sources.
-- Workspace lock serializes imports across overlapping accounts without duplicate projects.
create function private.import_integration(p_connection uuid,p_version integer,p_items jsonb)
returns uuid[] language plpgsql security definer set search_path='' as $$
declare c public.integration_connections; item jsonb; source public.project_sources; project public.projects; result uuid[]:='{}'; target uuid;
begin
 select * into c from public.integration_connections where id=p_connection for update;
 if c.id is null or auth.uid() is null or c.owner_user_id<>auth.uid() or coalesce(private.workspace_role(c.workspace_id),'') not in ('OWNER','ADMIN','MEMBER') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if c.disconnected_at is not null or c.version<>p_version then raise exception 'CONFLICT' using errcode='40001';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 20 then raise exception 'INVALID_SELECTION';end if;
 perform id from public.workspaces where id=c.workspace_id for update;
 for item in select value from jsonb_array_elements(p_items) loop
  if coalesce(length(item->>'external_id'),0) not between 1 and 200 then raise exception 'INVALID_ID';end if;
  select * into source from public.project_sources where workspace_id=c.workspace_id and provider=c.provider and external_id=item->>'external_id';
  target:=nullif(item->>'project_id','')::uuid;
  if source.id is not null then
   if target is not null and target<>source.project_id then raise exception 'ALREADY_LINKED' using errcode='23505';end if;
   result:=array_append(result,source.project_id);continue;
  end if;
  if target is null then
   insert into public.projects(workspace_id,name,description) values(c.workspace_id,left(item->>'name',120),left(coalesce(item->>'description',''),2000)) returning * into project;target:=project.id;
  else
   select * into project from public.projects where id=target and workspace_id=c.workspace_id for update;
   if project.id is null or project.archived_at is not null or project.deleted_at is not null then raise exception 'PROJECT_UNAVAILABLE' using errcode='42501';end if;
  end if;
  -- Upgrade an existing manual link instead of adding the same URL twice.
  select * into source from public.project_sources where workspace_id=c.workspace_id and project_id=target and canonical_url=item->>'url';
  if source.id is not null and source.provider<>'MANUAL' then raise exception 'ALREADY_LINKED' using errcode='23505';end if;
  if source.id is null then
   insert into public.project_sources(workspace_id,project_id,external_name,canonical_url,provider,role,connection_id,external_id,external_kind,external_scope,metadata,last_synced_at,sync_status)
   values(c.workspace_id,target,left(item->>'name',120),item->>'url',c.provider,case c.provider when 'NOTION' then 'PLANNING' when 'VERCEL' then 'DEPLOYMENT' else 'EXECUTION' end,c.id,item->>'external_id',item->>'kind',coalesce(item->>'scope',''),coalesce(item->'metadata','{}'),now(),'OK');
  else
   update public.project_sources set provider=c.provider,connection_id=c.id,external_id=item->>'external_id',external_kind=item->>'kind',external_scope=coalesce(item->>'scope',''),metadata=coalesce(item->'metadata','{}'),last_synced_at=now(),sync_status='OK' where id=source.id;
  end if;
  insert into public.activities(workspace_id,project_id,actor_id,kind) values(c.workspace_id,target,auth.uid(),'SOURCE_IMPORTED');
  result:=array_append(result,target);
 end loop;
 return result;
end $$;
create function public.import_integration(p_connection uuid,p_version integer,p_items jsonb) returns uuid[] language sql security invoker set search_path='' as $$select private.import_integration(p_connection,p_version,p_items)$$;
revoke all on function private.import_integration(uuid,integer,jsonb),public.import_integration(uuid,integer,jsonb) from public,anon;
grant execute on function private.import_integration(uuid,integer,jsonb),public.import_integration(uuid,integer,jsonb) to authenticated;

create function private.sync_integration_source(p_connection uuid,p_version integer,p_source uuid,p_data jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare c public.integration_connections; s public.project_sources;
begin
 select * into c from public.integration_connections where id=p_connection for update;
 if c.id is null or auth.uid() is null or c.owner_user_id<>auth.uid() or coalesce(private.workspace_role(c.workspace_id),'') not in ('OWNER','ADMIN','MEMBER') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 if c.disconnected_at is not null or c.version<>p_version then raise exception 'CONFLICT' using errcode='40001';end if;
 select * into s from public.project_sources where id=p_source and connection_id=c.id;
 if s.id is null then raise exception 'NOT_FOUND';end if;
 if not exists(select 1 from public.projects where id=s.project_id and archived_at is null and deleted_at is null) then raise exception 'PROJECT_UNAVAILABLE';end if;
 if p_data is null then update public.project_sources set sync_status='ERROR' where id=s.id;
 else
  if p_data->>'external_id' is distinct from s.external_id then raise exception 'IDENTITY_MISMATCH';end if;
  update public.project_sources set external_name=left(p_data->>'name',120),canonical_url=p_data->>'url',metadata=p_data->'metadata',last_synced_at=now(),sync_status='OK' where id=s.id;
  insert into public.activities(workspace_id,project_id,actor_id,kind) values(c.workspace_id,s.project_id,auth.uid(),'SOURCE_SYNCED');
 end if;
end $$;
create function public.sync_integration_source(p_connection uuid,p_version integer,p_source uuid,p_data jsonb) returns void language sql security invoker set search_path='' as $$select private.sync_integration_source(p_connection,p_version,p_source,p_data)$$;
revoke all on function private.sync_integration_source(uuid,integer,uuid,jsonb),public.sync_integration_source(uuid,integer,uuid,jsonb) from public,anon;
grant execute on function private.sync_integration_source(uuid,integer,uuid,jsonb),public.sync_integration_source(uuid,integer,uuid,jsonb) to authenticated;
