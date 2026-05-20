const STORAGE_KEY = "personal_vocab_app_v1";

// 에빙하우스 간격 (일): 틀리면 0으로, 맞으면 단계 올림
const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30];

const state = {
  words: [],
  currentScreen: "words",
  studyIndex: 0,
  quizQueue: [],
  quizIndex: 0,
  quizCorrect: 0,
  quizWrong: 0,
  quizAnswered: false,
};

// ---------- 저장 ----------
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    state.words = Array.isArray(parsed.words) ? parsed.words : [];
  } catch {
    state.words = [];
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ words: state.words }));
}

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function uid() {
  return "w_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
}

// ---------- 복습 로직 ----------
function scheduleReview(word, correct) {
  if (correct) {
    const nextLevel = Math.min((word.reviewLevel ?? 0) + 1, REVIEW_INTERVALS.length - 1);
    word.reviewLevel = nextLevel;
    word.nextReviewDate = addDays(todayStr(), REVIEW_INTERVALS[nextLevel]);
    word.wrongCount = word.wrongCount ?? 0;
  } else {
    word.reviewLevel = 0;
    word.nextReviewDate = addDays(todayStr(), REVIEW_INTERVALS[0]);
    word.wrongCount = (word.wrongCount ?? 0) + 1;
    word.lastWrongDate = todayStr();
  }
}

function isDue(word) {
  if (!word.nextReviewDate) return false;
  return word.nextReviewDate <= todayStr();
}

function getDueWords() {
  return state.words.filter(isDue);
}

function buildQuizQueue() {
  const due = getDueWords();
  const others = state.words.filter((w) => !isDue(w));
  const shuffled = [...due, ...shuffle(others)].slice(0, Math.max(5, state.words.length));
  return shuffle(shuffled.length ? shuffled : state.words);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- UI ----------
const titles = {
  words: ["단어장", "단어를 추가하고 학습하세요"],
  quiz: ["퀴즈", "뜻을 맞춰 보세요"],
  review: ["복습 일정", "다시 나올 단어를 확인하세요"],
};

function showScreen(name) {
  state.currentScreen = name;
  document.querySelectorAll(".screen").forEach((el) => el.classList.remove("active"));
  document.getElementById("screen-" + name).classList.add("active");
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.screen === name);
  });
  const [title, sub] = titles[name];
  document.getElementById("page-title").textContent = title;
  document.getElementById("page-subtitle").textContent = sub;

  if (name === "words") renderWords();
  if (name === "quiz") startQuiz();
  if (name === "review") renderReview();
}

function renderStats() {
  const total = state.words.length;
  const due = getDueWords().length;
  const mastered = state.words.filter((w) => (w.reviewLevel ?? 0) >= 4).length;
  document.getElementById("stats-row").innerHTML = `
    <div class="stat-box"><strong>${total}</strong><span>전체</span></div>
    <div class="stat-box"><strong>${due}</strong><span>오늘 복습</span></div>
    <div class="stat-box"><strong>${mastered}</strong><span>숙달</span></div>
  `;
}

function renderWords() {
  renderStats();
  const list = document.getElementById("word-list");
  if (!state.words.length) {
    list.innerHTML = `<li class="empty-msg">아직 단어가 없습니다. 위에서 추가해 보세요.</li>`;
    document.getElementById("study-card").classList.add("hidden");
    return;
  }

  list.innerHTML = state.words
    .map(
      (w) => `
    <li class="word-item">
      <h3>${escapeHtml(w.english)}</h3>
      <p>${escapeHtml(w.meaning)}</p>
      ${w.example ? `<p>${escapeHtml(w.example)}</p>` : ""}
      <span class="badge ${isDue(w) ? "due" : ""}">
        ${isDue(w) ? "복습 필요" : `다음 복습: ${w.nextReviewDate || "미정"}`}
      </span>
      <div class="actions">
        <button type="button" class="btn ghost" data-learn="${w.id}">학습</button>
        <button type="button" class="btn danger" data-delete="${w.id}">삭제</button>
      </div>
    </li>`
    )
    .join("");

  list.querySelectorAll("[data-delete]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (confirm("이 단어를 삭제할까요?")) {
        state.words = state.words.filter((w) => w.id !== btn.dataset.delete);
        saveData();
        renderWords();
      }
    });
  });

  list.querySelectorAll("[data-learn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.studyIndex = state.words.findIndex((w) => w.id === btn.dataset.learn);
      renderStudyCard();
    });
  });

  if (state.studyIndex >= 0 && state.studyIndex < state.words.length) {
    renderStudyCard();
  }
}

function renderStudyCard() {
  const card = document.getElementById("study-card");
  const w = state.words[state.studyIndex];
  if (!w) {
    card.classList.add("hidden");
    return;
  }
  card.classList.remove("hidden");
  document.getElementById("study-english").textContent = w.english;
  document.getElementById("study-meaning").textContent = w.meaning;
  document.getElementById("study-example").textContent = w.example || "";
  document.getElementById("study-example-ko").textContent = w.exampleKo || "";
  document.getElementById("study-details").classList.add("hidden");
}

function renderReview() {
  const list = document.getElementById("review-list");
  const empty = document.getElementById("review-empty");
  const sorted = [...state.words].sort((a, b) =>
    (a.nextReviewDate || "9999-99-99").localeCompare(b.nextReviewDate || "9999-99-99")
  );

  if (!sorted.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");
  list.innerHTML = sorted
    .map(
      (w) => `
    <li class="word-item">
      <h3>${escapeHtml(w.english)}</h3>
      <p>${escapeHtml(w.meaning)}</p>
      <span class="badge ${isDue(w) ? "due" : ""}">
        ${isDue(w) ? "오늘 복습" : `다음: ${w.nextReviewDate}`} · 단계 ${w.reviewLevel ?? 0}
      </span>
    </li>`
    )
    .join("");
}

// ---------- 퀴즈 ----------
function startQuiz() {
  if (!state.words.length) {
    document.querySelector(".quiz-card").classList.add("hidden");
    document.getElementById("quiz-summary").classList.remove("hidden");
    document.getElementById("quiz-result-text").textContent =
      "단어가 없습니다. 단어장에서 단어를 먼저 추가하세요.";
    return;
  }

  state.quizQueue = buildQuizQueue();
  state.quizIndex = 0;
  state.quizCorrect = 0;
  state.quizWrong = 0;
  state.quizAnswered = false;

  document.querySelector(".quiz-card").classList.remove("hidden");
  document.getElementById("quiz-summary").classList.add("hidden");
  showQuizQuestion();
}

function showQuizQuestion() {
  const w = state.quizQueue[state.quizIndex];
  if (!w) {
    finishQuiz();
    return;
  }
  document.getElementById("quiz-meta").textContent =
    `문제 ${state.quizIndex + 1} / ${state.quizQueue.length}` +
    (isDue(w) ? " · 복습 단어" : "");
  document.getElementById("quiz-question").textContent = w.english;
  document.getElementById("quiz-answer").value = "";
  document.getElementById("quiz-answer").disabled = false;
  document.getElementById("quiz-feedback").classList.add("hidden");
  document.getElementById("btn-quiz-next").classList.add("hidden");
  document.getElementById("btn-quiz-submit").classList.remove("hidden");
  state.quizAnswered = false;
}

function checkQuizAnswer() {
  if (state.quizAnswered) return;
  const w = state.quizQueue[state.quizIndex];
  const input = document.getElementById("quiz-answer").value.trim();
  const correct =
    normalize(input) === normalize(w.meaning) ||
    normalize(input) === normalize(w.english);

  const fb = document.getElementById("quiz-feedback");
  fb.classList.remove("hidden", "ok", "ng");

  if (correct) {
    fb.textContent = "정답입니다!";
    fb.classList.add("ok");
    state.quizCorrect++;
    scheduleReview(w, true);
  } else {
    fb.textContent = `오답입니다. 정답: ${w.meaning}`;
    fb.classList.add("ng");
    state.quizWrong++;
    scheduleReview(w, false);
  }

  saveData();
  state.quizAnswered = true;
  document.getElementById("quiz-answer").disabled = true;
  document.getElementById("btn-quiz-submit").classList.add("hidden");
  document.getElementById("btn-quiz-next").classList.remove("hidden");
}

function finishQuiz() {
  document.querySelector(".quiz-card").classList.add("hidden");
  document.getElementById("quiz-summary").classList.remove("hidden");
  document.getElementById("quiz-result-text").textContent =
    `맞힘 ${state.quizCorrect}개 · 틀림 ${state.quizWrong}개\n` +
    `틀린 단어는 내일부터 다시 복습 대상이 됩니다.`;
}

function normalize(s) {
  return (s || "").toLowerCase().replace(/\s+/g, "").trim();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------- 이벤트 ----------
document.getElementById("word-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const word = {
    id: uid(),
    english: document.getElementById("input-english").value.trim(),
    meaning: document.getElementById("input-meaning").value.trim(),
    example: document.getElementById("input-example").value.trim(),
    exampleKo: document.getElementById("input-example-ko").value.trim(),
    reviewLevel: 0,
    nextReviewDate: todayStr(),
    wrongCount: 0,
  };
  state.words.unshift(word);
  saveData();
  e.target.reset();
  state.studyIndex = 0;
  renderWords();
});

document.getElementById("btn-reveal").addEventListener("click", () => {
  document.getElementById("study-details").classList.toggle("hidden");
});

document.getElementById("btn-prev-word").addEventListener("click", () => {
  if (!state.words.length) return;
  state.studyIndex = (state.studyIndex - 1 + state.words.length) % state.words.length;
  document.getElementById("study-details").classList.add("hidden");
  renderStudyCard();
});

document.getElementById("btn-next-word").addEventListener("click", () => {
  if (!state.words.length) return;
  state.studyIndex = (state.studyIndex + 1) % state.words.length;
  document.getElementById("study-details").classList.add("hidden");
  renderStudyCard();
});

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => showScreen(btn.dataset.screen));
});

document.getElementById("btn-quiz-submit").addEventListener("click", checkQuizAnswer);
document.getElementById("quiz-answer").addEventListener("keydown", (e) => {
  if (e.key === "Enter") checkQuizAnswer();
});
document.getElementById("btn-quiz-next").addEventListener("click", () => {
  state.quizIndex++;
  showQuizQuestion();
});
document.getElementById("btn-quiz-restart").addEventListener("click", startQuiz);

// ---------- 시작 ----------
loadData();
if (!state.words.length) {
  state.words = [
    {
      id: uid(),
      english: "apple",
      meaning: "사과",
      example: "I eat an apple every morning.",
      exampleKo: "나는 매일 아침 사과를 먹는다.",
      reviewLevel: 0,
      nextReviewDate: todayStr(),
      wrongCount: 0,
    },
    {
      id: uid(),
      english: "challenge",
      meaning: "도전",
      example: "Learning English is a fun challenge.",
      exampleKo: "영어 공부는 재미있는 도전이다.",
      reviewLevel: 0,
      nextReviewDate: todayStr(),
      wrongCount: 0,
    },
  ];
  saveData();
}
showScreen("words");