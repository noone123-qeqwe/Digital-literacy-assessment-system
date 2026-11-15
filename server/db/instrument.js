const areas = [
  { name: 'Information and Data Literacy', code: 'IDL', description: 'Skills related to finding, evaluating, and managing digital information and data.', sort_order: 1 },
  { name: 'Communication and Collaboration', code: 'CC', description: 'Skills related to communicating and collaborating effectively using digital tools.', sort_order: 2 },
  { name: 'Digital Content Creation', code: 'DCC', description: 'Skills related to creating and editing digital content across various formats.', sort_order: 3 },
  { name: 'Safety', code: 'S', description: 'Skills related to protecting devices, data, privacy, and practicing safe online behavior.', sort_order: 4 },
  { name: 'Problem Solving', code: 'PS', description: 'Skills related to identifying and solving problems using digital technologies.', sort_order: 5 },
];

const questions = [
  { area: 'IDL', num: 1, text: 'I use advanced search techniques (keywords, filters, and operators) when looking for information online.' },
  { area: 'IDL', num: 2, text: 'I can tell whether a website or post is a reliable source of information.' },
  { area: 'IDL', num: 3, text: 'I can find information from more than one source and compare them.' },
  { area: 'IDL', num: 4, text: 'I organize my digital files, bookmarks, and references so I can find them again.' },
  { area: 'IDL', num: 5, text: 'I can extract and summarize the important points of a long online article or video.' },
  { area: 'IDL', num: 6, text: 'I can save and manage data gathered from online forms and other digital sources.' },
  { area: 'CC', num: 7, text: 'I can communicate effectively with others using email, messaging applications, and other digital platforms.' },
  { area: 'CC', num: 8, text: 'I can share files, documents, and other digital resources with classmates using online platforms.' },
  { area: 'CC', num: 9, text: 'I can participate in online discussions and virtual meetings appropriately.' },
  { area: 'CC', num: 10, text: 'I can work with classmates on shared documents and collaborative online projects.' },
  { area: 'CC', num: 11, text: 'I follow proper online communication etiquette when interacting with others.' },
  { area: 'CC', num: 12, text: 'I can choose the appropriate digital platform for communicating and collaborating on academic tasks.' },
  { area: 'DCC', num: 13, text: 'I can create and edit documents using word-processing applications.' },
  { area: 'DCC', num: 14, text: 'I can create presentations using digital presentation tools.' },
  { area: 'DCC', num: 15, text: 'I can use spreadsheet applications to organize and present data.' },
  { area: 'DCC', num: 16, text: 'I can create and edit digital images, videos, or other multimedia content.' },
  { area: 'DCC', num: 17, text: 'I can combine information from different digital sources to create original content.' },
  { area: 'DCC', num: 18, text: 'I understand the importance of citing sources and respecting copyright when creating digital content.' },
  { area: 'S', num: 19, text: 'I create strong passwords to protect my online accounts.' },
  { area: 'S', num: 20, text: 'I can identify suspicious links, emails, and messages that may contain online threats.' },
  { area: 'S', num: 21, text: 'I avoid sharing personal and confidential information with unknown individuals or untrusted websites.' },
  { area: 'S', num: 22, text: 'I use appropriate security measures, such as antivirus software and device updates, to protect my devices.' },
  { area: 'S', num: 23, text: 'I understand the importance of protecting my privacy when using social media and other online platforms.' },
  { area: 'S', num: 24, text: 'I practice responsible and safe behavior when accessing and using the internet.' },
  { area: 'PS', num: 25, text: 'I can identify and solve common problems encountered when using computers and digital devices.' },
  { area: 'PS', num: 26, text: 'I can troubleshoot basic software and hardware problems.' },
  { area: 'PS', num: 27, text: 'I can identify the appropriate digital tools or applications needed to complete a specific task.' },
  { area: 'PS', num: 28, text: 'I can learn how to use new software and digital applications independently.' },
  { area: 'PS', num: 29, text: 'I can adapt to changes in technology and apply new digital skills when necessary.' },
  { area: 'PS', num: 30, text: 'I can use digital technologies to find solutions to academic and everyday problems.' },
];

function initializeInstrument(db) {
  const currentAreaCount = db.prepare('SELECT COUNT(*) AS count FROM competence_areas').get().count;
  const currentQuestionCount = db.prepare('SELECT COUNT(*) AS count FROM questions').get().count;
  if (currentAreaCount === areas.length && currentQuestionCount === questions.length) {
    const areaIds = Object.fromEntries(db.prepare('SELECT id, code FROM competence_areas').all().map((row) => [row.code, row.id]));
    const complete = areas.every((area) => areaIds[area.code])
      && questions.every((question) => db.prepare('SELECT 1 FROM questions WHERE question_number = ? AND competence_area_id = ?').get(question.num, areaIds[question.area]));
    if (complete) return areaIds;
  }
  if (currentAreaCount || currentQuestionCount) {
    throw new Error('The competence areas or question bank is partially populated. Review it manually before initializing the study instrument.');
  }

  const insert = db.transaction(() => {
    const areaIds = {};
    const insertArea = db.prepare('INSERT INTO competence_areas (name, code, description, sort_order) VALUES (?, ?, ?, ?)');
    for (const area of areas) {
      areaIds[area.code] = insertArea.run(area.name, area.code, area.description, area.sort_order).lastInsertRowid;
    }
    const insertQuestion = db.prepare('INSERT INTO questions (competence_area_id, question_number, question_text, is_active) VALUES (?, ?, ?, 1)');
    for (const question of questions) insertQuestion.run(areaIds[question.area], question.num, question.text);
    return areaIds;
  });
  return insert();
}

module.exports = { areas, questions, initializeInstrument };
