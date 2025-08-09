const canvas = document.getElementById("particleCanvas");
const ctx = canvas.getContext("2d");

// ====== GAME VARIABLES ======
import { GAME_WIDTH, GAME_HEIGHT } from "./constants.js";
let particles = [];
let enemies = [];
let projectiles = [];
let score = 0;
let currency = 0;
let gameOver = false;
let gameStarted = false;
let paused = false;
let wasPausedByBlur = false;
let mouseDown = false;
let particleRadiusScale = 1; // default radius multiplier
let regenDelay, offsetX, offsetY;
let upgrades = { particles: 5, speed: 1, regen: 1 };
let energy = 5;
let maxEnergy = 10;
let boostActive = false;

let player = { x: canvas.width / 2, y: canvas.height / 2 };
let mouse = { x: canvas.width / 2, y: canvas.height / 2 };

let musicDuration = 307;
// ====== ENEMY COLORS ======
const ENEMY_COLORS = {
    homing: "red",
    wander: "lime",
    bouncer: "cyan",
    charger: "orange",
    shielded: "purple",
    aura: "magenta",
    shooter: "olive",
    splitter: "crimson"
};
let elapsedTime = 0;

let spawnedWaves = new Set();

// ====== LEVEL DESIGN ======
import { waveSchedule } from "./level_design.js"

document.addEventListener('DOMContentLoaded', function () {
    preloadMusic("see you tonomore.mp3");
    musicGainNode.gain.value = parseFloat(volumeSlider.value);
})


// ====== UI ELEMENTS ======
const menu = document.getElementById("menu");
const hud = document.getElementById("hud");
const startBtn = document.getElementById("startBtn");
const scoreEl = document.getElementById("score");
const currencyEl = document.getElementById("currency");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const energyBar = document.getElementById("energyBar");
const volumeSlider = document.getElementById("volumeSlider");

let scaleX = 1, scaleY = 1;
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const scale = Math.min(
        canvas.width / GAME_WIDTH,
        canvas.height / GAME_HEIGHT
    );

    scaleX = scaleY = scale;

    offsetX = (canvas.width - GAME_WIDTH * scale) / 2;
    offsetY = (canvas.height - GAME_HEIGHT * scale) / 2;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

ctx.save();
ctx.scale(scaleX, scaleY);
ctx.restore();

// ====== EVENT LISTENERS ======
document.addEventListener("mousemove", e => {
    mouse.x = (e.clientX - offsetX) / scaleX;
    mouse.y = (e.clientY - offsetY) / scaleY;
});

volumeSlider.addEventListener("input", () => {
    setMusicVolume(volumeSlider.value);
});


let upgradeCosts = { particles: 20, speed: 15, regen: 50 };
const maxParticles = 30;
const maxRegen = 20;

window.addEventListener("keydown", (e) => {
    if (!gameStarted) return;
    // Pause hotkeys
    if (e.key.toLowerCase() === "p") {
        togglePause();
        return;
    }
    //Upgrades
    if (e.key.toLowerCase() === "z" && currency >= upgradeCosts.particles && upgrades.particles < maxParticles) {
        upgrades.particles = Math.min(upgrades.particles + 3, maxParticles);
        currency -= upgradeCosts.particles;
        upgradeCosts.particles = Math.floor(upgradeCosts.particles * 1.3);
    }
    if (e.key.toLowerCase() === "x" && currency >= upgradeCosts.speed) {
        upgrades.speed += 0.2;
        currency -= upgradeCosts.speed;
        upgradeCosts.speed = Math.floor(upgradeCosts.speed * 1.3);
    }
    if (e.key.toLowerCase() === "c" && currency >= upgradeCosts.regen && upgrades.regen < maxRegen) {
        upgrades.regen++;
        currency -= upgradeCosts.regen;
        upgradeCosts.regen = Math.floor(upgradeCosts.regen * 1.2);
    }
    // Space boost
    if (e.code === "Space" && energy > 0) boostActive = true;
    currencyEl.textContent = "💰 " + currency;
});


window.addEventListener("keyup", (e) => {
    if (e.code === "Space") boostActive = false;
});

// Mouse hold ability
window.addEventListener("mousedown", (e) => {
    if (e.button === 0) mouseDown = true;
});
window.addEventListener("mouseup", (e) => {
    if (e.button === 0) mouseDown = false;
});

// Auto pause on blur
window.addEventListener("blur", () => {
    if (!paused && !gameOver && gameStarted) {
        pauseGame();
        wasPausedByBlur = true;
    }
});
window.addEventListener("focus", () => {
    if (wasPausedByBlur && !gameOver && gameStarted) {
        resumeGame();
        wasPausedByBlur = false;
    }
});

// ====== START GAME ======
startBtn.onclick = () => {
    menu.style.display = "none";
    menu.classList.remove("d-flex")
    hud.style.display = "block";
    if (paused) return resumeGame();
    startGame();
};

let audioContext;
let musicGainNode;
let musicBuffer;
let musicSource;
let musicStartTime = 0;
let musicPausedTime = 0;
let isPaused = false;

async function preloadMusic(url) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    musicGainNode = audioContext.createGain();
    musicGainNode.connect(audioContext.destination);

    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    musicBuffer = await audioContext.decodeAudioData(arrayBuffer);

    musicDuration = musicBuffer.duration;
}

function playMusic() {
    if (!musicBuffer) return;

    musicSource = audioContext.createBufferSource();
    musicSource.buffer = musicBuffer;
    musicSource.connect(musicGainNode);
    musicSource.start(0, musicPausedTime);
    musicStartTime = audioContext.currentTime - musicPausedTime;

    musicSource.onended = () => {
        if (!gameOver && !isPaused) {
            endGame(true);
        }
    };
}

function pauseMusic() {
    if (!isPaused) {
        musicPausedTime = audioContext.currentTime - musicStartTime;
        audioContext.suspend();
        isPaused = true;
    }
}

function resumeMusic() {
    if (isPaused) {
        audioContext.resume();
        musicStartTime = audioContext.currentTime - musicPausedTime;
        isPaused = false;
    }
}

function setMusicVolume(value) {
    if (musicGainNode) {
        musicGainNode.gain.value = parseFloat(value);
    }
}

function getMusicTime() {
    return isPaused
        ? musicPausedTime
        : audioContext.currentTime - musicStartTime;
}


async function startGame() {
    gameOver = false; // make sure loop can run again
    musicTitleAlpha = 1; // reset music title fade-in

    // reset all other stats
    score = 0;
    currency = 0;
    enemies = [];
    particles = [];
    projectiles = [];
    upgrades = { particles: 5, speed: 1, regen: 1 };
    upgradeCosts = { particles: 20, speed: 15, regen: 50 };
    energy = maxEnergy;
    regenDelay = 0;
    elapsedTime = 0;
    spawnedWaves.clear();
    canvas.style.cursor = "none"

    for (let i = 0; i < upgrades.particles; i++) createParticle();
    musicPausedTime = 0;
    isPaused = false;
    playMusic();
    gameStarted = true;

    requestAnimationFrame(gameLoop);
}

const restartBtn = document.getElementById("restartBtn");
restartBtn.onclick = () => {
    document.getElementById("endMessage").style.display = "none";
    restartBtn.style.display = "none";

    // RESET STATE
    gameOver = false;
    paused = false;
    elapsedTime = 0;
    regenTimer = 0;
    spawnedWaves.clear();
    enemies = [];
    particles = [];
    projectiles = [];
    score = 0;
    currency = 0;
    energy = maxEnergy;

    scoreEl.textContent = "Score: 0";
    currencyEl.textContent = "💰 0";
    energyBar.style.width = "100%";
    progressBar.style.width = "0%";
    progressText.textContent = `0:00 / ${formatTime(musicDuration)}`;

    // Start fresh game
    startGame();
};

function endGame(won = false) {
    gameOver = true;

    // Stop Web Audio music
    if (musicSource) {
        try {
            musicSource.stop();
        } catch (err) {
            console.warn("Music already stopped:", err);
        }
        musicSource = null;
    }
    isPaused = true;

    canvas.style.cursor = "default";
    const endMsg = document.getElementById("endMessage");
    let result = document.getElementById("result");

    restartBtn.style.display = "inline-block"; // Show restart button

    let resultText = `${won ? "🎉 You survived until the end! You win!" : "💀 Game Over"}<br>`;

    result.innerHTML = resultText;
    if (won && devtoolsOpen) {// Small surprise for people finished with dev tools open
        endMsg.innerHTML = `
            🎉 You survived until the end! You win!<br>
            Or did you? Completing the game with developer tools open...<br>
            Each act has its consequences!<br>
        `;
    }

    endMsg.appendChild(restartBtn);
    endMsg.style.display = "block";
}

// Restart logic
restartBtn.onclick = () => {
    document.getElementById("endMessage").style.display = "none";
    restartBtn.style.display = "none";
    startGame();
};
function drawGameBounds() {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)"; // faint white
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
}


// ====== Game Functions ======
function createParticle() {
    const angle = Math.random() * Math.PI * 2;
    const radius = 80 + Math.random() * 40;
    const speed = 0.01 + Math.random() * 0.01;
    const color = `hsl(${Math.random() * 360}, 100%, 50%)`;
    particles.push({ angle, radius, speed, color, alive: true });
}
function regenParticles() {
    for (let i = 0; i < 1; i++) {// Only 1 particle per regen
        if (particles.filter(p => p.alive).length < upgrades.particles) createParticle();
    }
}
function drawUpgradeCards(regenDelay) {
    const cardWidth = 240;
    const cardHeight = 40;
    const startX = 10;
    let startY = GAME_HEIGHT - 130;
    ctx.font = "14px Arial";
    ctx.textAlign = "left";

    const upgradesInfo = [
        {
            key: "Z", name: "Particles", value: `${upgrades.particles}/${maxParticles}`, cost: upgradeCosts.particles,
            available: currency >= upgradeCosts.particles && upgrades.particles < maxParticles,
            extra: `Alive: ${particles.filter(p => p.alive).length}`
        },
        {
            key: "X", name: "Speed", value: upgrades.speed.toFixed(1), cost: upgradeCosts.speed,
            available: currency >= upgradeCosts.speed
        },
        {
            key: "C", name: "Regen", value: `${upgrades.regen}/${maxRegen}`, cost: upgradeCosts.regen,
            available: currency >= upgradeCosts.regen && upgrades.regen < maxRegen,
            extra: `${Math.round(regenDelay)} ms`
        }
    ];

    upgradesInfo.forEach(up => {
        ctx.fillStyle = up.available ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)";
        ctx.fillRect(startX, startY, cardWidth, cardHeight);
        ctx.strokeStyle = up.available ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.25)";
        ctx.strokeRect(startX, startY, cardWidth, cardHeight);

        ctx.fillStyle = up.available ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.25)";
        ctx.fillText(`${up.key}: ${up.name}`, startX + 8, startY + 15);
        ctx.fillText(`Lvl: ${up.value}`, startX + 8, startY + 30);
        if (up.extra) ctx.fillText(up.extra, startX + 120, startY + 15);
        ctx.fillText(`💰${up.cost}`, startX + 120, startY + 30);

        startY += cardHeight + 8;
    });
}

// ====== ENEMY SPAWN ======
function spawnEnemy(config) {
    const safeDistance = 100; // prevent spawning too close to player

    let spawnX = typeof config.x === "string"
        ? eval(config.x.replace(/player\.x/g, player.x).replace(/player\.y/g, player.y))
        : config.x ?? Math.random() * GAME_WIDTH;

    let spawnY = typeof config.y === "string"
        ? eval(config.y.replace(/player\.x/g, player.x).replace(/player\.y/g, player.y))
        : config.y ?? Math.random() * GAME_HEIGHT;

    while (Math.hypot(spawnX - player.x, spawnY - player.y) < safeDistance) {
        spawnX = Math.random() * GAME_WIDTH;
        spawnY = Math.random() * GAME_HEIGHT;
    }

    let e = {
        x: spawnX,
        y: spawnY,
        dx: config.dx ?? (Math.random() * 2 - 1),
        dy: config.dy ?? (Math.random() * 2 - 1),
        size: config.size ?? (10 + Math.random() * 10),
        speed: config.speed ?? (1 + Math.random()),
        type: config.type ?? "homing",
        invulnerable: config.invulnerable ?? false,
        health: config.health ?? 1,
        reward: config.reward ?? 1,
        shield: config.shield ?? 0,
        auraRadius: config.auraRadius ?? 0
    };
    enemies.push(e);
}

function pauseGame() {
    paused = true;
    pauseMusic();
    canvas.style.cursor = "default";
    menu.style.display = "block";
    menu.classList.add("d-flex")

}

function resumeGame() {
    paused = false;
    resumeMusic();
    canvas.style.cursor = "none";
    menu.style.display = "none";
    menu.classList.remove("d-flex")

    requestAnimationFrame(gameLoop);
}

function togglePause() {
    if (!gameStarted || gameOver) return;
    if (paused) resumeGame();
    else pauseGame();
}

// Shows faded preview of upcoming enemy
function showSpawnPreview(config) {
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(config.x, config.y, config.size, 0, Math.PI * 2);
    ctx.fillStyle = ENEMY_COLORS[config.type] || "gray";
    ctx.fill();
    ctx.globalAlpha = 1;
}

function spawnLinePattern(count, startX, startY, dx, dy, spacing, config) {
    for (let i = 0; i < count; i++) {
        spawnEnemy({ ...config, x: startX + dx * spacing * i, y: startY + dy * spacing * i });
    }
}
function spawnCirclePattern(count, centerX, centerY, radius, config) {
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        spawnEnemy({ ...config, x: centerX + Math.cos(angle) * radius, y: centerY + Math.sin(angle) * radius });
    }
}
function spawnGridPattern(rows, cols, startX, startY, spacingX, spacingY, config) {
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            spawnEnemy({ ...config, x: startX + c * spacingX, y: startY + r * spacingY });
        }
    }
}
function spawnColumnPattern(count, startX, startY, spacing, config) {
    for (let i = 0; i < count; i++) {
        spawnEnemy({
            ...config,
            x: startX,
            y: startY + spacing * i
        });
    }
}

function resolvePosition(value, axis) {
    return value ?? (axis === "x" ? Math.random() * GAME_WIDTH : Math.random() * GAME_HEIGHT);
}


// Dynamic spawn around player
function spawnSurroundPattern(count, radius, config) {
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const spawnX = player.x + Math.cos(angle) * radius;
        const spawnY = player.y + Math.sin(angle) * radius;
        spawnEnemy({ ...config, x: spawnX, y: spawnY });
    }
}

// ====== PLAYER MOVEMENT ======
function updatePlayerPosition() {
    player.x = Math.min(Math.max(mouse.x, 0), GAME_WIDTH);
    player.y = Math.min(Math.max(mouse.y, 0), GAME_HEIGHT);
}
let musicTitle = "Eslxst - ...see you to_no_more";
let musicTitleAlpha = 1; // start fully visible
let musicTitleFadeSpeed = 0.002; // fade per frame
let lastRegenTime = 0;
// ====== GAME LOOP ======
function gameLoop() {
    if (paused || gameOver) {
        return; // completely freeze game
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scaleX, scaleY);
    if (musicTitleAlpha > 0) {
        ctx.font = "16px Arial";
        ctx.fillStyle = `rgba(255,255,255,${musicTitleAlpha})`;
        ctx.textAlign = "right";
        ctx.fillText(`🎵 Playing: ${musicTitle}`, GAME_WIDTH - 10, 20);
        ctx.textAlign = "left";
        if (musicTitleAlpha > 0.25) {
            musicTitleAlpha -= musicTitleFadeSpeed; // slowly fade
        }
    }
    updatePlayerPosition();

    // Get exact music position
    elapsedTime = getMusicTime();
    // === Particle regen based on upgrade ===
    if (!lastRegenTime) lastRegenTime = performance.now();
    regenDelay = Math.max(500 - (upgrades.regen - 1) * 21, 80);// 21 with each upgrade
    let now = performance.now();

    if (now - lastRegenTime >= regenDelay) {
        regenParticles();
        lastRegenTime = now;
    }

    let percent = Math.min((elapsedTime / musicDuration) * 100, 100);
    progressBar.style.width = percent + "%";
    progressBar.innerText = Math.floor(percent) + '%';
    progressText.textContent = `${formatTime(elapsedTime)} / ${formatTime(musicDuration)}`;
    // Increase overlay opacity over time
    let progress = Math.min(elapsedTime / musicDuration, 1);
    let maxOpacity = 1; // full black at end
    let startOpacity = 0.7; // initial overlay
    let currentOpacity = startOpacity + (maxOpacity - startOpacity) * progress;

    document.querySelector("#background").style.setProperty(
        "--overlay-opacity",
        currentOpacity
    );
    if (boostActive) {
        energy -= 0.02;
        if (energy <= 0) { energy = 0; boostActive = false; }
    } else if (energy < maxEnergy) {
        energy += 0.01;
    }
    energyBar.style.width = `${(energy / maxEnergy) * 100}%`;
    drawUpgradeCards(regenDelay);
    drawGameBounds();
    // Spawn waves
    waveSchedule.forEach((wave, index) => {
        let timeNow = elapsedTime;

        // === PREVIEW SPAWNS 0.5s EARLY ===
        if (!spawnedWaves.has(index) && timeNow >= wave.time - 0.75 && timeNow < wave.time) {
            let xPrev = resolvePosition(wave.x, "x");
            let yPrev = resolvePosition(wave.y, "y");

            if (wave.pattern === "line") {
                for (let i = 0; i < wave.count; i++) {
                    showSpawnPreview({
                        type: wave.type,
                        size: wave.size,
                        x: xPrev + (wave.dx ?? 1) * (wave.spacing ?? 50) * i,
                        y: yPrev + (wave.dy ?? 0) * (wave.spacing ?? 50) * i
                    });
                }
            }
            else if (wave.pattern === "column") {
                for (let i = 0; i < wave.count; i++) {
                    showSpawnPreview({
                        type: wave.type,
                        size: wave.size,
                        x: xPrev,
                        y: yPrev + (wave.spacing ?? 50) * i
                    });
                }
            }
            else if (wave.pattern === "circle") {
                for (let i = 0; i < wave.count; i++) {
                    const angle = (i / wave.count) * Math.PI * 2;
                    showSpawnPreview({
                        type: wave.type,
                        size: wave.size,
                        x: xPrev + Math.cos(angle) * (wave.radius ?? 100),
                        y: yPrev + Math.sin(angle) * (wave.radius ?? 100)
                    });
                }
            }
            else if (wave.pattern === "grid") {
                for (let r = 0; r < wave.rows; r++) {
                    for (let c = 0; c < wave.cols; c++) {
                        showSpawnPreview({
                            type: wave.type,
                            size: wave.size,
                            x: xPrev + c * (wave.spacingX ?? 50),
                            y: yPrev + r * (wave.spacingY ?? 50)
                        });
                    }
                }
            }
            else if (wave.pattern === "surround") {
                for (let i = 0; i < wave.count; i++) {
                    const angle = (i / wave.count) * Math.PI * 2;
                    const sx = player.x + Math.cos(angle) * (wave.radius ?? 150);
                    const sy = player.y + Math.sin(angle) * (wave.radius ?? 150);
                    showSpawnPreview({ type: wave.type, size: wave.size, x: sx, y: sy });
                }
            }
        }

        // === ACTUAL SPAWN ===
        if (!spawnedWaves.has(index) && timeNow >= wave.time) {
            let x = resolvePosition(wave.x, "x");
            let y = resolvePosition(wave.y, "y");

            if (wave.pattern === "line") {
                spawnLinePattern(wave.count, x, y, wave.dx ?? 1, wave.dy ?? 0, wave.spacing ?? 50, wave);
            }
            else if (wave.pattern === "column") {
                spawnColumnPattern(wave.count, x, y, wave.spacing ?? 50, wave);
            }
            else if (wave.pattern === "circle") {
                spawnCirclePattern(wave.count, x, y, wave.radius ?? 100, wave);
            }
            else if (wave.pattern === "grid") {
                spawnGridPattern(wave.rows ?? 3, wave.cols ?? 3, x, y, wave.spacingX ?? 50, wave.spacingY ?? 50, wave);
            }
            else if (wave.pattern === "surround") {
                spawnSurroundPattern(wave.count ?? 6, wave.radius ?? 150, wave);
            }
            else {
                spawnEnemy({ ...wave, x, y });
            }
            spawnedWaves.add(index);
        }
    });

    // Draw player
    ctx.beginPath();
    ctx.arc(player.x, player.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = "white";
    ctx.fill();

    // Draw particles
    particles.forEach(p => {
        if (!p.alive) return;
        // Target scale based on input
        let targetScale = (mouseDown && energy > 0) ? 1.5 : 1; // 1.5x = 50% bigger orbit
        particleRadiusScale += (targetScale - particleRadiusScale) * 0.01; // smooth transition

        let speedFactor = boostActive ? upgrades.speed * 5 : upgrades.speed;
        p.angle += p.speed * speedFactor;
        if (mouseDown && energy > 0) {
            energy -= 0.001; // drain while boosting per particle
        }
        const scaledRadius = p.radius * particleRadiusScale;
        const x = player.x + scaledRadius * Math.cos(p.angle);
        const y = player.y + scaledRadius * Math.sin(p.angle);
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        p.x = x; p.y = y;
    });

    // Update enemies
    enemies.forEach((e, ei) => {
        // Aura effect
        if (e.type === "aura" && e.auraRadius > 0) {
            const distToPlayer = Math.hypot(e.x - player.x, e.y - player.y);
            if (distToPlayer < e.auraRadius) {
                energy = Math.max(0, energy - 0.035); // drain
            }
            // Draw aura circle
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.auraRadius, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(255, 0, 255, 0.3)";
            ctx.lineWidth = 2;
            ctx.stroke();
        } else if (e.type === "homing") {
            const dx = player.x - e.x, dy = player.y - e.y, dist = Math.hypot(dx, dy);
            e.x += (dx / dist) * e.speed; e.y += (dy / dist) * e.speed;
            if (dist < e.size) endGame();

        } else if (e.type === "wander") {
            e.x += e.dx; e.y += e.dy;
            if (e.x < 0 || e.x > GAME_WIDTH) e.dx *= -1;
            if (e.y < 0 || e.y > GAME_HEIGHT) e.dy *= -1;
            if (Math.hypot(e.x - player.x, e.y - player.y) < e.size) endGame();

        } else if (e.type === "bouncer") {
            e.x += e.dx * e.speed; e.y += e.dy * e.speed;
            if (e.x <= 0 || e.x >= GAME_WIDTH) e.dx *= -1;
            if (e.y <= 0 || e.y >= GAME_HEIGHT) e.dy *= -1;
            if (Math.hypot(e.x - player.x, e.y - player.y) < e.size) endGame();

        } else if (e.type === "shooter") {
            if (Math.random() < 0.01) {
                const dx = player.x - e.x, dy = player.y - e.y, dist = Math.hypot(dx, dy);
                projectiles.push({ x: e.x, y: e.y, dx: dx / dist, dy: dy / dist, speed: 3 });
            }
        } else if (e.type === "orbiter") {
            e.angle += 0.02;
            e.x += Math.cos(e.angle) * e.speed;
            e.y += Math.sin(e.angle) * e.speed;

        } else if (e.type === "charger") {
            const dashLength = e.dashLength ?? 300; // How far to dash
            const dashCooldown = e.dashCooldown ?? 750; // Time between dashes
            const telegraphTime = e.telegraphTime ?? 325; // Time to flash before dashing

            if (!e.state) e.state = "resting";
            if (!e.lastDashTime) e.lastDashTime = performance.now();

            const now = performance.now();
            const dx = player.x - e.x;
            const dy = player.y - e.y;
            const dist = Math.hypot(dx, dy);

            if (e.state === "resting") {
                // Start telegraphing after cooldown
                if (now - e.lastDashTime >= dashCooldown) {
                    e.state = "telegraph";
                    e.telegraphStart = now;
                    e.dashTargetAngle = Math.atan2(dy, dx);
                }
            } else if (e.state === "telegraph") {
                // Flash between white and enemy color
                const flashOn = Math.floor((now - e.telegraphStart) / 100) % 2 === 0;
                ctx.beginPath();
                ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
                ctx.fillStyle = flashOn ? "white" : (ENEMY_COLORS[e.type] || "red");
                ctx.fill();

                // Direction indicator
                ctx.beginPath();
                ctx.moveTo(e.x, e.y);
                ctx.lineTo(
                    e.x + Math.cos(e.dashTargetAngle) * 50,
                    e.y + Math.sin(e.dashTargetAngle) * 50
                );
                ctx.strokeStyle = "yellow";
                ctx.lineWidth = 2;
                ctx.stroke();

                if (now - e.telegraphStart >= telegraphTime) {
                    e.state = "dashing";
                    e.dashStartX = e.x;
                    e.dashStartY = e.y;
                    e.dx = Math.cos(e.dashTargetAngle) * e.speed * 6;
                    e.dy = Math.sin(e.dashTargetAngle) * e.speed * 6;
                }
                return; // Stop here so no other drawing overwrites it
            } else if (e.state === "dashing") {
                e.x += e.dx;
                e.y += e.dy;

                const traveled = Math.hypot(e.x - e.dashStartX, e.y - e.dashStartY);
                if (traveled >= dashLength) {
                    e.state = "resting";
                    e.lastDashTime = now;
                    e.dx = 0;
                    e.dy = 0;
                }
            }

            // Draw normally if not telegraphing
            ctx.beginPath();
            ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
            ctx.fillStyle = ENEMY_COLORS[e.type] || "red";
            ctx.fill();

            if (dist < e.size) endGame();
        } else if (e.type === "shielded") {
            // Move like a wanderer
            e.x += e.dx;
            e.y += e.dy;
            if (e.x < 0 || e.x > GAME_WIDTH) e.dx *= -1;
            if (e.y < 0 || e.y > GAME_HEIGHT) e.dy *= -1;

            if (Math.hypot(e.x - player.x, e.y - player.y) < e.size) endGame();
        }
        // Draw enemy circle
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);

        // Fill color
        if (e.shield > 0) {
            ctx.fillStyle = "blue";
        } else if (e.type === "shielded-drain") {
            ctx.fillStyle = "darkred";
        } else {
            ctx.fillStyle = ENEMY_COLORS[e.type] || "red";
        }
        ctx.fill();

        // Outline
        ctx.lineWidth = 2;
        ctx.strokeStyle = "black";
        ctx.stroke();

        // ===== HP BAR =====
        if (e.health > 1) {
            const barWidth = e.size * 2;
            const barHeight = 8;
            const healthRatio = e.health / (e.maxHealth || e.health);
            if (!e.maxHealth) e.maxHealth = e.health; // store max once

            // Background bar
            ctx.fillStyle = "rgba(255,0,0,0.5)";
            ctx.fillRect(e.x - barWidth / 2, e.y - e.size - 10, barWidth, barHeight);

            // Health foreground
            ctx.fillStyle = "red";
            ctx.fillRect(e.x - barWidth / 2, e.y - e.size - 10, barWidth * healthRatio, barHeight);

            // Border
            ctx.strokeStyle = "black";
            ctx.lineWidth = 1;
            ctx.strokeRect(e.x - barWidth / 2, e.y - e.size - 10, barWidth, barHeight);
        }

    });

    // Projectiles
    projectiles.forEach((p, pi) => {
        p.x += p.dx * p.speed;
        p.y += p.dy * p.speed;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = "yellow";
        ctx.fill();
        if (Math.hypot(p.x - player.x, p.y - player.y) < 8) endGame();
    });

    // Collisions: particles with enemies
    enemies.forEach((e, ei) => {
        particles.forEach((p) => {
            if (!p.alive) return;
            if (e.shield > 0) {
                e.shield -= 1;
                p.alive = false;
                return;
            }
            const dx = p.x - e.x, dy = p.y - e.y;
            if (Math.hypot(dx, dy) < e.size + 3) {
                p.alive = false;
                if (e.shield > 0) e.shield--; else e.health--;
                if (e.health <= 0) {
                    if (e.type === "splitter") {
                        for (let i = 0; i < 3; i++) {
                            spawnEnemy({
                                type: "homing",
                                x: e.x,
                                y: e.y,
                                size: e.size / 2,
                                speed: 1.5,
                                health: 1,
                                reward: 2
                            });
                        }
                    }
                    enemies.splice(ei, 1);
                    score++;
                    currency += e.reward;
                    scoreEl.textContent = "Score: " + score;
                    currencyEl.textContent = "💰 " + currency;
                }
            }
        });
    });

    ctx.restore();
    requestAnimationFrame(gameLoop);
}

function onDevToolsOpen() {
    console.clear();
    console.log("%cYou followed white rabbit, but at what cost?", "color: white; font-size: 20px; font-weight: bold;");
    console.log("Cheat code: Up Up Down Down Left Right Left Right B A — wait… wrong game.");
    console.log("%cOh, what happened to my codes!", "color: red; font-size: 15px; font-weight: bold;");
}

// Detect if DevTools is opened
let devtoolsOpen = false;
const checkDevTools = setInterval(() => {
    const threshold = 160;
    if (window.outerWidth - window.innerWidth > threshold || window.outerHeight - window.innerHeight > threshold) {
        if (!devtoolsOpen) {
            devtoolsOpen = true;
            onDevToolsOpen();
            background.classList.add("no-after");// background image won't fade :)
        }
    } else {
        devtoolsOpen = false;
    }
}, 1000);

function formatTime(sec) {
    let m = Math.floor(sec / 60);
    let s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
}