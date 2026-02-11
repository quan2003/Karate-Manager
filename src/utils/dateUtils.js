
/**
 * Format date string to DD/MM/YYYY
 * @param {string|Date} dateInput - Date string or Date object
 * @returns {string} Formatted date string DD/MM/YYYY
 */
export function formatDate(dateInput) {
  if (!dateInput) return '';
  
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  
  return `${day}/${month}/${year}`;
}

/**
 * Format date for input[type="date"] (YYYY-MM-DD)
 * @param {string|Date} dateInput - Date string or Date object
 * @returns {string} Formatted date string YYYY-MM-DD
 */
export function formatDateForInput(dateInput) {
  if (!dateInput) return '';
  
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  
  return date.toISOString().split('T')[0];
}

/**
 * Parse DD/MM/YYYY string to Date object
 * @param {string} dateStr - Date string in DD/MM/YYYY format
 * @returns {Date|null} Date object or null if invalid
 */
export function parseDateDMY(dateStr) {
  if (!dateStr) return null;
  
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  
  const date = new Date(year, month, day);
  if (isNaN(date.getTime())) return null;
  
  return date;
}

/**
 * Format datetime for display
 * @param {string|Date} dateInput - Date string or Date object  
 * @returns {string} Formatted datetime string DD/MM/YYYY HH:mm
 */
export function formatDateTime(dateInput) {
  if (!dateInput) return '';
  
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return '';
  
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}
