import React from 'react';

export const BUILTIN_IMAGES = [
  { label: 'Computer Literacy — Hardware, Files & Updates', url: '/learning/images/computer-literacy.webp' },
  { label: 'Internet Literacy — Browser, HTTPS & Search', url: '/learning/images/internet-literacy.webp' },
  { label: 'Information Literacy — Source Checking & Evidence', url: '/learning/images/information-literacy.webp' },
  { label: 'Digital Communication — Email Etiquette & Sharing', url: '/learning/images/digital-communication.webp' },
  { label: 'Digital Safety & Security — MFA & Phishing Defense', url: '/learning/images/digital-safety-and-security.webp' },
  { label: 'Digital Citizenship — Ethics, Privacy & Copyright', url: '/learning/images/digital-citizenship.webp' },
  { label: 'Productivity Tools — Docs, Sheets & Accessible Slides', url: '/learning/images/productivity-tools.webp' },
  { label: 'Media Literacy — Context, Clickbait & Sponsorship', url: '/learning/images/media-literacy.webp' },
];

export const BUILTIN_VIDEOS = [
  { label: 'Computer Literacy Walkthrough (24s)', url: '/learning/videos/computer-literacy.mp4' },
  { label: 'Internet Literacy Walkthrough (24s)', url: '/learning/videos/internet-literacy.mp4' },
  { label: 'Information Literacy Walkthrough (24s)', url: '/learning/videos/information-literacy.mp4' },
  { label: 'Digital Communication Walkthrough (24s)', url: '/learning/videos/digital-communication.mp4' },
  { label: 'Digital Safety & Security Walkthrough (24s)', url: '/learning/videos/digital-safety-and-security.mp4' },
  { label: 'Digital Citizenship Walkthrough (24s)', url: '/learning/videos/digital-citizenship.mp4' },
  { label: 'Productivity Tools Walkthrough (24s)', url: '/learning/videos/productivity-tools.mp4' },
  { label: 'Media Literacy Walkthrough (24s)', url: '/learning/videos/media-literacy.mp4' },
];

export function resolveVideoSource(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return null;

  const localMatch = /^\/learning\/videos\/([a-z0-9_-]+)\.(?:mp4|webm)$/i.exec(value);
  if (localMatch) {
    return {
      kind: 'local',
      src: value,
      mimeType: value.toLowerCase().endsWith('.webm') ? 'video/webm' : 'video/mp4',
      captionsUrl: `/learning/captions/${localMatch[1]}.vtt`,
    };
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    const id = parsed.searchParams.get('v')
      || (/^\/(?:embed|shorts)\/([A-Za-z0-9_-]{6,})/.exec(parsed.pathname)?.[1]);
    if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) {
      return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, provider: 'YouTube' };
    }
  }
  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1).split('/')[0];
    if (id && /^[A-Za-z0-9_-]{6,}$/.test(id)) {
      return { kind: 'iframe', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0`, provider: 'YouTube' };
    }
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = /\/(?:video\/)?(\d{5,})/.exec(parsed.pathname)?.[1];
    if (id) {
      return { kind: 'iframe', src: `https://player.vimeo.com/video/${id}`, provider: 'Vimeo' };
    }
  }

  return { kind: 'link', src: parsed.toString() };
}

export function estimateStudyMinutes(material) {
  const words = String(material?.content || '').trim().split(/\s+/).filter(Boolean).length;
  const reading = Math.max(1, Math.ceil(words / 180));
  return material?.video_url ? reading + 1 : reading;
}

export function extractGuideSummary(content) {
  const lines = String(content || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('##')) continue;
    const plain = line.replace(/^[-*\d.]+\s*/, '').replace(/\*\*/g, '').replace(/`/g, '');
    if (plain.length > 20) return plain;
  }
  return '';
}

export function renderInlineFormatting(text) {
  const tokens = String(text || '').split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.filter(Boolean).map((token, index) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={index}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return <code key={index} className="kq-inline-code">{token.slice(1, -1)}</code>;
    }
    return <React.Fragment key={index}>{token}</React.Fragment>;
  });
}

export function parseGuideSections(content) {
  const lines = String(content || '').split(/\r?\n/);
  const sections = [];
  let current = { heading: '', blocks: [] };
  let listType = null;
  let listItems = [];

  const flushList = () => {
    if (!listItems.length) return;
    current.blocks.push({ type: listType, items: listItems });
    listType = null;
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushList();
      continue;
    }
    if (line.startsWith('## ')) {
      flushList();
      if (current.heading || current.blocks.length) sections.push(current);
      current = { heading: line.slice(3).trim(), blocks: [] };
      continue;
    }
    const bulletMatch = /^[-*]\s+(.+)$/.exec(line);
    if (bulletMatch) {
      if (listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(bulletMatch[1]);
      continue;
    }
    const orderedMatch = /^\d+\.\s+(.+)$/.exec(line);
    if (orderedMatch) {
      if (listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(orderedMatch[1]);
      continue;
    }
    flushList();
    current.blocks.push({ type: 'p', text: line });
  }
  flushList();
  if (current.heading || current.blocks.length) sections.push(current);
  return sections;
}

export function parseVttCues(vttText) {
  const blocks = String(vttText || '').replace(/\r\n/g, '\n').split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    const timeLine = lines.find((line) => line.includes('-->'));
    if (!timeLine) continue;
    const match = /^(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s+-->/.exec(timeLine);
    if (!match) continue;
    const startSeconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
    const text = lines.slice(lines.indexOf(timeLine) + 1).join(' ').trim();
    if (!text) continue;
    const minutes = Math.floor(startSeconds / 60);
    const seconds = Math.floor(startSeconds % 60).toString().padStart(2, '0');
    cues.push({ startSeconds, timestamp: `${minutes}:${seconds}`, text });
  }
  return cues;
}
