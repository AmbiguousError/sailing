// game.js

// Constants adapted from constants.py
const SCREEN_WIDTH = 800;
const SCREEN_HEIGHT = 600;
const WORLD_BOUNDS = 2000;
const BOAT_ACCEL_FACTOR = 0.1;
const BOAT_TURN_SPEED = 1.2;
const MAX_BOAT_SPEED = 5.0;
const SAIL_TRIM_SPEED = 2.0;
const MAX_SAIL_ANGLE_REL = 90;
const MIN_SAILING_ANGLE = 50;
const WAKE_LIFETIME = 2.0;
const MAX_WAKE_PARTICLES = 100;
const WAKE_SPAWN_INTERVAL = 0.1;
const BOAT_DRAG = 0.95;
const MIN_TURN_EFFECTIVENESS = 0.8;
const SANDBAR_DRAG_MULTIPLIER = 0.8;
const NO_POWER_DECEL = 0.1;
const BUOY_ROUNDING_RADIUS = 50;

const WHITE = '#FFFFFF';
const BLACK = '#333333';
const SAIL_COLOR = '#EFEFEF';
const WAKE_COLOR = [255, 255, 255, 0.5];
const SAND_COLOR = '#FADDAF';
const DARK_SAND_COLOR = '#E6CBA0';
const BUOY_COLOR = '#FF6B6B';
const START_FINISH_BUOY_COLOR = '#FFA07A';
const NEXT_BUOY_INDICATOR_COLOR = '#FFD700';
const WATER_COLOR = '#AADDDE';


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


class WindParticle {
    constructor(windDirection, windSpeed) {
        this.windDirection = windDirection;
        this.windSpeed = windSpeed;
        this.x = Math.random() * window.innerWidth;
        this.y = Math.random() * window.innerHeight;
        this.speed = (Math.random() * 0.5 + 0.5) * (this.windSpeed / 5.0);
        this.length = Math.random() * 10 + 5;
    }

    update() {
        const rad = deg_to_rad(this.windDirection);
        this.x += Math.cos(rad) * this.speed;
        this.y += Math.sin(rad) * this.speed;

        if (this.x > window.innerWidth) this.x = 0;
        if (this.x < 0) this.x = window.innerWidth;
        if (this.y > window.innerHeight) this.y = 0;
        if (this.y < 0) this.y = window.innerHeight;
    }

    draw(ctx) {
        const rad = deg_to_rad(this.windDirection);
        const endX = this.x + Math.cos(rad) * this.length;
        const endY = this.y + Math.sin(rad) * this.length;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

class Wave {
    constructor(windDirection, windSpeed) {
        this.windDirection = windDirection;
        this.windSpeed = windSpeed;
        this.y = Math.random() * window.innerHeight;
        this.x = Math.random() * window.innerWidth;
        this.speed = (Math.random() * 0.5 + 0.5) * (this.windSpeed / 5.0);
        this.amplitude = Math.random() * 10 + 5;
        this.frequency = Math.random() * 0.02 + 0.01;
        this.width = Math.random() * 2 + 1;
    }

    update() {
        const rad = deg_to_rad(this.windDirection);
        this.x += Math.cos(rad) * this.speed;
        this.y += Math.sin(rad) * this.speed;

        if (this.x > window.innerWidth) this.x = 0;
        if (this.x < 0) this.x = window.innerWidth;
        if (this.y > window.innerHeight) this.y = 0;
        if (this.y < 0) this.y = window.innerHeight;
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
        this.passedBuoys = new Set();
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
        let turnAmount = this.rudderAngle * BOAT_TURN_SPEED * totalTurnEffectiveness * dt * 60;
        if (this.aggressiveness) {
            turnAmount *= this.aggressiveness;
        }
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

        if (absWindAngleRelBoat >= MIN_SAILING_ANGLE) {
            const optimalTrim = angle_difference(windAngleRelBoat + 180, 90);
            this.optimalSailTrim = Math.max(-MAX_SAIL_ANGLE_REL, Math.min(MAX_SAIL_ANGLE_REL, optimalTrim));
            const trimDiff = angle_difference(this.sailAngleRel, this.optimalSailTrim);
            const trimEffectiveness = Math.pow((Math.cos(deg_to_rad(trimDiff)) + 1) / 2.0, 2);
            const reachAngleDiff = Math.abs(absWindAngleRelBoat - 90);
            const pointOfSailEffectiveness = Math.max(0.1, Math.cos(deg_to_rad(reachAngleDiff)));
            this.windEffectiveness = Math.max(0, trimEffectiveness * pointOfSailEffectiveness);
            let baseAccel = windSpeed * BOAT_ACCEL_FACTOR;
            if (this.aggressiveness) {
                baseAccel *= this.aggressiveness;
            }
            forceMagnitude = Math.max(0, baseAccel * this.windEffectiveness);
        }

        const acceleration = forceMagnitude;
        this.speed += acceleration * dt;
        let dragFactor = (1.0 - BOAT_DRAG);
        if (this.onSandbar) {
            dragFactor *= SANDBAR_DRAG_MULTIPLIER;
        }
        const dragForce = Math.pow(Math.max(0, this.speed), 1.8) * dragFactor;
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

class AIBoat extends Boat {
    constructor(x, y, name = "AI", boatColor = "red") {
        super(x, y, name, boatColor);
        this.aggressiveness = Math.random() * 0.5 + 0.75; // Performance variability
        this.isTacking = false;
        this.tackDirection = 1; // 1 for port (right of wind), -1 for starboard (left of wind)
    }

    updateControls(target_buoy, wind_direction) {
        if (!target_buoy) return;

        // Core sailing logic
        const target_x = target_buoy.worldX;
        const target_y = target_buoy.worldY;
        const angle_to_target = normalize_angle(rad_to_deg(Math.atan2(target_y - this.worldY, target_x - this.worldX)));
        const angle_of_target_rel_to_wind = angle_difference(angle_to_target, wind_direction);

        let desired_heading;
        const UPWIND_THRESHOLD = MIN_SAILING_ANGLE;

        const isUpwind = Math.abs(angle_of_target_rel_to_wind) < UPWIND_THRESHOLD;

        if (isUpwind) {
            if (!this.isTacking) {
                // Start tacking. Choose the initial tack direction.
                const portTackAngle = normalize_angle(wind_direction + UPWIND_THRESHOLD);
                const starboardTackAngle = normalize_angle(wind_direction - UPWIND_THRESHOLD);
                const portDiff = Math.abs(angle_difference(portTackAngle, angle_to_target));
                const starboardDiff = Math.abs(angle_difference(starboardTackAngle, angle_to_target));
                this.tackDirection = (portDiff < starboardDiff) ? 1 : -1;
                this.isTacking = true;
            }

            // Check if it's time to tack again
            const current_angle_to_target_rel_wind = angle_difference(angle_to_target, wind_direction);
            if (this.tackDirection === 1 && current_angle_to_target_rel_wind < 0) {
                this.tackDirection = -1; // Switch to starboard tack
            } else if (this.tackDirection === -1 && current_angle_to_target_rel_wind > 0) {
                this.tackDirection = 1; // Switch to port tack
            }

            // Set the desired heading based on the current tack.
            const TACKING_ANGLE = MIN_SAILING_ANGLE + 10; // Sail at a good angle for speed
            desired_heading = normalize_angle(wind_direction + (TACKING_ANGLE * this.tackDirection));

        } else {
            // Course is clear, sail directly for the target.
            this.isTacking = false;
            desired_heading = angle_to_target;
        }

        // --- Common steering and sail trim logic ---
        const angle_diff = angle_difference(desired_heading, this.heading);

        // Rudder control
        if (angle_diff > 5) {
            this.turn(1);
        } else if (angle_diff < -5) {
            this.turn(-1);
        } else {
            this.turn(0);
        }

        // Sail trim logic
        const wind_angle_rel_boat = angle_difference(wind_direction, this.heading);
        const optimal_trim = angle_difference(wind_angle_rel_boat + 180, 90);
        this.sailAngleRel = Math.max(-MAX_SAIL_ANGLE_REL, Math.min(MAX_SAIL_ANGLE_REL, optimal_trim));
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
            ctx.fillStyle = 'rgba(210, 180, 140, 0.5)'; // Semi-transparent tan
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
        this.color = isGate ? START_FINISH_BUOY_COLOR : NEXT_BUOY_INDICATOR_COLOR;
    }

    draw(ctx, offsetX, offsetY, isNext, isPassed, viewCenter) {
        const screenX = this.worldX - offsetX + viewCenter[0];
        const screenY = this.worldY - offsetY + viewCenter[1];

        let color = this.color;
        if (isNext) {
            color = 'green';
        } else if (isPassed) {
            color = 'red';
        }

        ctx.fillStyle = color;
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
const lapsElement = document.getElementById('laps');
const raceTimerElement = document.getElementById('race-timer');
const miniMap = document.getElementById('mini-map');
const miniMapCtx = miniMap.getContext('2d');
const countdownElement = document.getElementById('countdown');
const raceFinishedElement = document.getElementById('race-finished');


let player1Boat;
let aiBoats = [];
let sandbars = [];
let buoys = [];
let waves = [];
let windParticles = [];
let windSpeed = 10.0;
let windDirection = 45.0;
let targetWindDirection = 45.0;
let targetWindSpeed = 10.0;
let lastTime = 0;
let gameRunning = false;
const keys = {};
let raceState = 'pre-race'; // 'pre-race', 'countdown', 'running', 'finished'
let maxLaps = 3;

let isSeries = false;
let currentRace = 0;
const seriesLength = 3;
let seriesScores = {};

function setup() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    waveCanvas.width = window.innerWidth;
    waveCanvas.height = window.innerHeight;

    windDirection = Math.random() * 360;
    windSpeed = Math.random() * 5 + 5; // Wind speed between 5 and 10
    targetWindDirection = windDirection;
    targetWindSpeed = windSpeed;

    player1Boat = new Boat(canvas.width / 2, canvas.height / 2, "Player 1", "#FFD700"); // Gold
    player1Boat.worldX = 0;
    player1Boat.worldY = 0;

    const aiColors = ["#FF6347", "#4682B4", "#32CD32"]; // Tomato, SteelBlue, LimeGreen

    const numOpponents = 3;
    for (let i = 0; i < numOpponents; i++) {
        const aiBoat = new AIBoat(canvas.width / 2, canvas.height / 2, `AI ${i + 1}`, aiColors[i % aiColors.length]);
        aiBoat.worldX = -50 * (i + 1);
        aiBoat.worldY = -50 * (i + 1);
        aiBoats.push(aiBoat);
    }

    if (isSeries && currentRace === 0) {
        seriesScores[player1Boat.name] = 0;
        aiBoats.forEach(b => seriesScores[b.name] = 0);
    }

    for (let i = 0; i < 10; i++) {
        sandbars.push(new Sandbar(Math.random() * 2000 - 1000, Math.random() * 2000 - 1000, 150));
    }

    const numBuoys = parseInt(document.getElementById('buoys-select').value);
    for (let i = 0; i < numBuoys; i++) {
        const x = Math.random() * (WORLD_BOUNDS - 200) - (WORLD_BOUNDS / 2 - 100);
        const y = Math.random() * (WORLD_BOUNDS - 200) - (WORLD_BOUNDS / 2 - 100);
        const buoy = new Buoy(x, y, i);
        buoys.push(buoy);
    }

    for (let i = 0; i < 20; i++) {
        waves.push(new Wave(windDirection, windSpeed));
    }

    for (let i = 0; i < 50; i++) {
        windParticles.push(new WindParticle(windDirection, windSpeed));
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
    if (!gameRunning) return;

    let dt = (timestamp - lastTime) / 1000.0;
    lastTime = timestamp;

    // Cap dt to prevent physics glitches on tab change
    dt = Math.min(dt, 0.1);

    handleInput();
    update(dt);
    render();

    requestAnimationFrame(gameLoop);
}

function updateWind(dt) {
    // Randomly decide to change wind direction and speed
    if (Math.random() < 0.001) { // Low probability of changing target
        targetWindDirection = normalize_angle(windDirection + (Math.random() * 60 - 30));
        targetWindSpeed = Math.random() * 5 + 5;
    }

    // Slowly interpolate towards the target wind
    const lerpFactor = 0.001;
    windDirection = normalize_angle(windDirection + angle_difference(targetWindDirection, windDirection) * lerpFactor);
    windSpeed += (targetWindSpeed - windSpeed) * lerpFactor;

    // Update particles and waves with new wind data
    windParticles.forEach(p => {
        p.windDirection = windDirection;
        p.windSpeed = windSpeed;
    });
    waves.forEach(w => {
        w.windDirection = windDirection;
        w.windSpeed = windSpeed;
    });
}

function update(dt) {
    if (raceState !== 'running') return;
    updateWind(dt);

    const currentTime = performance.now();
    const elapsedTime = (currentTime - player1Boat.raceStartTime) / 1000;
    const minutes = Math.floor(elapsedTime / 60);
    const seconds = Math.floor(elapsedTime % 60);
    raceTimerElement.textContent = `Time: ${minutes}:${seconds.toString().padStart(2, '0')}`;

    player1Boat.update(windSpeed, windDirection, dt);
    aiBoats.forEach(aiBoat => {
        aiBoat.updateControls(buoys[aiBoat.nextBuoyIndex], windDirection);
        aiBoat.update(windSpeed, windDirection, dt);
    });
    waves.forEach(w => w.update());
    windParticles.forEach(p => p.update());

    // Buoy collision
    [player1Boat, ...aiBoats].forEach(boat => {
        if (!boat || raceState !== 'running' || boat.isFinished) return;
        if (boat.nextBuoyIndex < buoys.length) {
            const nextBuoy = buoys[boat.nextBuoyIndex];
            const distSq = distance_sq([boat.worldX, boat.worldY], [nextBuoy.worldX, nextBuoy.worldY]);
            if (distSq < BUOY_ROUNDING_RADIUS * BUOY_ROUNDING_RADIUS) {
                boat.passedBuoys.add(boat.nextBuoyIndex);
                boat.nextBuoyIndex++;
                if (boat.nextBuoyIndex === buoys.length) {
                    const lapTime = (performance.now() - boat.lapStartTime) / 1000;
                    boat.lapTimes.push(lapTime);
                    boat.lapStartTime = performance.now();
                    boat.currentLap++;
                    if (boat.currentLap > maxLaps) {
                        boat.isFinished = true;
                        boat.finishTime = performance.now();
                        if (boat === player1Boat) {
                            raceState = 'finished';
                            gameRunning = false;
                            displayRaceResults();
                        }
                    } else {
                        boat.nextBuoyIndex = 0;
                        boat.passedBuoys.clear();
                    }
                }
            }
        }
    });

    // Boat-to-boat collision detection and response
    const allBoats = [player1Boat, ...aiBoats];
    for (let i = 0; i < allBoats.length; i++) {
        for (let j = i + 1; j < allBoats.length; j++) {
            const boat1 = allBoats[i];
            const boat2 = allBoats[j];
            const distSq = distance_sq([boat1.worldX, boat1.worldY], [boat2.worldX, boat2.worldY]);
            const combinedRadius = boat1.collisionRadius + boat2.collisionRadius;

            if (distSq < combinedRadius * combinedRadius) {
                const dist = Math.sqrt(distSq);
                const overlap = combinedRadius - dist;

                // Avoid division by zero if boats are perfectly on top of each other
                const normalX = dist > 0 ? (boat2.worldX - boat1.worldX) / dist : 1;
                const normalY = dist > 0 ? (boat2.worldY - boat1.worldY) / dist : 0;

                // 1. Static Resolution: Separate the boats to prevent sticking
                const separationX = (overlap / 2) * normalX;
                const separationY = (overlap / 2) * normalY;
                boat1.worldX -= separationX;
                boat1.worldY -= separationY;
                boat2.worldX += separationX;
                boat2.worldY += separationY;

                // 2. Dynamic Resolution: Calculate and apply impulse
                // Convert speed and heading to velocity vectors
                const v1x = Math.cos(deg_to_rad(boat1.heading)) * boat1.speed;
                const v1y = Math.sin(deg_to_rad(boat1.heading)) * boat1.speed;
                const v2x = Math.cos(deg_to_rad(boat2.heading)) * boat2.speed;
                const v2y = Math.sin(deg_to_rad(boat2.heading)) * boat2.speed;

                // Calculate relative velocity
                const relVx = v2x - v1x;
                const relVy = v2y - v1y;

                // Calculate velocity along the normal
                const velAlongNormal = relVx * normalX + relVy * normalY;

                // Do nothing if velocities are separating
                if (velAlongNormal > 0) continue;

                const restitution = 1.2; // Bounciness
                let impulse = -(1 + restitution) * velAlongNormal;
                impulse /= 2; // Assuming equal mass for both boats

                const impulseX = impulse * normalX;
                const impulseY = impulse * normalY;

                // Apply impulse to velocities
                const newV1x = v1x - impulseX;
                const newV1y = v1y - impulseY;
                const newV2x = v2x + impulseX;
                const newV2y = v2y + impulseY;

                // Convert back to speed and heading
                boat1.speed = Math.sqrt(newV1x * newV1x + newV1y * newV1y);
                boat1.heading = normalize_angle(rad_to_deg(Math.atan2(newV1y, newV1x)));
                boat2.speed = Math.sqrt(newV2x * newV2x + newV2y * newV2y);
                boat2.heading = normalize_angle(rad_to_deg(Math.atan2(newV2y, newV2x)));
            }
        }
    }
}

function drawBuoyArrow(ctx) {
    if (raceState !== 'running' || player1Boat.nextBuoyIndex >= buoys.length) return;

    const nextBuoy = buoys[player1Boat.nextBuoyIndex];
    const angleToBuoy = Math.atan2(nextBuoy.worldY - player1Boat.worldY, nextBuoy.worldX - player1Boat.worldX);

    const boatScreenX = player1Boat.screenX;
    const boatScreenY = player1Boat.screenY;

    const arrowDistance = 60; // Distance from the boat's center
    const arrowLength = 15;
    const arrowWidth = 10;

    // Position the arrow at a fixed distance from the boat, in the direction of the buoy
    const arrowX = boatScreenX + Math.cos(angleToBuoy) * arrowDistance;
    const arrowY = boatScreenY + Math.sin(angleToBuoy) * arrowDistance;

    ctx.save();
    ctx.translate(arrowX, arrowY);
    ctx.rotate(angleToBuoy);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.beginPath();
    ctx.moveTo(arrowLength, 0);
    ctx.lineTo(-arrowLength, -arrowWidth);
    ctx.lineTo(-arrowLength, arrowWidth);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const worldOffsetX = player1Boat.worldX;
    const worldOffsetY = player1Boat.worldY;
    const viewCenter = [canvas.width / 2, canvas.height / 2];

    renderWaves(worldOffsetX, worldOffsetY, viewCenter);

    player1Boat.wakeParticles.forEach(p => p.draw(ctx, worldOffsetX, worldOffsetY, viewCenter));

    buoys.forEach((b, i) => {
        const isNext = i === player1Boat.nextBuoyIndex;
        const isPassed = player1Boat.passedBuoys.has(i);
        b.draw(ctx, worldOffsetX, worldOffsetY, isNext, isPassed, viewCenter);
    });

    player1Boat.screenX = viewCenter[0];
    player1Boat.screenY = viewCenter[1];
    player1Boat.draw(ctx);

    drawBuoyArrow(ctx);

    aiBoats.forEach(aiBoat => {
        aiBoat.screenX = aiBoat.worldX - worldOffsetX + viewCenter[0];
        aiBoat.screenY = aiBoat.worldY - worldOffsetY + viewCenter[1];
        aiBoat.draw(ctx);
    });

    // Update HUD
    windArrow.style.transform = `rotate(${windDirection}deg)`;
    speedReading.textContent = `Speed: ${player1Boat.speed.toFixed(1)}`;
    lapsElement.textContent = `Lap: ${player1Boat.currentLap}`;

    drawMiniMap();
}

function drawWindIndicator(ctx) {
    const centerX = ctx.canvas.width / 2;
    const centerY = ctx.canvas.height / 2;
    const length = 100;
    const angle = deg_to_rad(windDirection);

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(0, -length);
    ctx.lineTo(20, -length + 40);
    ctx.lineTo(-20, -length + 40);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function renderWaves(offsetX, offsetY, viewCenter) {
    waveCtx.fillStyle = WATER_COLOR;
    waveCtx.fillRect(0, 0, waveCanvas.width, waveCanvas.height);

    sandbars.forEach(s => s.draw(waveCtx, offsetX, offsetY, viewCenter));

    drawWindIndicator(waveCtx);
    waves.forEach(w => w.draw(waveCtx));
    windParticles.forEach(p => p.draw(waveCtx));
}

function drawMiniMap() {
    const mapSize = 200;
    const worldScale = mapSize / (WORLD_BOUNDS * 2);

    miniMapCtx.fillStyle = 'rgba(170, 221, 222, 0.5)';
    miniMapCtx.fillRect(0, 0, mapSize, mapSize);


    const playerX = player1Boat.worldX * worldScale + mapSize / 2;
    const playerY = player1Boat.worldY * worldScale + mapSize / 2;

    const playerRad = deg_to_rad(player1Boat.heading);
    miniMapCtx.save();
    miniMapCtx.translate(playerX, playerY);
    miniMapCtx.rotate(playerRad);
    miniMapCtx.fillStyle = player1Boat.color;
    miniMapCtx.beginPath();
    miniMapCtx.moveTo(5, 0);
    miniMapCtx.lineTo(-5, -4);
    miniMapCtx.lineTo(-5, 4);
    miniMapCtx.closePath();
    miniMapCtx.fill();
    miniMapCtx.restore();

    aiBoats.forEach(aiBoat => {
        const aiX = aiBoat.worldX * worldScale + mapSize / 2;
        const aiY = aiBoat.worldY * worldScale + mapSize / 2;
        const aiRad = deg_to_rad(aiBoat.heading);
        miniMapCtx.save();
        miniMapCtx.translate(aiX, aiY);
        miniMapCtx.rotate(aiRad);
        miniMapCtx.fillStyle = aiBoat.color;
        miniMapCtx.beginPath();
        miniMapCtx.moveTo(5, 0);
        miniMapCtx.lineTo(-5, -4);
        miniMapCtx.lineTo(-5, 4);
        miniMapCtx.closePath();
        miniMapCtx.fill();
        miniMapCtx.restore();
    });

    buoys.forEach((b, i) => {
        const buoyX = b.worldX * worldScale + mapSize / 2;
        const buoyY = b.worldY * worldScale + mapSize / 2;

        let color = b.color;
        if (i === player1Boat.nextBuoyIndex) {
            color = 'green';
        } else if (player1Boat.passedBuoys.has(i)) {
            color = 'red';
        }

        miniMapCtx.fillStyle = color;
        miniMapCtx.beginPath();
        miniMapCtx.arc(buoyX, buoyY, 3, 0, 2 * Math.PI);
        miniMapCtx.fill();
    });
}


const startMenu = document.getElementById('start-menu');
const startRaceButton = document.getElementById('start-race');
const restartRaceButton = document.getElementById('restart-race');

function startGame() {
    if (isSeries) {
        currentRace++;
    }
    maxLaps = parseInt(document.getElementById('laps-select').value);
    startMenu.style.display = 'none';
    raceState = 'countdown';
    let countdown = 3;
    countdownElement.style.display = 'block';
    countdownElement.textContent = countdown;

    const countdownInterval = setInterval(() => {
        countdown--;
        if (countdown > 0) {
            countdownElement.textContent = countdown;
        } else {
            clearInterval(countdownInterval);
            countdownElement.style.display = 'none';
            raceState = 'running';
            const startTime = performance.now();
            [player1Boat, ...aiBoats].forEach(boat => {
                boat.raceStartTime = startTime;
                boat.lapStartTime = startTime;
            });
            lastTime = startTime;
            gameRunning = true;
            requestAnimationFrame(gameLoop);
        }
    }, 1000);
}

function displayRaceResults() {
    const resultsContainer = document.getElementById('race-results');
    const titleElement = document.getElementById('race-finished-title');
    resultsContainer.innerHTML = ''; // Clear previous results

    const allBoats = [player1Boat, ...aiBoats];
    allBoats.sort((a, b) => {
        if (a.isFinished && !b.isFinished) return -1;
        if (!a.isFinished && b.isFinished) return 1;
        if (a.isFinished && b.isFinished) return a.finishTime - b.finishTime;
        return 0; // Keep original order for unfinished boats
    });

    let resultsHTML = '<table id="results-table"><thead><tr><th>Rank</th><th>Name</th><th>Total Time</th><th>Lap Times</th>';
    if (isSeries) {
        resultsHTML += '<th>Points</th>';
    }
    resultsHTML += '</tr></thead><tbody>';

    const points = [10, 6, 4, 0];
    allBoats.forEach((boat, index) => {
        const rank = index + 1;
        const time = boat.isFinished ? ((boat.finishTime - boat.raceStartTime) / 1000).toFixed(2) + 's' : 'DNF';
        const lapTimesStr = boat.lapTimes.map(t => t.toFixed(2)).join(', ');
        resultsHTML += `<tr><td>${rank}</td><td>${boat.name}</td><td>${time}</td><td>${lapTimesStr}</td>`;
        if (isSeries) {
            const racePoints = boat.isFinished ? (points[index] || 0) : 0;
            if (boat.name in seriesScores) {
                 seriesScores[boat.name] += racePoints;
            } else {
                 seriesScores[boat.name] = racePoints;
            }
            resultsHTML += `<td>${racePoints}</td>`;
        }
        resultsHTML += '</tr>';
    });
    resultsHTML += '</tbody></table>';
    resultsContainer.innerHTML = resultsHTML;

    if (isSeries) {
        titleElement.textContent = `Race ${currentRace} of ${seriesLength} Results`;

        let seriesStandingsHTML = '<h3>Series Standings</h3><table id="series-standings-table" class="results-table"><thead><tr><th>Rank</th><th>Name</th><th>Score</th></tr></thead><tbody>';
        const sortedScores = Object.entries(seriesScores).sort(([, a], [, b]) => b - a);
        sortedScores.forEach(([name, score], index) => {
            seriesStandingsHTML += `<tr><td>${index + 1}</td><td>${name}</td><td>${score}</td></tr>`;
        });
        seriesStandingsHTML += '</tbody></table>';
        resultsContainer.innerHTML += seriesStandingsHTML;

        if (currentRace >= seriesLength) {
            titleElement.textContent = 'Final Series Results';
            document.getElementById('restart-race').textContent = 'Main Menu';
        } else {
            document.getElementById('restart-race').textContent = 'Next Race';
        }

    } else {
        titleElement.textContent = 'Race Finished!';
    }

    raceFinishedElement.style.display = 'flex';
}

function restartGame() {
    if (isSeries && currentRace >= seriesLength) {
        isSeries = false;
        currentRace = 0;
        seriesScores = {};
        document.getElementById('restart-race').textContent = 'Restart Race';
        resetGame();
        setup();
    } else if (isSeries) {
        resetGame();
        setup();
        startGame();
    } else {
        resetGame();
        setup();
    }
}

function resetGame() {
    gameRunning = false;
    aiBoats = [];
    sandbars = [];
    buoys = [];
    waves = [];
    windParticles = [];
    raceState = 'pre-race';
    raceFinishedElement.style.display = 'none';
    startMenu.style.display = 'block';
    countdownElement.style.display = 'none';
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    waveCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
    miniMapCtx.clearRect(0, 0, miniMap.width, miniMap.height);
}

window.onload = () => {
    setup();
    startRaceButton.addEventListener('click', () => {
        isSeries = false;
        startGame();
    });
    document.getElementById('start-series').addEventListener('click', () => {
        isSeries = true;
        currentRace = 0;
        seriesScores = {};
        startGame();
    });
    restartRaceButton.addEventListener('click', restartGame);
};