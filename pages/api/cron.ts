/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
import db from '../../database/database';
import Keyword from '../../database/models/keyword';
import Domain from '../../database/models/domain';
import { getAppSettings } from './settings';
import verifyUser from '../../utils/verifyUser';
import refreshAndUpdateKeywords from '../../utils/refresh';

type CRONRefreshRes = {
   started: boolean
   error?: string|null,
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
   await db.sync();
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json({ error: authorized });
   }
   if (req.method === 'POST') {
      return cronRefreshkeywords(req, res);
   }
   return res.status(502).json({ error: 'Unrecognized Route.' });
}

const cronRefreshkeywords = async (req: NextApiRequest, res: NextApiResponse<CRONRefreshRes>) => {
   try {
      const settings = await getAppSettings();
      if (!settings || (settings && settings.scraper_type === 'none')) {
         return res.status(400).json({ started: false, error: 'Scraper has not been set up yet.' });
      }
      const domainToggles = await Domain.findAll({ attributes: ['domain', 'scrapeEnabled'] });
      const enabledDomains = domainToggles
         .map((dom) => dom.get({ plain: true }))
         .filter((dom) => dom.scrapeEnabled !== false)
         .map((dom) => dom.domain);

      if (enabledDomains.length === 0) {
         return res.status(200).json({ started: false, error: 'No domains have scraping enabled.' });
      }

      await Keyword.update(
         { updating: true },
         { where: { domain: { [Op.in]: enabledDomains } } },
      );
      const keywordQueries: Keyword[] = await Keyword.findAll({ where: { domain: enabledDomains } });

      refreshAndUpdateKeywords(keywordQueries, settings);

      return res.status(200).json({ started: true });
   } catch (error) {
      // Safely log error to avoid [object Object] in logs
      const errorMessage = error instanceof Error ? error.message
         : error?.toString()
         || JSON.stringify(error, Object.getOwnPropertyNames(error))
         || 'Unknown Error';
      console.log('[ERROR] CRON Refreshing Keywords: ', errorMessage);
      return res.status(400).json({ started: false, error: 'CRON Error refreshing keywords!' });
   }
};
