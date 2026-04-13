// Composer component - Claude-style pill input with skills
import { state, SKILLS } from '../lib/state.js';
import { escapeHtml, fmtBytes } from '../lib/markdown.js';

export function renderComposer() {
  const hasConv = state.currentConvId && state.conversations.find(c => c.id === state.currentConvId)?.messages?.length;
  const busy = state.isGenerating;

  return `
  <div class="composer-wrap">
    <div class="composer ${busy ? 'composer--busy' : ''}" id="composer">
      <!-- Attachments -->
      <div class="composer__attachments" id="attachList"></div>

      <!-- Input area -->
      <textarea
        class="composer__input"
        id="input"
        placeholder="Comment puis-je vous aider ?"
        ${busy ? 'disabled' : ''}
        rows="1"
      ></textarea>

      <!-- Bottom bar -->
      <div class="composer__bar">
        <div class="composer__bar-left">
          <!-- Add file -->
          <button class="composer__btn" ${busy ? 'disabled' : ''} onclick="document.getElementById('fileInput').click()" title="Joindre un fichier">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <input type="file" id="fileInput" multiple style="display:none" ${busy ? 'disabled' : ''} onchange="window.__handleFiles(this.files)">

          <!-- Web search toggle -->
          <button class="composer__btn web-search-btn ${state.webSearchEnabled ? 'web-search-btn--active' : ''}" ${busy ? 'disabled' : ''} onclick="window.__toggleWebSearch()" title="Recherche web">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          </button>

          <!-- Think mode -->
          <div class="think-wrap" id="thinkWrap">
            <button class="composer__btn think-btn ${state.think !== false ? 'think-btn--active' : ''}" id="thinkBtn" ${busy ? 'disabled' : ''} onclick="window.__toggleThinkMenu(event)" title="Mode raisonnement">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9.663 17h4.673M12 3v1m0 16v1M4.22 4.22l.7.7m12.44 12.44.7.7M1 12h1m20 0h1M4.22 19.78l.7-.7m12.44-12.44.7-.7M12 7a5 5 0 0 1 3 9v2H9v-2a5 5 0 0 1 3-9z"/></svg>
              <span class="think-label" id="thinkLabel">${getThinkLabel()}</span>
            </button>
            <div class="think-menu" id="thinkMenu">
              <button onclick="window.__setThink(false)" ${state.think === false ? 'class="active"' : ''}>
                <span>Desactive</span><span class="think-hint">Reponse directe</span>
              </button>
              <button onclick="window.__setThink('low')" ${state.think === 'low' ? 'class="active"' : ''}>
                <span>Faible</span><span class="think-hint">Raisonnement leger</span>
              </button>
              <button onclick="window.__setThink('medium')" ${state.think === 'medium' ? 'class="active"' : ''}>
                <span>Moyen</span><span class="think-hint">Equilibre</span>
              </button>
              <button onclick="window.__setThink('high')" ${state.think === 'high' ? 'class="active"' : ''}>
                <span>Eleve</span><span class="think-hint">Approfondi</span>
              </button>
              <button onclick="window.__setThink(true)" ${state.think === true ? 'class="active"' : ''}>
                <span>Active</span><span class="think-hint">Pour modeles simples</span>
              </button>
            </div>
          </div>
        </div>

        <div class="composer__bar-right">
          <span class="composer__tok" id="tokCount"></span>

          <!-- Model selector -->
          <select class="composer__model" id="modelSelect" ${busy ? 'disabled' : ''} onchange="window.__onModelChange()" title="Modele">
            ${state.models.length
              ? state.models.map(m => `<option value="${m.name}" ${m.name === state.currentModel ? 'selected' : ''}>${m.name}</option>`).join('')
              : '<option disabled>Ollama hors ligne</option>'
            }
          </select>

          <!-- Send / Stop button -->
          ${state.isGenerating
            ? `<button class="composer__stop" onclick="window.__stopGeneration()" title="Arreter">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
              </button>`
            : `<button class="composer__send" id="sendBtn" onclick="window.__send()" title="Envoyer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
              </button>`
          }
        </div>
      </div>
    </div>

    <!-- Skill chips - only on welcome screen -->
    ${!hasConv ? renderSkillChips() : ''}
  </div>`;
}

function renderSkillChips() {
  return `
  <div class="skills" id="skills">
    ${SKILLS.map(s => `
      <button class="skill-chip ${state.activeSkill?.id === s.id ? 'skill-chip--active' : ''}" onclick="window.__setSkill('${s.id}')">
        ${s.icon}
        <span>${s.label}</span>
      </button>
    `).join('')}
  </div>`;
}

function getThinkLabel() {
  const labels = { false: '', true: 'ON', low: 'LOW', medium: 'MED', high: 'HIGH' };
  return labels[String(state.think)] || '';
}

export function renderAttachments() {
  const el = document.getElementById('attachList');
  if (!el) return;
  el.innerHTML = '';
  state.attachments.forEach((a, i) => {
    const chip = document.createElement('div');
    chip.className = 'composer__attach-chip';
    const icon = a.kind === 'image' ? '🖼' : '📄';
    chip.innerHTML = `
      <span class="composer__attach-icon">${icon}</span>
      <span class="composer__attach-name">${escapeHtml(a.name)}</span>
      <span class="composer__attach-size">${fmtBytes(a.size)}</span>
      <button onclick="window.__removeAttach(${i})">✕</button>`;
    el.appendChild(chip);
  });
}
