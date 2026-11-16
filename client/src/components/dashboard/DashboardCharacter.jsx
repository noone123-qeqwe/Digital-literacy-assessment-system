import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Pause, Pencil, Play, RotateCcw } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../api/axios';
import { useAuth } from '../../contexts/useAuth';
import { useDemoMode } from '../../contexts/useDemoMode';
import Modal from '../common/Modal';
import CharacterArt from './CharacterArt';
import characterSchema from '../../../../shared/dashboard-character.json';
import './DashboardCharacter.css';

const { defaults, choices, ranges } = characterSchema;
const panels = ['Character', 'Clothing', 'Scene', 'Motion'];
const skinTones = ['#f6d8bb', '#e8ba91', '#d99e6c', '#bd8154', '#925f41', '#613d30'];

function CharacterScene({ settings, preview = false, paused = false }) {
  const sceneRef = useRef(null);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const updateVisibility = () => setPageVisible(!document.hidden);
    const observer = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(([entry]) => setInView(entry.isIntersecting))
      : null;
    if (sceneRef.current) observer?.observe(sceneRef.current);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  }, []);

  const transform = {
    transform: `translate(${settings.horizontalPosition}%, ${settings.verticalPosition}%) scale(${settings.size / 100}) scaleX(${settings.flip ? -1 : 1})`,
  };
  return (
    <div ref={sceneRef} className={`character-scene ${preview ? 'character-scene-preview' : ''}`} data-paused={paused || !inView || !pageVisible} role="img" aria-label="Your customized student character">
      {settings.showBackdrop && <span className="character-backdrop" style={{ backgroundColor: settings.backdropColor }} />}
      <div className="character-position" style={transform}>
        <div className="character-motion" data-animation={settings.animation}>
          <CharacterArt className="character-art" settings={settings} aria-hidden="true" preserveAspectRatio="xMidYMax meet" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardCharacter() {
  const { user } = useAuth();
  const { freeDemoReadOnly, available: demoStatusAvailable } = useDemoMode();
  const userId = user?.id;
  const [settings, setSettings] = useState({ ...defaults });
  const [draft, setDraft] = useState({ ...defaults });
  const [isOpen, setIsOpen] = useState(false);
  const [panel, setPanel] = useState('Character');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [reload, setReload] = useState(0);
  const [motionPaused, setMotionPaused] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setLoading(true);
      try {
        const response = await api.get('/auth/me/dashboard-character', { signal: controller.signal });
        if (controller.signal.aborted) return;
        const saved = { ...defaults, ...response.data.data.settings };
        setSettings(saved);
        setDraft(saved);
        setLoadError('');
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error.response?.data?.message || 'Your saved character could not be loaded. Try again before saving changes.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [userId, reload]);

  const update = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaveError('');
  };
  const close = () => { if (!saving) setIsOpen(false); };
  const open = () => {
    setDraft({ ...settings });
    setSaveError('');
    setPanel('Character');
    setIsOpen(true);
  };
  const save = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const response = await api.put('/auth/me/dashboard-character', { settings: draft });
      const saved = { ...defaults, ...response.data.data.settings };
      setSettings(saved);
      setDraft(saved);
      setIsOpen(false);
      toast.success('Your character was saved.');
    } catch (error) {
      setSaveError(error.response?.data?.message || 'Your character could not be saved. Your changes are still in the preview.');
    } finally {
      setSaving(false);
    }
  };
  const colorControl = (key, label) => (
    <label className="character-color-control" key={key}>
      <span>{label}</span>
      <input type="color" value={draft[key]} onChange={(event) => update(key, event.target.value)} />
    </label>
  );
  const selectControl = (key, label) => (
    <label className="character-field" key={key}>
      <span>{label}</span>
      <select value={draft[key]} onChange={(event) => update(key, event.target.value)}>
        {choices[key].map((option) => <option key={option} value={option}>{option === 'tshirt' ? 'T-shirt' : option.charAt(0).toUpperCase() + option.slice(1)}</option>)}
      </select>
    </label>
  );
  const toggleControl = (key, label) => (
    <label className="character-checkbox" key={key}>
      <input type="checkbox" checked={draft[key]} onChange={(event) => update(key, event.target.checked)} />
      <span>{label}</span>
    </label>
  );
  const rangeControl = (key, label, suffix = '%') => (
    <label className="character-range" key={key}>
      <span>{label}<output>{draft[key]}{suffix}</output></span>
      <input type="range" min={ranges[key].min} max={ranges[key].max} step="1" value={draft[key]} onChange={(event) => update(key, Number(event.target.value))} />
    </label>
  );

  return <>
    <div className="dashboard-welcome-art" aria-hidden="true">
      {!loading && <CharacterScene settings={settings} paused={motionPaused || isOpen} />}
    </div>
    <div className="dashboard-character-actions">
      <button type="button" onClick={open} className="dashboard-character-edit" aria-label="Customize your dashboard character">
        <Pencil aria-hidden="true" size={14} />
        <span>Customize character</span>
      </button>
    </div>
    {createPortal(
      <div className="character-dialog">
        <Modal isOpen={isOpen} onClose={close} title="Customize your character" maxWidth="max-w-4xl" footer={(
          <div className="character-editor-footer">
            <span>{loading ? 'Loading your saved character…' : 'Save to apply this character to your dashboard.'}</span>
            <div>
              <button type="button" className="character-cancel" onClick={close} disabled={saving}>Cancel</button>
              <button type="button" className="character-save" onClick={save} disabled={loading || saving || Boolean(loadError) || !demoStatusAvailable || freeDemoReadOnly}>
                {saving ? 'Saving…' : 'Save character'}
              </button>
            </div>
          </div>
        )}>
          {loadError && <div className="character-editor-error" role="alert"><p>{loadError}</p><button type="button" onClick={() => setReload((value) => value + 1)} disabled={loading}>Try again</button></div>}
          {freeDemoReadOnly && <p className="character-demo-note">You can preview your character here. Saving is available in the full system.</p>}
          <div className="character-editor-layout" aria-busy={loading}>
            <div className="character-preview">
              <div className="character-preview-frame"><CharacterScene settings={draft} paused={motionPaused} preview /></div>
              <p>Live preview</p>
              <button type="button" disabled={loading || saving} className="character-reset" onClick={() => setDraft({ ...defaults })}><RotateCcw aria-hidden="true" size={15} />Reset to default</button>
            </div>
            <div className="character-controls">
              <div className="character-panel-switcher" role="group" aria-label="Character settings sections">
                {panels.map((name) => <button key={name} type="button" onClick={() => setPanel(name)} aria-pressed={panel === name}>{name}</button>)}
              </div>
              <fieldset disabled={loading || saving} className="character-control-panel">
                <legend className="sr-only">{panel} settings</legend>
                {panel === 'Character' && <>
                  <div className="character-select-grid">
                    {selectControl('hairStyle', 'Hairstyle')}
                    {selectControl('expression', 'Expression')}
                    {selectControl('glasses', 'Glasses')}
                    {selectControl('facialHair', 'Facial hair')}
                  </div>
                  <fieldset className="character-skin-tones">
                    <legend>Skin tone</legend>
                    <div>{skinTones.map((tone, index) => (
                      <button type="button" key={tone} onClick={() => update('skinColor', tone)} aria-label={`Skin tone ${index + 1}`} aria-pressed={draft.skinColor === tone} style={{ backgroundColor: tone }}>
                        {draft.skinColor === tone && <Check aria-hidden="true" size={18} />}
                      </button>
                    ))}</div>
                  </fieldset>
                  <div className="character-color-grid">
                    {colorControl('skinColor', 'Custom skin color')}
                    {colorControl('hairColor', 'Hair color')}
                    {colorControl('eyeColor', 'Eye color')}
                  </div>
                </>}
                {panel === 'Clothing' && <>
                  {selectControl('outfit', 'Clothing style')}
                  <div className="character-color-grid">
                    {colorControl('shirtColor', 'Main clothing color')}
                    {colorControl('accentColor', 'Collar and trim')}
                  </div>
                </>}
                {panel === 'Scene' && <>
                  <div className="character-color-grid">
                    {colorControl('laptopColor', 'Laptop color')}
                    {colorControl('backdropColor', 'Backdrop color')}
                  </div>
                  {toggleControl('showBackdrop', 'Show backdrop')}
                  {toggleControl('showBooks', 'Show books')}
                  {toggleControl('showPlant', 'Show plant')}
                </>}
                {panel === 'Motion' && <>
                  {selectControl('animation', 'Animation')}
                  {draft.animation !== 'none' && <button type="button" className="character-cancel character-preview-motion-toggle" onClick={() => setMotionPaused((paused) => !paused)}>
                    {motionPaused ? <Play aria-hidden="true" size={15} /> : <Pause aria-hidden="true" size={15} />}
                    {motionPaused ? 'Resume animation' : 'Pause animation'}
                  </button>}
                  {rangeControl('size', 'Character size')}
                  {rangeControl('horizontalPosition', 'Horizontal position')}
                  {rangeControl('verticalPosition', 'Vertical position')}
                  {toggleControl('flip', 'Face the other direction')}
                  <p className="character-motion-note">Animations follow your device’s reduced-motion setting.</p>
                </>}
              </fieldset>
            </div>
          </div>
          {saveError && <p role="alert" className="character-editor-error">{saveError}</p>}
        </Modal>
      </div>,
      document.body
    )}
  </>;
}
