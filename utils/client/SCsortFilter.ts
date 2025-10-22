/**
 * Sort Keywords by user's given input.
 * @param {SCKeywordType[]} theKeywords - The Keywords to sort.
 * @param {string} sortBy - The sort method.
 * @returns {SCKeywordType[]}
 */
export const SCsortKeywords = (theKeywords:SCKeywordType[], sortBy:string) : SCKeywordType[] => {
   const keywordsWithFallback = theKeywords.map((k) => ({ ...k, position: k.position === 0 ? 111 : k.position }));
   const baseKeywords = [...theKeywords];
   let sortedItems: SCKeywordType[] = [];
   switch (sortBy) {
      case 'imp_asc':
            sortedItems = baseKeywords.sort((a: SCKeywordType, b: SCKeywordType) => (a.impressions ?? 0) - (b.impressions ?? 0));
            break;
      case 'imp_desc':
            sortedItems = baseKeywords.sort((a: SCKeywordType, b: SCKeywordType) => (b.impressions ?? 0) - (a.impressions ?? 0));
            break;
      case 'visits_asc':
            sortedItems = baseKeywords.sort((a: SCKeywordType, b: SCKeywordType) => (a.clicks ?? 0) - (b.clicks ?? 0));
            break;
      case 'visits_desc':
            sortedItems = baseKeywords.sort((a: SCKeywordType, b: SCKeywordType) => (b.clicks ?? 0) - (a.clicks ?? 0));
            break;
       case 'ctr_asc':
            sortedItems = baseKeywords.sort((a: SCKeywordType, b: SCKeywordType) => (a.ctr ?? 0) - (b.ctr ?? 0));
            break;
      case 'ctr_desc':
            sortedItems = baseKeywords.sort((a: SCKeywordType, b: SCKeywordType) => (b.ctr ?? 0) - (a.ctr ?? 0));
            break;
      case 'pos_asc':
            sortedItems = keywordsWithFallback
               .slice()
               .sort((a: SCKeywordType, b: SCKeywordType) => (a.position > b.position ? 1 : (a.position < b.position ? -1 : 0)));
            sortedItems = sortedItems.map((k) => ({ ...k, position: k.position === 111 ? 0 : k.position }));
            break;
      case 'pos_desc':
            sortedItems = keywordsWithFallback
               .slice()
               .sort((a: SCKeywordType, b: SCKeywordType) => (b.position > a.position ? 1 : (b.position < a.position ? -1 : 0)));
            sortedItems = sortedItems.map((k) => ({ ...k, position: k.position === 111 ? 0 : k.position }));
            break;
      case 'alpha_desc':
            sortedItems = baseKeywords.sort((a: SCKeywordType, b: SCKeywordType) => b.keyword.localeCompare(a.keyword));
            break;
      case 'alpha_asc':
            sortedItems = baseKeywords.sort((a: SCKeywordType, b: SCKeywordType) => a.keyword.localeCompare(b.keyword));
         break;
      default:
            return theKeywords;
   }

   return [...sortedItems];
};

/**
 * Filters the Keywords by Device when the Device buttons are switched
 * @param {SCKeywordType[]} sortedKeywords - The Sorted Keywords.
 * @param {string} device - Device name (desktop or mobile).
 * @returns {{desktop: SCKeywordType[], mobile: SCKeywordType[] } }
 */
export const SCkeywordsByDevice = (sortedKeywords: SCKeywordType[], device: string): {[key: string]: SCKeywordType[] } => {
   const deviceKeywords: {[key:string] : SCKeywordType[]} = { desktop: [], mobile: [] };
   sortedKeywords.forEach((keyword) => {
      if (keyword.device === device) { deviceKeywords[device].push(keyword); }
   });
   return deviceKeywords;
};

/**
 * Filters the keywords by country, search string or tags.
 * @param {SCKeywordType[]} keywords - The keywords.
 * @param {KeywordFilters} filterParams - The user Selected filter object.
 * @returns {SCKeywordType[]}
 */
export const SCfilterKeywords = (keywords: SCKeywordType[], filterParams: KeywordFilters):SCKeywordType[] => {
   const filteredItems:SCKeywordType[] = [];
   keywords.forEach((keywrd) => {
       const countryMatch = filterParams.countries.length === 0 ? true : filterParams.countries && filterParams.countries.includes(keywrd.country);
       const searchMatch = !filterParams.search ? true : filterParams.search && keywrd.keyword.includes(filterParams.search);

       if (countryMatch && searchMatch) {
          filteredItems.push(keywrd);
       }
   });

   return filteredItems;
};
