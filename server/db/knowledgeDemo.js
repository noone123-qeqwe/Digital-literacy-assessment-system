const { questionInput } = require('../utils/knowledgeQuiz');

// Original development examples. Never install synthetic attempts or results.
const examples = [
  ['Computer Literacy', 'Which component temporarily holds data used by running programs?', ['RAM', 'A printer', 'A monitor', 'A keyboard'], 'An operating system manages hardware and applications.', 'true', 'What common three-letter abbreviation names the central processing unit?', ['CPU', 'central processing unit']],
  ['Internet Literacy', 'Which browser feature helps you save a website address for later?', ['Bookmark', 'Volume control', 'Recycle bin', 'Screen lock'], 'A search engine and a web browser are exactly the same thing.', 'false', 'What does the S in HTTPS indicate about the connection?', ['secure', 'security']],
  ['Information Literacy', 'What is the best way to evaluate an unfamiliar online claim?', ['Compare its evidence with reliable independent sources', 'Trust its share count', 'Trust an anonymous comment', 'Assume the first result is correct'], 'An old photograph can be misleading when shared with a new and unrelated caption.', 'true', 'What is the term for crediting the source of information you use?', ['citation', 'citing', 'attribution', 'referencing']],
  ['Digital Communication', 'Which action helps prevent accidentally sending a private attachment to the wrong person?', ['Check recipients and attachments before sending', 'Add many emojis', 'Use all capital letters', 'Remove the subject line'], 'You should obtain permission before sharing another person’s private messages publicly.', 'true', 'Which email field hides recipients from other recipients?', ['BCC', 'blind carbon copy']],
  ['Digital Safety and Security', 'Which is the safest response to an unexpected message asking for your password?', ['Verify the request using a separate trusted channel', 'Reply with the password', 'Open every attachment', 'Forward your sign-in code'], 'Using the same password on every account reduces the impact of a data breach.', 'false', 'What is the common term for deceptive messages that try to steal credentials?', ['phishing']],
  ['Digital Citizenship', 'Which behavior is responsible digital citizenship?', ['Respecting consent, copyright, and community rules', 'Posting someone’s address without permission', 'Harassing a classmate', 'Claiming someone else’s work'], 'Online actions can contribute to a lasting digital footprint.', 'true', 'What is the term for using another person’s work as your own without proper acknowledgment?', ['plagiarism']],
  ['Productivity Tools', 'Which spreadsheet formula adds cells A1 through A5?', ['=SUM(A1:A5)', '=PRINT(A1:A5)', '=ADDALL()', '=TOTALTEXT(A1)'], 'A heading style can help organize a document and support accessible navigation.', 'true', 'What is the common name for the intersection of a row and a column in a spreadsheet?', ['cell']],
  ['Media Literacy', 'Before reposting a surprising video clip, what should you check?', ['Its original source, date, and context', 'Only the number of reactions', 'Whether its music is popular', 'Only the caption’s font'], 'Sponsored content may be designed to persuade its audience.', 'true', 'What is the common term for a misleading headline written mainly to attract clicks?', ['clickbait', 'click bait']],
];

function seedKnowledgeDemo(db) {
  if (db.prepare("SELECT setting_value FROM system_settings WHERE setting_key='demo_mode'").get()?.setting_value !== '1') return;
  if (db.prepare("SELECT 1 FROM system_settings WHERE setting_key='knowledge_demo_seed_v1'").get()) return;
  const admin = db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
  if (!admin) return;
  db.transaction(() => {
    const groups = [[], [], []];
    for (const [index, example] of examples.entries()) {
      const [name, prompt, options, statement, correct, identification, aliases] = example;
      const category = db.prepare('SELECT id FROM quiz_categories WHERE name=?').get(name);
      if (!category) throw new Error(`Demo category is missing: ${name}`);
      const inputs = [
        { prompt, type: 'multiple_choice', options, correct_answer: '0' },
        { prompt: statement, type: 'true_false', correct_answer: correct },
        { prompt: identification, type: 'identification', accepted_answers: aliases },
      ];
      for (const body of inputs) {
        const question = questionInput({ ...body, category_id: category.id, points: 1, explanation: 'Review the essential skills guide for this category and reflect on the reasoning behind the accepted answer.' });
        const inserted = db.prepare('INSERT INTO quiz_questions(category_id,prompt,type,options_json,answers_json,points,explanation,created_by) VALUES(?,?,?,?,?,?,?,?)')
          .run(category.id, question.prompt, question.type, JSON.stringify(question.options), JSON.stringify(question.answers), 1, question.explanation, admin.id);
        groups[index < 3 ? 0 : index < 6 ? 1 : 2].push({ ...question, id: inserted.lastInsertRowid, category_name: name });
      }
    }
    const titles = ['Demo: Digital Foundations', 'Demo: Communication, Safety and Citizenship', 'Demo: Productivity and Media Skills'];
    const students = db.prepare("SELECT id FROM users WHERE role='respondent' AND is_demo=1").all();
    groups.forEach((questions, index) => {
      const snapshot = { version: 'knowledge-quiz-v1', title: titles[index], instructions: 'Answer independently. Read each question carefully and review your answers before submitting.', pass_percentage: 70, questions };
      const inserted = db.prepare("INSERT INTO knowledge_quizzes(title,description,instructions,created_by,status,time_limit_minutes,max_attempts,pass_percentage,randomize,snapshot_json) VALUES(?,?,?,?,'published',20,3,70,1,?)")
        .run(titles[index], 'Development example using original questions. Review and adapt the question bank before using it for formal evaluation.', snapshot.instructions, admin.id, JSON.stringify(snapshot));
      for (const student of students) db.prepare('INSERT INTO quiz_assignments(quiz_id,user_id,assigned_by) VALUES(?,?,?)').run(inserted.lastInsertRowid, student.id, admin.id);
    });
    db.prepare("INSERT INTO system_settings(setting_key,setting_value) VALUES('knowledge_demo_seed_v1','1')").run();
  })();
}
module.exports = { seedKnowledgeDemo };
