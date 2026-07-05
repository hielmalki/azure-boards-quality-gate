import { useEffect, useRef } from 'react';

type EditableTextProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
};

/**
 * Sieht aus wie Fließtext, ist aber inline editierbar. Wächst mit dem Inhalt.
 */
export function EditableText({ value, onChange, disabled, className = '', placeholder }: EditableTextProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const autosize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    autosize(ref.current);
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      disabled={disabled}
      placeholder={placeholder}
      onChange={event => {
        onChange(event.target.value);
        autosize(event.target);
      }}
      className={`w-full resize-none overflow-hidden text-xs leading-relaxed bg-transparent rounded-[6px] px-2 py-1 -ml-2 border border-transparent hover:border-gray-200 focus:border-blue-400 focus:bg-white focus:outline-none disabled:hover:border-transparent placeholder:text-gray-300 transition-colors ${className}`}
    />
  );
}
