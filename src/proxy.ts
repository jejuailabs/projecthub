import createMiddleware from "next-intl/middleware";
import {createServerClient} from "@supabase/ssr";
import {NextRequest} from "next/server";
import {routing} from "@/i18n/routing";
import {getSupabaseConfig} from "@/lib/env";
const intl=createMiddleware(routing);
export async function proxy(request:NextRequest){
 let response=intl(request);
 const config=getSupabaseConfig();
 if(config && !request.nextUrl.pathname.includes("/demo")){
  const client=createServerClient(config.url,config.key,{cookies:{
   getAll:()=>request.cookies.getAll(),
   setAll(values){
    values.forEach(({name,value})=>request.cookies.set(name,value));
    response=intl(request);
    values.forEach(({name,value,options})=>response.cookies.set(name,value,options));
   }
  }});
  await client.auth.getClaims();
  response.headers.set("Cache-Control","private, no-store");
 }
 return response;
}
export const config={matcher:["/((?!api|auth|_next|.*\\..*).*)"]};
