import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../api/axios';
import KnowledgeMaterials from './KnowledgeMaterials';

let currentUser = { id: 7, role: 'respondent' };

vi.mock('../../api/axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../contexts/useAuth', () => ({
  useAuth: () => ({ user: currentUser }),
}));

vi.mock('../../contexts/useDemoMode', () => ({
  useDemoMode: () => ({ freeDemoReadOnly: false }),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const sampleCategories = [
  { id: 1, name: 'Computer Literacy' },
  { id: 2, name: 'Media Literacy' },
];

const sampleMaterials = [
  {
    id: 11,
    category_id: 1,
    category_name: 'Computer Literacy',
    title: 'Computer Literacy: Devices, Files & Troubleshooting',
    image_url: '/learning/images/computer-literacy.webp',
    image_caption: 'Hardware map of CPU, RAM, and organized backups.',
    video_url: '/learning/videos/computer-literacy.mp4',
    video_title: 'Video Walkthrough: Hardware & Backups',
    resource_url: 'https://edu.example.test/files',
    is_published: 1,
    completed: 0,
    content: [
      '## Learning overview',
      'Organize coursework cleanly using `Ctrl+S` and backups.',
      '',
      '## Step-by-step practice',
      '1. **Build folders:** Group files by semester.',
      '',
      '## Do this vs. avoid this',
      '- **Do:** Keep backups in two locations.',
      '- **Avoid:** Saving drafts on shared lab desktops.',
      '',
      '## Try it yourself',
      'Audit one subject folder today.',
    ].join('\n'),
  },
  {
    id: 12,
    category_id: 2,
    category_name: 'Media Literacy',
    title: 'Media Literacy: Context & Clickbait',
    image_url: '/learning/images/media-literacy.webp',
    image_caption: 'Evaluating source framing and sponsorships.',
    video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    video_title: 'Spotting Misleading Clips',
    resource_url: '',
    is_published: 1,
    completed: 1,
    content: '## Learning overview\nCheck original sources and dates before sharing.',
  },
];

describe('KnowledgeMaterials detailed guides, images, and videos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentUser = { id: 7, role: 'respondent' };
    api.get.mockImplementation((url) => {
      if (url === '/knowledge/materials') return Promise.resolve({ data: { data: sampleMaterials } });
      if (url === '/knowledge/categories') return Promise.resolve({ data: { data: sampleCategories } });
      if (url === '/knowledge/overview') return Promise.resolve({ data: { data: { categories: [] } } });
      return Promise.resolve({ data: { data: [] } });
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => 'WEBVTT\n\n00:00:00.000 --> 00:00:04.000\n01 · OVERVIEW: Know how your device works.\n\n00:00:04.000 --> 00:00:08.000\n02 · HARDWARE: CPU and RAM share work.',
    });
  });

  it('renders structured sections, diagrams, captions, and local plus embedded videos', async () => {
    const { container } = render(
      <MemoryRouter>
        <KnowledgeMaterials />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByText('Computer Literacy: Devices, Files & Troubleshooting')).toBeInTheDocument());

    expect(screen.getAllByText('Diagram')).toHaveLength(2);
    expect(screen.getAllByText('Video lesson')).toHaveLength(2);

    const heroImg = screen.getByRole('img', { name: 'Hardware map of CPU, RAM, and organized backups.' });
    expect(heroImg).toHaveAttribute('src', '/learning/images/computer-literacy.webp');

    const localVideo = container.querySelector('video');
    expect(localVideo).toBeInTheDocument();
    expect(localVideo.querySelector('source')).toHaveAttribute('src', '/learning/videos/computer-literacy.mp4');
    expect(localVideo.querySelector('track')).toHaveAttribute('src', '/learning/captions/computer-literacy.vtt');

    await waitFor(() => expect(screen.getByText(/Video chapters & transcript \(2\)/i)).toBeInTheDocument());
    localVideo.play = vi.fn().mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: /0:04.*CPU and RAM share work/i }));
    expect(localVideo.currentTime).toBe(4);
    expect(localVideo.play).toHaveBeenCalledTimes(1);

    expect(screen.getAllByRole('heading', { name: 'Learning overview' })).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Try it yourself' })).toBeInTheDocument();
    expect(container.querySelector('.kq-guide-do')).toBeInTheDocument();
    expect(container.querySelector('.kq-guide-avoid')).toBeInTheDocument();

    const iframe = container.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
  });

  it('lets administrators select diagrams and videos when adding a learning guide', async () => {
    currentUser = { id: 1, role: 'admin' };
    api.post.mockResolvedValue({ data: { data: { id: 99 } } });

    render(
      <MemoryRouter>
        <KnowledgeMaterials />
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByRole('button', { name: /Add learning guide/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Add learning guide/i }));

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New Cybersecurity Visual Guide' } });
    fireEvent.change(screen.getByLabelText('Learning guide'), {
      target: { value: '## Learning overview\nEnable authenticator MFA and store backup scratch codes.' },
    });
    fireEvent.change(screen.getByLabelText('Built-in diagram image (optional)'), {
      target: { value: '/learning/images/digital-safety-and-security.webp' },
    });
    fireEvent.change(screen.getByLabelText('Diagram caption / alt text (optional)'), {
      target: { value: 'Shield diagram showing MFA protection.' },
    });
    fireEvent.change(screen.getByLabelText('Quick-pick built-in video lesson'), {
      target: { value: '/learning/videos/digital-safety-and-security.mp4' },
    });

    expect(screen.getByAltText('Shield diagram showing MFA protection.')).toHaveAttribute(
      'src',
      '/learning/images/digital-safety-and-security.webp'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save guide' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/knowledge/materials', expect.objectContaining({
      title: 'New Cybersecurity Visual Guide',
      image_url: '/learning/images/digital-safety-and-security.webp',
      image_caption: 'Shield diagram showing MFA protection.',
      video_url: '/learning/videos/digital-safety-and-security.mp4',
      video_title: 'Digital Safety & Security Walkthrough (24s)',
      is_published: true,
    })));
  });
});
