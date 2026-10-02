'use client';
import {useTranslations} from 'next-intl';
export default function ErrorPage({reset}:{reset:()=>void}){const t=useTranslations('Common');return <main className='error-page glass'><h1>{t('loadFailed')}</h1><button className='button primary' onClick={reset}>{t('retry')}</button></main>;}