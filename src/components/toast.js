// Toast notification system
export function showToast(msg, type = 'info') {
  const container = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = `toast toast--${type}`;
  t.innerHTML = `
    <div class="toast__icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</div>
    <span class="toast__msg">${msg}</span>
  `;
  container.appendChild(t);
  requestAnimationFrame(() => t.classList.add('toast--visible'));
  setTimeout(() => {
    t.classList.remove('toast--visible');
    setTimeout(() => t.remove(), 300);
  }, 3500);
}
