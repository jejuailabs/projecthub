import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
export async function GET(request:Request){
 const url=new URL(request.url);const locale=url.searchParams.get('locale')==='en'?'en':'ko';
 const db=await createClient();
 const {data,error}=await db.auth.signInWithOAuth({provider:'google',options:{redirectTo:`${url.origin}/auth/callback?locale=${locale}`}});
 if(error||!data.url)return NextResponse.redirect(new URL(`/${locale}/login?error=auth`,url.origin));
 return NextResponse.redirect(data.url);
}