import { supabase } from './config.js';

let currentUser = null;
const listeners = [];

export function onAuthChange(fn) {
  listeners.push(fn);
  fn(currentUser);
}

function notify() {
  listeners.forEach((fn) => fn(currentUser));
}

export function getUser() {
  return currentUser;
}

export async function initAuth() {
  const { data } = await supabase.auth.getSession();
  currentUser = data.session?.user ?? null;
  renderAuthArea();
  notify();

  supabase.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    renderAuthArea();
    notify();
  });

  wireLoginUi();
}

function renderAuthArea() {
  const area = document.getElementById('auth-area');
  if (currentUser) {
    area.innerHTML = `
      <span class="user-chip">${currentUser.email}</span>
      <button id="logout-btn" class="btn btn-ghost" type="button">Sair</button>
    `;
    document.getElementById('logout-btn').addEventListener('click', async () => {
      await supabase.auth.signOut();
    });
  } else {
    area.innerHTML = `<button id="login-btn" class="btn btn-ghost" type="button">Entrar</button>`;
    document.getElementById('login-btn').addEventListener('click', showLoginPanel);
  }
}

function showLoginPanel() {
  document.getElementById('login-panel').classList.remove('hidden');
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('setup-panel').classList.add('hidden');
}

function hideLoginPanel() {
  document.getElementById('login-panel').classList.add('hidden');
}

function wireLoginUi() {
  document.getElementById('login-cancel').addEventListener('click', () => {
    hideLoginPanel();
    document.dispatchEvent(new CustomEvent('simulado:route'));
  });

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');
    errorEl.classList.add('hidden');

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      errorEl.textContent = 'E-mail ou senha incorretos.';
      errorEl.classList.remove('hidden');
      return;
    }
    hideLoginPanel();
    document.dispatchEvent(new CustomEvent('simulado:route'));
  });
}
