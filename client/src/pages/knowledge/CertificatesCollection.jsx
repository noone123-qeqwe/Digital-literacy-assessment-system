import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Download, Eye, Lock, RefreshCw, Sparkles, Unlock } from 'lucide-react';
import api from '../../api/axios';
import { useAuth } from '../../contexts/useAuth';
import { useDemoMode } from '../../contexts/useDemoMode';
import Modal from '../../components/common/Modal';
import { CertificatePreview } from '../../components/awards/CompletionAwardCard';
import themes from '../../../../shared/completion-awards.json';
import { detectNewlyUnlockedKeys, subscribeCertificateSync } from '../../utils/certificateEvents';
import { Empty, Field, KnowledgePage, ResearchLink } from './KnowledgeCommon';
import { displayDate, knowledgeDownload } from './knowledgeClient';
import './CertificatesCollection.css';

function LockedCertificateArtwork() {
  return (
    <div className="cert-locked-surface" aria-hidden="true">
      <div className="cert-locked-lines">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="cert-locked-overlay">
        <span className="cert-locked-emblem">
          <Lock size={19} />
        </span>
        <span>Locked</span>
      </div>
    </div>
  );
}

function buildPreviewAttempt(item, user) {
  return {
    id: item.attempt_id,
    assessment_title: item.assessment_title,
    completed_at: item.issued_at,
    first_name: item.first_name || user?.first_name || '',
    last_name: item.last_name || user?.last_name || '',
    recipient_name: item.recipient_name,
    scoring_version: item.scoring_version,
  };
}

function resolveTheme(item) {
  if (item.instrument === 'knowledge') {
    return themes['knowledge-achievement'] || themes.default;
  }
  return themes[item.scoring_version] || themes.default;
}

export default function CertificatesCollection() {
  const { user } = useAuth();
  const userId = user?.id;
  const student = user?.role === 'respondent';
  const { freeDemoReadOnly } = useDemoMode();

  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const silentSyncRef = useRef(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [instrumentFilter, setInstrumentFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [previewItem, setPreviewItem] = useState(null);
  const [downloadingKey, setDownloadingKey] = useState('');
  const [justUnlockedKeys, setJustUnlockedKeys] = useState(() => new Set());

  useEffect(() => {
    const controller = new AbortController();
    const isSilent = silentSyncRef.current;
    silentSyncRef.current = false;

    api.get('/knowledge/certificates', { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        const nextPayload = response.data?.data || { items: [], summary: { total: 0, unlocked: 0, locked: 0 } };
        setPayload(nextPayload);
        setError('');
        setLoading(false);
        setRefreshing(false);
        if (student && userId) {
          const transitioned = detectNewlyUnlockedKeys(userId, nextPayload.items || []);
          if (transitioned.size) {
            setJustUnlockedKeys((prev) => new Set([...prev, ...transitioned]));
          }
        }
      })
      .catch((requestError) => {
        if (controller.signal.aborted) return;
        if (!isSilent) {
          setError(requestError.response?.data?.message || 'We could not load your certificates right now. Please try again.');
        }
        setLoading(false);
        setRefreshing(false);
      });

    return () => controller.abort();
  }, [revision, student, userId]);

  const triggerSilentSync = useCallback(() => {
    silentSyncRef.current = true;
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') triggerSilentSync();
    };
    const unsubscribe = subscribeCertificateSync(triggerSilentSync);
    window.addEventListener('focus', triggerSilentSync);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', triggerSilentSync);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [triggerSilentSync]);

  const handleRetry = () => {
    silentSyncRef.current = false;
    setLoading(true);
    setError('');
    setRevision((value) => value + 1);
  };

  const handleManualSync = () => {
    setRefreshing(true);
    triggerSilentSync();
  };

  const items = payload?.items || [];
  const summary = payload?.summary || {
    total: items.length,
    unlocked: items.filter((item) => item.unlocked).length,
    locked: items.filter((item) => !item.unlocked).length,
  };
  const unlockPercent = summary.total ? Math.round((summary.unlocked / summary.total) * 100) : 0;

  const query = search.trim().toLowerCase();
  const filtered = items.filter((item) => {
    if (statusFilter === 'unlocked' && !item.unlocked) return false;
    if (statusFilter === 'locked' && item.unlocked) return false;
    if (instrumentFilter !== 'all' && item.instrument !== instrumentFilter) return false;
    if (!query) return true;
    return `${item.certificate_title} ${item.assessment_title} ${item.recipient_name || ''}`.toLowerCase().includes(query);
  });

  const pageSize = 12;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const base = student ? '/respondent' : user?.role === 'admin' ? '/admin' : '/assessor';
  const researchPath = student ? '/respondent/assessments' : user?.role === 'admin' ? '/admin/reports' : '/assessor/assessments';

  const openPreview = (item) => {
    if (!item?.unlocked || !item.attempt_id) return;
    setPreviewItem(item);
  };

  const handleDownload = async (item) => {
    if (!item?.unlocked || !item.download_url || freeDemoReadOnly) return;
    setDownloadingKey(item.key);
    try {
      await knowledgeDownload(
        item.download_url,
        `Masbate_Colleges_${item.instrument === 'knowledge' ? 'Achievement' : 'Award'}_${item.attempt_id}.pdf`
      );
    } finally {
      setDownloadingKey('');
    }
  };

  const previewTheme = previewItem ? resolveTheme(previewItem) : null;
  const previewAttempt = previewItem ? buildPreviewAttempt(previewItem, user) : null;

  return (
    <KnowledgePage
      loading={loading}
      error={error}
      reload={handleRetry}
      className={student ? 'student-records student-records--certificates' : ''}
      title={student ? 'My certificates' : 'Certificates and awards'}
      description={
        student
          ? 'Track every certificate you can earn across your assessments. Locked certificates unlock automatically as soon as you complete their required assessment.'
          : 'Earned knowledge achievement certificates and research completion awards across your authorized cohort.'
      }
    >
      <div className="kq-actions">
        <Link className="kq-button kq-button-secondary" to={`${base}/knowledge`}>
          {student ? 'Take an assessment' : 'Manage assessments'}
        </Link>
        <ResearchLink to={researchPath}>
          {student ? 'Research' : 'Research analytics and results'}
        </ResearchLink>
      </div>

      {payload && (
        <div className="cert-collection">
          {student && (
            <section className="cert-summary-banner" aria-label="Certificate collection progress">
              <div className="cert-summary-copy">
                <p className="cert-summary-eyebrow">Certificate collection</p>
                <h2>
                  {summary.unlocked} of {summary.total} certificate{summary.total === 1 ? '' : 's'} unlocked
                </h2>
                <div
                  className="cert-summary-progress"
                  role="progressbar"
                  aria-label="Unlocked certificates progress"
                  aria-valuemin={0}
                  aria-valuemax={Math.max(1, summary.total)}
                  aria-valuenow={summary.unlocked}
                >
                  <div style={{ width: `${unlockPercent}%` }} />
                </div>
              </div>
              <div className="cert-summary-metrics">
                <div className="cert-summary-stat cert-summary-stat--unlocked">
                  <span><Unlock size={13} aria-hidden="true" /> Unlocked</span>
                  <strong>{summary.unlocked}</strong>
                </div>
                <div className="cert-summary-stat">
                  <span><Lock size={13} aria-hidden="true" /> Locked</span>
                  <strong>{summary.locked}</strong>
                </div>
                <div className="cert-summary-stat">
                  <span>Total</span>
                  <strong>{summary.total}</strong>
                </div>
              </div>
            </section>
          )}

          {freeDemoReadOnly && (
            <p className="kq-note">Award downloads are disabled for the public sample-data demonstration.</p>
          )}

          <div className="cert-toolbar">
            {student && (
              <div className="cert-status-filters" role="group" aria-label="Filter certificates by lock status">
                {[
                  ['all', 'All certificates', summary.total],
                  ['unlocked', 'Unlocked', summary.unlocked],
                  ['locked', 'Locked', summary.locked],
                ].map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={statusFilter === value}
                    onClick={() => { setStatusFilter(value); setPage(1); }}
                  >
                    {value === 'unlocked' && <CheckCircle2 size={14} aria-hidden="true" />}
                    {value === 'locked' && <Lock size={14} aria-hidden="true" />}
                    {label}{' '}
                    <span>{count}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className="cert-refresh-btn"
                  onClick={handleManualSync}
                  disabled={refreshing}
                  aria-label="Sync certificate statuses from database"
                >
                  <RefreshCw size={14} aria-hidden="true" className={refreshing ? 'animate-spin' : ''} />
                  {refreshing ? 'Syncing…' : 'Sync status'}
                </button>
              </div>
            )}

            <div className="kq-filter-row">
              <Field label={student ? 'Search certificates or assessments' : 'Search student or assessment'}>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                  placeholder={student ? 'Search by certificate or assessment name…' : 'Search names or titles…'}
                />
              </Field>
              <Field label="Assessment type">
                <select
                  value={instrumentFilter}
                  onChange={(event) => { setInstrumentFilter(event.target.value); setPage(1); }}
                >
                  <option value="all">{student ? 'All types' : 'All assessment types'}</option>
                  <option value="knowledge">{student ? 'Knowledge' : 'Scored knowledge quizzes'}</option>
                  <option value="research">{student ? 'Research' : 'Research self-reflection'}</option>
                </select>
              </Field>
            </div>
          </div>

          {visible.length ? (
            <div className="cert-collection-grid">
              {visible.map((item) => {
                const isUnlocked = Boolean(item.unlocked);
                const isJustUnlocked = isUnlocked && justUnlockedKeys.has(item.key);
                const theme = resolveTheme(item);
                const cardStyle = isUnlocked
                  ? {
                      '--award-primary': theme.primary,
                      '--award-accent': theme.accent,
                      '--award-paper': theme.paper,
                      '--award-tint': theme.tint,
                    }
                  : undefined;
                const scoreText = item.instrument === 'knowledge' && item.percentage !== undefined
                  ? `${item.level} · ${item.percentage}%`
                  : '';
                const canGoToAssessment = !isUnlocked && !item.exhausted && !item.future && item.assessment_path;

                return (
                  <article
                    key={item.key}
                    data-status={isUnlocked ? 'unlocked' : 'locked'}
                    style={cardStyle}
                    className={`cert-card ${isUnlocked ? 'cert-card--unlocked' : 'cert-card--locked'}${isJustUnlocked ? ' cert-card--just-unlocked' : ''}`}
                  >
                    <div className="cert-card-visual">
                      {isUnlocked ? (
                        <button
                          type="button"
                          className="cert-preview-trigger"
                          onClick={() => openPreview(item)}
                          aria-label={`Preview ${item.certificate_title} for ${item.assessment_title}`}
                        >
                          <CertificatePreview
                            attempt={buildPreviewAttempt(item, user)}
                            theme={theme}
                            reference={item.reference_code}
                            variant={item.instrument === 'knowledge' ? 'achievement' : 'completion'}
                            scoreText={scoreText}
                            celebrate={isJustUnlocked}
                          />
                          <span className="cert-preview-hint">
                            <Eye size={13} aria-hidden="true" /> Preview certificate
                          </span>
                        </button>
                      ) : (
                        <LockedCertificateArtwork />
                      )}
                    </div>

                    <div className="cert-card-body">
                      <div className="cert-card-badges">
                        <span className={`cert-status-pill ${isUnlocked ? 'cert-status-pill--unlocked' : 'cert-status-pill--locked'}`}>
                          {isUnlocked ? <CheckCircle2 size={13} aria-hidden="true" /> : <Lock size={13} aria-hidden="true" />}
                          {isUnlocked ? 'Unlocked' : 'Locked'}
                        </span>
                        {isJustUnlocked && (
                          <span className="cert-status-pill cert-status-pill--celebrate">
                            <Sparkles size={12} aria-hidden="true" /> Newly unlocked
                          </span>
                        )}
                        <span className="kq-badge">
                          {item.instrument === 'knowledge' ? 'Achievement certificate' : 'Completion award'}
                        </span>
                        {item.time_expired && <span className="kq-badge">Time expired</span>}
                      </div>

                      <h3>{item.certificate_title}</h3>
                      <p className="cert-card-assessment">
                        Assessment: <strong>{item.assessment_title}</strong>
                      </p>

                      {!student && item.recipient_name && (
                        <p className="cert-card-meta">Recipient: <strong>{item.recipient_name}</strong></p>
                      )}

                      <div className="cert-card-meta">
                        <span>Completion status: <strong>{item.completion_label}</strong></span>
                        {isUnlocked ? (
                          <>
                            <span>
                              {item.instrument === 'knowledge'
                                ? `${item.percentage}% · ${item.level}`
                                : 'Research assessment completed'}
                            </span>
                            <span className="cert-card-ref">
                              Issued {displayDate(item.issued_at)} · {item.reference_code}
                            </span>
                          </>
                        ) : (
                          item.instrument === 'knowledge' && (
                            <span>
                              {item.latest_percentage !== null && item.latest_percentage !== undefined
                                ? `Latest score: ${item.latest_percentage}% · Passing threshold: ${item.pass_percentage}%`
                                : `Passing threshold: ${item.pass_percentage}%`}
                            </span>
                          )
                        )}
                      </div>

                      {!isUnlocked && (
                        <p className="cert-locked-message" role="note">
                          <Lock size={14} aria-hidden="true" />
                          <span>{item.locked_reason || 'Complete the required assessment to unlock this certificate.'}</span>
                        </p>
                      )}

                      <div className="cert-card-actions">
                        {isUnlocked ? (
                          <>
                            <button
                              type="button"
                              className="kq-button"
                              onClick={() => openPreview(item)}
                            >
                              <Eye size={15} aria-hidden="true" />
                              Preview
                            </button>
                            <button
                              type="button"
                              className="kq-button kq-button-secondary"
                              disabled={freeDemoReadOnly || downloadingKey === item.key}
                              onClick={() => handleDownload(item)}
                            >
                              <Download size={15} aria-hidden="true" />
                              {downloadingKey === item.key ? 'Preparing PDF…' : 'Download PDF'}
                            </button>
                            {item.result_path && (
                              <Link className="kq-button kq-button-secondary" to={item.result_path}>
                                View result
                              </Link>
                            )}
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="cert-locked-btn"
                              disabled
                              aria-disabled="true"
                            >
                              <Lock size={14} aria-hidden="true" />
                              Locked
                            </button>
                            {canGoToAssessment && (
                              <Link className="kq-button kq-button-secondary" to={item.assessment_path}>
                                {item.action_label || 'Go to assessment'}
                                <ArrowRight size={14} aria-hidden="true" />
                              </Link>
                            )}
                            {item.exhausted && item.latest_result_path && (
                              <Link className="kq-button kq-button-secondary" to={item.latest_result_path}>
                                Review result
                              </Link>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <Empty>
              {items.length
                ? 'No certificates match your current search or filter.'
                : student
                ? 'No assessment certificates are assigned to your account yet.'
                : 'No earned certificates match your current filter yet.'}
            </Empty>
          )}

          {filtered.length > pageSize && (
            <div className="kq-actions">
              <button
                type="button"
                className="kq-button kq-button-secondary"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </button>
              <span className="kq-note">Page {currentPage} of {pages}</span>
              <button
                type="button"
                className="kq-button kq-button-secondary"
                disabled={currentPage >= pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {previewItem && previewItem.unlocked && previewTheme && previewAttempt && createPortal(
        <div
          className="award-preview-dialog"
          style={{
            '--award-primary': previewTheme.primary,
            '--award-accent': previewTheme.accent,
            '--award-paper': previewTheme.paper,
            '--award-tint': previewTheme.tint,
          }}
        >
          <Modal
            isOpen={Boolean(previewItem)}
            onClose={() => setPreviewItem(null)}
            title={`${previewItem.certificate_title} · ${previewItem.assessment_title}`}
            maxWidth="max-w-5xl"
            footer={(
              <div className="award-dialog-footer">
                <button
                  type="button"
                  onClick={() => setPreviewItem(null)}
                  className="award-preview-button"
                >
                  Close preview
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload(previewItem)}
                  disabled={freeDemoReadOnly || downloadingKey === previewItem.key}
                  className="award-download-button"
                >
                  <Download aria-hidden="true" size={17} />
                  {downloadingKey === previewItem.key ? 'Preparing PDF…' : 'Download PDF'}
                </button>
              </div>
            )}
          >
            <CertificatePreview
              attempt={previewAttempt}
              theme={previewTheme}
              reference={previewItem.reference_code}
              variant={previewItem.instrument === 'knowledge' ? 'achievement' : 'completion'}
              scoreText={
                previewItem.instrument === 'knowledge' && previewItem.percentage !== undefined
                  ? `${previewItem.level} · ${previewItem.percentage}%`
                  : ''
              }
              celebrate
            />
          </Modal>
        </div>,
        document.body
      )}
    </KnowledgePage>
  );
}
