import type { ToolConfig } from '@itsjust/core';

const toolConfig = {
  id: 'http-header-parser',
  name: 'HTTP Header Parser',
  description:
    'Paste a raw HTTP response (or curl -i output) and get every header parsed, grouped by category, with explanations of what each header does and security flags highlighted.',
  version: '1.0.0',
  exportFormats: ['json', 'png', 'jpeg', 'webp', 'pdf'],
  features: {
    export: true,
    autoSave: true,
    undoRedo: true,
    sidebar: true,
    statusBar: true,
    darkMode: true,
  },
  theme: {
    accent: '#8b5cf6',
    accentHover: '#7c3aed',
    accentSubtle: 'rgba(139, 92, 246, 0.08)',
    brand: 'HTTP Header Parser',
    icon: '🌐',
  },
} satisfies ToolConfig;

export default toolConfig;
