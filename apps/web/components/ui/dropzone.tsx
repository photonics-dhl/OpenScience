'use client';

import * as React from 'react';
import { FileUp } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

const DEFAULT_ACCEPT = '.pdf,.docx,.tex,.md,.markdown,.png,.jpg,.jpeg,.webp,.svg';

export interface DropzoneProps
  extends Omit<React.LabelHTMLAttributes<HTMLLabelElement>, 'onDrop'> {
  onFiles: (files: File[]) => void;
  accept?: string;
  disabled?: boolean;
  label?: string;
  hint?: string;
}

function Dropzone({
  accept = DEFAULT_ACCEPT,
  className,
  disabled = false,
  hint,
  label,
  onFiles,
  ...props
}: DropzoneProps) {
  const t = useTranslations('ingestion');

  function emitFiles(fileList: FileList | null) {
    if (!disabled && fileList?.length) onFiles(Array.from(fileList));
  }

  return (
    <label
      className={cn(
        'group flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-card border border-dashed border-workbench-muted/50 bg-workbench-surface px-6 py-8 text-center text-workbench-text shadow-card transition-[border-color,background-color] duration-(--motion-fast) hover:border-accent-primary hover:bg-workbench-elevated focus-within:outline-none focus-within:ring-2 focus-within:ring-focus-ring focus-within:ring-offset-2 focus-within:ring-offset-workbench-bg motion-reduce:transition-none',
        disabled && 'cursor-not-allowed opacity-55',
        className,
      )}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        emitFiles(event.dataTransfer.files);
      }}
      {...props}
    >
      <input
        className="sr-only"
        type="file"
        accept={accept}
        multiple
        disabled={disabled}
        onChange={(event) => emitFiles(event.currentTarget.files)}
      />
      <span className="grid h-12 w-12 place-items-center rounded-control bg-workbench-bg text-accent-primary" aria-hidden="true">
        <FileUp size={22} strokeWidth={1.75} />
      </span>
      <span className="text-base font-semibold">{label ?? t('dropzone.label')}</span>
      <span className="max-w-xl text-sm leading-6 text-workbench-muted">
        {hint ?? t('dropzone.hint')}
      </span>
      <span className="rounded-control bg-accent-primary-strong px-4 py-2 text-sm font-semibold text-hero-text transition-transform duration-(--motion-fast) group-active:scale-[0.98] motion-reduce:transform-none motion-reduce:transition-none">
        {t('dropzone.browse')}
      </span>
    </label>
  );
}

export { Dropzone };
