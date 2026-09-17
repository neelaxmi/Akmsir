const SYNTHETIC_SCORE_CONFIG = {
    ACCURACY_WEIGHT: 636.44,
    WRONG_RATE_WEIGHT: -127.50,
    SKIP_RATE_WEIGHT: 14.23,
    TOTAL_QUESTIONS_WEIGHT: -0.14,
    INTERCEPT: -7.52,
    MIN_SCORE: 0,
    MAX_SCORE: 720,
};

function calculateAccuracy(correct, total) {
    if (!total || total <= 0) return 0;
    return correct / total;
}

function calculateAttemptAccuracy(correct, wrong) {
    const attempted = correct + wrong;
    if (attempted <= 0) return 0;
    return correct / attempted;
}

function calculateSyntheticScore({ correct, wrong, skipped, total }) {
    if (!total || total <= 0) return 0;

    const cfg = SYNTHETIC_SCORE_CONFIG;
    const accuracy = calculateAccuracy(correct, total);
    const wrongRate = wrong / total;
    const skipRate = skipped / total;

    const estimated =
        cfg.ACCURACY_WEIGHT * accuracy
        + cfg.WRONG_RATE_WEIGHT * wrongRate
        + cfg.SKIP_RATE_WEIGHT * skipRate
        + cfg.TOTAL_QUESTIONS_WEIGHT * total
        + cfg.INTERCEPT;

    return Math.max(cfg.MIN_SCORE, Math.min(cfg.MAX_SCORE, Math.round(estimated)));
}



function getPerformanceStanding(score) {
    if (score < 456) return 'Needs Improvement';
    if (score <= 600) return 'Good';
    return 'Very Good';
}



const RANK_BANDS = [
    { minScore: 601, maxScore: 720, rank: "1,281-2,250" },
    { minScore: 597, maxScore: 600, rank: "5,251-6,203" },
    { minScore: 571, maxScore: 596, rank: "17,230-18,226" },
    { minScore: 561, maxScore: 570, rank: "18,227-20,111" },
    { minScore: 552, maxScore: 560, rank: "20,112-21,222" },
    { minScore: 540, maxScore: 551, rank: "21,223-25,220" },
    { minScore: 530, maxScore: 539, rank: "25,221-31,222" },
    { minScore: 518, maxScore: 529, rank: "42,506-46,330" },
    { minScore: 504, maxScore: 517, rank: "46,331-51,200" },
    { minScore: 490, maxScore: 503, rank: "51,221-61,222" },
    { minScore: 481, maxScore: 489, rank: "61,223-69,996" },
    { minScore: 472, maxScore: 480, rank: "69,997-73,228" },
    { minScore: 456, maxScore: 471, rank: "73,227-80,004" },
    { minScore: 426, maxScore: 455, rank: "106,301-113,300" },
    { minScore: 386, maxScore: 425, rank: "113,301-271,330" },
    { minScore: 348, maxScore: 385, rank: "271,331-305,330" },
    { minScore: 341, maxScore: 347, rank: "305,331-339,300" },
    { minScore: 337, maxScore: 340, rank: "339,301-390,000" },
];

function getPredictedRank(score) {
    const band = RANK_BANDS.find(b => score >= b.minScore && score <= b.maxScore);
    if (band) return band.rank;
    const highest = RANK_BANDS.reduce((a, b) => (b.maxScore > a.maxScore ? b : a));
    const lowest = RANK_BANDS.reduce((a, b) => (b.minScore < a.minScore ? b : a));
    if (score > highest.maxScore) return highest.rank; 
    if (score < lowest.minScore) {
        const worstKnown = parseInt(lowest.rank.split('-')[1].replace(/,/g, ''), 10);
        // Manual Western-style comma grouping (not toLocaleString) so it
        // matches the "339,301" / "390,000" style already used in the table
        // above, instead of switching to Indian-style "3,90,000" grouping.
        const formatted = worstKnown.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return `${formatted}+ (est.)`;
    }
    let nearest = RANK_BANDS[0], nearestDist = Infinity;
    RANK_BANDS.forEach(b => {
        const mid = (b.minScore + b.maxScore) / 2;
        const dist = Math.abs(score - mid);
        if (dist < nearestDist) { nearest = b; nearestDist = dist; }
    });
    return `${nearest.rank} (approx.)`;
}


function generatePerformanceSummary(standing) {
    switch (standing) {
        case 'Needs Improvement':
            return 'Your current score indicates that this topic needs more revision. Focus on reducing incorrect answers and improving accuracy before increasing attempt volume.';
        case 'Good':
            return 'Good performance. Your fundamentals appear to be developing well. Focus on reducing mistakes and skipped questions to move toward the Very Good range.';
        case 'Very Good':
            return 'Very strong performance. Your accuracy is high and your score is in the Very Good range. Continue maintaining accuracy while reducing avoidable mistakes.';
        default:
            return '';
    }
}

const SUGGESTION_THRESHOLDS = {
    HIGH_WRONG_SHARE: 0.15,
    HIGH_SKIP_SHARE: 0.15,
    HIGH_ACCURACY: 0.90,
};

function generateImprovementSuggestions(result) {
    const suggestions = [];
    const { correct, wrong, skipped, totalPolls: total, accuracy, syntheticScore } = result;

    if (total > 0) {
        const wrongShare = wrong / total;
        const skipShare = skipped / total;

        if (wrongShare >= SUGGESTION_THRESHOLDS.HIGH_WRONG_SHARE) {
            suggestions.push('Your biggest opportunity is reducing incorrect answers.');
        }
        if (skipShare >= SUGGESTION_THRESHOLDS.HIGH_SKIP_SHARE) {
            suggestions.push('You are leaving a significant number of questions unanswered. Work on time management and question selection.');
        }
        if (accuracy >= SUGGESTION_THRESHOLDS.HIGH_ACCURACY) {
            suggestions.push('Your accuracy is strong. Focus on consistency and speed.');
        }
    }

    if (syntheticScore < 456) {
        suggestions.push('Priority: strengthen concepts and reduce incorrect answers.');
    } else if (syntheticScore <= 600) {
        suggestions.push('Priority: improve accuracy and consistency to move toward 600+.');
    } else {
        suggestions.push('Priority: maintain accuracy and eliminate avoidable mistakes.');
    }

    return suggestions;
}


function calculateHistoricalStats(history) {
    if (!Array.isArray(history) || !history.length) {
        return { averageScore: 0, bestScore: 0, lowestScore: 0, averageAccuracy: 0, totalQuizzes: 0 };
    }

    const scores = history.map(h => h.syntheticScore).filter(Number.isFinite);
    const accuracies = history.map(h => h.accuracy).filter(Number.isFinite);
    const sum = arr => arr.reduce((a, b) => a + b, 0);

    return {
        averageScore: scores.length ? Math.round(sum(scores) / scores.length) : 0,
        bestScore: scores.length ? Math.max(...scores) : 0,
        lowestScore: scores.length ? Math.min(...scores) : 0,
        averageAccuracy: accuracies.length ? Math.round((sum(accuracies) / accuracies.length) * 1000) / 10 : 0, 
        totalQuizzes: history.length,
    };
}



const MARKING_SCHEME = {
    CORRECT: 4,
    WRONG: -1,
    UNATTEMPTED: 0,
};

function calculateMarksScore(correct, wrong) {
    return (correct * MARKING_SCHEME.CORRECT) + (wrong * MARKING_SCHEME.WRONG);
}

function getMaxMarks(total) {
    return (total || 0) * MARKING_SCHEME.CORRECT;
}



function normalizeResult(raw = {}) {
    const safeNumber = (v, fallback = 0) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : fallback;
    };

    let total = safeNumber(raw.total, 0);
    let correct = safeNumber(raw.correct, 0);
    let wrong = raw.wrong === undefined || raw.wrong === null ? undefined : safeNumber(raw.wrong, 0);
    let skipped = raw.skipped === undefined || raw.skipped === null ? undefined : safeNumber(raw.skipped, 0);

    if (correct > total) {
        console.warn('[scoring.js] normalizeResult: correct > total — clamping correct to total.', { correct, total });
        correct = total;
    }


    if (wrong === undefined && skipped === undefined) {
        wrong = 0;
        skipped = Math.max(0, total - correct);
    } else {
        wrong = wrong === undefined ? 0 : wrong;
        skipped = skipped === undefined ? 0 : skipped;
    }


    if (total > 0 && (correct + wrong + skipped) !== total) {
        console.warn('[scoring.js] normalizeResult: correct+wrong+skipped != total — adjusting skipped to compensate.', { total, correct, wrong, skipped });
        skipped = Math.max(0, total - correct - wrong);
    }

    const accuracy = calculateAccuracy(correct, total);
    const attemptAccuracy = calculateAttemptAccuracy(correct, wrong);
    const syntheticScore = calculateSyntheticScore({ correct, wrong, skipped, total });
    const standing = getPerformanceStanding(syntheticScore);
    const predictedRank = getPredictedRank(syntheticScore);
    const marksScore = calculateMarksScore(correct, wrong);
    const maxMarks = getMaxMarks(total);

    return {
        totalPolls: total,
        correct, wrong, skipped,
        accuracy, attemptAccuracy,
        syntheticScore, standing, predictedRank,
        marksScore, maxMarks,
        averageTime: safeNumber(raw.averageTime, 0),
        quizTitle: raw.quizTitle || 'Quiz',
        date: raw.date || null,
    };
}
