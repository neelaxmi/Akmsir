// video.js

const videoEls = {
    view: document.getElementById('view-video'),
    container: document.getElementById('video-content-area'),
    notesArea: document.getElementById('video-notes-area'),
};

// Global Player State
let player; 
let updateInterval;
let currentVideoId = '';
const COMPANY_LOGO_URL = '/pictures/neelaxmi.png'; // Path to your logo

/**
 * 1. Robust URL Parser
 * Handles Shorts, Live, Standard, and Time params (t=120s)
 */
const parseVideoData = (url) => {
    try {
        // Regex to catch ID and potential 't' (time) parameter
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*)(?:.*[?&]t=(\w+))?/;
        const match = url.match(regExp);

        if (match && match[2].length === 11) {
            return {
                id: match[2],
                startTime: match[3] ? parseInt(match[3].replace('s', '')) : 0
            };
        }
        return null;
    } catch (e) {
        console.error("URL Parsing failed", e);
        return null;
    }
};

/**
 * 2. Main Loader Function
 */
const loadVideoSolution = async (quizId) => {
    console.group(`🎬 Video Solution: ${quizId}`);
    
    // Reset Container
    videoEls.container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-[400px] bg-slate-900 rounded-xl">
            <span class="loader w-12 h-12 border-4 border-t-red-600 border-slate-700 rounded-full animate-spin"></span>
            <p class="mt-4 text-slate-400">Loading Player...</p>
        </div>
    `;

    // Ensure YouTube API is loaded
    await ensureYouTubeApiLoaded();

    try {
        const doc = await db.collection('quizzes').doc(quizId).get();
        if (!doc.exists) throw new Error("Quiz not found");
        
        const data = doc.data();
        if (!data.videoSolutionUrl) throw new Error("No video URL provided");

        const videoData = parseVideoData(data.videoSolutionUrl);
        if (!videoData) throw new Error("Invalid YouTube URL");

        currentVideoId = videoData.id;
        renderCustomPlayer(videoData.id, videoData.startTime);

    } catch (e) {
        renderErrorState(e.message);
    }
    console.groupEnd();
};

/**
 * 3. Render the Custom Player UI
 */
const renderCustomPlayer = (videoId, startTime = 0) => {
    videoEls.container.innerHTML = `
        <div id="video-wrapper" class="video-wrapper relative w-full pb-[56.25%] bg-black rounded-xl overflow-hidden shadow-2xl group paused">
            <div id="yt-player-placeholder" class="absolute inset-0 w-full h-full"></div>

            <img src="${COMPANY_LOGO_URL}" 
                 class="absolute top-4 right-4 w-24 opacity-50 hover:opacity-100 transition-opacity z-20 pointer-events-none" 
                 alt="Company Logo">

            <div class="control-bar absolute bottom-0 left-0 w-full px-4 py-3 z-30 flex flex-col gap-2">
                
                <input type="range" id="seek-bar" value="0" max="100" class="video-range w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer">

                <div class="flex items-center justify-between text-white">
                    <div class="flex items-center gap-4">
                        <button id="btn-play" class="hover:text-red-500 transition"><i class="fa-solid fa-play text-xl"></i></button>
                        
                        <span class="text-xs font-mono tracking-wider">
                            <span id="cur-time">00:00</span> / <span id="dur-time">00:00</span>
                        </span>
                    </div>

                    <div class="flex items-center gap-4">
                        <div class="relative group/speed">
                            <button class="text-xs font-bold bg-white/10 px-2 py-1 rounded hover:bg-white/20">1x</button>
                            <div class="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-black/90 rounded-lg p-2 hidden group-hover/speed:flex flex-col gap-1 min-w-[60px]">
                                <button onclick="changeSpeed(0.5)" class="text-xs hover:text-red-400 py-1">0.5x</button>
                                <button onclick="changeSpeed(1)" class="text-xs hover:text-red-400 py-1">1.0x</button>
                                <button onclick="changeSpeed(1.5)" class="text-xs hover:text-red-400 py-1">1.5x</button>
                                <button onclick="changeSpeed(2)" class="text-xs hover:text-red-400 py-1">2.0x</button>
                            </div>
                        </div>

                        <button id="btn-snap" class="hover:text-red-500 transition" title="Take Smart Snap">
                            <i class="fa-solid fa-camera"></i>
                        </button>
                        <button id="btn-fs" class="hover:text-red-500 transition"><i class="fa-solid fa-expand"></i></button>
                    </div>
                </div>
            </div>
        </div>
        
        <div id="snapshots-container" class="mt-6 grid grid-cols-2 md:grid-cols-3 gap-4"></div>
    `;

    // Initialize YouTube API Player
    player = new YT.Player('yt-player-placeholder', {
        videoId: videoId,
        playerVars: {
            'playsinline': 1,
            'controls': 0,        // Hide native controls
            'rel': 0,            // Hide related videos
            'modestbranding': 1, // Minimize logo
            'fs': 0,             // Hide native fullscreen button
            'iv_load_policy': 3, // Hide annotations
            'start': startTime
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
};

/**
 * 4. Player Controller Logic
 */
const onPlayerReady = (event) => {
    const wrapper = document.getElementById('video-wrapper');
    const playBtn = document.getElementById('btn-play');
    const seekBar = document.getElementById('seek-bar');
    const fsBtn = document.getElementById('btn-fs');
    const snapBtn = document.getElementById('btn-snap');

    // Set Total Duration
    document.getElementById('dur-time').innerText = formatTime(player.getDuration());

    // --- Event Listeners ---

    // Play/Pause
    playBtn.addEventListener('click', () => {
        const state = player.getPlayerState();
        if (state === 1) player.pauseVideo();
        else player.playVideo();
    });

    // Seek
    seekBar.addEventListener('input', (e) => {
        const time = (player.getDuration() / 100) * e.target.value;
        player.seekTo(time, true);
    });

    // Fullscreen
    fsBtn.addEventListener('click', () => {
        if (!document.fullscreenElement) {
            wrapper.requestFullscreen().catch(err => console.log(err));
        } else {
            document.exitFullscreen();
        }
    });

    // Screenshot Logic
    snapBtn.addEventListener('click', async () => {
        const time = player.getCurrentTime();
        await createSmartSnapshot(currentVideoId, time);
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (!document.fullscreenElement && !wrapper.contains(document.activeElement)) return;
        
        if (e.code === 'Space') {
            e.preventDefault();
            playBtn.click();
        } else if (e.code === 'ArrowRight') {
            player.seekTo(player.getCurrentTime() + 5, true);
        } else if (e.code === 'ArrowLeft') {
            player.seekTo(player.getCurrentTime() - 5, true);
        }
    });

    // Start Update Loop
    updateInterval = setInterval(updateProgressBar, 500);
};

const onPlayerStateChange = (event) => {
    const wrapper = document.getElementById('video-wrapper');
    const playBtn = document.getElementById('btn-play');

    if (event.data === YT.PlayerState.PLAYING) {
        wrapper.classList.remove('paused');
        playBtn.innerHTML = '<i class="fa-solid fa-pause text-xl"></i>';
    } else {
        wrapper.classList.add('paused');
        playBtn.innerHTML = '<i class="fa-solid fa-play text-xl"></i>';
    }
};

const updateProgressBar = () => {
    if (!player || !player.getCurrentTime) return;
    
    const currentTime = player.getCurrentTime();
    const duration = player.getDuration();
    
    document.getElementById('cur-time').innerText = formatvideoTime(currentTime);
    
    if (duration > 0) {
        document.getElementById('seek-bar').value = (currentTime / duration) * 100;
    }
};

const changeSpeed = (rate) => {
    if(player) player.setPlaybackRate(rate);
};

/**
 * 5. Smart Snapshot Generator
 * Creates a Base64 image using the thumbnail + Timestamp overlay
 */
const createSmartSnapshot = async (vidId, seconds) => {
    // 1. Get High Res Thumbnail
    const thumbUrl = `https://img.youtube.com/vi/${vidId}/hqdefault.jpg`;
    
    // 2. Create a Canvas to composite
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    // Cross origin is tricky with YouTube, so we fallback to visual UI if fetch fails
    img.crossOrigin = "Anonymous";
    img.src = thumbUrl;

    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw Image
        ctx.drawImage(img, 0, 0);

        // Draw Overlay (Dark Gradient at bottom)
        const grad = ctx.createLinearGradient(0, canvas.height - 80, 0, canvas.height);
        grad.addColorStop(0, "transparent");
        grad.addColorStop(1, "rgba(0,0,0,0.8)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw Timestamp Text
        ctx.font = "bold 30px Arial";
        ctx.fillStyle = "white";
        ctx.textAlign = "right";
        ctx.fillText(`Timestamp: ${formatvideoTime(seconds)}`, canvas.width - 20, canvas.height - 20);

        // Draw Logo/Watermark text
        ctx.font = "20px Arial";
        ctx.fillStyle = "#ef4444"; // Red
        ctx.textAlign = "left";
        ctx.fillText("VIDEO NOTES", 20, canvas.height - 20);

        // Convert to Base64
        const base64Image = canvas.toDataURL("image/jpeg", 0.8);
        
        // Add to UI
        addSnapshotToGallery(base64Image, seconds);
    };

    img.onerror = () => {
        console.warn("Could not load CORS image for canvas, using fallback.");
        // Fallback: Just save metadata
    };
};

const addSnapshotToGallery = (base64, seconds) => {
    const container = document.getElementById('snapshots-container');
    const card = document.createElement('div');
    card.className = "bg-white dark:bg-slate-800 rounded-lg shadow p-2 animate-fade-in cursor-pointer hover:ring-2 ring-red-500 transition";
    card.onclick = () => {
        player.seekTo(seconds, true);
        player.playVideo();
        window.scrollTo({ top: videoEls.container.offsetTop, behavior: 'smooth' });
    };

    card.innerHTML = `
        <div class="relative rounded overflow-hidden mb-2">
            <img src="${base64}" class="w-full object-cover aspect-video">
            <div class="absolute inset-0 bg-black/0 hover:bg-black/20 flex items-center justify-center transition">
                <i class="fa-solid fa-play text-white opacity-0 hover:opacity-100 drop-shadow-lg text-2xl"></i>
            </div>
        </div>
        <div class="flex justify-between items-center px-1">
            <span class="text-xs font-bold text-slate-500">Jump to ${formatvideoTime(seconds)}</span>
            <i class="fa-solid fa-arrow-turn-up text-xs text-blue-500"></i>
        </div>
    `;
    container.prepend(card);
};

// --- Utilities ---

const formatvideoTime = (time) => {
    const min = Math.floor(time / 60);
    const sec = Math.floor(time % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
};

const ensureYouTubeApiLoaded = () => {
    return new Promise((resolve) => {
        if (window.YT && window.YT.Player) {
            resolve();
        } else {
            const tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
            window.onYouTubeIframeAPIReady = resolve;
        }
    });
};

const renderErrorState = (msg) => {
    videoEls.container.innerHTML = `<div class="p-8 text-center text-red-500 bg-red-50 rounded-xl border border-red-200">${msg}</div>`;
};
