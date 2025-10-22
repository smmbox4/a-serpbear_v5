import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
import db from '../../database/database';
import Keyword from '../../database/models/keyword';
import verifyUser from '../../utils/verifyUser';
import parseKeywords from '../../utils/parseKeywords';
import { getKeywordsVolume, updateKeywordsVolumeData } from '../../utils/adwords';

type KeywordsRefreshRes = {
   keywords?: KeywordType[]
   volumes?: Record<number, number>,
   error?: string|null,
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
   await db.sync();
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json({ error: authorized });
   }
   if (req.method === 'POST') {
      return updatekeywordVolume(req, res);
   }
   return res.status(502).json({ error: 'Unrecognized Route.' });
}

const updatekeywordVolume = async (req: NextApiRequest, res: NextApiResponse<KeywordsRefreshRes>) => {
   const { keywords = [], domain = '', update = true } = req.body || {};
   if (keywords.length === 0 && !domain) {
      return res.status(400).json({ error: 'Please provide keyword Ids or a domain name.' });
   }

   try {
      let foundKeywords: Keyword[] = [];
      if (keywords.length > 0) {
         foundKeywords = await Keyword.findAll({ where: { ID: { [Op.in]: keywords } } });
      }
      if (domain) {
         const allDomain = domain === 'all';
         const scope = allDomain ? {} : { where: { domain } };
         foundKeywords = await Keyword.findAll(scope);
      }

      const keywordsToSend = parseKeywords(foundKeywords.map((e) => e.get({ plain: true })));

      if (keywordsToSend.length === 0) {
         return res.status(400).json({ keywords: [], error: 'Error Updating Keywords Volume data' });
      }

      const keywordsVolumeData = await getKeywordsVolume(keywordsToSend);
      if (keywordsVolumeData.error) {
         return res.status(400).json({ keywords: [], error: keywordsVolumeData.error });
      }

      if (keywordsVolumeData.volumes === false) {
         return res.status(400).json({ error: 'Error Fetching Keywords Volume Data from Google Ads' });
      }

      const volumesMap = keywordsVolumeData.volumes as Record<number, number>;

      const enrichedKeywords = keywordsToSend.map((keywordItem) => ({
         ...keywordItem,
         volume: volumesMap[keywordItem.ID] ?? keywordItem.volume ?? 0,
      }));

      if (!update) {
         return res.status(200).json({ keywords: enrichedKeywords, volumes: volumesMap });
      }

      const updated = await updateKeywordsVolumeData(volumesMap);
      if (updated) {
         return res.status(200).json({ keywords: enrichedKeywords, volumes: keywordsVolumeData.volumes });
      }

      return res.status(400).json({ keywords: [], error: 'Error Updating Keywords Volume data' });
   } catch (error) {
      console.log('[Error] updating keywords Volume Data: ', error);
      return res.status(400).json({ error: 'Error Updating Keywords Volume data' });
   }
};
