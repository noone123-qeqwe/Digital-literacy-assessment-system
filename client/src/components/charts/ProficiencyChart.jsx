import React from 'react';
import './ChartSetup';
import { Doughnut } from 'react-chartjs-2';

export const ProficiencyChart = ({ distribution = {} }) => {
  const total = ['Low', 'Moderate', 'High', 'Very High']
    .reduce((sum, level) => sum + Number(distribution[level] || 0), 0);
  if (!total) {
    return (
      <div className="h-64 flex items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500" role="status">
        No completed assessment results yet.
      </div>
    );
  }

  const data = {
    labels: ['Low (1.00-1.75)', 'Moderate (1.76-2.50)', 'High (2.51-3.25)', 'Very High (3.26-4.00)'],
    datasets: [
      {
        data: [
          distribution.Low || 0,
          distribution.Moderate || 0,
          distribution.High || 0,
          distribution['Very High'] || 0,
        ],
        backgroundColor: [
          '#DC2626', // Red (Low)
          '#D6A900', // Gold (Moderate)
          '#287D4D', // Green (High)
          '#005A32', // Deep green (Very High)
        ],
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          boxWidth: 12,
          padding: 16,
          font: {
            size: 11,
            family: 'Inter, sans-serif',
          },
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            const value = context.parsed || 0;
            return ` ${label}: ${value} participants`;
          },
        },
      },
    },
    cutout: '68%',
  };

  return (
    <div
      role="img"
      aria-label={`Proficiency distribution across ${total} participants: Low ${distribution.Low || 0}, Moderate ${distribution.Moderate || 0}, High ${distribution.High || 0}, Very High ${distribution['Very High'] || 0}.`}
      className="h-64 relative flex items-center justify-center"
    >
      <Doughnut data={data} options={options} />
    </div>
  );
};

export default ProficiencyChart;

