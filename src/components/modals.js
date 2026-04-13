import { state, SKILLS, emit } from '../lib/state.js';
import { loadModels, pullModel, deleteModel } from '../lib/ollama.js';

export function renderModals() {
  return `
    <div id="settingsModal" class="modal-backdrop">
      <div class="modal">
        <div class="modal__head">
          <h2>Paramètres OllaForge</h2>
          <button class="modal__close" onclick="window.__closeModal('settingsModal')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="modal__body">
          <div class="form-row">
            <label>URL Ollama</label>
            <input type="text" id="ollamaUrl" value="${state.ollamaUrl}">
            <div class="form-hint">Ex: http://localhost:11434</div>
          </div>
          <div class="form-row">
            <label>Modèles installés</label>
            <div class="model-list" id="settingsModelList"></div>
          </div>
          <div class="form-row">
            <label>Télécharger un modèle</label>
            <div class="pull-row">
              <input type="text" id="pullInput" placeholder="ex: llama3, qwen:7b...">
              <button class="btn btn--primary" onclick="window.__pullModel()">Télécharger</button>
            </div>
            <div id="pullStatus" class="form-hint"></div>
          </div>
        </div>
        <div class="modal__foot">
          <button class="btn" onclick="window.__closeModal('settingsModal')">Fermer</button>
          <button class="btn btn--primary" onclick="window.__saveSettings()">Enregistrer</button>
        </div>
      </div>
    </div>

    <!-- Modale Projet -->
    <div id="projectModal" class="modal-backdrop">
      <div class="modal">
        <div class="modal__head">
          <h2>Nouveau Projet</h2>
          <button class="modal__close" onclick="window.__closeModal('projectModal')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="modal__body">
          <div class="form-row">
            <label>Nom du projet</label>
            <input type="text" id="projName" placeholder="Mon super projet...">
          </div>
          <div class="form-row">
            <label>Instructions système par défaut</label>
            <textarea id="projInstructions" placeholder="Tu es un assistant spécialisé dans... Cela s'appliquera à toutes les discussions du projet." rows="4"></textarea>
          </div>
        </div>
        <div class="modal__foot">
          <button class="btn" onclick="window.__closeModal('projectModal')">Annuler</button>
          <button class="btn btn--primary" onclick="window.__createProject()">Créer</button>
        </div>
      </div>
    </div>
    
    <!-- Modale Mémoire -->
    <div id="memoryModal" class="modal-backdrop">
      <div class="modal">
        <div class="modal__head">
          <h2>💾 Mémoire persistante</h2>
          <button class="modal__close" onclick="window.__closeModal('memoryModal')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
        </div>
        <div class="modal__body">
          <p class="memory-intro">L'IA mémorise automatiquement des informations importantes sur vous. Vous pouvez aussi en ajouter manuellement.</p>
          <div class="form-row">
            <div class="pull-row">
              <input type="text" id="memoryInput" placeholder="Ex: Je préfère les réponses courtes et concises...">
              <button class="btn btn--primary" onclick="window.__addMemory()">Ajouter</button>
            </div>
          </div>
          <div id="memoryList"></div>
        </div>
        <div class="modal__foot">
          <button class="btn" onclick="window.__closeModal('memoryModal')">Fermer</button>
        </div>
      </div>
    </div>

    <!-- Modale Palette -->
    <div id="paletteModal" class="modal-backdrop">
      <div class="modal modal--palette">
        <input type="text" id="paletteInput" class="palette__input" placeholder="Rechercher une conversation, faire une action..." autocomplete="off">
        <div class="palette__results" id="paletteResults"></div>
      </div>
    </div>
  `;
}

export function updateSettingsModelList() {
  const el = document.getElementById('settingsModelList');
  if (!el) return;
  
  if (!state.models.length) {
    el.innerHTML = '<div class="model-list__empty">Aucun modèle installé</div>';
    return;
  }
  
  el.innerHTML = state.models.map(m => `
    <div class="model-item">
      <div class="model-item__info">
        <div class="model-item__name">${m.name}</div>
        <div class="model-item__meta">${(m.size / 1e9).toFixed(1)} GB · ${m.details?.parameter_size || ''}</div>
      </div>
      <button class="model-item__delete" onclick="window.__deleteModel('${m.name}')" title="Supprimer">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
      </button>
    </div>
  `).join('');
}
