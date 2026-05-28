// DOM Elements
const video = document.getElementById("webcam");
const canvas = document.getElementById("output-canvas");
const ctx = canvas.getContext("2d");

const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");
const loadingProgress = document.getElementById("loading-progress");
const btnToggleCam = document.getElementById("btn-toggle-cam");
const systemStatus = document.getElementById("system-status");
const statusDot = systemStatus.querySelector(".status-dot");
const statusLabel = systemStatus.querySelector(".status-label");
const fpsDisplay = document.getElementById("fps-display");

// Dashboard Elements
const detectionCard = document.getElementById("detection-card");
const statusEmoji = document.getElementById("status-emoji");
const detectionResult = document.getElementById("detection-result");
const detectionSubtext = document.getElementById("detection-subtext");
const confidencePercentage = document.getElementById("confidence-percentage");
const confidenceBar = document.getElementById("confidence-bar");
const aiPredictionList = document.getElementById("ai-prediction-list");

// Stats Elements
const statTotalFrames = document.getElementById("stat-total-frames");
const statAvgConfidence = document.getElementById("stat-avg-confidence");
const statWearingTime = document.getElementById("stat-wearing-time");
const btnClearHistory = document.getElementById("btn-clear-history");
const historyTbody = document.getElementById("history-tbody");

// App State
let model = null; // MobileNet Model
let webcamStream = null;
let isCameraActive = false;
let animationFrameId = null;

// Statistics Variables
let totalFrames = 0;
let confidenceSum = 0;
let confidenceCount = 0;
let timeWearingGlasses = 0; // in seconds
let lastFrameTime = 0;
let lastState = "INIT"; // "INIT", "NO_GLASSES", "GLASSES"
let stateStartTime = Date.now();

// FPS Calculation
let lastFpsUpdate = 0;
let framesSinceLastFps = 0;

// Scanner Animation variables
let scanAngle = 0;
let laserY = 0;
let laserDirection = 1;

// Keywords configuration for glasses detection
const GLASSES_KEYWORDS = ["spectacles", "specs", "eyeglasses", "glasses", "sunglasses", "sunglass", "goggles", "shades"];
const EXCLUDE_KEYWORDS = ["wine glass", "hourglass", "drinking glass", "magnifying glass", "looking glass", "spyglass", "glass, drinking glass"];

// Initialize TensorFlow.js and MobileNet
async function initApp() {
    try {
        updateLoadingProgress("A carregar TensorFlow.js...", 30);
        await delay(300);

        // Verify tf and mobilenet are loaded in the global window namespace
        if (typeof tf === 'undefined' || typeof mobilenet === 'undefined') {
            throw new Error("Bibliotecas TensorFlow.js ou MobileNet não foram carregadas corretamente a partir do CDN.");
        }

        updateLoadingProgress("A carregar modelo MobileNet v1...", 65);
        // Load MobileNet. By default, it loads MobileNet V1 with alpha = 1.0 (highest accuracy version)
        model = await mobilenet.load({
            version: 1,
            alpha: 1.0
        });

        updateLoadingProgress("Pronto!", 100);
        await delay(400);

        // Hide loading screen
        loadingOverlay.style.opacity = "0";
        setTimeout(() => {
            loadingOverlay.style.display = "none";
        }, 500);

        btnToggleCam.disabled = false;
        statusDot.className = "status-dot green";
        statusLabel.textContent = "Sistema Pronto";
        
        setUIState("READY");

    } catch (error) {
        console.error("Erro ao carregar o classificador:", error);
        loadingText.innerHTML = `<span style="color: var(--accent-red)">Erro ao inicializar IA!</span><br><small style="font-size:12px; margin-top:8px; display:block;">${error.message}</small>`;
        loadingProgress.style.backgroundColor = "var(--accent-red)";
        
        statusDot.className = "status-dot red";
        statusLabel.textContent = "Erro de Inicialização";
    }
}

// Toggle camera stream
async function toggleCamera() {
    if (isCameraActive) {
        stopCamera();
    } else {
        await startCamera();
    }
}

// Start camera stream
async function startCamera() {
    try {
        btnToggleCam.disabled = true;
        btnToggleCam.innerHTML = "A iniciar câmara...";

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
            
            // Sync canvas dimensions with video
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
            
            statusLabel.textContent = "Câmara Ativa";
            
            lastFrameTime = performance.now();
            lastFpsUpdate = performance.now();
            framesSinceLastFps = 0;
            
            // Launch processing loop
            animationFrameId = requestAnimationFrame(processVideoFrame);
        };

    } catch (error) {
        console.error("Erro ao abrir webcam:", error);
        alert("Não foi possível aceder à câmara. Dê as permissões no browser e verifique se não está a ser utilizada por outra aplicação.");
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

// Stop camera stream
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

    statusLabel.textContent = "Câmara Desligada";
    fpsDisplay.textContent = "FPS: 00";
    
    setUIState("READY");
    aiPredictionList.innerHTML = `<div class="empty-predictions">Ligue a câmara para iniciar o scanner...</div>`;
}

// Main Frame loop
async function processVideoFrame(now) {
    if (!isCameraActive) return;

    // FPS Counter
    framesSinceLastFps++;
    if (now - lastFpsUpdate >= 1000) {
        const fps = Math.round((framesSinceLastFps * 1000) / (now - lastFpsUpdate));
        fpsDisplay.textContent = `FPS: ${fps.toString().padStart(2, "0")}`;
        framesSinceLastFps = 0;
        lastFpsUpdate = now;
    }

    const deltaSec = (now - lastFrameTime) / 1000;
    lastFrameTime = now;

    // 1. Draw video onto canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 2. Classify current frame using MobileNet
    try {
        const predictions = await model.classify(video);
        
        // 3. Process predictions for glasses
        let bestGlassesPrediction = null;
        let highestGlassesProb = 0;
        
        predictions.forEach(pred => {
            const classNameLower = pred.className.toLowerCase();
            const matchesGlasses = GLASSES_KEYWORDS.some(k => classNameLower.includes(k));
            const matchesExclude = EXCLUDE_KEYWORDS.some(k => classNameLower.includes(k));
            
            if (matchesGlasses && !matchesExclude) {
                if (pred.probability > highestGlassesProb) {
                    highestGlassesProb = pred.probability;
                    bestGlassesPrediction = pred;
                }
            }
        });

        // 4. Update dynamic prediction panel
        updatePredictionPanel(predictions);

        // 5. Update Statistics
        totalFrames++;
        statTotalFrames.textContent = totalFrames;

        const hasGlasses = bestGlassesPrediction !== null && highestGlassesProb >= 0.05; // 5% confidence threshold

        if (hasGlasses) {
            const confidencePct = Math.round(highestGlassesProb * 100);
            confidenceSum += confidencePct;
            confidenceCount++;
            statAvgConfidence.textContent = `${Math.round(confidenceSum / confidenceCount)}%`;
            
            timeWearingGlasses += deltaSec;
            statWearingTime.textContent = `${Math.round(timeWearingGlasses)}s`;

            // Display "GLASSES DETECTED"
            const labelName = getCleanGlassesLabel(bestGlassesPrediction.className);
            setUIState("GLASSES", confidencePct, labelName);
            handleStateTransition("GLASSES", confidencePct, labelName);
            
            // Draw green scanning effects
            drawHUD(true, confidencePct, labelName);
        } else {
            // Display "NO GLASSES"
            setUIState("NO_GLASSES");
            handleStateTransition("NO_GLASSES");
            
            // Draw neutral blue scanning effects
            drawHUD(false, 0);
        }

    } catch (err) {
        console.error("Erro no processamento da imagem pela IA:", err);
    }

    // Next loop frame
    if (isCameraActive) {
        animationFrameId = requestAnimationFrame(processVideoFrame);
    }
}

// Clean up standard ImageNet class name into Portuguese labels
function getCleanGlassesLabel(className) {
    const primaryClass = className.split(",")[0].trim().toLowerCase();
    if (primaryClass.includes("sunglass") || primaryClass.includes("shades")) {
        return "Óculos de Sol (Sunglasses)";
    } else if (primaryClass.includes("goggle")) {
        return "Óculos de Proteção (Goggles)";
    } else {
        return "Óculos Graduados (Spectacles)";
    }
}

// Update Top predictions panel in the sidebar
function updatePredictionPanel(predictions) {
    aiPredictionList.innerHTML = "";
    
    predictions.forEach(pred => {
        const classNameLower = pred.className.toLowerCase();
        const matchesGlasses = GLASSES_KEYWORDS.some(k => classNameLower.includes(k)) && 
                              !EXCLUDE_KEYWORDS.some(k => classNameLower.includes(k));
        
        const probabilityPct = Math.round(pred.probability * 100);
        
        // Take the first label element from the comma-separated classes list
        const cleanName = pred.className.split(",")[0].trim();
        
        const itemDiv = document.createElement("div");
        itemDiv.className = `prediction-item ${matchesGlasses ? "matches-glasses" : ""}`;
        itemDiv.innerHTML = `
            <div class="prediction-name" title="${pred.className}">${cleanName}</div>
            <div class="prediction-bar-bg">
                <div class="prediction-bar-fill" style="width: ${probabilityPct}%"></div>
            </div>
            <div class="prediction-value">${probabilityPct}%</div>
        `;
        aiPredictionList.appendChild(itemDiv);
    });
}

// Draw a cool science fiction scanning radar HUD overlay
function drawHUD(detected, confidence = 0, label = "") {
    const themeColor = detected ? "rgba(16, 185, 129, 0.8)" : "rgba(6, 182, 212, 0.5)";
    const textColor = detected ? "#10b981" : "#06b6d4";
    
    ctx.shadowBlur = 0; // Clear shadows to ensure fast execution
    
    // Draw horizontal laser scanning sweep line
    ctx.strokeStyle = detected ? "rgba(16, 185, 129, 0.4)" : "rgba(6, 182, 212, 0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, laserY);
    ctx.lineTo(canvas.width, laserY);
    ctx.stroke();
    
    // Update laser sweep vertical coordinate
    laserY += 3 * laserDirection;
    if (laserY >= canvas.height || laserY <= 0) {
        laserDirection *= -1;
    }
    
    // Center of canvas
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    
    // Draw digital target reticle in the middle
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 1.5;
    
    // Outer circle
    ctx.beginPath();
    ctx.arc(cx, cy, 120, 0, 2 * Math.PI);
    ctx.stroke();
    
    // Inner crosshairs
    ctx.beginPath();
    // Left bracket
    ctx.moveTo(cx - 150, cy);
    ctx.lineTo(cx - 120, cy);
    // Right bracket
    ctx.moveTo(cx + 120, cy);
    ctx.lineTo(cx + 150, cy);
    // Top bracket
    ctx.moveTo(cx, cy - 150);
    ctx.lineTo(cx, cy - 120);
    // Bottom bracket
    ctx.moveTo(cx, cy + 120);
    ctx.lineTo(cx, cy + 150);
    ctx.stroke();
    
    // Draw corner indicators around the canvas view
    const pad = 20;
    const size = 30;
    ctx.lineWidth = 3;
    
    // Top-Left
    ctx.beginPath();
    ctx.moveTo(pad + size, pad);
    ctx.lineTo(pad, pad);
    ctx.lineTo(pad, pad + size);
    ctx.stroke();
    
    // Top-Right
    ctx.beginPath();
    ctx.moveTo(canvas.width - pad - size, pad);
    ctx.lineTo(canvas.width - pad, pad);
    ctx.lineTo(canvas.width - pad, pad + size);
    ctx.stroke();
    
    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(pad, canvas.height - pad - size);
    ctx.lineTo(pad, canvas.height - pad);
    ctx.lineTo(pad + size, canvas.height - pad);
    ctx.stroke();
    
    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(canvas.width - pad, canvas.height - pad - size);
    ctx.lineTo(canvas.width - pad, canvas.height - pad);
    ctx.lineTo(canvas.width - pad - size, canvas.height - pad);
    ctx.stroke();
    
    // Text labels on Canvas
    ctx.fillStyle = textColor;
    ctx.font = "bold 13px 'JetBrains Mono', monospace";
    ctx.fillText("SCANNER: ATIVO", pad + 10, pad + 45);
    ctx.fillText(`MODELO: MOBILENET_V1`, pad + 10, pad + 65);
    
    if (detected) {
        ctx.fillStyle = "#10b981";
        ctx.font = "bold 14px 'JetBrains Mono', monospace";
        ctx.fillText(`DETETADO: ${label.toUpperCase()}`, cx - 140, cy - 130);
        ctx.fillText(`CONF: ${confidence}%`, cx - 50, cy + 140);
        
        // Draw green bounding rings on center target
        ctx.strokeStyle = "rgba(16, 185, 129, 0.8)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 125, scanAngle, scanAngle + 0.5 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 125, scanAngle + Math.PI, scanAngle + 1.5 * Math.PI);
        ctx.stroke();
        
        scanAngle += 0.03; // Rotate rings
    }
}

// Update state display panels in index.html
function setUIState(state, confidence = 0, labelName = "") {
    detectionCard.className = "card glass status-card";
    
    switch (state) {
        case "READY":
            detectionCard.classList.remove("detected", "not-detected");
            statusEmoji.textContent = "📹";
            detectionResult.textContent = "Câmara Inativa";
            detectionSubtext.textContent = "Ligue a câmara para iniciar o scanner.";
            confidencePercentage.textContent = "0%";
            confidenceBar.style.width = "0%";
            break;
            
        case "NO_GLASSES":
            detectionCard.classList.add("not-detected");
            statusEmoji.textContent = "👤";
            detectionResult.textContent = "Sem Óculos";
            detectionSubtext.textContent = "Nenhum par de óculos identificado na imagem.";
            confidencePercentage.textContent = "0%";
            confidenceBar.style.width = "0%";
            break;
            
        case "GLASSES":
            detectionCard.classList.add("detected");
            statusEmoji.textContent = "👓";
            detectionResult.textContent = "Óculos Detetados!";
            detectionSubtext.textContent = labelName;
            confidencePercentage.textContent = `${confidence}%`;
            confidenceBar.style.width = `${confidence}%`;
            break;
    }
}

// Log transitions in history
function handleStateTransition(newState, confidence = 0, labelName = "") {
    if (newState === lastState) {
        return;
    }
    
    const timeInPrevState = Date.now() - stateStartTime;
    // Buffer transition updates slightly to filter momentary glitches
    if (timeInPrevState < 1200 && lastState !== "INIT") {
        return;
    }

    lastState = newState;
    stateStartTime = Date.now();

    const now = new Date();
    const timeStr = now.toTimeString().split(" ")[0];

    let eventText = "";
    let eventClass = "";
    let confText = confidence > 0 ? `${confidence}%` : "-";

    if (newState === "GLASSES") {
        // Ex: "Óculos de Sol Detetados" or "Óculos Graduados Detetados"
        const isSun = labelName.toLowerCase().includes("sol") || labelName.toLowerCase().includes("sun");
        eventText = isSun ? "Óculos Sol Detetados" : "Óculos Grad. Detetados";
        eventClass = "wearing";
    } else if (newState === "NO_GLASSES") {
        eventText = "Óculos Removidos";
        eventClass = "not-wearing";
    } else {
        return;
    }

    logEvent(timeStr, eventText, eventClass, confText);
}

// Add event list row to History table
function logEvent(time, event, eventClass, confidence) {
    const emptyRow = historyTbody.querySelector(".empty-row");
    if (emptyRow) {
        historyTbody.innerHTML = "";
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td class="log-time">${time}</td>
        <td class="log-event ${eventClass}">${event}</td>
        <td class="log-conf">${confidence}</td>
    `;

    historyTbody.insertBefore(tr, historyTbody.firstChild);

    if (historyTbody.children.length > 50) {
        historyTbody.removeChild(historyTbody.lastChild);
    }
}

// Clear History logs and reset statistics counter
function clearHistory() {
    historyTbody.innerHTML = `
        <tr class="empty-row">
            <td colspan="3">Nenhum evento registado nesta sessão</td>
        </tr>
    `;
    totalFrames = 0;
    confidenceSum = 0;
    confidenceCount = 0;
    timeWearingGlasses = 0;
    
    statTotalFrames.textContent = "0";
    statAvgConfidence.textContent = "0%";
    statWearingTime.textContent = "0s";
}

// Helpers
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function updateLoadingProgress(text, progress) {
    loadingText.textContent = text;
    loadingProgress.style.width = `${progress}%`;
}

// Listeners
btnToggleCam.addEventListener("click", toggleCamera);
btnClearHistory.addEventListener("click", clearHistory);

// Start
window.addEventListener("DOMContentLoaded", initApp);
