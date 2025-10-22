/// <reference path="../types.d.ts" />

import { auth, searchconsole_v1 } from '@googleapis/searchconsole';
import Cryptr from 'cryptr';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { readFile, writeFile, unlink } from 'fs/promises';
import * as path from 'path';
import { getCountryCodeFromAlphaThree } from './countries';

dayjs.extend(utc);
dayjs.extend(timezone);

const DEFAULT_CRON_TIMEZONE = 'America/New_York';

export type SCDomainFetchError = {
   error: boolean,
   errorMsg: string,
}

type SCAPISettings = { client_email: string, private_key: string }

type fetchConsoleDataResponse = SearchAnalyticsItem[] | SearchAnalyticsStat[] | SCDomainFetchError;

export const isSearchConsoleDataFreshForToday = (
   lastFetched?: string | null,
   timezoneSetting?: string,
): boolean => {
   const tz = timezoneSetting || process.env.CRON_TIMEZONE || DEFAULT_CRON_TIMEZONE;
   if (!lastFetched) return false;
   const parsedDate = dayjs(lastFetched);
   if (!parsedDate.isValid()) return false;
   const lastFetchedInTz = dayjs.tz(parsedDate.toDate(), tz);
   const nowInTz = dayjs.tz(new Date(Date.now()), tz);
   return lastFetchedInTz.isSame(nowInTz, 'day');
};

/**
 * Retrieves data from the Google Search Console API based on the provided domain name, number of days, and optional type.
 * @param {DomainType} domain - The domain for which you want to fetch search console data.
 * @param {number} days - number of days of data you want to fetch from the Search Console.
 * @param {string} [type] - (optional) specifies the type of data to fetch from the Search Console.
 * @param {SCAPISettings} [api] - (optional) specifies the Search Console API Information.
 * @returns {Promise<fetchConsoleDataResponse>}
 */
const fetchSearchConsoleData = async (domain:DomainType, days:number, type?:string, api?:SCAPISettings): Promise<fetchConsoleDataResponse> => {
   if (!domain) return { error: true, errorMsg: 'Domain Not Provided!' };
   if (!api?.private_key || !api?.client_email) {
      return { error: true, errorMsg: 'Search Console API data is not available.' };
   }
   const domainName = domain.domain;
   const defaultSCSettings = { property_type: 'domain', url: '', client_email: '', private_key: '' };
   const domainSettings = domain.search_console ? JSON.parse(domain.search_console) : defaultSCSettings;
   const sCPrivateKey = api?.private_key || process.env.SEARCH_CONSOLE_PRIVATE_KEY || '';
   const sCClientEmail = api?.client_email || process.env.SEARCH_CONSOLE_CLIENT_EMAIL || '';

   try {
   const authClient = new auth.GoogleAuth({
      credentials: {
        private_key: (sCPrivateKey).replaceAll('\\n', '\n'),
        client_email: (sCClientEmail || '').trim(),
      },
      scopes: [
        'https://www.googleapis.com/auth/webmasters.readonly',
      ],
   });
   const startDateRaw = new Date(new Date().setDate(new Date().getDate() - days));
   const padDate = (num:number) => String(num).padStart(2, '0');
   const startDate = `${startDateRaw.getFullYear()}-${padDate(startDateRaw.getMonth() + 1)}-${padDate(startDateRaw.getDate())}`;
   const endDate = `${new Date().getFullYear()}-${padDate(new Date().getMonth() + 1)}-${padDate(new Date().getDate())}`;
   const client = new searchconsole_v1.Searchconsole({ auth: authClient });
   // Params: https://developers.google.com/webmaster-tools/v1/searchanalytics/query
   let requestBody:any = {
      startDate,
      endDate,
      type: 'web',
      rowLimit: 1000,
      dataState: 'all',
      dimensions: ['query', 'device', 'country', 'page'],
   };
   if (type === 'stat') {
      requestBody = {
         startDate,
         endDate,
         dataState: 'all',
         dimensions: ['date'],
      };
   }

      const siteUrl = domainSettings.property_type === 'url' && domainSettings.url ? domainSettings.url : `sc-domain:${domainName}`;
      const res = client.searchanalytics.query({ siteUrl, requestBody });
      const resData:any = (await res).data;
      let finalRows = resData.rows ? resData.rows.map((item:SearchAnalyticsRawItem) => parseSearchConsoleItem(item, domainName)) : [];

      if (type === 'stat' && resData.rows && resData.rows.length > 0) {
         // console.log(resData.rows);
         finalRows = [];
         resData.rows.forEach((row:SearchAnalyticsRawItem) => {
            finalRows.push({
               date: row.keys[0],
               clicks: row.clicks,
               impressions: row.impressions,
               ctr: row.ctr * 100,
               position: row.position,
            });
         });
      }

      return finalRows;
   } catch (err:any) {
      const qType = type === 'stats' ? '(stats)' : `(${days}days)`;
      const errorMsg = err?.response?.status && `${err?.response?.statusText}. ${err?.response?.data?.error_description}`;
      console.log(`[ERROR] Search Console API Error for ${domainName} ${qType} : `, errorMsg || err?.code);
      // console.log('SC ERROR :', err);
      return { error: true, errorMsg: errorMsg || err?.code };
   }
};

/**
 * The function fetches search console data for a given domain and returns it in a structured format.
 * Domain level credentials take precedence over global credentials if both are provided.
 * @param {DomainType} domain - The domain for which to fetch search console data.
 * @param {SCAPISettings} [scDomainAPI] - Domain specific Search Console credentials.
 * @param {SCAPISettings} [scGlobalAPI] - Global Search Console credentials used as fallback.
 * @returns {Promise<SCDomainDataType|null>}
 */
export const fetchDomainSCData = async (
   domain:DomainType | null,
   scDomainAPI?: SCAPISettings,
   scGlobalAPI?: SCAPISettings,
): Promise<SCDomainDataType | null> => {
   if (!domain) {
      return null;
   }
   const days = [3, 7, 30];
   const domainName = domain.domain;
   const existingData = await readLocalSCData(domainName) || {
      threeDays: [], sevenDays: [], thirtyDays: [], lastFetched: '', lastFetchError: '', stats: [],
   } as SCDomainDataType;
   const scDomainData:SCDomainDataType = {
      threeDays: [],
      sevenDays: [],
      thirtyDays: [],
      lastFetched: existingData.lastFetched || '',
      lastFetchError: '',
      stats: [],
   };
   const apiCreds = (scDomainAPI?.client_email && scDomainAPI?.private_key)
      ? scDomainAPI
      : scGlobalAPI;
   if (apiCreds?.client_email && apiCreds?.private_key) {
      const theDomain = domain;
      for (const day of days) {
         const items = await fetchSearchConsoleData(theDomain, day, undefined, apiCreds);
         if (Array.isArray(items) && items.length > 0) {
            scDomainData.lastFetched = new Date().toJSON();
            if (day === 3) scDomainData.threeDays = items as SearchAnalyticsItem[];
            if (day === 7) scDomainData.sevenDays = items as SearchAnalyticsItem[];
            if (day === 30) scDomainData.thirtyDays = items as SearchAnalyticsItem[];
         } else if ((items as SCDomainFetchError)?.error) {
            scDomainData.lastFetchError = (items as SCDomainFetchError).errorMsg;
         }
      }
      const stats = await fetchSearchConsoleData(theDomain, 30, 'stat', apiCreds);
      if (Array.isArray(stats) && stats.length > 0) {
         scDomainData.stats = stats as SearchAnalyticsStat[];
      }
      const writeRes = await updateLocalSCData(domainName, scDomainData);
      if (!writeRes) {
         return null;
      }
   }
   return scDomainData;
};

/**
 * The function takes a raw search console item and a domain name as input and returns a parsed search analytics item.
 * @param {SearchAnalyticsRawItem} SCItem - The SCItem parameter is an object that represents a raw item from the Search Console API.
 * @param {string} domainName - The `domainName` parameter is a string that represents the domain name of the website.
 * @returns {SearchAnalyticsItem}.
 */
export const parseSearchConsoleItem = (SCItem: SearchAnalyticsRawItem, domainName: string): SearchAnalyticsItem => {
   const { clicks = 0, impressions = 0, ctr = 0, position = 0 } = SCItem;
   const keyword = SCItem.keys[0];
   const device = SCItem.keys[1] ? SCItem.keys[1].toLowerCase() : 'desktop';
   const country = SCItem.keys[2] ? (getCountryCodeFromAlphaThree(SCItem.keys[2].toUpperCase()) || SCItem.keys[2]) : 'ZZ';
   const rawPage = SCItem.keys[3] || '';
   const normalizedDomain = domainName.toLowerCase();
   let page = '';

   if (rawPage) {
      try {
         const url = new URL(rawPage);
         const hostLower = url.host.toLowerCase();
         const isRootDomain = hostLower === normalizedDomain || hostLower === `www.${normalizedDomain}`;
         const hostWithoutWWW = url.host.startsWith('www.') ? url.host.slice(4) : url.host;
         const suffix = `${url.pathname}${url.search}${url.hash}`;

         page = isRootDomain ? suffix : `${hostWithoutWWW}${suffix}`;
      } catch {
         const protoRegex = /^https?:\/\/(?:www\.)?/i;
         const withoutProtocol = rawPage.replace(protoRegex, '');
         const escapedDomain = normalizedDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
         const domainRegex = new RegExp(`^(?:${escapedDomain}|www\\.${escapedDomain})`, 'i');
         page = withoutProtocol.replace(domainRegex, '');
      }
   }

   if (page === '/' || page === '') {
      page = '';
   } else if (!page.startsWith('/')) {
      page = `/${page}`;
   }
   const uid = `${country.toLowerCase()}:${device}:${keyword.replaceAll(' ', '_')}`;

   return { keyword, uid, device, country, clicks, impressions, ctr: ctr * 100, position, page };
};

/**
 * The function integrates search console data with a keyword object and returns the updated keyword object with the search console data.
 * @param {KeywordType} keyword - The `keyword` parameter is of type `KeywordType`, which is a custom type representing a keyword.
 * @param {SCDomainDataType} SCData - SCData is an object that contains search analytics data for different time periods
 * @returns {KeywordType}
 */
export const integrateKeywordSCData = (keyword: KeywordType, SCData:SCDomainDataType) : KeywordType => {
   const kuid = `${keyword.country.toLowerCase()}:${keyword.device}:${keyword.keyword.replaceAll(' ', '_')}`;
   const impressions:any = { yesterday: 0, threeDays: 0, sevenDays: 0, thirtyDays: 0, avgSevenDays: 0, avgThreeDays: 0, avgThirtyDays: 0 };
   const visits :any = { yesterday: 0, threeDays: 0, sevenDays: 0, thirtyDays: 0, avgSevenDays: 0, avgThreeDays: 0, avgThirtyDays: 0 };
   const ctr:any = { yesterday: 0, threeDays: 0, sevenDays: 0, thirtyDays: 0, avgSevenDays: 0, avgThreeDays: 0, avgThirtyDays: 0 };
   const position:any = { yesterday: 0, threeDays: 0, sevenDays: 0, thirtyDays: 0, avgSevenDays: 0, avgThreeDays: 0, avgThirtyDays: 0 };

   const threeDaysData = SCData?.threeDays?.find((item:SearchAnalyticsItem) => item.uid === kuid) || {};
   const SevenDaysData = SCData?.sevenDays?.find((item:SearchAnalyticsItem) => item.uid === kuid) || {};
   const ThirdyDaysData = SCData?.thirtyDays?.find((item:SearchAnalyticsItem) => item.uid === kuid) || {};
   const totalData:any = { threeDays: threeDaysData, sevenDays: SevenDaysData, thirtyDays: ThirdyDaysData };

   Object.keys(totalData).forEach((dataKey) => {
      let avgDataKey = 'avgThreeDays'; let divideBy = 3;
      if (dataKey === 'sevenDays') { avgDataKey = 'avgSevenDays'; divideBy = 7; }
      if (dataKey === 'thirtyDays') { avgDataKey = 'avgThirtyDays'; divideBy = 30; }
      // Actual Data
      impressions[dataKey] = totalData[dataKey].impressions || 0;
      visits[dataKey] = totalData[dataKey].clicks || 0;
      ctr[dataKey] = Math.round((totalData[dataKey].ctr || 0) * 100) / 100;
      position[dataKey] = totalData[dataKey].position ? Math.round(totalData[dataKey].position) : 0;
      // Average Data
      impressions[avgDataKey] = Math.round(impressions[dataKey] / divideBy);
      ctr[avgDataKey] = Math.round((ctr[dataKey] / divideBy) * 100) / 100;
      visits[avgDataKey] = Math.round(visits[dataKey] / divideBy);
      position[avgDataKey] = Math.round(position[dataKey] / divideBy);
   });
   const finalSCData = { impressions, visits, ctr, position };

   return { ...keyword, scData: finalSCData };
};

/**
 * Retrieves the Search Console API information for a given domain.
 * @param {DomainType} domain - The `domain` parameter is of type `DomainType`, which represents a
 * domain object. It likely contains information about a specific domain, such as its name, search
 * console settings, etc.
 * @returns an object of type `SCAPISettings`.
 */
export const getSearchConsoleApiInfo = async (domain: DomainType): Promise<SCAPISettings> => {
   const scAPIData = { client_email: '', private_key: '' };
   // Check if the Domain Has the API Data
   const domainSCSettings = domain.search_console && JSON.parse(domain.search_console);
   if (domainSCSettings && domainSCSettings.private_key) {
      if (!domainSCSettings.private_key.includes('BEGIN PRIVATE KEY')) {
         const cryptr = new Cryptr(process.env.SECRET as string);
         scAPIData.client_email = domainSCSettings.client_email ? cryptr.decrypt(domainSCSettings.client_email) : '';
         scAPIData.private_key = domainSCSettings.private_key ? cryptr.decrypt(domainSCSettings.private_key) : '';
      } else {
         scAPIData.client_email = domainSCSettings.client_email;
         scAPIData.private_key = domainSCSettings.private_key;
      }
   }
   // Check if the App Settings Has the API Data
   if (!scAPIData?.private_key) {
      try {
         const settingsRaw = await readFile(`${process.cwd()}/data/settings.json`, { encoding: 'utf-8' });
         const settings: SettingsType = settingsRaw ? JSON.parse(settingsRaw) : {};
         const cryptr = new Cryptr(process.env.SECRET as string);
         scAPIData.client_email = settings.search_console_client_email ? cryptr.decrypt(settings.search_console_client_email) : '';
         scAPIData.private_key = settings.search_console_private_key ? cryptr.decrypt(settings.search_console_private_key) : '';
      } catch (error) {
         console.warn('[SEARCH_CONSOLE] Unable to read app settings for credentials:', error);
         // Settings file doesn't exist or is invalid, continue with environment variables
      }
   }
   if (!scAPIData?.private_key && process.env.SEARCH_CONSOLE_PRIVATE_KEY && process.env.SEARCH_CONSOLE_CLIENT_EMAIL) {
      scAPIData.client_email = process.env.SEARCH_CONSOLE_CLIENT_EMAIL;
      scAPIData.private_key = process.env.SEARCH_CONSOLE_PRIVATE_KEY;
   }

   return scAPIData;
};

/**
 * Checks if the provided domain level Google Search Console API info is valid.
 * @param {DomainType} domain - The domain that represents the domain for which the SC API info is being checked.
 * @returns an object of type `{ isValid: boolean, error: string }`.
 */
export const checkSearchConsoleIntegration = async (domain: DomainType): Promise<{ isValid: boolean, error: string }> => {
   const res = { isValid: false, error: '' };
   const { client_email = '', private_key = '' } = domain?.search_console ? JSON.parse(domain.search_console) : {};
   const response = await fetchSearchConsoleData(domain, 3, undefined, { client_email, private_key });
   if (Array.isArray(response)) { res.isValid = true; }
   if ((response as SCDomainFetchError)?.errorMsg) { res.error = (response as SCDomainFetchError).errorMsg; }
   return res;
};

/**
 * The function reads and returns the domain-specific data stored in a local JSON file.
 * @param {string} domain - The `domain` parameter is a string that represents the domain for which the SC data is being read.
 * @returns {Promise<SCDomainDataType>}
 */
export const readLocalSCData = async (domain:string): Promise<SCDomainDataType|false> => {
   try {
      const filePath = getSafeSCDataFilePath(domain);
      if (!filePath) throw new Error('Invalid domain for file path');
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      const currentQueueRaw = await readFile(filePath, { encoding: 'utf-8' }).catch(async () => { await updateLocalSCData(domain); return '{}'; });
      const domainSCData = JSON.parse(currentQueueRaw);
      return domainSCData;
   } catch (error) {
      console.warn('[SEARCH_CONSOLE] Failed to read local data for domain', domain, error);
      return false;
   }
};

/**
 * The function reads and returns the domain-specific data stored in a local JSON file.
 * @param {string} domain - The `domain` parameter is a string that represents the domain for which the SC data will be written.
 * @param {SCDomainDataType} scDomainData - an object that contains search analytics data for different time periods.
 * @returns {Promise<SCDomainDataType|false>}
 */
export const updateLocalSCData = async (domain:string, scDomainData?:SCDomainDataType): Promise<SCDomainDataType|false> => {
   try {
      const filePath = getSafeSCDataFilePath(domain);
      if (!filePath) throw new Error('Invalid domain for file path');
      
      const dataToWrite = scDomainData || { threeDays: [], sevenDays: [], thirtyDays: [], lastFetched: '', lastFetchError: '' };
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await writeFile(filePath, JSON.stringify(dataToWrite), { encoding: 'utf-8' }).catch((err) => { console.log(err); });
      return dataToWrite;
   } catch (error) {
      console.warn('[SEARCH_CONSOLE] Failed to write local data for domain', domain, error);
      return false;
   }
};

/**
 * The function removes the domain-specific Search Console data stored in a local JSON file.
 * @param {string} domain - The `domain` parameter is a string that represents the domain for which the SC data file will be removed.
 * @returns {Promise<boolean>} - Returns true if file was removed, else returns false.
 */
export const removeLocalSCData = async (domain:string): Promise<boolean> => {
   const filePath = getSafeSCDataFilePath(domain);
   if (!filePath) return false;
   try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      await unlink(filePath);
      return true;
   } catch (error) {
      console.warn('[SEARCH_CONSOLE] Failed to remove local data for domain', domain, error);
      return false;
   }
};

/**
 * Normalize a domain identifier that may be a slug into a real domain name.
 * - Slugs replace `.` with `-` and `-` with `_`. Detect that pattern and reverse it.
 * - Preserve hyphenated domains that already include dots.
 */
export function resolveDomainIdentifier(domain: string): string {
   const trimmed = (domain ?? '').trim();
   if (!trimmed) {
      return '';
   }
   const isSlugCandidate = !trimmed.includes('.') && /^[a-zA-Z0-9_-]+$/.test(trimmed);
   if (isSlugCandidate) {
      return trimmed.replace(/-/g, '.').replace(/_/g, '-');
   }
   return trimmed.replace(/_/g, '-');
}

/**
 * Helper to safely construct the SC data file path for a given domain.
 * Returns the absolute path if safe, or null if the domain is invalid.
 */
export function getSafeSCDataFilePath(domain: string): string | null {
   const domainName = resolveDomainIdentifier(domain);
   if (!domainName) {
      return null;
   }
   // Only allow alphanumeric, dash, dot, and underscore in domain - preserve dots for domains
   const safeDomain = domainName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
   const dataDir = path.resolve(process.cwd(), 'data');
   const fileName = `SC_${safeDomain}.json`;
   const filePath = path.resolve(dataDir, fileName);

   // Ensure the filePath is within the dataDir
   if (!filePath.startsWith(dataDir + path.sep)) {
      return null;
   }
   return filePath;
}

export default fetchSearchConsoleData;
