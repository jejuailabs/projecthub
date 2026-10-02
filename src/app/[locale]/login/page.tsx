import {getTranslations} from 'next-intl/server';
import {Link} from '@/i18n/navigation';
import {Layers3,ArrowUpRight} from 'lucide-react';
import {getSupabaseConfig} from '@/lib/env';
import {Preferences} from '@/components/preferences';
export default async function Login({params,searchParams}:{params:Promise<{locale:string}>;searchParams:Promise<{error?:string}>}){
 const {locale}=await params;const t=await getTranslations('Login');const {error}=await searchParams;
 return <main className='login-page'><div className='login-top'><span className='brand'><Layers3/> Project Hub</span><Preferences/></div><section className='login-panel glass'><span className='eyebrow'>{t('eyebrow')}</span><h1>{t('title')}</h1><p>{t('description')}</p><div className='login-orbit'><Layers3 size={60}/><span>Notion</span><span>GitHub</span><span>Vercel</span></div>{error&&<p role='alert' className='error-message'>{t('authError')}</p>}{getSupabaseConfig()?<a className='button primary' href={`/auth/google?locale=${locale}`}>{t('google')}<ArrowUpRight size={18}/></a>:<p>{t('setup')}</p>}<Link className='button secondary' href='/demo'>{t('demo')}</Link><small>{t('privacy')}</small></section></main>;
}