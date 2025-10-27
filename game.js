// game.js

// Constants adapted from constants.py
const SCREEN_WIDTH = 800;
const SCREEN_HEIGHT = 600;
const WORLD_BOUNDS = 1000;
const BOAT_ACCEL_FACTOR = 0.1;
const BOAT_TURN_SPEED = 1.0;
const MAX_BOAT_SPEED = 5.0;
const SAIL_TRIM_SPEED = 2.0;
const MAX_SAIL_ANGLE_REL = 90;
const MIN_SAILING_ANGLE = 45;
const WAKE_LIFETIME = 2.0;
const MAX_WAKE_PARTICLES = 100;
const WAKE_SPAWN_INTERVAL = 0.1;
const BOAT_DRAG = 0.95;
const MIN_TURN_EFFECTIVENESS = 0.2;
const SANDBAR_DRAG_MULTIPLIER = 0.8;
const NO_POWER_DECEL = 0.1;
const BUOY_ROUNDING_RADIUS = 50;

const WHITE = 'white';
const BLACK = 'black';
const SAIL_COLOR = '#DDDDDD';
const WAKE_COLOR = [255, 255, 255, 0.5];
const SAND_COLOR = '#F4A460';
const DARK_SAND_COLOR = '#D2B48C';
const BUOY_COLOR = 'red';
const START_FINISH_BUOY_COLOR = 'orange';
const NEXT_BUOY_INDICATOR_COLOR = 'yellow';
const WATER_COLOR = '#006994';


// Utility functions from utils.py
function deg_to_rad(degrees) {
    return degrees * (Math.PI / 180);
}

function rad_to_deg(radians) {
    return radians * (180 / Math.PI);
}

function normalize_angle(degrees) {
    return (degrees % 360 + 360) % 360;
}

function angle_difference(angle1, angle2) {
    let diff = normalize_angle(angle1) - normalize_angle(angle2);
    if (diff > 180) {
        diff -= 360;
    }
    if (diff < -180) {
        diff += 360;
    }
    return diff;
}

function distance_sq(p1, p2) {
    const dx = p1[0] - p2[0];
    const dy = p1[1] - p2[1];
    return dx * dx + dy * dy;
}


class Wave {
    constructor() {
        this.y = Math.random() * window.innerHeight;
        this.x = Math.random() * window.innerWidth;
        this.speed = Math.random() * 0.5 + 0.5;
        this.amplitude = Math.random() * 10 + 5;
        this.frequency = Math.random() * 0.02 + 0.01;
        this.width = Math.random() * 2 + 1;
    }

    update() {
        this.x += this.speed;
        if (this.x > window.innerWidth) {
            this.x = 0;
            this.y = Math.random() * window.innerHeight;
        }
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        for (let i = 0; i < window.innerWidth; i++) {
            ctx.lineTo(i, this.y + Math.sin(i * this.frequency) * this.amplitude);
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = this.width;
        ctx.stroke();
    }
}


class WakeParticle {
    constructor(worldX, worldY) {
        this.worldX = worldX;
        this.worldY = worldY;
        this.lifetime = WAKE_LIFETIME;
        this.maxLifetime = WAKE_LIFETIME;
    }

    update(dt) {
        this.lifetime -= dt;
        return this.lifetime > 0;
    }

    draw(ctx, offsetX, offsetY, viewCenter) {
        if (this.lifetime <= 0) return;
        const screenX = this.worldX - offsetX + viewCenter[0];
        const screenY = this.worldY - offsetY + viewCenter[1];

        const lifeRatio = Math.max(0, this.lifetime / this.maxLifetime);
        const currentSize = 2 * lifeRatio;
        const currentAlpha = 0.5 * lifeRatio;

        ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha})`;
        ctx.beginPath();
        ctx.arc(screenX, screenY, currentSize, 0, Math.PI * 2);
        ctx.fill();
    }
}

class Boat {
    constructor(x, y, name = "Player", boatColor = WHITE) {
        this.screenX = x;
        this.screenY = y;
        this.worldX = 0.0;
        this.worldY = 0.0;
        this.prevWorldX = 0.0;
        this.prevWorldY = 0.0;
        this.heading = 90.0;
        this.speed = 0.0;
        this.rudderAngle = 0;
        this.sailAngleRel = 0.0;
        this.visualSailAngleRel = 0.0;
        this.windEffectiveness = 0.0;
        this.optimalSailTrim = 0.0;
        this.onSandbar = false;
        this.name = name;
        this.score = 0;
        this.color = boatColor;
        this.baseShape = [
            [25, 0], [20, -4], [5, -8], [-15, -8],
            [-20, -5], [-20, 5], [-15, 8], [5, 8], [20, 4]
        ];
        this.deckShape = [
            [18, 0], [15, -2.5], [5, -5], [-13, -5],
            [-17, -3], [-17, 3], [-13, 5], [5, 5], [15, 2.5]
        ];
        this.rotatedShape = this.baseShape.slice();
        this.rotatedDeckShape = this.deckShape.slice();
        this.mastPosRel = [8, 0];
        this.mastPosAbs = [0, 0];
        this.sailCurvePoints = [];
        this.collisionRadius = 18;
        this.wakeParticles = [];
        this.timeSinceLastWake = 0.0;
        this.lastLineCrossingTime = 0.0;

        // Race progress attributes
        this.raceStarted = true;
        this.isFinished = false;
        this.currentLap = 1;
        this.nextBuoyIndex = 0;
        this.lapStartTime = 0.0;
        this.raceStartTime = 0.0;
        this.finishTime = 0.0;
        this.lapTimes = [];
    }

    resetPosition() {
        this.worldX = 0.0;
        this.worldY = 0.0;
        this.prevWorldX = 0.0;
        this.prevWorldY = 0.0;
        this.heading = 90.0;
        this.speed = 0.0;
        this.sailAngleRel = 0.0;
        this.visualSailAngleRel = 0.0;
        this.wakeParticles = [];
    }

    trimSail(direction) {
        this.sailAngleRel += direction * SAIL_TRIM_SPEED;
        this.sailAngleRel = Math.max(-MAX_SAIL_ANGLE_REL, Math.min(MAX_SAIL_ANGLE_REL, this.sailAngleRel));
    }

    turn(direction) {
        this.rudderAngle = direction;
    }

    update(windSpeed, windDirection, dt) {
        this.prevWorldX = this.worldX;
        this.prevWorldY = this.worldY;

        const speedTurnComponent = (1.0 - MIN_TURN_EFFECTIVENESS) * Math.min(1.0, this.speed / (MAX_BOAT_SPEED * 0.7));
        const totalTurnEffectiveness = MIN_TURN_EFFECTIVENESS + speedTurnComponent;
        const turnAmount = this.rudderAngle * BOAT_TURN_SPEED * totalTurnEffectiveness * dt * 60;
        this.heading = normalize_angle(this.heading + turnAmount);

        const windAngleRelBoat = angle_difference(windDirection, this.heading);
        const absWindAngleRelBoat = Math.abs(windAngleRelBoat);

        const naturalSailAngle = angle_difference(180, windAngleRelBoat);
        const clampedNaturalSailAngle = Math.max(-MAX_SAIL_ANGLE_REL, Math.min(MAX_SAIL_ANGLE_REL, naturalSailAngle));
        if (clampedNaturalSailAngle < 0) {
            this.visualSailAngleRel = Math.max(clampedNaturalSailAngle, this.sailAngleRel);
        } else {
            this.visualSailAngleRel = Math.min(clampedNaturalSailAngle, this.sailAngleRel);
        }

        let forceMagnitude = 0;
        this.windEffectiveness = 0.0;
        this.optimalSailTrim = 0.0;

        if (absWindAngleRelBoat > MIN_SAILING_ANGLE) {
            const optimalTrim = angle_difference(windAngleRelBoat + 180, 90);
            this.optimalSailTrim = Math.max(-MAX_SAIL_ANGLE_REL, Math.min(MAX_SAIL_ANGLE_REL, optimalTrim));
            const trimDiff = angle_difference(this.sailAngleRel, this.optimalSailTrim);
            const trimEffectiveness = Math.pow((Math.cos(deg_to_rad(trimDiff)) + 1) / 2.0, 2);
            const reachAngleDiff = Math.abs(absWindAngleRelBoat - 90);
            const pointOfSailEffectiveness = Math.max(0.1, Math.cos(deg_to_rad(reachAngleDiff)));
            this.windEffectiveness = Math.max(0, trimEffectiveness * pointOfSailEffectiveness);
            const baseAccel = windSpeed * BOAT_ACCEL_FACTOR;
            forceMagnitude = Math.max(0, baseAccel * this.windEffectiveness);
        }

        const acceleration = forceMagnitude;
        this.speed += acceleration * dt;
        let dragFactor = (1.0 - BOAT_DRAG);
        if (this.onSandbar) {
            dragFactor *= SANDBAR_DRAG_MULTIPLIER;
        }
        const dragForce = Math.pow(this.speed, 1.8) * dragFactor;
        this.speed -= dragForce * dt;
        if (forceMagnitude < 0.01 && this.speed > 0) {
            this.speed -= NO_POWER_DECEL * dt;
        }
        this.speed = Math.max(0, Math.min(this.speed, MAX_BOAT_SPEED));

        const moveRad = deg_to_rad(this.heading);
        const distanceMultiplier = 40;
        const dx = Math.cos(moveRad) * this.speed * dt * distanceMultiplier;
        const dy = Math.sin(moveRad) * this.speed * dt * distanceMultiplier;
        this.worldX += dx;
        this.worldY += dy;

        this.updateWake(dt);
    }

    updateWake(dt) {
        this.timeSinceLastWake += dt;
        if (this.speed > 0.5 && this.timeSinceLastWake >= WAKE_SPAWN_INTERVAL) {
            if (this.wakeParticles.length < MAX_WAKE_PARTICLES) {
                const sternOffset = -20;
                const rad = deg_to_rad(this.heading);
                const spawnDx = Math.cos(rad) * sternOffset;
                const spawnDy = Math.sin(rad) * sternOffset;
                const randX = Math.random() * 6 - 3;
                const randY = Math.random() * 6 - 3;
                const particleX = this.worldX + spawnDx + randX;
                const particleY = this.worldY + spawnDy + randY;
                this.wakeParticles.push(new WakeParticle(particleX, particleY));
                this.timeSinceLastWake = 0.0;
            }
        }
        this.wakeParticles = this.wakeParticles.filter(p => p.update(dt));
    }

    draw(ctx) {
        this.rotateAndPosition();

        const darkerColor = "gray"; // A simple darker color for the deck

        this.drawPolygon(ctx, this.rotatedShape, this.color, BLACK, 2);
        this.drawPolygon(ctx, this.rotatedDeckShape, darkerColor, BLACK, 1);

        // Draw Mast
        ctx.fillStyle = BLACK;
        ctx.beginPath();
        ctx.arc(this.mastPosAbs[0], this.mastPosAbs[1], 3, 0, Math.PI * 2);
        ctx.fill();

        this.updateSailCurve(this.visualSailAngleRel);
        if (this.sailCurvePoints.length >= 3) {
            this.drawPolygon(ctx, this.sailCurvePoints, SAIL_COLOR, "gray", 1);
        }
    }

    drawPolygon(ctx, points, fillColor, strokeColor, lineWidth) {
        if (points.length === 0) return;
        ctx.fillStyle = fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        for (let i = 1; i < points.length; i++) {
            ctx.lineTo(points[i][0], points[i][1]);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }


    rotateAndPosition() {
        const rad = deg_to_rad(this.heading);
        const cosA = Math.cos(rad);
        const sinA = Math.sin(rad);

        this.rotatedShape = this.baseShape.map(([x, y]) => [
            x * cosA - y * sinA + this.screenX,
            x * sinA + y * cosA + this.screenY
        ]);

        this.rotatedDeckShape = this.deckShape.map(([x, y]) => [
            x * cosA - y * sinA + this.screenX,
            x * sinA + y * cosA + this.screenY
        ]);

        const [mastRelX, mastRelY] = this.mastPosRel;
        const mastRotX = mastRelX * cosA - mastRelY * sinA;
        const mastRotY = mastRelX * sinA + mastRelY * cosA;
        this.mastPosAbs = [mastRotX + this.screenX, mastRotY + this.screenY];
    }

    updateSailCurve(visualRelativeAngle) {
        const [mastX, mastY] = this.mastPosAbs;
        const visualSailAngleAbs = normalize_angle(this.heading + visualRelativeAngle);
        const sailRadAbs = deg_to_rad(visualSailAngleAbs);
        const cosS = Math.cos(sailRadAbs);
        const sinS = Math.sin(sailRadAbs);

        const SAIL_LENGTH = 40;
        const SAIL_MAX_CURVE = 10;

        const boomEndX = mastX + cosS * SAIL_LENGTH;
        const boomEndY = mastY + sinS * SAIL_LENGTH;

        const midX = (mastX + boomEndX) / 2;
        const midY = (mastY + boomEndY) / 2;

        const perpDx = -sinS;
        const perpDy = cosS;

        const offsetDist = Math.sqrt(Math.max(0, this.windEffectiveness)) * SAIL_MAX_CURVE;

        const controlX = midX + perpDx * offsetDist;
        const controlY = midY + perpDy * offsetDist;

        this.sailCurvePoints = [[mastX, mastY], [controlX, controlY], [boomEndX, boomEndY]];
    }

}

class Sandbar {
    constructor(worldX, worldY, size) {
        this.worldX = worldX;
        this.worldY = worldY;
        this.size = size;
        this.pointsRel = this._generateRandomPoints(size);
        this.pointsWorld = this.pointsRel.map(p => [p[0] + worldX, p[1] + worldY]);
    }
    _generateRandomPoints(size) {
        const points = [];
        const numVertices = Math.floor(Math.random() * 5) + 5; // 5-9 vertices
        const avgRadius = size / 2.0;
        for (let i = 0; i < numVertices; i++) {
            let angle = (i / numVertices) * 2 * Math.PI;
            const radiusVariation = Math.random() * 0.4 + 0.8; // 0.8 to 1.2
            const radius = avgRadius * radiusVariation;
            angle += Math.random() * (Math.PI / numVertices) - (Math.PI / numVertices / 2);
            const x = radius * Math.cos(angle);
            const y = radius * Math.sin(angle);
            points.push([x, y]);
        }
        return points;
    }

    draw(ctx, offsetX, offsetY, viewCenter) {
        const screenPoints = this.pointsWorld.map(([worldX, worldY]) => [
            worldX - offsetX + viewCenter[0],
            worldY - offsetY + viewCenter[1]
        ]);

        if (screenPoints.length > 2) {
            ctx.fillStyle = SAND_COLOR;
            ctx.beginPath();
            ctx.moveTo(screenPoints[0][0], screenPoints[0][1]);
            for (let i = 1; i < screenPoints.length; i++) {
                ctx.lineTo(screenPoints[i][0], screenPoints[i][1]);
            }
            ctx.closePath();
            ctx.fill();
        }
    }
}

class Buoy {
    constructor(worldX, worldY, index, isGate = false) {
        this.worldX = worldX;
        this.worldY = worldY;
        this.index = index;
        this.radius = 10;
        this.isGate = isGate;
        this.color = isGate ? START_FINISH_BUOY_COLOR : BUOY_COLOR;
    }

    draw(ctx, offsetX, offsetY, isNext, viewCenter) {
        const screenX = this.worldX - offsetX + viewCenter[0];
        const screenY = this.worldY - offsetY + viewCenter[1];

        ctx.fillStyle = isNext ? NEXT_BUOY_INDICATOR_COLOR : this.color;
        ctx.beginPath();
        ctx.arc(screenX, screenY, this.radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = BLACK;
        ctx.stroke();
    }
}


// Game Loop
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const waveCanvas = document.getElementById('waveCanvas');
const waveCtx = waveCanvas.getContext('2d');
const windArrow = document.getElementById('wind-arrow');
const speedReading = document.getElementById('speed-reading');
const miniMap = document.getElementById('mini-map');
const miniMapCtx = miniMap.getContext('2d');

let player1Boat;
let sandbars = [];
let buoys = [];
let waves = [];
let windSpeed = 5.0;
let windDirection = 45.0;
let lastTime = 0;
const keys = {};

function setup() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    waveCanvas.width = window.innerWidth;
    waveCanvas.height = window.innerHeight;

    player1Boat = new Boat(canvas.width / 2, canvas.height / 2, "Player 1", "blue");
    player1Boat.worldX = 0;
    player1Boat.worldY = 0;

    for (let i = 0; i < 5; i++) {
        sandbars.push(new Sandbar(Math.random() * 1000 - 500, Math.random() * 1000 - 500, 100));
    }

    const buoyPositions = [
        [-400, -400],
        [400, -400],
        [400, 400],
        [-400, 400]
    ];

    for (let i = 0; i < buoyPositions.length; i++) {
        const buoy = new Buoy(buoyPositions[i][0], buoyPositions[i][1], i);
        if (i === 0) {
            buoy.color = 'green';
        }
        buoys.push(buoy);
    }

    for (let i = 0; i < 20; i++) {
        waves.push(new Wave());
    }

    // Event Listeners
    window.addEventListener('keydown', (e) => keys[e.key] = true);
    window.addEventListener('keyup', (e) => keys[e.key] = false);

    const keyMap = {
        'turn-left': 'ArrowLeft',
        'turn-right': 'ArrowRight',
        'trim-up': 'ArrowUp',
        'trim-down': 'ArrowDown'
    };

    for (const [id, key] of Object.entries(keyMap)) {
        const button = document.getElementById(id);
        button.addEventListener('mousedown', () => keys[key] = true);
        button.addEventListener('mouseup', () => keys[key] = false);
        button.addEventListener('mouseleave', () => keys[key] = false);
        button.addEventListener('touchstart', (e) => {
            e.preventDefault();
            keys[key] = true;
        });
        button.addEventListener('touchend', (e) => {
            e.preventDefault();
            keys[key] = false;
        });
    }
}

function handleInput() {
    player1Boat.rudderAngle = 0;
    if (keys['ArrowLeft']) player1Boat.rudderAngle = -1;
    if (keys['ArrowRight']) player1Boat.rudderAngle = 1;

    if (keys['ArrowUp']) player1Boat.trimSail(-1);
    if (keys['ArrowDown']) player1Boat.trimSail(1);
}

function gameLoop(timestamp) {
    const dt = (timestamp - lastTime) / 1000.0;
    lastTime = timestamp;

    handleInput();
    update(dt);
    render();

    requestAnimationFrame(gameLoop);
}

function update(dt) {
    player1Boat.update(windSpeed, windDirection, dt);
    waves.forEach(w => w.update());

    // Buoy collision
    if (player1Boat.nextBuoyIndex < buoys.length) {
        const nextBuoy = buoys[player1Boat.nextBuoyIndex];
        const distSq = distance_sq([player1Boat.worldX, player1Boat.worldY], [nextBuoy.worldX, nextBuoy.worldY]);
        if (distSq < BUOY_ROUNDING_RADIUS * BUOY_ROUNDING_RADIUS) {
            player1Boat.nextBuoyIndex++;
        }
    }
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    renderWaves();

    const worldOffsetX = player1Boat.worldX;
    const worldOffsetY = player1Boat.worldY;
    const viewCenter = [canvas.width / 2, canvas.height / 2];

    player1Boat.wakeParticles.forEach(p => p.draw(ctx, worldOffsetX, worldOffsetY, viewCenter));

    sandbars.forEach(s => s.draw(ctx, worldOffsetX, worldOffsetY, viewCenter));

    buoys.forEach((b, i) => {
        const isNext = i === player1Boat.nextBuoyIndex;
        b.draw(ctx, worldOffsetX, worldOffsetY, isNext, viewCenter);
    });

    player1Boat.screenX = viewCenter[0];
    player1Boat.screenY = viewCenter[1];
    player1Boat.draw(ctx);

    // Update HUD
    windArrow.style.transform = `translate(-50%, -50%) rotate(${windDirection}deg)`;
    speedReading.textContent = `Speed: ${player1Boat.speed.toFixed(1)}`;

    drawMiniMap();
}

function renderWaves() {
    waveCtx.fillStyle = WATER_COLOR;
    waveCtx.fillRect(0, 0, waveCanvas.width, waveCanvas.height);
    waves.forEach(w => w.draw(waveCtx));
}

function drawMiniMap() {
    const mapSize = 200;
    const worldScale = mapSize / (WORLD_BOUNDS * 2);

    miniMapCtx.fillStyle = WATER_COLOR;
    miniMapCtx.fillRect(0, 0, mapSize, mapSize);

    const playerX = player1Boat.worldX * worldScale + mapSize / 2;
    const playerY = player1Boat.worldY * worldScale + mapSize / 2;

    miniMapCtx.fillStyle = 'blue';
    miniMapCtx.beginPath();
    miniMapCtx.arc(playerX, playerY, 5, 0, 2 * Math.PI);
    miniMapCtx.fill();

    buoys.forEach(b => {
        const buoyX = b.worldX * worldScale + mapSize / 2;
        const buoyY = b.worldY * worldScale + mapSize / 2;
        miniMapCtx.fillStyle = b.color;
        miniMapCtx.beginPath();
        miniMapCtx.arc(buoyX, buoyY, 3, 0, 2 * Math.PI);
        miniMapCtx.fill();
    });
}


window.onload = () => {
    setup();
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
};