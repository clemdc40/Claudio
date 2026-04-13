import './styles/main.css';
import { state, emit, on, getCurrentConv } from './lib/state.js';
import { openDB, dbGet, dbGetAll, dbPut, dbDel } from './lib/db.js';
import { loadModels, pullModel, deleteModel, streamChat, stopGeneration } from './lib/ollama.js';
import { readFile } from './lib/files.js';
import { escapeHtml } from './lib/markdown.js';
import { showToast } from './components/toast.js';

// Components
import { renderSidebar } from './components/sidebar.js';
import { renderMessages, createStreamingMessage, updateStreamingMessage, renderMessage } from './components/chat.js';
import * as chatM from './components/chat.js';
import { renderComposer, renderAttachments } from './components/composer.js';
import { renderCanvas, openArtifact, closeCanvas, switchCanvasTab, copyArtifact, downloadArtifact } from './components/canvas.js';
import { renderModals, updateSettingsModelList } from './components/modals.js';

// --- Initialization ---

async function init() {
  document.documentElement.setAttribute('data-theme', state.theme);
  
  // Render base shell layout
  document.getElementById('app').innerHTML = `
    ${renderSidebar()}
    <main class="main">
      <div class="messages" id="messagesWrap">${renderMessages(null)}</div>
      ${renderComposer()}
    </main>
    ${renderCanvas()}
  `;
  document.getElementById('modals').innerHTML = renderModals();

  // Setup DB and load status
  try {
    await import('./lib/db.js').then(async m => {
      await m.openDB();
      state.conversations = (await m.dbGetAll('conversations')).sort((a,b) => b.updatedAt - a.updatedAt);
      state.projects = await m.dbGetAll('projects');
      state.memories = await m.dbGetAll('memories');
      
      // Select first conversation or init
      if (state.conversations.length) {
        state.currentConvId = state.conversations[0].id;
      } else {
        newChat();
      }
      
      updateAppUI();
    });
  } catch (e) {
    console.error("DB Init Failed", e);
  }

  // Listeners for reactivity
  on('models-changed', updateAppUI);
  on('status-changed', updateAppUI);
  on('generating-changed', updateSidebarAndComposer);

  await loadModels(true);
}

function updateAppUI() {
  const sidebarEl = document.getElementById('sidebar');
  if (sidebarEl) sidebarEl.outerHTML = renderSidebar();

  const msgWrap = document.getElementById('messagesWrap');
  if (msgWrap && !state.isGenerating) {
    msgWrap.innerHTML = renderMessages(getCurrentConv());
    msgWrap.scrollTop = msgWrap.scrollHeight;
  }

  const composerWrap = document.querySelector('.composer-wrap');
  if (composerWrap) composerWrap.outerHTML = renderComposer();

  updateSettingsModelList();
}

// Updates sidebar + composer only — no messages re-render (avoids flicker)
function updateSidebarAndComposer() {
  const sidebarEl = document.getElementById('sidebar');
  if (sidebarEl) sidebarEl.outerHTML = renderSidebar();

  const composerWrap = document.querySelector('.composer-wrap');
  if (composerWrap) composerWrap.outerHTML = renderComposer();

  updateSettingsModelList();
}


// --- Global API bounds to window for inline HTML handlers ---

window.__toggleSidebar = () => {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  localStorage.setItem('sidebarCollapsed', state.sidebarCollapsed);
  updateAppUI();
};

window.__setSidebarSection = (section) => {
  state.sidebarSection = section;
  updateAppUI();
};

window.__toggleTheme = () => {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('theme', state.theme);
};

window.__newChat = () => {
  const conv = {
    id: 'c_' + Date.now(),
    title: 'Nouvelle conversation',
    messages: [],
    projectId: state.currentProjectId || null,
    params: { ...state.defaultParams },
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  state.conversations.unshift(conv);
  state.currentConvId = conv.id;
  state.activeSkill = null; // reset skill
  import('./lib/db.js').then(m => m.dbPut('conversations', conv));
  updateAppUI();
};

window.__deleteChat = (id) => {
  if (!confirm('Supprimer cette conversation ?')) return;
  state.conversations = state.conversations.filter(c => c.id !== id);
  import('./lib/db.js').then(m => m.dbDel('conversations', id));
  if (state.currentConvId === id) {
    state.currentConvId = state.conversations[0]?.id || null;
    if (!state.currentConvId) window.__newChat();
  }
  updateAppUI();
};

window.__selectConv = (id) => {
  state.currentConvId = id;
  state.activeSkill = null;
  updateAppUI();
};

window.__setSkill = (id) => {
  import('./lib/state.js').then(m => {
    state.activeSkill = state.activeSkill?.id === id ? null : m.SKILLS.find(s => s.id === id);
    updateAppUI();
  });
};

/* File handling */
window.__handleFiles = async (files) => {
  for (const f of files) {
    try {
      showToast(`Lecture de ${f.name}...`);
      const parsed = await readFile(f);
      state.attachments.push(parsed);
    } catch(e) { showToast(`Erreur avec ${f.name}`, 'error'); }
  }
  renderAttachments();
};
window.__removeAttach = (idx) => {
  state.attachments.splice(idx, 1);
  renderAttachments();
};

/* Think Menu & Model */
window.__toggleThinkMenu = (e) => {
  e.stopPropagation();
  document.getElementById('thinkMenu').classList.toggle('open');
};
window.__setThink = (v) => {
  state.think = v;
  localStorage.setItem('think', String(v));
  document.getElementById('thinkMenu').classList.remove('open');
  updateAppUI();
};
document.addEventListener('click', e => {
  if (!e.target.closest('#thinkWrap')) document.getElementById('thinkMenu')?.classList.remove('open');
});
window.__onModelChange = () => {
  state.currentModel = document.getElementById('modelSelect').value;
  localStorage.setItem('currentModel', state.currentModel);
};

/* Send message pipeline */
window.__send = async () => {
  if (state.isGenerating) {
    showToast('Patiente: l\'IA est en train d\'ecrire.', 'error');
    return;
  }

  const input = document.getElementById('input');
  const text = input.value.trim();
  if (!text && !state.attachments.length) return;
  if (!state.currentModel) return showToast('Aucun modèle sélectionné', 'error');

  let conv = getCurrentConv();
  if (!conv) { window.__newChat(); conv = getCurrentConv(); }

  const userMsg = {
    role: 'user',
    content: text,
    attachments: state.attachments.map(a => ({ name: a.name, size: a.size, type: a.type })),
    _files: state.attachments,
    timestamp: Date.now()
  };
  conv.messages.push(userMsg);

  if (conv.messages.length === 1) {
    conv.title = text.slice(0, 50) + (text.length > 50 ? '...' : '');
  }

  input.value = '';
  input.style.height = 'auto';
  state.attachments = [];
  
  // Re-render chat explicitly without destroying composer focus
  const msgWrap = document.getElementById('messagesWrap');
  if (msgWrap) {
    import('./components/chat.js').then(m => {
      // Start stream directly, __startStream will call updateAppUI() 
      // safely and locate the DOM node by ID dynamically.
      window.__startStream(conv, msgWrap);
    });
  }
  
  // Clear attachments UI
  import('./components/composer.js').then(m => m.renderAttachments());
}; // End of window.__send

window.__startStream = async (conv, msgWrap) => {
  const messageIndex = conv.messages.length;
  const assistantMsg = {
    role: 'assistant',
    content: '',
    thinkingBefore: '',
    thinkingAfter: '',
    _thinkingPhase: 'before',
    model: state.currentModel,
    timestamp: Date.now(),
    _isStreaming: true
  };
  conv.messages.push(assistantMsg);

  // Render messages (includes user msg + assistant loading shell)
  msgWrap.innerHTML = chatM.renderMessages(conv);
  msgWrap.scrollTop = msgWrap.scrollHeight;
  updateSidebarAndComposer();
  // Re-focus input so the user can type the next message immediately
  requestAnimationFrame(() => document.getElementById('input')?.focus());

  await streamChat(conv, null, 
    (thinkData) => {
      assistantMsg._thinkingPhase = thinkData?.phase || assistantMsg._thinkingPhase || 'before';
      if (typeof thinkData === 'string') {
        assistantMsg.thinkingBefore = thinkData;
      } else if (thinkData?.phase === 'after') {
        assistantMsg.thinkingAfter = thinkData.after || thinkData.text || '';
      } else {
        assistantMsg.thinkingBefore = thinkData?.before || thinkData?.text || '';
      }
      if (state.currentConvId === conv.id) {
        const liveEl = document.querySelector(`.msg[data-idx="${messageIndex}"]`);
        if (liveEl) {
          import('./components/chat.js').then(m => m.updateStreamingMessage(liveEl, {
            before: assistantMsg.thinkingBefore,
            after: assistantMsg.thinkingAfter,
            phase: assistantMsg._thinkingPhase
          }, assistantMsg.content, true));
        }
        msgWrap.scrollTop = msgWrap.scrollHeight;
      }
    },
    (content) => {
      assistantMsg.content = content;
      if (state.currentConvId === conv.id) {
        const liveEl = document.querySelector(`.msg[data-idx="${messageIndex}"]`);
        if (liveEl) {
          import('./components/chat.js').then(m => m.updateStreamingMessage(liveEl, {
            before: assistantMsg.thinkingBefore,
            after: assistantMsg.thinkingAfter,
            phase: assistantMsg._thinkingPhase || (assistantMsg.thinkingAfter ? 'after' : 'before')
          }, content, true));
        }
        msgWrap.scrollTop = msgWrap.scrollHeight;
      }
    },
    (finalContent, finalThinking) => {
      assistantMsg.content = finalContent;
      assistantMsg.thinkingBefore = finalThinking?.before || assistantMsg.thinkingBefore;
      assistantMsg.thinkingAfter = finalThinking?.after || assistantMsg.thinkingAfter;
      assistantMsg._isStreaming = false;

      import('./lib/markdown.js').then(mk => {
        const parsed = mk.parseContent(finalContent);
        if (parsed.artifacts.length) assistantMsg._artifacts = parsed.artifacts;

        if (state.currentConvId === conv.id) {
          const liveEl = document.querySelector(`.msg[data-idx="${messageIndex}"]`);
          if (liveEl) {
            // Replace the streaming shell with a fully rendered message (adds action buttons, artifacts, etc.)
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = chatM.renderMessage(assistantMsg, messageIndex);
            const finalEl = tempDiv.firstElementChild;
            const contentEl = finalEl?.querySelector('.msg__content');
            const searchEl = contentEl?.querySelector('.search-anim');
            const thinkEls = contentEl ? contentEl.querySelectorAll('.thinking') : [];
            if (searchEl && thinkEls.length >= 2) {
              searchEl.insertAdjacentElement('afterend', thinkEls[1]);
            }
            liveEl.replaceWith(finalEl);
            mk.highlightCode(finalEl.querySelector('.msg__content'));
            mk.renderMath(finalEl.querySelector('.msg__content'));
            msgWrap.scrollTop = msgWrap.scrollHeight;
          }
        }
        import('./lib/db.js').then(db => db.dbPut('conversations', conv));
        updateSidebarAndComposer();
      });
    }
  );
};

/* Memory */
window.__openMemoryModal = () => {
  renderMemoryList();
  document.getElementById('memoryModal').classList.add('show');
};

window.__addMemory = async () => {
  const input = document.getElementById('memoryInput');
  const text = input.value.trim();
  if (!text) return;
  const mem = { id: 'm_' + Date.now(), content: text, createdAt: Date.now() };
  state.memories.push(mem);
  await import('./lib/db.js').then(m => m.dbPut('memories', mem));
  input.value = '';
  renderMemoryList();
  showToast('Mémoire ajoutée', 'success');
};

window.__deleteMemory = async (id) => {
  state.memories = state.memories.filter(m => m.id !== id);
  await import('./lib/db.js').then(m => m.dbDel('memories', id));
  renderMemoryList();
};

function renderMemoryList() {
  const el = document.getElementById('memoryList');
  if (!el) return;
  if (!state.memories.length) {
    el.innerHTML = '<div class="memory-empty">Aucun souvenir enregistré. L\'IA peut en créer automatiquement, ou ajoutez-en manuellement.</div>';
    return;
  }
  el.innerHTML = state.memories.map(m => `
    <div class="memory-item">
      <span class="memory-item__text">${escapeHtml(m.content)}</span>
      <button class="memory-item__del" onclick="window.__deleteMemory('${m.id}')" title="Supprimer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>`).join('');
}

/* ask_user choice */
window.__chooseOption = (text) => {
  const input = document.getElementById('input');
  if (input) {
    input.value = text;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 300) + 'px';
  }
  window.__send();
};

/* Projects */
window.__openProjectModal = () => {
  document.getElementById('projName').value = '';
  document.getElementById('projInstructions').value = '';
  document.getElementById('projectModal').classList.add('show');
};

window.__createProject = async () => {
  const name = document.getElementById('projName').value.trim();
  if (!name) return;
  const proj = {
    id: 'p_' + Date.now(),
    name,
    instructions: document.getElementById('projInstructions').value.trim(),
    createdAt: Date.now()
  };
  state.projects.push(proj);
  await import('./lib/db.js').then(m => m.dbPut('projects', proj));
  window.__closeModal('projectModal');
  updateAppUI();
};

window.__selectProject = (id) => {
  state.currentProjectId = state.currentProjectId === id ? null : id;
  updateAppUI();
};

window.__deleteProject = async (id) => {
  if (!confirm('Supprimer ce projet ?')) return;
  state.projects = state.projects.filter(p => p.id !== id);
  await import('./lib/db.js').then(m => m.dbDel('projects', id));
  if (state.currentProjectId === id) state.currentProjectId = null;
  updateAppUI();
};

/* Message actions */
window.__copyMessage = (idx) => {
  const conv = getCurrentConv();
  if (!conv) return;
  const msg = conv.messages[idx];
  if (!msg) return;
  navigator.clipboard.writeText(msg.content);
  showToast('Message copié', 'success');
};

window.__regenerate = async (idx) => {
  const conv = getCurrentConv();
  if (!conv || state.isGenerating) return;
  // Remove the assistant message at idx and all after it
  conv.messages.splice(idx);
  const msgWrap = document.getElementById('messagesWrap');
  if (msgWrap) window.__startStream(conv, msgWrap);
};

window.__editMessage = (idx) => {
  const conv = getCurrentConv();
  if (!conv || state.isGenerating) return;
  const msg = conv.messages[idx];
  if (!msg || msg.role !== 'user') return;

  // Populate input with message content
  const input = document.getElementById('input');
  if (input) {
    input.value = msg.content;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 300) + 'px';
    input.focus();
  }

  // Remove this message and everything after it
  conv.messages.splice(idx);
  const msgWrap = document.getElementById('messagesWrap');
  if (msgWrap) {
    import('./components/chat.js').then(m => {
      msgWrap.innerHTML = m.renderMessages(conv);
    });
  }
};

/* Export chat */
window.__exportChat = () => {
  const conv = getCurrentConv();
  if (!conv || !conv.messages.length) return showToast('Aucune conversation à exporter', 'error');

  const lines = conv.messages.map(m => {
    const role = m.role === 'user' ? 'Vous' : 'Assistant';
    return `### ${role}\n\n${m.content}`;
  });
  const md = `# ${conv.title}\n\n${lines.join('\n\n---\n\n')}`;
  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = conv.title.replace(/\s+/g, '_').slice(0, 50) + '.md';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Conversation exportée', 'success');
};

/* Load models manually */
window.__loadModels = () => loadModels();

/* Palette */
window.__openPalette = () => {
  document.getElementById('paletteModal').classList.add('show');
  setTimeout(() => document.getElementById('paletteInput')?.focus(), 50);
  renderPaletteResults('');
};

function renderPaletteResults(query) {
  const el = document.getElementById('paletteResults');
  if (!el) return;
  const q = query.toLowerCase().trim();

  const actions = [
    { label: 'Nouvelle conversation', icon: '＋', action: () => { window.__closeModal('paletteModal'); window.__newChat(); } },
    { label: 'Paramètres', icon: '⚙', action: () => { window.__closeModal('paletteModal'); window.__openSettings(); } },
    { label: 'Exporter la conversation', icon: '↓', action: () => { window.__closeModal('paletteModal'); window.__exportChat(); } },
    { label: 'Changer de thème', icon: '◑', action: () => { window.__closeModal('paletteModal'); window.__toggleTheme(); } },
  ];

  const matchedActions = q ? actions.filter(a => a.label.toLowerCase().includes(q)) : actions;

  const matchedConvs = state.conversations
    .filter(c => !q || c.title.toLowerCase().includes(q))
    .slice(0, 8);

  let html = '';

  if (matchedActions.length) {
    html += '<div class="palette__group">Actions</div>';
    html += matchedActions.map(a => `
      <div class="palette__item" onclick="(${a.action.toString()})()">
        <span class="palette__item-icon">${a.icon}</span>
        <span>${a.label}</span>
      </div>`).join('');
  }

  if (matchedConvs.length) {
    html += '<div class="palette__group">Conversations</div>';
    html += matchedConvs.map(c => `
      <div class="palette__item" onclick="window.__closeModal('paletteModal');window.__selectConv('${c.id}')">
        <span class="palette__item-icon">💬</span>
        <span>${c.title}</span>
      </div>`).join('');
  }

  if (!html) html = '<div class="palette__empty">Aucun résultat</div>';
  el.innerHTML = html;
}

document.addEventListener('input', e => {
  if (e.target.id === 'paletteInput') renderPaletteResults(e.target.value);
});

window.__toggleWebSearch = () => {
  state.webSearchEnabled = !state.webSearchEnabled;
  localStorage.setItem('webSearchEnabled', state.webSearchEnabled);
  updateSidebarAndComposer();
  requestAnimationFrame(() => document.getElementById('input')?.focus());
};

window.__stopGeneration = () => {
  stopGeneration();
};

/* Modals bounds */
window.__openSettings = () => { document.getElementById('settingsModal').classList.add('show'); };
window.__closeModal = (id) => { document.getElementById(id).classList.remove('show'); };
window.__saveSettings = () => {
  state.ollamaUrl = document.getElementById('ollamaUrl').value.trim();
  localStorage.setItem('ollamaUrl', state.ollamaUrl);
  loadModels();
  window.__closeModal('settingsModal');
};
window.__pullModel = async () => {
  const name = document.getElementById('pullInput').value.trim();
  if(!name) return;
  const statusEl = document.getElementById('pullStatus');
  await pullModel(name, (msg) => { statusEl.textContent = msg; });
};
window.__deleteModel = deleteModel;

/* Canvas */
window.__openArtifactFromCard = (el) => {
  const data = JSON.parse(el.getAttribute('data-artifact'));
  import('./components/canvas.js').then(m => m.openArtifact(data));
};
window.__openArtifact = (data) => {
  import('./components/canvas.js').then(m => m.openArtifact(data));
};
window.__closeCanvas = () => {
  import('./components/canvas.js').then(m => m.closeCanvas());
};
window.__switchCanvasTab = (tab) => {
  import('./components/canvas.js').then(m => m.switchCanvasTab(tab));
};
window.__copyArtifact = copyArtifact;
window.__downloadArtifact = downloadArtifact;

// Hotkeys
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-backdrop.show').forEach(m => m.classList.remove('show'));
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    window.__send();
  }
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    window.__openPalette();
  }
});

// Delegeted listener for Enter on textarea
document.addEventListener('keydown', e => {
  if (e.target.id === 'input' && e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    window.__send();
  }
});

// Auto-resize textarea
document.addEventListener('input', e => {
  if (e.target.id === 'input') {
    const inp = e.target;
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 300) + 'px';
    
    const tokCount = document.getElementById('tokCount');
    if (tokCount) {
      tokCount.textContent = inp.value ? `~${Math.ceil(inp.value.length / 4)} tok` : '';
    }
  }
});

// Boot
window.onload = init;
