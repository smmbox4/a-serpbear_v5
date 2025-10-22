/// <reference path="../../types.d.ts" />

import React, { useEffect } from 'react';
import toast from 'react-hot-toast';
import { useMutateKeywordsVolume, useTestAdwordsIntegration } from '../../services/adwords';
import { getClientOrigin } from '../../utils/client/origin';
import Icon from '../common/Icon';
import SecretField from '../common/SecretField';

type AdWordsSettingsProps = {
   settings: SettingsType,
   settingsError: null | {
      type: string,
      msg: string
   },
   updateSettings: Function,
   performUpdate: Function,
   closeSettings: Function
}

const AdWordsSettings = ({ settings, settingsError, updateSettings, performUpdate, closeSettings }:AdWordsSettingsProps) => {
   const {
      adwords_client_id = '',
      adwords_client_secret = '',
      adwords_developer_token = '',
      adwords_account_id = '',
      adwords_refresh_token = '',
   } = settings || {};

   const { mutate: testAdWordsIntegration, isLoading: isTesting } = useTestAdwordsIntegration();
   const { mutate: getAllVolumeData, isLoading: isUpdatingVolume } = useMutateKeywordsVolume();

   const cloudProjectIntegrated = adwords_client_id && adwords_client_secret && adwords_refresh_token;
   const hasAllCredentials = adwords_client_id && adwords_client_secret && adwords_refresh_token && adwords_developer_token && adwords_account_id;

   useEffect(() => {
      if (typeof window === 'undefined') { return undefined; }

      const expectedOrigin = getClientOrigin();

      const handleIntegrationMessage = (event: MessageEvent) => {
         if (event.origin !== expectedOrigin) { return; }
         const data = event.data as { type?: string; status?: string; message?: string };
         if (!data || data.type !== 'adwordsIntegrated') { return; }

         if (data.status === 'success') {
            toast('Google Ads has been integrated successfully!', { icon: '✔️' });
            if (performUpdate) {
               Promise.resolve(performUpdate()).catch((error) => {
                  console.error('Failed to refresh settings after Google Ads integration', error);
               });
            }
         } else {
            const detail = data.message || 'Google Ads integration failed. Please try again.';
            toast(detail, { icon: '⚠️' });
         }
      };

      window.addEventListener('message', handleIntegrationMessage);
      return () => {
         window.removeEventListener('message', handleIntegrationMessage);
      };
   }, [performUpdate]);

   // Handle URL parameters for fallback integration results
   useEffect(() => {
      if (typeof window === 'undefined') { return; }

      const urlParams = new URLSearchParams(window.location.search);
      const adsParam = urlParams.get('ads');
      const status = urlParams.get('status');
      const detail = urlParams.get('detail');

      // Only process if this is an AdWords integration redirect
      if (adsParam === 'integrated' && status) {
         if (status === 'success') {
            toast('Google Ads has been integrated successfully!', { icon: '✔️' });
            if (performUpdate) {
               Promise.resolve(performUpdate()).catch((error) => {
                  console.error('Failed to refresh settings after Google Ads integration', error);
               });
            }
         } else {
            const errorMessage = detail || 'Google Ads integration failed. Please try again.';
            toast(errorMessage, { icon: '⚠️' });
         }

         // Clean up URL parameters after processing
         const url = new URL(window.location.href);
         url.searchParams.delete('ads');
         url.searchParams.delete('status');
         url.searchParams.delete('detail');
         window.history.replaceState({}, document.title, url.toString());
      }
   }, [performUpdate]);

   const updateAndAuthenticate = async () => {
      if (adwords_client_id && adwords_client_secret) {
         if (performUpdate) {
            await performUpdate();
         }
         const origin = getClientOrigin();
         const url = `https://accounts.google.com/o/oauth2/v2/auth/oauthchooseaccount?access_type=offline&prompt=consent&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fadwords&response_type=code&client_id=${adwords_client_id}&redirect_uri=${`${encodeURIComponent(origin)}/api/adwords`}&service=lso&o2v=2&theme=glif&flowName=GeneralOAuthFlow`;
         window.open(url, '_blank');
         closeSettings();
      }
   };

   const testIntegration = () => {
      if (hasAllCredentials) {
         testAdWordsIntegration({ developer_token: adwords_developer_token, account_id: adwords_account_id });
      }
   };

   const updateVolumeData = () => {
      if (hasAllCredentials) {
         getAllVolumeData({ domain: 'all' });
      }
   };

   return (
      <div>
      <div>
         {settingsError && settingsError.type === 'adwords' && (
            <div className='mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700'>
               {settingsError.msg}
            </div>
         )}
         <div className=' border-t border-gray-100 pt-4 pb-0'>
            <h4 className=' mb-3 font-semibold text-blue-700'>Step 1: Connect Google Cloud Project</h4>
            <div className="settings__section__input mb-4 flex justify-between items-center w-full">
               <SecretField
               label='Client ID'
               onChange={(client_id:string) => updateSettings('adwords_client_id', client_id)}
               value={adwords_client_id}
               placeholder='3943006-231f65cjm.apps.googleusercontent.com'
               />
            </div>
            <div className="settings__section__input mb-4 flex justify-between items-center w-full">
               <SecretField
               label='Client Secret'
               onChange={(client_secret:string) => updateSettings('adwords_client_secret', client_secret)}
               value={adwords_client_secret}
               placeholder='GTXSPX-45asaf-u1s252sd6qdE9yc8T'
               />
            </div>
            <button
            className={`py-2 px-5 w-full text-sm font-semibold rounded  bg-indigo-50 text-blue-700 border border-indigo-100
            ${adwords_client_id && adwords_client_secret ? 'cursor-pointer' : ' cursor-not-allowed opacity-40'}
             hover:bg-blue-700 hover:text-white transition`}
            title='Insert All the data in the above fields to Authenticate'
            onClick={updateAndAuthenticate}>
               <Icon type='google' size={14} /> {adwords_refresh_token ? 'Re-Authenticate' : 'Authenticate'} Integration
            </button>
         </div>
         <div className='mt-4 border-t mb-4 border-b border-gray-100 pt-4 pb-0 relative'>
            {!cloudProjectIntegrated && <div className=' absolute w-full h-full z-50' />}
            <h4 className=' mb-3 font-semibold text-blue-700'>Step 2: Connect Google Ads</h4>
            <div className={!cloudProjectIntegrated ? 'opacity-40' : ''}>
               <div className="settings__section__input mb-4 flex justify-between items-center w-full">
                  <SecretField
                  label='Developer Token'
                  onChange={(developer_token:string) => updateSettings('adwords_developer_token', developer_token)}
                  value={adwords_developer_token}
                  placeholder='4xr6jY94kAxtXk4rfcgc4w'
                  />
               </div>
               <div className="settings__section__input mb-4 flex justify-between items-center w-full">
                  <SecretField
                  label='Test Account ID'
                  onChange={(account_id:string) => updateSettings('adwords_account_id', account_id)}
                  value={adwords_account_id}
                  placeholder='590-948-9101'
                  />
               </div>
               <div className="settings__section__input mb-4 flex justify-between items-center w-full">
                  <button
                  className={`py-2 px-5 w-full text-sm font-semibold rounded bg-indigo-50 text-blue-700 border border-indigo-100
                  ${hasAllCredentials ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}
                  hover:bg-blue-700 hover:text-white transition`}
                  title={hasAllCredentials ? '' : 'Insert All the data in the above fields to Test the Integration'}
                  onClick={testIntegration}>
                     {isTesting && <Icon type='loading' />}
                     <Icon type='adwords' size={14} /> Test Google Ads Integration
                  </button>
               </div>
            </div>
         </div>
         <div className='mt-4 mb-4 border-b border-gray-100 pt-4 pb-0 relative'>
            {!hasAllCredentials && <div className=' absolute w-full h-full z-50' />}
            <h4 className=' mb-3 font-semibold text-blue-700'>Update Keyword Volume Data</h4>
            <div className={!hasAllCredentials ? 'opacity-40' : ''}>
               <div className="settings__section__input mb-4 flex justify-between items-center w-full">
                  <p>Update Volume data for all your Tracked Keywords.</p>
               </div>
               <div className="settings__section__input mb-4 flex justify-between items-center w-full">
                  <button
                  className={`py-2 px-5 w-full text-sm font-semibold rounded bg-indigo-50 text-blue-700 border border-indigo-100
                  ${hasAllCredentials ? 'cursor-pointer' : 'cursor-not-allowed opacity-40'}
                  hover:bg-blue-700 hover:text-white transition`}
                  onClick={updateVolumeData}>
                     <Icon type={isUpdatingVolume ? 'loading' : 'reload'} size={isUpdatingVolume ? 16 : 12} /> Update Keywords Volume Data
                  </button>
               </div>
            </div>
         </div>
         <p className='mb-4 text-xs'>
            Relevant Documentation: <a target='_blank' rel='noreferrer' href='https://docs.serpbear.com/miscellaneous/integrate-google-ads' className=' underline text-blue-600'>Integrate Google Ads</a>.
         </p>
      </div>
   </div>
   );
};

export default AdWordsSettings;
