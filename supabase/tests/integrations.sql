begin;
create temporary table integration_test_ids(label text primary key,id uuid default gen_random_uuid());
insert into integration_test_ids(label) values('owner'),('other'),('viewer');
grant select,insert on integration_test_ids to authenticated;
insert into auth.users(id,email) select id,id::text||'@integration-test.invalid' from integration_test_ids;
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from integration_test_ids where label='owner'),true);
do $$ declare w uuid;c public.integration_connections;c2 public.integration_connections;ids uuid[];p public.projects;s public.project_sources;before_count integer;begin
 w:=public.ensure_workspace();insert into integration_test_ids values('workspace',w);
 c:=public.save_integration(w,'GITHUB','account1','','Personal','Account1','App','encrypted-test');insert into integration_test_ids values('connection',c.id);
 c2:=public.save_integration(w,'GITHUB','account2','','Work','Account2','App','encrypted-test2');
 if c.id=c2.id or (select count(*) from public.integration_connections)<>2 then raise exception 'FAIL multiple accounts';end if;
 if public.integration_credential(c.id)<>'encrypted-test' then raise exception 'FAIL owner credential';end if;
 ids:=public.import_integration(c.id,c.version,'[{"external_id":"10","name":"Repo","description":"Original","url":"https://github.com/test/repo","kind":"repository","scope":"installation1","metadata":{"visibility":"private"}}]');
 insert into integration_test_ids values('project',ids[1]);select * into s from public.project_sources where project_id=ids[1];insert into integration_test_ids values('source',s.id);
 if s.provider<>'GITHUB' or s.connection_id<>c.id then raise exception 'FAIL source';end if;
 -- Retry through another account must not create a second project or steal binding.
 ids:=public.import_integration(c2.id,c2.version,'[{"external_id":"10","name":"Repo","url":"https://github.com/test/repo","kind":"repository"}]');
 if ids[1]<>(select id from integration_test_ids where label='project') or (select count(*) from public.projects)<>1 then raise exception 'FAIL duplicate import';end if;
 p:=public.create_project(w,gen_random_uuid(),'{"name":"Existing","description":"User text","next_action":"User todo"}');
 begin perform public.import_integration(c.id,c.version,jsonb_build_array(jsonb_build_object('external_id','10','name','Repo','url','https://github.com/test/repo','project_id',p.id)));raise exception 'FAIL moved duplicate';exception when unique_violation then null;end;
 -- Importing to an existing project leaves user-owned fields and todos alone.
 perform public.import_integration(c.id,c.version,jsonb_build_array(jsonb_build_object('external_id','20','name','Second','url','https://github.com/test/second','kind','repository','project_id',p.id)));
 if (select description from public.projects where id=p.id)<>'User text' or (select next_action from public.projects where id=p.id)<>'User todo' then raise exception 'FAIL overwrote user fields';end if;
 select count(*) into before_count from public.projects;
 begin perform public.import_integration(c.id,c.version,'[{"external_id":"30","name":"Valid","url":"https://github.com/test/valid"},{"external_id":"31","name":"Invalid","url":"javascript:bad"}]');raise exception 'FAIL accepted invalid source';exception when check_violation then null;end;
 if (select count(*) from public.projects)<>before_count then raise exception 'FAIL partial import';end if;
 perform public.sync_integration_source(c.id,c.version,s.id,'{"external_id":"10","name":"New source title","url":"https://github.com/test/renamed","metadata":{"language":"TypeScript"}}');
 if (select name from public.projects where id=ids[1])<>'Repo' then raise exception 'FAIL sync overwrote project';end if;
 perform public.sync_integration_source(c.id,c.version,s.id,null);
 if (select external_name from public.project_sources where id=s.id)<>'New source title' or (select last_synced_at from public.project_sources where id=s.id) is null then raise exception 'FAIL failed sync lost values';end if;
 begin perform public.import_integration(c.id,99,'[]');raise exception 'FAIL stale';exception when serialization_failure then null;end;
 perform public.edit_integration(c.id,c.version,'Personal',true);
 if public.integration_credential(c.id) is not null then raise exception 'FAIL disconnect credential';end if;
 if (select sync_status from public.project_sources where id=s.id)<>'DISCONNECTED' then raise exception 'FAIL disconnect binding';end if;
 if not exists(select 1 from public.projects where id=ids[1]) then raise exception 'FAIL disconnect removed project';end if;
 begin perform public.sync_integration_source(c.id,c.version,s.id,null);raise exception 'FAIL stale sync after disconnect';exception when serialization_failure then null;end;
 c2:=public.save_integration(w,'GITHUB','account1','','Reconnect','Account1','App','new-encrypted');
 if c2.id<>c.id or c2.version<=c.version then raise exception 'FAIL reconnect identity';end if;
end $$;
reset role;
insert into public.memberships(workspace_id,user_id,role) select w.id,u.id,'VIEWER' from integration_test_ids w,integration_test_ids u where w.label='workspace' and u.label='viewer';
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from integration_test_ids where label='other'),true);
do $$begin
 perform public.ensure_workspace();
 if exists(select 1 from public.integration_connections) then raise exception 'FAIL other account connections visible';end if;
 if public.integration_credential((select id from integration_test_ids where label='connection')) is not null then raise exception 'FAIL other credential visible';end if;
 begin perform public.edit_integration((select id from integration_test_ids where label='connection'),3,'Hack',true);raise exception 'FAIL other mutation';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from integration_test_ids where label='viewer'),true);
do $$begin
 if public.integration_credential((select id from integration_test_ids where label='connection')) is not null then raise exception 'FAIL viewer credential';end if;
 if not exists(select 1 from public.project_sources where id=(select id from integration_test_ids where label='source')) then raise exception 'FAIL viewer source read';end if;
 begin perform public.save_integration((select id from integration_test_ids where label='workspace'),'GITHUB','bad','','Bad','Bad','Bad','cipher');raise exception 'FAIL viewer write';exception when insufficient_privilege then null;end;
end $$;
reset role;
select 'PASS: multiple accounts, selective atomic imports, duplicate retries, existing field preservation, disconnect/reconnect, tenant and viewer isolation' as result;
rollback;
