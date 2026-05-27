'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { parseEthiopianDate, getCurrentEthiopianDateString } from '@/lib/ethiopian-calendar';
import { useState, useCallback } from 'react';

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
      if (result.valid && result.date) {
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
    if (result.valid && result.date) {
      onChange(today, result.date.toISOString());
      setLocalError(null);
    }
  }, [onChange]);

  const displayError = error || localError;

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex items-center justify-between">
          <Label htmlFor="eth-date">{label}</Label>
          <button
            type="button"
            onClick={setToday}
            className="text-xs text-primary hover:underline"
          >
            Today
          </button>
        </div>
      )}
      <Input
        id="eth-date"
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        required={required}
        className={displayError ? 'border-red-500' : ''}
      />
      {displayError && (
        <p className="text-xs text-red-500">{displayError}</p>
      )}
      <p className="text-xs text-muted-foreground">
        Ethiopian Calendar format: dd/mm/yyyy EC
      </p>
    </div>
  );
}
