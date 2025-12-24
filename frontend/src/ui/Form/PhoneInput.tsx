// src/components/ui/Form/PhoneInput.tsx
import React from 'react';
import './PhoneInput.css';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  placeholder?: string;
  label?: string;
  error?: string;
}

const PhoneInput: React.FC<PhoneInputProps> = ({
  value,
  onChange,
  onKeyDown,
  onPaste,
  disabled = false,
  placeholder = '+7 (___) ___ __ __',
  label = 'Телефон',
  error,
}) => {
  return (
    <div className="phone-input">
      {label && <label className="phone-input__label">{label}</label>}
      <input
        type="tel"
        className={`phone-input__field ${error ? 'phone-input__field--error' : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        disabled={disabled}
        placeholder={placeholder}
        inputMode="tel"
      />
      {error && <div className="phone-input__error">{error}</div>}
    </div>
  );
};

export default PhoneInput;