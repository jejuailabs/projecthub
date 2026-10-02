begin;
create temporary table draft_test_ids(label text primary key,id uuid default gen_random_uuid());
insert into draft_test_ids(label) values('owner'),('other'),('draft'),('candidate1'),('candidate2');
grant select on draft_test_ids to authenticated;
insert into auth.users(id,email) select id,id::text||'@draft-test.invalid' from draft_test_ids where label in ('owner','other');
set local role authenticated;
select set_config('request.jwt.claim.sub',(select id::text from draft_test_ids where label='owner'),true);
do $$
declare w uuid;d uuid;c1 uuid;c2 uuid;payload jsonb;n int;
begin
 w:=public.ensure_workspace();select id into d from draft_test_ids where label='draft';
 select id into c1 from draft_test_ids where label='candidate1';select id into c2 from draft_test_ids where label='candidate2';
 insert into public.text_drafts(id,workspace_id,ciphertext,candidate_ids) values(d,w,'encrypted-test',array[c1,c2]);
 payload:=jsonb_build_array(jsonb_build_object('candidate_id',c1,'project',jsonb_build_object('name','One')),jsonb_build_object('candidate_id',c2,'project',jsonb_build_object('name','Two','workflow_stage','CLOSED')));
 begin
  perform public.confirm_text_draft(w,d,payload,null);raise exception 'FAIL: invalid batch accepted';
 exception when check_violation then null;end;
 if exists(select 1 from public.projects where workspace_id=w) then raise exception 'FAIL: batch partially committed';end if;
 payload:=jsonb_build_array(jsonb_build_object('candidate_id',c1,'project',jsonb_build_object('name','One')),jsonb_build_object('candidate_id',c2,'project',jsonb_build_object('name','Two')));
 select count(*) into n from public.confirm_draft_with_material(w,d,payload,'https://example.com/notes','Original meeting notes');
 if (select count(*) from public.project_materials where workspace_id=w and body='Original meeting notes')<>2 then raise exception 'FAIL: original capture';end if;
 if n<>2 then raise exception 'FAIL: batch count';end if;
 perform public.confirm_draft_with_material(w,d,payload,'https://example.com/notes','Original meeting notes');
 if (select count(*) from public.projects where workspace_id=w)<>2 then raise exception 'FAIL: duplicate projects';end if;
 if (select count(*) from public.project_materials where workspace_id=w)<>2 then raise exception 'FAIL: duplicate materials';end if;
 if (select ciphertext from public.text_drafts where id=d) is not null then raise exception 'FAIL: candidate content retained';end if;
 if (select count(*) from public.project_sources where workspace_id=w)<>2 then raise exception 'FAIL: source links';end if;
 for i in 1..5 loop if not public.reserve_extraction(w) then raise exception 'FAIL: premature limit';end if;end loop;
 if public.reserve_extraction(w) then raise exception 'FAIL: rate limit bypass';end if;
end $$;
select set_config('request.jwt.claim.sub',(select id::text from draft_test_ids where label='other'),true);
do $$begin if exists(select 1 from public.text_drafts) then raise exception 'FAIL: cross-user draft access';end if;end $$;
select 'PASS: atomic batch, idempotency, source links, ciphertext deletion, quota and tenant isolation' result;
rollback;
