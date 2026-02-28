import { useState, useRef, useEffect } from "react";
import "./DateTimeInput.css";

/**
 * Custom DateTime Input component that displays DD/MM/YYYY HH:MM format
 * @param {Object} props
 * @param {string} props.value - DateTime value in YYYY-MM-DDTHH:MM format
 * @param {function} props.onChange - Callback when datetime changes, receives event-like object
 * @param {string} props.className - Additional CSS classes
 */
export default function DateTimeInput({
  value,
  onChange,
  className = "",
  ...rest
}) {
  const [displayValue, setDisplayValue] = useState("");
  const inputRef = useRef(null);
  const hiddenDateTimeRef = useRef(null);

  // Convert YYYY-MM-DDTHH:MM to DD/MM/YYYY HH:MM for display
  useEffect(() => {
    if (value) {
      // value format: "2026-02-01T12:00"
      const [datePart, timePart] = value.split("T");
      if (datePart) {
        const [year, month, day] = datePart.split("-");
        if (year && month && day) {
          const time = timePart || "00:00";
          setDisplayValue(`${day}/${month}/${year} ${time}`);
        }
      }
    } else {
      setDisplayValue("");
    }
  }, [value]);

  // Handle text input change with auto-formatting
  const handleInputChange = (e) => {
    let input = e.target.value;

    // Remove non-numeric characters except / : and space
    input = input.replace(/[^\d/:  ]/g, "");

    // Extract only digits
    const digits = input.replace(/[^\d]/g, "");
    let formatted = "";

    for (let i = 0; i < digits.length && i < 12; i++) {
      // DD/MM/YYYY HH:MM
      if (i === 2 || i === 4) {
        formatted += "/";
      } else if (i === 8) {
        formatted += " ";
      } else if (i === 10) {
        formatted += ":";
      }
      formatted += digits[i];
    }

    setDisplayValue(formatted);

    // If complete datetime (DD/MM/YYYY HH:MM = 16 chars), convert and call onChange
    if (formatted.length === 16) {
      const datePart = formatted.substring(0, 10); // DD/MM/YYYY
      const timePart = formatted.substring(11, 16); // HH:MM
      const [day, month, year] = datePart.split("/");
      const [hours, minutes] = timePart.split(":");

      const dayNum = parseInt(day, 10);
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);
      const hoursNum = parseInt(hours, 10);
      const minutesNum = parseInt(minutes, 10);

      // Basic validation
      if (
        dayNum >= 1 &&
        dayNum <= 31 &&
        monthNum >= 1 &&
        monthNum <= 12 &&
        yearNum >= 1900 &&
        yearNum <= 2100 &&
        hoursNum >= 0 &&
        hoursNum <= 23 &&
        minutesNum >= 0 &&
        minutesNum <= 59
      ) {
        const isoDateTime = `${year}-${month.padStart(2, "0")}-${day.padStart(
          2,
          "0"
        )}T${hours.padStart(2, "0")}:${minutes.padStart(2, "0")}`;
        onChange({ target: { value: isoDateTime } });
      }
    }
  };

  // Open native datetime picker
  const handleCalendarClick = () => {
    if (hiddenDateTimeRef.current) {
      hiddenDateTimeRef.current.showPicker();
    }
  };

  // Handle native datetime picker change
  const handleNativeDateTimeChange = (e) => {
    onChange(e);
  };

  return (
    <div className={`datetime-input-wrapper ${className}`}>
      <input
        ref={inputRef}
        type="text"
        className="input datetime-input-text"
        value={displayValue}
        onChange={handleInputChange}
        placeholder="DD/MM/YYYY HH:MM"
        maxLength={16}
        {...rest}
      />
      <input
        ref={hiddenDateTimeRef}
        type="datetime-local"
        className="datetime-input-hidden"
        value={value || ""}
        onChange={handleNativeDateTimeChange}
        tabIndex={-1}
      />
      <button
        type="button"
        className="datetime-input-calendar-btn"
        onClick={handleCalendarClick}
        tabIndex={-1}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </button>
    </div>
  );
}
