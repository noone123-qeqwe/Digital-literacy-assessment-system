import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Award, CheckCircle2, Download, Eye } from 'lucide-react';
import Modal from '../common/Modal';
import { formatDate } from '../../utils/helpers';
import themes from '../../../../shared/completion-awards.json';
import './CompletionAwardCard.css';

const celebrationPieces = [
  [6, -9, -160], [13, 6, 130], [21, -5, 220], [9, 12, -200],
  [25, -12, 160], [17, 7, -130], [79, 8, 200], [87, -7, -160],
  [94, 9, 140], [75, 12, -220], [90, -11, 180], [83, 5, -140],
];

function CertificatePreview({ attempt, theme, reference, celebrate = false }) {
  const name = `${attempt.first_name || ''} ${attempt.last_name || ''}`.trim();
  const title = attempt.assessment_title || 'Digital Literacy Assessment';
  const nameSize = `${Math.min(3.9, 180 / Math.max(1, name.length))}cqw`;
  const titleSize = `${Math.min(2.1, 230 / Math.max(1, title.length))}cqw`;
  return (
    <div className={`award-preview-surface${celebrate ? ' is-celebrating' : ''}`}>
      <div className="award-certificate" role="img" aria-label={`Completion certificate for ${name}. ${title}. Completed ${formatDate(attempt.completed_at)}. Reference ${reference}.`}>
        {celebrate && <>
          <span className="award-cert-shimmer" aria-hidden="true" />
          <span className="award-cert-confetti" aria-hidden="true">
            {celebrationPieces.map(([left, drift, spin], index) => <i key={index} style={{
              '--piece-left': `${left}%`,
              '--piece-drift': `${drift}cqw`,
              '--piece-spin': `${spin}deg`,
              '--piece-delay': `${180 + (index % 4) * 90}ms`,
            }} />)}
          </span>
        </>}
        <div className="award-cert-brand">
          <img src="/masbate-colleges-logo.png" alt="" />
          <div><strong>MASBATE COLLEGES</strong><span>COLLEGE OF COMPUTER STUDIES</span></div>
          <p>{theme.label}</p>
        </div>
        <div className="award-cert-rule" />
        <p className="award-cert-title">Certificate</p>
        <p className="award-cert-subtitle">OF COMPLETION</p>
        <p className="award-cert-presented">PRESENTED TO</p>
        <p className="award-cert-recipient" style={{ '--award-name-size': nameSize }}>{name}</p>
        <div className="award-cert-name-rule" />
        <p className="award-cert-purpose">for completing the digital literacy assessment</p>
        <p className="award-cert-assessment" style={{ fontSize: titleSize }}>{title}</p>
        <div className="award-cert-footer">
          <div><span>COMPLETED ON</span><strong>{formatDate(attempt.completed_at)}</strong></div>
          <span className="award-cert-seal"><CheckCircle2 aria-hidden="true" /></span>
          <div><span>AWARD REFERENCE</span><strong>{reference}</strong></div>
        </div>
        <p className="award-cert-note">Recognizes assessment completion only. This award does not confer proficiency certification or academic credit.</p>
      </div>
    </div>
  );
}

export default function CompletionAwardCard({ attempt, exporting, onDownload }) {
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const theme = themes[attempt.scoring_version] || themes.default;
  const reference = `${theme.referencePrefix}-${String(attempt.id).padStart(7, '0')}`;
  const style = {
    '--award-primary': theme.primary,
    '--award-accent': theme.accent,
    '--award-paper': theme.paper,
    '--award-tint': theme.tint,
  };
  const downloading = exporting === 'award';

  return <>
    <section className="award-showcase" style={style} aria-labelledby="completion-award-heading">
      <button type="button" onClick={() => setIsPreviewOpen(true)} className="award-thumbnail-button" aria-label="Preview your completion award">
        <CertificatePreview attempt={attempt} theme={theme} reference={reference} />
        <span><Eye aria-hidden="true" size={14} />Preview award</span>
      </button>
      <div className="award-showcase-copy">
        <p className="award-eyebrow"><Award aria-hidden="true" size={16} />{theme.label}</p>
        <h2 id="completion-award-heading">Your completion award</h2>
        <p className="award-showcase-assessment">{attempt.assessment_title}</p>
        <p className="award-showcase-description">Your personalized award is ready. Preview it here or download a copy to keep.</p>
        <div className="award-showcase-details"><span>Completed {formatDate(attempt.completed_at)}</span><span>{reference}</span></div>
        <div className="award-showcase-actions">
          <button type="button" onClick={onDownload} disabled={Boolean(exporting)} className="award-download-button">
            <Download aria-hidden="true" size={17} />{downloading ? 'Preparing PDF…' : 'Download award'}
          </button>
          <button type="button" onClick={() => setIsPreviewOpen(true)} className="award-preview-button"><Eye aria-hidden="true" size={17} />View certificate</button>
        </div>
      </div>
    </section>
    {createPortal(
      <div className="award-preview-dialog" style={style}>
        <Modal isOpen={isPreviewOpen} onClose={() => setIsPreviewOpen(false)} title="Your completion award" maxWidth="max-w-5xl" footer={(
          <div className="award-dialog-footer">
            <button type="button" onClick={() => setIsPreviewOpen(false)} className="award-preview-button">Close preview</button>
            <button type="button" onClick={onDownload} disabled={Boolean(exporting)} className="award-download-button"><Download aria-hidden="true" size={17} />{downloading ? 'Preparing PDF…' : 'Download PDF'}</button>
          </div>
        )}>
          <CertificatePreview attempt={attempt} theme={theme} reference={reference} celebrate />
        </Modal>
      </div>,
      document.body
    )}
  </>;
}
