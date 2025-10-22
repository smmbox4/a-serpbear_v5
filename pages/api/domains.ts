/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import Cryptr from 'cryptr';
import db from '../../database/database';
import Domain from '../../database/models/domain';
import Keyword from '../../database/models/keyword';
import getdomainStats from '../../utils/domains';
import verifyUser from '../../utils/verifyUser';
import { checkSearchConsoleIntegration, removeLocalSCData } from '../../utils/searchConsole';
import { withApiLogging } from '../../utils/apiLogging';
import { logger } from '../../utils/logger';
import { validateHostname } from '../../utils/validators/hostname';
import {
   buildPersistedScraperSettings,
   maskDomainScraperSettings,
   parseDomainScraperSettings,
} from '../../utils/domainScraperSettings';

type DomainsGetRes = {
   domains: DomainType[]
   error?: string|null,
}

type DomainsAddResponse = {
   domains: DomainType[]|null,
   error?: string|null,
}

type DomainsDeleteRes = {
   domainRemoved: number,
   keywordsRemoved: number,
   SCDataRemoved: boolean,
   error?: string|null,
}

type DomainsUpdateRes = {
   domain: Domain|null,
   error?: string|null,
}

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
   await db.sync();
   
   // Check authentication for all requests now - changed from previous behavior
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json({ error: authorized });
   }
   
   if (req.method === 'GET') {
      return getDomains(req, res);
   }
   if (req.method === 'POST') {
      return addDomain(req, res);
   }
   if (req.method === 'DELETE') {
      return deleteDomain(req, res);
   }
   if (req.method === 'PUT') {
      return updateDomain(req, res);
   }
   return res.status(405).json({ error: 'Method not allowed' });
};

export const getDomains = async (req: NextApiRequest, res: NextApiResponse<DomainsGetRes>) => {
   const withStats = !!req?.query?.withstats;
   
   try {
      
      const allDomains: Domain[] = await Domain.findAll();
      const formattedDomains: DomainType[] = allDomains.map((el) => {
         const domainPlain = el.get({ plain: true }) as any;
         const scData = domainPlain?.search_console ? JSON.parse(domainPlain.search_console) : {};
         const { client_email, private_key } = scData || {};
         const searchConsoleData = scData
            ? {
               ...scData,
               client_email: client_email ? 'true' : '',
               private_key: private_key ? 'true' : '',
            }
            : {};
         const persistedScraperSettings = parseDomainScraperSettings(domainPlain?.scraper_settings);
         return {
            ...domainPlain,
            search_console: JSON.stringify(searchConsoleData),
            scraper_settings: maskDomainScraperSettings(persistedScraperSettings),
         } as DomainType;
      });
      const theDomains: DomainType[] = withStats ? await getdomainStats(formattedDomains) : formattedDomains;
      return res.status(200).json({ domains: theDomains });
   } catch (error) {
      console.error('[ERROR] Getting Domains.', error);
      return res.status(400).json({ domains: [], error: 'Error Getting Domains.' });
   }
};

const addDomain = async (req: NextApiRequest, res: NextApiResponse<DomainsAddResponse>) => {
   const { domains } = req.body;
   if (domains && Array.isArray(domains) && domains.length > 0) {
      const invalidDomains: string[] = [];
      const uniqueHosts = new Map<string, string>();

      domains.forEach((domain: string) => {
         const validation = validateHostname(domain);
         if (!validation.isValid) {
            invalidDomains.push(typeof domain === 'string' ? domain : '');
            return;
         }

         if (!uniqueHosts.has(validation.hostname)) {
            uniqueHosts.set(validation.hostname, validation.hostname);
         }
      });

      if (invalidDomains.length > 0) {
         const formatted = invalidDomains.filter(Boolean).join(', ') || 'blank domain';
         return res.status(400).json({ domains: [], error: `Invalid domain(s): ${formatted}` });
      }

      const now = new Date().toJSON();
      const domainsToAdd: any = Array.from(uniqueHosts.values()).map((hostname) => ({
         domain: hostname,
         slug: hostname.replaceAll('-', '_').replaceAll('.', '-').replaceAll('/', '-'),
         lastUpdated: now,
         added: now,
         scrapeEnabled: true,
         notification: true,
      }));

      if (domainsToAdd.length === 0) {
         return res.status(400).json({ domains: [], error: 'No valid domains provided.' });
      }

      try {
         const newDomains:Domain[] = await Domain.bulkCreate(domainsToAdd);
         const formattedDomains = newDomains.map((el) => el.get({ plain: true }));
         return res.status(201).json({ domains: formattedDomains });
      } catch (error) {
         console.log('[ERROR] Adding New Domain ', error);
         return res.status(400).json({ domains: [], error: 'Error Adding Domain.' });
      }
   } else {
      return res.status(400).json({ domains: [], error: 'Necessary data missing.' });
   }
};

export const deleteDomain = async (req: NextApiRequest, res: NextApiResponse<DomainsDeleteRes>) => {
   if (!req.query.domain || typeof req.query.domain !== 'string') {
      return res.status(400).json({ domainRemoved: 0, keywordsRemoved: 0, SCDataRemoved: false, error: 'Domain is Required!' });
   }
   try {
      const { domain } = req.query || {};
      const removedDomCount: number = await Domain.destroy({ where: { domain } });
      if (removedDomCount === 0) {
         return res.status(404).json({ domainRemoved: 0, keywordsRemoved: 0, SCDataRemoved: false, error: 'Domain not found' });
      }
      const removedKeywordCount: number = await Keyword.destroy({ where: { domain } });
      const SCDataRemoved = await removeLocalSCData(domain as string);
      return res.status(200).json({ domainRemoved: removedDomCount, keywordsRemoved: removedKeywordCount, SCDataRemoved });
   } catch (error) {
      console.log('[ERROR] Deleting Domain: ', req.query.domain, error);
      return res.status(400).json({ domainRemoved: 0, keywordsRemoved: 0, SCDataRemoved: false, error: 'Error Deleting Domain' });
   }
};

export const updateDomain = async (req: NextApiRequest, res: NextApiResponse<DomainsUpdateRes>) => {
   if (!req.query.domain || typeof req.query.domain !== 'string') {
      return res.status(400).json({ domain: null, error: 'Domain is Required!' });
   }
   const { domain } = req.query || {};
   const payload = req.body as Partial<DomainSettings>;
   const {
      notification_interval,
      notification_emails,
      search_console,
      scrapeEnabled,
      scraper_settings,
   } = payload;

   try {
      const domainToUpdate: Domain|null = await Domain.findOne({ where: { domain } });

      if (!domainToUpdate) {
         return res.status(404).json({ domain: null, error: 'Domain not found' });
      }

      const domainPlain = domainToUpdate.get({ plain: true });

      // Validate Search Console API Data
      if (search_console?.client_email && search_console?.private_key) {
         const isSearchConsoleAPIValid = await checkSearchConsoleIntegration({ ...domainPlain, search_console: JSON.stringify(search_console) });
         if (!isSearchConsoleAPIValid.isValid) {
            return res.status(400).json({ domain: null, error: isSearchConsoleAPIValid.error });
         }
         const cryptr = new Cryptr(process.env.SECRET as string);
         search_console.client_email = search_console.client_email ? cryptr.encrypt(search_console.client_email.trim()) : '';
         search_console.private_key = search_console.private_key ? cryptr.encrypt(search_console.private_key.trim()) : '';
      }

      const updates: Partial<Domain> = {};
      if (typeof notification_interval === 'string') { updates.notification_interval = notification_interval; }
      if (typeof notification_emails === 'string') { updates.notification_emails = notification_emails; }
      if (typeof scrapeEnabled === 'boolean') {
         updates.scrapeEnabled = scrapeEnabled;
         // Update the legacy notification field to match scrapeEnabled
         updates.notification = scrapeEnabled;
      }
      if (search_console) {
         updates.search_console = JSON.stringify(search_console);
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'scraper_settings')) {
         const existingScraperSettings = parseDomainScraperSettings(domainPlain?.scraper_settings);
         const cryptr = new Cryptr(process.env.SECRET as string);
         const persistedOverride = buildPersistedScraperSettings(scraper_settings ?? null, existingScraperSettings, cryptr);
         updates.scraper_settings = persistedOverride ? JSON.stringify(persistedOverride) : null;
      }
      domainToUpdate.set(updates);
      await domainToUpdate.save();

      return res.status(200).json({ domain: domainToUpdate });
   } catch (error) {
      console.log('[ERROR] Updating Domain: ', req.query.domain, error);
      return res.status(400).json({ domain: null, error: 'Error Updating Domain. An Unknown Error Occurred.' });
   }
};

export default withApiLogging(handler, {
   name: 'domains',
   logBody: false,
   // Propagate the shared success logging toggle for clarity
   logSuccess: logger.isSuccessLoggingEnabled()
});
