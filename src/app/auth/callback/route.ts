import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
export async function GET(request:Request){
 const url=new URL(request.url);const code=url.searchParams.get('code');
 const locale=url.searchParams.get('locale')==='en'?'en':'ko';
 if(code){const db=await createClient();const {error}=await db.auth.exchangeCodeForSession(code);if(!error)return NextResponse.redirect(new URL(`/${locale}/dashboard`,url.origin));}
 return NextResponse.redirect(new URL(`/${locale}/login?error=auth`,url.origin));
}