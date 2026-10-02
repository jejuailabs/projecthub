import {NextIntlClientProvider,hasLocale} from "next-intl";
import {setRequestLocale} from "next-intl/server";
import {notFound} from "next/navigation";
import {routing} from "@/i18n/routing";
import {Providers} from "@/components/providers";
import "../globals.css";
import "../photographic-glass.css";
import "../drafts.css";
import "../landing.css";
export const metadata={title:"Project Hub",description:"Your projects, in perspective."};
export default async function LocaleLayout({children,params}:{children:React.ReactNode;params:Promise<{locale:string}>}){
 const {locale}=await params;
 if(!hasLocale(routing.locales,locale))notFound();
 setRequestLocale(locale);
 return <html lang={locale} suppressHydrationWarning><body><NextIntlClientProvider><Providers>{children}</Providers></NextIntlClientProvider></body></html>;
}
