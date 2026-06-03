"use client";

import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { format, isValid, parseISO } from "date-fns";

interface DateFilterFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  disabled?: boolean;
}

function toDate(value: string): Date | null {
  if (!value) return null;
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

function toValue(date: Date | null): string {
  if (!date || !isValid(date)) return "";
  return format(date, "yyyy-MM-dd");
}

export function DateFilterField({ label, value, onChange, min, max, disabled }: DateFilterFieldProps) {
  return (
    <DatePicker
      label={label}
      value={toDate(value)}
      onChange={(date) => onChange(toValue(date))}
      disabled={disabled}
      minDate={min ? toDate(min) ?? undefined : undefined}
      maxDate={max ? toDate(max) ?? undefined : undefined}
      format="dd/MM/yyyy"
      slotProps={{
        field: { clearable: true },
        textField: {
          fullWidth: true,
          size: "small",
        },
        openPickerButton: {
          "aria-label": `Abrir calendario: ${label}`,
        },
      }}
    />
  );
}
