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
let currentScanMode = "sunglasses"; // Active scanning mode: "sunglasses", "spectacles", or "special"

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

// Crop & Smoothing Variables
const SCAN_SIZE = 260; // Size of the scanner square (drawn visually)
let confidenceHistory = []; // Rolling history of confidence scores for stability

// Keywords configuration for glasses detection
const GLASSES_KEYWORDS = ["spectacles", "specs", "eyeglasses", "glasses", "sunglasses", "sunglass", "goggles", "shades"];
const EXCLUDE_KEYWORDS = ["wine glass", "hourglass", "drinking glass", "magnifying glass", "looking glass", "spyglass", "glass, drinking glass"];

// Initialize TensorFlow.js and MobileNet
async function initApp() {
    try {
        updateLoadingProgress("A carregar TensorFlow.js...", 30);
        await delay(300);

        // Verify libraries are loaded in the global window namespace
        if (typeof tf === 'undefined' || typeof mobilenet === 'undefined') {
            throw new Error("Bibliotecas TensorFlow.js ou MobileNet não foram carregadas corretamente a partir do CDN.");
        }

        updateLoadingProgress("A carregar modelo MobileNet v1...", 65);
        // Load MobileNet (alpha 1.0)
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
            
            // Clear confidence history
            confidenceHistory = [];
            
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

    // 2. Classify current frame using MobileNet directly querying top 15 predictions
    try {
        const predictions = await model.classify(video, 15);
        
        if (statusLabel.textContent.startsWith("Erro")) {
            statusDot.className = "status-dot green";
            statusLabel.textContent = "Câmara Ativa";
        }

        // 3. Process predictions based on selected active scan mode
        let bestGlassesPrediction = null;
        let highestGlassesProb = 0;
        let detectedType = null; // "sunglasses", "spectacles", or "goggles"
        
        predictions.forEach(pred => {
            const classNameLower = pred.className.toLowerCase();
            const matchesExclude = EXCLUDE_KEYWORDS.some(k => classNameLower.includes(k));
            if (matchesExclude) return;

            if (currentScanMode === "sunglasses") {
                // Sunglasses mode: Look for sunglasses classes
                const isSun = classNameLower.includes("sunglasses") || classNameLower.includes("sunglass") || classNameLower.includes("shades");
                if (isSun && pred.probability >= 0.12) {
                    if (pred.probability > highestGlassesProb) {
                        highestGlassesProb = pred.probability;
                        bestGlassesPrediction = pred;
                        detectedType = "sunglasses";
                    }
                }
            } else if (currentScanMode === "spectacles") {
                // Prescription/Normal Glasses mode: Look for spectacles
                const isSpec = classNameLower.includes("spectacles") || classNameLower.includes("specs") || classNameLower.includes("eyeglasses") || classNameLower.includes("glasses");
                // Special Fallback: clear glasses frames often register as sunglasses with low confidence (e.g. 2.5% to 28%)
                const isSunFallback = (classNameLower.includes("sunglasses") || classNameLower.includes("sunglass")) && pred.probability < 0.28 && pred.probability >= 0.025;
                
                if (isSpec || isSunFallback) {
                    if (pred.probability > highestGlassesProb) {
                        highestGlassesProb = pred.probability;
                        bestGlassesPrediction = {
                            className: isSpec ? pred.className : "spectacles, specs, eyeglasses, glasses",
                            probability: pred.probability
                        };
                        detectedType = "spectacles";
                    }
                }
            } else if (currentScanMode === "special") {
                // Safety goggles/masks
                const isGoggle = classNameLower.includes("goggles") || classNameLower.includes("ski mask") || classNameLower.includes("mask") || classNameLower.includes("eye protector");
                if (isGoggle && pred.probability >= 0.015) {
                    if (pred.probability > highestGlassesProb) {
                        highestGlassesProb = pred.probability;
                        bestGlassesPrediction = pred;
                        detectedType = "goggles";
                    }
                }
            }
        });

        // 4. Update rolling confidence buffer to stabilize detection
        const rawConfidence = bestGlassesPrediction ? Math.round(highestGlassesProb * 100) : 0;
        confidenceHistory.push(rawConfidence);
        if (confidenceHistory.length > 12) {
            confidenceHistory.shift();
        }
        
        // Compute rolling average
        const avgConfidence = confidenceHistory.reduce((sum, val) => sum + val, 0) / confidenceHistory.length;
        const hasGlasses = avgConfidence >= 2.0; // Sensitive 2.0% rolling average

        // 5. Update Statistics
        totalFrames++;
        statTotalFrames.textContent = totalFrames;

        if (hasGlasses) {
            const finalConfidence = Math.max(rawConfidence, Math.round(avgConfidence));
            confidenceSum += finalConfidence;
            confidenceCount++;
            statAvgConfidence.textContent = `${Math.round(confidenceSum / confidenceCount)}%`;
            
            timeWearingGlasses += deltaSec;
            statWearingTime.textContent = `${Math.round(timeWearingGlasses)}s`;

            // Display "GLASSES DETECTED"
            let labelName = "Óculos Detetados";
            if (detectedType === "sunglasses") {
                labelName = "Óculos de Sol (Sunglasses)";
            } else if (detectedType === "spectacles") {
                labelName = "Óculos Normais (Spectacles)";
            } else if (detectedType === "goggles") {
                labelName = "Óculos de Proteção (Goggles)";
            }
            
            setUIState("GLASSES", finalConfidence, labelName);
            handleStateTransition("GLASSES", finalConfidence, labelName);
            
            // Draw green scanning effects
            drawHUD(true, finalConfidence, labelName);
        } else {
            // Display "NO GLASSES"
            setUIState("NO_GLASSES");
            handleStateTransition("NO_GLASSES");
            
            // Draw neutral blue scanning effects
            drawHUD(false, 0);
        }

    } catch (err) {
        console.error("Erro no processamento da imagem pela IA:", err);
        statusDot.className = "status-dot red";
        statusLabel.textContent = "Erro IA: " + err.message;
    }

    // Next loop frame
    if (isCameraActive) {
        animationFrameId = requestAnimationFrame(processVideoFrame);
    }
}

// Draw science fiction scanning radar HUD overlay
function drawHUD(detected, confidence = 0, label = "") {
    let baseColor = "rgba(6, 182, 212, 0.5)"; // Cyan/Blue default
    let textBaseColor = "#06b6d4";
    
    if (currentScanMode === "sunglasses") {
        baseColor = "rgba(245, 158, 11, 0.45)"; // Gold/Yellow
        textBaseColor = "#fbbf24";
    } else if (currentScanMode === "spectacles") {
        baseColor = "rgba(16, 185, 129, 0.45)"; // Emerald Green
        textBaseColor = "#34d399";
    } else if (currentScanMode === "special") {
        baseColor = "rgba(6, 182, 212, 0.45)"; // Ice Blue/Cyan
        textBaseColor = "#22d3ee";
    }
    
    const themeColor = detected ? "rgba(16, 185, 129, 0.85)" : baseColor;
    const textColor = detected ? "#10b981" : textBaseColor;
    
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    
    // Scanner Box bounds
    const boxX = cx - SCAN_SIZE / 2;
    const boxY = cy - SCAN_SIZE / 2;
    
    // 1. Draw horizontal laser scanning sweep line (restricted inside the scanner box)
    ctx.strokeStyle = detected ? "rgba(16, 185, 129, 0.6)" : "rgba(6, 182, 212, 0.4)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(boxX, boxY + laserY);
    ctx.lineTo(boxX + SCAN_SIZE, boxY + laserY);
    ctx.stroke();
    
    // Update laser sweep coordinate (restricted inside SCAN_SIZE)
    laserY += 4 * laserDirection;
    if (laserY >= SCAN_SIZE || laserY <= 0) {
        laserDirection *= -1;
    }
    
    // 2. Draw Scanner Box outline
    ctx.strokeStyle = themeColor;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(boxX, boxY, SCAN_SIZE, SCAN_SIZE);
    
    // 3. Draw heavy corner brackets for the Scanner Box
    const len = 24;
    ctx.lineWidth = 4;
    ctx.strokeStyle = themeColor;
    
    // Top-Left
    ctx.beginPath();
    ctx.moveTo(boxX + len, boxY);
    ctx.lineTo(boxX, boxY);
    ctx.lineTo(boxX, boxY + len);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(boxX + SCAN_SIZE - len, boxY);
    ctx.lineTo(boxX + SCAN_SIZE, boxY);
    ctx.lineTo(boxX + SCAN_SIZE, boxY + len);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(boxX, boxY + SCAN_SIZE - len);
    ctx.lineTo(boxX, boxY + SCAN_SIZE);
    ctx.lineTo(boxX + len, boxY + SCAN_SIZE);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(boxX + SCAN_SIZE, boxY + SCAN_SIZE - len);
    ctx.lineTo(boxX + SCAN_SIZE, boxY + SCAN_SIZE);
    ctx.lineTo(boxX + SCAN_SIZE - len, boxY + SCAN_SIZE);
    ctx.stroke();
    
    // 4. Draw corner indicators around the entire canvas view
    const pad = 20;
    const outerSize = 30;
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    
    // Top-Left
    ctx.beginPath();
    ctx.moveTo(pad + outerSize, pad);
    ctx.lineTo(pad, pad);
    ctx.lineTo(pad, pad + outerSize);
    ctx.stroke();
    
    // Top-Right
    ctx.beginPath();
    ctx.moveTo(canvas.width - pad - outerSize, pad);
    ctx.lineTo(canvas.width - pad, pad);
    ctx.lineTo(canvas.width - pad, pad + outerSize);
    ctx.stroke();
    
    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(pad, canvas.height - pad - outerSize);
    ctx.lineTo(pad, canvas.height - pad);
    ctx.lineTo(pad + outerSize, canvas.height - pad);
    ctx.stroke();
    
    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(canvas.width - pad, canvas.height - pad - outerSize);
    ctx.lineTo(canvas.width - pad, canvas.height - pad);
    ctx.lineTo(canvas.width - pad - outerSize, canvas.height - pad);
    ctx.stroke();
    
    // 5. Draw textual labels
    ctx.fillStyle = textColor;
    ctx.font = "bold 12px 'JetBrains Mono', monospace";
    ctx.fillText("SCANNER: ATIVO", pad + 10, pad + 45);
    ctx.fillText("ZONA DE SCAN", boxX, boxY - 8);
    
    if (detected) {
        ctx.fillStyle = "#10b981";
        ctx.font = "bold 13px 'JetBrains Mono', monospace";
        ctx.fillText(`${label.toUpperCase()}`, boxX, boxY + SCAN_SIZE + 20);
        ctx.fillText(`CONF: ${confidence}%`, boxX + SCAN_SIZE - 90, boxY + SCAN_SIZE + 20);
        
        // Draw green bounding rings on center target
        ctx.strokeStyle = "rgba(16, 185, 129, 0.85)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, 140, scanAngle, scanAngle + 0.3 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 140, scanAngle + Math.PI, scanAngle + 1.3 * Math.PI);
        ctx.stroke();
        
        scanAngle += 0.03;
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
        const isSun = labelName.toLowerCase().includes("sol") || labelName.toLowerCase().includes("sun");
        eventText = isSun ? "Óculos Sol Detetados" : "Óculos Normais Detetados";
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

// Update text in loading overlays
function updateLoadingProgress(text, progress) {
    loadingText.textContent = text;
    loadingProgress.style.width = `${progress}%`;
}

// Listeners
btnToggleCam.addEventListener("click", toggleCamera);
btnClearHistory.addEventListener("click", clearHistory);

// Setup Scan Mode tabs selection
const tabs = document.querySelectorAll(".mode-tab");
tabs.forEach(tab => {
    tab.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        currentScanMode = tab.dataset.mode;
        
        // Reset rolling confidence history buffer to avoid carryovers between modes
        confidenceHistory = [];
        
        // Update status display instantly
        setUIState("READY");
    });
});

// Start
window.addEventListener("DOMContentLoaded", initApp);
