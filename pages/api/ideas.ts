/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import db from '../../database/database';
import verifyUser from '../../utils/verifyUser';
import {
   KeywordIdeasDatabase, getAdwordsCredentials, getAdwordsKeywordIdeas, getLocalKeywordIdeas, updateLocalKeywordIdeas,
} from '../../utils/adwords';

type keywordsIdeasUpdateResp = {
   keywords: IdeaKeyword[],
   error?: string|null,
}

type keywordsIdeasGetResp = {
   data: KeywordIdeasDatabase|null,
   error?: string|null,
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
   await db.sync();
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json({ error: authorized });
   }
   if (req.method === 'GET') {
      return getKeywordIdeas(req, res);
   }
   if (req.method === 'POST') {
      return updateKeywordIdeas(req, res);
   }
   if (req.method === 'PUT') {
      return favoriteKeywords(req, res);
   }
   return res.status(502).json({ error: 'Unrecognized Route.' });
}

const getKeywordIdeas = async (req: NextApiRequest, res: NextApiResponse<keywordsIdeasGetResp>) => {
   try {
      const domain = req.query.domain as string;
      if (domain) {
         const keywordsDatabase = await getLocalKeywordIdeas(domain);
         // console.log('keywords :', keywordsDatabase);
         if (keywordsDatabase) {
            return res.status(200).json({ data: keywordsDatabase });
         }
      }
      return res.status(400).json({ data: null, error: 'Error Loading Keyword Ideas.' });
   } catch (error) {
      console.log('[ERROR] Fetching Keyword Ideas: ', error);
      return res.status(400).json({ data: null, error: 'Error Loading Keyword Ideas.' });
   }
};

const updateKeywordIdeas = async (req: NextApiRequest, res: NextApiResponse<keywordsIdeasUpdateResp>) => {
   const errMsg = 'Error Fetching Keywords. Please try again!';
   const {
      keywords = [],
      country = 'US',
      language = '1000',
      domainUrl = '',
      domainSlug = '',
      seedSCKeywords = false,
      seedCurrentKeywords = false,
      seedType,
   } = req.body;

   if (!country || !language) {
      return res.status(400).json({ keywords: [], error: 'Please provide both country and language' });
   }
   if (!domainSlug) {
      return res.status(400).json({ keywords: [], error: 'Missing domainSlug' });
   }
   if (seedType === 'auto' && !domainUrl) {
      return res.status(400).json({ keywords: [], error: 'Missing domainUrl' });
   }
   if (!seedType) {
      return res.status(400).json({ keywords: [], error: 'Missing seedType' });
   }
   const validSeedTypes = ['auto', 'custom', 'tracking', 'searchconsole'];
   if (!validSeedTypes.includes(seedType)) {
      return res.status(400).json({ keywords: [], error: 'Invalid seedType' });
   }
   if (seedType === 'custom' && (keywords.length === 0 && !seedSCKeywords && !seedCurrentKeywords)) {
      return res.status(400).json({ keywords: [], error: 'Error Fetching Keywords. Please Provide one of these: keywords, url or domainSlug' });
   }
   try {
      const adwordsCreds = await getAdwordsCredentials();
      const { client_id, client_secret, developer_token, account_id, refresh_token } = adwordsCreds || {};
      if (!adwordsCreds || !client_id || !client_secret || !developer_token || !account_id || !refresh_token) {
         return res.status(500).json({ keywords: [], error: 'Google Ads credentials not configured' });
      }
      const ideaOptions = { country, language, keywords, domainUrl, domainSlug, seedSCKeywords, seedCurrentKeywords, seedType };
      try {
         const keywordIdeas = await getAdwordsKeywordIdeas(adwordsCreds, ideaOptions);
         if (keywordIdeas && Array.isArray(keywordIdeas) && keywordIdeas.length > 0) {
            return res.status(200).json({ keywords: keywordIdeas });
         }
         // Surface empty result sets as a not-found condition so the client can warn the user appropriately
         return res.status(404).json({ keywords: [], error: 'No keywords found over the search volume minimum.' });
      } catch (error: any) {
         console.log('[ERROR] Fetching Keyword Ideas: ', error);
         const message = error?.message || errMsg;
         return res.status(400).json({ keywords: [], error: message });
      }
   } catch (error) {
      console.log('[ERROR] Fetching Keyword Ideas: ', error);
      return res.status(400).json({ keywords: [], error: errMsg });
   }
};

const favoriteKeywords = async (req: NextApiRequest, res: NextApiResponse<keywordsIdeasUpdateResp>) => {
   const errMsg = 'Error Favorating Keyword Idea. Please try again!';
   const { keywordID = '', domain = '' } = req.body;

   if (!keywordID || !domain) {
      return res.status(400).json({ keywords: [], error: 'Missing Necessary data. Please provide both keywordID and domain values.' });
   }

   try {
      const keywordsDatabase = await getLocalKeywordIdeas(domain);
      if (keywordsDatabase && keywordsDatabase.keywords) {
         const theKeyword = keywordsDatabase.keywords.find((kw) => kw.uid === keywordID);
         const existingKeywords = keywordsDatabase.favorites || [];
         const newFavorites = [...existingKeywords];
         const existingKeywordIndex = newFavorites.findIndex((kw) => kw.uid === keywordID);
         if (existingKeywordIndex > -1) {
            newFavorites.splice(existingKeywordIndex, 1);
         } else if (theKeyword) newFavorites.push(theKeyword);

         const updated = await updateLocalKeywordIdeas(domain, { favorites: newFavorites });

         if (updated) {
            return res.status(200).json({ keywords: newFavorites, error: '' });
         }
      }

      return res.status(400).json({ keywords: [], error: errMsg });
   } catch (error) {
      console.log('[ERROR] Favorating Keyword Idea: ', error);
      return res.status(400).json({ keywords: [], error: errMsg });
   }
};
