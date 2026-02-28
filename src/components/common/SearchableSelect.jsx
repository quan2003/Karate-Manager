import { useState, useRef, useEffect } from "react";
import "./SearchableSelect.css";

/**
 * Searchable Select component - dropdown with text filter
 * @param {Object} props
 * @param {Array} props.options - Array of { value, label }
 * @param {string} props.value - Selected value
 * @param {function} props.onChange - Callback when value changes, receives value string
 * @param {string} props.placeholder - Placeholder text
 * @param {string} props.className - Additional CSS classes
 */
export default function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = "-- Chọn --",
  className = "",
  ...rest
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  const selectedOption = options.find((o) => o.value === value);

  const filtered = search.trim()
    ? options.filter((o) =>
        o.label.toLowerCase().includes(search.trim().toLowerCase())
      )
    : options;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = () => {
    setIsOpen((prev) => !prev);
    if (!isOpen) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleSelect = (val) => {
    onChange(val);
    setIsOpen(false);
    setSearch("");
  };

  return (
    <div
      className={`searchable-select ${className}`}
      ref={wrapperRef}
      {...rest}
    >
      <button
        type="button"
        className={`searchable-select-trigger input ${isOpen ? "open" : ""}`}
        onClick={handleToggle}
      >
        <span className={selectedOption ? "" : "placeholder"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg
          className={`searchable-select-arrow ${isOpen ? "rotated" : ""}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div className="searchable-select-dropdown">
          <div className="searchable-select-search">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm kiếm..."
              className="searchable-select-input"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <ul className="searchable-select-list">
            {filtered.length > 0 ? (
              filtered.map((opt) => (
                <li
                  key={opt.value}
                  className={`searchable-select-item ${
                    opt.value === value ? "selected" : ""
                  }`}
                  onClick={() => handleSelect(opt.value)}
                >
                  {opt.label}
                </li>
              ))
            ) : (
              <li className="searchable-select-empty">Không tìm thấy</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
