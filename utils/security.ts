/**
 * Shared input hygiene helpers used throughout the application.
 */
export const safeTrim = (value: any): string => {
   if (typeof value === 'string') {
      return value.trim();
   }
   if (value === null || value === undefined) {
      return '';
   }
   return String(value).trim();
};

/**
 * Checks if a trimmed value has non-zero length.
 * Handles both string and non-string values safely.
 */
export const hasTrimmedLength = (value: any): boolean => safeTrim(value).length > 0;

/**
 * Trims all string properties in an object.
 */
export const trimStringProperties = <T extends Record<string, unknown>>(obj: T): T => {
   const result = { ...obj };

   Object.entries(result).forEach(([key, value]) => {
      if (typeof value === 'string') {
         (result as Record<string, unknown>)[key] = value.trim();
      }
   });

   return result;
};
