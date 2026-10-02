create extension if not exists pg_cron;
select cron.schedule('projecthub-draft-retention','* * * * *',$job$
 update public.text_drafts set ciphertext=null where expires_at<=now() and ciphertext is not null;
 delete from public.text_drafts where expires_at<now()-interval '30 days';
 delete from private.extraction_usage where occurred_at<now()-interval '2 days';
$job$);
