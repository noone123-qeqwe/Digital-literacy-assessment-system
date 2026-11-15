const crypto = require('node:crypto');

const normalize = (value) => String(value).normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
const levelFor = (score) => score >= 90 ? 'Advanced' : score >= 80 ? 'Proficient' : score >= 70 ? 'Developing' : score >= 60 ? 'Beginner' : 'Needs Improvement';
function shuffled(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const other = crypto.randomInt(index + 1);
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}
function questionInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.prompt !== 'string' || (body.explanation !== undefined && typeof body.explanation !== 'string')) throw new Error('Provide valid question text and explanation.');
  const categoryId = Number(body.category_id);
  const prompt = String(body.prompt || '').trim();
  const explanation = String(body.explanation || '').trim();
  const points = Number(body.points);
  if (!Number.isSafeInteger(categoryId) || categoryId < 1 || prompt.length < 5 || prompt.length > 2000 || explanation.length > 2000 || !Number.isInteger(points) || points < 1 || points > 100) throw new Error('Choose a category, a question of 5–2000 characters, and 1–100 points.');
  const type = body.type;
  let options = [], answers = [];
  if (type === 'multiple_choice') {
    if (!Array.isArray(body.options) || body.options.length < 2 || body.options.length > 6) throw new Error('Provide two to six answer options.');
    if (body.options.some((option) => typeof option !== 'string')) throw new Error('Answer options must be text.');
    options = body.options.map((text, index) => ({ id: String(index), text: text.trim() }));
    if (options.some((option) => !option.text || option.text.length > 500) || new Set(options.map((option) => normalize(option.text))).size !== options.length) throw new Error('Options must be distinct and contain 1–500 characters.');
    if (!options.some((option) => option.id === String(body.correct_answer))) throw new Error('Choose the correct option.');
    answers = [String(body.correct_answer)];
  } else if (type === 'true_false') {
    options = [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }];
    if (!['true', 'false'].includes(String(body.correct_answer))) throw new Error('Choose True or False as the correct answer.');
    answers = [String(body.correct_answer)];
  } else if (type === 'identification') {
    if (!Array.isArray(body.accepted_answers) || !body.accepted_answers.length || body.accepted_answers.length > 10) throw new Error('Provide one to ten accepted answers.');
    if (body.accepted_answers.some((answer) => typeof answer !== 'string')) throw new Error('Accepted answers must be text.');
    answers = [...new Set(body.accepted_answers.map((answer) => answer.trim()))];
    if (answers.some((answer) => !answer || answer.length > 200)) throw new Error('Accepted answers must contain 1–200 characters.');
  } else throw new Error('Choose a supported question type.');
  return { category_id: categoryId, prompt, type, options, answers, points, explanation };
}
function publicSnapshot(snapshot) {
  return { ...snapshot, questions: snapshot.questions.map(({ answers, explanation, ...question }) => question) };
}
function scoreSnapshot(snapshot, responses) {
  const byId = new Map(responses.map((response) => [response.question_id, response.answer]));
  const categories = new Map();
  const questions = snapshot.questions.map((question) => {
    const answer = byId.get(question.id) ?? '';
    const correct = question.answers.some((key) => question.type === 'identification' ? normalize(key) === normalize(answer) : key === answer);
    const earned = correct ? question.points : 0;
    if (!categories.has(question.category_id)) categories.set(question.category_id, { id: question.category_id, name: question.category_name, earned: 0, possible: 0 });
    const category = categories.get(question.category_id);
    category.earned += earned;
    category.possible += question.points;
    return { ...question, answer, correct, earned };
  });
  const earned = questions.reduce((sum, question) => sum + question.earned, 0);
  const possible = questions.reduce((sum, question) => sum + question.points, 0);
  const percentage = Math.round(earned / possible * 10000) / 100;
  return { earned, possible, percentage, level: levelFor(percentage), certificateEarned: percentage >= snapshot.pass_percentage,
    questions, categories: [...categories.values()].map((category) => ({ ...category, percentage: Math.round(category.earned / category.possible * 10000) / 100 })) };
}
module.exports = { questionInput, publicSnapshot, scoreSnapshot, levelFor, shuffled };
