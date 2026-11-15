import React from 'react';
import './ChartSetup';
import { Radar } from 'react-chartjs-2';

export const AreaRadarChart = ({ areaData = [] }) => {
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
        label: 'Weighted Mean (Scale 1–4)',
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
        min: 1,
        max: 4,
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
          label: (context) => ` Weighted Mean: ${context.parsed.r.toFixed(2)} / 4.00`,
        },
      },
    },
  };

  return (
    <div
      role="img"
      aria-label={`Competence area scores on a 1 to 4 scale. ${labels.map((label, index) => `${label}: ${Number.isFinite(values[index]) ? `${values[index].toFixed(2)} out of 4` : 'no score'}`).join('. ')}.`}
      className="relative flex h-72 items-center justify-center sm:h-80"
    >
      <Radar data={data} options={options} />
    </div>
  );
};

export default AreaRadarChart;

