'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseEthiopianDate, getCurrentEthiopianDateString } from '@/lib/ethiopian-calendar';
import { useState, useCallback, useId } from 'react';

interface EthiopianDateInputProps {
  value: string;
  onChange: (value: string, isoDate: string | null) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  error?: string;
}

export function EthiopianDateInput({
  value,
  onChange,
  label = 'Date (EC)',
  placeholder = 'dd/mm/yyyy',
  required = false,
  error,
}: EthiopianDateInputProps) {
  const [localError, setLocalError] = useState<string | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      onChange(raw, null);
      
      if (!raw || raw.length < 10) {
        setLocalError(null);
        return;
      }

      const result = parseEthiopianDate(raw);
      if (result.success && result.date) {
        setLocalError(null);
        onChange(raw, result.date.toISOString());
      } else {
        setLocalError(result.error || 'Invalid Ethiopian date');
        onChange(raw, null);
      }
    },
    [onChange]
  );

  const setToday = useCallback(() => {
    const today = getCurrentEthiopianDateString();
    const result = parseEthiopianDate(today);
    if (result.success && result.date) {
      onChange(today, result.date.toISOString());
      setLocalError(null);
    }
  }, [onChange]);

  const displayError = error || localError;
  const inputId = useId();

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <Label htmlFor={inputId}>{label}</Label>
          <button
            type="button"
            onClick={setToday}
            className="text-xs text-primary hover:underline h-9 px-1 flex items-center -mr-1"
          >
            Today
          </button>
        </div>
      )}
      <Input
        id={inputId}
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        required={required}
        aria-invalid={displayError ? true : undefined}
        aria-describedby={displayError ? `${inputId}-error` : undefined}
        className={displayError ? 'border-red-500' : ''}
      />
      {displayError && (
        <p id={`${inputId}-error`} className="text-xs text-red-500">{displayError}</p>
      )}
      <p className="text-xs text-muted-foreground">
        Ethiopian Calendar format: dd/mm/yyyy EC
      </p>
    </div>
  );
}
