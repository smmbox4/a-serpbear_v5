/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import { Op } from 'sequelize';
import db from '../../database/database';
import Keyword from '../../database/models/keyword';
import { getAppSettings } from './settings';
import verifyUser from '../../utils/verifyUser';
import parseKeywords from '../../utils/parseKeywords';
import { integrateKeywordSCData, readLocalSCData } from '../../utils/searchConsole';
import refreshAndUpdateKeywords from '../../utils/refresh';
import { getKeywordsVolume, updateKeywordsVolumeData } from '../../utils/adwords';
import { formatLocation, hasValidCityStatePair, parseLocation } from '../../utils/location';

type KeywordsGetResponse = {
   keywords?: KeywordType[],
   error?: string|null,
   details?: string,
}

type KeywordsDeleteRes = {
   domainRemoved?: number,
   keywordsRemoved?: number,
   error?: string|null,
   details?: string,
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
   await db.sync();
   const authorized = verifyUser(req, res);
   if (authorized !== 'authorized') {
      return res.status(401).json({ error: authorized });
   }

   if (req.method === 'GET') {
      return getKeywords(req, res);
   }
   if (req.method === 'POST') {
      return addKeywords(req, res);
   }
   if (req.method === 'DELETE') {
      return deleteKeywords(req, res);
   }
   if (req.method === 'PUT') {
      return updateKeywords(req, res);
   }
   return res.status(502).json({ error: 'Unrecognized Route.' });
}

const getKeywords = async (req: NextApiRequest, res: NextApiResponse<KeywordsGetResponse>) => {
   if (!req.query.domain || typeof req.query.domain !== 'string') {
      return res.status(400).json({ error: 'Domain is Required!' });
   }
   const domain = (req.query.domain as string);

   try {
      const settings = await getAppSettings();
      const integratedSC = process.env.SEARCH_CONSOLE_PRIVATE_KEY && process.env.SEARCH_CONSOLE_CLIENT_EMAIL;
      const { search_console_client_email, search_console_private_key } = settings;
      const domainSCData = integratedSC || (search_console_client_email && search_console_private_key)
         ? await readLocalSCData(domain)
         : false;

      const allKeywords:Keyword[] = await Keyword.findAll({ where: { domain } });
      const keywords: KeywordType[] = parseKeywords(allKeywords.map((e) => e.get({ plain: true })));
      const processedKeywords = keywords.map((keyword) => {
         const historyArray = Object.keys(keyword.history).map((dateKey:string) => ({
            date: new Date(dateKey).getTime(),
            dateRaw: dateKey,
            position: keyword.history[dateKey],
         }));
         const historySorted = historyArray.sort((a, b) => a.date - b.date);
         const lastWeekHistory :KeywordHistory = {};
         historySorted.slice(-7).forEach((x:any) => { lastWeekHistory[x.dateRaw] = x.position; });
         const keywordWithSlimHistory = { ...keyword, lastResult: [], history: lastWeekHistory };
         const finalKeyword = domainSCData ? integrateKeywordSCData(keywordWithSlimHistory, domainSCData) : keywordWithSlimHistory;
         return finalKeyword;
      });
      return res.status(200).json({ keywords: processedKeywords });
   } catch (error) {
      console.log('[ERROR] Getting Domain Keywords for ', domain, error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ error: 'Failed to load keywords for this domain.', details: message });
   }
};

/**
 * Validates and sanitizes keyword input data
 */
const validateKeywordData = (kwrd: any): { isValid: boolean, sanitized?: any, errors?: string[] } => {
   const errors: string[] = [];
   
   // Required fields validation
   if (!kwrd.keyword || typeof kwrd.keyword !== 'string') {
      errors.push('Keyword is required and must be a string');
   }
   if (!kwrd.domain || typeof kwrd.domain !== 'string') {
      errors.push('Domain is required and must be a string');
   }
   
   // Sanitize and validate keyword
   const keyword = typeof kwrd.keyword === 'string' ? kwrd.keyword.trim().substring(0, 200) : '';
   if (keyword.length === 0) {
      errors.push('Keyword cannot be empty');
   }
   
   // Validate domain format (basic validation)
   const domain = typeof kwrd.domain === 'string' ? kwrd.domain.trim().toLowerCase().substring(0, 100) : '';
   const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/i;
   if (domain.length === 0 || !domainRegex.test(domain)) {
      errors.push('Invalid domain format');
   }
   
   // Validate device
   const validDevices = ['desktop', 'mobile'];
   const device = validDevices.includes(kwrd.device) ? kwrd.device : 'desktop';
   
   // Validate country code (basic validation)
   const country = typeof kwrd.country === 'string' && /^[A-Z]{2}$/.test(kwrd.country) ? kwrd.country : 'US';
   
   // Sanitize optional fields
   const rawLocation = typeof kwrd.location === 'string' ? kwrd.location.trim().substring(0, 255) : '';
   const city = typeof kwrd.city === 'string' ? kwrd.city.trim().substring(0, 100) : '';
   const state = typeof kwrd.state === 'string' ? kwrd.state.trim().substring(0, 100) : '';
   const tags = typeof kwrd.tags === 'string' ? kwrd.tags.trim().substring(0, 500) : '';

   if (!hasValidCityStatePair(city, state)) {
      errors.push('City and state must be provided together when provided');
   }

   const parsedLocation = parseLocation(rawLocation, country);
   const location = formatLocation({
      city: city || parsedLocation.city,
      state: state || parsedLocation.state,
      country: parsedLocation.country || country,
   }).substring(0, 255);
   
   if (errors.length > 0) {
      return { isValid: false, errors };
   }
   
   return {
      isValid: true,
      sanitized: {
         keyword,
         domain,
         device,
         country,
         location,
         tags
      }
   };
};

const addKeywords = async (req: NextApiRequest, res: NextApiResponse<KeywordsGetResponse>) => {
   const { keywords } = req.body;
   
   // Enhanced input validation
   if (!keywords) {
      return res.status(400).json({ error: 'Keywords array is required', details: 'Request body must contain a keywords array' });
   }
   
   if (!Array.isArray(keywords)) {
      return res.status(400).json({ error: 'Keywords must be an array', details: 'The keywords field must be an array of keyword objects' });
   }
   
   if (keywords.length === 0) {
      return res.status(400).json({ error: 'At least one keyword is required', details: 'Keywords array cannot be empty' });
   }
   
   if (keywords.length > 100) {
      return res.status(400).json({ error: 'Too many keywords', details: 'Maximum 100 keywords can be added at once' });
   }

   const keywordsToAdd: any = []; // QuickFIX for bug: https://github.com/sequelize/sequelize-typescript/issues/936
   const validationErrors: string[] = [];

   keywords.forEach((kwrd: KeywordAddPayload, index: number) => {
      const validation = validateKeywordData(kwrd);
      
      if (!validation.isValid) {
         validationErrors.push(`Keyword ${index + 1}: ${validation.errors?.join(', ')}`);
         return;
      }
      
      const { keyword, domain, device, country, location, tags } = validation.sanitized!;
      const tagsArray = tags ? tags.split(',').map((item:string) => item.trim()).filter((tag: string) => tag.length > 0) : [];
      const dedupedTags: string[] = [];
      const seenTags = new Set<string>();
      tagsArray.forEach((tag: string) => {
         const normalized = tag.toLowerCase();
         if (!seenTags.has(normalized)) {
            seenTags.add(normalized);
            dedupedTags.push(tag);
         }
      });

      const newKeyword = {
         keyword,
         device,
         domain,
         country,
         location,
         position: 0,
         updating: true,
         history: JSON.stringify({}),
         lastResult: JSON.stringify([]),
         url: '',
         tags: JSON.stringify(dedupedTags.slice(0, 10)), // Limit to 10 tags
         sticky: false,
         lastUpdated: new Date().toJSON(),
         added: new Date().toJSON(),
         mapPackTop3: false,
      };
      keywordsToAdd.push(newKeyword);
   });
   
   if (validationErrors.length > 0) {
      return res.status(400).json({ 
         error: 'Validation failed', 
         details: validationErrors.join('; ')
      });
   }
   
   if (keywordsToAdd.length === 0) {
      return res.status(400).json({ error: 'No valid keywords to add', details: 'All provided keywords failed validation' });
   }

   try {
      const newKeywords:Keyword[] = await Keyword.bulkCreate(keywordsToAdd);
      const formattedkeywords = newKeywords.map((el) => el.get({ plain: true }));
      const keywordsParsed: KeywordType[] = parseKeywords(formattedkeywords);

      // Queue the SERP Scraping Process
      const settings = await getAppSettings();
      refreshAndUpdateKeywords(newKeywords, settings);

      // Update the Keyword Volume
      const { adwords_account_id, adwords_client_id, adwords_client_secret, adwords_developer_token } = settings;
      if (adwords_account_id && adwords_client_id && adwords_client_secret && adwords_developer_token) {
         const keywordsVolumeData = await getKeywordsVolume(keywordsParsed);
         if (keywordsVolumeData.volumes !== false) {
            await updateKeywordsVolumeData(keywordsVolumeData.volumes);
         }
      }

      return res.status(201).json({ keywords: keywordsParsed });
   } catch (error) {
      console.log('[ERROR] Adding New Keywords ', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ error: 'Failed to add keywords.', details: message });
   }
};

const deleteKeywords = async (req: NextApiRequest, res: NextApiResponse<KeywordsDeleteRes>) => {
   if (!req.query.id || typeof req.query.id !== 'string') {
      return res.status(400).json({ error: 'keyword ID is Required!' });
   }
   console.log('req.query.id: ', req.query.id);

   try {
      const keywordsToRemove = (req.query.id as string).split(',').map((item) => {
         const id = parseInt(item, 10);
         return isNaN(id) ? 0 : id;
      }).filter(id => id > 0);
      
      if (keywordsToRemove.length === 0) {
         return res.status(400).json({ error: 'No valid keyword IDs provided' });
      }
      
      const removeQuery = { where: { ID: { [Op.in]: keywordsToRemove } } };
      const removedKeywordCount: number = await Keyword.destroy(removeQuery);
      return res.status(200).json({ keywordsRemoved: removedKeywordCount });
   } catch (error) {
      console.log('[ERROR] Removing Keyword. ', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ error: 'Failed to remove keywords.', details: message });
   }
};

const updateKeywords = async (req: NextApiRequest, res: NextApiResponse<KeywordsGetResponse>) => {
   if (!req.query.id || typeof req.query.id !== 'string') {
      return res.status(400).json({ error: 'keyword ID is Required!' });
   }
   if (req.body.sticky === undefined && req.body.tags === undefined) {
      return res.status(400).json({ error: 'Keyword update payload is required.' });
   }
   const keywordIDs = (req.query.id as string).split(',').map((item) => parseInt(item, 10));
   const { sticky, tags } = req.body;

   try {
      let keywords: KeywordType[] = [];
      if (sticky !== undefined) {
         await Keyword.update({ sticky }, { where: { ID: { [Op.in]: keywordIDs } } });
         const updateQuery = { where: { ID: { [Op.in]: keywordIDs } } };
         const updatedKeywords:Keyword[] = await Keyword.findAll(updateQuery);
         const formattedKeywords = updatedKeywords.map((el) => el.get({ plain: true }));
         keywords = parseKeywords(formattedKeywords);
         return res.status(200).json({ keywords });
      }
      if (tags !== undefined) {
         if (!tags || typeof tags !== 'object' || Array.isArray(tags)) {
            return res.status(400).json({ error: 'Invalid Payload!' });
         }

         const tagsKeywordIDs = Object.keys(tags);
         if (tagsKeywordIDs.length === 0) {
            return res.status(200).json({ keywords: [] });
         }

         const multipleKeywords = tagsKeywordIDs.length > 1;
         const updatedKeywordIDs = new Set<number>();

         for (const keywordID of tagsKeywordIDs) {
            const numericId = Number(keywordID);
            if (!Number.isFinite(numericId)) {
               continue;
            }

            const tagsForKeywordRaw = tags[keywordID];
            const tagsForKeyword = Array.isArray(tagsForKeywordRaw)
               ? tagsForKeywordRaw
               : [];
            const sanitizedTags = tagsForKeyword
               .filter((tag): tag is string => typeof tag === 'string')
               .map((tag) => tag.trim())
               .filter((tag) => tag.length > 0);

            const selectedKeyword = await Keyword.findOne({ where: { ID: numericId } });
            const currentTags = selectedKeyword && selectedKeyword.tags ? JSON.parse(selectedKeyword.tags) : [];
            const mergedTags = Array.from(new Set([...currentTags, ...sanitizedTags])).sort();

            if (selectedKeyword) {
               const tagsToSave = multipleKeywords ? mergedTags : sanitizedTags.sort();
               await selectedKeyword.update({ tags: JSON.stringify(tagsToSave) });
               updatedKeywordIDs.add(numericId);
            }
         }

         if (updatedKeywordIDs.size > 0) {
            const updatedKeywords:Keyword[] = await Keyword.findAll({ where: { ID: { [Op.in]: Array.from(updatedKeywordIDs) } } });
            const formattedKeywords = updatedKeywords.map((el) => el.get({ plain: true }));
            keywords = parseKeywords(formattedKeywords);
         }

         return res.status(200).json({ keywords });
      }
      return res.status(400).json({ error: 'Invalid Payload!' });
   } catch (error) {
      console.log('[ERROR] Updating Keyword. ', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      return res.status(500).json({ error: 'Failed to update keywords.', details: message });
   }
};
