import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import Layout from './Layout';

vi.mock('../../contexts/useAuth', () => ({
  useAuth: () => ({
    user: { id: 9, first_name: 'Maria', last_name: 'Santos', role: 'respondent' },
    profilePictureUrl: '',
    logout: vi.fn(),
    isAdmin: false,
  }),
}));

describe('Layout mobile navigation', () => {
  it('omits the bottom student mobile bar while preserving the top menu button', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/respondent/knowledge']}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/respondent/knowledge" element={<div>Knowledge content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(container.querySelector('.student-mobile-nav')).toBeNull();
    expect(container.querySelector('.has-student-mobile-nav')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Student navigation' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More student options' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open navigation menu' })).toBeInTheDocument();
  });
});
