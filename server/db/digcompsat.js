const bank = require('./digcompsat-item-bank.json');

const DIGCOMPSAT_INSTRUMENT_CODE = 'digcompsat-2020';

function ensureDigCompSatQuestionBank(db) {
  const areaIds = Object.fromEntries(
    db.prepare('SELECT id, code FROM competence_areas').all().map((area) => [area.code, area.id])
  );
  const requiredAreas = [...new Set(bank.items.map((item) => item.areaCode))];
  if (requiredAreas.some((code) => !areaIds[code])) {
    return { ready: false, count: 0 };
  }

  const existing = db.prepare('SELECT id, question_number, question_text, competence_area_id, response_type, proficiency_level, framework_competence_id, is_active FROM questions WHERE instrument_code = ? ORDER BY question_number')
    .all(DIGCOMPSAT_INSTRUMENT_CODE);
  if (existing.length === bank.items.length) {
    const byNumber = new Map(bank.items.map((item) => [item.number, item]));
    if (existing.some((row) => {
      const expected = byNumber.get(row.question_number);
      return !expected || row.question_text !== expected.text || row.response_type !== expected.responseType
        || row.competence_area_id !== areaIds[expected.areaCode];
    })) {
      throw new Error('The stored DigCompSAT item bank differs from the source version; review it manually before creating new assessments.');
    }
    const updateFrameworkId = db.prepare('UPDATE questions SET framework_competence_id = ?, proficiency_level = ?, is_active = 1 WHERE id = ?');
    const updateMetadata = db.transaction(() => {
      for (const row of existing) {
        const item = byNumber.get(row.question_number);
        if (row.framework_competence_id !== item.digcompId || row.proficiency_level !== item.level || row.is_active !== 1) {
          updateFrameworkId.run(item.digcompId, item.level, row.id);
        }
      }
    });
    updateMetadata();
    return { ready: true, count: existing.length };
  }
  if (existing.length) {
    throw new Error(`DigCompSAT item bank is incomplete (${existing.length}/${bank.items.length}); review the database before seeding it again.`);
  }

  const insertItems = db.transaction(() => {
    const insert = db.prepare(`
      INSERT INTO questions (
        competence_area_id, question_number, question_text, instrument_code,
        response_type, proficiency_level, framework_competence_id, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `);
    for (const item of bank.items) {
      insert.run(
        areaIds[item.areaCode],
        item.number,
        item.text,
        DIGCOMPSAT_INSTRUMENT_CODE,
        item.responseType,
        item.level,
        item.digcompId
      );
    }
  });
  insertItems();
  return { ready: true, count: bank.items.length };
}

module.exports = {
  DIGCOMPSAT_INSTRUMENT_CODE,
  digCompSatSource: bank.source,
  digCompSatItems: bank.items,
  ensureDigCompSatQuestionBank,
};
