const crypto = require('node:crypto');
const { questionInput } = require('../utils/knowledgeQuiz');
const { enrollPublishedQuizzes } = require('../utils/quizEnrollment');

const categoryNames = ['Computer Literacy', 'Internet Literacy', 'Information Literacy', 'Digital Communication', 'Digital Safety and Security', 'Digital Citizenship', 'Productivity Tools', 'Media Literacy'];
const stages = ['baseline', 'follow_up'];

function validateCourse(course) {
  if (!course || !/^[a-z0-9][a-z0-9.-]{4,100}$/.test(course.version) || !/^[a-z0-9][a-z0-9-]{4,80}$/.test(course.programCode)) throw new Error('Provide a valid course version and program code.');
  if (!Array.isArray(course.categories) || course.categories.length !== 8 || course.categories.some((c, i) => c.name !== categoryNames[i])) throw new Error('The course must cover the eight established categories in order.');
  const sourceValues = Object.values(course.sources || {});
  if (!sourceValues.length) throw new Error('Provide the course reference list.');
  for (const source of sourceValues) {
    if (typeof source.title !== 'string' || source.title.length < 5 || source.title.length > 200) throw new Error('Provide valid source titles.');
    let url; try { url = new URL(source.url); } catch { throw new Error('Provide valid reference URLs.'); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('References must be secure public URLs without credentials.');
  }
  const prompts = new Set();
  return stages.map((stage) => {
    const questions = course.categories.flatMap((category, categoryIndex) => {
      const items = category[stage];
      if (!Array.isArray(items) || items.length !== 4) throw new Error('Each form requires four questions per category.');
      const counts = {};
      const objectives = new Set();
      const prepared = items.map((item, index) => {
        if (typeof item.objective !== 'string' || !/^[a-z_]{3,50}$/.test(item.objective) || objectives.has(item.objective)) throw new Error('Each category needs four distinct learning objectives.');
        objectives.add(item.objective);
        if (item.source && !course.sources[item.source]) throw new Error('Every cited source must exist in the reference list.');
        const reference = item.source ? course.sources[item.source] : null;
        if (typeof item.explanation !== 'string' || item.explanation.trim().length < 15) throw new Error('Every answer needs a meaningful explanation.');
        const explanation = item.explanation + (reference ? `\nReference: ${reference.title}\n${reference.url}` : '');
        const question = questionInput({ ...item, category_id: categoryIndex + 1, points: 1, explanation });
        const signature = question.prompt.toLowerCase();
        if (prompts.has(signature)) throw new Error('Baseline and follow-up questions must have distinct wording.');
        prompts.add(signature);
        counts[question.type] = (counts[question.type] || 0) + 1;
        return { ...question, category_name: category.name, objective: item.objective, content_key: `${course.version}:${stage}:${categoryIndex + 1}:${index + 1}` };
      });
      if (counts.multiple_choice !== 2 || counts.true_false !== 1 || counts.identification !== 1) throw new Error('Each category requires two multiple-choice, one true/false and one identification question.');
      const other = category[stage === 'baseline' ? 'follow_up' : 'baseline'];
      if (!Array.isArray(other) || [...objectives].sort().join('|') !== other.map(q => q.objective).sort().join('|')) throw new Error('The forms must target the same learning objectives per category.');
      return prepared;
    });
    return { stage, questions };
  });
}

function publishFoundationCurriculum(db, course, administratorId) {
  const forms = validateCourse(course);
  const admin = db.prepare("SELECT id FROM users WHERE id=? AND role='admin' AND status='active' AND is_demo=0").get(administratorId);
  if (!admin) throw new Error('A real active administrator must own the course.');
  const digest = crypto.createHash('sha256').update(JSON.stringify(course)).digest('hex');
  const manifestKey = `curriculum:${course.version}`;
  const previous = db.prepare('SELECT setting_value FROM system_settings WHERE setting_key=?').get(manifestKey);
  if (previous) {
    const manifest = JSON.parse(previous.setting_value);
    if (manifest.contentHash !== digest) throw new Error('Published content changed. Use a new version instead of modifying an existing instrument.');
    // Respect staff archival/deletion choices; a repeat import never republishes.
    return { ...manifest, alreadyPublished: true };
  }
  const categoryIds = new Map(db.prepare('SELECT id,name FROM quiz_categories').all().map(c => [c.name, c.id]));
  for (const name of categoryNames) if (!categoryIds.has(name)) throw new Error('The established categories must exist before publication.');
  const existing = db.prepare('SELECT curriculum_key FROM knowledge_quizzes WHERE program_code=?').all(course.programCode);
  if (existing.length) throw new Error('This program already has published forms. Publish a separate versioned program instead.');
  const instructions = (stage) => [
    stage === 'baseline' ? 'Complete this baseline before reviewing the learning guides. It records your starting knowledge.' : 'Complete this follow-up after finishing the baseline and working through the learning guides. It uses different questions covering the same eight areas.',
    'There are 32 questions: four per category. Each correct answer is worth one point. Multiple-choice and true/false questions have one correct answer; identification answers accept capitalization and spacing variations.',
    'You have 35 minutes and one attempt. Work independently without outside help. Question and choice order may differ between students but remain stable when you resume.',
    'Review every answer before submission. The timer continues during a disconnection. Keep the same browser and device for recovery, reconnect before the deadline, and confirm that your answers are saved to the server. Only answers received by the server before the deadline can be scored.',
    'An achievement certificate requires at least 80%: 26 of 32 points. Every completed attempt receives a result, even below the certificate threshold. Completing the baseline unlocks the follow-up regardless of the baseline score.',
    'These are educational knowledge quizzes. Their percentage scores are separate from the five-domain research self-assessment.',
  ].join('\n\n');
  return db.transaction(() => {
    const questions = forms.flatMap(form => form.questions.map(q => ({ ...q, category_id: categoryIds.get(q.category_name) })));
    const values = questions.flatMap(q => [q.category_id, q.prompt, q.type, JSON.stringify(q.options), JSON.stringify(q.answers), q.points, q.explanation, admin.id, q.content_key]);
    db.prepare(`INSERT INTO quiz_questions(category_id,prompt,type,options_json,answers_json,points,explanation,created_by,content_key)
      VALUES ${questions.map(() => '(?,?,?,?,?,?,?,?,?)').join(',')}`).run(...values);
    const ids = new Map(db.prepare(`SELECT id,content_key FROM quiz_questions WHERE content_key IN (${questions.map(() => '?').join(',')})`).all(...questions.map(q => q.content_key)).map(q => [q.content_key, q.id]));
    const quizIds = {};
    for (const form of forms) {
      const title = `Digital Literacy Foundations — ${form.stage === 'baseline' ? 'Baseline' : 'Follow-up'}`;
      const snapshot = { version: 'knowledge-quiz-v1', content_version: course.version, program_code: course.programCode, stage: form.stage, title, instructions: instructions(form.stage), pass_percentage: 80,
        questions: form.questions.map(q => ({ id: ids.get(q.content_key), category_id: categoryIds.get(q.category_name), category_name: q.category_name, prompt: q.prompt, type: q.type, options: q.options, answers: q.answers, points: q.points, explanation: q.explanation })) };
      const created = db.prepare(`INSERT INTO knowledge_quizzes(title,description,instructions,created_by,status,time_limit_minutes,max_attempts,pass_percentage,randomize,snapshot_json,curriculum_key,program_code,stage,prerequisite_quiz_id,auto_assign_verified)
        VALUES(?,?,?,?,'published',35,1,80,1,?,?,?,?,?,1)`).run(title,
        `${form.stage === 'baseline' ? 'Discover your starting knowledge' : 'Check your knowledge after learning'} across all eight categories. 32 questions, 35 minutes, one attempt. Achievement certificate at 80% (26/32).`,
        snapshot.instructions, admin.id, JSON.stringify(snapshot), `${course.version}:${form.stage}`, course.programCode, form.stage, form.stage === 'follow_up' ? quizIds.baseline : null);
      quizIds[form.stage] = Number(created.lastInsertRowid);
    }
    enrollPublishedQuizzes(db);
    const manifest = { version: course.version, programCode: course.programCode, contentHash: digest, publishedAt: new Date().toISOString(), quizIds, questions: 64, sources: course.sources,
      blueprint: categoryNames.map(name => ({ category: name, questionsPerForm: 4, pointsPerForm: 4 })) };
    db.prepare('INSERT INTO system_settings(setting_key,setting_value) VALUES(?,?)').run(manifestKey, JSON.stringify(manifest));
    db.prepare('INSERT INTO activity_log(user_id,action,details) VALUES(?,?,?)').run(admin.id, 'CURRICULUM_PUBLISHED', `Published ${course.version}: 64 original questions and two educational forms; no participant results created`);
    return manifest;
  })();
}

module.exports = { categoryNames, validateCourse, publishFoundationCurriculum };
