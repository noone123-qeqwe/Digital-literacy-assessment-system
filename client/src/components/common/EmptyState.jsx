import React from 'react';
import { Inbox } from 'lucide-react';

export const EmptyState = ({
  icon: Icon = Inbox,
  title = 'No records found',
  description = 'There is currently no data to display.',
  actionText,
  onAction,
}) => {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200/90 bg-slate-50/50 px-6 py-12 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-green-100 bg-green-50 text-green-600 shadow-2xs ring-4 ring-green-50/60">
        <Icon aria-hidden="true" className="h-6 w-6" />
      </div>
      <h4 className="text-base font-bold tracking-tight text-slate-900">{title}</h4>
      <p className="mt-1.5 max-w-sm text-sm leading-6 text-slate-500">{description}</p>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="mt-5 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-xs transition-colors hover:bg-green-700"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};

export default EmptyState;

