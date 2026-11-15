const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { drawCompletionAward } = require('../utils/completionAward');
const { db, logActivity } = require('../db/database');
const { authenticate, authorize, canAccessAttempt, canAccessAssessment } = require('../middleware/auth');

function auditSuccessfulExport(req, res, action, details) {
  res.once('finish', () => {
    if (res.statusCode < 400) logActivity(req.user.id, action, details);
  });
}

// GET /api/export/results/:attemptId/pdf - Individual participant result PDF
router.get('/results/:attemptId/pdf', authenticate, (req, res) => {
  try {
    const attemptId = Number.parseInt(req.params.attemptId, 10);
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid attempt ID' });
    }
    const attempt = db.prepare(`
      SELECT at.*, asm.title as assessment_title, asm.description as assessment_description,
             u.first_name, u.last_name, u.email,
             p.age, p.sex, p.municipality, p.barangay, p.senior_high_school, p.shs_strand,
             p.has_computer_at_home, p.internet_access_type
      FROM assessment_attempts at
      JOIN assessments asm ON at.assessment_id = asm.id
      JOIN users u ON at.user_id = u.id
      LEFT JOIN respondent_profiles p ON u.id = p.user_id
      WHERE at.id = ?
    `).get(attemptId);

    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Result not found' });
    }

    if (!canAccessAttempt(req.user, attempt)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (attempt.status !== 'completed') {
      return res.status(409).json({ success: false, message: 'Results are available after submission' });
    }
    auditSuccessfulExport(req, res, 'RESULT_EXPORT_PDF', `Downloaded individual result PDF for attempt #${attempt.id}`);
    const isDigCompSat = attempt.scoring_version === 'digcompsat-self-reflection-0-3.1';
    const scoreScaleMax = isDigCompSat ? 3 : 4;

    const areaResults = db.prepare(`
      SELECT ar.*, ca.name as area_name, ca.code as area_code
      FROM area_results ar
      JOIN competence_areas ca ON ar.competence_area_id = ca.id
      WHERE ar.attempt_id = ?
      ORDER BY ca.sort_order ASC
    `).all(attemptId);

    // Create PDF
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const filename = `Digital_Literacy_Result_${attempt.id}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).font('Helvetica-Bold').text('DIGITAL LITERACY ASSESSMENT REPORT', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('College of Computer Studies | Masbate Colleges', { align: 'center' });
    doc.moveDown();
    doc.strokeColor('#2563eb').lineWidth(2).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown();

    // Respondent Info Box
    doc.fontSize(12).font('Helvetica-Bold').text('Participant Profile');
    doc.fontSize(10).font('Helvetica');
    doc.text(`Name: ${attempt.first_name} ${attempt.last_name}`);
    doc.text(`Email: ${attempt.email}`);
    doc.text(`Sex / Age: ${attempt.sex || 'N/A'} / ${attempt.age || 'N/A'} years old`);
    doc.text(`Origin: ${attempt.barangay ? attempt.barangay + ', ' : ''}${attempt.municipality || 'N/A'}`);
    doc.text(`High School / Strand: ${attempt.senior_high_school || 'N/A'} (${attempt.shs_strand || 'N/A'})`);
    doc.text(`Home PC: ${attempt.has_computer_at_home === 1 ? 'Yes' : 'No'} | Internet: ${attempt.internet_access_type || 'N/A'}`);
    doc.moveDown();

    // Overall Score Box
    doc.rect(40, doc.y, 515, 60).fillAndStroke('#eff6ff', '#bfdbfe');
    const boxY = doc.y;
    doc.fillColor('#1e40af').fontSize(14).font('Helvetica-Bold').text(isDigCompSat ? 'OVERALL SELF-REFLECTION MEAN' : 'OVERALL DIGITAL LITERACY PERFORMANCE', 50, boxY + 12);
    doc.fontSize(18).text(`${attempt.overall_mean ?? 'N/A'} / ${scoreScaleMax}.00`, 50, boxY + 30);
    if (!isDigCompSat) doc.fontSize(14).text(`Level: ${attempt.overall_level || 'N/A'}`, 250, boxY + 32);
    doc.fillColor('#000000');
    doc.y = boxY + 75;

    // Competence Areas Breakdown
    doc.fontSize(12).font('Helvetica-Bold').text(isDigCompSat ? 'Self-Reported Competence by Area (DigComp 2.1)' : 'Performance by Competence Area (DigComp 2.1 Framework)');
    doc.moveDown(0.5);

    // Table Header
    const startY = doc.y;
    doc.rect(40, startY, 515, 20).fill('#f1f5f9');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10);
    doc.text('Code', 45, startY + 5);
    doc.text('Competence Area', 90, startY + 5);
    doc.text(isDigCompSat ? 'Mean / 3' : 'Weighted Mean', 340, startY + 5);
    doc.text('Std. Dev.', 440, startY + 5);
    doc.text(isDigCompSat ? 'Interpretation' : 'Proficiency Level', 495, startY + 5);

    let curY = startY + 22;
    doc.font('Helvetica').fontSize(9);

    for (const area of areaResults) {
      doc.rect(40, curY, 515, 20).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      doc.text(area.area_code, 45, curY + 5);
      doc.text(area.area_name, 90, curY + 5, { width: 240 });
      doc.text(String(area.weighted_mean), 340, curY + 5);
      doc.text(String(area.standard_deviation || '0.00'), 440, curY + 5);
      doc.text(area.level, 495, curY + 5);
      curY += 22;
    }

    doc.y = curY + 15;

    // Interpretation Scale Reference
    doc.fontSize(10).font('Helvetica-Bold').text(isDigCompSat ? 'Instrument and score note:' : 'Evaluation Reference Scale:');
    doc.fontSize(8).font('Helvetica');
    doc.text(isDigCompSat
      ? 'DigCompSAT is a self-reflection tool; these 0–3 self-ratings are not objective right/wrong test scores or official proficiency classifications. This English item bank has not been locally validated with Masbate Colleges students. Source: Clifford et al. (2020), JRC123226, doi:10.2760/77437; European Union, CC BY 4.0. The local mapping is not endorsed by or the responsibility of the European Commission.'
      : '1.00 – 1.75: Low | 1.76 – 2.50: Moderate | 2.51 – 3.25: High | 3.26 – 4.00: Very High');
    const skillsToShow = req.user.role === 'respondent' && req.user.id === attempt.user_id
      ? attempt.desired_skills
      : (attempt.desired_skills_reviewed_at ? attempt.desired_skills_redacted : null);
    if (skillsToShow) {
      doc.moveDown();
      doc.fontSize(10).font('Helvetica-Bold').text('Part III: Digital Skills to Develop');
      doc.fontSize(9).font('Helvetica').text(skillsToShow, { width: 515 });
    } else if (attempt.desired_skills && !(req.user.role === 'respondent' && req.user.id === attempt.user_id)) {
      doc.moveDown();
      doc.fontSize(9).font('Helvetica-Oblique').fillColor('#64748b').text('Part III response withheld pending privacy review.');
      doc.fillColor('#000000');
    }
    doc.moveDown();

    // Footer
    doc.fontSize(8).fillColor('#64748b').text(`Generated automatically by Digital Literacy Assessment System on ${new Date().toLocaleDateString()}`, { align: 'center' });

    doc.end();
  } catch (err) {
    console.error('Error generating PDF:', err);
    res.status(500).json({ success: false, message: 'Failed to generate PDF' });
  }
});

// GET /api/export/awards/:attemptId/pdf - Completion-only digital award
router.get('/awards/:attemptId/pdf', authenticate, (req, res) => {
  try {
    if (process.env.DLAS_FREE_DEMO === 'true') {
      return res.status(403).json({ success: false, message: 'Completion awards are disabled for synthetic demo records.' });
    }
    const attemptId = Number.parseInt(req.params.attemptId, 10);
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid attempt ID' });
    }
    const attempt = db.prepare(`
      SELECT at.id, at.assessment_id, at.user_id, at.status, at.completed_at, at.scoring_version,
             asm.title AS assessment_title,
             u.first_name, u.last_name
      FROM assessment_attempts at
      JOIN assessments asm ON asm.id = at.assessment_id
      JOIN users u ON u.id = at.user_id
      WHERE at.id = ?
    `).get(attemptId);
    if (!attempt) return res.status(404).json({ success: false, message: 'Award not found' });
    if (!canAccessAttempt(req.user, attempt)) return res.status(403).json({ success: false, message: 'Access denied' });
    if (attempt.status !== 'completed' || !attempt.completed_at) {
      return res.status(409).json({ success: false, message: 'The completion award is available after the assessment is submitted.' });
    }

    auditSuccessfulExport(req, res, 'ASSESSMENT_COMPLETION_AWARD', `Downloaded completion award for attempt #${attempt.id}`);
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0 });
    const filename = `Masbate_Colleges_Completion_Award_${attempt.id}.pdf`;
    drawCompletionAward(doc, attempt);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);
    doc.end();
  } catch (err) {
    console.error('Error generating assessment completion award:', err);
    res.status(500).json({ success: false, message: 'Failed to generate the completion award' });
  }
});

// GET /api/export/results/:attemptId/excel - Individual result Excel
router.get('/results/:attemptId/excel', authenticate, async (req, res) => {
  try {
    const attemptId = Number.parseInt(req.params.attemptId, 10);
    if (!Number.isInteger(attemptId) || attemptId <= 0) {
      return res.status(400).json({ success: false, message: 'Invalid attempt ID' });
    }
    const attempt = db.prepare(`
      SELECT at.*, asm.title as assessment_title, u.first_name, u.last_name, u.email,
             p.age, p.sex, p.municipality, p.senior_high_school, p.shs_strand
      FROM assessment_attempts at
      JOIN assessments asm ON at.assessment_id = asm.id
      JOIN users u ON at.user_id = u.id
      LEFT JOIN respondent_profiles p ON u.id = p.user_id
      WHERE at.id = ?
    `).get(attemptId);

    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Result not found' });
    }
    if (!canAccessAttempt(req.user, attempt)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (attempt.status !== 'completed') {
      return res.status(409).json({ success: false, message: 'Results are available after submission' });
    }
    auditSuccessfulExport(req, res, 'RESULT_EXPORT_EXCEL', `Downloaded individual result Excel for attempt #${attempt.id}`);
    const isDigCompSat = attempt.scoring_version === 'digcompsat-self-reflection-0-3.1';

    const currentResponses = db.prepare(`
      SELECT r.question_id, r.rating, q.question_number, q.question_text, ca.name as area_name, ca.code as area_code
      FROM responses r
      JOIN questions q ON r.question_id = q.id
      JOIN competence_areas ca ON q.competence_area_id = ca.id
      WHERE r.attempt_id = ?
      ORDER BY ca.sort_order ASC, q.question_number ASC
    `).all(attemptId);
    let snapshot;
    try { snapshot = JSON.parse(attempt.instrument_snapshot || 'null'); } catch { snapshot = null; }
    const snapshotItems = new Map((snapshot?.items || []).map((item) => [item.question_id, item]));
    const responses = currentResponses.map((response) => ({
      ...response,
      ...(snapshotItems.get(response.question_id) ? {
        question_number: snapshotItems.get(response.question_id).question_number,
        question_text: snapshotItems.get(response.question_id).question_text,
        area_name: snapshotItems.get(response.question_id).area_name,
        area_code: snapshotItems.get(response.question_id).area_code,
        framework_competence_id: snapshotItems.get(response.question_id).framework_competence_id,
        response_type: snapshotItems.get(response.question_id).response_type,
      } : {}),
    }));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Assessment Result');

    sheet.columns = [
      { header: 'No.', key: 'num', width: 8 },
      ...(isDigCompSat ? [
        { header: 'DigComp ID', key: 'framework_id', width: 14 },
        { header: 'Response Type', key: 'response_type', width: 16 },
      ] : []),
      { header: 'Competence Area', key: 'area', width: 30 },
      { header: 'Competency Statement', key: 'text', width: 65 },
      { header: isDigCompSat ? 'Self-Rating (0-3)' : 'Self-Rating (1-4)', key: 'rating', width: 16 }
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

    for (const r of responses) {
      sheet.addRow({
        num: r.question_number,
        framework_id: r.framework_competence_id || '',
        response_type: r.response_type || '',
        area: `${r.area_name} (${r.area_code})`,
        text: r.question_text,
        rating: r.rating
      });
    }

    // Add summary row
    sheet.addRow({});
    sheet.addRow({
      num: '',
      area: isDigCompSat ? 'OVERALL SELF-RATING MEAN' : 'OVERALL WEIGHTED MEAN',
      text: isDigCompSat ? 'Interpretation: self-reflection profile; not an official proficiency level' : `Proficiency Level: ${attempt.overall_level}`,
      rating: attempt.overall_mean
    });

    if (!isDigCompSat) {
      sheet.addRow({});
      sheet.addRow({ num: '', area: 'PART III', text: 'Skills the respondent would like to develop', rating: '' });
      const skillsToShow = req.user.role === 'respondent' && req.user.id === attempt.user_id
        ? attempt.desired_skills
        : (attempt.desired_skills_reviewed_at ? attempt.desired_skills_redacted : null);
      sheet.addRow({
        num: '', area: '',
        text: skillsToShow || (attempt.desired_skills && req.user.role !== 'respondent' ? 'Withheld pending privacy review' : 'No response provided'),
        rating: '',
      });
    } else {
      const notes = workbook.addWorksheet('Instrument Notes');
      notes.addRows([
        ['Instrument', 'DigCompSAT self-reflection item bank (2020 final English version)'],
        ['Score scale', '0–3; knowledge, skills, and attitude response labels differ by item type.'],
        ...['knowledge', 'skills', 'attitude'].map((type) => [
          `${type[0].toUpperCase()}${type.slice(1)} scale`,
          (snapshot?.responseScales?.[type] || []).map((option) => `${option.value} = ${option.label}`).join(' | '),
        ]),
        ['Interpretation', 'Self-reported profile, not a right/wrong test score or official proficiency classification.'],
        ['Local validation', 'Not yet locally validated with Masbate Colleges students. Keep separate from thesis questionnaire analyses.'],
        ['Source', 'Clifford et al. (2020), JRC123226, doi:10.2760/77437'],
        ['Reuse and local changes', 'European Union, 2020, CC BY 4.0. Source wording imported in English and mapped to local competence-area codes.'],
        ['Commission disclaimer', 'The European Commission is not responsible for or endorsing this local implementation.'],
      ]);
      notes.getColumn(1).width = 22;
      notes.getColumn(2).width = 105;
      notes.getColumn(1).font = { bold: true };
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Result_${attempt.id}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error generating Excel:', err);
    res.status(500).json({ success: false, message: 'Failed to generate Excel' });
  }
});

// GET /api/export/assessment/:id/excel - Full institutional cohort dataset
router.get('/assessment/:id/excel', authenticate, authorize('admin', 'assessor'), async (req, res) => {
  try {
    const assessment = db.prepare('SELECT id, title, scoring_version, instrument_snapshot FROM assessments WHERE id = ?').get(req.params.id);
    if (!assessment) {
      return res.status(404).json({ success: false, message: 'Assessment not found' });
    }
    if (!canAccessAssessment(req.user, assessment.id)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    const isDigCompSat = assessment.scoring_version === 'digcompsat-self-reflection-0-3.1';
    let assessmentSnapshot;
    try { assessmentSnapshot = JSON.parse(assessment.instrument_snapshot || 'null'); } catch { assessmentSnapshot = null; }
    const instrumentItems = assessmentSnapshot?.items || [];
    if (!instrumentItems.length) return res.status(409).json({ success: false, message: 'This assessment has no saved instrument version to export.' });
    auditSuccessfulExport(req, res, 'COHORT_EXPORT_EXCEL', `Downloaded de-identified cohort report for assessment #${assessment.id}`);

    const participants = db.prepare(`
      WITH completed AS (
        SELECT at.id AS attempt_id, at.user_id, at.overall_mean, at.overall_level, at.instrument_snapshot,
               at.desired_skills_redacted, at.desired_skills_reviewed_at,
               p.age, p.sex, p.municipality, p.junior_high_school_type, p.senior_high_school_type,
               p.shs_strand, p.monthly_family_income, p.has_computer_at_home, p.internet_access_type
        FROM assessment_attempts at
        JOIN assessment_assignments aa ON aa.assessment_id = at.assessment_id AND aa.user_id = at.user_id
        LEFT JOIN respondent_profiles p ON p.user_id = at.user_id
        WHERE at.assessment_id = ? AND at.status = 'completed'
      )
      SELECT * FROM completed ORDER BY attempt_id
    `).all(req.params.id);

    if (participants.length < 5) {
      return res.status(409).json({ success: false, message: 'Research exports are withheld until at least five completed participants are available.' });
    }

    const respondentCodeByAttempt = new Map(participants.map((participant) => [participant.attempt_id, `R-${crypto.randomBytes(6).toString('hex').toUpperCase()}`]));
    const profileGroupKey = (participant) => {
      const age = participant.age == null ? 'Unspecified' : participant.age <= 17 ? '17 and below' : participant.age <= 20 ? '18-20' : '21 above';
      const municipality = !participant.municipality ? 'Unspecified'
        : participant.municipality === 'Masbate City' ? 'Masbate City'
          : /Island|Burias|Ticao/i.test(participant.municipality) ? 'Island municipality' : 'Other mainland municipality';
      const internet = !participant.internet_access_type ? 'Unspecified'
        : participant.internet_access_type === 'No Internet Access' ? 'No internet' : 'Has internet';
      return JSON.stringify([
        age, participant.sex || 'Unspecified', municipality,
        participant.junior_high_school_type || 'Unspecified', participant.senior_high_school_type || 'Unspecified',
        participant.monthly_family_income || 'Unspecified', participant.has_computer_at_home === 1 ? 'Yes' : participant.has_computer_at_home === 0 ? 'No' : 'Unspecified',
        internet,
      ]);
    };
    const profileGroupSizes = new Map();
    const profileCategorySizes = new Map();
    const profileFields = [
      'age', 'sex', 'municipality', 'junior_high_school_type', 'senior_high_school_type',
      'monthly_family_income', 'has_computer_at_home', 'internet_access_type',
    ];
    for (const participant of participants) {
      const key = profileGroupKey(participant);
      profileGroupSizes.set(key, (profileGroupSizes.get(key) || 0) + 1);
      for (const field of profileFields) {
        const value = String(participant[field] ?? 'Unspecified');
        if (!profileCategorySizes.has(field)) profileCategorySizes.set(field, new Map());
        const counts = profileCategorySizes.get(field);
        counts.set(value, (counts.get(value) || 0) + 1);
      }
    }
    for (const participant of participants) {
      participant.respondent_code = respondentCodeByAttempt.get(participant.attempt_id);
      const age = participant.age == null ? 'Unspecified' : participant.age <= 17 ? '17 and below' : participant.age <= 20 ? '18-20' : '21 above';
      const municipality = !participant.municipality ? 'Unspecified'
        : participant.municipality === 'Masbate City' ? 'Masbate City'
          : /Island|Burias|Ticao/i.test(participant.municipality) ? 'Island municipality' : 'Other mainland municipality';
      const internet = !participant.internet_access_type ? 'Unspecified'
        : participant.internet_access_type === 'No Internet Access' ? 'No internet' : 'Has internet';
      const combinedGroupIsSafe = profileGroupSizes.get(profileGroupKey(participant)) >= 5;
      const categoryIsSafe = (field) => profileCategorySizes.get(field).get(String(participant[field] ?? 'Unspecified')) >= 5;
      participant.profile = {
        age_group: combinedGroupIsSafe && categoryIsSafe('age') ? age : null,
        sex: combinedGroupIsSafe && categoryIsSafe('sex') ? participant.sex || 'Unspecified' : null,
        municipality_group: combinedGroupIsSafe && categoryIsSafe('municipality') ? municipality : null,
        junior_high_school_type: combinedGroupIsSafe && categoryIsSafe('junior_high_school_type') ? participant.junior_high_school_type || 'Unspecified' : null,
        senior_high_school_type: combinedGroupIsSafe && categoryIsSafe('senior_high_school_type') ? participant.senior_high_school_type || 'Unspecified' : null,
        income: combinedGroupIsSafe && categoryIsSafe('monthly_family_income') ? participant.monthly_family_income || 'Unspecified' : null,
        pc: combinedGroupIsSafe && categoryIsSafe('has_computer_at_home') ? (participant.has_computer_at_home === 1 ? 'Yes' : participant.has_computer_at_home === 0 ? 'No' : 'Unspecified') : null,
        internet: combinedGroupIsSafe && categoryIsSafe('internet_access_type') ? internet : null,
      };
    }

    const questionNumberByAttempt = new Map();
    for (const participant of participants) {
      try {
        const snapshot = JSON.parse(participant.instrument_snapshot || 'null');
        questionNumberByAttempt.set(participant.attempt_id, new Map((snapshot?.items || []).map((item) => [item.question_id, item.question_number])));
      } catch { questionNumberByAttempt.set(participant.attempt_id, new Map()); }
    }
    const responseRows = participants.length
      ? db.prepare(`
          SELECT at.id AS attempt_id, r.question_id, r.rating
          FROM assessment_attempts at
          JOIN responses r ON r.attempt_id = at.id
          WHERE at.id IN (${participants.map(() => '?').join(',')})
          ORDER BY at.id, r.question_id
        `).all(...participants.map((participant) => participant.attempt_id))
      : [];
    const ratingsByAttempt = new Map();
    for (const row of responseRows) {
      if (!ratingsByAttempt.has(row.attempt_id)) ratingsByAttempt.set(row.attempt_id, {});
      const questionNumber = questionNumberByAttempt.get(row.attempt_id)?.get(row.question_id);
      if (Number.isInteger(questionNumber)) ratingsByAttempt.get(row.attempt_id)[`Q${String(questionNumber).padStart(2, '0')}`] = row.rating;
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Profile and Scores');
    sheet.columns = [
      { header: 'Respondent Code', key: 'respondent_code', width: 18 },
      { header: 'Age Group', key: 'age_group', width: 16 },
      { header: 'Sex', key: 'sex', width: 20 },
      { header: 'Municipality Group', key: 'municipality_group', width: 24 },
      { header: 'Junior High School Type', key: 'junior_high_school_type', width: 24 },
      { header: 'Senior High School Type', key: 'senior_high_school_type', width: 24 },
      { header: 'Family Income Range', key: 'income', width: 22 },
      { header: 'Home PC', key: 'pc', width: 10 },
      { header: 'Internet', key: 'internet', width: 18 },
      { header: isDigCompSat ? 'Self-Rating Mean (0-3)' : 'Overall Mean (1-4)', key: 'mean', width: 18 },
      { header: isDigCompSat ? 'Interpretation' : 'Proficiency Level', key: 'level', width: 22 }
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCBD5E1' } };
    for (const participant of participants) {
      sheet.addRow({
        respondent_code: participant.respondent_code,
        age_group: participant.profile.age_group || 'Suppressed (<5 in category or matching profiles)',
        sex: participant.profile.sex || 'Suppressed (<5 in category or matching profiles)',
        municipality_group: participant.profile.municipality_group || 'Suppressed (<5 in category or matching profiles)',
        junior_high_school_type: participant.profile.junior_high_school_type || 'Suppressed (<5 in category or matching profiles)',
        senior_high_school_type: participant.profile.senior_high_school_type || 'Suppressed (<5 in category or matching profiles)',
        income: participant.profile.income || 'Suppressed (<5 in category or matching profiles)',
        pc: participant.profile.pc || 'Suppressed (<5 in category or matching profiles)',
        internet: participant.profile.internet || 'Suppressed (<5 in category or matching profiles)',
        mean: participant.overall_mean,
        level: participant.overall_level,
      });
    }

    const itemSheet = workbook.addWorksheet('Item Ratings');
    itemSheet.columns = [
      { header: 'Respondent Code', key: 'respondent_code', width: 18 },
      ...instrumentItems.map((item) => ({ header: `Q${String(item.question_number).padStart(2, '0')}`, key: `Q${String(item.question_number).padStart(2, '0')}`, width: 8 })),
    ];
    itemSheet.getRow(1).font = { bold: true };
    itemSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCBD5E1' } };
    for (const participant of participants) {
      itemSheet.addRow({ respondent_code: participant.respondent_code, ...(ratingsByAttempt.get(participant.attempt_id) || {}) });
    }

    if (isDigCompSat) {
      const notes = workbook.addWorksheet('Instrument Notes');
      notes.addRows([
        ['Instrument', 'DigCompSAT self-reflection item bank (2020 final English version)'],
        ['Items', `${instrumentItems.length} saved instrument items`],
        ['Score scale', '0–3; knowledge, skills, and attitude response labels differ by item type.'],
        ...['knowledge', 'skills', 'attitude'].map((type) => [
          `${type[0].toUpperCase()}${type.slice(1)} scale`,
          (assessmentSnapshot?.responseScales?.[type] || []).map((option) => `${option.value} = ${option.label}`).join(' | '),
        ]),
        ['Interpretation', 'Self-reported profile, not a right/wrong test score or official proficiency classification.'],
        ['Local validation', 'Not yet locally validated with Masbate Colleges students. Keep separate from thesis questionnaire analyses.'],
        ['Source', 'Clifford et al. (2020), JRC123226, doi:10.2760/77437'],
        ['Reuse and local changes', 'European Union, 2020, CC BY 4.0. Source wording imported in English and mapped to local competence-area codes.'],
        ['Commission disclaimer', 'The European Commission is not responsible for or endorsing this local implementation.'],
      ]);
      notes.getColumn(1).width = 22;
      notes.getColumn(2).width = 105;
      notes.getColumn(1).font = { bold: true };
      const itemMetadata = workbook.addWorksheet('Instrument Items');
      itemMetadata.columns = [
        { header: 'Item', key: 'number', width: 10 },
        { header: 'DigComp ID', key: 'framework_id', width: 14 },
        { header: 'Local Area', key: 'area', width: 12 },
        { header: 'Response Type', key: 'response_type', width: 16 },
        { header: 'Target Level', key: 'target_level', width: 18 },
        { header: 'Statement', key: 'statement', width: 110 },
      ];
      for (const item of instrumentItems) itemMetadata.addRow({
        number: item.question_number,
        framework_id: item.framework_competence_id || '',
        area: `${item.area_code} · ${item.area_name}`,
        response_type: item.response_type,
        target_level: item.proficiency_level,
        statement: item.question_text,
      });
      itemMetadata.getRow(1).font = { bold: true };
      itemMetadata.views = [{ state: 'frozen', ySplit: 1 }];
    }

    if (!isDigCompSat) {
    const partThreeSheet = workbook.addWorksheet('Part III Skills');
    partThreeSheet.columns = [
      { header: 'Respondent Code', key: 'respondent_code', width: 18 },
      { header: 'Skills to Develop', key: 'desired_skills', width: 90 },
    ];
    partThreeSheet.getRow(1).font = { bold: true };
    const reviewedPartThree = participants.filter((row) => row.desired_skills_reviewed_at && row.desired_skills_redacted);
    for (const participant of (reviewedPartThree.length >= 5 ? reviewedPartThree : [])) {
      partThreeSheet.addRow({ respondent_code: participant.respondent_code, desired_skills: participant.desired_skills_redacted });
    }
    partThreeSheet.addRow({
      respondent_code: 'Privacy review',
      desired_skills: reviewedPartThree.length >= 5
        ? 'Only at least five manually reviewed and sanitized responses are included. Unreviewed and withheld responses are omitted.'
        : 'Part III responses are withheld until at least five responses have been reviewed and sanitized.',
    });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Deidentified_${isDigCompSat ? 'DigCompSAT' : 'Study_Data'}_${assessment.id}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error exporting cohort Excel:', err);
    res.status(500).json({ success: false, message: 'Failed to export cohort report' });
  }
});

module.exports = router;

