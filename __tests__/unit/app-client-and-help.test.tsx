import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import ToolClient from '@/app/tool-client';
import ToolClientWrapper from '@/app/tool-client-wrapper';
import { compressToEncodedURIComponent } from 'lz-string';

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/dynamic', () => ({
  default: () => () => <div data-testid="dynamic-tool-client">dynamic-tool-client</div>,
}));

const mockSetData = vi.fn();
const mockToast = vi.fn();
const mockHandleExport = vi.fn();
const mockImport = vi.fn();
const mockToolbarActions = { canUndo: true, canRedo: true, onUndo: vi.fn(), onRedo: vi.fn() };

vi.mock('@itsjust/core', () => ({
  ToolShell: ({ toolbar, sidebar, canvas, statusBar }: Record<string, unknown>) => (
    <div>
      <div>{toolbar as ReactNode}</div>
      <div>{sidebar as ReactNode}</div>
      <div>{canvas as ReactNode}</div>
      <div>{statusBar as ReactNode}</div>
    </div>
  ),
  ImportExport: ({ onShare }: { onShare?: () => void }) => (
    <button type="button" onClick={onShare}>
      trigger-share
    </button>
  ),
  useTool: () => ({
    state: {
      data: {
        input: 'HTTP/1.1 200 OK\nServer: test\n',
        history: [],
      },
      setData: mockSetData,
      isDirty: false,
      lastSaved: 'just now',
    },
    toast: mockToast,
    supportedFormats: ['json'],
    handleExport: mockHandleExport,
    importFromFile: mockImport,
    isImporting: false,
    toolbarActions: mockToolbarActions,
  }),
}));

vi.mock('@/tool', () => ({
  toolConfig: {
    id: 'http-header-parser',
    name: 'HTTP Header Parser',
    version: '1.0.0',
    features: { sidebar: true },
    theme: { brand: 'HTTP Header Parser' },
  },
  templateBaseVersion: '1.1.0',
  Canvas: ({ state }: { state: { input: string } }) => <div>canvas:{state.input.length}</div>,
  Toolbar: () => <div>toolbar</div>,
  Sidebar: () => <div>sidebar</div>,
}));

vi.mock('@/tool/tool-definition', () => ({
  httpHeaderParserTool: {
    serialize: (state: unknown) => JSON.stringify(state),
    deserialize: (payload: unknown) =>
      typeof payload === 'object' && payload !== null
        ? {
            success: true,
            data: { input: 'HTTP/1.1 200 OK\nServer: shared\n', history: [] },
          }
        : {
            success: false,
            error: 'Invalid data format: expected HTTP header parser state object',
          },
  },
}));

describe('app client and help page', () => {
  beforeEach(() => {
    mockSetData.mockReset();
    mockToast.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      writable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
    Object.defineProperty(navigator, 'share', {
      writable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    const shared = compressToEncodedURIComponent(
      JSON.stringify({ input: 'HTTP/1.1 200 OK\nServer: shared\n', history: [] })
    );
    window.history.replaceState(
      null,
      '',
      `http://localhost:3000/?state=${encodeURIComponent(shared)}`
    );
  });

  it('renders dynamic tool client wrapper', () => {
    render(<ToolClientWrapper />);
    expect(screen.getByTestId('dynamic-tool-client')).toBeInTheDocument();
  });

  it('renders tool client shell sections', () => {
    render(<ToolClient />);
    expect(screen.getByText('toolbar')).toBeInTheDocument();
    expect(screen.getByText('sidebar')).toBeInTheDocument();
    expect(screen.getByText(/canvas:/)).toBeInTheDocument();
    expect(screen.getAllByText(/saved/i).length).toBeGreaterThan(0);
  });

  it('loads shared state from URL and reports success', () => {
    render(<ToolClient />);
    expect(mockToast).toHaveBeenCalledWith('Loaded state from shared URL', 'success');
    expect(mockSetData).toHaveBeenCalled();
  });

  it('reports an error toast for an invalid shared URL', () => {
    window.history.replaceState(
      null,
      '',
      `http://localhost:3000/?state=${encodeURIComponent(compressToEncodedURIComponent('not json at all {{{'))}`
    );
    render(<ToolClient />);
    expect(mockToast).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(mockSetData).not.toHaveBeenCalled();
  });

  it('handles the share flow via ImportExport', async () => {
    window.history.replaceState(null, '', 'http://localhost:3000/');
    render(<ToolClient />);
    fireEvent.click(screen.getByText('trigger-share'));
    await vi.waitFor(() => {
      expect(mockToast).toHaveBeenCalled();
    });
  });
});
