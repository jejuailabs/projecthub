begin;
create temporary table test_ids(label text primary key,id uuid not null default gen_random_uuid()) on commit drop;
insert into test_ids(label) values('owner_a'),('owner_b'),('viewer'),('request');
grant select on test_ids to authenticated;
insert into auth.users(id,email) select id,id::text||'@projecthub-test.invalid' from test_ids where label!='request';
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='owner_a'),true);
do $$
declare w uuid; p public.projects; second public.projects; count_before int;
begin
 w:=public.ensure_workspace();
 if public.ensure_workspace()!=w then raise exception 'FAIL: workspace idempotency';end if;
 p:=public.create_project(w,(select id from test_ids where label='request'),'{"name":"RLS test","lifecycle_status":"BUILDING","workflow_stage":"PLANNING"}');
 second:=public.create_project(w,(select id from test_ids where label='request'),'{"name":"RLS test","lifecycle_status":"BUILDING","workflow_stage":"PLANNING"}');
 if p.id!=second.id then raise exception 'FAIL: create idempotency';end if;
 begin
 perform public.create_project(w,(select id from test_ids where label='request'),'{"name":"changed payload"}');
 raise exception 'FAIL: mismatched key accepted';
 exception when unique_violation then null;end;
 begin
 update public.projects set workflow_stage='CLOSED' where id=p.id;
 raise exception 'FAIL: invalid completion pair';
 exception when check_violation then null;end;
 update public.projects set next_action='Review' where id=p.id and version=1;
 select * into p from public.projects where id=p.id;
 if p.version!=2 then raise exception 'FAIL: version bump';end if;
 update public.projects set name='stale overwrite' where id=p.id and version=1;
 get diagnostics count_before=row_count;
 if count_before!=0 then raise exception 'FAIL: stale update';end if;
 if (select count(*) from public.activities where project_id=p.id and kind in ('CREATED','UPDATED'))!=2 then raise exception 'FAIL: audit events';end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='owner_b'),true);
select public.ensure_workspace();
do $$
begin
 if (select count(*) from public.projects)!=0 then raise exception 'FAIL: tenant read leakage';end if;
 if (select count(*) from public.memberships)!=1 then raise exception 'FAIL: memberships leak';end if;
 update public.projects set name='intruder';
 if found then raise exception 'FAIL: tenant write leakage';end if;
 begin
 insert into public.memberships(workspace_id,user_id,role) select id,auth.uid(),'OWNER' from public.workspaces;
 raise exception 'FAIL: membership escalation';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
insert into public.memberships(workspace_id,user_id,role) select w.id,t.id,'VIEWER' from public.workspaces w cross join test_ids t where w.personal_owner_user_id=(select id from test_ids where label='owner_a') and t.label='viewer';
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='viewer'),true);
do $$
begin
 if (select count(*) from public.projects)!=1 then raise exception 'FAIL: viewer read';end if;
 update public.projects set name='viewer overwrite';
 if found then raise exception 'FAIL: viewer write';end if;
 begin
 insert into public.projects(workspace_id,name) select id,'forbidden' from public.workspaces;
 raise exception 'FAIL: viewer insert';
 exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: workspace idempotency, project idempotency, payload mismatch, constraints, versions, audit, tenant isolation, membership protection, viewer permissions' as result;
rollback;
