begin;
create temporary table test_ids(label text primary key,id uuid not null default gen_random_uuid()) on commit drop;
insert into test_ids(label) values('owner'),('other'),('viewer');
grant select on test_ids to authenticated;
insert into auth.users(id,email) select id,id::text||'@projecthub-test.invalid' from test_ids;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='owner'),true);
do $$ declare w uuid; p public.projects; m public.project_materials; begin
 w:=public.ensure_workspace();p:=public.create_project(w,gen_random_uuid(),'{"name":"Materials test"}');
 insert into public.project_materials(workspace_id,project_id,title,category,body) values(w,p.id,'First notes','MEETING','Original') returning * into m;
 update public.project_materials set body='Changed' where id=m.id and version=1;
 if (select version from public.project_materials where id=m.id)!=2 then raise exception 'FAIL version';end if;
 if (select count(*) from public.material_revisions where material_id=m.id)!=2 then raise exception 'FAIL history';end if;
 if (select body from public.material_revisions where material_id=m.id and version=1)!='Original' then raise exception 'FAIL snapshot';end if;
 update public.project_materials set body='Stale' where id=m.id and version=1;if found then raise exception 'FAIL conflict';end if;
 begin update public.material_revisions set body='Fake';raise exception 'FAIL mutable history';exception when insufficient_privilege then null;end;
 begin update public.project_materials set created_at=now();raise exception 'FAIL timestamp spoof';exception when insufficient_privilege then null;end;
 update public.projects set archived_at=now() where id=p.id;
 update public.project_materials set body='Archived write' where id=m.id;if found then raise exception 'FAIL archived write';end if;
 update public.projects set archived_at=null where id=p.id;
 end $$;
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='other'),true);
select public.ensure_workspace();
do $$ begin
 if exists(select 1 from public.project_materials) or exists(select 1 from public.material_revisions) then raise exception 'FAIL tenant isolation';end if;
 update public.project_materials set body='Intruder';if found then raise exception 'FAIL tenant update';end if;
end $$;
reset role;
insert into public.memberships(workspace_id,user_id,role) select w.id,t.id,'VIEWER' from public.workspaces w cross join test_ids t where w.personal_owner_user_id=(select id from test_ids where label='owner') and t.label='viewer';
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from test_ids where label='viewer'),true);
do $$ begin
 if (select count(*) from public.project_materials)!=1 then raise exception 'FAIL viewer read';end if;
 update public.project_materials set body='Viewer';if found then raise exception 'FAIL viewer update';end if;
 begin insert into public.project_materials(workspace_id,project_id,title,category) select workspace_id,project_id,'Forbidden','IDEA' from public.project_materials;raise exception 'FAIL viewer insert';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: immutable revisions, timestamps, concurrent edits, archived project, tenant isolation, viewer permissions' as result;
rollback;
