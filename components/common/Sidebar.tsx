/* eslint-disable @next/next/no-img-element */
import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { BrandTitle } from './Branding';
import { useTranslation } from '../../i18n/LanguageContext';

type SidebarProps = {
   domains: DomainType[],
   showAddModal: Function
}

const Sidebar = ({ domains, showAddModal } : SidebarProps) => {
   const router = useRouter();
   const { t } = useTranslation();

   return (
      <div className="sidebar pt-44 w-1/5 hidden lg:block" data-testid="sidebar">
         <h3 className="py-7 text-base font-bold text-blue-700">
            <BrandTitle />
         </h3>
         <div className="sidebar_menu max-h-96 overflow-auto styled-scrollbar">
            <ul className=' font-medium text-sm'>
               {domains.map((d) => <li
                                 key={d.domain}
                                 className={'my-2.5 leading-10'}>
                                    <Link
                                       href={`/domain/${d.slug}`}
                                       className={`block cursor-pointer px-4 text-ellipsis max-w-[215px] overflow-hidden whitespace-nowrap rounded
                                        rounded-r-none ${((`/domain/${d.slug}` === router.asPath || `/domain/console/${d.slug}` === router.asPath
                                        || `/domain/insight/${d.slug}` === router.asPath || `/domain/ideas/${d.slug}` === router.asPath)
                                        ? 'bg-white text-zinc-800 border border-r-0' : 'text-zinc-500')}`}>
                                          <img
                                          className={' inline-block mr-1'}
                                          src={`https://www.google.com/s2/favicons?domain=${d.domain}&sz=16`} alt={d.domain}
                                          />
                                          {d.domain}
                                    </Link>
                                 </li>)
               }
            </ul>
         </div>
         <div className='sidebar_add border-t font-semibold text-sm text-center mt-6 w-[80%] ml-3 text-zinc-500'>
            <button data-testid="add_domain" onClick={() => showAddModal(true)} className='p-4 hover:text-blue-600'>+ {t.navigation.addDomain}</button>
         </div>
    </div>
   );
 };

 export default Sidebar;
