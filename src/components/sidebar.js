// Sidebar component — Claude-style with collapsible icon mode
import { state, emit, on, SKILLS } from '../lib/state.js';
import { escapeHtml } from '../lib/markdown.js';

export function renderSidebar() {
  const collapsed = state.sidebarCollapsed;
  const section = state.sidebarSection;

  return `
  <aside class="sidebar ${collapsed ? 'sidebar--collapsed' : ''}" id="sidebar">
    <!-- Top brand + toggle -->
    <div class="sidebar__brand">
      ${collapsed ? `
        <button class="sidebar__toggle" onclick="window.__toggleSidebar()" title="Ouvrir le menu">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
        </button>
      ` : `
        <span class="sidebar__title">OllaForge</span>
        <button class="sidebar__toggle" onclick="window.__toggleSidebar()" title="Réduire le menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></svg>
        </button>
      `}
    </div>

    <!-- Quick actions -->
    <div class="sidebar__actions">
      <button class="sidebar__action-btn" onclick="window.__newChat()" title="Nouvelle conversation">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>
        ${collapsed ? '' : '<span>Nouvelle conversation</span>'}
      </button>
      <button class="sidebar__action-btn" onclick="window.__openPalette()" title="Rechercher">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        ${collapsed ? '' : '<span>Rechercher</span>'}
      </button>
      <button class="sidebar__action-btn" onclick="window.__openMemoryModal()" title="Mémoire">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></svg>
        ${collapsed ? '' : `<span>Mémoire <span class="sidebar__mem-count">${state.memories?.length || 0}</span></span>`}
      </button>
      <button class="sidebar__action-btn" onclick="window.__openSettings()" title="Personnaliser">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09c-.658.003-1.25.396-1.51 1z"/></svg>
        ${collapsed ? '' : '<span>Personnaliser</span>'}
      </button>
    </div>

    <!-- Section tabs -->
    ${collapsed ? '' : `
    <nav class="sidebar__nav">
      <button class="sidebar__nav-item ${section === 'discussions' ? 'active' : ''}" onclick="window.__setSidebarSection('discussions')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <span>Discussions</span>
      </button>
      <button class="sidebar__nav-item ${section === 'projects' ? 'active' : ''}" onclick="window.__setSidebarSection('projects')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span>Projets</span>
      </button>
      <button class="sidebar__nav-item ${section === 'artifacts' ? 'active' : ''}" onclick="window.__setSidebarSection('artifacts')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="5" r="1"/><circle cx="19" cy="19" r="1"/><circle cx="19" cy="5" r="1"/><circle cx="5" cy="19" r="1"/></svg>
        <span>Artéfacts</span>
      </button>
      <button class="sidebar__nav-item ${section === 'code' ? 'active' : ''}" onclick="window.__setSidebarSection('code')">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
        <span>Code</span>
      </button>
    </nav>
    `}

    <!-- Section content -->
    ${collapsed ? '' : renderSidebarContent(section)}

    <!-- Bottom bar -->
    <div class="sidebar__bottom">
      <div class="sidebar__user-wrap">
        <div class="sidebar__user">
          <span class="sidebar__avatar">CD</span>
          ${collapsed ? '' : `
            <div class="sidebar__user-info">
              <span class="sidebar__user-name">Clément Da Cruz</span>
            </div>
          `}
        </div>
        ${collapsed ? '' : `
          <div class="sidebar__user-actions">
            <button class="sidebar__bottom-btn" onclick="window.__exportChat()" title="Télécharger">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            </button>
            <button class="sidebar__bottom-btn" title="Plus">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m7 15 5 5 5-5M7 9l5-5 5 5"/></svg>
            </button>
          </div>
        `}
      </div>
      
      ${collapsed ? '' : `
      <div class="sidebar__status-bar">
        <div class="sidebar__status" onclick="window.__loadModels()" title="Cliquer pour rafraîchir">
          <span class="status-dot ${state.ollamaOnline ? 'status-dot--online' : 'status-dot--offline'}"></span>
          <span class="sidebar__status-text">${state.ollamaOnline ? (state.currentModel || 'Aucun modèle') : 'Hors ligne'}</span>
        </div>
        <button class="sidebar__bottom-btn" onclick="window.__toggleTheme()" title="Thème">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
        </button>
      </div>
      `}
    </div>
  </aside>`;
}

function renderSidebarContent(section) {
  switch (section) {
    case 'discussions': return renderDiscussions();
    case 'projects': return renderProjects();
    case 'artifacts': return renderArtifacts();
    case 'code': return renderCodeSection();
    default: return renderDiscussions();
  }
}

function renderDiscussions() {
  const convs = state.conversations.filter(c =>
    !state.currentProjectId || c.projectId === state.currentProjectId
  );

  // Group by date
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);

  const favorites = convs.filter(c => c.favorite);
  const todayConvs = convs.filter(c => !c.favorite && c.updatedAt >= today.getTime());
  const yesterdayConvs = convs.filter(c => !c.favorite && c.updatedAt >= yesterday.getTime() && c.updatedAt < today.getTime());
  const olderConvs = convs.filter(c => !c.favorite && c.updatedAt < yesterday.getTime());

  let html = '<div class="sidebar__list">';

  if (favorites.length) {
    html += `<div class="sidebar__group-title">Favoris</div>`;
    html += favorites.map(c => convItem(c)).join('');
  }

  if (todayConvs.length) {
    html += `<div class="sidebar__group-title">Aujourd'hui</div>`;
    html += todayConvs.map(c => convItem(c)).join('');
  }

  if (yesterdayConvs.length) {
    html += `<div class="sidebar__group-title">Hier</div>`;
    html += yesterdayConvs.map(c => convItem(c)).join('');
  }

  if (olderConvs.length) {
    html += `<div class="sidebar__group-title">Récents</div>`;
    html += olderConvs.map(c => convItem(c)).join('');
  }

  if (!convs.length) {
    html += '<div class="sidebar__empty">Aucune conversation</div>';
  }

  html += '</div>';
  return html;
}

function convItem(c) {
  return `
    <div class="sidebar__item ${c.id === state.currentConvId ? 'sidebar__item--active' : ''}" onclick="window.__selectConv('${c.id}')">
      <span class="sidebar__item-text">${escapeHtml(c.title)}</span>
      <div class="sidebar__item-actions">
        <button onclick="event.stopPropagation();window.__deleteChat('${c.id}')" title="Supprimer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
        </button>
      </div>
    </div>`;
}

function renderProjects() {
  let html = `<div class="sidebar__list">
    <button class="sidebar__add-btn" onclick="window.__openProjectModal()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>
      Nouveau projet
    </button>`;

  state.projects.forEach(p => {
    html += `
      <div class="sidebar__item ${state.currentProjectId === p.id ? 'sidebar__item--active' : ''}" onclick="window.__selectProject('${p.id}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <span class="sidebar__item-text">${escapeHtml(p.name)}</span>
        <div class="sidebar__item-actions">
          <button onclick="event.stopPropagation();window.__deleteProject('${p.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/></svg>
          </button>
        </div>
      </div>`;
  });

  if (!state.projects.length) {
    html += '<div class="sidebar__empty">Aucun projet</div>';
  }

  html += '</div>';
  return html;
}

function renderArtifacts() {
  // Collect all artifacts from all conversations
  const allArtifacts = [];
  state.conversations.forEach(c => {
    c.messages?.forEach(m => {
      if (m._artifacts) {
        m._artifacts.forEach(a => allArtifacts.push({ ...a, convTitle: c.title }));
      }
    });
  });

  let html = '<div class="sidebar__list">';
  if (!allArtifacts.length) {
    html += '<div class="sidebar__empty">Les artéfacts créés dans vos conversations apparaîtront ici.</div>';
  } else {
    allArtifacts.forEach(a => {
      html += `
        <div class="sidebar__item" onclick="window.__openArtifact(${JSON.stringify(a).replace(/"/g, '&quot;')})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
          <span class="sidebar__item-text">${escapeHtml(a.title)}</span>
          <span class="sidebar__item-tag">${a.type}</span>
        </div>`;
    });
  }
  html += '</div>';
  return html;
}

function renderCodeSection() {
  let html = '<div class="sidebar__list">';
  html += '<div class="sidebar__empty">Les blocs de code de vos conversations seront accessibles ici.</div>';
  html += '</div>';
  return html;
}
