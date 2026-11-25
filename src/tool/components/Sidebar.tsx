'use client';

import React from 'react';
import type { ParsedResponse, ToolState } from '../types';

interface SidebarProps {
  state: ToolState;
  parsed: ParsedResponse;
  onChange: (next: ToolState) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ state, parsed }) => {
  const missingCount = parsed.securityChecks.filter((c) => !c.present).length;
  return (
    <div className="p-4 space-y-6 text-sm overflow-y-auto h-full" data-testid="sidebar">
      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Input formats</h3>
        <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
          <li>Raw HTTP response (status line + headers)</li>
          <li>curl -i output (client noise lines are ignored)</li>
          <li>wget -S / wget --server-response output</li>
          <li>Response headers only, without a status line</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Current parse</h3>
        <ul
          className="space-y-1 text-xs text-gray-600 dark:text-gray-300"
          data-testid="sidebar-stats"
        >
          <li>Headers: {parsed.headers.length}</li>
          <li>Cookies: {parsed.cookies.length}</li>
          <li>Missing security headers: {missingCount}</li>
          <li>
            History: {state.history.length} entr{state.history.length === 1 ? 'y' : 'ies'}
          </li>
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Copying</h3>
        <ul className="space-y-1 text-xs text-gray-600 dark:text-gray-300">
          <li>Copy per-header from the canvas</li>
          <li>Copy all headers as JSON</li>
          <li>Copy a curl -I command for the target URL</li>
          <li>Share the whole state via the toolbar share button</li>
        </ul>
      </div>

      <div>
        <h3 className="mb-2 font-medium text-gray-900 dark:text-gray-100">Privacy</h3>
        <p className="text-xs text-gray-600 dark:text-gray-300">
          Everything runs locally in your browser — the pasted response never leaves this tab.
        </p>
      </div>
    </div>
  );
};
