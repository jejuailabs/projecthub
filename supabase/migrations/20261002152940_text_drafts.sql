create table public.text_drafts (
 id uuid primary key,
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 ciphertext text,
 candidate_ids uuid[] not null check(cardinality(candidate_ids) between 0 and 10),
 expires_at timestamptz not null default now()+interval '24 hours',
 created_at timestamptz not null default now(),
 confirmed_ids uuid[],
 confirmation_hash text,
 check(ciphertext is null or octet_length(ciphertext)<=150000)
);
create index text_drafts_expiry_idx on public.text_drafts(expires_at);
create index text_drafts_workspace_idx on public.text_drafts(workspace_id,user_id);
create index text_drafts_user_idx on public.text_drafts(user_id);
alter table public.text_drafts enable row level security;
create policy drafts_read on public.text_drafts for select to authenticated using(user_id=(select auth.uid()) and (select private.workspace_role(workspace_id)) in ('OWNER','ADMIN','MEMBER'));
create policy drafts_insert on public.text_drafts for insert to authenticated with check(user_id=(select auth.uid()) and (select private.workspace_role(workspace_id)) in ('OWNER','ADMIN','MEMBER'));
create policy drafts_update on public.text_drafts for update to authenticated using(user_id=(select auth.uid()) and (select private.workspace_role(workspace_id)) in ('OWNER','ADMIN','MEMBER')) with check(user_id=(select auth.uid()) and (select private.workspace_role(workspace_id)) in ('OWNER','ADMIN','MEMBER'));
create policy drafts_delete on public.text_drafts for delete to authenticated using(user_id=(select auth.uid()) and (select private.workspace_role(workspace_id)) in ('OWNER','ADMIN','MEMBER'));
revoke all on public.text_drafts from anon,authenticated;
grant select,delete on public.text_drafts to authenticated;
grant insert(id,workspace_id,ciphertext,candidate_ids) on public.text_drafts to authenticated;
grant update(ciphertext,confirmed_ids,confirmation_hash) on public.text_drafts to authenticated;

-- Counters cannot be reset by callers. The private function checks membership
-- before taking a workspace lock so parallel requests share an atomic quota.
create table private.extraction_usage (
 workspace_id uuid not null references public.workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 occurred_at timestamptz not null default now()
);
alter table private.extraction_usage enable row level security;
create index extraction_usage_workspace_idx on private.extraction_usage(workspace_id,occurred_at);
create index extraction_usage_user_idx on private.extraction_usage(user_id,occurred_at);
revoke all on private.extraction_usage from public,anon,authenticated;
create function private.reserve_extraction(w uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(private.workspace_role(w),'') not in ('OWNER','ADMIN','MEMBER') then raise exception 'FORBIDDEN' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
 perform pg_advisory_xact_lock(hashtextextended(w::text,2));
 if (select count(*) from private.extraction_usage where user_id=auth.uid() and occurred_at>now()-interval '1 minute')>=5
 or (select count(*) from private.extraction_usage where workspace_id=w and occurred_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC')>=20 then return false;end if;
 insert into private.extraction_usage(workspace_id,user_id) values(w,auth.uid());return true;
end $$;
revoke all on function private.reserve_extraction(uuid) from public,anon;
grant execute on function private.reserve_extraction(uuid) to authenticated;
create function public.reserve_extraction(p_workspace uuid) returns boolean language sql security invoker set search_path='' as $$select private.reserve_extraction(p_workspace)$$;
revoke all on function public.reserve_extraction(uuid) from public,anon;
grant execute on function public.reserve_extraction(uuid) to authenticated;

create function public.confirm_text_draft(p_workspace uuid,p_draft uuid,p_candidates jsonb,p_source_url text default null) returns setof public.projects
language plpgsql security invoker set search_path='' as $$
declare d public.text_drafts; item jsonb; p public.projects; ids uuid[]:='{}'; h text;
begin
 if auth.uid() is null then raise exception 'UNAUTHORIZED' using errcode='42501';end if;
 select * into d from public.text_drafts where id=p_draft and workspace_id=p_workspace and user_id=auth.uid() for update;
 if not found then raise exception 'DRAFT_NOT_FOUND' using errcode='P0002';end if;
 h:=md5(jsonb_build_object('candidates',p_candidates,'source',p_source_url)::text);
 if d.confirmed_ids is not null then
  if h is distinct from d.confirmation_hash then raise exception 'IDEMPOTENCY_CONFLICT' using errcode='23505';end if;
  return query select * from public.projects where workspace_id=p_workspace and id=any(d.confirmed_ids);return;
 end if;
 if d.expires_at<=now() then raise exception 'DRAFT_EXPIRED';end if;
 if jsonb_typeof(p_candidates)<>'array' or jsonb_array_length(p_candidates) not between 1 and 10 then raise exception 'INVALID_CANDIDATES';end if;
 if (select count(distinct x->>'candidate_id') from jsonb_array_elements(p_candidates) x)<>jsonb_array_length(p_candidates) then raise exception 'DUPLICATE_CANDIDATE';end if;
 for item in select * from jsonb_array_elements(p_candidates) loop
  if not ((item->>'candidate_id')::uuid=any(d.candidate_ids)) then raise exception 'INVALID_CANDIDATE';end if;
  p:=public.create_project(p_workspace,(item->>'candidate_id')::uuid,item->'project');
  ids:=array_append(ids,p.id);
  if p_source_url is not null then
   insert into public.project_sources(workspace_id,project_id,external_name,canonical_url,role)
   values(p_workspace,p.id,'Meeting source',p_source_url,'PLANNING') on conflict do nothing;
  end if;
 end loop;
 update public.text_drafts set ciphertext=null,confirmed_ids=ids,confirmation_hash=h where id=p_draft;
 return query select * from public.projects where workspace_id=p_workspace and id=any(ids);
end $$;
revoke all on function public.confirm_text_draft(uuid,uuid,jsonb,text) from public,anon;
grant execute on function public.confirm_text_draft(uuid,uuid,jsonb,text) to authenticated;
