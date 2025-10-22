import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import Icon from './Icon';
import { BrandTitle } from './Branding';
import { getClientOrigin } from '../../utils/client/origin';
import { useTranslation } from '../../i18n/LanguageContext';

type TopbarProps = {
   showSettings: Function,
   showAddModal: Function,
}

const TopBar = ({ showSettings, showAddModal }:TopbarProps) => {
   const [showMobileMenu, setShowMobileMenu] = useState<boolean>(false);
   const router = useRouter();
   const isDomainsPage = router.pathname === '/domains';
   const { t } = useTranslation();

   const logoutUser = async () => {
      try {
         const fetchOpts = { method: 'POST', headers: new Headers({ 'Content-Type': 'application/json', Accept: 'application/json' }) };
         const origin = getClientOrigin();
         const res = await fetch(`${origin}/api/logout`, fetchOpts).then((result) => result.json());
         console.log(res);
         if (!res.success) {
            toast(res.error, { icon: '⚠️' });
         } else {
            router.push('/login');
         }
      } catch (fetchError) {
         console.error('Failed to logout user', fetchError);
         toast('The server.', { icon: '⚠️' });
      }
   };

   return (
      <div
         className={`topbar desktop-container flex items-center justify-between
       ${isDomainsPage ? 'lg:justify-between' : 'lg:justify-end'} bg-white lg:bg-transparent`}
      >

         <h3
            className={`flex items-center gap-3 p-4 text-base font-bold text-blue-700 ${isDomainsPage ? 'lg:pl-0' : 'lg:hidden'}`}
         >
            <BrandTitle
               className="text-base font-bold text-blue-700"
               markSize={64}
               markClassName="mr-2"
            />
            <button className='px-3 py-1 font-bold text-blue-700 lg:hidden text-lg' onClick={() => showAddModal()}>+</button>
         </h3>
         {!isDomainsPage && router.asPath !== '/research' && (
            <Link
               href={'/domains'}
               className='topbar__back top-4 px-2 py-1 cursor-pointer bg-[#ecf2ff] hover:bg-indigo-100 transition-all
               lg:top-4 lg:px-3 lg:py-2 rounded-full'
            >
               <Icon type="caret-left" size={16} title="Go Back" />
            </Link>
         )}
         <div className="topbar__right">
            <button className={' lg:hidden p-3'} onClick={() => setShowMobileMenu(!showMobileMenu)}>
               <Icon type="hamburger" size={24} />
            </button>
            <ul
               className={`text-sm font-semibold text-gray-500 absolute mt-0 right-3 bg-white
               border border-gray-200 lg:mt-2 lg:relative lg:block lg:border-0 lg:bg-transparent ${showMobileMenu ? 'block z-50' : 'hidden'}`}
            >
               <li className={`block lg:inline-block lg:ml-5 ${router.asPath === '/domains' ? ' text-blue-700' : ''}`}>
                  <Link href={'/domains'} className='block px-3 py-2 cursor-pointer'>
                     <Icon type="domains" color={router.asPath === '/domains' ? '#1d4ed8' : '#888'} size={14} /> {t.navigation.domains}
                  </Link>
               </li>
               <li className={`block lg:inline-block lg:ml-5 ${router.asPath === '/research' ? ' text-blue-700' : ''}`}>
                  <Link href={'/research'} className='block px-3 py-2 cursor-pointer'>
                     <Icon type="research" color={router.asPath === '/research' ? '#1d4ed8' : '#888'} size={14} /> {t.navigation.research}
                  </Link>
               </li>
               <li className='block lg:inline-block lg:ml-5'>
                  <a className='block px-3 py-2 cursor-pointer' onClick={() => showSettings()}>
                     <Icon type="settings-alt" color={'#888'} size={14} /> {t.navigation.settings}
                  </a>
               </li>
               <li className='block lg:inline-block lg:ml-5'>
                  <a className='block px-3 py-2 cursor-pointer' href='https://docs.serpbear.com/' target="_blank" rel='noreferrer'>
                     <Icon type="question" color={'#888'} size={14} /> {t.navigation.help}
                  </a>
               </li>
               <li className='block lg:inline-block lg:ml-5'>
                  <a className='block px-3 py-2 cursor-pointer' onClick={() => logoutUser()}>
                     <Icon type="logout" color={'#888'} size={14} /> {t.navigation.logout}
                  </a>
               </li>
            </ul>
         </div>
       </div>
   );
 };

 export default TopBar;
