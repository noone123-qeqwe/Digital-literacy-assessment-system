const crypto = require('node:crypto');
const { questionInput } = require('../utils/knowledgeQuiz');
const { enrollPublishedQuizzes } = require('../utils/quizEnrollment');
const { categoryNames } = require('./foundationCurriculum');

const formats = new Set(['knowledge_check', 'scenario', 'case_based', 'situational_judgment', 'applied_knowledge']);
function validateAssessmentPack(pack) {
  if (!pack || !/^[a-z0-9][a-z0-9.-]{4,100}$/.test(pack.version)) throw new Error('Provide a versioned assessment pack.');
  if (!pack.sources || typeof pack.sources !== 'object' || Array.isArray(pack.sources) || !Object.keys(pack.sources).length) throw new Error('Provide public source references.');
  for (const source of Object.values(pack.sources)) {
    let url;
    try { url = new URL(source.url); } catch { throw new Error('Provide valid reference URLs.'); }
    if (typeof source.title !== 'string' || source.title.length < 5 || source.title.length > 200
      || url.protocol !== 'https:' || url.username || url.password) throw new Error('Provide public HTTPS references without credentials.');
  }
  if (!Array.isArray(pack.quizzes) || pack.quizzes.length < 1 || pack.quizzes.length > 30) throw new Error('Provide one to thirty assessments.');
  const keys = new Set(), titles = new Set(), prompts = new Set();
  return pack.quizzes.map(quiz => {
    if (!/^[a-z0-9][a-z0-9-]{2,60}$/.test(quiz.key) || keys.has(quiz.key)) throw new Error('Assessment keys must be unique.');
    keys.add(quiz.key);
    if (typeof quiz.title !== 'string' || quiz.title.trim().length < 5 || quiz.title.length > 160
      || titles.has(quiz.title.trim().toLowerCase())) throw new Error('Provide unique assessment titles.');
    titles.add(quiz.title.trim().toLowerCase());
    if (!formats.has(quiz.format) || typeof quiz.description !== 'string' || quiz.description.trim().length < 15 || quiz.description.length > 800) throw new Error('Provide an assessment format and description.');
    if (!Number.isInteger(quiz.minutes) || quiz.minutes < 5 || quiz.minutes > 120) throw new Error('Choose a time limit of 5–120 minutes.');
    if (!Number.isInteger(quiz.certificatePercentage) || quiz.certificatePercentage < 1 || quiz.certificatePercentage > 100) throw new Error('Choose a certificate threshold.');
    if (!Array.isArray(quiz.questions) || quiz.questions.length < 5 || quiz.questions.length > 100) throw new Error('Each assessment needs 5–100 questions.');
    const questions = quiz.questions.map((item, index) => {
      if (!categoryNames.includes(item.category) || !Object.hasOwn(pack.sources, item.source)) throw new Error('Each question requires an established category and source.');
      if (typeof item.explanation !== 'string' || item.explanation.trim().length < 20) throw new Error('Every answer requires an explanation.');
      const reference = pack.sources[item.source];
      const question = questionInput({ ...item, category_id: categoryNames.indexOf(item.category) + 1, points: 1,
        explanation: item.explanation.trim() + '\nReference: ' + reference.title + '\n' + reference.url });
      const signature = question.prompt.normalize('NFKC').toLowerCase();
      if (prompts.has(signature)) throw new Error('Assessment questions must have distinct wording.');
      prompts.add(signature);
      return { ...question, category_name: item.category, content_key: pack.version + ':' + quiz.key + ':' + (index + 1) };
    });
    const required = Math.ceil(questions.length * quiz.certificatePercentage / 100);
    const instructions = [
      quiz.description.trim(),
      'This assessment checks knowledge and decisions in simulated situations. Answer the questions shown on screen.',
      questions.length + ' questions, one point per correct answer. Choose one answer for multiple-choice and true/false items. Type the requested term for identification items; capitalization and extra spaces are ignored.',
      'Time limit: ' + quiz.minutes + ' minutes. One attempt. Work independently without outside help. Questions and answer options are randomized and stay stable when an interrupted attempt resumes.',
      'Review your responses before submitting. The timer continues during a disconnection. Use the same browser and device to recover saved work, reconnect before the deadline, and confirm the server has saved your answers.',
      'DLAS educational achievement certificate: at least ' + quiz.certificatePercentage + '% (' + required + ' of ' + questions.length + ' correct). Your result remains available even below that threshold.',
      'These percentage results are recorded separately from the five-domain research self-assessment. Source references appear with answer explanations after completion.',
    ].join('\n\n');
    return { ...quiz, title: quiz.title.trim(), description: quiz.description.trim(), instructions, questions };
  });
}

function publishAssessmentPack(db, pack, administratorId) {
  const quizzes = validateAssessmentPack(pack);
  const admin = db.prepare("SELECT id FROM users WHERE id=? AND role='admin' AND status='active' AND email_verified=1").get(administratorId);
  if (!admin) throw new Error('An active verified administrator must own the assessments.');
  const hash = crypto.createHash('sha256').update(JSON.stringify(pack)).digest('hex');
  const settingKey = 'assessment-pack:' + pack.version;
  const previous = db.prepare('SELECT setting_value FROM system_settings WHERE setting_key=?').get(settingKey);
  if (previous) {
    const manifest = JSON.parse(previous.setting_value);
    if (manifest.contentHash !== hash) throw new Error('Published content changed. Use a new pack version.');
    return { ...manifest, alreadyPublished: true };
  }
  return db.transaction(() => {
    const categories = new Map(db.prepare('SELECT id,name FROM quiz_categories').all().map(row => [row.name, row.id]));
    const questions = quizzes.flatMap(quiz => quiz.questions);
    if (questions.some(q => !categories.has(q.category_name))) throw new Error('The established categories must exist.');
    if (db.prepare('SELECT id FROM knowledge_quizzes WHERE curriculum_key LIKE ?').get(pack.version + ':%')) throw new Error('Publication is already present without its manifest.');
    const existingPrompts = new Set(db.prepare('SELECT prompt FROM quiz_questions').all().map(q => q.prompt.normalize('NFKC').toLowerCase()));
    if (questions.some(q => existingPrompts.has(q.prompt.normalize('NFKC').toLowerCase()))) throw new Error('A question duplicates existing bank content.');
    const values = questions.flatMap(q => [categories.get(q.category_name), q.prompt, q.type, JSON.stringify(q.options), JSON.stringify(q.answers), q.points, q.explanation, admin.id, q.content_key]);
    db.prepare('INSERT INTO quiz_questions(category_id,prompt,type,options_json,answers_json,points,explanation,created_by,content_key) VALUES '
      + questions.map(() => '(?,?,?,?,?,?,?,?,?)').join(',')).run(...values);
    const ids = new Map(db.prepare('SELECT id,content_key FROM quiz_questions WHERE content_key IN (' + questions.map(() => '?').join(',') + ')')
      .all(...questions.map(q => q.content_key)).map(q => [q.content_key, q.id]));
    const published = [];
    for (const quiz of quizzes) {
      const snapshot = { version: 'knowledge-quiz-v1', content_version: pack.version, assessment_type: quiz.format,
        title: quiz.title, instructions: quiz.instructions, pass_percentage: quiz.certificatePercentage,
        questions: quiz.questions.map(q => ({ id: ids.get(q.content_key), category_id: categories.get(q.category_name), category_name: q.category_name,
          prompt: q.prompt, type: q.type, options: q.options, answers: q.answers, points: q.points, explanation: q.explanation })) };
      const inserted = db.prepare("INSERT INTO knowledge_quizzes(title,description,instructions,created_by,status,time_limit_minutes,max_attempts,pass_percentage,randomize,snapshot_json,curriculum_key,auto_assign_verified) VALUES(?,?,?,?,'published',?,1,?,1,?,?,1)")
        .run(quiz.title, quiz.description, quiz.instructions, admin.id, quiz.minutes, quiz.certificatePercentage, JSON.stringify(snapshot), pack.version + ':' + quiz.key);
      const quizId = Number(inserted.lastInsertRowid);
      enrollPublishedQuizzes(db, null, quizId);
      published.push({ id: quizId, key: quiz.key, title: quiz.title, format: quiz.format, questions: quiz.questions.length });
    }
    const manifest = { version: pack.version, contentHash: hash, publishedAt: new Date().toISOString(), assessments: published,
      questions: questions.length, sources: pack.sources };
    db.prepare('INSERT INTO system_settings(setting_key,setting_value) VALUES(?,?)').run(settingKey, JSON.stringify(manifest));
    db.prepare('INSERT INTO activity_log(user_id,action,details) VALUES(?,?,?)').run(admin.id, 'ASSESSMENT_PACK_PUBLISHED',
      'Published ' + pack.version + ': ' + published.length + ' educational assessments, ' + questions.length + ' original questions; no participant attempts or results created.');
    return manifest;
  })();
}

module.exports = { validateAssessmentPack, publishAssessmentPack };
