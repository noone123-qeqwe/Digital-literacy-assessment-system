/**
 * Scoring Engine for Digital Literacy Assessment System
 * 
 * Proficiency levels based on weighted mean:
 * - 1.00 – 1.75: Low
 * - 1.76 – 2.50: Moderate
 * - 2.51 – 3.25: High
 * - 3.26 – 4.00: Very High
 */

/**
 * Determine proficiency level from a mean score
 */
function getProficiencyLevel(mean) {
  if (mean === null || mean === undefined || isNaN(mean)) return 'N/A';
  if (mean <= 1.75) return 'Low';
  if (mean <= 2.50) return 'Moderate';
  if (mean <= 3.25) return 'High';
  return 'Very High';
}

/**
 * Calculate the mean of an array of numbers
 */
function calculateMean(values) {
  if (!values || values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate the standard deviation of an array of numbers
 */
function calculateStdDev(values) {
  if (!values || values.length === 0) return 0;
  const mean = calculateMean(values);
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Round a number to specified decimal places
 */
function roundTo(value, decimals = 2) {
  return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Calculate results for a single competence area
 */
function calculateAreaResult(ratings) {
  if (!ratings || ratings.length === 0) {
    return { weightedMean: null, standardDeviation: null, level: 'N/A' };
  }
  const weightedMean = roundTo(calculateMean(ratings));
  const standardDeviation = roundTo(calculateStdDev(ratings));
  const level = getProficiencyLevel(weightedMean);
  return { weightedMean, standardDeviation, level };
}

/**
 * Calculate complete assessment results from all responses
 * 
 * @param {Array} responses - Array of { question_id, rating, competence_area_id }
 * @param {Array} competenceAreas - Array of { id, name, code }
 * @returns {Object} Complete results with area breakdowns and overall scores
 */
function calculateAssessmentResults(responses, competenceAreas) {
  // Group responses by competence area
  const areaResponses = {};
  for (const area of competenceAreas) {
    areaResponses[area.id] = [];
  }
  for (const resp of responses) {
    if (areaResponses[resp.competence_area_id]) {
      areaResponses[resp.competence_area_id].push(resp.rating);
    }
  }

  // Calculate per-area results
  const areaResults = [];
  for (const area of competenceAreas) {
    const ratings = areaResponses[area.id] || [];
    const result = calculateAreaResult(ratings);
    areaResults.push({
      competence_area_id: area.id,
      area_name: area.name,
      area_code: area.code,
      ...result,
      question_count: ratings.length,
    });
  }

  // Calculate overall results
  const allRatings = responses.map(r => r.rating);
  const overallMean = roundTo(calculateMean(allRatings));
  const overallLevel = getProficiencyLevel(overallMean);

  // Identify strengths and weaknesses
  const sortedAreas = [...areaResults].sort((a, b) => b.weightedMean - a.weightedMean);
  const ratedAreas = sortedAreas.filter(a => a.question_count > 0);
  const strengths = ratedAreas.length
    ? ratedAreas.filter(a => a.weightedMean === ratedAreas[0].weightedMean)
    : [];
  const weaknesses = ratedAreas.length
    ? ratedAreas.filter(a => a.weightedMean === ratedAreas[ratedAreas.length - 1].weightedMean)
    : [];

  // Rank items by rating
  const itemRatings = responses.map(r => ({
    question_id: r.question_id,
    rating: r.rating,
    question_text: r.question_text || '',
    question_number: r.question_number || 0,
  })).sort((a, b) => a.rating - b.rating || a.question_number - b.question_number);

  const lowestRatedItems = itemRatings.slice(0, 5);
  const highestRatedItems = itemRatings.slice(-5).reverse();

  return {
    overallMean,
    overallLevel,
    areaResults,
    strengths: strengths.map(s => ({ area: s.area_name, code: s.area_code, mean: s.weightedMean })),
    weaknesses: weaknesses.map(w => ({ area: w.area_name, code: w.area_code, mean: w.weightedMean })),
    lowestRatedItems,
    highestRatedItems,
    totalQuestions: allRatings.length,
    totalResponded: allRatings.length,
  };
}

module.exports = {
  getProficiencyLevel,
  calculateMean,
  calculateStdDev,
  roundTo,
  calculateAreaResult,
  calculateAssessmentResults,
};
