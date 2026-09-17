let allQuestions = []; 
let questions = [];   
let currentIndex = 0;
let currentQuestionIndex = 0; 
let totalQuestions = 0; // Initialize with 0
let userAnswers = {};
let visitedQuestions = {};
let markedForReview = {};
let timeLeft = 0;
let quizStartDurationSeconds = 0;
let timerInterval = null;
let isPaused = false;
let currentMode = 'test';
let checkedQuestions = {};
let currentQuizIsTest = false;
let lockedTestDurationMinutes = null; 
const DEFAULT_TEST_MODE_MINUTES_FALLBACK = 20; 
const quizEls = {
    loader: document.getElementById('loading-screen'),
    container: document.getElementById('quiz-container'),
    title: document.getElementById('quiz-title'),
    time: document.getElementById('time-display'),
    qText: document.getElementById('question-text'),
    opts: document.getElementById('options-area'),
    progressBar: document.getElementById('progress-bar'),
    prev: document.getElementById('prev-btn'),
    next: document.getElementById('next-btn'),
    finalSubmit: document.getElementById('final-submit-btn'),
    clearBtn: document.getElementById('clear-btn'),
    markBtn: document.getElementById('mark-review-btn'),
    pause: document.getElementById('pause-btn'),
    resume: document.getElementById('resume-btn'),
    pausedOverlay: document.getElementById('paused-overlay'),
    saveBtn: document.getElementById('save-btn'),
    exitModal: document.getElementById('exit-modal'),
    resumeModal: document.getElementById('resume-modal'),
    setupModal: document.getElementById('setup-modal'), 
    setupSet: document.getElementById('setup-question-set'),
    setupTimer: document.getElementById('setup-timer'),
    startBtn: document.getElementById('btn-start-custom'),
    setupTitle: document.getElementById('setup-quiz-title'),
    viewLastBtn: document.getElementById('btn-view-last-result'),
    endQuizModal: document.getElementById('end-quiz-modal'),
    confirmSubmitModalBtn: document.getElementById('modal-confirm-submit'),
    cancelSubmitModalBtn: document.getElementById('modal-cancel-submit'),
    endQuizEarlyBtn: document.getElementById('end-quiz-early-btn'),
    warningBanner: document.getElementById('warning-banner'),
    warningsLeftCount: document.getElementById('warnings-left-count'),
    warningText: document.getElementById('warning-text')
};

// ============================================================
// PROCTORING STATE (100% client-side — nothing here ever leaves the browser)
// ============================================================
const proctorEls = {
    consentModal: document.getElementById('proctor-consent-modal'),
    enableBtn: document.getElementById('proctor-enable-btn'),
    cancelBtn: document.getElementById('proctor-cancel-btn'),
    fallbackNormalBtn: document.getElementById('proctor-fallback-normal-btn'),
    consentError: document.getElementById('proctor-consent-error'),
    video: document.getElementById('proctor-video'),
    statusDot: document.getElementById('proctor-status-dot'),
    statusText: document.getElementById('proctor-status-text'),
    widget: document.getElementById('proctor-widget')
};

// ===== Pre-Quiz Initialization (Step 1): instructions + consent + CBT/Normal mode choice =====
const preQuizEls = {
    modal: document.getElementById('pre-quiz-init-modal'),
    consentCheckbox: document.getElementById('pre-quiz-consent-checkbox'),
    consentError: document.getElementById('pre-quiz-consent-error'),
    continueBtn: document.getElementById('pre-quiz-continue-btn'),
    modeRadios: () => document.querySelectorAll('input[name="proctor_selection_mode"]')
};

let modelWarmupStarted = false;
let faceModel = null;              // true once face-api.js's tiny_face_detector net is loaded
let proctorStream = null;          // MediaStream from getUserMedia (never transmitted anywhere)
let proctorDetectionTimer = null;  // setInterval handle for the detection loop
let noFaceSince = null;            // timestamp when face last went missing
let pendingStartConfig = null;     // quiz-setup choices captured before proctoring consent
let proctoringEnabled = false;     // true only when the user picked "CBT Mode" in the pre-quiz step
let pendingResume = false;         // true when the camera-consent step was triggered by resuming a saved CBT attempt

function warmUpProctoringAssets() {
    if (modelWarmupStarted) return;
    modelWarmupStarted = true;
    loadWithRetry(() => loadFaceModel(30000), 4, 'face-detection model');
}

async function loadWithRetry(loaderFn, maxAttempts, label) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const result = await loaderFn();
            if (result) {
                console.log(`${label} ready (attempt ${attempt}).`);
                return result;
            }
        } catch (err) {
            console.warn(`${label} load attempt ${attempt}/${maxAttempts} failed:`, err.message);
        }
        if (attempt < maxAttempts) {
            await new Promise((r) => setTimeout(r, 4000 * attempt)); // 4s, 8s, 12s...
        }
    }
    console.warn(`${label} could not be loaded after ${maxAttempts} attempts — continuing without it.`);
    return null;
}

document.addEventListener('change', (e) => {
    if (e.target && e.target.name === 'proctor_selection_mode' && e.target.value === 'cbt') {
        warmUpProctoringAssets();
    }
});
const initiallyChecked = document.querySelector('input[name="proctor_selection_mode"]:checked');
if (initiallyChecked && initiallyChecked.value === 'cbt') warmUpProctoringAssets();

let violationCount = 0;
const MAX_VIOLATIONS = 3;          // exactly 3 warnings allowed; the 4th triggers auto-submit
let violationLog = [];
let violationModalOpen = false;

let currentLanguage = 'en';
const translationCache = new Map(); // `${lang}::${text}` -> translated text
const langEls = { select: document.getElementById('language-select') };

const MATH_PLACEHOLDER_RE = /%%MATH(\d+)%%/g;

function protectMath(text) {
    const segments = [];
    const protectedText = String(text).replace(
        /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g,
        (match) => {
            segments.push(match);
            return `%%MATH${segments.length - 1}%%`;
        }
    );
    return { protectedText, segments };
}

function restoreMath(text, segments) {
    return text.replace(MATH_PLACEHOLDER_RE, (_, i) => segments[Number(i)] ?? '');
}

async function translateText(text, targetLang) {
    if (!text || !targetLang || targetLang === 'en') return text;
    const cacheKey = `${targetLang}::${text}`;
    if (translationCache.has(cacheKey)) return translationCache.get(cacheKey);

    const { protectedText, segments } = protectMath(text);

    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(protectedText)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Translate HTTP ${res.status}`);
        const data = await res.json();
        const translated = (data[0] || []).map(chunk => chunk[0]).join('');
        const restored = restoreMath(translated, segments);
        translationCache.set(cacheKey, restored);
        return restored;
    } catch (err) {
        console.warn('Translation unavailable, showing original text:', err);
        return text; // graceful fallback — quiz always stays usable
    }
}

async function applyStaticUILanguage(lang) {
    const nodes = document.querySelectorAll('[data-i18n-default]');
    await Promise.all(Array.from(nodes).map(async (node) => {
        const original = node.getAttribute('data-i18n-default');
        node.textContent = await translateText(original, lang);
    }));
}

async function applyQuestionLanguage(lang) {
    const q = questions[currentIndex];
    if (!q) return;

    if (lang === 'en') {
        quizEls.qText.innerHTML = q.question;
    } else {
        quizEls.qText.innerHTML = await translateText(q.question, lang);
    }

    const optionButtons = quizEls.opts.querySelectorAll('.option-btn');
    await Promise.all(Array.from(optionButtons).map(async (btn, i) => {
        const key = ['A', 'B', 'C', 'D'][i];
        if (!key || !q.options[key]) return;
        const textSpan = btn.querySelector('span:last-child');
        if (!textSpan) return;
        textSpan.textContent = lang === 'en' ? q.options[key] : await translateText(q.options[key], lang);
    }));

    renderMath(quizEls.container);
}

async function applyLanguage(lang) {
    currentLanguage = lang;
    document.documentElement.setAttribute('dir', lang === 'ur' || lang === 'sd' || lang === 'ks' ? 'auto' : 'ltr');
    await Promise.all([applyStaticUILanguage(lang), applyQuestionLanguage(lang)]);
}

if (langEls.select) {
    langEls.select.onchange = () => applyLanguage(langEls.select.value);
}

const formatTime = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

const renderMath = (element = document.body) => {
    if (typeof renderMathInElement !== 'undefined') {
        renderMathInElement(element, {
            delimiters: [
                {left: "$$", right: "$$", display: true},
                {left: "\\[", right: "\\]", display: true},
                {left: "$", right: "$", display: false},
                {left: "\\(", right: "\\)", display: false}
            ],
            throwOnError: false
        });
    }
};

window.goToQuestion = (index) => {
    if (currentQuizIsTest) return;
    if (index >= 0 && index < questions.length) {
        currentIndex = index;
        renderQuestion();
    }
};

const updateQuestionPalette = () => {
    if (currentQuizIsTest) return; // Disable Navigation: no palette/grid to update in strict Test Mode
    if (typeof window.renderQuestionPalette === 'function') {
        const paletteItems = questions.map((q, idx) => {
            let status = 'not-visited';
            const hasAnswer = !!userAnswers[q.id];
            const isMarked = !!markedForReview[q.id];

            if (visitedQuestions[q.id]) {
                if (hasAnswer && isMarked) status = 'answered-marked';
                else if (hasAnswer) status = 'answered';
                else if (isMarked) status = 'marked';
                else status = 'not-answered';
            }

            return {
                number: idx + 1,
                status: status,
                current: idx === currentIndex
            };
        });
        window.renderQuestionPalette(paletteItems);
    }
};



const renderQuestion = () => {
    const q = questions[currentIndex];
    
    // Mark as visited as soon as it renders
    visitedQuestions[q.id] = true;
    
    quizEls.qText.innerHTML = q.question;

    const existingImg = document.getElementById('current-quiz-image');
    if (existingImg) existingImg.remove();

    if (q.imageUrl) {
        const imgContainer = document.createElement('div');
        imgContainer.id = 'current-quiz-image';
        imgContainer.className = "w-full flex justify-center my-4";
        
        imgContainer.innerHTML = `
            <div id="trigger-zoom" class="relative group w-full max-w-lg mx-auto bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 cursor-zoom-in transition-all hover:shadow-md">
                <img src="${q.imageUrl}" alt="Question" class="w-full h-32 md:h-48 object-contain mx-auto p-2">
                <div class="absolute inset-0 flex items-center justify-center bg-black/10 group-hover:bg-black/20 transition-colors">
                     <div class="bg-white/90 dark:bg-slate-800/90 text-primary px-4 py-2 rounded-full text-xs font-bold shadow-sm backdrop-blur-sm">
                        <i class="fa-solid fa-expand mr-2"></i> Click to Zoom Image
                     </div>
                </div>
            </div>
        `;
        quizEls.qText.parentNode.insertBefore(imgContainer, quizEls.qText.nextSibling);

        document.getElementById('trigger-zoom').addEventListener('click', function() {
            window.openImageZoom(q.imageUrl);
        });
    }

    document.getElementById('question-meta').textContent = `Question ${currentIndex+1} of ${questions.length}`;
    
    quizEls.progressBar.style.width = `${((currentIndex+1)/questions.length)*100}%`;
    quizEls.opts.innerHTML = '';

    const isChecked = checkedQuestions[q.id];
    const userAnswer = userAnswers[q.id];

    ['A','B','C','D'].forEach(key => {
        const btn = document.createElement('button');
        const isSel = userAnswer === key;
        
        let btnClass = "option-btn w-full text-left p-4 rounded-xl border transition-all flex items-start gap-3 ";
        let badgeClass = "w-8 h-8 rounded-full flex items-center justify-center ";
        
        if (currentMode === 'quiz' && isChecked) {
             if (key === q.answer) {
                btnClass += "border-green-500 bg-green-50 dark:bg-green-900/20 ring-1 ring-green-500 ";
                badgeClass += "bg-green-500 text-white";
            } else if (isSel && key !== q.answer) {
                btnClass += "border-red-500 bg-red-50 dark:bg-red-900/20 ring-1 ring-red-500 ";
                badgeClass += "bg-red-500 text-white";
            } else {
                btnClass += "border-slate-200 dark:border-slate-600 opacity-60 ";
                badgeClass += "bg-slate-100 dark:bg-slate-700";
            }
        } else {
             if (isSel) {
                btnClass += "border-primary bg-indigo-50 dark:bg-primary/20 ring-1 ring-primary ";
                badgeClass += "bg-primary text-white";
            } else {
                btnClass += "border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-primary/50 ";
                badgeClass += "bg-slate-100 dark:bg-slate-700";
            }
        }

        btn.className = btnClass;
        btn.disabled = (currentMode === 'quiz' && isChecked); 
        btn.innerHTML = `<span class="${badgeClass}">${key}</span><span class="text-lg ${isSel && !isChecked ? 'text-primary font-semibold' : 'dark:text-slate-300'}">${q.options[key]}</span>`;
        btn.onclick = () => { 
            if(!isPaused && !(currentMode === 'quiz' && isChecked)) { 
                userAnswers[q.id] = key;
                renderQuestion(); 
            }
        };
        quizEls.opts.appendChild(btn);
    });

    const existingCheckBtn = document.getElementById('check-answer-btn');
    if(existingCheckBtn) existingCheckBtn.remove();
    
    if (currentMode === 'quiz' && !isChecked) {
        const checkBtn = document.createElement('button');
        checkBtn.id = 'check-answer-btn';
        checkBtn.className = "w-full md:w-auto px-6 py-2.5 rounded-xl text-white font-medium bg-purple-600 shadow-lg shadow-purple-500/30 hover:bg-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed";
        checkBtn.innerHTML = '<i class="fa-solid fa-check-double mr-2"></i> Check Answer';
        checkBtn.disabled = !userAnswers[q.id];
        checkBtn.onclick = () => {
            checkedQuestions[q.id] = true;
            renderQuestion();
        };
        const footerDiv = document.querySelector('footer div.flex');
        if(quizEls.next) quizEls.next.classList.add('hidden');
        if(quizEls.finalSubmit) quizEls.finalSubmit.classList.add('hidden');
        if(footerDiv) footerDiv.appendChild(checkBtn);
    } else {
        if(quizEls.prev) quizEls.prev.disabled = currentIndex === 0;
        
        // Final Question Logic
        if (currentIndex === questions.length - 1) {
            if(quizEls.next) quizEls.next.classList.add('hidden');
            if(quizEls.finalSubmit) quizEls.finalSubmit.classList.remove('hidden');
        } else {
            if(quizEls.next) quizEls.next.classList.remove('hidden');
            if(quizEls.finalSubmit) quizEls.finalSubmit.classList.add('hidden');
        }
    }
    
    updateQuestionPalette();
    renderMath(quizEls.container);
    if (currentLanguage !== 'en') {
        applyQuestionLanguage(currentLanguage);
    }
};


if(quizEls.clearBtn) {
    quizEls.clearBtn.onclick = () => {
        const qId = questions[currentIndex].id;
        delete userAnswers[qId];
        delete markedForReview[qId]; 
        renderQuestion();
    };
}

if(quizEls.markBtn) {
    quizEls.markBtn.onclick = () => {
        const qId = questions[currentIndex].id;
        markedForReview[qId] = !markedForReview[qId]; // Toggle mark status
        if (currentIndex < questions.length - 1) {
            currentIndex++;
        }
        renderQuestion();
    };
}

const triggerEndModal = () => {
    if(quizEls.endQuizModal) quizEls.endQuizModal.classList.remove('hidden');
    togglePause(true); 
};

if(quizEls.endQuizEarlyBtn) quizEls.endQuizEarlyBtn.onclick = triggerEndModal;
if(quizEls.finalSubmit) quizEls.finalSubmit.onclick = triggerEndModal;

if(quizEls.cancelSubmitModalBtn) {
    quizEls.cancelSubmitModalBtn.onclick = () => {
        if(quizEls.endQuizModal) quizEls.endQuizModal.classList.add('hidden');
        togglePause(false); // Resume timer
    };
}

if(quizEls.confirmSubmitModalBtn) {
    quizEls.confirmSubmitModalBtn.onclick = () => {
        if(quizEls.endQuizModal) quizEls.endQuizModal.classList.add('hidden');
        submitQuiz(false); 
    };
}


const startTimer = () => {
    clearInterval(timerInterval);
    timerInterval = setInterval(() => {
        if(!isPaused && timeLeft > 0) {
            timeLeft--;
            quizEls.time.textContent = formatTime(timeLeft);
        } else if(timeLeft <= 0) {
            submitQuiz(true);
        }
    }, 1000);
};

const togglePause = (state) => {
    isPaused = state;
    if(isPaused) {
        clearInterval(timerInterval);
        if(quizEls.pause) quizEls.pause.classList.add('hidden'); 
        if(quizEls.resume) quizEls.resume.classList.remove('hidden');
        if(quizEls.pausedOverlay) quizEls.pausedOverlay.classList.remove('hidden');
    } else {
        startTimer();
        if(quizEls.pause) quizEls.pause.classList.remove('hidden'); 
        if(quizEls.resume) quizEls.resume.classList.add('hidden');
        if(quizEls.pausedOverlay) quizEls.pausedOverlay.classList.add('hidden');
    }
};

function showPreQuizInitModal() {
    if (!preQuizEls.modal) {
        proctoringEnabled = false;
        if (quizEls.setupModal) quizEls.setupModal.classList.remove('hidden');
        return;
    }

    if (preQuizEls.consentCheckbox) preQuizEls.consentCheckbox.checked = false;
    if (preQuizEls.consentError) preQuizEls.consentError.classList.add('hidden');
    preQuizEls.modal.classList.remove('hidden');
}

if (preQuizEls.continueBtn) {
    preQuizEls.continueBtn.onclick = () => {
        const agreed = preQuizEls.consentCheckbox && preQuizEls.consentCheckbox.checked;
        if (!agreed) {
            if (preQuizEls.consentError) preQuizEls.consentError.classList.remove('hidden');
            return;
        }
        const modeInput = document.querySelector('input[name="proctor_selection_mode"]:checked');
        proctoringEnabled = modeInput ? modeInput.value === 'cbt' : true;

        preQuizEls.modal.classList.add('hidden');
        if (quizEls.setupModal) quizEls.setupModal.classList.remove('hidden');
    };
}

const TOKEN_PORTAL_URL = "/token.html";

const tokenUnlockEls = {
    modal: document.getElementById('token-unlock-modal'),
    quizTitle: document.getElementById('token-unlock-quiz-title'),
    input: document.getElementById('token-unlock-input'),
    error: document.getElementById('token-unlock-error'),
    verifyBtn: document.getElementById('token-unlock-verify-btn'),
    getLinkBtn: document.getElementById('token-unlock-getlink-btn'),
};

let tokenGateQuizId = null;
let tokenGateOnUnlocked = null;
const tokenUnlockSessionKey = (quizId) => `paidQuizUnlocked_${quizId}`;

function isQuizUnlockedInSession(quizId) {
    try { return sessionStorage.getItem(tokenUnlockSessionKey(quizId)) === '1'; }
    catch (e) { return false; }
}
function markQuizUnlockedInSession(quizId) {
    try { sessionStorage.setItem(tokenUnlockSessionKey(quizId), '1'); }
    catch (e) { /* sessionStorage unavailable — worst case the tab just asks again, not a hard failure */ }
}

function showTokenUnlockModal(quizId, quizTitle, onUnlocked) {
    tokenGateQuizId = quizId;
    tokenGateOnUnlocked = onUnlocked;

    if (tokenUnlockEls.quizTitle) tokenUnlockEls.quizTitle.textContent = quizTitle || 'This quiz';
    if (tokenUnlockEls.input) tokenUnlockEls.input.value = '';
    if (tokenUnlockEls.error) tokenUnlockEls.error.classList.add('hidden');
    if (tokenUnlockEls.getLinkBtn) {
        tokenUnlockEls.getLinkBtn.href = `${TOKEN_PORTAL_URL}?quizId=${encodeURIComponent(quizId)}`;
    }
    if (tokenUnlockEls.modal) tokenUnlockEls.modal.classList.remove('hidden');
    if (tokenUnlockEls.input) tokenUnlockEls.input.focus();
}

async function verifyAndConsumeToken(quizId, rawCode) {
    const code = String(rawCode || '').trim();
    if (!/^\d{6}$/.test(code)) {
        throw new Error('Enter the 6-digit token exactly as shown.');
    }

    const poolRef = db.collection('quiz_tokens').doc(quizId);
    const tokensCol = poolRef.collection('tokens');

    const candidateSnap = await tokensCol.where('code', '==', code).limit(1).get();
    if (candidateSnap.empty) {
        throw new Error('That token is invalid, already used, or not for this quiz.');
    }
    const tokenRef = candidateSnap.docs[0].ref;

    return db.runTransaction(async (t) => {
        const tokenDoc = await t.get(tokenRef);
        if (!tokenDoc.exists) {
            throw new Error('That token is invalid, already used, or not for this quiz.');
        }
        t.delete(tokenRef);
        t.set(poolRef, { usedCount: firebase.firestore.FieldValue.increment(1) }, { merge: true });
        return true;
    });
}

if (tokenUnlockEls.verifyBtn) {
    tokenUnlockEls.verifyBtn.onclick = async () => {
        if (!tokenGateQuizId) return;
        if (tokenUnlockEls.error) tokenUnlockEls.error.classList.add('hidden');

        tokenUnlockEls.verifyBtn.disabled = true;
        tokenUnlockEls.verifyBtn.textContent = 'Verifying...';
        try {
            await verifyAndConsumeToken(tokenGateQuizId, tokenUnlockEls.input.value);
            markQuizUnlockedInSession(tokenGateQuizId);
            if (tokenUnlockEls.modal) tokenUnlockEls.modal.classList.add('hidden');

            const proceed = tokenGateOnUnlocked;
            tokenGateQuizId = null;
            tokenGateOnUnlocked = null;
            if (typeof proceed === 'function') proceed();
        } catch (e) {
            if (tokenUnlockEls.error) {
                tokenUnlockEls.error.textContent = e.message;
                tokenUnlockEls.error.classList.remove('hidden');
            }
        } finally {
            tokenUnlockEls.verifyBtn.disabled = false;
            tokenUnlockEls.verifyBtn.textContent = 'Verify Token';
        }
    };
}

if (tokenUnlockEls.input) {
    // Digits only, 6 max — keeps stray characters from ever reaching the query.
    tokenUnlockEls.input.addEventListener('input', () => {
        tokenUnlockEls.input.value = tokenUnlockEls.input.value.replace(/\D/g, '').slice(0, 6);
    });
    tokenUnlockEls.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && tokenUnlockEls.verifyBtn) tokenUnlockEls.verifyBtn.click();
    });
}

const loadQuiz = async (uid) => {
    quizEls.loader.classList.remove('hidden');

    let doc = await db.collection('quizzes').doc(uid).get();

    if (!doc.exists) {
        try {
            const aliasDoc = await db.collection('quiz_aliases').doc(uid).get();
            if (aliasDoc.exists && aliasDoc.data().quizId) {
                uid = aliasDoc.data().quizId; // switch to the real doc id for everything below
                doc = await db.collection('quizzes').doc(uid).get();
            }
        } catch (e) {
            console.warn('Alias lookup failed:', e);
        }
    }

    if(!doc.exists) {
        document.getElementById('error-text').textContent = "Quiz not found or deleted.";
        document.getElementById('error-message-area').classList.remove('hidden');
        return;
    }

    currentQuizId = uid;

    const data = doc.data();

    if (data.isPaid === true && !isQuizUnlockedInSession(uid)) {
        quizEls.loader.classList.add('hidden');
        showTokenUnlockModal(uid, data.title, () => loadQuiz(uid));
        return;
    }

    quizEls.title.textContent = data.title;
    quizEls.setupTitle.textContent = data.title;
    allQuestions = data.questions.map((q,i)=>({...q, id:`Q${i+1}`}));

    currentQuizIsTest = data.test_quiz === true;

    const urlParams = new URLSearchParams(window.location.search);
    const retryModeParam = urlParams.get('mode'); // 'retry-incorrect' | 'retry-unattempted' | null
    let retryIncorrectActive = false;
    let retryModeLabel = '';
    if (retryModeParam === 'retry-incorrect' || retryModeParam === 'retry-unattempted') {
        try {
            const retryConfig = JSON.parse(sessionStorage.getItem('retryQuizConfig') || 'null');
            if (retryConfig && retryConfig.mode === retryModeParam && retryConfig.quizId === uid
                && Array.isArray(retryConfig.questionIds) && retryConfig.questionIds.length > 0) {
                const wantedIds = new Set(retryConfig.questionIds);
                const filtered = allQuestions.filter(q => wantedIds.has(q.id));
                if (filtered.length > 0) {
                    allQuestions = filtered;
                    retryIncorrectActive = true;
                    retryModeLabel = retryModeParam === 'retry-incorrect' ? 'Practice Incorrect' : 'Practice Unattempted';
                }
            }
        } catch (e) {
            console.warn("Could not parse retryQuizConfig, falling back to full quiz:", e);
        } finally {
            sessionStorage.removeItem('retryQuizConfig');
        }
    }

    quizEls.setupTitle.textContent = retryIncorrectActive
        ? `${data.title} — ${retryModeLabel} (${allQuestions.length} Qs)`
        : data.title;

    quizEls.setupSet.innerHTML = '';
    const setSize = 20;
    const totalQ = allQuestions.length;
    for (let i = 0; i < totalQ; i += setSize) {
        const start = i + 1;
        const end = Math.min(i + setSize, totalQ);
        const option = document.createElement('option');
        option.value = `${i}-${end}`; 
        option.textContent = `Questions ${start} - ${end}`;
        quizEls.setupSet.appendChild(option);
    }
    if (totalQ > setSize) {
        const allOpt = document.createElement('option');
        allOpt.value = `0-${totalQ}`;
        allOpt.textContent = `All Questions (${totalQ})`;
        quizEls.setupSet.appendChild(allOpt);
    }

    quizEls.setupTimer.innerHTML = '';
    const maxDurationMin = data.durationMinutes || Math.ceil(totalQ * 1); 

    if (currentQuizIsTest) {
        const fixedMin = data.durationMinutes || DEFAULT_TEST_MODE_MINUTES_FALLBACK;
        lockedTestDurationMinutes = fixedMin;
        const lockedOpt = document.createElement('option');
        lockedOpt.value = fixedMin;
        lockedOpt.textContent = `${fixedMin} Minutes (Fixed — Test Mode)`;
        lockedOpt.selected = true;
        quizEls.setupTimer.appendChild(lockedOpt);
        quizEls.setupTimer.disabled = true;
        quizEls.setupTimer.classList.add('opacity-60', 'cursor-not-allowed');
    } else {
        for (let t = 5; t <= maxDurationMin; t += 5) {
            const option = document.createElement('option');
            option.value = t;
            option.textContent = `${t} Minutes`;
            if (t === 20 || t === maxDurationMin) option.selected = true; 
            quizEls.setupTimer.appendChild(option);
        }
        if (maxDurationMin % 5 !== 0) {
             const maxOpt = document.createElement('option');
             maxOpt.value = maxDurationMin;
             maxOpt.textContent = `${maxDurationMin} Minutes (Max)`;
             maxOpt.selected = true;
             quizEls.setupTimer.appendChild(maxOpt);
        }
        quizEls.setupTimer.disabled = false;
        quizEls.setupTimer.classList.remove('opacity-60', 'cursor-not-allowed');
        lockedTestDurationMinutes = null;
    }

    const modeBlock = document.getElementById('mode-select-block');
    const lockedBanner = document.getElementById('test-mode-locked-banner');
    if (currentQuizIsTest) {
        if (modeBlock) modeBlock.classList.add('hidden');
        if (lockedBanner) { lockedBanner.classList.remove('hidden'); lockedBanner.classList.add('flex'); }
        const testRadio = document.querySelector('input[name="quiz_mode"][value="test"]');
        const quizRadio = document.querySelector('input[name="quiz_mode"][value="quiz"]');
        if (testRadio) testRadio.checked = true;
        if (quizRadio) quizRadio.disabled = true;
    } else {
        if (modeBlock) modeBlock.classList.remove('hidden');
        if (lockedBanner) { lockedBanner.classList.add('hidden'); lockedBanner.classList.remove('flex'); }
        const quizRadio = document.querySelector('input[name="quiz_mode"][value="quiz"]');
        if (quizRadio) quizRadio.disabled = false;
    }

    const prog = await db.collection('user_progress').doc(CURRENT_USER_ID).collection('saved_quizzes').doc(uid).get();
    
    quizEls.loader.classList.add('hidden');
    
    if(prog.exists) {
        quizEls.resumeModal.classList.remove('hidden');
        document.getElementById('btn-resume-attempt').onclick = () => {
            const s = prog.data();
            questions = allQuestions;
            currentIndex = s.currentIndex; 
            timeLeft = s.timeLeft; 
            quizStartDurationSeconds = typeof s.quizStartDurationSeconds === 'number' ? s.quizStartDurationSeconds : s.timeLeft;
            userAnswers = s.userAnswers;
            
            if(s.visitedQuestions) visitedQuestions = s.visitedQuestions;
            if(s.markedForReview) markedForReview = s.markedForReview;
            proctoringEnabled = !!s.proctoringEnabled;

            quizEls.resumeModal.classList.add('hidden');

            if (proctoringEnabled && proctorEls.consentModal) {
                pendingResume = true;
                if (proctorEls.consentError) proctorEls.consentError.classList.add('hidden');
                proctorEls.consentModal.classList.remove('hidden');
            } else {
                startQuizSession();
            }
        };
        document.getElementById('btn-restart-attempt').onclick = async () => {
            await prog.ref.delete(); 
            quizEls.resumeModal.classList.add('hidden');
            showPreQuizInitModal();
        };
    } else {
        showPreQuizInitModal();
    }

    quizEls.startBtn.onclick = () => {
        const modeInput = document.querySelector('input[name="quiz_mode"]:checked');
        pendingStartConfig = {
            mode: currentQuizIsTest ? 'test' : (modeInput ? modeInput.value : 'test'),
            selectedTime: currentQuizIsTest
                ? (lockedTestDurationMinutes || DEFAULT_TEST_MODE_MINUTES_FALLBACK)
                : parseInt(quizEls.setupTimer.value, 10),
            rangeVal: quizEls.setupSet.value
        };

        if (proctoringEnabled && proctorEls.consentModal) {
            if (quizEls.setupModal) quizEls.setupModal.classList.add('hidden');
            proctorEls.consentModal.classList.remove('hidden');
            if (proctorEls.consentError) proctorEls.consentError.classList.add('hidden');
        } else {
            beginSelectedQuiz();
        }
    };
};

const beginSelectedQuiz = () => {
    const cfg = pendingStartConfig;
    if (!cfg) return;
    currentMode = cfg.mode;
    timeLeft = cfg.selectedTime * 60;
    quizStartDurationSeconds = timeLeft; // remember the real starting duration for result.js's Total Time calc
    const [start, end] = cfg.rangeVal.split('-').map(Number);

    questions = allQuestions.slice(start, end);
    currentIndex = 0;
    userAnswers = {};
    visitedQuestions = {};
    markedForReview = {};
    checkedQuestions = {};

    // Fresh violation state for this attempt
    violationCount = 0;
    violationLog = [];
    persistViolationState();

    // Fresh proctoring-detection state for this attempt
    noFaceSince = null;

    startQuizSession();
};


if (proctorEls.cancelBtn) {
    proctorEls.cancelBtn.onclick = () => {
        stopProctoring();
        if (proctorEls.consentModal) proctorEls.consentModal.classList.add('hidden');
        if (pendingResume) {
            pendingResume = false;
            if (quizEls.resumeModal) quizEls.resumeModal.classList.remove('hidden');
        } else if (quizEls.setupModal) {
            quizEls.setupModal.classList.remove('hidden');
        }
    };
}

function resetEnableBtn() {
    proctorEls.enableBtn.disabled = false;
    proctorEls.enableBtn.innerHTML = '<i class="fa-solid fa-camera mr-2"></i>Enable Camera & Start Test';
}

function hideProctorFailureUI() {
    if (proctorEls.consentError) proctorEls.consentError.classList.add('hidden');
    if (proctorEls.fallbackNormalBtn) proctorEls.fallbackNormalBtn.classList.add('hidden');
}

if (proctorEls.fallbackNormalBtn) {
    proctorEls.fallbackNormalBtn.onclick = () => {
        stopProctoring();
        proctoringEnabled = false;
        if (proctorEls.consentModal) proctorEls.consentModal.classList.add('hidden');
        hideProctorFailureUI();

        if (pendingResume) {
            pendingResume = false;
            startQuizSession();
        } else {
            beginSelectedQuiz();
        }
    };
}

if (proctorEls.enableBtn) {
    proctorEls.enableBtn.onclick = async () => {
        proctorEls.enableBtn.disabled = true;
        hideProctorFailureUI();
        proctorEls.enableBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i>Requesting camera access...';

        try {
            if (!proctorStream) await setupProctorCamera();

            warmUpProctoringAssets();
            requestFullscreenMode();
            proctorEls.consentModal.classList.add('hidden');
            hideProctorFailureUI();
            resetEnableBtn();

            if (pendingResume) {
                pendingResume = false;
                startQuizSession();
            } else {
                beginSelectedQuiz();
            }
        } catch (err) {
            console.error('Camera setup failed:', err);

            if (proctorStream) {
                proctorStream.getTracks().forEach(t => t.stop());
                proctorStream = null;
            }

            if (proctorEls.consentError) {
                proctorEls.consentError.textContent =
                    'Camera access is required to start this proctored test. Please allow camera permission in your browser and try again — or continue below without the camera.';
                proctorEls.consentError.classList.remove('hidden');
            }

            if (proctorEls.fallbackNormalBtn) proctorEls.fallbackNormalBtn.classList.remove('hidden');

            resetEnableBtn();
        }
    };
}

const startQuizSession = () => {
    document.querySelectorAll('.fixed').forEach(m => { if(m.id!=='loading-screen' && m.id!=='proctor-widget') m.classList.add('hidden') });
    
    quizEls.container.classList.remove('hidden');
    quizEls.time.textContent = formatTime(timeLeft);
    const paletteToggleBtn = document.getElementById('palette-toggle-btn');
    const paletteAside = document.getElementById('question-palette');
    if (currentQuizIsTest) {
        if (paletteToggleBtn) paletteToggleBtn.classList.add('hidden');
        if (paletteAside) paletteAside.classList.add('hidden');
    } else {
        if (paletteToggleBtn) paletteToggleBtn.classList.remove('hidden');
        if (paletteAside) paletteAside.classList.remove('hidden');
    }

    renderQuestion();
    startTimer();
    
    if (typeof setupAntiCheatingMeasures === 'function') {
        setupAntiCheatingMeasures();
    }

    restoreViolationState();
    if (proctoringEnabled) {
        if (proctorEls.widget) proctorEls.widget.classList.remove('hidden');
        startFaceDetectionLoop();
        if (faceModel) {
            setProctorStatus('ok', 'Proctoring Active');
        } else {
            setProctorStatus('warn', 'Camera Recording (AI loading…)');
            watchForFaceModelReady();
        }
    } else if (proctorEls.widget) {
        proctorEls.widget.classList.add('hidden');
    }
    
    history.pushState(null, null, location.href);
    window.onpopstate = () => {
        if(!document.getElementById('result-box').classList.contains('hidden')) {
             window.location.replace('/index.html');
        } else { 
            togglePause(true); 
            if(quizEls.exitModal) quizEls.exitModal.classList.remove('hidden'); 
            history.pushState(null, null, location.href); 
        }
    };
};

const saveProgress = async () => {
    await db.collection('user_progress').doc(CURRENT_USER_ID).collection('saved_quizzes').doc(currentQuizId).set({
        currentIndex, 
        timeLeft, 
        quizStartDurationSeconds, // so a resumed attempt still knows its real total duration
        userAnswers, 
        visitedQuestions,
        markedForReview,
        proctoringEnabled,
        lastSaved: firebase.firestore.FieldValue.serverTimestamp()
    });
};

if(quizEls.prev) quizEls.prev.onclick = () => { if(currentIndex>0) { currentIndex--; renderQuestion(); }};
if(quizEls.next) quizEls.next.onclick = () => { 
    if(currentIndex<questions.length-1) { 
        currentIndex++; 
        renderQuestion(); 
    }
};

if(quizEls.pause) quizEls.pause.onclick = () => togglePause(true);
if(quizEls.resume) quizEls.resume.onclick = () => togglePause(false);

if(quizEls.saveBtn) {
    quizEls.saveBtn.onclick = () => {
         togglePause(true);
         quizEls.exitModal.classList.remove('hidden');
         history.pushState(null, null, location.href);
    };
}

if(document.getElementById('modal-cancel')) {
    document.getElementById('modal-cancel').onclick = () => { 
        quizEls.exitModal.classList.add('hidden'); 
        togglePause(false); 
    };
}
if(document.getElementById('modal-save')) {
    document.getElementById('modal-save').onclick = async () => {
        stopProctoring();
        await saveProgress();
        window.onpopstate = null; 
        window.location.replace('/index.html');
    };
}

window.toggleModeDescription = (mode) => {
    console.log("Selected Mode:", mode);
};

const themeEls = {
    themeToggle: document.getElementById('theme-toggle'),
    sunIcon: document.getElementById('sun-icon'),
    moonIcon: document.getElementById('moon-icon'),
};
function initTheme() {
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        if(themeEls.sunIcon) themeEls.sunIcon.classList.remove('hidden');
        if(themeEls.moonIcon) themeEls.moonIcon.classList.add('hidden');
    } else {
        document.documentElement.classList.remove('dark');
        if(themeEls.sunIcon) themeEls.sunIcon.classList.add('hidden');
        if(themeEls.moonIcon) themeEls.moonIcon.classList.remove('hidden');
    }
}
if(themeEls.themeToggle) {
    themeEls.themeToggle.onclick = () => {
        document.documentElement.classList.toggle('dark');
        localStorage.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        initTheme();
    };
}
initTheme();

const quizContainer = document.getElementById('quiz-container'); 

function showAntiCheatAlert(message, isCritical = false) {
    console.warn(`Anti-Cheat Alert: ${message}`);
    
    const alertId = 'anticheat-alert';
    const existingAlert = document.getElementById(alertId);
    if (existingAlert) existingAlert.remove();
    
    const alertEl = document.createElement('div');
    alertEl.id = alertId;
    alertEl.className = `fixed top-0 left-0 right-0 p-4 text-center z-[1000] font-bold shadow-lg transition-transform duration-300 transform 
        ${isCritical ? 'bg-red-600 text-white' : 'bg-yellow-400 text-slate-800'}`;
    alertEl.textContent = message;
    
    document.body.appendChild(alertEl);
    
    if (!isCritical) {
        setTimeout(() => {
            if (document.getElementById(alertId)) {
                document.getElementById(alertId).remove();
            }
        }, 4000);
    }
}


function quizActive() {
    return !!(quizContainer && !quizContainer.classList.contains('hidden') &&
        document.getElementById('result-box') &&
        document.getElementById('result-box').classList.contains('hidden'));
}

function violationStorageKey() {
    return 'quiz_violations_' + (typeof currentQuizId !== 'undefined' && currentQuizId ? currentQuizId : 'session');
}

function persistViolationState() {
    try {
        sessionStorage.setItem(violationStorageKey(), JSON.stringify({ violationCount, violationLog }));
    } catch (e) { /* sessionStorage unavailable — fail silently, still works in-memory */ }
}

function restoreViolationState() {
    try {
        const raw = sessionStorage.getItem(violationStorageKey());
        if (raw) {
            const saved = JSON.parse(raw);
            violationCount = saved.violationCount || 0;
            violationLog = saved.violationLog || [];
        }
    } catch (e) { /* ignore */ }
}

window.registerViolation = function (type, message) {
    if (!quizActive() || violationModalOpen) return;

    violationCount++;
    violationLog.push({ type, message, time: new Date().toISOString() });
    persistViolationState();

    togglePause(true);

    if (violationCount > MAX_VIOLATIONS) {
        stopFaceDetectionLoop();
        showAntiCheatAlert(`Maximum warnings (${MAX_VIOLATIONS}) exceeded — your quiz is being auto-submitted.`, true);
        setTimeout(() => submitQuiz(true), 1200);
        return;
    }

    violationModalOpen = true;
    const warningsLeft = MAX_VIOLATIONS - violationCount;

    if (quizEls.warningBanner) {
        quizEls.warningBanner.classList.remove('hidden');
        if (quizEls.warningsLeftCount) quizEls.warningsLeftCount.textContent = warningsLeft;
        if (quizEls.warningText) quizEls.warningText.textContent = message;
    }

    const overlay = document.getElementById('violation-overlay');
    const msg = document.getElementById('violation-msg');
    if (msg) msg.textContent = `${message} You have ${warningsLeft} warning(s) left before your quiz is auto-submitted.`;
    if (overlay) overlay.classList.remove('hidden');

    const closeBtn = document.getElementById('close-violation');
    if (closeBtn) {
        closeBtn.onclick = () => {
            overlay.classList.add('hidden');
            violationModalOpen = false;
            togglePause(false);
            noFaceSince = null;
            startFaceDetectionLoop();
            if (type === 'fullscreen-exit') requestFullscreenMode();
        };
    }
};

function handleVisibilityChange() {
    if (document.hidden && proctoringEnabled) {
        window.registerViolation('tab-switch', 'Tab switching / window minimizing detected!');
    }
}
async function setupProctorCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported in this browser.');
    }
    proctorStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 160 }, height: { ideal: 120 }, facingMode: 'user' },
        audio: false
    });
    if (proctorEls.video) {
        proctorEls.video.srcObject = proctorStream;
        await proctorEls.video.play().catch(() => {});
    }
}



function waitForGlobal(name, timeoutMs) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        (function poll() {
            if (typeof window[name] !== 'undefined') return resolve();
            if (Date.now() - start >= timeoutMs) {
                return reject(new Error(`${name}-not-loaded`));
            }
            setTimeout(poll, 150);
        })();
    });
}

async function loadFaceModel(remainingMs = 12000) {
    if (faceModel) return faceModel;
    console.log("Loading face-api tiny face detector...");
    await waitForGlobal('faceapi', remainingMs);
    await faceapi.nets.tinyFaceDetector.loadFromUri('/vendor/models');

    faceModel = true; 
    console.log("Face model loaded successfully.");
    return faceModel;
}

function setProctorStatus(state, text) {
    if (proctorEls.statusText) proctorEls.statusText.textContent = text;
    if (proctorEls.statusDot) {
        proctorEls.statusDot.className = 'w-2 h-2 rounded-full shrink-0 animate-pulse ' +
            (state === 'ok' ? 'bg-emerald-400' : 'bg-red-500');
    }
}

let faceModelWatcherInterval = null;
function watchForFaceModelReady() {
    if (faceModelWatcherInterval) return;
    faceModelWatcherInterval = setInterval(() => {
        if (faceModel) {
            clearInterval(faceModelWatcherInterval);
            faceModelWatcherInterval = null;
            if (proctoringEnabled && quizActive()) {
                startFaceDetectionLoop();
                setProctorStatus('ok', 'Proctoring Active');
            }
        }
    }, 1500);
}

function startFaceDetectionLoop() {
    stopFaceDetectionLoop();
    if (!proctoringEnabled || !faceModel || !proctorEls.video) return;

    proctorDetectionTimer = setInterval(async () => {
        if (violationModalOpen || isPaused || !quizActive()) return;
        if (proctorEls.video.readyState < 2) return;

        try {
            const detection = await faceapi.detectSingleFace(
                proctorEls.video,
                new faceapi.TinyFaceDetectorOptions()
            );
            handleFaceDetectionResult(!!detection);
        } catch (err) {
            console.warn('Face detection frame skipped:', err);
        }
    }, 800);
}

function stopFaceDetectionLoop() {
    if (proctorDetectionTimer) clearInterval(proctorDetectionTimer);
    proctorDetectionTimer = null;
}

const FACE_STABILITY_LIMIT_MS = 4000;

function handleFaceDetectionResult(faceFound) {
    if (!faceFound) {
        if (!noFaceSince) noFaceSince = Date.now();
        const elapsedMs = Date.now() - noFaceSince;
        const secondsLeft = Math.max(0, Math.ceil((FACE_STABILITY_LIMIT_MS - elapsedMs) / 1000));
        setProctorStatus('warn', `No face detected (${secondsLeft}s)`);

        if (elapsedMs >= FACE_STABILITY_LIMIT_MS) {
            noFaceSince = null;
            window.registerViolation('no-face', 'Eyes or face not detected. Please stay focused.');
        }
    } else {
        noFaceSince = null;
        setProctorStatus('ok', 'Proctoring Active');
    }
}

function stopProctoring() {
    stopFaceDetectionLoop();
    if (proctorStream) {
        proctorStream.getTracks().forEach(t => t.stop());
        proctorStream = null;
    }
}
window.stopProctoring = stopProctoring; // exposed for result.js to call on final submit

// ============================================================
// FULLSCREEN ENFORCEMENT
// ============================================================

function requestFullscreenMode() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (req) req.call(el).catch(() => {});
}

function isInFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
}

function handleFullscreenChange() {
    if (proctoringEnabled && !isInFullscreen() && quizActive() && !violationModalOpen) {
        window.registerViolation('fullscreen-exit', 'You exited fullscreen mode.');
    }
}
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('MSFullscreenChange', handleFullscreenChange);
window.addEventListener('beforeunload', () => { stopProctoring(); });
document.addEventListener('keydown', (e) => {
    if (!quizActive()) return;
    const key = e.key ? e.key.toLowerCase() : '';
    const ctrlOrCmd = e.ctrlKey || e.metaKey;

    const blockedClipboard = ctrlOrCmd && ['c', 'v', 'x', 'a', 'p', 's', 'u'].includes(key);
    const blockedDevTools = (ctrlOrCmd && e.shiftKey && ['i', 'j', 'c'].includes(key)) || key === 'f12';
    const blockedPrintScreen = key === 'printscreen';

    if (blockedClipboard || blockedDevTools || blockedPrintScreen) {
        e.preventDefault();
        e.stopPropagation();
        showAntiCheatAlert('This keyboard shortcut is disabled during the test.', false);
    }
});

if (quizEls.viewLastBtn) {
    quizEls.viewLastBtn.onclick = async () => {
        if (!CURRENT_USER_ID || !currentQuizId) return;

        const originalText = quizEls.viewLastBtn.innerHTML;
        quizEls.viewLastBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';
        quizEls.viewLastBtn.disabled = true;

        try {
            const snapshot = await db.collection('user_results')
                .doc(CURRENT_USER_ID)
                .collection('attempts')
                .where('quizId', '==', currentQuizId)
                .orderBy('timestamp', 'desc')
                .limit(1)
                .get();

            if (snapshot.empty) {
                alert("No previous results found for this quiz.");
                quizEls.viewLastBtn.innerHTML = originalText;
                quizEls.viewLastBtn.disabled = false;
                return;
            }

            const lastAttemptId = snapshot.docs[0].id;
            
            if(quizEls.setupModal) quizEls.setupModal.classList.add('hidden');
            if(quizEls.container) quizEls.container.classList.add('hidden');

            const resBox = document.getElementById('result-box');
            if(resBox) resBox.classList.remove('hidden'); 

            if (typeof loadAttemptDetails === 'function') {
                loadAttemptDetails(lastAttemptId);
            } else {
                console.error("Critical: loadAttemptDetails function not found in result.js");
            }

        } catch (e) {
            console.error("Error redirecting to result:", e);
            alert("Could not load result. Please ensure the Database Index is created.");
        } finally {
            quizEls.viewLastBtn.innerHTML = originalText;
            quizEls.viewLastBtn.disabled = false;
        }
    };
}

let antiCheatMeasuresInstalled = false;
function setupAntiCheatingMeasures() {
    if (antiCheatMeasuresInstalled) return; // avoid stacking duplicate listeners across attempts
    antiCheatMeasuresInstalled = true;

    document.addEventListener('contextmenu', e => { if (quizActive()) e.preventDefault(); });

    document.addEventListener('copy', (e) => {
        if (!quizActive()) return;
        e.preventDefault();
        showAntiCheatAlert("Copying is prohibited!", true);
    });

    document.addEventListener('paste', (e) => {
        if (!quizActive()) return;
        e.preventDefault();
        showAntiCheatAlert("Pasting is prohibited!", true);
    });

    document.addEventListener('cut', (e) => {
        if (!quizActive()) return;
        e.preventDefault();
        showAntiCheatAlert("Cutting is prohibited!", true);
    });

    document.addEventListener('visibilitychange', handleVisibilityChange);

    window.addEventListener('keyup', (e) => {
        if (!quizActive()) return;
        if (e.key === 'PrintScreen') {
            navigator.clipboard.writeText('').catch(() => {});
            showAntiCheatAlert("Screenshots are discouraged.", true);
        }
    });
}

window.openImageZoom = function(src) {
    let modal = document.getElementById('img-zoom-modal');
    
    if (!modal) {
        const modalHtml = `
        <div id="img-zoom-modal" class="fixed inset-0 z-[10000] hidden bg-black/95 backdrop-blur-md flex flex-col items-center justify-center">
            <div class="absolute top-4 right-4 flex gap-3 z-[10001]">
                <button id="z-down" title="Download" class="p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition"><i class="fa-solid fa-download"></i></button>
                
                <button id="z-rotate" title="Rotate" class="p-3 bg-white/10 text-white rounded-full hover:bg-white/20 transition"><i class="fa-solid fa-rotate"></i></button>
                
                <button id="z-in" title="Zoom In" class="p-3 bg-white/10 text-white rounded-full hover:bg-white/20 transition"><i class="fa-solid fa-plus"></i></button>
                <button id="z-out" title="Zoom Out" class="p-3 bg-white/10 text-white rounded-full hover:bg-white/20 transition"><i class="fa-solid fa-minus"></i></button>
                
                <button onclick="closeZoomModal()" class="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition shadow-lg"><i class="fa-solid fa-xmark"></i></button>
            </div>

            <div class="w-full h-full flex items-center justify-center overflow-hidden">
                <img id="img-zoom-target" src="" class="transition-transform duration-200" style="transform: scale(1) rotate(0deg);">
            </div>
        </div>`;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modal = document.getElementById('img-zoom-modal');
        
        let currentScale = 1;
        let currentRotation = 0;

        const update = () => {
            document.getElementById('img-zoom-target').style.transform = `scale(${currentScale}) rotate(${currentRotation}deg)`;
        };

        document.getElementById('z-in').onclick = () => { currentScale += 0.2; update(); };
        document.getElementById('z-out').onclick = () => { if(currentScale > 0.5) currentScale -= 0.2; update(); };

        document.getElementById('z-rotate').onclick = () => { 
            currentRotation += 90; 
            update(); 
        };

        document.getElementById('z-down').onclick = () => {
            const link = document.createElement('a');
            link.href = document.getElementById('img-zoom-target').src;
            link.download = 'quiz-image.jpg';
            link.click();
        };
    }

    const targetImg = document.getElementById('img-zoom-target');
    targetImg.src = src;
    targetImg.style.transform = "scale(1) rotate(0deg)"; 
    modal.classList.remove('hidden');
};

window.closeZoomModal = function() {
    document.getElementById('img-zoom-modal').classList.add('hidden');
};
