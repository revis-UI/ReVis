import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useChartStore } from '../model/editor';
import { EditorSelector } from './EditorSelector';

vi.mock('../utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils')>();
  return {
    ...actual,
    getImagePath: vi.fn(async () => '/reference.png'),
  };
});

describe('EditorSelector', () => {
  afterEach(() => {
    cleanup();
    useChartStore.setState({ isSaving: false });
  });

  it('disables file switching while the current document is saving', () => {
    useChartStore.setState({
      dsl_file: '01_simple_bar_chart',
      isSaving: true,
    });

    render(<EditorSelector />);

    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
