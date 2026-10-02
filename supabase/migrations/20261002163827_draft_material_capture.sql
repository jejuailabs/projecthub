create function public.confirm_draft_with_material(p_workspace uuid,p_draft uuid,p_candidates jsonb,p_source_url text,p_original text)
returns setof public.projects language plpgsql security invoker set search_path='' as $$
declare p public.projects; was_confirmed boolean;
begin
 select confirmed_ids is not null into was_confirmed from public.text_drafts where id=p_draft and workspace_id=p_workspace and user_id=auth.uid() for update;
 if not found then raise exception 'DRAFT_NOT_FOUND';end if;
 for p in select * from public.confirm_text_draft(p_workspace,p_draft,p_candidates,p_source_url) loop
  if not was_confirmed and nullif(btrim(p_original),'') is not null then
   insert into public.project_materials(workspace_id,project_id,title,category,body)
   values(p_workspace,p.id,'Project creation notes','MEETING',p_original);
  end if;
  return next p;
 end loop;
end $$;
revoke all on function public.confirm_draft_with_material(uuid,uuid,jsonb,text,text) from public,anon;
grant execute on function public.confirm_draft_with_material(uuid,uuid,jsonb,text,text) to authenticated;
