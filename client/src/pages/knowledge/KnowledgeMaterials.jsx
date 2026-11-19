import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, CheckCircle2, Clock3, Image as ImageIcon, PlayCircle, Plus } from 'lucide-react';
import api from '../../api/axios';
import Modal from '../../components/common/Modal';
import { useAuth } from '../../contexts/useAuth';
import { useDemoMode } from '../../contexts/useDemoMode';
import { Empty, Field, KnowledgePage, ResearchLink } from './KnowledgeCommon';
import { useKnowledgeAction, useKnowledgeData } from './knowledgeClient';
import {
  BUILTIN_IMAGES,
  BUILTIN_VIDEOS,
  estimateStudyMinutes,
  extractGuideSummary,
  parseGuideSections,
  parseVttCues,
  renderInlineFormatting,
  resolveVideoSource,
} from './learningMedia';

const blank = {
  category_id: '',
  title: '',
  content: '',
  resource_url: '',
  image_url: '',
  image_caption: '',
  video_url: '',
  video_title: '',
  is_published: true,
};

function renderGuideSections(content) {
  const sections = parseGuideSections(content);
  return (
    <div className="kq-guide-sections">
      {sections.map((section, sectionIndex) => {
        const isChallenge = /try it|quick reference/i.test(section.heading);
        const isComparison = /do this vs|avoid/i.test(section.heading);
        return (
          <section
            key={`${section.heading || 'intro'}-${sectionIndex}`}
            className={`kq-guide-section ${isChallenge ? 'kq-guide-callout' : ''}`}
          >
            {section.heading && <h3>{section.heading}</h3>}
            {section.blocks.map((block, blockIndex) => {
              if (block.type === 'p') {
                return <p key={blockIndex}>{renderInlineFormatting(block.text)}</p>;
              }
              if (block.type === 'ol') {
                return (
                  <ol key={blockIndex} className="kq-guide-ordered">
                    {block.items.map((item, itemIndex) => (
                      <li key={itemIndex}>{renderInlineFormatting(item)}</li>
                    ))}
                  </ol>
                );
              }
              return (
                <ul key={blockIndex} className="kq-guide-list">
                  {block.items.map((item, itemIndex) => {
                    const isDo = isComparison && /^\*\*Do:\*\*/i.test(item);
                    const isAvoid = isComparison && /^\*\*Avoid:\*\*/i.test(item);
                    return (
                      <li
                        key={itemIndex}
                        className={isDo ? 'kq-guide-do' : isAvoid ? 'kq-guide-avoid' : ''}
                      >
                        {renderInlineFormatting(item)}
                      </li>
                    );
                  })}
                </ul>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

function VideoReferenceCard({ material, videoSource }) {
  const videoRef = useRef(null);
  const [chapterState, setChapterState] = useState({ url: '', cues: [] });
  const captionsUrl = videoSource?.kind === 'local' ? videoSource.captionsUrl : '';

  useEffect(() => {
    if (!captionsUrl || typeof fetch !== 'function') return undefined;
    const controller = new AbortController();
    fetch(captionsUrl, { signal: controller.signal })
      .then((res) => (res?.ok ? res.text() : ''))
      .then((text) => {
        if (!controller.signal.aborted && text) {
          setChapterState({ url: captionsUrl, cues: parseVttCues(text) });
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [captionsUrl]);

  const chapters = captionsUrl && chapterState.url === captionsUrl ? chapterState.cues : [];

  const jumpTo = (seconds) => {
    const player = videoRef.current;
    if (!player) return;
    player.currentTime = seconds;
    const playResult = player.play?.();
    if (playResult?.catch) playResult.catch(() => {});
  };

  return (
    <div className="kq-video-card">
      <div className="kq-video-header">
        <PlayCircle size={16} aria-hidden="true" />
        <span>{material.video_title || `${material.category_name} video reference`}</span>
      </div>
      {videoSource.kind === 'local' ? (
        <>
          <video
            ref={videoRef}
            controls
            playsInline
            preload="metadata"
            poster={material.image_url || undefined}
            aria-label={material.video_title || `${material.title} video walkthrough`}
          >
            <source src={videoSource.src} type={videoSource.mimeType} />
            <track
              kind="captions"
              src={videoSource.captionsUrl}
              srcLang="en"
              label="English captions"
              default
            />
          </video>
          {chapters.length > 0 && (
            <details className="kq-transcript">
              <summary>Video chapters &amp; transcript ({chapters.length})</summary>
              <ol className="kq-chapter-list">
                {chapters.map((cue) => (
                  <li key={`${cue.timestamp}-${cue.text.slice(0, 12)}`}>
                    <button type="button" className="kq-chapter-jump" onClick={() => jumpTo(cue.startSeconds)}>
                      <span>{cue.timestamp}</span>
                      <span>{cue.text}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      ) : videoSource.kind === 'iframe' ? (
        <div className="kq-video-frame">
          <iframe
            src={videoSource.src}
            title={material.video_title || material.title}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : (
        <a className="kq-button kq-button-secondary" href={videoSource.src} target="_blank" rel="noreferrer">
          <PlayCircle size={16} aria-hidden="true" />
          Watch video resource ↗
        </a>
      )}
    </div>
  );
}

export default function KnowledgeMaterials() {
  const { user } = useAuth();
  const admin = user.role === 'admin';
  const { freeDemoReadOnly } = useDemoMode();
  const [params] = useSearchParams();
  const state = useKnowledgeData(['/knowledge/materials', '/knowledge/categories', '/knowledge/overview']);
  const materials = state.data[0] || [];
  const categories = state.data[1] || [];
  const overview = state.data[2];
  const { busy, run } = useKnowledgeAction();
  const [category, setCategory] = useState(params.get('category') || '');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  const weak = new Set(overview?.categories.filter((item) => item.percentage < 70).map((item) => item.id) || []);
  const filtered = materials
    .filter((material) => (
      (!category || material.category_id === Number(category))
      && `${material.title} ${material.content} ${material.category_name || ''}`.toLowerCase().includes(search.toLowerCase())
    ))
    .sort((a, b) => Number(weak.has(b.category_id)) - Number(weak.has(a.category_id)));

  const save = async (event) => {
    event.preventDefault();
    const payload = { ...form, category_id: form.category_id || categories[0]?.id };
    if (await run(() => (editing ? api.put(`/knowledge/materials/${editing}`, payload) : api.post('/knowledge/materials', payload)), 'Learning guide saved.')) {
      setOpen(false);
      state.reload();
    }
  };

  const remove = async (material) => {
    if (!window.confirm(`Delete “${material.title}” and its completion records?`)) return;
    if (await run(() => api.delete(`/knowledge/materials/${material.id}`), 'Learning guide deleted.')) state.reload();
  };

  const openEditor = (material = null) => {
    if (material) {
      setForm({
        ...blank,
        ...material,
        image_url: material.image_url || '',
        image_caption: material.image_caption || '',
        video_url: material.video_url || '',
        video_title: material.video_title || '',
        resource_url: material.resource_url || '',
        is_published: Boolean(material.is_published),
      });
      setEditing(material.id);
    } else {
      setForm(blank);
      setEditing(null);
    }
    setOpen(true);
  };

  return (
    <KnowledgePage
      {...state}
      title="Learning materials"
      description="Explore illustrated guides, walkthrough videos, and step-by-step checklists across all eight digital literacy categories."
      action={admin ? (
        <button className="kq-button" disabled={freeDemoReadOnly} onClick={() => openEditor()}>
          <Plus size={17} aria-hidden="true" />
          Add learning guide
        </button>
      ) : (
        <ResearchLink to="/respondent/learning">Research learning path</ResearchLink>
      )}
    >
      {admin && <ResearchLink to="/admin/learning">Manage research learning resources</ResearchLink>}
      {!admin && (
        <section className="kq-hero">
          <div>
            <p className="kq-eyebrow">Your learning journey</p>
            <h2>{materials.filter((material) => material.completed).length} of {materials.length} guides completed</h2>
            <p>
              {weak.size
                ? 'Recommended guides appear first, based on knowledge categories scoring below 70%.'
                : 'Watch the walkthrough, study the diagram, practice each step, and mark the guide complete.'}
            </p>
          </div>
          <BookOpen size={36} color="#006b3c" aria-hidden="true" />
        </section>
      )}

      <div className="kq-filter-row">
        <Field label="Search learning materials">
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a skill or topic…"
          />
        </Field>
        <Field label="Category">
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">All categories</option>
            {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="kq-list">
        {filtered.map((material, index) => {
          const videoSource = resolveVideoSource(material.video_url);
          const studyMinutes = estimateStudyMinutes(material);
          const summary = extractGuideSummary(material.content);
          return (
            <article className="kq-card kq-assessment-card" key={material.id}>
              <div className="kq-actions">
                <span className="kq-badge">{material.category_name}</span>
                {!admin && weak.has(material.category_id) && <span className="kq-badge kq-badge-warning">Recommended for you</span>}
                {Boolean(material.completed) && (
                  <span className="kq-badge kq-badge-success">
                    <CheckCircle2 size={13} aria-hidden="true" />
                    Completed
                  </span>
                )}
                {admin && !material.is_published && <span className="kq-badge kq-badge-warning">Draft</span>}
                {material.image_url && (
                  <span className="kq-badge kq-badge-media">
                    <ImageIcon size={13} aria-hidden="true" />
                    Diagram
                  </span>
                )}
                {videoSource && (
                  <span className="kq-badge kq-badge-media">
                    <PlayCircle size={13} aria-hidden="true" />
                    Video lesson
                  </span>
                )}
                <span className="kq-badge kq-badge-subtle">
                  <Clock3 size={13} aria-hidden="true" />
                  ~{studyMinutes} min study
                </span>
              </div>

              <details open={index === 0}>
                <summary className="kq-guide-summary">
                  <div className="kq-guide-summary-copy">
                    <h2>{material.title}</h2>
                    {summary && <p>{summary}</p>}
                  </div>
                  {material.image_url && (
                    <img
                      className="kq-guide-thumb"
                      src={material.image_url}
                      alt=""
                      aria-hidden="true"
                      loading="lazy"
                    />
                  )}
                  <span className="kq-guide-toggle"><span className="kq-guide-open-label">Read guide</span><span className="kq-guide-close-label">Close guide</span></span>
                </summary>

                <div className="kq-guide-body">
                  {(material.image_url || videoSource) && (
                    <div className={`kq-media-grid ${material.image_url && videoSource ? 'kq-media-grid--two' : ''}`}>
                      {material.image_url && (
                        <figure className="kq-media-figure">
                          <img
                            src={material.image_url}
                            alt={material.image_caption || material.title}
                            loading="lazy"
                          />
                          {material.image_caption && <figcaption>{material.image_caption}</figcaption>}
                        </figure>
                      )}

                      {videoSource && <VideoReferenceCard material={material} videoSource={videoSource} />}
                    </div>
                  )}

                  {renderGuideSections(material.content)}
                </div>
              </details>

              <div className="kq-actions">
                {material.resource_url && (
                  <a className="kq-button kq-button-secondary" href={material.resource_url} target="_blank" rel="noreferrer">
                    Open additional resource ↗
                  </a>
                )}
                {admin ? (
                  <>
                    <button
                      type="button"
                      className="kq-button kq-button-secondary"
                      disabled={freeDemoReadOnly || busy}
                      onClick={() => openEditor(material)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="kq-button kq-button-danger"
                      disabled={freeDemoReadOnly || busy}
                      onClick={() => remove(material)}
                    >
                      Delete
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={`kq-button ${material.completed ? 'kq-button-secondary' : ''}`}
                    disabled={busy || freeDemoReadOnly}
                    onClick={async () => {
                      if (await run(() => api.put(`/knowledge/materials/${material.id}/completion`, { completed: !material.completed }), 'Learning progress saved.')) {
                        state.reload();
                      }
                    }}
                  >
                    {material.completed ? 'Mark unfinished' : 'Mark complete'}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {!filtered.length && <Empty>No learning materials match these filters.</Empty>}

      <div className="kq-modal">
        <Modal
          isOpen={open}
          onClose={() => setOpen(false)}
          title={editing ? 'Edit learning guide' : 'Add learning guide'}
          maxWidth="max-w-3xl"
        >
          <form className="kq-form" onSubmit={save}>
            <details className="kq-editor-help" open={!editing}>
              <summary>How to add a learning guide</summary>
              <ol>
                <li><strong>Choose a category and title.</strong> Select the skill this guide teaches and enter a clear title (3–160 characters).</li>
                <li><strong>Write the learning guide.</strong> Enter 20–20,000 characters. Explain the topic, give step-by-step instructions, and include a short practice activity. Use the formatting example below to organize your content.</li>
                <li><strong>Add optional learning resources.</strong> Select a built-in diagram and describe it in the caption / alt text. Choose a built-in video or paste an HTTPS YouTube or Vimeo link, then add a video title. You can also include an additional HTTPS resource link.</li>
                <li><strong>Choose whether to publish.</strong> “Published for students” is checked by default. Uncheck it to save a draft that students cannot see.</li>
                <li><strong>Save and review.</strong> Click “Save guide”, then expand the saved guide to check its text, diagram, video, and links. Use “Edit” to make changes.</li>
              </ol>
              <p><strong>Formatting example</strong> — type these symbols in the Learning guide field:</p>
              <pre>{'## Learning overview\nLearn how to organize your files.\n\n## Steps\n1. Create a folder.\n2. Give it a clear name.\n\n## Quick reference\n- **Tip:** Use descriptive file names.\n- Press `Ctrl + S` to save.\n\n## Try it yourself\nCreate a folder and move a practice file into it.'}</pre>
              <p><strong>When editing:</strong> Saving changes resets the guide’s completion records, so students will need to complete it again.</p>
            </details>
            <div className="kq-form-row">
              <Field label="Category">
                <select
                  required
                  value={form.category_id || categories[0]?.id || ''}
                  onChange={(event) => setForm({ ...form, category_id: event.target.value })}
                >
                  {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </Field>
              <Field label="Title">
                <input
                  required
                  minLength={3}
                  maxLength={160}
                  value={form.title}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                />
              </Field>
            </div>

            <Field
              label="Learning guide"
              help="Supports ## Section headings, - **Label:** bullets, numbered steps, and `code`. Editing resets completion records."
            >
              <textarea
                required
                minLength={20}
                maxLength={20000}
                rows={9}
                value={form.content}
                onChange={(event) => setForm({ ...form, content: event.target.value })}
              />
            </Field>

            <div className="kq-form-row">
              <Field label="Built-in diagram image (optional)">
                <select
                  value={form.image_url}
                  onChange={(event) => setForm({ ...form, image_url: event.target.value })}
                >
                  <option value="">No diagram image</option>
                  {BUILTIN_IMAGES.map((item) => (
                    <option key={item.url} value={item.url}>{item.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Diagram caption / alt text (optional)">
                <input
                  type="text"
                  maxLength={240}
                  value={form.image_caption}
                  onChange={(event) => setForm({ ...form, image_caption: event.target.value })}
                  placeholder="Briefly explain what the diagram illustrates"
                />
              </Field>
            </div>

            {form.image_url && (
              <div className="kq-thumb-preview">
                <img src={form.image_url} alt={form.image_caption || 'Selected diagram preview'} />
              </div>
            )}

            <div className="kq-form-row">
              <Field
                label="Video lesson URL (optional)"
                help="Choose a built-in lesson below or paste an HTTPS YouTube / Vimeo link."
              >
                <input
                  type="text"
                  maxLength={500}
                  value={form.video_url}
                  onChange={(event) => setForm({ ...form, video_url: event.target.value })}
                  placeholder="/learning/videos/... or https://youtube.com/watch?v=..."
                />
              </Field>
              <Field label="Video title (optional)">
                <input
                  type="text"
                  maxLength={160}
                  value={form.video_title}
                  onChange={(event) => setForm({ ...form, video_title: event.target.value })}
                  placeholder="Short description shown above the video player"
                />
              </Field>
            </div>

            <Field label="Quick-pick built-in video lesson">
              <select
                value={BUILTIN_VIDEOS.some((item) => item.url === form.video_url) ? form.video_url : ''}
                onChange={(event) => {
                  const selected = BUILTIN_VIDEOS.find((item) => item.url === event.target.value);
                  setForm({
                    ...form,
                    video_url: event.target.value,
                    video_title: selected && !form.video_title ? selected.label : form.video_title,
                  });
                }}
              >
                <option value="">Choose a built-in video…</option>
                {BUILTIN_VIDEOS.map((item) => (
                  <option key={item.url} value={item.url}>{item.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Additional resource URL (optional, HTTPS)">
              <input
                type="url"
                maxLength={500}
                value={form.resource_url}
                onChange={(event) => setForm({ ...form, resource_url: event.target.value })}
              />
            </Field>

            <label className="kq-check">
              <input
                type="checkbox"
                checked={form.is_published}
                onChange={(event) => setForm({ ...form, is_published: event.target.checked })}
              />
              Published for students
            </label>

            <div className="kq-actions">
              <button className="kq-button" disabled={busy || freeDemoReadOnly} type="submit">
                {busy ? 'Saving…' : 'Save guide'}
              </button>
              <button className="kq-button kq-button-secondary" type="button" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      </div>
    </KnowledgePage>
  );
}
