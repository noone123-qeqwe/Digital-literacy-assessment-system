import React from 'react';

export const StatCard = ({ title, value, subtitle, icon: Icon, color = 'brand', trend }) => {
  const colorMap = {
    brand: { bg: 'bg-green-50 text-green-700', ring: 'ring-green-100', border: 'border-green-200' },
    emerald: { bg: 'bg-emerald-50 text-emerald-600', ring: 'ring-emerald-100', border: 'border-emerald-200' },
    amber: { bg: 'bg-amber-50 text-amber-600', ring: 'ring-amber-100', border: 'border-amber-200' },
    gold: { bg: 'bg-amber-50 text-amber-700', ring: 'ring-amber-100', border: 'border-amber-200' },
    rose: { bg: 'bg-rose-50 text-rose-600', ring: 'ring-rose-100', border: 'border-rose-200' },
  };

  const scheme = colorMap[color] || colorMap.brand;

  return (
    <div className="group rounded-2xl border border-slate-200/85 bg-white p-5 shadow-xs transition-all hover:-translate-y-0.5 hover:border-slate-300/90 hover:shadow-md sm:p-6">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-slate-500">{title}</p>
          <h3 className="mt-2.5 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{value}</h3>
          {subtitle && <p className="mt-1.5 text-xs leading-5 text-slate-500">{subtitle}</p>}
        </div>
        {Icon && (
          <div aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${scheme.bg} ring-4 ${scheme.ring}`}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      {trend && (
        <div className="mt-4 flex items-center border-t border-slate-100 pt-3 text-xs">
          <span className={trend.isPositive ? 'text-emerald-600 font-semibold' : 'text-rose-600 font-semibold'}>
            {trend.value}
          </span>
          <span className="text-slate-400 ml-1.5">{trend.label}</span>
        </div>
      )}
    </div>
  );
};

export default StatCard;

