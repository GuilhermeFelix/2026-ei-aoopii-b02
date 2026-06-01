import { FaceLandmarker, FilesetResolver } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

// DOM Elements
const video = document.getElementById("webcam");
const canvas = document.getElementById("output-canvas");
const ctx = canvas.getContext("2d");

const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");
const loadingProgress = document.getElementById("loading-progress");
const btnToggleCam = document.getElementById("btn-toggle-cam");
const btnTakeSnapshot = document.getElementById("btn-take-snapshot");
const systemStatus = document.getElementById("system-status");
const statusDot = systemStatus.querySelector(".status-dot");
const statusLabel = systemStatus.querySelector(".status-label");
const fpsDisplay = document.getElementById("fps-display");

// Sliders Elements
const sliderScale = document.getElementById("slider-scale");
const sliderYOffset = document.getElementById("slider-y-offset");
const valScale = document.getElementById("val-scale");
const valYOffset = document.getElementById("val-y-offset");

// Base assets map (the 12 raw images to preload and chroma-key)
const BASE_ASSETS = {
    // Realistic Bases
    aviator: "assets/aviator.png",
    wayfarer: "assets/wayfarer.png",
    cateye: "assets/cateye.png",
    round: "assets/round.png",
    clubmaster: "assets/clubmaster.png",
    visor: "assets/visor.png",
    steampunk: "assets/steampunk.png",
    heart_realistic: "assets/heart_realistic.png",
    cyberpunk: "assets/cyberpunk.png",
    visor_sport: "assets/visor_sport.png",
    hexagonal: "assets/hexagonal.png",
    // Cartoon Bases
    pixel: "assets/pixel.png",
    heart: "assets/heart.png",
    star: "assets/star.png",
    disguise: "assets/disguise.png"
};

// Catalog configuration for 36 distinct glasses models using assets + hue/tint filters
const GLASSES_MODELS = {
    // === REALISTIC (24 Models) ===
    aviator_gold: {
        name: "Aviador Ouro",
        base: "aviator",
        scale: 2.2,
        yOffset: 0.05,
        type: "realistic",
        filter: null // Original (gold frame, dark lenses)
    },
    aviator_silver: {
        name: "Aviador Prata",
        base: "aviator",
        scale: 2.2,
        yOffset: 0.05,
        type: "realistic",
        filter: "hue-rotate(180deg) brightness(1.2) contrast(1.1)"
    },
    aviator_pink: {
        name: "Aviador Rosa",
        base: "aviator",
        scale: 2.2,
        yOffset: 0.05,
        type: "realistic",
        filter: "hue-rotate(285deg) saturate(1.8) brightness(1.1)"
    },
    wayfarer_black: {
        name: "Wayfarer Preto",
        base: "wayfarer",
        scale: 2.1,
        yOffset: 0.0,
        type: "realistic",
        filter: null // Original
    },
    wayfarer_red: {
        name: "Wayfarer Vermelho",
        base: "wayfarer",
        scale: 2.1,
        yOffset: 0.0,
        type: "realistic",
        filter: "hue-rotate(145deg) saturate(1.7) brightness(0.95)"
    },
    wayfarer_blue: {
        name: "Wayfarer Azul",
        base: "wayfarer",
        scale: 2.1,
        yOffset: 0.0,
        type: "realistic",
        filter: "hue-rotate(225deg) saturate(1.6) brightness(0.9)"
    },
    cateye_pink: {
        name: "Cat-Eye Rosa",
        base: "cateye",
        scale: 2.2,
        yOffset: -0.05,
        type: "realistic",
        filter: null // Original
    },
    cateye_black: {
        name: "Cat-Eye Preto",
        base: "cateye",
        scale: 2.2,
        yOffset: -0.05,
        type: "realistic",
        filter: "grayscale(1) brightness(0.4)"
    },
    cateye_teal: {
        name: "Cat-Eye Turquesa",
        base: "cateye",
        scale: 2.2,
        yOffset: -0.05,
        type: "realistic",
        filter: "hue-rotate(90deg) saturate(1.5)"
    },
    round_gold: {
        name: "Vintage Ouro",
        base: "round",
        scale: 2.15,
        yOffset: 0.05,
        type: "realistic",
        filter: null // Original
    },
    round_black: {
        name: "Vintage Preto",
        base: "round",
        scale: 2.15,
        yOffset: 0.05,
        type: "realistic",
        filter: "brightness(0.18) contrast(1.5)"
    },
    round_silver: {
        name: "Vintage Prata",
        base: "round",
        scale: 2.15,
        yOffset: 0.05,
        type: "realistic",
        filter: "grayscale(1) brightness(1.2)"
    },
    clubmaster_black: {
        name: "Clubmaster Preto",
        base: "clubmaster",
        scale: 2.15,
        yOffset: 0.0,
        type: "realistic",
        filter: null
    },
    clubmaster_tortoise: {
        name: "Clubmaster Tartaruga",
        base: "clubmaster",
        scale: 2.15,
        yOffset: 0.0,
        type: "realistic",
        filter: "sepia(0.65) saturate(2.2) hue-rotate(-22deg) brightness(0.95)"
    },
    clubmaster_silver: {
        name: "Clubmaster Prata",
        base: "clubmaster",
        scale: 2.15,
        yOffset: 0.0,
        type: "realistic",
        filter: "grayscale(1) brightness(1.1)"
    },
    visor_cyan: {
        name: "Visor Neon Ciano",
        base: "visor",
        scale: 2.3,
        yOffset: 0.02,
        type: "realistic",
        filter: null
    },
    visor_purple: {
        name: "Visor Neon Roxo",
        base: "visor",
        scale: 2.3,
        yOffset: 0.02,
        type: "realistic",
        filter: "hue-rotate(80deg) saturate(1.5)"
    },
    visor_green: {
        name: "Visor Neon Verde",
        base: "visor",
        scale: 2.3,
        yOffset: 0.02,
        type: "realistic",
        filter: "hue-rotate(240deg) saturate(1.8)"
    },
    steampunk_gold: {
        name: "Steampunk Bronze",
        base: "steampunk",
        scale: 2.2,
        yOffset: 0.02,
        type: "realistic",
        filter: null
    },
    steampunk_silver: {
        name: "Steampunk Prata",
        base: "steampunk",
        scale: 2.2,
        yOffset: 0.02,
        type: "realistic",
        filter: "grayscale(1) brightness(1.3) contrast(1.1)"
    },
    steampunk_copper: {
        name: "Steampunk Cobre",
        base: "steampunk",
        scale: 2.2,
        yOffset: 0.02,
        type: "realistic",
        filter: "sepia(0.4) saturate(1.8) hue-rotate(-40deg) brightness(0.85)"
    },
    heart_real_red: {
        name: "Coração Real Vermelho",
        base: "heart_realistic",
        scale: 2.2,
        yOffset: 0.0,
        type: "realistic",
        filter: null
    },
    heart_real_pink: {
        name: "Coração Real Rosa",
        base: "heart_realistic",
        scale: 2.2,
        yOffset: 0.0,
        type: "realistic",
        filter: "hue-rotate(60deg) saturate(1.4) brightness(1.2)"
    },
    heart_real_blue: {
        name: "Coração Real Azul",
        base: "heart_realistic",
        scale: 2.2,
        yOffset: 0.0,
        type: "realistic",
        filter: "hue-rotate(220deg) saturate(1.6) brightness(1.1)"
    },
    cyberpunk_neon: {
        name: "Cyberpunk Neon",
        base: "cyberpunk",
        scale: 2.3,
        yOffset: 0.02,
        type: "realistic",
        filter: null
    },
    cyberpunk_pink: {
        name: "Cyberpunk Rosa",
        base: "cyberpunk",
        scale: 2.3,
        yOffset: 0.02,
        type: "realistic",
        filter: "hue-rotate(120deg)"
    },
    visor_sport_silver: {
        name: "Viseira Desportiva Prata",
        base: "visor_sport",
        scale: 2.3,
        yOffset: 0.02,
        type: "realistic",
        filter: null
    },
    visor_sport_blue: {
        name: "Viseira Desportiva Azul",
        base: "visor_sport",
        scale: 2.3,
        yOffset: 0.02,
        type: "realistic",
        filter: "hue-rotate(180deg) saturate(1.5)"
    },
    hexagonal_gold: {
        name: "Hexagonal Ouro",
        base: "hexagonal",
        scale: 2.15,
        yOffset: 0.05,
        type: "realistic",
        filter: null
    },
    hexagonal_black: {
        name: "Hexagonal Preto",
        base: "hexagonal",
        scale: 2.15,
        yOffset: 0.05,
        type: "realistic",
        filter: "grayscale(1) brightness(0.2)"
    },

    // === CARTOON (12 Models) ===
    pixel_black: {
        name: "Pixel Preto",
        base: "pixel",
        scale: 2.3,
        yOffset: 0.02,
        type: "cartoon",
        filter: null // Original
    },
    pixel_blue: {
        name: "Pixel Azul",
        base: "pixel",
        scale: 2.3,
        yOffset: 0.02,
        type: "cartoon",
        filter: "hue-rotate(240deg) saturate(1.8)"
    },
    pixel_neon: {
        name: "Pixel Neon",
        base: "pixel",
        scale: 2.3,
        yOffset: 0.02,
        type: "cartoon",
        filter: "hue-rotate(100deg) saturate(2) brightness(1.2)"
    },
    heart_red: {
        name: "Coração Vermelho",
        base: "heart",
        scale: 2.2,
        yOffset: 0.0,
        type: "cartoon",
        filter: null // Original
    },
    heart_pink: {
        name: "Coração Rosa",
        base: "heart",
        scale: 2.2,
        yOffset: 0.0,
        type: "cartoon",
        filter: "hue-rotate(50deg) saturate(1.3) brightness(1.25)"
    },
    heart_gold: {
        name: "Coração Dourado",
        base: "heart",
        scale: 2.2,
        yOffset: 0.0,
        type: "cartoon",
        filter: "hue-rotate(180deg) saturate(1.4) brightness(1.15)"
    },
    star_yellow: {
        name: "Estrela Amarela",
        base: "star",
        scale: 2.3,
        yOffset: 0.0,
        type: "cartoon",
        filter: null // Original
    },
    star_green: {
        name: "Estrela Verde",
        base: "star",
        scale: 2.3,
        yOffset: 0.0,
        type: "cartoon",
        filter: "hue-rotate(120deg) saturate(1.8)"
    },
    star_pink: {
        name: "Estrela Neon",
        base: "star",
        scale: 2.3,
        yOffset: 0.0,
        type: "cartoon",
        filter: "hue-rotate(300deg) saturate(2.2) brightness(1.1)"
    },
    disguise_normal: {
        name: "Disfarce Engraçado",
        base: "disguise",
        scale: 2.6,
        yOffset: 0.52, // Fits nose/mustache overlay
        type: "cartoon",
        filter: null // Original
    },
    disguise_alien: {
        name: "Disfarce Alien",
        base: "disguise",
        scale: 2.6,
        yOffset: 0.52,
        type: "cartoon",
        filter: "hue-rotate(110deg) saturate(1.5)"
    },
    disguise_blue: {
        name: "Disfarce Avatar",
        base: "disguise",
        scale: 2.6,
        yOffset: 0.52,
        type: "cartoon",
        filter: "hue-rotate(200deg) saturate(1.8)"
    }
};

// App State
let faceLandmarker = null;
let webcamStream = null;
let isCameraActive = false;
let animationFrameId = null;

let activeTab = "realistic"; // "realistic" or "cartoon"
let selectedGlassesModel = "aviator_gold"; // Active model ID

// Adjustment values (linked to sliders)
let glassesScaleMultiplier = 2.2;
let glassesYOffsetPixels = 0;

// Render loop optimization & decay variables
let lastVideoTime = -1;
let latestLandmarks = null;
let consecutiveLostFrames = 0;
const MAX_GRACE_FRAMES = 5; // Decouples tracking drops from screen rendering to fix flickering

// FPS Counter variables
let lastFpsUpdate = 0;
let framesSinceLastFps = 0;

// Preload the base assets directly as transparent PNGs
const loadedBaseCanvas = {};
async function preloadBaseAssets() {
    for (const key in BASE_ASSETS) {
        const path = BASE_ASSETS[key];
        loadedBaseCanvas[key] = await new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "anonymous";
            img.onload = () => {
                resolve(img);
            };
            img.onerror = (err) => {
                console.error(`Falha ao carregar asset base: ${path}`, err);
                reject(err);
            };
            // Cache bust to ensure we load the new transparent images
            img.src = path + "?v=" + Date.now();
        });
    }
}

// Initialize MediaPipe and preload assets
async function initApp() {
    try {
        updateLoadingProgress("A carregar recursos de Rastreio...", 20);
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );
        
        updateLoadingProgress("A carregar modelo de landmarks faciais...", 50);
        faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            outputFaceBlendshapes: false,
            outputFacialTransformationMatrixes: false,
            numFaces: 1
        });
        
        updateLoadingProgress("A carregar assets de imagem...", 80);
        await preloadBaseAssets();
        
        updateLoadingProgress("A preparar catálogo...", 95);
        renderCatalog(activeTab);
        
        updateLoadingProgress("Pronto!", 100);
        await new Promise(resolve => setTimeout(resolve, 400));
        
        // Hide loading screen
        loadingOverlay.style.opacity = "0";
        setTimeout(() => {
            loadingOverlay.style.display = "none";
        }, 500);
        
        btnToggleCam.disabled = false;
        statusDot.className = "status-dot green";
        statusLabel.textContent = "Filtro Pronto";
        
        setUIState("READY");
        
    } catch (error) {
        console.error("Erro na inicialização da aplicação:", error);
        loadingText.innerHTML = `<span style="color: var(--accent-red)">Erro ao carregar Filtro!</span><br><small style="font-size:12px; margin-top:8px; display:block;">${error.message}</small>`;
        loadingProgress.style.backgroundColor = "var(--accent-red)";
        
        statusDot.className = "status-dot red";
        statusLabel.textContent = "Erro IA";
    }
}

// Render dynamic catalog cards according to selected type (realistic or cartoon)
function renderCatalog(tabType) {
    const catalogContainer = document.getElementById("glasses-catalog");
    if (!catalogContainer) return;
    
    catalogContainer.innerHTML = "";
    
    for (const key in GLASSES_MODELS) {
        const model = GLASSES_MODELS[key];
        if (model.type !== tabType) continue;
        
        const button = document.createElement("button");
        button.className = "catalog-card";
        if (key === selectedGlassesModel) {
            button.classList.add("active");
        }
        button.dataset.glasses = key;
        
                const baseName = model.base;
        const iconSrc = BASE_ASSETS[baseName] + "?v=1.5";
        
        // Apply filter directly in inline style so preview cards match the output color!
        const filterStyle = model.filter ? `style="filter: ${model.filter}"` : "";
        
        button.innerHTML = `
            <div class="card-img-wrapper">
                <img src="${iconSrc}" alt="${model.name}" ${filterStyle}>
            </div>
            <span>${model.name}</span>
        `;
        
        button.addEventListener("click", () => {
            selectGlassesModel(key);
        });
        
        catalogContainer.appendChild(button);
    }
}

// Update active selection of glasses
function selectGlassesModel(key) {
    selectedGlassesModel = key;
    
    // Update visual active classes
    const cards = document.querySelectorAll(".catalog-card");
    cards.forEach(c => {
        if (c.dataset.glasses === key) {
            c.classList.add("active");
        } else {
            c.classList.remove("active");
        }
    });
    
    // Reset sliders to model default
    const model = GLASSES_MODELS[selectedGlassesModel];
    if (model) {
        sliderScale.value = model.scale;
        glassesScaleMultiplier = model.scale;
        valScale.textContent = `${model.scale.toFixed(2)}x`;
        
        sliderYOffset.value = 0;
        glassesYOffsetPixels = 0;
        valYOffset.textContent = "0px";
    }
}

// Update text in loader overlay
function updateLoadingProgress(text, progress) {
    loadingText.textContent = text;
    loadingProgress.style.width = `${progress}%`;
}

// Toggle webcam state
async function toggleCamera() {
    if (isCameraActive) {
        stopCamera();
    } else {
        await startCamera();
    }
}

// Start webcam stream
async function startCamera() {
    try {
        btnToggleCam.disabled = true;
        btnToggleCam.innerHTML = "A iniciar...";
        
        webcamStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: "user"
            },
            audio: false
        });
        
        video.srcObject = webcamStream;
        
        video.onloadedmetadata = () => {
            video.play();
            
            // Sync canvas dimensions with video output
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            
            isCameraActive = true;
            btnToggleCam.disabled = false;
            btnToggleCam.className = "btn btn-danger";
            btnToggleCam.innerHTML = `
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <line x1="9" y1="9" x2="15" y2="15"></line>
                    <line x1="15" y1="9" x2="9" y2="15"></line>
                </svg>
                <span>Desligar Câmara</span>
            `;
            
            statusLabel.textContent = "Filtro Ativo";
            
            lastFpsUpdate = performance.now();
            framesSinceLastFps = 0;
            lastVideoTime = -1;
            latestLandmarks = null;
            consecutiveLostFrames = 0;
            
            // Launch loops
            animationFrameId = requestAnimationFrame(processVideoFrame);
        };
        
    } catch (error) {
        console.error("Erro ao iniciar webcam:", error);
        alert("Não foi possível aceder à câmara. Dê as permissões no browser e verifique se não está a ser usada por outra app.");
        btnToggleCam.disabled = false;
        btnToggleCam.className = "btn btn-primary";
        btnToggleCam.innerHTML = `
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                <circle cx="12" cy="13" r="4"></circle>
            </svg>
            <span>Ligar Câmara</span>
        `;
    }
}

// Stop webcam stream
function stopCamera() {
    isCameraActive = false;
    
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    
    if (webcamStream) {
        webcamStream.getTracks().forEach(track => track.stop());
        webcamStream = null;
    }
    
    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    btnToggleCam.className = "btn btn-primary";
    btnToggleCam.innerHTML = `
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
            <circle cx="12" cy="13" r="4"></circle>
        </svg>
        <span>Ligar Câmara</span>
    `;
    
    statusLabel.textContent = "Filtro Desativado";
    fpsDisplay.textContent = "FPS: 00";
    latestLandmarks = null;
    consecutiveLostFrames = 0;
    
    setUIState("READY");
}

// Loop for drawing frames and running landmark tracking (decoupled rendering fixes flickering)
async function processVideoFrame(now) {
    if (!isCameraActive) return;
    
    // FPS calculator
    framesSinceLastFps++;
    if (now - lastFpsUpdate >= 1000) {
        const fps = Math.round((framesSinceLastFps * 1000) / (now - lastFpsUpdate));
        fpsDisplay.textContent = `FPS: ${fps.toString().padStart(2, "0")}`;
        framesSinceLastFps = 0;
        lastFpsUpdate = now;
    }
    
    // 1. Draw raw video stream to canvas every single animation frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // 2. Perform landmark tracking only if the camera has delivered a new frame (30 FPS)
    if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const result = faceLandmarker.detectForVideo(video, now);
        
        if (result && result.faceLandmarks && result.faceLandmarks.length > 0) {
            latestLandmarks = result.faceLandmarks[0];
            consecutiveLostFrames = 0; // Reset lost counter
            setUIState("DETECTED");
        } else {
            // Apply Grace frame decay to prevent disappearing on single-frame misdetections
            consecutiveLostFrames++;
            if (consecutiveLostFrames >= MAX_GRACE_FRAMES) {
                latestLandmarks = null;
                setUIState("NOT_DETECTED");
            }
        }
    }
    
    // 3. Render overlays at full refresh rate (60+ FPS) if cached landmarks exist
    if (latestLandmarks) {
        drawGlassesOverlay(latestLandmarks);
        drawHUD(true, latestLandmarks);
    } else {
        drawHUD(false);
    }
    
    // Recurse next frame
    if (isCameraActive) {
        animationFrameId = requestAnimationFrame(processVideoFrame);
    }
}

// Positions, scales, and rotates the glasses image on face landmarks
function drawGlassesOverlay(landmarks) {
    const model = GLASSES_MODELS[selectedGlassesModel];
    if (!model) return;
    
    // Grab processed transparent canvas element from preloaded cache
    const baseImgCanvas = loadedBaseCanvas[model.base];
    if (!baseImgCanvas) return;
    
    // Key landmarks (33 Left Eye Outer, 263 Right Eye Outer, 168 Nose Bridge)
    const leftEye = landmarks[33];
    const rightEye = landmarks[263];
    const noseBridge = landmarks[168];
    
    const cw = canvas.width;
    const ch = canvas.height;
    
    // Convert to canvas pixel space
    const lx = leftEye.x * cw;
    const ly = leftEye.y * ch;
    const rx = rightEye.x * cw;
    const ry = rightEye.y * ch;
    
    // Calculate distance and vector between eyes
    const dx = rx - lx;
    const dy = ry - ly;
    const eyeDistance = Math.sqrt(dx * dx + dy * dy);
    
    // Center point of glasses sits on the nose bridge
    let cx = noseBridge.x * cw;
    let cy = noseBridge.y * ch;
    
    // Calculate rotation angle of head (roll)
    const angle = Math.atan2(dy, dx);
    
    // Determine glasses dimensions
    const glassesWidth = eyeDistance * glassesScaleMultiplier;
    const aspect = baseImgCanvas.height / baseImgCanvas.width;
    const glassesHeight = glassesWidth * aspect;
    
    // Apply Y adjustments perpendicular to the eye connection line
    const modelOffset = model.yOffset * eyeDistance;
    const manualOffset = glassesYOffsetPixels;
    const totalOffset = modelOffset + manualOffset;
    
    // Unit vector perpendicular to eye vector (pointing downwards)
    const ux = -dy / eyeDistance;
    const uy = dx / eyeDistance;
    
    cx += ux * totalOffset;
    cy += uy * totalOffset;
    
    // Draw on canvas using translate/rotate matrix operations
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    
    // Apply specific CSS color filter if defined
    if (model.filter) {
        ctx.filter = model.filter;
    }
    
    // Draw centered on position
    ctx.drawImage(
        baseImgCanvas,
        -glassesWidth / 2,
        -glassesHeight / 2,
        glassesWidth,
        glassesHeight
    );
    ctx.restore();
}

// Draw scientific HUD overlays around nose target (disabled)
function drawHUD(detected, landmarks = null) {
    // Hidden as requested
}

// Update header badge status dots
function setUIState(state) {
    if (!statusDot || !statusLabel) return;
    
    switch (state) {
        case "READY":
            statusDot.className = "status-dot orange";
            statusLabel.textContent = "Câmara Desligada";
            
            btnTakeSnapshot.disabled = true;
            btnTakeSnapshot.style.opacity = "0.5";
            btnTakeSnapshot.style.cursor = "not-allowed";
            break;
            
        case "NOT_DETECTED":
            statusDot.className = "status-dot orange";
            statusLabel.textContent = "Sem Rosto";
            
            btnTakeSnapshot.disabled = true;
            btnTakeSnapshot.style.opacity = "0.5";
            btnTakeSnapshot.style.cursor = "not-allowed";
            break;
            
        case "DETECTED":
            statusDot.className = "status-dot green";
            statusLabel.textContent = "Filtro Ativo";
            
            btnTakeSnapshot.disabled = false;
            btnTakeSnapshot.style.opacity = "1";
            btnTakeSnapshot.style.cursor = "pointer";
            break;
    }
}

// Take snapshot from canvas and trigger download
function takeSnapshot() {
    if (!isCameraActive) return;
    
    const snapCanvas = document.getElementById("snapshot-canvas");
    snapCanvas.width = canvas.width;
    snapCanvas.height = canvas.height;
    const snapCtx = snapCanvas.getContext("2d");
    
    snapCtx.save();
    // Mirror snapshot to match user's exact mirrored screen view
    snapCtx.translate(snapCanvas.width, 0);
    snapCtx.scale(-1, 1);
    
    snapCtx.drawImage(canvas, 0, 0);
    snapCtx.restore();
    
    // Download link
    const link = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.download = `tryon-glasses-${timestamp}.png`;
    link.href = snapCanvas.toDataURL("image/png");
    link.click();
}

// Wire sliders listeners
sliderScale.addEventListener("input", (e) => {
    glassesScaleMultiplier = parseFloat(e.target.value);
    valScale.textContent = `${glassesScaleMultiplier.toFixed(2)}x`;
});

sliderYOffset.addEventListener("input", (e) => {
    glassesYOffsetPixels = parseInt(e.target.value);
    valYOffset.textContent = `${glassesYOffsetPixels > 0 ? "+" : ""}${glassesYOffsetPixels}px`;
});

// Wire catalog tabs selection
const tabButtons = document.querySelectorAll(".tab-btn");
tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        tabButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        
        activeTab = btn.dataset.tab;
        renderCatalog(activeTab);
        
        // Auto select first model in new tab
        const firstModelKey = Object.keys(GLASSES_MODELS).find(k => GLASSES_MODELS[k].type === activeTab);
        if (firstModelKey) {
            selectGlassesModel(firstModelKey);
        }
    });
});

// Action buttons listeners
btnToggleCam.addEventListener("click", toggleCamera);
btnTakeSnapshot.addEventListener("click", takeSnapshot);

// Launch on load
window.addEventListener("DOMContentLoaded", initApp);
