-- Phase 1-3: personal workspaces and manual projects. External writers are not enabled.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.workspaces (
 id uuid primary key default gen_random_uuid(),
 personal_owner_user_id uuid not null unique references auth.users(id) on delete cascade,
 name text not null default 'Personal Workspace' check (char_length(name) between 1 and 120),
 timezone text not null default 'UTC',
 created_at timestamptz not null default now()
);
create table public.memberships (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check (role in ('OWNER','ADMIN','MEMBER','VIEWER')),
 primary key(workspace_id,user_id)
);
create index memberships_user_idx on public.memberships(user_id,workspace_id);
create table public.projects (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 1 and 120),
 description text not null default '' check (char_length(description)<=2000),
 lifecycle_status text not null default 'IDEA' check (lifecycle_status in ('IDEA','BUILDING','LIVE','PAUSED','COMPLETED')),
 workflow_stage text not null default 'DISCOVERY' check (workflow_stage in ('DISCOVERY','PLANNING','DESIGN','EXECUTION','REVIEW','RELEASE','OPERATIONS','CLOSED')),
 owner_label text not null default '' check (char_length(owner_label)<=100),
 next_action text not null default '' check (char_length(next_action)<=300),
 next_action_due_on date,
 target_date date,
 coordination_state text not null default 'CLEAR' check (coordination_state in ('CLEAR','WAITING','BLOCKED')),
 coordination_note text not null default '' check (char_length(coordination_note)<=500),
 version integer not null default 1,
 last_activity_at timestamptz not null default now(),
 confirmed_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 archived_at timestamptz,
 deleted_at timestamptz,
 unique(workspace_id,id),
 check ((lifecycle_status='COMPLETED')=(workflow_stage='CLOSED')),
 check (coordination_state='CLEAR' or char_length(btrim(coordination_note))>0),
 check (char_length(btrim(next_action))>0 or next_action_due_on is null)
);
create index projects_overview_idx on public.projects(workspace_id,deleted_at,archived_at,lifecycle_status,workflow_stage);
create index projects_activity_idx on public.projects(workspace_id,last_activity_at desc,id);
create index projects_due_idx on public.projects(workspace_id,target_date);
create table public.project_sources (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 project_id uuid not null,
 external_name text not null check(char_length(btrim(external_name)) between 1 and 120),
 canonical_url text not null check(canonical_url ~ '^https?://[^[:space:]]+$' and char_length(canonical_url)<=2048),
 provider text not null default 'MANUAL' check(provider='MANUAL'),
 role text not null default 'OTHER' check(role in ('PLANNING','DESIGN','EXECUTION','DEPLOYMENT','OTHER')),
 created_at timestamptz not null default now(),
 unique(workspace_id,project_id,canonical_url),
 foreign key(workspace_id,project_id) references public.projects(workspace_id,id) on delete cascade
);
create table public.activities (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 project_id uuid not null,
 actor_id uuid references auth.users(id) on delete set null,
 kind text not null,
 occurred_at timestamptz not null default now(),
 foreign key(workspace_id,project_id) references public.projects(workspace_id,id) on delete cascade
);
create index activities_project_idx on public.activities(workspace_id,project_id,occurred_at desc);
create index activities_actor_idx on public.activities(actor_id);
create table public.project_requests (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 request_id uuid not null,
 payload_hash text not null,
 result_id uuid not null,
 created_at timestamptz not null default now(),
 primary key(workspace_id,user_id,request_id)
);
create index project_requests_user_idx on public.project_requests(user_id);

alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.projects enable row level security;
alter table public.project_sources enable row level security;
alter table public.activities enable row level security;
alter table public.project_requests enable row level security;

create function private.workspace_role(w uuid) returns text
language sql stable security definer set search_path='' as $$
 select role from public.memberships where workspace_id=w and user_id=(select auth.uid()) and auth.uid() is not null
$$;
revoke all on function private.workspace_role(uuid) from public,anon;
grant execute on function private.workspace_role(uuid) to authenticated;

create policy memberships_read on public.memberships for select to authenticated using(user_id=(select auth.uid()));
create policy workspace_read on public.workspaces for select to authenticated using((select private.workspace_role(id)) is not null);
create policy projects_read on public.projects for select to authenticated using((select private.workspace_role(workspace_id)) is not null);
create policy projects_insert on public.projects for insert to authenticated with check((select private.workspace_role(workspace_id)) in ('OWNER','ADMIN','MEMBER'));
create policy projects_update on public.projects for update to authenticated using((select private.workspace_role(workspace_id)) in ('OWNER','ADMIN','MEMBER')) with check((select private.workspace_role(workspace_id)) in ('OWNER','ADMIN','MEMBER'));
create policy sources_read on public.project_sources for select to authenticated using((select private.workspace_role(workspace_id)) is not null);
create policy sources_insert on public.project_sources for insert to authenticated with check((select private.workspace_role(workspace_id)) in ('OWNER','ADMIN','MEMBER') and exists(select 1 from public.projects p where p.id=project_id and p.workspace_id=project_sources.workspace_id and p.archived_at is null and p.deleted_at is null));
create policy sources_delete on public.project_sources for delete to authenticated using((select private.workspace_role(workspace_id)) in ('OWNER','ADMIN','MEMBER'));
create policy activities_read on public.activities for select to authenticated using((select private.workspace_role(workspace_id)) is not null);
create policy requests_read on public.project_requests for select to authenticated using(user_id=(select auth.uid()) and (select private.workspace_role(workspace_id)) in ('OWNER','ADMIN','MEMBER'));
create policy requests_insert on public.project_requests for insert to authenticated with check(user_id=(select auth.uid()) and (select private.workspace_role(workspace_id)) in ('OWNER','ADMIN','MEMBER'));
-- SELECT FOR UPDATE in create_project needs an UPDATE grant/policy, no mutable columns are exposed by the app.
create policy requests_update on public.project_requests for update to authenticated using(user_id=(select auth.uid()) and (select private.workspace_role(workspace_id)) in ('OWNER','ADMIN','MEMBER')) with check(user_id=(select auth.uid()) and (select private.workspace_role(workspace_id)) in ('OWNER','ADMIN','MEMBER'));

revoke all on public.workspaces,public.memberships,public.projects,public.project_sources,public.activities,public.project_requests from anon,authenticated;
grant select on public.workspaces,public.memberships,public.projects,public.project_sources,public.activities,public.project_requests to authenticated;
grant insert(id,workspace_id,name,description,lifecycle_status,workflow_stage,owner_label,next_action,next_action_due_on,target_date,coordination_state,coordination_note) on public.projects to authenticated;
grant update(name,description,lifecycle_status,workflow_stage,owner_label,next_action,next_action_due_on,target_date,coordination_state,coordination_note,archived_at,deleted_at) on public.projects to authenticated;
grant insert(workspace_id,project_id,external_name,canonical_url,role),delete on public.project_sources to authenticated;
grant insert(workspace_id,request_id,payload_hash,result_id) on public.project_requests to authenticated;
grant update(request_id) on public.project_requests to authenticated;

create function private.ensure_workspace() returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); w uuid;
begin
 if u is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
 insert into public.workspaces(personal_owner_user_id) values(u) on conflict(personal_owner_user_id) do nothing;
 select id into w from public.workspaces where personal_owner_user_id=u;
 insert into public.memberships(workspace_id,user_id,role) values(w,u,'OWNER') on conflict do nothing;
 return w;
end $$;
revoke all on function private.ensure_workspace() from public,anon;
grant execute on function private.ensure_workspace() to authenticated;
create function public.ensure_workspace() returns uuid language sql security invoker set search_path='' as $$ select private.ensure_workspace() $$;
revoke all on function public.ensure_workspace() from public,anon;
grant execute on function public.ensure_workspace() to authenticated;

create function private.project_before_update() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if old.deleted_at is not null and new.deleted_at is not null then raise exception 'RESTORE_FIRST'; end if;
 new.version:=old.version+1;
 new.updated_at:=now();
 new.last_activity_at:=now();
 new.confirmed_at:=now();
 return new;
end $$;
create trigger project_version before update on public.projects for each row execute function private.project_before_update();
revoke all on function private.project_before_update() from public,anon,authenticated;

create function private.project_activity() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
 insert into public.activities(workspace_id,project_id,actor_id,kind)
 values(new.workspace_id,new.id,auth.uid(),case when TG_OP='INSERT' then 'CREATED' when new.deleted_at is not null then 'DELETED' when new.archived_at is not null then 'ARCHIVED' else 'UPDATED' end);
 return new;
end $$;
create trigger project_activity after insert or update on public.projects for each row execute function private.project_activity();
revoke all on function private.project_activity() from public,anon,authenticated;

create function public.create_project(p_workspace uuid,p_request_id uuid,p_data jsonb) returns public.projects
language plpgsql security invoker set search_path='' as $$
declare r public.project_requests; result public.projects;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED' using errcode='42501'; end if;
 insert into public.project_requests(workspace_id,request_id,payload_hash,result_id)
 values(p_workspace,p_request_id,md5(p_data::text),gen_random_uuid()) on conflict do nothing;
 select * into r from public.project_requests where workspace_id=p_workspace and user_id=auth.uid() and request_id=p_request_id for update;
 if r.payload_hash is distinct from md5(p_data::text) then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505'; end if;
 select * into result from public.projects where id=r.result_id and workspace_id=p_workspace;
 if found then return result; end if;
 insert into public.projects(id,workspace_id,name,description,lifecycle_status,workflow_stage,owner_label,next_action,next_action_due_on,target_date,coordination_state,coordination_note)
 values(r.result_id,p_workspace,p_data->>'name',coalesce(p_data->>'description',''),coalesce(p_data->>'lifecycle_status','IDEA'),coalesce(p_data->>'workflow_stage','DISCOVERY'),coalesce(p_data->>'owner_label',''),coalesce(p_data->>'next_action',''),nullif(p_data->>'next_action_due_on','')::date,nullif(p_data->>'target_date','')::date,coalesce(p_data->>'coordination_state','CLEAR'),coalesce(p_data->>'coordination_note','')) returning * into result;
 return result;
end $$;
revoke all on function public.create_project(uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_project(uuid,uuid,jsonb) to authenticated;
