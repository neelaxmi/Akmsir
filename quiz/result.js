let currentResultData = null;
let currentQuestionForExplanation = null; 
let explanationCache = {};

const resultEls = {
    resultBox: document.getElementById('result-box'),
    container: document.getElementById('quiz-container'),
    title: document.getElementById('quiz-title'), 
    submit: document.getElementById('final-submit-btn'), 
    resTitle: document.getElementById('res-quiz-title'),
    resScore: document.getElementById('res-score'),
    resAccuracy: document.getElementById('res-accuracy'),
    resAccBar: document.getElementById('res-accuracy-bar'),
    resTime: document.getElementById('res-time'),
    resAvgTime: document.getElementById('res-avg-time'),
    resRank: document.getElementById('res-rank'),
    detailedList: document.getElementById('detailed-list'),
    historyList: document.getElementById('history-list'),
    apiModal: document.getElementById('gemini-api-modal'),
    apiKeyInput: document.getElementById('gemini-api-key-input'),
    saveKeyBtn: document.getElementById('modal-save-gemini-key'),
    cancelKeyBtn: document.getElementById('modal-cancel-gemini-key'),
    apiErrorMsg: document.getElementById('gemini-error-message'), 
    providerSelect: document.getElementById('ai-provider-select'),
    providerDesc: document.getElementById('ai-provider-desc'),
    getKeyLink: document.getElementById('ai-provider-getkey-link'),
};



const markdownToHtml = (markdown) => {
    let html = markdown;
    html = html.replace(/^###\s*(.*)$/gm, '<h4 class="text-lg font-semibold text-primary mt-4 mb-2">$1</h4>');
    html = html.replace(/^##\s*(.*)$/gm, '<h5 class="text-md font-bold mt-3 mb-1">$1</h5>');
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/^\s*\*\s*(.*)$/gm, '<p class="ml-4 flex items-start mt-1 text-sm"><span class="mr-2 text-primary">&bull;</span> $1</p>');
    html = html.replace(/^\s*(\d+)\.\s*(.*)$/gm, '<p class="ml-2 flex items-start mt-1 text-sm"><span class="mr-2 font-bold">$1.</span> $2</p>');
    html = html.replace(/```([\s\S]*?)```/g, function(match, code) {
        return '<pre class="bg-slate-100 dark:bg-slate-800 p-3 rounded-md overflow-x-auto text-xs my-2"><code>' + code.trim() + '</code></pre>';
    });
    html = html.replace(/\n(?!<h|&bull;|[0-9]\.|<pre)/g, '<br>');
    html = html.replace(/(\r\n|\r|\n){2}/g, '</p><p>');
    if (!html.startsWith('<h') && !html.startsWith('<p') && !html.startsWith('<pre')) {
        html = `<p>${html}</p>`;
    }
    return html;
};

// ---------------------------------------------------------------------------
// AI EXPLANATION PROVIDERS
// Two supported providers, so a student isn't stuck if one is down, rate
// limited, or they simply only have a key for the other. Each entry knows
// how to build its own request and pull the answer text back out of very
// different response shapes (Gemini's `candidates[].content.parts[].text`
// vs Grok's OpenAI-style `choices[].message.content`) — nothing outside
// this object needs to know the difference.
// ---------------------------------------------------------------------------
const AI_PROVIDERS = {
    gemini: {
        label: 'Google Gemini',
        keyField: 'geminiApiKey',
        keyPlaceholder: 'Paste your Gemini API Key here (AIza...)',
        getKeyUrl: 'https://aistudio.google.com/app/apikey',
        buildUrl: (key) => `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        buildHeaders: () => ({ 'Content-Type': 'application/json' }),
        buildBody: (prompt) => ({ contents: [{ parts: [{ text: prompt }] }] }),
        extractText: (data) => data.candidates?.[0]?.content?.parts?.[0]?.text,
        extractErrorMessage: (errData) => errData?.error?.message,
        friendlyError: (status, apiMsg) => {
            if (status === 400 && apiMsg && (apiMsg.includes("API key not valid") || apiMsg.includes("Invalid API Key"))) {
                return "Your Gemini API Key is invalid or has expired. Please update it to continue using the AI explanation feature.";
            }
            if (status === 429) return "You have reached the API rate limit for this key. Please try again later, or update your key if you believe this is an error.";
            if (status === 403) return "Access denied (403). Your API key may not have the necessary permissions or the request is blocked. Please check your key status.";
            return "The Gemini API call failed due to an unknown error. Please try again or update your API key.";
        },
    },
    grok: {
        label: 'xAI Grok',
        keyField: 'grokApiKey',
        keyPlaceholder: 'Paste your Grok (xAI) API Key here (xai-...)',
        getKeyUrl: 'https://console.x.ai/',
        buildUrl: () => `https://api.x.ai/v1/chat/completions`,
        buildHeaders: (key) => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` }),
        buildBody: (prompt) => ({ model: 'grok-4-fast', messages: [{ role: 'user', content: prompt }] }),
        extractText: (data) => data.choices?.[0]?.message?.content,
        extractErrorMessage: (errData) => errData?.error?.message,
        friendlyError: (status, apiMsg) => {
            if (status === 401) return "Your Grok API Key is invalid or has expired. Please update it to continue using the AI explanation feature.";
            if (status === 429) return "You have reached the API rate limit for this key. Please try again later, or update your key if you believe this is an error.";
            if (status === 403) return "Access denied (403). Your API key may not have the necessary permissions or the request is blocked. Please check your key status.";
            return "The Grok API call failed due to an unknown error. Please try again or update your API key.";
        },
    },
};

// userGeminiApiKey / userGrokApiKey are loaded from users/{uid} by auth.js.
function getStoredApiKey(providerId) {
    if (providerId === 'gemini') return typeof userGeminiApiKey !== 'undefined' ? userGeminiApiKey : null;
    if (providerId === 'grok') return typeof userGrokApiKey !== 'undefined' ? userGrokApiKey : null;
    return null;
}

// Which provider the modal defaults to — remembered per-browser (not a
// permission or account setting, just a convenience default), and updated
// whenever the student saves a key for a given provider.
function getPreferredProvider() {
    const stored = localStorage.getItem('preferredAiProvider');
    return (stored && AI_PROVIDERS[stored]) ? stored : 'gemini';
}
function setPreferredProvider(providerId) {
    localStorage.setItem('preferredAiProvider', providerId);
}

function populateProviderModal(providerId) {
    const provider = AI_PROVIDERS[providerId] || AI_PROVIDERS.gemini;
    resultEls.providerSelect.value = providerId;
    resultEls.apiKeyInput.placeholder = provider.keyPlaceholder;
    resultEls.apiKeyInput.value = getStoredApiKey(providerId) || '';
    resultEls.providerDesc.innerHTML = `To get detailed explanations for your answers, please enter your personal <strong>${provider.label} API Key</strong>.`;
    resultEls.getKeyLink.href = provider.getKeyUrl;
}

const showGeminiApiModal = (errorMessage = null, questionDetails = null, providerId = null) => {
    const provider = providerId || getPreferredProvider();
    resultEls.apiModal.classList.remove('hidden');
    populateProviderModal(provider);
    currentQuestionForExplanation = questionDetails || currentQuestionForExplanation;
    
    if (errorMessage) {
        resultEls.apiErrorMsg.textContent = errorMessage;
        resultEls.apiErrorMsg.classList.remove('hidden');
    } else {
        resultEls.apiErrorMsg.classList.add('hidden');
    }

    resultEls.providerSelect.onchange = () => populateProviderModal(resultEls.providerSelect.value);
    
    resultEls.saveKeyBtn.onclick = () => {
        const key = resultEls.apiKeyInput.value.trim();
        const selectedProvider = resultEls.providerSelect.value;
        if (key) {
            saveUserApiKey(key, selectedProvider);
        } else {
            alert("Please enter a valid API key.");
        }
    };
    
    resultEls.cancelKeyBtn.onclick = () => {
        resultEls.apiModal.classList.add('hidden');
        resultEls.apiErrorMsg.classList.add('hidden'); 
        currentQuestionForExplanation = null;
    };
};


const saveUserApiKey = async (key, providerId = 'gemini') => {
    if (!CURRENT_USER_ID) return console.error("❌ Error (Result.js): User ID not available to save API key.");
    const provider = AI_PROVIDERS[providerId] || AI_PROVIDERS.gemini;
    try {
        await db.collection('users').doc(CURRENT_USER_ID).set({
            [provider.keyField]: key,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        if (providerId === 'gemini') userGeminiApiKey = key;
        else if (providerId === 'grok') userGrokApiKey = key;
        setPreferredProvider(providerId);

        alert(`${provider.label} API Key saved successfully! You can now get explanations.`);
        resultEls.apiModal.classList.add('hidden');
        // Clear error message on success
        resultEls.apiErrorMsg.classList.add('hidden');
        
        console.log(`✅ Success (Result.js): New ${provider.label} API Key saved to Firestore.`);
        
        if (currentQuestionForExplanation) {
            console.log("Info (Result.js): Attempting to fetch explanation after successful key save.");
            const details = currentQuestionForExplanation;
            currentQuestionForExplanation = null; 
            fetchExplanation(details, false); 
        }
    } catch (e) {
        console.error("❌ Error (Result.js): Failed to save API key to Firestore.", e);
        alert("Failed to save API key. Please check Firebase permissions.");
    }
};

const showApiKeyModal = (questionDetails) => {
    showGeminiApiModal("Please enter your API Key to use the AI explanation feature.", questionDetails);
};



const toggleExplanation = (explanationId, qId) => {
    const contentDiv = document.getElementById(explanationId);
    const toggleIcon = document.getElementById(`toggle-icon-${qId}`);
    const toggleText = document.getElementById(`toggle-text-${qId}`);
    const regenerateBtn = document.getElementById(`regenerate-btn-${qId}`);
    
    const ans = currentResultData.answers.find(a => a.qId === qId);
    const cachedHtml = ans?.generatedExplanation || explanationCache[qId];

    if (contentDiv.classList.contains('hidden')) {
        contentDiv.classList.remove('hidden');
        toggleIcon.className = 'fa-solid fa-chevron-up mr-2';
        toggleText.textContent = 'Minimize Explanation';
        if (regenerateBtn) regenerateBtn.classList.remove('hidden');
        if (!cachedHtml) {
            if (ans) {
                const questionDetails = {
                    qId: ans.qId,
                    qText: ans.qText,
                    userAnswer: ans.userAnswer || '',
                    correctAnswer: ans.correctAnswer,
                    explanationId: explanationId
                };
                fetchExplanation(questionDetails, false); 
            }
        }
    } else {
        contentDiv.classList.add('hidden');
        
        if (cachedHtml || contentDiv.children.length > 0) {
            toggleIcon.className = 'fa-solid fa-robot mr-2';
            toggleText.textContent = 'Show AI Explanation';
        }
        if (regenerateBtn) regenerateBtn.classList.add('hidden');
    }
};

// --- AI EXPLANATION LOGIC (per-session cache -> shared community cache -> API) ---

// Deterministic doc id from quiz + question, so every user/session that
// opens the exact same question lands on the exact same shared-cache doc.
// `currentQuizId` is always the REAL quiz doc id by this point (quiz.js
// resolves any custom-alias link before this runs), so this stays stable
// regardless of which link a student used to get here.
function sharedExplanationDocId(qId) {
    return `${currentQuizId}_${qId}`;
}

// --- EXPLANATION FEEDBACK (👍 / 👎) ---
// Feeds the admin panel's "regenerate flagged explanations" queue (see
// ai-autosolve.js AUTO_SOLVE_CONFIG.REGEN_MIN_DOWNVOTES — duplicated here
// since the admin panel and this student app are separate bundles that
// don't share code; keep the two values in sync if you tune it).
const REGEN_MIN_DOWNVOTES = 3;

function getVotedExplanations() {
    try { return JSON.parse(localStorage.getItem('explanationVotes') || '{}'); } catch (e) { return {}; }
}
function setVotedExplanation(docId, vote) {
    const votes = getVotedExplanations();
    votes[docId] = vote;
    localStorage.setItem('explanationVotes', JSON.stringify(votes));
}

function feedbackButtonsHtml(docId) {
    const voted = getVotedExplanations()[docId];
    return `
        <div class="flex items-center gap-3 mt-3 pt-3 border-t border-slate-200 dark:border-slate-600" data-feedback-wrap="${docId}">
            <span class="text-xs text-slate-400">Was this explanation helpful?</span>
            <button type="button" class="text-base transition ${voted === 'up' ? 'opacity-100 scale-110' : 'opacity-40 hover:opacity-100'}" data-feedback-btn="up" data-doc-id="${docId}" ${voted ? 'disabled' : ''} aria-label="Helpful">👍</button>
            <button type="button" class="text-base transition ${voted === 'down' ? 'opacity-100 scale-110' : 'opacity-40 hover:opacity-100'}" data-feedback-btn="down" data-doc-id="${docId}" ${voted ? 'disabled' : ''} aria-label="Not helpful">👎</button>
            <span class="text-xs text-slate-400 feedback-thanks ${voted ? '' : 'hidden'}">Thanks for the feedback!</span>
        </div>
    `;
}

// Binds every feedback button via ONE delegated listener rather than
// re-binding after each of the three separate innerHTML render paths
// (cached, freshly-generated, and the initial detailed-question-card
// render) — simpler and can't accidentally miss a spot.
document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-feedback-btn]');
    if (!btn || btn.disabled) return;
    submitExplanationFeedback(btn.dataset.docId, btn.dataset.feedbackBtn, btn.closest('[data-feedback-wrap]'));
});

// One vote per explanation per browser (tracked in localStorage — no
// backend to enforce this more strictly, but it's enough to stop obvious
// accidental repeat-clicks). Uses a transaction so concurrent votes from
// different students never clobber each other, and flags the explanation
// for the admin's regeneration queue once downvotes clearly outweigh
// upvotes past a small threshold (a couple of stray votes shouldn't be
// enough on their own).
async function submitExplanationFeedback(docId, vote, container) {
    if (getVotedExplanations()[docId]) return; // already voted this browser, ignore
    setVotedExplanation(docId, vote); // optimistic — also prevents a rapid double-click race

    // Reflect the vote immediately without waiting on the network.
    if (container) {
        container.querySelectorAll('[data-feedback-btn]').forEach(b => {
            b.disabled = true;
            b.classList.toggle('opacity-100', b.dataset.feedbackBtn === vote);
            b.classList.toggle('scale-110', b.dataset.feedbackBtn === vote);
            b.classList.toggle('opacity-40', b.dataset.feedbackBtn !== vote);
        });
        const thanks = container.querySelector('.feedback-thanks');
        if (thanks) thanks.classList.remove('hidden');
    }

    try {
        const ref = db.collection('quiz_explanations').doc(docId);
        await db.runTransaction(async (tx) => {
            const doc = await tx.get(ref);
            if (!doc.exists) return;
            const data = doc.data();
            const feedback = data.feedback || { up: 0, down: 0 };
            const updated = {
                up: (feedback.up || 0) + (vote === 'up' ? 1 : 0),
                down: (feedback.down || 0) + (vote === 'down' ? 1 : 0),
            };
            const needsRegeneration = updated.down >= REGEN_MIN_DOWNVOTES && updated.down > updated.up;
            tx.update(ref, { feedback: updated, needsRegeneration });
        });
        console.log(`✅ Success (Result.js): Feedback (${vote}) recorded for ${docId}.`);
    } catch (e) {
        console.error("❌ Error (Result.js): Failed to submit explanation feedback.", e);
    }
}

const fetchExplanation = async (questionDetails, isRegenerate = false) => {
    const { qId, qText, userAnswer, correctAnswer, explanationId } = questionDetails;
    
    const explanationElement = document.getElementById(explanationId);
    const ans = currentResultData.answers.find(a => a.qId === qId);

    // 1. Per-session cache — already fetched once this page load, zero cost.
    let cachedHtml = ans?.generatedExplanation || explanationCache[qId];

    // 2. Shared COMMUNITY cache in Firestore — the big win: if ANY other
    // student already generated this exact question's explanation, use it
    // straight away. No API key needed, no API call made, nobody's rate
    // limit touched at all.
    if (!cachedHtml && !isRegenerate) {
        try {
            const sharedDoc = await db.collection('quiz_explanations').doc(sharedExplanationDocId(qId)).get();
            if (sharedDoc.exists && sharedDoc.data().explanationHtml) {
                cachedHtml = sharedDoc.data().explanationHtml;
                if (ans) ans.generatedExplanation = cachedHtml;
                explanationCache[qId] = cachedHtml;
                console.log("Info (Result.js): Explanation found in the SHARED community cache — no API call needed.");
            }
        } catch (e) {
            console.warn("⚠️ Warning (Result.js): Shared explanation cache lookup failed — will fall back to generating.", e);
        }
    }

    if (cachedHtml && !isRegenerate) {
        console.log("Info (Result.js): Rendering cached explanation.");
        
        explanationElement.innerHTML = `
            <div class="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                <h4 class="font-bold text-primary mb-2">Detailed Explanation:</h4>
                <div class="text-sm text-slate-700 dark:text-slate-300">
                    ${cachedHtml}
                </div>
                ${feedbackButtonsHtml(sharedExplanationDocId(qId))}
            </div>
        `;
        renderMath(explanationElement);
        explanationElement.classList.remove('hidden');
        document.getElementById(`toggle-icon-${qId}`).className = 'fa-solid fa-chevron-up mr-2';
        document.getElementById(`toggle-text-${qId}`).textContent = 'Minimize Explanation';
        document.getElementById(`regenerate-btn-${qId}`)?.classList.remove('hidden');
        return;
    }

    // 3. Nothing cached anywhere (or explicitly regenerating) — need an API
    // key for whichever provider the student has configured/prefers.
    const providerId = getPreferredProvider();
    const apiKey = getStoredApiKey(providerId);

    if (!apiKey) {
        explanationElement.classList.remove('hidden'); 
        showApiKeyModal(questionDetails);
        return; 
    }

    explanationElement.innerHTML = `<p class="text-center py-2 text-primary font-medium"><i class="fa-solid fa-spinner fa-spin mr-2"></i> Generating explanation...</p>`;

    const originalQuestion = questions.find(q => q.id === qId) || {};
    const userAns = originalQuestion.options ? originalQuestion.options[userAnswer] : userAnswer || 'Skipped';
    const correctAns = originalQuestion.options ? originalQuestion.options[correctAnswer] : correctAnswer;
    
    const prompt = `
        You are a helpful and detailed quiz explanation generator.
        Context: The user is reviewing a quiz question.
        
        Question: "${qText}"
        Correct Answer: "${correctAns}"
        User's Answer: "${userAns}"
        
        Task: Provide a concise, educational, and easy-to-understand explanation for this question. 
        If the user was incorrect or skipped, first explain WHY the correct answer is right, and then briefly explain why the user's selected answer (if any) was incorrect. 
        If the user was correct, confirm their answer and provide deeper context or supplementary facts related to the topic.
        Format the response using simple Markdown (like **bold**, ### headings, * bullet points, and code blocks using three backticks).
    `;

    const provider = AI_PROVIDERS[providerId];
    
    try {
        const response = await fetch(provider.buildUrl(apiKey), {
            method: 'POST',
            headers: provider.buildHeaders(apiKey),
            body: JSON.stringify(provider.buildBody(prompt)),
        });

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch {
                errorData = {};
            }
            
            const apiErrorMsg = provider.extractErrorMessage(errorData);
            const errorMessage = provider.friendlyError(response.status, apiErrorMsg);
            
            showGeminiApiModal(errorMessage, questionDetails, providerId);
            throw new Error(`${provider.label} API Error (Status: ${response.status}): ${errorMessage}`);
        }

        const data = await response.json();
        const explanationText = provider.extractText(data) || "Sorry, I couldn't generate an explanation. Check your API key and usage limits.";
        
        console.log(`✅ Success (Result.js): Fetched explanation from ${provider.label} for question:`, qId);

        const formattedHtml = markdownToHtml(explanationText);
        
        if (ans) {
             ans.generatedExplanation = formattedHtml; 
        }
        explanationCache[qId] = formattedHtml; 

        // Save to the SHARED community cache — this is the actual API-limit
        // saving: the NEXT student (or this one, on a future visit/device)
        // who opens this exact question gets it from Firestore, not the AI
        // API. Non-fatal if it fails — this user's own explanation still
        // rendered either way.
        try {
            // merge: true — never clobber subject/topic/difficulty tags the
            // admin's auto-solve engine may have already set on this doc.
            // feedback/needsRegeneration ARE intentionally reset: this is a
            // brand-new explanation (first generation, or a regenerate), so
            // old votes against the previous text shouldn't carry over.
            await db.collection('quiz_explanations').doc(sharedExplanationDocId(qId)).set({
                quizId: currentQuizId,
                qId,
                explanationHtml: formattedHtml,
                provider: providerId,
                generatedBy: CURRENT_USER_ID || null,
                feedback: { up: 0, down: 0 },
                needsRegeneration: false,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            console.log("✅ Success (Result.js): Explanation saved to the shared community cache.");
        } catch (e) {
            console.warn("⚠️ Warning (Result.js): Could not save explanation to the shared cache (it still rendered for you).", e);
        }

        // A regenerate should also let this browser vote again, since it's
        // effectively a new explanation.
        if (isRegenerate) {
            const votes = getVotedExplanations();
            delete votes[sharedExplanationDocId(qId)];
            localStorage.setItem('explanationVotes', JSON.stringify(votes));
        }

        // Render the explanation text
        explanationElement.innerHTML = `
            <div class="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                <h4 class="font-bold text-primary mb-2">Detailed Explanation:</h4>
                <div class="text-sm text-slate-700 dark:text-slate-300">
                    ${formattedHtml}
                </div>
                ${feedbackButtonsHtml(sharedExplanationDocId(qId))}
            </div>
        `;
        renderMath(explanationElement);
        
        const safeQText = qText.replace(/`/g, '\\`').replace(/'/g, '\\\'').replace(/"/g, '&quot;');
        const btnContainer = document.getElementById(`toggle-btn-${qId}`).parentNode;

        document.getElementById(`toggle-icon-${qId}`).className = 'fa-solid fa-chevron-up mr-2';
        document.getElementById(`toggle-text-${qId}`).textContent = 'Minimize Explanation';
        explanationElement.classList.remove('hidden');
        
        if (!document.getElementById(`regenerate-btn-${qId}`)) {
             const regenerateHtml = `<button id="regenerate-btn-${qId}" class="text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
                onclick='fetchExplanation({
                    qId: "${ans.qId}", 
                    qText: "${safeQText}", 
                    userAnswer: "${ans.userAnswer || ''}", 
                    correctAnswer: "${ans.correctAnswer}", 
                    explanationId: "${explanationId}"
                }, true)'>
                <i class="fa-solid fa-arrows-rotate mr-1"></i> Regenerate
            </button>`;
            btnContainer.insertAdjacentHTML('beforeend', regenerateHtml);
        }
        document.getElementById(`regenerate-btn-${qId}`).classList.remove('hidden');


    } catch (error) {
        console.error(`❌ Error (Result.js): ${provider.label} API Call Failed.`, error);
        
        if (!error.message.includes('API Error')) {
            explanationElement.innerHTML = `
                <p class="text-red-500 mt-4"><i class="fa-solid fa-triangle-exclamation mr-2"></i> Network or client error generating explanation. Try again.</p>
            `;
        } else {
             explanationElement.innerHTML = `
                <p class="text-red-500 mt-4"><i class="fa-solid fa-triangle-exclamation mr-2"></i> ${error.message.split('- ')[1] || error.message}</p>
            `;
        }

        document.getElementById(`toggle-icon-${qId}`).className = 'fa-solid fa-robot mr-2';
        document.getElementById(`toggle-text-${qId}`).textContent = 'Get AI Explanation';
        document.getElementById(`regenerate-btn-${qId}`)?.classList.add('hidden');
    }
};

// --- SUBMISSION & RANK CALCULATION ---

const calculateRank = (score, total) => {
    const percentage = (score / total) * 100;
    if (percentage >= 90) return "Top 5%";
    if (percentage >= 80) return "Top 10%";
    if (percentage >= 60) return "Top 25%";
    if (percentage >= 40) return "Top 50%";
    return "Top 80%";
};

const submitQuiz = async (isTimeout = false) => {
    clearInterval(timerInterval); 
    resultEls.submit.disabled = true;
    resultEls.submit.innerHTML = '<span class="loader w-4 h-4 border-2 mr-2 inline-block"></span> Processing...';

    // Release the camera and stop the local face-detection loop — proctoring
    // is only needed while the quiz itself is active.
    if (typeof window.stopProctoring === 'function') window.stopProctoring();
    const proctorViolationCount = (typeof violationCount !== 'undefined') ? violationCount : 0;
    const proctorViolationLog = (typeof violationLog !== 'undefined') ? violationLog : [];
    const autoSubmittedForViolations = proctorViolationCount > 3;

    let score = 0;
    let wrongCount = 0;
    const detailed = questions.map(q => {
        const u = userAnswers[q.id];
        const isCorrect = u === q.answer;
        if(isCorrect) score++;
        else if (u !== null && u !== undefined) wrongCount++; // answered but wrong (skipped = neither)
        const timeSpent = 20;
        return { qId: q.id, qText: q.question, imageUrl: q.imageUrl || null, userAnswer: u||null, correctAnswer: q.answer, isCorrect, timeSpent };
    });
    const skippedCount = Math.max(0, questions.length - score - wrongCount);

    // BUGFIX: this used to read `questions[0].durationMinutes` — a field
    // that never actually existed on question objects (durationMinutes is
    // set once on the top-level quiz document, not per question), so this
    // silently fell back to `questions.length * 60` (a flat 1-minute-per-
    // question guess) on every single submit. That guess rarely matched the
    // quiz's real timer, which is why "Total Time" often looked wrong /
    // clamped to 00:00. Now reads quizStartDurationSeconds — the actual
    // starting duration captured in quiz.js when the attempt began.
    const totalQuizDuration = quizStartDurationSeconds > 0 ? quizStartDurationSeconds : (questions.length * 60);
    const totalTimeSpent = totalQuizDuration - timeLeft; 
    const formattedTime = formatTime(totalTimeSpent > 0 ? totalTimeSpent : 0);
    
    const resultData = {
        quizId: currentQuizId,
        quizTitle: resultEls.title.textContent,
        score, total: questions.length,
        // Added for the NEET-style result dashboard (see scoring.js /
        // renderNeetDashboard). `score`/`total` above are untouched so
        // nothing that already reads them breaks.
        wrong: wrongCount,
        skipped: skippedCount,
        answers: detailed,
        status: autoSubmittedForViolations ? 'Auto-Submitted (Proctoring Violation)' : (isTimeout ? 'Timed Out' : 'Completed'),
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
        timeTaken: formattedTime,
        totalTimeSeconds: totalTimeSpent,
        rank: calculateRank(score, questions.length),
        proctoring: {
            violationCount: proctorViolationCount,
            autoSubmitted: autoSubmittedForViolations,
            log: proctorViolationLog
        }
    };

    try {
        // 1. Save Result
        await db.collection('user_results').doc(CURRENT_USER_ID).collection('attempts').add(resultData);
        console.log("✅ Success (Result.js): Quiz result saved successfully.");
        
        // 2. Clear Progress
        const progRef = db.collection('user_progress').doc(CURRENT_USER_ID).collection('saved_quizzes').doc(currentQuizId);
        const progDoc = await progRef.get();
        if(progDoc.exists) await progRef.delete(); 

        // 2b. Clear locally-persisted proctoring violation state for this attempt
        try { sessionStorage.removeItem('quiz_violations_' + (currentQuizId || 'session')); } catch(e) {}
        
        // 3. Render
        renderFinalResult(resultData);
        window.onpopstate = null; 

    } catch(e) {
        console.error("❌ Error (Result.js): Error submitting quiz result to Firebase.", e);
        alert("Error submitting. Please check connection and Firebase permissions.");
        resultEls.submit.disabled = false;
        resultEls.submit.innerHTML = 'Submit Quiz';
    }
};

// --- RESULT VIEW & TABS ---

function updateSummaryData(data) {
    resultEls.resTitle.textContent = data.quizTitle;

    // --- NEET-style dashboard normalization (computed first so the legacy
    // "Total Score" card below can use its marksScore/maxMarks too) ---
    // Newer attempts (see submitQuiz) already store explicit wrong/skipped
    // counts. Older stored attempts only have score/total/answers, so derive
    // wrong/skipped from the per-question `answers` array when they're
    // missing, instead of guessing.
    let wrong = typeof data.wrong === 'number' ? data.wrong : undefined;
    let skipped = typeof data.skipped === 'number' ? data.skipped : undefined;
    if ((wrong === undefined || skipped === undefined) && Array.isArray(data.answers)) {
        wrong = data.answers.filter(a => !a.isCorrect && a.userAnswer !== null && a.userAnswer !== undefined).length;
        skipped = data.answers.filter(a => a.userAnswer === null || a.userAnswer === undefined).length;
    }

    const avg = data.total > 0 ? Math.round(data.totalTimeSeconds / data.total) : 0;

    const normalized = normalizeResult({
        total: data.total,
        correct: data.score,
        wrong, skipped,
        averageTime: avg,
        quizTitle: data.quizTitle,
        date: data.timestamp || null,
    });

    // --- Original "Total Score" card — UPGRADED from a plain correct-count
    // to the classic NEET marking scheme (+4 correct / -1 wrong / 0
    // unattempted), max = total questions × 4 (see MARKING_SCHEME in
    // scoring.js). Everything else on this card/row is unchanged. ---
    resultEls.resScore.textContent = `${normalized.marksScore} / ${normalized.maxMarks}`;
    resultEls.resScore.classList.toggle('text-red-600', normalized.marksScore < 0);
    resultEls.resScore.classList.toggle('dark:text-red-500', normalized.marksScore < 0);
    resultEls.resScore.classList.toggle('text-brand-600', normalized.marksScore >= 0);
    resultEls.resScore.classList.toggle('dark:text-brand-500', normalized.marksScore >= 0);

    const pct = data.total > 0 ? Math.round((data.score / data.total) * 100) : 0;
    resultEls.resAccuracy.textContent = `${pct}%`;
    resultEls.resAccBar.style.width = `${pct}%`;
    resultEls.resTime.textContent = data.timeTaken;
    resultEls.resRank.textContent = data.rank || "Top 50%";
    resultEls.resAvgTime.textContent = `${avg}s`;

    // --- NEET-style dashboard (added) ---
    renderNeetDashboard(normalized);
}

// ---------------------------------------------------------------------------
// NEET-style dashboard rendering (added). All calculation lives in
// scoring.js — this only reads a pre-normalized `result` object and paints
// the DOM, so the formula/rank table can be swapped later with zero changes
// here.
// ---------------------------------------------------------------------------
function standingBadgeClasses(standing) {
    if (standing === 'Needs Improvement') return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400';
    if (standing === 'Good') return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400';
    return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400';
}

function standingColor(standing) {
    if (standing === 'Needs Improvement') return '#ef4444';
    if (standing === 'Good') return '#f59e0b';
    return '#10b981';
}

function renderQuestionDonut(result) {
    const donut = document.getElementById('neet-donut');
    if (!donut) return;
    const total = result.totalPolls || 0;
    if (total <= 0) {
        donut.style.background = '#e2e8f0';
        return;
    }
    const correctPct = (result.correct / total) * 100;
    const wrongPct = (result.wrong / total) * 100;
    const c1 = correctPct;
    const c2 = c1 + wrongPct;
    donut.style.background = `conic-gradient(#10b981 0% ${c1}%, #ef4444 ${c1}% ${c2}%, #cbd5e1 ${c2}% 100%)`;
}

function renderNeetDashboard(result) {
    if (!document.getElementById('neet-score')) return; // markup not present — nothing to do
    const { totalPolls: total, correct, wrong, skipped, accuracy, attemptAccuracy, syntheticScore, standing, predictedRank } = result;

    // Score hero
    document.getElementById('neet-score').textContent = syntheticScore;
    const badge = document.getElementById('neet-standing-badge');
    badge.textContent = standing;
    badge.className = 'inline-block px-4 py-1.5 rounded-full text-sm font-bold mb-4 ' + standingBadgeClasses(standing);
    document.getElementById('neet-rank').textContent = predictedRank;

    document.getElementById('neet-accuracy').textContent = `${Math.round(accuracy * 100)}%`;
    document.getElementById('neet-correct').textContent = correct;
    document.getElementById('neet-wrong').textContent = wrong;
    document.getElementById('neet-skipped').textContent = skipped;

    // Score scale marker — position along the 0-720 scale
    const markerPct = Math.max(0, Math.min(100, (syntheticScore / 720) * 100));
    document.getElementById('neet-score-marker').style.left = `${markerPct}%`;

    // Question performance donut
    renderQuestionDonut(result);
    document.getElementById('neet-donut-total').textContent = total;
    document.getElementById('neet-donut-correct').textContent = correct;
    document.getElementById('neet-donut-wrong').textContent = wrong;
    document.getElementById('neet-donut-skipped').textContent = skipped;

    // Accuracy analysis
    document.getElementById('neet-acc-overall').textContent = `${Math.round(accuracy * 100)}%`;
    document.getElementById('neet-acc-attempted').textContent = `${correct + wrong} / ${total}`;
    document.getElementById('neet-acc-attempt').textContent = `${Math.round(attemptAccuracy * 100)}%`;

    // Performance summary + improvement suggestions
    document.getElementById('neet-summary-text').textContent = generatePerformanceSummary(standing);
    const list = document.getElementById('neet-suggestions-list');
    list.innerHTML = '';
    generateImprovementSuggestions(result).forEach(s => {
        const li = document.createElement('li');
        li.textContent = s;
        list.appendChild(li);
    });

    // Historical performance for this quiz (separate async fetch, doesn't
    // block the rest of the dashboard from rendering immediately)
    renderHistoricalPerformance();

    // Practice-mistakes / practice-unattempted buttons
    setupPracticeButtons(currentResultData);
}

// Derives wrong/unattempted question ids from the per-question `answers`
// array (same approach dashboard.html already uses for its own "Practice
// Incorrect" button — kept consistent rather than inventing a second way).
function getWrongQuestionIds(attemptData) {
    if (!attemptData || !Array.isArray(attemptData.answers)) return [];
    return attemptData.answers.filter(a => !a.isCorrect && a.userAnswer !== null && a.userAnswer !== undefined).map(a => a.qId);
}
function getUnattemptedQuestionIds(attemptData) {
    if (!attemptData || !Array.isArray(attemptData.answers)) return [];
    return attemptData.answers.filter(a => a.userAnswer === null || a.userAnswer === undefined).map(a => a.qId);
}

// Same sessionStorage + URL-param handoff dashboard.html's "Practice
// Incorrect" button already uses — quiz.js's loadQuiz() reads it on the
// other end and filters the question set. `mode` distinguishes wrong vs
// unattempted so quiz.js can label the practice session correctly.
function startPracticeSession(mode, quizId, quizTitle, questionIds) {
    if (!questionIds.length) return;
    sessionStorage.setItem('retryQuizConfig', JSON.stringify({ mode, quizId: quizId || null, quizTitle: quizTitle || '', questionIds }));
    const params = new URLSearchParams({ mode });
    if (quizId) params.set('uid', quizId);
    window.location.href = `/quiz/quizzes.html?${params.toString()}`;
}

function setupPracticeButtons(attemptData) {
    const wrongBtn = document.getElementById('btn-practice-wrong');
    const unattemptedBtn = document.getElementById('btn-practice-unattempted');
    if (!wrongBtn || !unattemptedBtn || !attemptData) return;

    const wrongIds = getWrongQuestionIds(attemptData);
    const unattemptedIds = getUnattemptedQuestionIds(attemptData);

    wrongBtn.classList.toggle('hidden', wrongIds.length === 0);
    document.getElementById('btn-practice-wrong-count').textContent = wrongIds.length;
    wrongBtn.onclick = () => startPracticeSession('retry-incorrect', attemptData.quizId, attemptData.quizTitle, wrongIds);

    unattemptedBtn.classList.toggle('hidden', unattemptedIds.length === 0);
    document.getElementById('btn-practice-unattempted-count').textContent = unattemptedIds.length;
    unattemptedBtn.onclick = () => startPracticeSession('retry-unattempted', attemptData.quizId, attemptData.quizTitle, unattemptedIds);
}

// Reuses the same `user_results/{uid}/attempts` collection fetchHistory()
// already queries for the Attempt History tab — no new storage added, per
// spec section 10 ("reuse that data ... if historical data does NOT already
// exist, do not invent it").
async function renderHistoricalPerformance() {
    const wrap = document.getElementById('neet-history-wrap');
    if (!wrap) return;

    try {
        const snapshot = await db.collection('user_results').doc(CURRENT_USER_ID).collection('attempts')
            .where('quizId', '==', currentQuizId)
            .get();

        if (snapshot.empty || snapshot.size < 2) {
            // Nothing to trend yet with 0-1 attempts — keep it hidden rather
            // than showing an empty/pointless chart.
            wrap.classList.add('hidden');
            return;
        }

        let attempts = [];
        snapshot.forEach(doc => attempts.push({ id: doc.id, ...doc.data() }));
        attempts.sort((a, b) => {
            const tA = a.timestamp ? a.timestamp.seconds : 0;
            const tB = b.timestamp ? b.timestamp.seconds : 0;
            return tA - tB; // oldest -> newest, left-to-right trend
        });

        const historyResults = attempts.map(a => {
            let wrong = typeof a.wrong === 'number' ? a.wrong : undefined;
            let skipped = typeof a.skipped === 'number' ? a.skipped : undefined;
            if ((wrong === undefined || skipped === undefined) && Array.isArray(a.answers)) {
                wrong = a.answers.filter(x => !x.isCorrect && x.userAnswer !== null && x.userAnswer !== undefined).length;
                skipped = a.answers.filter(x => x.userAnswer === null || x.userAnswer === undefined).length;
            }
            return normalizeResult({ total: a.total, correct: a.score, wrong, skipped });
        });

        const stats = calculateHistoricalStats(historyResults);
        document.getElementById('neet-hist-avg').textContent = stats.averageScore;
        document.getElementById('neet-hist-best').textContent = stats.bestScore;
        document.getElementById('neet-hist-low').textContent = stats.lowestScore;
        document.getElementById('neet-hist-avgacc').textContent = `${stats.averageAccuracy}%`;
        document.getElementById('neet-hist-count').textContent = stats.totalQuizzes;

        const barsWrap = document.getElementById('neet-hist-bars');
        barsWrap.innerHTML = '';
        historyResults.forEach((r, i) => {
            const barHeightPct = Math.max(6, Math.round((r.syntheticScore / 720) * 100));
            const bar = document.createElement('div');
            bar.className = 'flex flex-col items-center justify-end gap-1 flex-1 min-w-0 h-full';
            bar.innerHTML = `
                <span class="text-[10px] font-semibold text-slate-500 dark:text-slate-400">${r.syntheticScore}</span>
                <div class="w-full max-w-[28px] rounded-t-md" style="height:${barHeightPct}%; background:${standingColor(r.standing)};"></div>
                <span class="text-[10px] text-slate-400">#${i + 1}</span>
            `;
            barsWrap.appendChild(bar);
        });

        wrap.classList.remove('hidden');
    } catch (e) {
        console.error('❌ Error (Result.js): Failed to load historical performance.', e);
        wrap.classList.add('hidden');
    }
}

// Info-tooltip toggles for the synthetic score / predicted rank explainers.
// Kept visually unobtrusive (hidden by default, toggled on tap) per spec.
if (document.getElementById('neet-score-info-btn')) {
    document.getElementById('neet-score-info-btn').onclick = () => document.getElementById('neet-score-tooltip').classList.toggle('hidden');
}
if (document.getElementById('neet-rank-info-btn')) {
    document.getElementById('neet-rank-info-btn').onclick = () => document.getElementById('neet-rank-tooltip').classList.toggle('hidden');
}

function renderFinalResult(data) {
    currentResultData = data;
    explanationCache = {};
    resultEls.container.classList.add('hidden');
    resultEls.resultBox.classList.remove('hidden');

    updateSummaryData(data);
    filterResults('all'); 
    fetchHistory(); 
}

function switchTab(tab) {
    ['summary', 'detailed', 'history', 'video'].forEach(t => { // Added 'video'
        const btn = document.getElementById(`tab-${t}`);
        const view = document.getElementById(`view-${t}`);
        if (btn && view) {
            if (t === tab) {
                btn.className = "tab-active whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center";
                view.classList.remove('hidden');
                
                // Trigger video load only when tab is clicked
                if (tab === 'video' && typeof loadVideoSolution === 'function') {
                    // Pass the currentQuizId which is global in auth.js/result.js context
                    loadVideoSolution(currentQuizId); 
                }
            } else {
                btn.className = "tab-inactive whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center";
                view.classList.add('hidden');
            }
        }
    });

    if (tab === 'detailed') renderMath(resultEls.detailedList);
}

// Set up tab listeners once
if (document.getElementById('tab-summary')) document.getElementById('tab-summary').onclick = () => switchTab('summary');
if (document.getElementById('tab-detailed')) document.getElementById('tab-detailed').onclick = () => switchTab('detailed');
if (document.getElementById('tab-history')) document.getElementById('tab-history').onclick = () => switchTab('history');
if (document.getElementById('tab-video')) document.getElementById('tab-video').onclick = () => switchTab('video');


function filterResults(type) {
    if(!currentResultData) return;
    
    // Update filter buttons
    ['all','correct','incorrect'].forEach(f => {
        const btn = document.getElementById(`filter-${f}`);
        if(btn) { 
            if(f === type) btn.className = "px-4 py-2 rounded-lg text-sm font-medium bg-slate-800 text-white shadow-sm transition";
            else btn.className = "px-4 py-2 rounded-lg text-sm font-medium bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-50";
            btn.onclick = () => filterResults(f);
        }
    });

    resultEls.detailedList.innerHTML = '';
    
    const filtered = currentResultData.answers.filter(a => {
        if(type === 'correct') return a.isCorrect;
        if(type === 'incorrect') return !a.isCorrect;
        return true;
    });

    if(filtered.length === 0) {
        resultEls.detailedList.innerHTML = `<p class="text-center text-gray-500 py-8">No questions match this filter.</p>`;
        return;
    }
    
    filtered.forEach((ans, idx) => {
        // 1. Prepare Status Variables
        const status = ans.isCorrect ? 'Correct' : 'Incorrect';
        const colorClass = ans.isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
        const borderClass = ans.isCorrect ? 'border-l-4 border-green-500' : 'border-l-4 border-red-500';
        const icon = ans.isCorrect ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-xmark"></i>';
        
        // 2. Retrieve Original Question Data & Safe Text for JS
        const originalQuestion = questions.find(q => q.id === ans.qId) || {};
        const explanationId = `explanation-for-${ans.qId}`;
        const userAnswerText = ans.userAnswer ? (originalQuestion.options ? originalQuestion.options[ans.userAnswer] : ans.userAnswer) : 'Skipped';
        const correctAnswerText = originalQuestion.options ? originalQuestion.options[ans.correctAnswer] : ans.correctAnswer;
        
        // Escape special characters for the Regenerate button's onclick handler
        const safeQText = ans.qText.replace(/`/g, '\\`').replace(/'/g, '\\\'').replace(/"/g, '&quot;');

        // 3. Prepare Explanation State
        const cachedExplanationHtml = ans.generatedExplanation || explanationCache[ans.qId];
        const isGenerated = !!cachedExplanationHtml;
        const explanationVisibleClass = isGenerated ? '' : 'hidden'; 
        const toggleButtonIcon = isGenerated ? 'fa-solid fa-chevron-up' : 'fa-solid fa-robot';
        const toggleButtonText = isGenerated ? 'Minimize Explanation' : 'Get AI Explanation';

        const initialExplanationContent = cachedExplanationHtml ? `
            <div class="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                <h4 class="font-bold text-primary mb-2">Detailed Explanation:</h4>
                <div class="text-sm text-slate-700 dark:text-slate-300">
                    ${cachedExplanationHtml}
                </div>
                ${feedbackButtonsHtml(sharedExplanationDocId(ans.qId))}
            </div>
        ` : '';

        // 4. Generate Image HTML (New Logic)
        let imageHtml = '';
        if (ans.imageUrl) {
            imageHtml = `
                <div class="mb-4 bg-slate-100 dark:bg-slate-900/50 rounded-lg p-2 border border-slate-200 dark:border-slate-700 flex flex-col items-center">
                    <div class="relative group w-full max-w-md">
                        <img src="${ans.imageUrl}" 
                             class="w-full h-auto max-h-60 object-contain rounded-md cursor-zoom-in bg-white dark:bg-slate-800"
                             onclick="window.openImageZoom('${ans.imageUrl}')"
                             alt="Question Reference">
                             
                        <a href="${ans.imageUrl}" 
                           target="_blank" 
                           download="question-${idx+1}.jpg"
                           class="absolute top-2 right-2 bg-white/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-300 p-2 rounded-full shadow-lg hover:text-primary transition opacity-0 group-hover:opacity-100"
                           title="Download Image">
                           <i class="fa-solid fa-download"></i>
                        </a>
                    </div>
                    <p class="text-xs text-slate-400 mt-2">
                        <i class="fa-solid fa-magnifying-glass"></i> Click to zoom • 
                        <i class="fa-solid fa-download"></i> Hover to download
                    </p>
                </div>
            `;
        }

        // 5. Build Final Card HTML
        const card = document.createElement('div');
        card.className = `glass-panel rounded-lg p-5 transition hover:shadow-md ${borderClass} mb-4`;
        
        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div class="flex items-center gap-3">
                    <span class="text-xs font-bold text-slate-400 uppercase">Q${idx+1}</span>
                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClass}">
                        ${icon} <span class="ml-1">${status}</span>
                    </span>
                </div>
                <span class="text-xs text-slate-500"><i class="fa-regular fa-clock mr-1"></i> ${ans.timeSpent}s</span>
            </div>
            
            ${imageHtml}
            
            <h3 class="text-md font-medium text-slate-800 dark:text-white mb-4">${ans.qText}</h3>
            
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div class="p-3 bg-slate-50 dark:bg-slate-700/50 rounded border border-slate-100 dark:border-slate-600">
                    <span class="block text-xs text-slate-400 mb-1">Your Answer: ${ans.userAnswer || '-'}</span>
                    <span class="font-medium ${ans.isCorrect ? 'text-green-600' : 'text-red-600'}">${userAnswerText}</span>
                </div>
                <div class="p-3 bg-green-50 dark:bg-green-900/20 rounded border border-green-100 dark:border-green-800">
                    <span class="block text-xs text-green-700 dark:text-green-400 opacity-70 mb-1">Correct Answer: ${ans.correctAnswer}</span>
                    <span class="font-medium text-green-800 dark:text-green-300">${correctAnswerText}</span>
                </div>
            </div>
            
            <div class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center">
                 <div class="flex space-x-3">
                     <button id="toggle-btn-${ans.qId}" class="text-sm font-medium text-primary hover:text-indigo-600 transition-colors"
                        onclick="toggleExplanation('${explanationId}', '${ans.qId}')">
                        <i id="toggle-icon-${ans.qId}" class="${toggleButtonIcon} mr-2"></i> 
                        <span id="toggle-text-${ans.qId}">${toggleButtonText}</span>
                     </button>
                     
                     <button id="regenerate-btn-${ans.qId}" class="text-xs font-medium text-red-500 hover:text-red-700 transition-colors ${isGenerated ? '' : 'hidden'}"
                        onclick='fetchExplanation({
                            qId: "${ans.qId}", 
                            qText: "${safeQText}", 
                            userAnswer: "${ans.userAnswer || ''}", 
                            correctAnswer: "${ans.correctAnswer}", 
                            explanationId: "${explanationId}"
                        }, true)'>
                        <i class="fa-solid fa-arrows-rotate mr-1"></i> Regenerate
                    </button>
                </div>
            </div>

            <div id="${explanationId}" class="${explanationVisibleClass}">
                ${initialExplanationContent}
            </div>
        `;

        resultEls.detailedList.appendChild(card);
    });


    
    renderMath(resultEls.detailedList);
}

const loadAttemptDetails = async (attemptId) => {
    try {
        const doc = await db.collection('user_results').doc(CURRENT_USER_ID).collection('attempts').doc(attemptId).get();
        if(doc.exists) {
            currentResultData = doc.data();
            updateSummaryData(currentResultData);
            filterResults('all'); 
            switchTab('detailed'); 
            console.log(`Info (Result.js): Loaded details for attempt: ${attemptId}`);
        } else {
            alert('Attempt details not found!');
        }
    } catch(e) {
        console.error('❌ Error (Result.js): Error loading attempt details:', e);
        alert('Could not load attempt details due to a connection error.');
    }
}

// Function to check if we should ask for feedback
function checkFeedbackRequirement() {
    const hasSubmitted = localStorage.getItem('feedbackSubmitted');
    
    // Only show if NOT submitted before
    if (hasSubmitted !== 'true') {
        document.getElementById('feedback-modal').classList.remove('hidden');
    }
}

// Function to handle submission
function submitFeedback(rating) {
    // 1. Send data to your database (optional)
    console.log("User rated:", rating);
    
    // 2. Mark as submitted in localStorage
    localStorage.setItem('feedbackSubmitted', 'true');
    
    // 3. Hide modal
    document.getElementById('feedback-modal').classList.add('hidden');
    alert("Thank you for your feedback!");
}

// Function to handle skip
function skipFeedback() {
    // Just hide the modal (no localStorage set, so it asks next time)
    document.getElementById('feedback-modal').classList.add('hidden');
}

// Trigger this when results load
// Add this call inside your result loading function (where you display the score)
// checkFeedbackRequirement();

const fetchHistory = async () => {
    try {
        const snapshot = await db.collection('user_results').doc(CURRENT_USER_ID).collection('attempts')
            .where('quizId', '==', currentQuizId)
            .get();

        resultEls.historyList.innerHTML = '';
        if(snapshot.empty) {
            resultEls.historyList.innerHTML = "<p>No past attempts found for this quiz.</p>";
            return;
        }

        let attempts = [];
        snapshot.forEach(doc => attempts.push({ id: doc.id, ...doc.data() }));
        attempts.sort((a, b) => {
            const tA = a.timestamp ? a.timestamp.seconds : 0;
            const tB = b.timestamp ? b.timestamp.seconds : 0;
            return tB - tA; 
        });

        attempts.forEach(data => {
            const date = data.timestamp ? new Date(data.timestamp.toDate()).toLocaleDateString() + ' ' + new Date(data.timestamp.toDate()).toLocaleTimeString() : 'Just now';
            const pct = Math.round((data.score / data.total) * 100);
            
            const div = document.createElement('div');
            div.className = "flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors";
            div.onclick = () => loadAttemptDetails(data.id); 
            div.innerHTML = `
                <div>
                    <p class="font-bold text-primary">${date} <i class="fa-solid fa-arrow-up-right-from-square text-xs ml-2"></i></p>
                    <p class="text-xs text-slate-500">${data.timeTaken} duration</p>
                </div>
                <div class="text-right">
                    <span class="block text-lg font-bold ${pct >= 70 ? 'text-green-500' : 'text-orange-500'}">${pct}%</span>
                    <span class="text-xs text-slate-400">${data.score}/${data.total}</span>
                </div>
            `;
            resultEls.historyList.appendChild(div);
        });
        console.log(`Info (Result.js): Fetched ${attempts.length} history attempts.`);
    } catch(e) {
        console.error("❌ Error (Result.js): History fetch error:", e);
        resultEls.historyList.innerHTML = "<p class='text-red-500'>Failed to load history.</p>";
    }
};
