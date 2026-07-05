import { ChevronUp, ChevronDown } from 'lucide-react';

type StepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
};

export function Stepper({ value, onChange, min = 0, max = 20, disabled = false }: StepperProps) {
  return (
    <div
      className={`inline-flex items-center border border-gray-200 rounded-[6px] overflow-hidden ${disabled ? 'opacity-50 bg-gray-50' : 'bg-white'}`}
    >
      <span className="w-7 text-center text-xs text-gray-800 tabular-nums select-none">{value}</span>
      <div className="flex flex-col border-l border-gray-200">
        <button
          type="button"
          disabled={disabled || value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="px-1 py-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 disabled:opacity-30 transition-colors"
        >
          <ChevronUp size={11} />
        </button>
        <button
          type="button"
          disabled={disabled || value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="px-1 py-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-50 border-t border-gray-200 disabled:opacity-30 transition-colors"
        >
          <ChevronDown size={11} />
        </button>
      </div>
    </div>
  );
}
