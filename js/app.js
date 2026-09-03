import { supabase } from './config.js';
import { initTheme } from './theme.js';
import { initAuth, getUser, onAuthChange } from './auth.js';

const QUIZ_LENGTHS = [10, 20, 30, 45];

let cargos = [];
let selectedCargo = null;
let questions = [];
let currentIndex = 0;
let tentativaId = null;
let quizInProgress = false;

const el = (id) => document.getElementById(id);

// ---------- Boot ----------
initTheme();
initAuth();
loadCargos();
route();

document.addEventListener('simulado:route', route);
onAuthChange(() => route());

el('cargo-select').addEventListener('change', (e) => {
  selectedCargo = cargos.find((c) => c.id === e.target.value) || null;
  route();
});

el('restart-btn').addEventListener('click', () => {
  el('cargo-select').value = '';
  selectedCargo = null;
  route();
});

// ---------- Routing between panels ----------
function route() {
  // Don't reset the UI mid-quiz: tab refocus triggers a Supabase auth
  // token refresh, which fires onAuthChange and would otherwise bounce
  // the user back to the setup screen.
  if (quizInProgress) return;

  hideAll();
  const user = getUser();

  if (!selectedCargo) {
    show('empty-state');
    return;
  }
  if (!user) {
    showLoginPrompt();
    return;
  }
  showSetup();
}

function hideAll() {
  ['login-panel', 'empty-state', 'setup-panel', 'quiz-panel', 'result-panel'].forEach((id) =>
    el(id).classList.add('hidden')
  );
}

function show(id) {
  el(id).classList.remove('hidden');
}

function showLoginPrompt() {
  show('login-panel');
}

// ---------- Load cargos ----------
async function loadCargos() {
  const { data, error } = await supabase.from('cargos').select('id, nome, codigo').order('nome');
  if (error) {
    console.error('Erro ao carregar cargos', error);
    return;
  }
  cargos = data;
  const select = el('cargo-select');
  data.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.nome;
    select.appendChild(opt);
  });
}

// ---------- Setup screen ----------
function showSetup() {
  el('setup-cargo-name').textContent = `Simulado de ${selectedCargo.nome}`;
  const wrap = el('setup-options');
  wrap.innerHTML = '';
  QUIZ_LENGTHS.forEach((n) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'setup-option';
    btn.textContent = `${n} questões`;
    btn.addEventListener('click', () => startQuiz(n));
    wrap.appendChild(btn);
  });
  show('setup-panel');
}

// ---------- Quiz flow ----------
let answers = {};       // { [index]: letter }
let reviewMode = false; // true after finishing: shows correctness + explanations

async function startQuiz(qty) {
  const { data, error } = await supabase
    .from('questoes')
    .select('id, enunciado, alternativa_a, alternativa_b, alternativa_c, alternativa_d, alternativa_e, resposta_correta, explicacao, materias(nome)')
    .or(`cargo_id.eq.${selectedCargo.id},cargo_id.is.null`);

  if (error) {
    console.error('Erro ao carregar questões', error);
    return;
  }
  if (!data || data.length === 0) {
    alert('Ainda não há questões cadastradas para este cargo.');
    return;
  }

  questions = shuffle(data).slice(0, Math.min(qty, data.length));
  currentIndex = 0;
  answers = {};
  reviewMode = false;

  const user = getUser();
  const { data: tentativa, error: tErr } = await supabase
    .from('tentativas')
    .insert({ simulado_id: null, user_id: user.id })
    .select()
    .single();

  // simulado_id is optional in practice for ad-hoc quizzes; if your schema requires it,
  // create a simulados row first. Handle gracefully either way.
  if (tErr) {
    console.warn('Não foi possível registrar a tentativa (progresso não será salvo):', tErr.message);
    tentativaId = null;
  } else {
    tentativaId = tentativa.id;
  }

  hideAll();
  quizInProgress = true;
  show('quiz-panel');
  renderNav();
  renderQuestion();
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ---------- Question navigator ----------
function renderNav() {
  const nav = el('question-nav');
  nav.innerHTML = '';
  questions.forEach((q, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'question-nav-item';
    btn.textContent = String(i + 1);
    btn.addEventListener('click', () => {
      currentIndex = i;
      renderQuestion();
    });
    nav.appendChild(btn);
  });
  updateNavStates();
}

function updateNavStates() {
  const items = el('question-nav').querySelectorAll('.question-nav-item');
  items.forEach((btn, i) => {
    btn.classList.remove('answered', 'current', 'correct', 'incorrect');
    if (reviewMode) {
      const q = questions[i];
      const given = answers[i];
      if (given) btn.classList.add(given === q.resposta_correta ? 'correct' : 'incorrect');
    } else if (answers[i]) {
      btn.classList.add('answered');
    }
    if (i === currentIndex) btn.classList.add('current');
  });
}

// ---------- Rendering a question ----------
function renderQuestion() {
  const q = questions[currentIndex];
  el('question-number').textContent = String(currentIndex + 1).padStart(2, '0');
  el('question-materia').textContent = q.materias?.nome || '';
  el('question-text').textContent = q.enunciado;

  updateProgress();
  updateNavStates();

  const letters = ['A', 'B', 'C', 'D', 'E'];
  const optionsList = el('options-list');
  optionsList.innerHTML = '';
  const given = answers[currentIndex];

  letters.forEach((letter) => {
    const text = q[`alternativa_${letter.toLowerCase()}`];
    if (!text) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'option';
    btn.dataset.letter = letter;
    btn.innerHTML = `<span class="option-letter">${letter}</span><span>${text}</span>`;

    if (reviewMode) {
      btn.disabled = true;
      if (letter === q.resposta_correta) btn.classList.add('correct');
      else if (letter === given) btn.classList.add('incorrect');
    } else {
      if (letter === given) btn.classList.add('selected');
      btn.addEventListener('click', () => selectOption(letter));
    }
    optionsList.appendChild(btn);
  });

  const explanationBox = el('explanation-box');
  if (reviewMode) {
    const isCorrect = given === q.resposta_correta;
    el('explanation-verdict').textContent = !given
      ? 'Você não respondeu esta questão.'
      : isCorrect ? 'Certinho.' : 'Não foi dessa vez.';
    el('explanation-text').textContent = q.explicacao || `A resposta correta é a alternativa ${q.resposta_correta}.`;
    explanationBox.classList.remove('hidden');
  } else {
    explanationBox.classList.add('hidden');
  }

  // Nav buttons
  el('prev-btn').disabled = currentIndex === 0;
  const isLast = currentIndex === questions.length - 1;

  if (reviewMode) {
    el('finish-btn').classList.add('hidden');
    el('next-btn').classList.add('hidden');
    el('back-to-result-btn').classList.remove('hidden');
  } else {
    el('finish-btn').classList.remove('hidden');
    el('back-to-result-btn').classList.add('hidden');
    el('next-btn').classList.toggle('hidden', isLast);
  }
}

async function selectOption(letter) {
  answers[currentIndex] = letter;
  renderQuestion();

  if (tentativaId) {
    const q = questions[currentIndex];
    await supabase
      .from('respostas')
      .upsert(
        { tentativa_id: tentativaId, questao_id: q.id, resposta_dada: letter },
        { onConflict: 'tentativa_id,questao_id' }
      );
  }
}

function goPrev() {
  if (currentIndex === 0) return;
  currentIndex -= 1;
  renderQuestion();
}

function goNext() {
  if (currentIndex === questions.length - 1) return;
  currentIndex += 1;
  renderQuestion();
}

function updateProgress() {
  const answeredCount = Object.keys(answers).length;
  const pct = Math.round((answeredCount / questions.length) * 100);
  el('progress-fill').style.width = `${pct}%`;
  el('quiz-progress-label').textContent = `${answeredCount} de ${questions.length} respondidas`;
  if (reviewMode) {
    const correctCount = questions.filter((q, i) => answers[i] === q.resposta_correta).length;
    el('quiz-score-label').textContent = `${correctCount} certas`;
  } else {
    el('quiz-score-label').textContent = '';
  }
}

async function finishQuiz() {
  const answeredCount = Object.keys(answers).length;
  if (answeredCount < questions.length) {
    const missing = questions.length - answeredCount;
    const proceed = confirm(`Você deixou ${missing} questão(ões) sem responder. Finalizar mesmo assim?`);
    if (!proceed) return;
  }

  const correctCount = questions.filter((q, i) => answers[i] === q.resposta_correta).length;
  const score = Math.round((correctCount / questions.length) * 1000) / 10;

  if (tentativaId) {
    await supabase
      .from('tentativas')
      .update({ finalizado_em: new Date().toISOString(), pontuacao: score })
      .eq('id', tentativaId);

    // backfill correctness on each saved answer
    await Promise.all(
      questions.map((q, i) => {
        const given = answers[i];
        if (!given) return Promise.resolve();
        return supabase
          .from('respostas')
          .update({ correta: given === q.resposta_correta })
          .eq('tentativa_id', tentativaId)
          .eq('questao_id', q.id);
      })
    );
  }

  quizInProgress = false;
  hideAll();
  el('result-score').textContent = `${correctCount}/${questions.length}`;
  el('result-detail').textContent = `${score}% de aproveitamento em ${selectedCargo.nome}.`;
  show('result-panel');
}

function openReview() {
  reviewMode = true;
  currentIndex = 0;
  quizInProgress = true;
  hideAll();
  show('quiz-panel');
  renderQuestion();
}

function closeReview() {
  reviewMode = false;
  quizInProgress = false;
  hideAll();
  show('result-panel');
}

el('prev-btn').addEventListener('click', goPrev);
el('next-btn').addEventListener('click', goNext);
el('finish-btn').addEventListener('click', finishQuiz);
el('back-to-result-btn').addEventListener('click', closeReview);
el('review-btn').addEventListener('click', openReview);
