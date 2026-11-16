import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../api/axios';
import characterSchema from '../../../../shared/dashboard-character.json';
import CharacterArt from './CharacterArt';
import DashboardCharacter from './DashboardCharacter';

vi.mock('../../api/axios', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('../../contexts/useAuth', () => ({
  useAuth: () => ({ user: { id: 42 } }),
}));

vi.mock('../../contexts/useDemoMode', () => ({
  useDemoMode: () => ({ freeDemoReadOnly: false, available: true }),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('CharacterArt animation structure', () => {
  it('groups the person separately from grounded desk props', () => {
    const { container } = render(<CharacterArt settings={characterSchema.defaults} />);

    const personLayers = container.querySelectorAll('.character-person');
    expect(personLayers).toHaveLength(2);
    expect(container.querySelector('.character-person .character-head')).toBeInTheDocument();
    expect(container.querySelector('.character-person .character-hand-left')).toBeInTheDocument();
    expect(container.querySelector('.character-person .character-hand-right')).toBeInTheDocument();

    for (const propSelector of [
      '.character-laptop-base',
      '.character-laptop-lid',
      '.character-plant',
      '.character-mug',
      '.character-books',
    ]) {
      const prop = container.querySelector(propSelector);
      expect(prop).toBeInTheDocument();
      expect(prop.closest('.character-person')).toBeNull();
    }
  });

  it('marks closed happy eyes so blink keyframes skip them', () => {
    const { container, rerender } = render(
      <CharacterArt settings={{ ...characterSchema.defaults, expression: 'happy' }} />
    );
    expect(container.querySelector('.character-eyes--happy')).toBeInTheDocument();

    rerender(<CharacterArt settings={{ ...characterSchema.defaults, expression: 'focused' }} />);
    expect(container.querySelector('.character-eyes')).toBeInTheDocument();
    expect(container.querySelector('.character-eyes--happy')).toBeNull();
  });
});

describe('DashboardCharacter motion controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({
      data: {
        data: {
          settings: { ...characterSchema.defaults },
        },
      },
    });
  });

  it('updates data-animation, data-speed, and data-paused across the preview and dashboard scenes', async () => {
    const { container } = render(<DashboardCharacter />);

    await waitFor(() => {
      expect(container.querySelector('.character-scene')).toHaveAttribute('data-paused', 'false');
    });

    const dashboardMotion = container.querySelector('.character-motion');
    expect(dashboardMotion).toHaveAttribute('data-animation', 'float');
    expect(dashboardMotion).toHaveAttribute('data-speed', 'normal');

    fireEvent.click(screen.getByRole('button', { name: /Change character animation/i }));

    const previewScene = document.body.querySelector('.character-scene-preview');
    const previewMotion = previewScene.querySelector('.character-motion');

    expect(container.querySelector('.character-scene')).toHaveAttribute('data-paused', 'true');
    expect(previewScene).toHaveAttribute('data-paused', 'false');
    expect(previewMotion).toHaveAttribute('data-animation', 'float');
    expect(previewMotion).toHaveAttribute('data-speed', 'normal');

    fireEvent.click(screen.getByRole('button', { name: /Focused study/i }));
    expect(previewMotion).toHaveAttribute('data-animation', 'typing');

    fireEvent.click(screen.getByRole('button', { name: 'Lively' }));
    expect(previewMotion).toHaveAttribute('data-speed', 'lively');

    fireEvent.click(screen.getByRole('button', { name: 'Pause animation' }));
    expect(previewScene).toHaveAttribute('data-paused', 'true');
    expect(screen.getByRole('button', { name: 'Resume animation' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Resume animation' }));
    expect(previewScene).toHaveAttribute('data-paused', 'false');
    expect(screen.getByRole('button', { name: 'Pause animation' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pause animation' }));
    expect(previewScene).toHaveAttribute('data-paused', 'true');

    fireEvent.click(screen.getByRole('button', { name: /Greeting wave/i }));
    expect(previewMotion).toHaveAttribute('data-animation', 'wave');
    expect(previewScene).toHaveAttribute('data-paused', 'false');

    fireEvent.click(screen.getByRole('button', { name: /Still/i }));
    expect(previewMotion).toHaveAttribute('data-animation', 'none');
    expect(screen.queryByRole('button', { name: /Pause animation|Resume animation/i })).toBeNull();
  });
});
