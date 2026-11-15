const difference = (before, after) => Math.round((after - before) * 100) / 100;

function programProgress(rows, categoryRows) {
  const groups = new Map();
  const categories = new Map();
  for (const row of categoryRows) {
    if (!categories.has(row.attempt_id)) categories.set(row.attempt_id, []);
    categories.get(row.attempt_id).push(row);
  }
  for (const row of rows) {
    if (!row.program_code || !['baseline', 'follow_up'].includes(row.stage)) continue;
    const key = `${row.user_id}:${row.program_code}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].flatMap((history) => {
    const ordered = [...history].sort((a, b) => String(a.completed_at).localeCompare(String(b.completed_at)) || a.id - b.id);
    const baseline = ordered.find(row => row.stage === 'baseline');
    if (!baseline) return [];
    const followup = ordered.filter(row => row.stage === 'follow_up' && row.prerequisite_quiz_id === baseline.quiz_id).at(-1);
    const followupCategories = new Map((categories.get(followup?.id) || []).map(row => [row.category_id, row]));
    return [{ user_id: baseline.user_id, name: `${baseline.first_name} ${baseline.last_name}`, program_code: baseline.program_code,
      title: 'Digital Literacy Foundations', baseline: baseline.percentage, followup: followup?.percentage ?? null,
      baseline_attempt_id: baseline.id, followup_attempt_id: followup?.id ?? null,
      change: followup ? difference(baseline.percentage, followup.percentage) : null,
      categories: (categories.get(baseline.id) || []).map(row => {
        const after = followupCategories.get(row.category_id);
        return { id: row.category_id, name: row.category_name, baseline: row.percentage, followup: after?.percentage ?? null,
          change: after ? difference(row.percentage, after.percentage) : null };
      }),
    }];
  });
}

module.exports = { programProgress };
