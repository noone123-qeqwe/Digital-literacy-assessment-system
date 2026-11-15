import React from 'react';
import './ChartSetup';
import { Radar } from 'react-chartjs-2';

export const AreaRadarChart = ({ areaData = [], maxScore = 4 }) => {
  const labels = [
    'Info & Data',
    'Communication',
    'Content Creation',
    'Safety',
    'Problem Solving',
  ];

  // Map values according to standard DigComp area order
  const values = [null, null, null, null, null];
  const codeIndexMap = { IDL: 0, CC: 1, DCC: 2, S: 3, PS: 4 };

  areaData.forEach((item) => {
    const idx = codeIndexMap[item.code || item.area_code];
    if (idx !== undefined) {
      const rawValue = item.weighted_mean ?? item.weightedMean ?? item.mean;
      values[idx] = rawValue === null || rawValue === undefined ? null : Number.parseFloat(rawValue);
    }
  });

  if (!values.some((value) => value !== null && Number.isFinite(value))) {
    return (
      <div className="h-64 flex items-center justify-center rounded-2xl bg-slate-50 text-sm text-slate-500" role="status">
        Domain results will appear after an assessment is completed.
      </div>
    );
  }

  const data = {
    labels,
    datasets: [
      {
        label: `Mean self-rating (Scale ${maxScore === 3 ? '0' : '1'}–${maxScore})`,
        data: values,
        backgroundColor: 'rgba(0, 107, 60, 0.20)',
        borderColor: '#006B3C',
        pointBackgroundColor: '#005A32',
        pointBorderColor: '#ffffff',
        pointHoverBackgroundColor: '#ffffff',
        pointHoverBorderColor: '#005A32',
        pointRadius: 4,
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        min: maxScore === 3 ? 0 : 1,
        max: maxScore,
        ticks: {
          stepSize: 1,
          font: { size: 13 },
          color: '#94a3b8',
        },
        grid: {
          color: '#e2e8f0',
        },
        angleLines: {
          color: '#e2e8f0',
        },
        pointLabels: {
          font: {
            size: 14,
            weight: '600',
            family: 'Inter, sans-serif',
          },
          color: '#334155',
        },
      },
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: (context) => ` Mean rating: ${context.parsed.r.toFixed(2)} / ${maxScore}.00`,
        },
      },
    },
  };

  return (
    <div
      role="img"
      aria-label={`Competence area scores on a ${maxScore === 3 ? '0 to 3' : '1 to 4'} scale. ${labels.map((label, index) => `${label}: ${Number.isFinite(values[index]) ? `${values[index].toFixed(2)} out of ${maxScore}` : 'no score'}`).join('. ')}.`}
      className="relative flex h-72 items-center justify-center sm:h-80"
    >
      <Radar data={data} options={options} />
    </div>
  );
};

export default AreaRadarChart;

