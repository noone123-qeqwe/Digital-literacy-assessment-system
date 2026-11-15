import React from 'react';

export const ProgressBar = ({ progress = 0, color = 'brand', showLabel = false, height = 'h-2.5' }) => {
  const percentage = Math.min(100, Math.max(0, Math.round(progress)));

  const colorClasses = {
    brand: 'bg-green-600',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    rose: 'bg-rose-500',
    gold: 'bg-amber-500',
  };

  return (
    <div className="w-full">
      {showLabel && (
        <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1.5">
          <span>Progress</span>
          <span>{percentage}%</span>
        </div>
      )}
      <div className={`w-full bg-slate-100 rounded-full overflow-hidden ${height}`}>
        <div
          className={`${height} ${colorClasses[color] || colorClasses.brand} rounded-full transition-all duration-300 ease-out`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export default ProgressBar;

