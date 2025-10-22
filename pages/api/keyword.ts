/// <reference path="../../types.d.ts" />

import type { NextApiRequest, NextApiResponse } from 'next';
import db from '../../database/database';
import Keyword from '../../database/models/keyword';
import parseKeywords from '../../utils/parseKeywords';
import verifyUser from '../../utils/verifyUser';

type KeywordGetResponse = {
   keyword?: KeywordType | null
   error?: string|null,
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
   const authorized = verifyUser(req, res);
   if (authorized === 'authorized' && req.method === 'GET') {
      await db.sync();
      return getKeyword(req, res);
   }
   return res.status(401).json({ error: authorized });
}

const getKeyword = async (req: NextApiRequest, res: NextApiResponse<KeywordGetResponse>) => {
   if (!req.query.id || typeof req.query.id !== 'string') {
       return res.status(400).json({ error: 'Keyword ID is Required!' });
   }

   try {
      const idParam = req.query.id as string;
      const id = parseInt(idParam, 10);
      
      if (isNaN(id) || id <= 0) {
         return res.status(400).json({ error: 'Invalid keyword ID provided' });
      }
      
      const query = { ID: id };
      const foundKeyword:Keyword| null = await Keyword.findOne({ where: query });
      const pareseKeyword = foundKeyword && parseKeywords([foundKeyword.get({ plain: true })]);
      const keywords = pareseKeyword && pareseKeyword[0] ? pareseKeyword[0] : null;
      return res.status(200).json({ keyword: keywords });
   } catch (error) {
      console.log('[ERROR] Getting Keyword: ', error);
      return res.status(400).json({ error: 'Error Loading Keyword' });
   }
};
