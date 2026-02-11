import { useState, useRef, useEffect } from 'react';
import './DateInput.css';

/**
 * Custom Date Input component that displays DD/MM/YYYY format
 * @param {Object} props
 * @param {string} props.value - Date value in YYYY-MM-DD format
 * @param {function} props.onChange - Callback when date changes, receives YYYY-MM-DD format
 * @param {string} props.className - Additional CSS classes
 */
export default function DateInput({ value, onChange, className = '', ...rest }) {
  const [displayValue, setDisplayValue] = useState('');
  const inputRef = useRef(null);
  const hiddenDateRef = useRef(null);

  // Convert YYYY-MM-DD to DD/MM/YYYY for display
  useEffect(() => {
    if (value) {
      const [year, month, day] = value.split('-');
      if (year && month && day) {
        setDisplayValue(`${day}/${month}/${year}`);
      }
    } else {
      setDisplayValue('');
    }
  }, [value]);

  // Handle text input change with auto-formatting
  const handleInputChange = (e) => {
    let input = e.target.value;
    
    // Remove non-numeric characters except /
    input = input.replace(/[^\d/]/g, '');
    
    // Auto-add slashes
    const digits = input.replace(/\//g, '');
    let formatted = '';
    
    for (let i = 0; i < digits.length && i < 8; i++) {
      if (i === 2 || i === 4) {
        formatted += '/';
      }
      formatted += digits[i];
    }
    
    setDisplayValue(formatted);
    
    // If complete date (DD/MM/YYYY), convert to YYYY-MM-DD and call onChange
    if (formatted.length === 10) {
      const [day, month, year] = formatted.split('/');
      const dayNum = parseInt(day, 10);
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);
      
      // Basic validation
      if (dayNum >= 1 && dayNum <= 31 && monthNum >= 1 && monthNum <= 12 && yearNum >= 1900 && yearNum <= 2100) {
        const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        onChange({ target: { value: isoDate } });
      }
    }
  };

  // Open native date picker
  const handleCalendarClick = () => {
    if (hiddenDateRef.current) {
      hiddenDateRef.current.showPicker();
    }
  };

  // Handle native date picker change
  const handleNativeDateChange = (e) => {
    onChange(e);
  };

  return (
    <div className={`date-input-wrapper ${className}`}>
      <input
        ref={inputRef}
        type="text"
        className="input date-input-text"
        value={displayValue}
        onChange={handleInputChange}
        placeholder="DD/MM/YYYY"
        maxLength={10}
        {...rest}
      />
      <input
        ref={hiddenDateRef}
        type="date"
        className="date-input-hidden"
        value={value || ''}
        onChange={handleNativeDateChange}
        tabIndex={-1}
      />
      <button 
        type="button" 
        className="date-input-calendar-btn"
        onClick={handleCalendarClick}
        tabIndex={-1}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </button>
    </div>
  );
}
