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

const showGeminiApiModal = (errorMessage = null, questionDetails = null) => {
    resultEls.apiModal.classList.remove('hidden');
    resultEls.apiKeyInput.value = userGeminiApiKey || ''; 
    currentQuestionForExplanation = questionDetails || currentQuestionForExplanation;
    
    if (errorMessage) {
        resultEls.apiErrorMsg.textContent = errorMessage;
        resultEls.apiErrorMsg.classList.remove('hidden');
    } else {
        resultEls.apiErrorMsg.classList.add('hidden');
    }
    
    resultEls.saveKeyBtn.onclick = () => {
        const key = resultEls.apiKeyInput.value.trim();
        if (key) {
            saveUserApiKey(key);
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


const saveUserApiKey = async (key) => {
    if (!CURRENT_USER_ID) return console.error("❌ Error (Result.js): User ID not available to save API key.");
    try {
        await db.collection('users').doc(CURRENT_USER_ID).set({
            geminiApiKey: key,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        userGeminiApiKey = key; 
        alert("Gemini API Key saved successfully! You can now get explanations.");
        resultEls.apiModal.classList.add('hidden');
        // Clear error message on success
        resultEls.apiErrorMsg.classList.add('hidden');
        
        console.log("✅ Success (Result.js): New Gemini API Key saved to Firestore.");
        
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
    showGeminiApiModal("Please enter your Gemini API Key to use the AI explanation feature.", questionDetails);
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

// --- GEMINI EXPLANATION LOGIC (with Caching and Regeneration) ---

const fetchExplanation = async (questionDetails, isRegenerate = false) => {
    const { qId, qText, userAnswer, correctAnswer, explanationId } = questionDetails;
    
    const explanationElement = document.getElementById(explanationId);
    
    if (!userGeminiApiKey) {
        explanationElement.classList.remove('hidden'); 
        showApiKeyModal(questionDetails);
        return; 
    }
    
    const ans = currentResultData.answers.find(a => a.qId === qId);
    const cachedHtml = ans?.generatedExplanation || explanationCache[qId];

    if (cachedHtml && !isRegenerate) {
        console.log("Info (Result.js): Explanation found in cache. Rendering cached content.");
        
        explanationElement.innerHTML = `
            <div class="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                <h4 class="font-bold text-primary mb-2">Detailed Explanation:</h4>
                <div class="text-sm text-slate-700 dark:text-slate-300">
                    ${cachedHtml}
                </div>
            </div>
        `;
        renderMath(explanationElement);
        explanationElement.classList.remove('hidden');
        document.getElementById(`toggle-icon-${qId}`).className = 'fa-solid fa-chevron-up mr-2';
        document.getElementById(`toggle-text-${qId}`).textContent = 'Minimize Explanation';
        document.getElementById(`regenerate-btn-${qId}`)?.classList.remove('hidden');
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
    
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${userGeminiApiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
            }),
        });

        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch {
                errorData = { error: { message: "Could not parse API error response." } };
            }
            
            let errorMessage = "The Gemini API call failed due to an unknown error. Please try again or update your API key.";
            const responseStatus = response.status;
            const apiErrorMsg = errorData.error?.message;

            if (responseStatus === 400 && apiErrorMsg && (apiErrorMsg.includes("API key not valid") || apiErrorMsg.includes("Invalid API Key"))) {
                errorMessage = "Your Gemini API Key is invalid or has expired. Please update it to continue using the AI explanation feature.";
            } else if (responseStatus === 429) {
                errorMessage = "You have reached the API rate limit for this key. Please try again later, or update your key if you believe this is an error.";
            } else if (responseStatus === 403) {
                 errorMessage = "Access denied (403). Your API key may not have the necessary permissions or the request is blocked. Please check your key status.";
            }
            
            showGeminiApiModal(errorMessage, questionDetails);
            throw new Error(`Gemini API Error (Status: ${responseStatus}): ${errorMessage}`);
        }

        const data = await response.json();
        const explanationText = data.candidates?.[0]?.content?.parts?.[0]?.text || "Sorry, I couldn't generate an explanation. Check your API key and usage limits.";
        
        console.log("✅ Success (Result.js): Fetched explanation from Gemini API for question:", qId);

        const formattedHtml = markdownToHtml(explanationText);
        
        if (ans) {
             ans.generatedExplanation = formattedHtml; 
        }
        explanationCache[qId] = formattedHtml; 

        // 5. Render the explanation text
        explanationElement.innerHTML = `
            <div class="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600">
                <h4 class="font-bold text-primary mb-2">Detailed Explanation:</h4>
                <div class="text-sm text-slate-700 dark:text-slate-300">
                    ${formattedHtml}
                </div>
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
        console.error("❌ Error (Result.js): Gemini API Call Failed.", error);
        
        if (!error.message.includes('Gemini API Error')) {
            explanationElement.innerHTML = `
                <p class="text-red-500 mt-4"><i class="fa-solid fa-triangle-exclamation mr-2"></i> Network or client error generating explanation. Try again.</p>
            `;
        } else {
             explanationElement.innerHTML = `
                <p class="text-red-500 mt-4"><i class="fa-solid fa-triangle-exclamation mr-2"></i> ${error.message.split('- ')[1]}</p>
            `;
        }

        document.getElementById(`toggle-icon-${qId}`).className = 'fa-solid fa-robot mr-2';
        document.getElementById(`toggle-text-${qId}`).textContent = 'Get AI Explanation (Gemini)';
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
    const detailed = questions.map(q => {
        const u = userAnswers[q.id];
        const isCorrect = u === q.answer;
        if(isCorrect) score++;
        const timeSpent = 20;
        return { qId: q.id, qText: q.question, imageUrl: q.imageUrl || null, userAnswer: u||null, correctAnswer: q.answer, isCorrect, timeSpent };
    });

    const totalQuizDuration = questions.length > 0 && questions[0].durationMinutes ? (questions[0].durationMinutes * 60) : (questions.length * 60);
    const totalTimeSpent = totalQuizDuration - timeLeft; 
    const formattedTime = formatTime(totalTimeSpent > 0 ? totalTimeSpent : 0);
    
    const resultData = {
        quizId: currentQuizId,
        quizTitle: resultEls.title.textContent,
        score, total: questions.length,
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

    const pct = Math.round((data.score / data.total) * 100);
    resultEls.resScore.textContent = `${data.score} / ${data.total}`;
    resultEls.resAccuracy.textContent = `${pct}%`;
    resultEls.resAccBar.style.width = `${pct}%`;
    resultEls.resTime.textContent = data.timeTaken;
    resultEls.resRank.textContent = data.rank || "Top 50%";
    
    const avg = data.total > 0 ? Math.round(data.totalTimeSeconds / data.total) : 0;
    resultEls.resAvgTime.textContent = `${avg}s`;
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