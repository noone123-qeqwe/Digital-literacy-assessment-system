import React from 'react';

export const LoadingSpinner = ({ size = 'md', text = 'Loading...' }) => {
  const sizeClasses = {
    sm: 'h-5 w-5 border-2',
    md: 'h-9 w-9 border-[3px]',
    lg: 'h-12 w-12 border-4',
  };

  return (
    <div className="flex flex-col items-center justify-center gap-3.5 p-10" role="status" aria-live="polite">
      <div className="relative flex items-center justify-center">
        <div className={`${sizeClasses[size] || sizeClasses.md} rounded-full border-slate-200/90`} />
        <div
          className={`${sizeClasses[size] || sizeClasses.md} absolute inset-0 animate-spin rounded-full border-green-600 border-t-transparent border-l-transparent`}
        />
      </div>
      {text && <p className="text-sm font-medium tracking-tight text-slate-500">{text}</p>}
    </div>
  );
};

export default LoadingSpinner;
