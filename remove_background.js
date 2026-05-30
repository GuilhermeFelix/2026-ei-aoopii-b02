const { Jimp } = require("jimp");
const path = require("path");
const fs = require("fs");

// List of all assets in assets/ folder
const ASSETS_TO_PROCESS = [
    "aviator.png",
    "wayfarer.png",
    "cateye.png",
    "round.png",
    "clubmaster.png",
    "visor.png",
    "steampunk.png",
    "heart_realistic.png",
    "pixel.png",
    "heart.png",
    "star.png",
    "disguise.png"
];

const ASSETS_DIR = path.join(__dirname, "assets");

async function removeBackground(filename) {
    const filePath = path.join(ASSETS_DIR, filename);
    console.log(`\nProcessando: ${filename}...`);
    
    try {
        const image = await Jimp.read(filePath);
        const width = image.bitmap.width;
        const height = image.bitmap.height;
        
        // Access raw buffer data
        const data = image.bitmap.data;
        
        // 1. Run BFS/Flood-Fill from borders to find connected white background
        const isBg = new Uint8Array(width * height);
        const queue = [];
        
        // Helper to check and queue seed pixels
        const checkAndPushSeed = (x, y) => {
            const idx = y * width + x;
            if (!isBg[idx]) {
                const pIdx = idx * 4;
                const r = data[pIdx];
                const g = data[pIdx + 1];
                const b = data[pIdx + 2];
                const a = data[pIdx + 3];
                
                // If it is white/near-white or already transparent, mark as background
                if (a < 50 || (r > 200 && g > 200 && b > 200)) {
                    isBg[idx] = 1;
                    queue.push({ x, y });
                }
            }
        };
        
        // Seed border edges
        for (let x = 0; x < width; x++) {
            checkAndPushSeed(x, 0);
            checkAndPushSeed(x, height - 1);
        }
        for (let y = 0; y < height; y++) {
            checkAndPushSeed(0, y);
            checkAndPushSeed(width - 1, y);
        }
        
        // BFS Loop
        while (queue.length > 0) {
            const { x, y } = queue.shift();
            
            const neighbors = [
                { x: x + 1, y },
                { x: x - 1, y },
                { x, y: y + 1 },
                { x, y: y - 1 }
            ];
            
            for (const n of neighbors) {
                if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height) {
                    const nIdx = n.y * width + n.x;
                    if (!isBg[nIdx]) {
                        const pIdx = nIdx * 4;
                        const r = data[pIdx];
                        const g = data[pIdx + 1];
                        const b = data[pIdx + 2];
                        const a = data[pIdx + 3];
                        
                        // Connected pixels with high brightness or transparency
                        if (a < 50 || (r > 205 && g > 205 && b > 205)) {
                            isBg[nIdx] = 1;
                            queue.push(n);
                        }
                    }
                }
            }
        }
        
        // 2. Dilate the background mask by 3 pixels to capture all anti-aliased edge pixels (the white halo)
        let currentBgMask = new Uint8Array(isBg);
        const DILATION_STEPS = 3;
        
        for (let step = 0; step < DILATION_STEPS; step++) {
            const nextBgMask = new Uint8Array(currentBgMask);
            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const idx = y * width + x;
                    if (currentBgMask[idx] === 0) {
                        // If any neighbor is background, mark this as background in next step
                        if (currentBgMask[idx + 1] === 1 || currentBgMask[idx - 1] === 1 || 
                            currentBgMask[idx + width] === 1 || currentBgMask[idx - width] === 1) {
                            nextBgMask[idx] = 1;
                        }
                    }
                }
            }
            currentBgMask = nextBgMask;
        }
        
        // 3. Apply color unblending / alpha recovery on background and dilated border area
        let transparentPixels = 0;
        let unblendedPixels = 0;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const pIdx = idx * 4;
                
                // If it is in the original background, make it 100% transparent
                if (isBg[idx] === 1) {
                    data[pIdx + 3] = 0; // Alpha = 0
                    transparentPixels++;
                } 
                // If it is in the dilated boundary, perform color unblending against white background
                else if (currentBgMask[idx] === 1) {
                    const r = data[pIdx];
                    const g = data[pIdx + 1];
                    const b = data[pIdx + 2];
                    
                    // Recover alpha: alpha = 1 - min(R, G, B)/255
                    const minColor = Math.min(r, g, b);
                    const alpha = 1.0 - (minColor / 255.0);
                    
                    if (alpha < 0.05) {
                        data[pIdx + 3] = 0; // Fully transparent
                        transparentPixels++;
                    } else if (alpha > 0.95) {
                        data[pIdx + 3] = 255; // Keep fully opaque
                    } else {
                        // Unblend colors to remove white contribution
                        data[pIdx] = Math.max(0, Math.min(255, Math.round((r - (1 - alpha) * 255) / alpha)));
                        data[pIdx + 1] = Math.max(0, Math.min(255, Math.round((g - (1 - alpha) * 255) / alpha)));
                        data[pIdx + 2] = Math.max(0, Math.min(255, Math.round((b - (1 - alpha) * 255) / alpha)));
                        data[pIdx + 3] = Math.round(alpha * 255);
                        unblendedPixels++;
                    }
                }
            }
        }
        
        console.log(`   Concluído: ${transparentPixels} píxeis transparentes, ${unblendedPixels} píxeis suavizados.`);
        
        // Write the processed image back
        await image.write(filePath);
        
    } catch (err) {
        console.error(`   Erro ao processar ${filename}:`, err);
    }
}

async function main() {
    console.log("=== INICIANDO REMOÇÃO DE FUNDO E SUAVIZAÇÃO DE BORDAS ===");
    for (const filename of ASSETS_TO_PROCESS) {
        await removeBackground(filename);
    }
    console.log("\n=== PROCESSAMENTO CONCLUÍDO COM SUCESSO ===");
}

main();
