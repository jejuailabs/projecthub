'use client';
import {useTheme} from 'next-themes';
import {useLocale,useTranslations} from 'next-intl';
import {usePathname,useRouter} from '@/i18n/navigation';
import {Sun,Moon,Monitor,Languages} from 'lucide-react';
export function Preferences(){
 const {setTheme}=useTheme();const t=useTranslations('Common');const locale=useLocale();const pathname=usePathname();const router=useRouter();
 return <div className='preferences'><button title={t('language')} aria-label={t('language')} onClick={()=>router.replace(pathname,{locale:locale==='ko'?'en':'ko'})}><Languages size={17}/><span>{locale==='ko'?'EN':'한국어'}</span></button><button aria-label={t('light')} title={t('light')} onClick={()=>setTheme('light')}><Sun size={17}/></button><button aria-label={t('dark')} title={t('dark')} onClick={()=>setTheme('dark')}><Moon size={17}/></button><button aria-label={t('system')} title={t('system')} onClick={()=>setTheme('system')}><Monitor size={17}/></button></div>;
}