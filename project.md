# NEELAXMI: THE HELPER — FULL-STACK TECHNICAL AUDIT & ARCHITECTURAL REVIEW
> Prepared as an end-to-end engineering/security assessment of the uploaded
> codebase (classupdates.netlify.app — NEET coaching / study-notification PWA)

## Table of Contents
1. [Module 1: Architectural Overview & Directory Tree](#module-1-architectural-overview--directory-tree)
2. [Module 2: Front-End Deep Dive (HTML & CSS Audit)](#module-2-front-end-deep-dive-html--css-audit)
3. [Module 3: Front-End Logic & JavaScript Execution Environment](#module-3-front-end-logic--javascript-execution-environment)
4. [Module 4: Data Modeling — Proposed Relational Schema](#module-4-data-modeling--proposed-relational-schema)
5. [Module 5: Security Audit & Destructive Testing Report](#module-5-security-audit--destructive-testing-report)
6. [Module 6: Code Quality, Refactoring Roadmap & Best Practices](#module-6-code-quality-refactoring-roadmap--best-practices)

---

# MODULE 1: ARCHITECTURAL OVERVIEW & DIRECTORY TREE

## 1.1 COMPLETE DIRECTORY STRUCTURE

```text
neelaxmi_helper/
├── index.html                  (Main landing page / SPA shell — ~1,400 lines incl. inline CSS+JS)
├── inde.html                   (Duplicate/backup of index.html — legacy artifact)
├── quizmain.html                (Root-level quiz entry page)
├── quizzes.html                  (Root-level quiz listing page)
├── chat.html                     (Standalone real-time chat module, own Firebase init)
├── privacy.html / Privacy.md     (Privacy policy — HTML + Markdown duplicate)
├── SECURITY.md                   (Security policy stub)
├── updates.html                  (Notification/updates feed page)
├── periodic.html                 (Interactive periodic table, powered by neexmi.json)
├── offline.html                  (PWA offline fallback page, served by sw.js)
├── About us.html                 (Static informational page)
├── style.css                     (Global stylesheet, 256 lines)
├── auth.js                       (Root-level Firebase Auth bootstrap, 215 lines)
├── history.js                    (Sidebar + browser-history helper, 45 lines)
├── sw.js                         (Service Worker — cache-first PWA logic, 54 lines)
├── onesignalsdkworker.js         (Empty stub required by OneSignal push SDK)
├── manifest.json                 (PWA manifest — icons, theme, start_url)
├── features.json                 (Feature-flag / content config)
├── neexmi.json                   (276 KB — full periodic-table dataset for periodic.html)
├── sak.json                      (64 KB — static physics/chemistry MCQ question bank, NOT a
│                                   service-account key despite the name; consumed by the quiz
│                                   engine as a static JSON "question set")
├── neelaxmi.txt / t.txt          (Scratch/notes files, non-functional)
├── sitemap.xml / robots.txt / ads.txt / _redirects   (SEO + Netlify hosting config)
├── LICENSE
│
├── Css/
│   ├── index.css                 (557 lines — landing-page-specific styling)
│   ├── Style.css                 (105 lines — secondary/legacy shared styles)
│   ├── owner.css                 (425 lines — "about owner" / profile page styling)
│   ├── quiz.css                  (249 lines — quiz engine styling)
│   └── teacher.css               (182 lines — teacher profile page styling)
│
├── quiz/
│   ├── auth.html                  (Login/Register gate specific to the quiz subsystem)
│   ├── auth.js                    (241 lines — byte-for-byte duplicate of root auth.js, plus
│   │                                an added Telegram-login handler, onTelegramAuth())
│   ├── dashboard.html              (User dashboard — bookmarks, history, profile)
│   ├── gemini.html                 (Gemini-AI-assisted quiz/explanation UI)
│   ├── quiz.js                     (1,355 lines — the core quiz engine: rendering, timer,
│   │                                 translation, AI proctoring, anti-cheating)
│   ├── quizmain.html               (Quiz subsystem entry point)
│   ├── quizzes.html                (Quiz catalogue/listing, subsystem copy)
│   ├── result.js                   (680 lines — scoring, AI explanations, feedback, history)
│   └── vedio.js                    (337 lines — sic: "video" — YouTube video-solution player)
│
├── teachers/
│   ├── about-owner.html
│   ├── ajay-sir.html
│   ├── amit-gupta-sir.html
│   ├── Pranav-pundarik.html
│   ├── prateek-jain.html
│   ├── ramesh-sharda.html
│   ├── seep-mam.html
│   ├── test-series.html
│   └── pdf.js                      (75 lines — PDF.js-based in-browser module viewer)
│
├── pictures/                       (4.8 MB — 30+ JPEG/JPG/PNG/WEBP/SVG teacher & brand photos)
├── *.apk                           (akmsir.apk, pjsir.apk, rssir.apk, neelaxmi.apk, rssir.apk —
│                                     5 Android APK binaries, 7 MB each, bundled directly into
│                                     the web root — see Module 5 for the risk this represents)
└── logo.mp4 / logo.png             (Brand assets — 5.2 MB video used as an animated logo)
```

Total first-party source: ~4,800 lines across 12 JavaScript files and ~30 HTML documents,
plus ~1,520 lines of CSS. The binary payload (APKs + video + images) is >30 MB, dwarfing the
actual application logic — this alone is a top-line architectural concern (Module 2.4/Module 6).


## 1.2 ARCHITECTURAL / DATA-FLOW DIAGRAM
The application is a client-rendered, multi-page static site (no bundler, no framework, no
build step) that talks directly to Google Firebase from the browser. There is no traditional
"back end" in the Node/Express/Django sense — Firebase Authentication + Cloud Firestore *is*
the back end, and it is called straight from inline <script> tags and .js files loaded via
plain <script src="..."> tags (no ES module imports, no bundling, no tree-shaking).

    ┌──────────────────────────────────────────────────────────────────────────┐
    │                              BROWSER (CLIENT)                            │
    │                                                                          │
    │  index.html / quizzes.html / teachers/*.html / chat.html  (Views)        │
    │        │            │                │              │                  │
    │        ▼            ▼                ▼              ▼                  │
    │   style.css    Css/index.css   Css/teacher.css   Css/quiz.css           │
    │   (presentation layer — no CSS framework, hand-rolled custom properties) │
    │                                                                          │
    │   history.js ──> DOM sidebar/back-button toggles (no external state)     │
    │                                                                          │
    │   auth.js  ───────────┐                                                 │
    │   quiz/auth.js ───────┼──> firebase.initializeApp() ─┐                  │
    │   chat.html (inline) ─┘                              │                  │
    │                                                       ▼                  │
    │                                        ┌───────────────────────────┐    │
    │                                        │   Firebase Auth (Google)  │    │
    │                                        │   - email/password        │    │
    │                                        │   - Google OAuth popup    │    │
    │                                        │   - Telegram bridge (raw  │    │
    │                                        │     write, no verification)│   │
    │                                        └─────────────┬─────────────┘    │
    │                                                       │ uid             │
    │                                                       ▼                  │
    │                                      ┌─────────────────────────────┐    │
    │                                      │  Cloud Firestore (NoSQL)    │    │
    │                                      │  users/{uid}                │    │
    │                                      │  user_progress/{uid}/       │    │
    │                                      │      saved_quizzes/{quizId} │    │
    │                                      │  quizzes/{quizId}           │    │
    │                                      │  attempts / feedback / chat │    │
    │                                      └─────────────┬─────────────┘    │
    │                                                       │ onSnapshot()   │
    │                                                       ▼                  │
    │   quiz/quiz.js  <── loadQuiz(uid) reads quiz doc, renders question loop  │
    │        │                                                                │
    │        ├──> quiz/vedio.js   (YouTube IFrame API — video solutions)      │
    │        ├──> quiz/result.js  ──> fetch() generativelanguage.googleapis.com│
    │        │                        (Gemini 2.5 Flash — AI explanations,     │
    │        │                         called with the STUDENT'S OWN key)     │
    │        ├──> TensorFlow.js (blazeface + coco-ssd) — client-side webcam   │
    │        │    face/object detection for "CBT proctoring mode"             │
    │        └──> sessionStorage / localStorage (violation log, theme, retry  │
    │             config, feedback-submitted flag — see Module 3.3)           │
    │                                                                          │
    │   teachers/pdf.js ──> PDF.js (cdnjs) renders Drive-hosted PDFs in-page   │
    │   sw.js ──> Cache API (installs app-shell, serves offline.html on       │
    │             navigation failure — classic PWA "stale-while-revalidate"   │
    │             hybrid, see Module 2.4)                                     │
    └──────────────────────────────────────────────────────────────────────────┘

Every page is an independent HTML document that re-declares its own <head>, re-includes the
Firebase SDK via CDN <script> tags, and re-initializes firebase.initializeApp() — there is no
shared "app shell" or router. Navigation between pages is full-page browser navigation
(<a href>, window.location.href), not client-side routing. State (userData, currentQuizId,
etc.) therefore does not survive between pages except via what is persisted to Firestore,
sessionStorage, or URL query parameters (?uid=..., ?pdf=...).

## 1.3 ARCHITECTURE PARADIGM & SCALABILITY EVALUATION
Paradigm: This is best classified as a "Monolithic Multi-Page Front-End with a Backend-as-a-
Service (BaaS)" architecture — sometimes called a "Jamstack-adjacent" pattern, except without
any static-site generator, templating engine, or component system. Firebase Firestore takes the
place of a REST/GraphQL API and relational database; there is no server-side controller layer,
no ORM, and no validation tier that isn't also running in the user's browser.

Strengths for the project's current scale:
  - Zero server-maintenance overhead; Firebase Auth + Firestore + Netlify hosting is a
    legitimate way to ship a small-to-medium EdTech product fast, and it explains why a
    single-developer team could build this much functionality (quiz engine, AI explanations,
    webcam proctoring, PWA, push notifications, chat) without a dedicated back end.
  - The PWA layer (manifest.json + sw.js) is genuinely well-implemented for what it does:
    correct install prompts, offline fallback, and cache versioning via CACHE_NAME bumps.

Weaknesses relative to industry best practice for a growing, security-sensitive EdTech product:
  - No component reuse: the Firebase config block and the entire authEls/auth flow in
    auth.js is copy-pasted verbatim into quiz/auth.js (byte-identical for the first 216 lines).
    Any bug fix or config rotation must now be made in at least two places, and audit shows it
    was NOT kept in sync in one respect: the authDomain field differs between the two copies
    (auth.js uses "quiznew-30700.firebaseapp.com", quiz/auth.js uses
    "classupdates.netlify.app") — a real correctness bug (see Module 6).
  - No build tooling: there is no bundler, no minifier, no module system (import/export), and
    no dependency manager (no package.json in the shipped bundle). Every third-party library
    (Firebase, TensorFlow.js, PDF.js, KaTeX, Font Awesome) is pulled from a public CDN at
    runtime, which is fine for a prototype but means the site has zero resilience to CDN
    outages, no Subresource Integrity (SRI) hashing observed on the tags reviewed, and no way
    to lock dependency versions except by hand-editing URLs.
  - Business logic that should never run on an untrusted client — score calculation, timer
    enforcement, "test-mode lockdown," proctoring violation counting, rank calculation — all
    executes entirely in quiz/quiz.js and quiz/result.js in the browser. A student with basic
    DevTools knowledge can rewrite userAnswers, timeLeft, or violationCount before the
    submitQuiz() write reaches Firestore, because there is no server-side Cloud Function
    revalidating the submission (Module 5 covers this as a critical business-logic-security gap).
  - Duplication at the page level: index.html and inde.html are near-duplicates; quizmain.html/
    quizzes.html exist both at the project root and inside /quiz/, again with no clear single
    source of truth, which will only get harder to reconcile as the product grows.

Verdict: for an MVP or a single-institute regional coaching site, this architecture is a
reasonable and pragmatic choice. For anything approaching "commercial, production-ready
software" (as targeted in Module 6), the architecture needs (a) a real build pipeline, (b) a
shared component/include system to kill the copy-paste duplication, and (c) server-side
Cloud Functions to own anything that currently trusts client-submitted data.


# MODULE 2: FRONT-END DEEP DIVE (HTML & CSS AUDIT)

## 2.1 HTML PAGE-BY-PAGE INVENTORY
• index.html / inde.html — The marketing/landing SPA shell. Contains an inline <style> block
  (a full design-token system using CSS custom properties: --bg-page, --blue-600, --navy, etc.),
  a hero section, an OneSignal push-notification integration block, and a notification-banner
  renderer (data.img driven, uses loading="lazy"). Semantic structure is mixed: some sections
  use proper <header>/<nav>/<section> landmarks, but large parts of the page are built from
  generic <div class="..."> soup rather than <article>/<aside>, which will hurt both
  accessibility (screen-reader landmark navigation) and SEO structured-data eligibility.

• quiz/auth.html + quiz/dashboard.html + quizmain.html/quizzes.html — Form-heavy pages.
  auth.html supplies #auth-email, #auth-password, #auth-gemini-key, #auth-name, #auth-class,
  #auth-username inputs consumed directly by auth.js/quiz/auth.js. None of these inputs were
  observed to carry pattern=, minlength=, or required attributes consistently in the audited
  markup, meaning validation is left entirely to whatever the JS layer chooses to check (see
  2.1a and Module 5.2 for the consequences).

• quiz/gemini.html — A quiz+AI-explanation combined view; renders LaTeX/KaTeX and Markdown-like
  AI output (result.js's markdownToHtml() converts a small hand-rolled Markdown subset to
  HTML and injects it with innerHTML — flagged in Module 5.1 as an XSS vector).

• teachers/*.html (8 pages) — Nearly identical templated "teacher profile" pages (ajay-sir.html,
  amit-gupta-sir.html, Pranav-pundarik.html, prateek-jain.html, ramesh-sharda.html, seep-mam.html,
  about-owner.html, test-series.html). Each repeats the same header/nav/footer markup rather
  than sharing a template — a textbook case for a static-include or template-literal component
  (Module 6).

• chat.html — A single 1,000+ line file combining full chat UI markup, its own inline
  <style>, and its own inline <script> with a second, independent Firebase initialization
  (different apiKey from the root/quiz auth.js — see Module 5). Contact list, friend requests,
  group chat, and message rendering all live in one monolithic file.

• periodic.html — Loads the 276 KB neexmi.json client-side and renders an interactive
  periodic table; a good example of "data-driven HTML" but the entire dataset (all 118
  elements, Bohr-model image URLs, 3D .glb model URLs) is fetched even if the user only wants
  to look at one element.

• updates.html, privacy.html/Privacy.md, About us.html, offline.html — Static/informational
  content pages, structurally simple, low risk.

## 2.1a FORM STRUCTURE OBSERVATIONS
Forms are built from loosely associated <input> elements referenced purely by getElementById
in JS (authEls object) rather than being wrapped in a semantic <form> element with a submit
handler in several places — meaning the Enter key does not natively submit these forms unless
a keydown listener was separately wired up, which was not evident in the reviewed auth flow.
This is both a UX gap and a sign the form was built input-by-input rather than validated as a
cohesive whole.

## 2.2 CSS LAYER AUDIT (FILE-BY-FILE)
• style.css (256 lines) — Global reset + shared layout primitives. Contains 2 media queries
  (max-width: 768px, min-width: 1024px), suggesting a mobile-first-ish approach but with gaps
  in the 768–1024px tablet band, where no explicit breakpoint exists — likely to cause
  "in-between" scaling artifacts on iPad-class devices.

• Css/index.css (557 lines) — The largest stylesheet; single breakpoint at max-width: 768px.
  Layout is a mix of Flexbox (nav bars, card rows) and CSS Grid (the teacher-card grid and
  feature-tile grid), which is appropriate — Grid for 2D card layouts, Flexbox for 1D bars —
  showing the author does understand when to reach for which tool, even without a formal
  framework.

• Css/owner.css (425 lines) — Three breakpoints: min-width:768px, max-width:768px, and
  max-width:480px — the most thoroughly responsive file in the project (desktop/tablet/phone
  three-tier coverage). This is the pattern that should be extended to the other stylesheets.

• Css/quiz.css (249 lines) — Styles the exam-taking UI (timer chip, question palette,
  option buttons, proctoring widget). No dedicated media query was found in this file, which
  is a real risk given how information-dense the quiz screen is (timer + palette + question +
  4 options + nav buttons) — on a small phone screen this layout depends entirely on flex-wrap
  behavior rather than an explicit mobile layout, and is worth stress-testing at 360px width.

• Css/teacher.css (182 lines) — Powers the 8 teacher-profile pages; single breakpoint,
  consistent with Css/index.css.

• Css/Style.css (105 lines, capital S — coexists with lowercase style.css) — A small legacy/
  secondary stylesheet. Having both Style.css and style.css in the same project is a
  case-sensitivity landmine: this works today on Netlify's Linux-based case-sensitive
  filesystem, but is exactly the kind of naming collision that breaks silently if ever moved
  to a case-insensitive host (Windows/macOS default file systems), and is confusing for any
  new contributor.

Layout methodology overall: Flexbox and CSS Grid are used correctly and modernly — there is
no evidence of legacy float-based layout or absolute-positioning hacks for primary page
structure (absolute positioning is used appropriately for the notification banner, the
modal/overlay ecosystem, and the proctoring webcam widget, which are legitimate uses).

## 2.3 RESPONSIVE DESIGN ASSESSMENT
Breakpoints found across the entire codebase: 480px, 768px, and 1024px. This maps to a
conventional phone / tablet / desktop three-tier system, but it is NOT applied consistently —
owner.css has all three, index.css and teacher.css have only 768px, and quiz.css has none.
Practical consequence: the marketing pages (index/teacher) will look acceptable on both very
small phones and desktops (fluid CSS custom properties like --card-padding: clamp(1.25rem,
3vw, 2rem) do a lot of the responsive heavy lifting via clamp()), but the actual quiz-taking
experience — arguably the highest-stakes screen in the whole app, used during timed exams —
has the least explicit responsive treatment of any module.

## 2.4 ASSET OPTIMIZATION (IMAGES / MEDIA)
- Format mix: JPEG (majority), PNG, WEBP (one file, tanmay.webp), and SVG (india.svg,
  bjp.svg) are all present — there is no consistent "always serve WEBP with JPEG fallback"
  pipeline; almost everything is legacy JPEG/PNG despite WEBP support clearly being available
  and used for at least one asset.
- Lazy-loading: loading="lazy" IS present on at least 4 <img> tags in index.html (notification
  banner and two other image blocks), which is a good, modern practice — but it was not
  observed on the teacher-profile <img> tags in the /teachers/ pages reviewed, meaning the
  8 teacher pages likely eagerly load full-resolution photos above AND below the fold.
- No responsive <picture>/srcset markup was found anywhere — every image ships a single
  fixed-resolution file to every device, meaning a phone on a slow connection downloads the
  same multi-hundred-KB JPEG a 4K desktop would.
- The single biggest asset-optimization problem in the project is not the JPEGs at all: it is
  the 5 Android .apk files (akmsir.apk, pjsir.apk, rssir.apk, neelaxmi.apk, rssir.apk — ~7 MB
  each, ~35 MB total) and the 5.2 MB logo.mp4 sitting in the web root. These are almost
  certainly linked from somewhere in the HTML as direct download links, but bundling large
  binary distributables inside the same repository/deploy artifact as the website bloats the
  Netlify deploy, defeats CDN cache-busting granularity, and would be far better served from
  a dedicated object-storage bucket (Firebase Storage, S3, or even direct links to the Play
  Store / GitHub Releases) rather than the site's own git-tracked directory.


# MODULE 3: FRONT-END LOGIC & JAVASCRIPT EXECUTION ENVIRONMENT
(Note: per the brief's own Module 4, a genuine server/database layer does not exist in this
codebase — Firebase Firestore is the persistence layer called directly from these JS files.
This module treats Firestore calls as the de facto "back-end logic".)

## 3.1 auth.js / quiz/auth.js — AUTHENTICATION ENGINE (215–241 lines, near-duplicate files)
Trigger: loaded on every auth-gated page via <script src="auth.js"> or <script
src="quiz/auth.js">.

Step-by-step execution:
 1. firebase.initializeApp(firebaseConfig) runs immediately at parse time — this is why every
    page that needs auth re-declares the full config object rather than importing a shared
    module.
 2. authEls is built by querying ~15 DOM ids up front; several are guarded with `if
    (authEls.X)` before wiring handlers, which is defensive but also a sign these fields don't
    exist uniformly across every page that includes this script — i.e. the same auth.js is
    reused on pages with slightly different markup, and silently no-ops on the missing pieces.
 3. authEls.authToggle.onclick flips isLoginMode and toggles which registration-only fields
    (name/class/username/Gemini key) are visible — a single boolean drives a two-mode form.
 4. authEls.authBtn.onclick is the core state machine:
      - LOGIN branch: auth.signInWithEmailAndPassword(email, password) — a direct Firebase
        SDK call; no client-side rate limiting, no CAPTCHA, no lockout logic.
      - REGISTER branch: first performs a uniqueness pre-check via
        db.collection('users').where('username','==',username).get() (a live Firestore read
        BEFORE account creation — a classic username-enumeration side channel, see Module 5),
        then auth.createUserWithEmailAndPassword(...), then writes a full profile document
        keyed by uid, including geminiApiKey (the student's personal Google AI Studio key)
        stored in PLAINTEXT inside the users/{uid} Firestore document.
 5. The Google login handler (document.getElementById('google-login-btn').onclick) uses
    signInWithPopup(new firebase.auth.GoogleAuthProvider()), then does a Firestore existence
    check (userDoc.exists) and creates a profile on first login only — an idempotent
    "create-if-missing" pattern, implemented correctly.
 6. auth.onAuthStateChanged(user => {...}) is the central reactive hook: on login it sets
    CURRENT_USER_ID, hides the auth box, and opens a LIVE onSnapshot() listener on the user's
    own Firestore document (so profile edits reflect in real time without a page reload) — a
    legitimate and idiomatic Firestore pattern. It also reads ?uid= from the URL query string
    and calls the globally-scoped loadQuiz(uid) function defined in quiz.js — this is the
    cross-file coupling point: auth.js and quiz.js communicate only through implicit globals
    (typeof loadQuiz !== 'undefined'), not through any module import graph.
 7. window.toggleBookmark(questionId) is exposed on window specifically so it can be called
    from inline onclick="toggleBookmark(...)" HTML attributes generated by quiz.js's
    renderQuestion() — again, a global-function-as-glue pattern rather than addEventListener-
    based wiring.

quiz/auth.js ADDS one more block not present in the root copy: onTelegramAuth(user), a
callback invoked by the Telegram Login Widget. It writes directly to
db.collection('users').doc('tg_' + user.id) with { merge: true } and NO verification that the
Telegram auth payload's cryptographic hash was actually checked anywhere client-side — the
Telegram Widget is designed to have its `hash` field verified server-side with your bot token;
doing this purely in the browser means anyone who can call onTelegramAuth() with a
hand-crafted object gets a Firestore user document created for an arbitrary id (Module 5.2).

## 3.2 quiz/quiz.js — THE QUIZ ENGINE (1,355 lines, the largest and most complex file)
State model: fifteen+ module-level `let` variables (allQuestions, questions, currentIndex,
userAnswers, visitedQuestions, markedForReview, timeLeft, timerInterval, currentQuizIsTest,
lockedTestDurationMinutes, violationCount, violationLog, proctoringEnabled, currentLanguage,
faceModel, objectModel, proctorStream, ...) act as global mutable state — there is no
Redux/Zustand/Context equivalent; every function reads and writes these top-level variables
directly, which works at this scale but will not scale to more concurrent quiz "modes" without
becoming very hard to reason about (classic monolithic-function-plus-globals code smell).

Multilingual translation subsystem (lines 108–204):
 - protectMath(text)/restoreMath(text, segments): a clever pre/post-processing pair that
   regex-extracts every LaTeX/KaTeX span ($...$, $$...$$, \(...\), \[...\]) into numbered
   placeholders (%%MATH0%%, %%MATH1%%...) BEFORE sending text to translation, then restores
   the original math verbatim afterward — this correctly prevents machine translation from
   mangling formulas, which is a genuinely well-designed piece of engineering.
 - translateText(text, targetLang): calls the free/unofficial
   translate.googleapis.com/translate_a/single endpoint directly from the browser — the
   code's own comment block (lines 113–117) explicitly flags this as "unofficial,
   unauthenticated... rate-limited and not guaranteed" and recommends swapping in the paid
   Cloud Translation API for production. This is an unusually self-aware piece of code —
   the author already identified this exact risk.
 - applyStaticUILabel/applyQuestionLanguage/applyLanguage compose the above into a full
   UI-wide language switch triggered by langEls.select.onchange, covering 22 scheduled Indian
   languages per the code comment.

Question rendering & navigation (lines 234–405):
 - updateQuestionPalette() rebuilds the sidebar grid of question numbers, color-coding
   answered/visited/marked-for-review/unanswered states.
 - renderQuestion(): sets quizEls.qText.innerHTML = q.question directly from the question
   bank — this is a raw innerHTML assignment of content that (per sak.json) already contains
   embedded LaTeX and HTML-like markup; if a quiz's source data ever becomes user-editable
   (e.g. an admin content-management UI added later, or if quiz JSON is ever crowd-sourced),
   this becomes a direct stored-XSS vector (Module 5.1). It also dynamically builds each
   option <button> via template-literal innerHTML (btn.innerHTML = `<span class="${badgeClass}">
   ${key}</span>...`) interpolating q.options[key] straight into markup — same category of risk.
 - triggerZoom / imgContainer.innerHTML build an image-zoom lightbox for questions that embed
   a diagram image, again via innerHTML.

Timer & state machine (lines 405–460):
 - startTimer() runs a setInterval decrementing timeLeft every second, updating the time
   display, and calling submitQuiz(true) automatically on timeout — this is entirely
   client-side; pausing the tab (togglePause) stops the interval, and because no server clock
   is consulted, a user can manipulate their system clock or DevTools to freeze/extend
   effective time (Module 5 covers the fix — a server-verified timestamp).

Quiz bootstrapping (loadQuiz, lines 486–676):
 - loadQuiz(uid) fetches the quiz document from Firestore, checks currentQuizIsTest (test_quiz
   flag) to decide whether to show the free-navigation "practice" setup modal or force locked
   "test mode" with lockedTestDurationMinutes pulled directly from Firestore (explicitly, per
   an inline code comment, "read directly (not from the <select>) so it can't be tampered
   with" — a genuinely good defensive design instinct, even though it only partially closes
   the client-trust gap since the rest of the submission pipeline is still unverified).
 - It also checks sessionStorage.getItem('retryQuizConfig') to resume a "retry" flow, and
   removes it once consumed — a clean single-use-token pattern implemented with
   sessionStorage rather than a server round-trip.

AI PROCTORING SUBSYSTEM (lines 85–107, 676–1265) — the most architecturally unusual part of
the codebase:
 - Uses TensorFlow.js's blazeface (face detection) and coco-ssd (general object detection)
   models, loaded fully client-side (loadFaceModel/loadObjectModel), against a live
   getUserMedia() webcam stream (setupProctorCamera).
 - startFaceDetectionLoop() runs detection at a set cadence; handleFaceDetectionResult flags
   "no face" (noFaceSince timer) or "multiple faces" (multiFaceStreak) as violations;
   handleObjectDetectionResult scans for SUSPICIOUS_OBJECT_CLASSES = ['cell phone', 'laptop',
   'book', 'remote', 'tablet'] above an 0.6 confidence threshold, incrementing
   objectDetectStreak.
 - A unified violation counter (violationCount, MAX_VIOLATIONS = 3) governs a single warning
   system shared by proctoring events AND tab-switch/visibility events
   (handleVisibilityChange) AND fullscreen-exit (handleFullscreenChange) — the 4th violation
   auto-submits the quiz.
 - persistViolationState()/restoreViolationState() checkpoint the violation log to
   sessionStorage keyed per-quiz (violationStorageKey()), specifically so a page reload
   mid-test doesn't reset a student's strike count — a correct anti-cheat design decision.
 - The code comments are explicit and honest that this is "100% client-side — nothing here
   ever leaves the browser" — meaning proctoring is a self-reported honor system: an
   instructor never receives the webcam feed, a snapshot, or a server-verifiable audit trail;
   only the aggregated violationCount ends up in the Firestore submission document. This is
   an important limitation to be transparent about to any institute relying on it as an
   actual anti-cheating control (Module 5 elaborates).
 - Anti-cheat DOM hardening (setupAntiCheatingMeasures, lines 1265+): blocks right-click
   (contextmenu), and intercepts copy/paste/cut events during an active quiz
   (quizActive() check), plus a keydown listener blocking common DevTools shortcuts
   (Ctrl/Cmd+Shift+I/J/C and F12). This is best-effort obfuscation, not real security — all of
   it is trivially bypassed by disabling JavaScript, using browser reader/inspect tools not
   gated by a "key" keydown (e.g. the browser's own menu-based inspector, a second device, or
   simply viewing page source before the quiz loads) — this should be documented internally
   as a deterrent, not a control.

Persistence: saveProgress() (line 806) writes the full attempt state (currentIndex, timeLeft,
userAnswers, visitedQuestions, markedForReview, proctoringEnabled) to
db.collection('user_progress').doc(CURRENT_USER_ID).collection('saved_quizzes').doc
(currentQuizId) — a clean per-user/per-quiz sub-collection design that correctly scopes
"resume where I left off" state to (student, quiz) pairs.

## 3.3 quiz/result.js — SCORING, AI EXPLANATIONS, HISTORY (680 lines)
 - markdownToHtml(markdown) is a hand-rolled Markdown→HTML converter (not a library) —
   almost certainly a small set of regex replacements for **bold**, *italics*, and line
   breaks, whose output is then assigned via innerHTML in showGeminiApiModal/
   fetchExplanation (Module 5.1 — this is the single highest-value XSS target in the app,
   since it processes AI-model output, and a prompt-injected or maliciously-crafted upstream
   response could inject a <script> or event-handler attribute that executes in the student's
   authenticated session).
 - saveUserApiKey(key) persists a user-submitted Gemini API key back into their Firestore
   profile (users/{uid}.geminiApiKey) in plaintext — the exact same secret-storage anti-pattern
   noted in auth.js (Module 5.2).
 - fetchExplanation(questionDetails, isRegenerate) is the core AI call: it fetches
   https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
   with ?key=${userGeminiApiKey} appended directly to the URL query string. Because this
   executes in the browser, the fully-formed URL — including the live API key — is visible in
   the Network tab, browser history, any referrer header sent to a third party, and any proxy/
   CDN access logs. This is the single most consequential security finding in the project
   (elaborated fully in Module 5.2) because, unlike the Firebase apiKey (which is designed to
   be public), a Gemini API key is a billable, quota-bearing secret tied to the student's own
   Google account.
 - calculateRank(score, total), submitQuiz(isTimeout), updateSummaryData, renderFinalResult
   compute and render the final score breakdown entirely client-side from the in-memory
   `questions`/`userAnswers` arrays — again, nothing here is re-validated server-side, so a
   submitted score is exactly as trustworthy as the browser session that produced it.
 - checkFeedbackRequirement()/submitFeedback(rating)/skipFeedback() gate a post-quiz feedback
   prompt using a single localStorage.getItem('feedbackSubmitted') flag — global to the
   browser, not per-quiz or per-user, meaning the prompt is suppressed forever after the FIRST
   feedback submission on that device, regardless of which student account is later logged
   in on a shared/school computer (a real logic bug worth fixing — Module 6).
 - fetchHistory()/loadAttemptDetails(attemptId) read past attempts and render a per-quiz
   history list, filterable by result type via filterResults(type).

## 3.4 quiz/vedio.js — VIDEO SOLUTION PLAYER (337 lines)
 - parseVideoData(url) extracts a YouTube video ID (and presumably a start-time parameter)
   from a stored URL string via regex.
 - loadVideoSolution(quizId) fetches the relevant video metadata and calls
   renderCustomPlayer(videoId, startTime), which injects a fully custom-built HTML5/YouTube
   IFrame API player (play/pause button, progress bar, speed control) via innerHTML rather
   than using the stock YouTube embed chrome — a deliberate design choice for a branded,
   ad-free playback UI.
 - onPlayerReady/onPlayerStateChange are the YouTube IFrame API's standard event callbacks,
   wired to update the custom UI (playBtn icon swap, updateProgressBar()).
 - createSmartSnapshot(vidId, seconds) captures a still frame from the video (likely via a
   hidden <canvas> draw from the video element) as a base64 string, and
   addSnapshotToGallery(base64, seconds) renders it into a "notes gallery" — a nice small
   feature allowing students to bookmark a visual moment in a solution video.
 - ensureYouTubeApiLoaded() lazily injects the YouTube IFrame API <script> tag only when a
   video page actually needs it — good practice, avoids loading YouTube's script on every page.

## 3.5 teachers/pdf.js — PDF MODULE VIEWER (75 lines)
 - openPdf(link, title) rewrites Google Drive "view"/"edit" URLs to the "/preview" format,
   then delegates to renderPdfWithJS(fetchUrl).
 - renderPdfWithJS(url) uses PDF.js (pdfjsLib.getDocument(url)) to render page 1 onto a
   <canvas> at 1.5x scale; if PDF.js throws (most commonly due to Google Drive's CORS
   restrictions on cross-origin fetches), the catch block gracefully DEGRADES to an <iframe
   src="${url}"> fallback — this two-tier "try the good renderer, fall back to embed" pattern
   is a sound defensive-engineering choice.
 - sharePdfLink() builds a shareable deep-link (?pdf=<url>&title=<title>) and copies it via
   navigator.clipboard.writeText — consumed by the DOMContentLoaded listener at the bottom of
   the same file, which reads those same query params to auto-open a shared PDF on page load.

## 3.6 history.js — SIDEBAR/NAVIGATION UTILITY (45 lines)
 - goBack() wraps window.history.back(); a DOMContentLoaded check disables/relabels the back
   button as a "Home Page" button if window.history.length <= 1 (i.e., this was the user's
   entry page, so there is nothing to go back to) — a nice small UX touch.
 - toggleSidebar()/the outside-click listener implement a fairly standard mobile drawer
   pattern (toggle .active on the sidebar, .shifted on the main content, and auto-close on any
   click outside the sidebar or its .menu-toggle trigger).

## 3.7 DATA PERSISTENCE MAP (SUMMARY)
  Firestore (server-side, cross-device):
    users/{uid}                                — profile, bookmarks[], geminiApiKey (plaintext)
    users/{uid} (via .where('username','=='))   — pre-registration uniqueness check
    user_progress/{uid}/saved_quizzes/{quizId}  — in-progress attempt checkpoint
    (implied) quizzes/{quizId}, attempts/history collections read by result.js/quiz.js

  sessionStorage (per-tab, cleared on tab close):
    retryQuizConfig                              — one-shot "retry this quiz" config
    <violationStorageKey()>                       — per-quiz violation count/log, survives reload

  localStorage (persists indefinitely per-browser):
    theme                                         — dark/light mode toggle
    feedbackSubmitted                             — global flag suppressing the feedback modal

  In-memory only (lost on refresh):
    allQuestions/questions/userAnswers/visitedQuestions/markedForReview/checkedQuestions,
    faceModel/objectModel/proctorStream (webcam + AI models — explicitly never transmitted).


# MODULE 4: DATA MODELING — PROPOSED RELATIONAL SCHEMA

## 4.1 CURRENT FRONT-END DATA SHAPE
The application currently models data as Firestore documents: a flat `users` collection
keyed by Firebase uid (name, class, username, email, bookmarks[], geminiApiKey), a
`user_progress/{uid}/saved_quizzes/{quizId}` sub-collection for in-progress attempts, an
implied `quizzes` collection (containing test_quiz, durationMinutes, and an ordered question
array/reference), and static JSON files (sak.json) standing in for a real question bank. There
is no first-class "attempts/results" collection observed in the reviewed code beyond the
saved-progress checkpoint and whatever fetchHistory()/loadAttemptDetails() read — implying
scoring history may only exist informally.

## 4.2 PROPOSED PRODUCTION SQL SCHEMA
The script below normalizes the above into a relational model suitable for Postgres/MySQL,
were the team ever to migrate off (or supplement) Firestore with a relational store for
reporting, integrity constraints, and complex joins (e.g., leaderboards, cohort analytics)
that Firestore handles poorly.

```sql
-- ============================================================
-- NEELAXMI: THE HELPER — Proposed Relational Schema (PostgreSQL)
-- ============================================================

CREATE TABLE users (
    user_id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid         VARCHAR(128) NOT NULL UNIQUE,      -- bridges to Firebase Auth if kept
    email                VARCHAR(255) NOT NULL UNIQUE,
    username             VARCHAR(64)  NOT NULL UNIQUE,
    display_name         VARCHAR(120) NOT NULL,
    student_class        VARCHAR(20),                        -- e.g. "11", "12", "Dropper"
    auth_provider        VARCHAR(20)  NOT NULL DEFAULT 'password'
                         CHECK (auth_provider IN ('password','google','telegram')),
    password_hash        VARCHAR(255),                        -- NULL for OAuth-only accounts
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active            BOOLEAN NOT NULL DEFAULT TRUE
);

-- Secrets NEVER stored on the users row directly (see Module 5.2). A dedicated,
-- encrypted-at-rest, access-controlled table with its own audit trail instead:
CREATE TABLE user_api_credentials (
    credential_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    provider             VARCHAR(40)  NOT NULL DEFAULT 'gemini',
    encrypted_key        BYTEA NOT NULL,                      -- application-layer AES-GCM ciphertext
    key_last4            VARCHAR(4),                          -- for UI display only, never the real key
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, provider)
);

CREATE TABLE teachers (
    teacher_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                 VARCHAR(80)  NOT NULL UNIQUE,         -- e.g. 'ajay-sir'
    full_name            VARCHAR(120) NOT NULL,
    subject              VARCHAR(60)  NOT NULL,
    bio                  TEXT,
    photo_url            VARCHAR(500),
    is_active            BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE question_banks (
    bank_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                 VARCHAR(160) NOT NULL,
    subject              VARCHAR(60)  NOT NULL,
    created_by_teacher_id UUID REFERENCES teachers(teacher_id),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE questions (
    question_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id              UUID NOT NULL REFERENCES question_banks(bank_id) ON DELETE CASCADE,
    question_text        TEXT NOT NULL,                        -- may contain LaTeX segments
    image_url            VARCHAR(500),
    correct_option        CHAR(1) NOT NULL CHECK (correct_option IN ('A','B','C','D')),
    explanation_text      TEXT,
    difficulty           SMALLINT CHECK (difficulty BETWEEN 1 AND 5),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE question_options (
    option_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id          UUID NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    option_key           CHAR(1) NOT NULL CHECK (option_key IN ('A','B','C','D')),
    option_text          TEXT NOT NULL,
    UNIQUE (question_id, option_key)
);

CREATE TABLE quizzes (
    quiz_id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_id              UUID NOT NULL REFERENCES question_banks(bank_id),
    title                VARCHAR(200) NOT NULL,
    is_test_mode         BOOLEAN NOT NULL DEFAULT FALSE,       -- mirrors `test_quiz` flag
    duration_minutes     SMALLINT NOT NULL DEFAULT 20,
    question_start_idx   INT NOT NULL DEFAULT 0,
    question_end_idx     INT NOT NULL,
    is_published         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quiz_attempts (
    attempt_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quiz_id              UUID NOT NULL REFERENCES quizzes(quiz_id),
    user_id              UUID NOT NULL REFERENCES users(user_id),
    started_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at         TIMESTAMPTZ,
    server_time_left_s   INT,                                 -- server-authoritative countdown
    is_timeout_submit    BOOLEAN NOT NULL DEFAULT FALSE,
    score                NUMERIC(6,2),
    total_questions      SMALLINT NOT NULL,
    proctoring_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
    violation_count      SMALLINT NOT NULL DEFAULT 0,
    status               VARCHAR(20) NOT NULL DEFAULT 'in_progress'
                         CHECK (status IN ('in_progress','submitted','auto_submitted','abandoned')),
    UNIQUE (quiz_id, user_id, started_at)
);

CREATE TABLE quiz_attempt_answers (
    answer_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id           UUID NOT NULL REFERENCES quiz_attempts(attempt_id) ON DELETE CASCADE,
    question_id          UUID NOT NULL REFERENCES questions(question_id),
    selected_option       CHAR(1) CHECK (selected_option IN ('A','B','C','D')),
    is_marked_for_review  BOOLEAN NOT NULL DEFAULT FALSE,
    is_correct            BOOLEAN,
    answered_at           TIMESTAMPTZ,
    UNIQUE (attempt_id, question_id)
);

CREATE TABLE proctoring_violations (
    violation_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id           UUID NOT NULL REFERENCES quiz_attempts(attempt_id) ON DELETE CASCADE,
    violation_type       VARCHAR(30) NOT NULL
                         CHECK (violation_type IN ('no_face','multi_face','suspicious_object',
                                                    'tab_switch','fullscreen_exit')),
    occurred_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    detail                JSONB
);

CREATE TABLE bookmarks (
    user_id              UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    question_id          UUID NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, question_id)
);

CREATE TABLE feedback (
    feedback_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    attempt_id           UUID REFERENCES quiz_attempts(attempt_id),
    rating               SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    submitted_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for the query patterns the app actually performs
CREATE INDEX idx_attempts_user      ON quiz_attempts(user_id);
CREATE INDEX idx_attempts_quiz      ON quiz_attempts(quiz_id);
CREATE INDEX idx_answers_attempt    ON quiz_attempt_answers(attempt_id);
CREATE INDEX idx_questions_bank     ON questions(bank_id);
CREATE INDEX idx_violations_attempt ON proctoring_violations(attempt_id);
CREATE UNIQUE INDEX idx_users_username_lower ON users (LOWER(username));
```

Key design decisions worth calling out:
  - user_api_credentials is deliberately separated from `users` and stores an
    application-layer-encrypted value, not a plaintext column — directly remediating the
    geminiApiKey-in-Firestore-plaintext finding from Module 3.3/5.2.
  - quiz_attempts.server_time_left_s exists specifically so that "time remaining" is computed
    and stamped by a trusted server process (or Cloud Function) rather than trusted from the
    client's timeLeft variable, remediating the client-side-timer-trust gap in quiz.js.
  - proctoring_violations is a proper append-only audit log with a JSONB detail column so an
    institute can actually review what triggered each strike — something the current
    "count-only, nothing leaves the browser" design cannot offer at all.


# MODULE 5: SECURITY AUDIT & DESTRUCTIVE TESTING REPORT

## 5.1 FRONT-END SECURITY — XSS, DATA LEAKAGE, ACCESS CONTROL
**FINDING 5.1.1 — Multiple unsanitized innerHTML sinks (High).**
  quiz.js's renderQuestion() (q.question, q.options[key] interpolated into template-literal
  innerHTML), result.js's markdownToHtml() output assigned via innerHTML in
  showGeminiApiModal/fetchExplanation, and chat.html's renderMessage()/contact-list renderers
  all write dynamic strings into the DOM via innerHTML rather than textContent or a sanitizing
  library (e.g. DOMPurify). Today the question bank is static JSON the developer controls, so
  the practical risk is low — but result.js's data comes from a live third-party LLM response,
  and chat.html's data comes from OTHER USERS' typed messages, which is a materially higher-
  risk sink: any user who can get a crafted string ("<img src=x onerror=...>") into a chat
  message or display name will have it executed in every recipient's browser session,
  including any admin/teacher account that opens the same conversation. Recommendation: run
  every user- or model-supplied string through a sanitizer (DOMPurify.sanitize()) or switch to
  textContent + manual, allow-listed formatting before insertion.

**FINDING 5.1.2 — Client-side-only proctoring and business logic (High, business-integrity risk**
rather than classic "security" risk).
  Score computation, timer countdown, "test mode" lockdown, and the anti-cheat violation
  counter are all computed and enforced in the browser (Module 3.2/3.3). Any user with basic
  DevTools access can: set breakpoints and rewrite userAnswers before submitQuiz() runs, call
  window.toggleBookmark or other globals directly from the console, pause/resume the JS timer
  logic, or simply block the /generateContent and Firestore write network calls selectively.
  None of this is prevented by anything running on a trusted server, because there is no
  Cloud Function validating an attempt server-side before it is recorded as a final score.
  This matters especially for `test_quiz`-flagged (exam-simulation) attempts, where score
  integrity is presumably the entire point of the feature.

**FINDING 5.1.3 — Client-side "DevTools blocking" is theater, not a control (Low/Informational).**
  The keydown listener blocking F12/Ctrl+Shift+I/J/C (quiz.js ~line 1200) is trivially
  bypassed (browser menu → "More tools" → Developer Tools; a second monitor; disabling JS via
  browser flags; simply reading source before execution). It should be documented internally
  as a mild deterrent against casual snooping, not represented to institutes as an actual
  anti-cheat guarantee.

**FINDING 5.1.4 — Broken/implicit access control on "admin-ish" globals (Medium).**
  Functions like window.toggleBookmark are attached directly to window specifically so inline
  HTML onclick handlers can reach them — but this also means ANY script running in that page
  context (including a successful XSS payload from 5.1.1) can call them with an arbitrary
  questionId for the currently logged-in user with no additional confirmation.

## 5.2 DATA & FORM SECURITY — INPUT VALIDATION, CSRF, SQLI-EQUIVALENT RISKS
**FINDING 5.2.1 — Personal AI API keys stored and transmitted in the clear (Critical).**
  auth.js/quiz/auth.js write geminiApiKey straight into the users/{uid} Firestore document as
  plaintext (no encryption, no hashing — it must remain reversible since it's used directly,
  but it should never sit unencrypted at rest). Then, in result.js's fetchExplanation(),
  the key is appended as a URL query parameter:
      fetch(`https://generativelanguage.googleapis.com/.../gemini-2.5-flash:generateContent?key=${userGeminiApiKey}`)
  URL query parameters are logged by browsers (history), can appear in Referer headers sent to
  third-party resources loaded on the same page, and are visible to anyone with physical or
  remote access to the browser's DevTools Network tab. Because a Gemini API key is tied to a
  real Google Cloud/AI Studio project and is billable/quota-limited, a leaked key lets an
  attacker rack up usage (or exhaust quota) against the *student's own account*, not the
  platform's. Recommendation: never let a student-owned secret transit the browser at all if
  avoidable — proxy the AI call through a small serverless function (Cloud Function/Netlify
  Function) that holds the key server-side, or at minimum switch the call to send the key as
  an Authorization header (still visible in DevTools, but no longer in browser history/Referer)
  while migrating toward a server-side proxy as the real fix.

**FINDING 5.2.2 — Username-enumeration side channel (Medium).**
  The registration flow performs `db.collection('users').where('username','==',username).get()`
  BEFORE account creation and surfaces "Username already taken" as a distinguishable error —
  this lets any anonymous visitor enumerate which usernames exist by scripting repeated
  registration attempts. Recommendation: rate-limit this check (Firestore security rules +
  App Check, or a Cloud Function with per-IP throttling) and consider a generic error message
  during any automated/bulk probing pattern.

**FINDING 5.2.3 — No visible Firestore Security Rules in the shipped bundle (Critical —**
unverifiable from the client bundle alone, but worth flagging explicitly). This audit found no
firestore.rules file in the archive. Every read/write shown in auth.js/quiz.js/result.js
(users/{uid}, user_progress/.../saved_quizzes/{quizId}, bookmarks array updates) is only as
safe as whatever rules are configured on the Firebase project console — which cannot be
verified from a static code review. If rules are permissive (or default "test mode," which
Firebase ships with a 30-day open read/write default), then any authenticated OR even
unauthenticated client could read or overwrite ANY user's profile, saved quiz progress, or
bookmarks. Recommendation: as a matter of process, security rules should be version-controlled
alongside this code (a firestore.rules file committed to the same repo) so they can be
reviewed with the same rigor as the JS in future audits.

**FINDING 5.2.4 — Unverified Telegram login bridge (Medium-High).**
  onTelegramAuth(user) in quiz/auth.js writes a Firestore user document keyed by 'tg_' +
  user.id directly from whatever object the Telegram Widget callback hands it, with no
  server-side verification of Telegram's cryptographic `hash` field (which Telegram's own
  documentation requires you verify against your bot token to trust the payload). Without that
  check, anyone who can invoke this JS function with a forged {id, first_name, username}
  object can create/overwrite an account under an arbitrary Telegram identity.

**FINDING 5.2.5 — Duplicated Firebase project across chat.html and the quiz subsystem, with a**
mismatched apiKey (Medium — configuration-hygiene risk).
  chat.html initializes Firebase with apiKey "AIzaSyBYj1pZ-Ot9GGSDHy0_6VaqrMdO0m_eAbc", a
  DIFFERENT key from the one used everywhere else in the app
  ("AIzaSyAOJmK4igVb_P8cV6jLfZhFPGFmAZfVvRE"). Firebase Web API keys are not secrets in the
  traditional sense (they identify a project, not authorize access — actual authorization is
  the job of Security Rules) but running two separate Firebase projects/configs for one product
  fragments both the security-rules surface area that needs auditing AND the user data model
  (a user could conceivably exist in one project's Auth/Firestore and not the other), which is
  an operational risk worth consolidating regardless of the key's public nature.

**FINDING 5.2.6 — No visible client-side input validation on registration fields (Medium).**
  email/password/username/name/class fields are read directly via .value.trim() with no
  pattern-matching, length limits, or profanity/format checks observed in the reviewed JS
  before they are sent to Firebase Auth / written to Firestore. Firebase Auth itself enforces
  password complexity minimums and email format, providing a safety net, but username/name/
  class are stored with no length cap or character allow-list, which both invites malformed
  data and widens the XSS surface described in 5.1.1 if those fields are ever rendered
  elsewhere via innerHTML (e.g., a "class leaderboard" showing display names).

## 5.3 ASSET & PROTOCOL SECURITY — CSP, MEDIA, TRANSPORT
**FINDING 5.3.1 — No Content-Security-Policy observed (Medium-High).**
  None of the reviewed HTML documents include a <meta http-equiv="Content-Security-Policy">
  tag, and no _headers file (Netlify's mechanism for setting response headers, alongside the
  _redirects file already present in the project) was found defining one either. Given the
  large number of third-party CDN scripts loaded (Firebase SDK, TensorFlow.js, PDF.js, KaTeX,
  Font Awesome, Google Fonts, OneSignal, YouTube IFrame API, the unofficial Google Translate
  endpoint), a CSP is one of the single highest-leverage mitigations available for the XSS
  risks in 5.1.1 — even a moderately strict script-src allow-list naming only the specific
  CDNs actually in use would meaningfully blunt the impact of any successful injection.

**FINDING 5.3.2 — Third-party/unofficial API dependency (Medium).**
  quiz.js's translateText() calls translate.googleapis.com/translate_a/single, an unofficial,
  unauthenticated endpoint not intended for production traffic (the code's own comment says
  so). Beyond the reliability risk already self-documented, sending every question and option
  string through an undocumented third-party endpoint at translation time also means that
  content briefly transits a service with no contractual data-handling guarantee — worth
  reviewing against any student-data-privacy policy the institute has committed to (relevant
  given Privacy.md exists in the repo).

**FINDING 5.3.3 — Mixed binary distribution channel (Low, but worth flagging under "protocol/**
distribution security"). The five .apk files served directly from the same origin as the
website (rather than the Play Store) means users must sideload them, typically requiring
"install from unknown sources" to be enabled on their device — a real security hygiene
concern for the END USER (not the web app itself), since sideloading bypasses Play Protect's
scanning. If these APKs are genuinely first-party builds of the same product, distributing
through the Play Store (or at minimum publishing a SHA-256 checksum alongside each .apk link)
would let users verify integrity before installing.

**FINDING 5.3.4 — HTTPS/transport: no findings against the app itself (Informational/Positive).**
  All observed API endpoints (Firebase, Gemini, YouTube, Google Translate, Google Fonts,
  cdnjs) are HTTPS by default, and Netlify (the implied host, per the _redirects file) serves
  HTTPS by default as well — no evidence of mixed-content or plaintext-HTTP calls was found in
  this review.

## 5.4 SECURITY FINDINGS SUMMARY TABLE

| Severity | Finding |
|---|---|
| Critical | 5.2.1 — Gemini API key stored plaintext + sent via URL query string |
| Critical | 5.2.3 — No Firestore Security Rules file present/reviewable in-repo |
| High | 5.1.1 — Multiple unsanitized innerHTML sinks (chat + AI explanations) |
| High | 5.1.2 — All scoring/timer/proctoring logic is client-trusted, unverified server-side |
| High | 5.3.1 — No Content-Security-Policy anywhere in the app |
| Medium | 5.1.4 — window-global functions callable by any script in page context |
| Medium | 5.2.2 — Username-enumeration side channel on registration |
| Medium | 5.2.4 — Telegram login accepted without hash verification |
| Medium | 5.2.5 — Two divergent Firebase project configs (chat.html vs. rest of app) |
| Medium | 5.2.6 — No client-side input validation/length caps on profile fields |
| Medium | 5.3.2 — Reliance on an unofficial, unauthenticated translation endpoint |
| Low | 5.1.3 — DevTools-blocking keydown handler (deterrent only, not a control) |
| Low | 5.3.3 — APK sideload distribution without published checksums |


# MODULE 6: CODE QUALITY, REFACTORING ROADMAP & BEST PRACTICES

## 6.1 CODE SMELLS, REDUNDANCIES, DEAD CODE
  - auth.js and quiz/auth.js are ~98% byte-identical (215 vs. 241 lines, the extra 26 being
    the Telegram handler) — a textbook "copy-paste instead of shared module" smell, and it has
    ALREADY caused a real divergence bug: the two files' firebaseConfig.authDomain values
    disagree (quiznew-30700.firebaseapp.com vs. classupdates.netlify.app).
  - index.html and inde.html appear to be a full page and an accidental/backup duplicate —
    dead weight in the deploy, and a maintenance trap if only one of the two is ever updated
    going forward.
  - quizmain.html/quizzes.html exist both at project root and inside quiz/ — unclear which is
    canonical; likely one set is legacy and should be deleted or redirect-only.
  - neelaxmi.txt, t.txt, sak.json's non-descriptive filename (contains a physics/chemistry
    MCQ bank, not a service account key as the name misleadingly suggests) are naming/hygiene
    issues that will confuse the next contributor.
  - Style.css / style.css case-collision (Module 2.2) is a latent cross-platform bug.
  - quiz.js's monolithic 1,355-line single file mixes at least five distinct concerns
    (rendering/navigation, timer, i18n/translation, AI-webcam proctoring, anti-cheat DOM
    hardening) that would each benefit from being their own module.

## 6.2 SIDE-BY-SIDE REFACTORING EXAMPLES

### Example A: Centralizing the duplicated Firebase bootstrap

**CURRENT (duplicated verbatim in auth.js AND quiz/auth.js, with a config already out of sync):**
```javascript
// auth.js
const firebaseConfig = {
    apiKey: "AIzaSyAOJmK4igVb_P8cV6jLfZhFPGFmAZfVvRE",
    authDomain: "quiznew-30700.firebaseapp.com",
    projectId: "quiznew-30700",
    ...
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
```

**PROFESSIONALLY OPTIMIZED (single shared ES module, imported everywhere):**
```javascript
// /js/firebase-config.js  — the ONE place this ever gets written
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.x/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.x/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.x/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAOJmK4igVb_P8cV6jLfZhFPGFmAZfVvRE",
    authDomain: "classupdates.netlify.app",   // single source of truth
    projectId: "quiznew-30700",
    storageBucket: "quiznew-30700.firebasestorage.app",
    messagingSenderId: "107821881642",
    appId: "1:107821881642:web:7d708bda99196c85e42653",
};

export const app  = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);
```
```javascript
// auth.js and quiz/auth.js both become:
import { auth, db } from "/js/firebase-config.js";
// ...rest of the page-specific logic only
```
This alone eliminates the entire class of "config drifted between copies" bugs.

### Example B: Removing the innerHTML XSS sink in the quiz renderer

**CURRENT (quiz.js renderQuestion(), unsanitized template-literal innerHTML):**
```javascript
btn.innerHTML = `<span class="${badgeClass}">${key}</span>
                  <span class="text-lg ...">${q.options[key]}</span>`;
```

**PROFESSIONALLY OPTIMIZED (DOM APIs + a sanitizer for any HTML-bearing fields):**
```javascript
const badge = document.createElement('span');
badge.className = badgeClass;
badge.textContent = key;

const label = document.createElement('span');
label.className = isSel && !isChecked ? 'text-primary font-semibold' : 'dark:text-slate-300';
// Only sanitize-and-inject if the option genuinely needs markup (e.g. inline LaTeX markup
// that KaTeX will re-parse); otherwise textContent is both safer and faster:
label.innerHTML = DOMPurify.sanitize(q.options[key]);

btn.replaceChildren(badge, label);
```

### Example C: Removing the client-side-only Gemini API key from the network path

**CURRENT (result.js fetchExplanation(), key exposed in URL + stored in plaintext Firestore):**
```javascript
const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${userGeminiApiKey}`,
  { method: 'POST', body: JSON.stringify(payload) }
);
```

**PROFESSIONALLY OPTIMIZED (serverless proxy holds the secret; client sends only a Firebase ID**
token, never the AI key):
```javascript
// Client (result.js) — no secret ever touches the browser
const idToken = await firebase.auth().currentUser.getIdToken();
const response = await fetch('/.netlify/functions/explain', {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${idToken}`,
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ questionId, studentAnswer, correctAnswer })
});
```
```javascript
// Server (Netlify Function / Cloud Function — GEMINI_KEY lives only in server env vars)
exports.handler = async (event) => {
    const idToken = event.headers.authorization?.split(' ')[1];
    const decoded = await admin.auth().verifyIdToken(idToken);       // reject if invalid
    const { questionId, studentAnswer, correctAnswer } = JSON.parse(event.body);

    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': process.env.GEMINI_API_KEY,             // server-side secret only
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ /* build prompt from questionId/answers server-side */ })
      }
    );
    const data = await aiRes.json();
    return { statusCode: 200, body: JSON.stringify(data) };
};
```
This single change removes both the "key visible in the browser Network tab/history" leak and
the "plaintext key sitting in Firestore" storage risk in one move, and additionally lets the
institute meter/rate-limit AI usage centrally instead of per-student-key.

### Example D: Fixing the global feedback flag to be per-user/per-quiz

**CURRENT (result.js, a single global flag suppresses the feedback prompt forever, for everyone**
who shares that browser/device):
```javascript
function checkFeedbackRequirement() {
    const hasSubmitted = localStorage.getItem('feedbackSubmitted');
    ...
}
function submitFeedback(rating) {
    ...
    localStorage.setItem('feedbackSubmitted', 'true');
}
```

**PROFESSIONALLY OPTIMIZED (scoped to the specific user + quiz, backed by Firestore so it also**
survives a cleared localStorage / new device):
```javascript
async function checkFeedbackRequirement(userId, quizId) {
    const ref = db.collection('users').doc(userId)
                  .collection('feedback_given').doc(quizId);
    const snap = await ref.get();
    return !snap.exists;
}

async function submitFeedback(userId, quizId, rating) {
    await db.collection('users').doc(userId)
            .collection('feedback_given').doc(quizId)
            .set({ rating, submittedAt: firebase.firestore.FieldValue.serverTimestamp() });
}
```

## 6.3 ROADMAP TO A COMMERCIAL, PRODUCTION-READY PRODUCT
Phase 1 — Stop the bleeding (1–2 weeks):
  1. Move the Gemini API call behind a serverless proxy (Example C); stop storing the key in
     Firestore in plaintext at all once the proxy owns it.
  2. Write and commit an actual firestore.rules file to the repo, scoping every collection to
     "a user may only read/write their own uid-scoped documents," and test it with the
     Firebase Emulator Suite before deploying.
  3. Add a Content-Security-Policy (via a Netlify _headers file) allow-listing exactly the CDN
     origins in active use.
  4. Introduce DOMPurify (or an equivalent) on every innerHTML sink identified in 5.1.1,
     starting with chat.html (highest risk, user-to-user content).

Phase 2 — Consolidate & de-duplicate (2–4 weeks):
  5. Extract the Firebase bootstrap into one shared module (Example A) and delete the
     divergent quiz/auth.js copy in favor of an import.
  6. Delete inde.html and the duplicate root-level quizmain.html/quizzes.html once their
     canonical counterparts are confirmed; add basic redirects for any bookmarked old URLs.
  7. Factor quiz.js's five concerns (rendering, timer, i18n, proctoring, anti-cheat) into
     separate modules (quiz-render.js, quiz-timer.js, quiz-i18n.js, quiz-proctor.js,
     quiz-anticheat.js) sharing state through a small typed store rather than bare globals.
  8. Move the five .apk binaries and logo.mp4 out of the web-root git repo and into Firebase
     Storage / a CDN bucket / the Play Store, linking to them instead of bundling them.

Phase 3 — Harden the exam-integrity story (4–8 weeks):
  9. Introduce Cloud Functions that own: final score computation (recompute server-side from
     stored answers, never trust the client's number), the exam timer (stamp
     server_time_left_s per the Module 4 schema), and violation-count finalization — the
     client can still show a live countdown/violation UI for UX, but the number that gets
     recorded as "the" result should be server-computed.
  10. Add real Telegram-hash verification server-side before writing any tg_-prefixed user.
  11. Add a lightweight relational reporting layer (Module 4's schema, or a managed Postgres
      instance synced from Firestore via Cloud Functions) so institutes can run real
      cohort/leaderboard/analytics SQL queries that Firestore's document model struggles with.

Phase 4 — Polish for scale (ongoing):
  12. Add a build step (Vite or esbuild) to bundle/minify JS, enable ES module imports,
      and add Subresource Integrity hashes to every third-party CDN <script> tag.
      13. Standardize responsive breakpoints (Module 2.3) across all five stylesheets, giving
      Css/quiz.css — the highest-stakes screen — the same three-tier phone/tablet/desktop
      treatment already present in Css/owner.css.
  14. Add <picture>/srcset + WEBP-with-JPEG-fallback for every teacher photo, and audit for
      missing loading="lazy" on the /teachers/ pages.
  15. Resolve the Style.css/style.css case-collision and rename sak.json/neexmi.json to
      self-describing filenames (e.g. physics-mcq-bank.json, periodic-table-data.json).

---
*End Of Report*
