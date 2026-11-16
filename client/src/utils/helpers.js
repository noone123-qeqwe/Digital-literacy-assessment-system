export const parseStoredDate = (value) => {
  if (!value) return null;
  const text = String(value);
  const hasZone = /[zZ]|[+-]\d\d:\d\d$/.test(text);
  return new Date(hasZone ? text : `${text.replace(' ', 'T')}Z`);
};

// Exact scale from Thesis (Chapter 3 & Appendix C)
export const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const date = parseStoredDate(dateString);
  if (!date || Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const formatDateTime = (dateString) => {
  if (!dateString) return 'N/A';
  const date = parseStoredDate(dateString);
  if (!date || Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatTime = (seconds) => {
  if (!seconds && seconds !== 0) return '--:--';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

// Exact operational definition of terms from Thesis:
// 1.00 to 1.75: Low
// 1.76 to 2.50: Moderate
// 2.51 to 3.25: High
// 3.26 to 4.00: Very High
export const getProficiencyLevel = (mean) => {
  const val = parseFloat(mean);
  if (isNaN(val)) return { label: 'N/A', color: 'gray', bgColor: 'bg-gray-100', textColor: 'text-gray-700', borderColor: 'border-gray-400' };
  if (val <= 1.75) {
    return { label: 'Low', color: 'rose', bgColor: 'bg-rose-50', textColor: 'text-rose-700', borderColor: 'border-rose-300', badgeColor: 'bg-rose-100 text-rose-800' };
  }
  if (val <= 2.50) {
    return { label: 'Moderate', color: 'amber', bgColor: 'bg-amber-50', textColor: 'text-amber-700', borderColor: 'border-amber-300', badgeColor: 'bg-amber-100 text-amber-800' };
  }
  if (val <= 3.25) {
    return { label: 'High', color: 'green', bgColor: 'bg-green-50', textColor: 'text-green-800', borderColor: 'border-green-300', badgeColor: 'bg-green-100 text-green-900' };
  }
  return { label: 'Very High', color: 'emerald', bgColor: 'bg-emerald-50', textColor: 'text-emerald-700', borderColor: 'border-emerald-300', badgeColor: 'bg-emerald-100 text-emerald-800' };
};

export const getStatusBadge = (status) => {
  const statusMap = {
    active: { label: 'Active', bgColor: 'bg-emerald-100', textColor: 'text-emerald-700' },
    inactive: { label: 'Inactive', bgColor: 'bg-gray-100', textColor: 'text-gray-700' },
    archived: { label: 'Archived', bgColor: 'bg-amber-100', textColor: 'text-amber-700' },
    pending: { label: 'Pending', bgColor: 'bg-amber-100', textColor: 'text-amber-700' },
    in_progress: { label: 'In Progress', bgColor: 'bg-green-100', textColor: 'text-green-800' },
    completed: { label: 'Completed', bgColor: 'bg-emerald-100', textColor: 'text-emerald-700' },
  };
  return statusMap[status?.toLowerCase()] || { label: status || 'Unknown', bgColor: 'bg-gray-100', textColor: 'text-gray-600' };
};

// DigComp 2.1 Competence Areas
export const competenceAreas = [
  { code: 'IDL', name: 'Information and Data Literacy', items: '1–6', color: '#006B3C', icon: 'Database' },
  { code: 'CC', name: 'Communication and Collaboration', items: '7–12', color: '#287D4D', icon: 'MessageSquare' },
  { code: 'DCC', name: 'Digital Content Creation', items: '13–18', color: '#005A32', icon: 'FileCode' },
  { code: 'S', name: 'Safety', items: '19–24', color: '#D6A900', icon: 'ShieldCheck' },
  { code: 'PS', name: 'Problem Solving', items: '25–30', color: '#DC2626', icon: 'Wrench' },
];

// Exact Part II Self-Assessment 4-Point Likert Scale
export const ratingScale = [
  { value: 4, label: 'I can do this confidently and independently.' },
  { value: 3, label: 'I can do this with occasional difficulty.' },
  { value: 2, label: 'I can do this with much difficulty.' },
  { value: 1, label: 'I cannot do this.' },
];

export const ratingLabels = {
  4: 'I can do this confidently and independently.',
  3: 'I can do this with occasional difficulty.',
  2: 'I can do this with much difficulty.',
  1: 'I cannot do this.',
};

// Part I Respondent Profile Options from Masbate Colleges Study
export const municipalitiesOfOrigin = [
  'Masbate City',
  'Aroroy',
  'Baleno',
  'Balud',
  'Batuan (Ticao Island)',
  'Cataingan',
  'Cawayan',
  'Claveria (Burias Island)',
  'Dimasalang',
  'Esperanza',
  'Mandaon',
  'Milagros',
  'Mobo',
  'Monreal (Ticao Island)',
  'Palanas',
  'Pio V. Corpuz',
  'Placer',
  'San Fernando (Ticao Island)',
  'San Jacinto (Ticao Island)',
  'San Pascual (Burias Island)',
  'Uson',
  'Other Mainland Municipality',
  'Other Island Municipality'
];

export const shsStrands = [
  'STEM (Science, Technology, Engineering, and Mathematics)',
  'TVL - ICT (Information and Communications Technology)',
  'ABM (Accountancy, Business, and Management)',
  'HUMSS (Humanities and Social Sciences)',
  'GAS (General Academic Strand)',
  'Other / Non-K12'
];

export const schoolTypes = ['Public', 'Private', 'Other'];

export const incomeRanges = [
  'below 10,000',
  '10,000-30,000',
  'above 30,000'
];

export const internetAccessOptions = [
  'Fiber/Broadband',
  'Mobile Data',
  'Pocket Wi-Fi',
  'Other',
  'No Internet Access'
];

export const downloadFile = (data, filename, type = 'application/pdf') => {
  const blob = new Blob([data], { type });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export const dashboardPathForRole = (role) => {
  if (role === 'admin') return '/admin/dashboard';
  if (role === 'assessor') return '/assessor/dashboard';
  return '/respondent/dashboard';
};
