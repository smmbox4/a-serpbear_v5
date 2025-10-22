import { useRouter } from 'next/router';
import { useState } from 'react';
import Link from 'next/link';
import { useRefreshKeywords } from '../../services/keywords';
import Icon from '../common/Icon';
import SelectField from '../common/SelectField';

type DomainHeaderProps = {
   domain: DomainType,
   domains: DomainType[],
   showAddModal: Function,
   showSettingsModal: Function,
   exportCsv:Function,
   scFilter?: string
   setScFilter?: Function
   showIdeaUpdateModal?:Function
}

const DomainHeader = (
   { domain, showAddModal, showSettingsModal, exportCsv, domains, scFilter = 'thirtyDays', setScFilter, showIdeaUpdateModal }: DomainHeaderProps,
) => {
   const router = useRouter();
   const [showOptions, setShowOptions] = useState<boolean>(false);
   const [ShowSCDates, setShowSCDates] = useState<boolean>(false);
   const { mutate: refreshMutate } = useRefreshKeywords(() => {});
   const isConsole = router.pathname === '/domain/console/[slug]';
   const isInsight = router.pathname === '/domain/insight/[slug]';
   const isIdeas = router.pathname === '/domain/ideas/[slug]';
   const canShowAddKeywordButton = typeof showAddModal === 'function';

   const daysName = (dayKey:string) => dayKey.replace('three', '3').replace('seven', '7').replace('thirty', '30').replace('Days', ' Days');
   const buttonStyle = 'leading-6 inline-block px-2 py-2 text-gray-500 hover:text-gray-700';
   const buttonLabelStyle = 'ml-2 text-sm not-italic lg:invisible lg:opacity-0';
   const tabStyle = 'rounded rounded-b-none cursor-pointer border-[#e9ebff] border-b-0';
   const scDataFilterStyle = 'px-3 py-2 block w-full';
   return (
      <div className='domain_kewywords_head w-full '>
         <div>
            <h1 className="hidden lg:block text-xl font-bold my-3" data-testid="domain-header">
               <><i className=' capitalize font-bold not-italic'>{domain.domain.charAt(0)}</i>{domain.domain.slice(1)}</>
            </h1>
            <div className='domain_selector bg-white mt-2 lg:hidden relative z-10'>
               <SelectField
               options={domains && domains.length > 0 ? domains.map((d) => ({ label: d.domain, value: d.slug })) : []}
               selected={[domain.slug]}
               defaultLabel="Select Domain"
               updateField={(updateSlug:[string]) => updateSlug && updateSlug[0] && router.push(`${updateSlug[0]}`)}
               multiple={false}
               rounded={'rounded'}
               />
            </div>
         </div>
      <div className='flex w-full justify-between mt-4 lg:mt-0'>
         <ul className=' max-w-[270px] overflow-auto flex items-end text-sm relative top-[2px] lg:max-w-none'>
            <li className={`${tabStyle} ${router.pathname === '/domain/[slug]' ? 'bg-white border border-b-0 font-semibold' : ''}`}>
               <Link href={`/domain/${domain.slug}`} className='px-4 py-2 inline-block'>
                  <Icon type="tracking" color='#999' classes='hidden lg:inline-block' />
                  <span className='text-xs lg:text-sm lg:ml-2'>Tracking</span>
               </Link>
            </li>
            <li className={`${tabStyle} ${router.pathname === '/domain/console/[slug]' ? 'bg-white border border-b-0 font-semibold' : ''}`}>
               <Link href={`/domain/console/${domain.slug}`} className='px-4 py-2 inline-block'>
                  <Icon type="google" size={13} classes='hidden lg:inline-block' />
                  <span className='text-xs lg:text-sm lg:ml-2'>Discover</span>
                  <Icon type='help' size={14} color="#aaa" classes="ml-2 hidden lg:inline-block" title='Discover Keywords you already Rank For' />
               </Link>
            </li>
            <li className={`${tabStyle} ${router.pathname === '/domain/insight/[slug]' ? 'bg-white border border-b-0 font-semibold' : ''}`}>
               <Link href={`/domain/insight/${domain.slug}`} className='px-4 py-2 inline-block'>
                  <Icon type="google" size={13} classes='hidden lg:inline-block' />
                  <span className='text-xs lg:text-sm lg:ml-2'>Insight</span>
                  <Icon type='help' size={14} color="#aaa" classes="ml-2 hidden lg:inline-block" title='Insight for Google Search Console Data' />
               </Link>
            </li>
            <li className={`${tabStyle} ${router.pathname === '/domain/ideas/[slug]' ? 'bg-white border border-b-0 font-semibold' : ''}`}>
               <Link href={`/domain/ideas/${domain.slug}`} className='px-4 py-2 inline-block'>
                  <Icon type="adwords" size={13} classes='hidden lg:inline-block' />
                  <span className='text-xs lg:text-sm lg:ml-2'>Ideas</span>
                  <Icon
                  type='help'
                  size={14}
                  color="#aaa"
                  classes="ml-2 hidden lg:inline-block"
                  title='Get Keyword Ideas for this domain from Google Ads'
                  />
               </Link>
            </li>
         </ul>
         <div className='relative flex mb-0 lg:mb-1 lg:mt-3'>
            {!isInsight && <button className={`${buttonStyle} lg:hidden`} onClick={() => setShowOptions(!showOptions)}>
               <Icon type='dots' size={20} />
            </button>
            }
            {isInsight && <button className={`${buttonStyle} lg:hidden invisible`}>x</button>}
            <div
            className={`absolute top-full right-0 w-40 mt-2 bg-white border border-gray-100 rounded z-[70] ${
               showOptions ? 'block' : 'hidden'
            } lg:block lg:static lg:mt-0 lg:border-0 lg:w-auto lg:bg-transparent`}>
               {!isInsight && (
                  <button
                  className={`domheader_action_button relative ${buttonStyle}`}
                  aria-pressed="false"
                  onClick={() => { exportCsv(); setShowOptions(false); }}>
                     <Icon type='download' size={20} /><i className={`${buttonLabelStyle}`}>Export as csv</i>
                  </button>
               )}
               {!isConsole && !isInsight && !isIdeas && (
                  <button
                  className={`domheader_action_button relative ${buttonStyle} lg:ml-3`}
                  aria-pressed="false"
                  onClick={() => { refreshMutate({ ids: [], domain: domain.domain }); setShowOptions(false); }}>
                     <Icon type='reload' size={14} /><i className={`${buttonLabelStyle}`}>Reload All Serps</i>
                  </button>
                )}
               <button
               data-testid="show_domain_settings"
               className={`domheader_action_button relative ${buttonStyle} lg:ml-3`}
               aria-pressed="false"
               onClick={() => { showSettingsModal(true); setShowOptions(false); }}><Icon type='settings' size={20} />
                  <i className={`${buttonLabelStyle}`}>Domain Settings</i>
               </button>
            </div>
            {canShowAddKeywordButton && (
               <button
               data-testid="add_keyword"
               className={'ml-2 inline-block text-blue-700 font-bold text-sm lg:px-4 lg:py-2'}
               onClick={() => showAddModal(true)}>
                  <span
                  className='text-center leading-4 mr-2 inline-block rounded-full w-7 h-7 pt-1 bg-blue-700 text-white font-bold text-lg'>+</span>
                  <i className=' not-italic hidden lg:inline-block'>Add Keyword</i>
               </button>
            )}
            {isConsole && (
               <div className='text-xs pl-4 ml-2 border-l border-gray-200 relative'>
                  {/* <span className='hidden lg:inline-block'>Data From Last: </span> */}
                  <span className='block cursor-pointer py-3' onClick={() => setShowSCDates(!ShowSCDates)}>
                     <Icon type='date' size={13} classes="mr-1" /> {daysName(scFilter)}
                  </span>
                  {ShowSCDates && (
                     <div className='absolute w-24 z-50 mt-0 right-0 bg-white border border-gray-200 rounded text-center'>
                        {['threeDays', 'sevenDays', 'thirtyDays'].map((itemKey) => <button
                                    key={itemKey}
                                    className={`${scDataFilterStyle} ${scFilter === itemKey ? ' bg-indigo-100 text-indigo-600' : ''}`}
                                    onClick={() => { setShowSCDates(false); if (setScFilter) setScFilter(itemKey); }}
                                    >Last {daysName(itemKey)}
                                 </button>)}
                     </div>
                  )}
               </div>
            )}
            {isIdeas && (
               <button
               data-testid="load_ideas"
               className={'ml-2 text-blue-700 font-bold text-sm flex items-center lg:px-4 lg:py-2'}
               onClick={() => showIdeaUpdateModal && showIdeaUpdateModal()}>
                  <span
                  className='text-center leading-4 mr-2 inline-block rounded-full w-7 h-7 pt-1 bg-blue-700 text-white font-bold text-lg'>
                     <Icon type='reload' size={12} />
                  </span>
                  <i className=' not-italic hidden lg:inline-block'>Load Ideas</i>
               </button>
            )}
         </div>
      </div>
      </div>
   );
};

export default DomainHeader;
