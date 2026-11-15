const fs = require('fs');
const path = require('path');
const themes = require('../../shared/completion-awards.json');

function awardTheme(attempt) {
  return themes[attempt.scoring_version] || themes.default;
}

function completionDate(value) {
  const source = String(value || '');
  const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(source) ? source : `${source.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? source : date.toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila',
  });
}

function fittedText(doc, text, { x, y, width, height, font, size, minSize, color, lineGap = 3 }) {
  doc.font(font);
  let fittedSize = size;
  while (fittedSize > minSize) {
    doc.fontSize(fittedSize);
    if (doc.heightOfString(text, { width, lineGap }) <= height) break;
    fittedSize -= 0.5;
  }
  doc.fillColor(color).fontSize(fittedSize).text(text, x, y, {
    width, height, align: 'center', lineGap,
  });
}

function drawCompletionAward(doc, attempt) {
  const theme = awardTheme(attempt);
  const { width, height } = doc.page;
  const reference = `${theme.referencePrefix}-${String(attempt.id).padStart(7, '0')}`;
  const name = `${attempt.first_name || ''} ${attempt.last_name || ''}`.trim();
  const logoPath = path.resolve(__dirname, '../../client/public/masbate-colleges-logo.png');
  const title = String(attempt.assessment_title || 'Digital Literacy Assessment');
  doc.info.Title = `${title} - Completion Award`;
  doc.info.Author = 'Masbate Colleges - College of Computer Studies';
  doc.info.Subject = `Assessment completion for ${name}`;

  doc.rect(0, 0, width, height).fill(theme.paper);
  doc.moveTo(0, 0).lineTo(152, 0).lineTo(0, 152).closePath().fill(theme.primary);
  doc.moveTo(0, 137).lineTo(137, 0).lineWidth(5).strokeColor(theme.accent).stroke();
  doc.moveTo(width, height).lineTo(width - 120, height).lineTo(width, height - 120).closePath().fill(theme.primary);
  doc.moveTo(width - 109, height).lineTo(width, height - 109).lineWidth(3).strokeColor(theme.accent).stroke();
  doc.rect(26, 26, width - 52, height - 52).lineWidth(1).strokeColor(theme.accent).stroke();
  doc.rect(34, 34, width - 68, height - 68).lineWidth(0.4).strokeColor(theme.primary).stroke();

  if (fs.existsSync(logoPath)) {
    doc.circle(93, 88, 33).fill('#ffffff');
    doc.image(logoPath, 66, 60, { fit: [54, 56], align: 'center', valign: 'center' });
  }
  doc.fillColor(theme.primary).font('Helvetica-Bold').fontSize(17).text('MASBATE COLLEGES', 137, 67, { width: 360, lineBreak: false });
  doc.fillColor('#68756e').font('Helvetica').fontSize(9).text('COLLEGE OF COMPUTER STUDIES', 138, 91, { width: 340, characterSpacing: 0.8, lineBreak: false });
  doc.fillColor(theme.primary).font('Helvetica-Bold').fontSize(8.5).text(theme.label.toUpperCase(), width - 300, 79, { width: 223, align: 'right', lineBreak: false });
  doc.moveTo(66, 132).lineTo(width - 66, 132).lineWidth(0.5).strokeColor('#d9e1da').stroke();

  doc.fillColor(theme.primary).font('Times-Roman').fontSize(43).text('Certificate', 95, 154, { width: width - 190, align: 'center', lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#3a4840').text('OF COMPLETION', 100, 207, {
    width: width - 200, align: 'center', characterSpacing: 3,
  });
  doc.fillColor('#6b776f').font('Helvetica').fontSize(10.5).text('PRESENTED TO', 100, 244, {
    width: width - 200, align: 'center', characterSpacing: 1.2,
  });

  fittedText(doc, name, {
    x: 90, y: 266, width: width - 180, height: 65,
    font: 'Times-Italic', size: 37, minSize: 12, color: theme.primary, lineGap: 0,
  });
  doc.moveTo(251, 337).lineTo(width - 251, 337).lineWidth(1).strokeColor(theme.accent).stroke();
  doc.fillColor('#58675e').font('Helvetica').fontSize(11).text('for completing the digital literacy assessment', 100, 352, {
    width: width - 200, align: 'center',
  });
  fittedText(doc, title, {
    x: 115, y: 377, width: width - 230, height: 67,
    font: 'Helvetica-Bold', size: 19, minSize: 11, color: '#243e30', lineGap: 1,
  });

  doc.moveTo(77, 463).lineTo(302, 463).lineWidth(0.5).strokeColor('#d9e1da').stroke();
  doc.moveTo(width - 302, 463).lineTo(width - 77, 463).stroke();
  doc.font('Helvetica').fontSize(8).fillColor('#748077').text('COMPLETED ON', 77, 475, { width: 225, characterSpacing: 1 });
  doc.font('Helvetica-Bold').fontSize(11).fillColor(theme.primary).text(completionDate(attempt.completed_at), 77, 492, { width: 225 });
  doc.font('Helvetica').fontSize(8).fillColor('#748077').text('AWARD REFERENCE', width - 302, 475, { width: 225, align: 'right', characterSpacing: 1 });
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(theme.primary).text(reference, width - 302, 492, { width: 225, align: 'right' });

  const centerX = width / 2;
  const centerY = 486;
  doc.save().translate(centerX, centerY);
  for (let index = 0; index < 24; index += 1) {
    const angle = index * Math.PI / 12;
    const radius = index % 2 === 0 ? 30 : 26;
    const x = Math.sin(angle) * radius;
    const y = Math.cos(angle) * radius;
    if (index === 0) doc.moveTo(x, y);
    else doc.lineTo(x, y);
  }
  doc.closePath().fill(theme.accent);
  doc.circle(0, 0, 22).fill(theme.paper);
  doc.circle(0, 0, 19).lineWidth(0.8).strokeColor(theme.primary).stroke();
  doc.moveTo(-9, -3).lineTo(-2, 4).lineTo(10, -9).lineWidth(2.5).strokeColor(theme.primary).stroke();
  doc.restore();
  doc.font('Helvetica-Bold').fontSize(5.4).fillColor(theme.primary).text('COMPLETED', centerX - 25, centerY + 9, { width: 50, align: 'center', characterSpacing: 0.4 });

  doc.fillColor('#6f7a72').font('Helvetica').fontSize(8).text(
    'Recognizes assessment completion only. This award does not confer proficiency certification or academic credit.',
    72, 540, { width: width - 144, align: 'center' }
  );
  return reference;
}

module.exports = { drawCompletionAward };
