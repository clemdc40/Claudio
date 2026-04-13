// Global reactive state for OllaForge
export const state = {
  // Connection
  ollamaUrl: localStorage.getItem('ollamaUrl') || 'http://127.0.0.1:11434',
  models: [],
  currentModel: localStorage.getItem('currentModel') || '',
  currentModelB: localStorage.getItem('currentModelB') || '',
  ollamaOnline: false,

  // Data
  conversations: [],
  projects: [],
  currentConvId: null,
  currentProjectId: null,

  // UI
  sidebarCollapsed: localStorage.getItem('sidebarCollapsed') === 'true',
  sidebarSection: 'discussions', // discussions | projects | artifacts | code
  theme: localStorage.getItem('theme') || 'dark',
  artifactOpen: false,
  currentArtifact: null,
  compareMode: false,

  // Memory
  memories: [],

  // Composer
  attachments: [],
  isGenerating: false,
  abortController: null,
  webSearchEnabled: localStorage.getItem('webSearchEnabled') === 'true',

  // Skills & Thinking
  activeSkill: null,
  think: (() => {
    const v = localStorage.getItem('think');
    if (v === null) return false;
    if (v === 'true') return true;
    if (v === 'false') return false;
    return v;
  })(),

  // Params defaults
  defaultParams: {
    system: '',
    temperature: 0.7,
    top_p: 0.9,
    top_k: 40,
    repeat_penalty: 1.1,
    num_ctx: 4096,
    num_predict: -1,
    seed: -1,
    searchThreshold: 30
  }
};

// Simple event bus for state changes
const listeners = new Map();

export function on(event, cb) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(cb);
  return () => listeners.get(event).delete(cb);
}

export function emit(event, data) {
  if (listeners.has(event)) {
    listeners.get(event).forEach(cb => cb(data));
  }
}

// Helper to get current conversation
export function getCurrentConv() {
  return state.conversations.find(c => c.id === state.currentConvId);
}

// Skills definitions — like Claude's skill chips
export const SKILLS = [
  {
    id: 'write',
    label: 'Écrire',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>`,
    system: 'Tu es un assistant expert en rédaction. Tu aides à écrire, reformuler, structurer des textes. Tu proposes des améliorations de style, de clarté et de ton. Réponds toujours en français sauf demande contraire.'
  },
  {
    id: 'learn',
    label: 'Apprendre',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
    system: 'Tu es un tuteur pédagogue. Tu expliques les concepts de manière claire avec des exemples concrets. Tu adaptes ton niveau d\'explication. Tu poses des questions pour vérifier la compréhension. Utilise des analogies quand c\'est utile.'
  },
  {
    id: 'code',
    label: 'Code',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
    system: 'Tu es un développeur senior expert. Tu écris du code propre, documenté et performant. Tu utilises les meilleures pratiques.\n\nIMPORTANT: Quand tu crées des interfaces web (HTML, SVG, React/JSX), utilise TOUJOURS le format Artifact pour que l\'utilisateur puisse voir le rendu dans le Canvas.\nFormat à utiliser :\n```html title="Nom de l\'application"\n...code...\n```\nou\n```jsx title="Composant React"\n...code...\n```'
  },
  {
    id: 'daily',
    label: 'Vie quotidienne',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
    system: 'Tu es un assistant polyvalent pour la vie quotidienne. Tu aides avec la cuisine, l\'organisation, les voyages, la santé, les finances personnelles, etc. Tu donnes des conseils pratiques et actionables.'
  },
  {
    id: 'random',
    label: 'Choix de l\'IA',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/></svg>`,
    system: null // No system prompt override
  }
];

// Tool definitions
export const TOOLS = [
  {
    id: 'web_search',
    label: 'Recherche web',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
    description: 'Rechercher des informations sur le web'
  },
  {
    id: 'analyze_image',
    label: 'Analyser image',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`,
    description: 'Analyser et décrire une image'
  },
  {
    id: 'create_artifact',
    label: 'Créer un artifact',
    icon: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`,
    description: 'Créer du contenu interactif (HTML, React, SVG)'
  }
];
