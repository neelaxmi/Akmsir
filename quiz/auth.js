
const firebaseConfig = {
    apiKey: "AIzaSyAOJmK4igVb_P8cV6jLfZhFPGFmAZfVvRE",
    authDomain: "classupdates.netlify.app",
    projectId: "quiznew-30700",
    storageBucket: "quiznew-30700.firebasestorage.app",
    messagingSenderId: "107821881642",
    appId: "1:107821881642:web:7d708bda99196c85e42653",
    measurementId: "G-0B6095T5X7"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

let CURRENT_USER_ID = null;
let currentQuizId = null;
let isLoginMode = true;
let userGeminiApiKey = null;
let userData = null;


const authEls = {
    authBox: document.getElementById('auth-box'),
    authEmail: document.getElementById('auth-email'),
    authPassword: document.getElementById('auth-password'),
    authGeminiKey: document.getElementById('auth-gemini-key'),
    authName: document.getElementById('auth-name'),
    authClass: document.getElementById('auth-class'),
    authUsername: document.getElementById('auth-username'),
    registrationFields: document.getElementById('registration-fields'), 
    authGeminiKeyContainer: document.getElementById('auth-gemini-key-container'),
    whyGeminiBtn: document.getElementById('why-gemini-btn'),
    whyGeminiModal: document.getElementById('why-gemini-modal'),
    closeWhyGeminiModal: document.getElementById('close-why-gemini-modal'),
    
    authBtn: document.getElementById('auth-primary-btn'),
    authError: document.getElementById('auth-error'),
    authToggle: document.getElementById('auth-toggle-mode'),
    loader: document.getElementById('loading-screen'),
};


const showWhyGeminiModal = () => {
    if (authEls.whyGeminiModal) authEls.whyGeminiModal.classList.remove('hidden');
};

const hideWhyGeminiModal = () => {
    if (authEls.whyGeminiModal) authEls.whyGeminiModal.classList.add('hidden');
};

if (authEls.whyGeminiBtn) authEls.whyGeminiBtn.onclick = showWhyGeminiModal;
if (authEls.closeWhyGeminiModal) authEls.closeWhyGeminiModal.onclick = hideWhyGeminiModal;


authEls.authToggle.onclick = () => {
    isLoginMode = !isLoginMode;
    authEls.authBox.querySelector('#auth-title').textContent = isLoginMode ? 'Login to QuizMaster' : 'Register for QuizMaster';
    authEls.authBtn.textContent = isLoginMode ? 'Sign In' : 'Sign Up';
    authEls.authError.classList.add('hidden');
    
    if (authEls.authGeminiKeyContainer) {
        authEls.authGeminiKeyContainer.style.display = isLoginMode ? 'none' : 'block';
    }
    if (authEls.registrationFields) {
        authEls.registrationFields.classList.toggle('hidden', isLoginMode);
    }
};
if (authEls.authGeminiKeyContainer) authEls.authGeminiKeyContainer.style.display = isLoginMode ? 'none' : 'block';

authEls.authBtn.onclick = async () => {
    authEls.authError.classList.add('hidden');
    
    const email = authEls.authEmail.value;
    const password = authEls.authPassword.value;
    const geminiKey = authEls.authGeminiKey ? authEls.authGeminiKey.value.trim() : '';
    
    const name = authEls.authName ? authEls.authName.value.trim() : '';
    const userClass = authEls.authClass ? authEls.authClass.value : '';
    const username = authEls.authUsername ? authEls.authUsername.value.trim() : '';
    
    try {
        if (isLoginMode) {
            await auth.signInWithEmailAndPassword(email, password);
        } else {
            const usernameCheck = await db.collection('users').where('username', '==', username).get();
            if (!usernameCheck.empty) {
                throw new Error("Username already taken. Please choose another.");
            }
            
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const userId = userCredential.user.uid;
            
            const newUserProfile = {
                uid: userId,
                name: name,
                class: userClass,
                username: username,
                email: email,
                bookmarks: [], 
                geminiApiKey: geminiKey || null,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };
            
            await db.collection('users').doc(userId).set(newUserProfile);
            console.log("✅ Success: New user registered with full profile.");
        }
    } catch (e) {
        authEls.authError.textContent = e.message;
        authEls.authError.classList.remove('hidden');
        console.error("❌ Error: Authentication Failed:", e.message);
    }
};

// Google Login Logic
document.getElementById('google-login-btn').onclick = async () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    
    try {
        const result = await auth.signInWithPopup(provider);
        const user = result.user;
        
        // Check if user document exists in Firestore, if not, create it
        const userDoc = await db.collection('users').doc(user.uid).get();

        if (!userDoc.exists) {
            await db.collection('users').doc(user.uid).set({
                uid: user.uid,
                name: user.displayName,
                email: user.email,
                username: user.email.split('@')[0] + Math.floor(Math.random() * 1000),
                class: "",
                bookmarks: [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

    } catch (error) {
        authEls.authError.textContent = error.message;
        authEls.authError.classList.remove('hidden');
    }
};


// Auth State Change
auth.onAuthStateChanged(user => {
    if (user) {

        CURRENT_USER_ID = user.uid;
        authEls.authBox.classList.add('hidden');

        db.collection('users').doc(CURRENT_USER_ID).onSnapshot(doc => {

            if (doc.exists) {
                userData = doc.data();
                userGeminiApiKey = userData.geminiApiKey;
                console.log("✅ User profile loaded/updated.");
            } else {
                console.warn("⚠️ No user profile found.");
            }

        }, e => {
            console.error("❌ Error fetching user data.", e);
        });

        const params = new URLSearchParams(window.location.search);
        currentQuizId = params.get('uid');

        if (currentQuizId) {

            if (typeof loadQuiz !== 'undefined') {
                loadQuiz(currentQuizId);
            }

        } else {

            const errorArea = document.getElementById('error-message-area');

            if (errorArea) {
                document.getElementById('error-text').textContent =
                    "Quiz ID is missing from the URL.";

                errorArea.classList.remove('hidden');
            }

            authEls.loader.classList.remove('hidden');
        }

    } else {

        authEls.loader.classList.add('hidden');
        authEls.authBox.classList.remove('hidden');

    }
});
window.toggleBookmark = async (questionId) => {
    if (!CURRENT_USER_ID) return;
    const userRef = db.collection('users').doc(CURRENT_USER_ID);
    const isBookmarked = userData.bookmarks && userData.bookmarks.includes(questionId);
    
    try {
        if (isBookmarked) {
            await userRef.update({
                bookmarks: firebase.firestore.FieldValue.arrayRemove(questionId)
            });
            console.log("Bookmark removed.");
        } else {
            await userRef.update({
                bookmarks: firebase.firestore.FieldValue.arrayUnion(questionId)
            });
            console.log("Bookmark added.");
        }
    } catch (e) {
        console.error("Error toggling bookmark:", e);
    }
};



// Telegram se login hone ke baad ye function chalega
function onTelegramAuth(user) {
    console.log("Telegram se login hua:", user);

    // Google wale logic ki tarah Firestore mein data save kar rahe hain
    const userRef = db.collection('users').doc('tg_' + user.id);

    userRef.set({
        uid: 'tg_' + user.id,
        name: user.first_name + (user.last_name ? ' ' + user.last_name : ''),
        username: user.username || 'N/A',
        auth_provider: 'telegram',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }) // merge: true taaki purana data delete na ho
    .then(() => {
        // Data save hone ke baad user ko quizzes page par bhej do
        window.location.href = "quizzes.html"; 
    })
    .catch((error) => {
        console.error("Error saving Telegram user: ", error);
        alert("Login me problem aayi, wapas try karo.");
    });
}