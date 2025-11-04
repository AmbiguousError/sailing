// game.js

// Constants adapted from constants.py
const SCREEN_WIDTH = 800;
const SCREEN_HEIGHT = 600;
const WORLD_BOUNDS = 2000;
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
const MIN_TURN_EFFECTIVENESS = 0.8;
const SANDBAR_DRAG_MULTIPLIER = 0.8;
const NO_POWER_DECEL = 0.1;
const BUOY_ROUNDING_RADIUS = 50;
const MAX_LAPS = 3;

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
    }

    reset() {
        this.worldX = 0.0;
        this.worldY = 0.0;
        this.prevWorldX = 0.0;
        this.prevWorldY = 0.0;
        this.heading = 90.0;
        this.speed = 0.0;
        this.sailAngleRel = 0.0;
        this.visualSailAngleRel = 0.0;
        this.wakeParticles = [];
        this.raceStarted = false;
        this.isFinished = false;
        this.currentLap = 1;
        this.nextBuoyIndex = 0;
        this.lapStartTime = 0.0;
        this.raceStartTime = 0.0;
        this.finishTime = 0.0;
        this.lapTimes = [];
    }

    trimSail(direction) {
        this.sailAngleRel += direction * SAIL_TRIM_SPEED;
        this.sailAngleRel = Math.max(-MAX_SAIL_ANGLE_REL, Math.min(MAX_SAIL_ANGLE_REL, this.sailAngleRel));
    }

    turn(direction) {
        this.rudderAngle = direction;
    }

    update(windSpeed, windDirection, dt) {
        if (dt <= 0 || isNaN(dt)) {
            return;
        }
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

        if (absWindAngleRelBoat >= MIN_SAILING_ANGLE) {
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

class AIBoat extends Boat {
    constructor(x, y, name = "AI", boatColor = "red") {
        super(x, y, name, boatColor);
        this.aggressiveness = Math.random() * 0.5 + 0.5; // Randomness in performance
        this.tackTimer = 0;
    }

    updateControls(target_buoy, wind_direction, dt) {
        if (!target_buoy) return;

        const angle_to_target = normalize_angle(rad_to_deg(Math.atan2(target_buoy.worldY - this.worldY, target_buoy.worldX - this.worldX)));
        const wind_angle_to_target = Math.abs(angle_difference(angle_to_target, wind_direction));

        if (wind_angle_to_target < MIN_SAILING_ANGLE && this.tackTimer <= 0) {
            this.currentTack = Math.sign(angle_difference(this.heading, wind_direction)) || 1;
            this.tackTimer = Math.random() * 2 + 2; // Tack for 2-4 seconds
        }

        if (this.tackTimer > 0) {
            const tack_angle_modifier = MIN_SAILING_ANGLE * this.currentTack;
            const tack_heading = normalize_angle(wind_direction + tack_angle_modifier);
            const angle_diff = angle_difference(tack_heading, this.heading);

            if (Math.abs(angle_diff) > 5) {
                this.turn(Math.sign(angle_diff));
            } else {
                this.turn(0);
            }
            this.tackTimer -= dt;
        } else {
            const angle_diff = angle_difference(angle_to_target, this.heading);
            if (angle_diff > 5) {
                this.turn(1);
            } else if (angle_diff < -5) {
                this.turn(-1);
            } else {
                this.turn(0);
            }
        }

        // Sail trim logic
        const wind_angle_rel_boat = angle_difference(wind_direction, this.heading);
        const abs_wind_angle_rel_boat = Math.abs(wind_angle_rel_boat);

        if (abs_wind_angle_rel_boat > MIN_SAILING_ANGLE) {
            const optimal_trim = angle_difference(wind_angle_rel_boat + 180, 90);
            this.sailAngleRel = optimal_trim;
        } else {
            this.turn(Math.sign(wind_angle_rel_boat) || 1);
            this.tackTimer = 1; // Short tack to get out of irons
        }
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
        this.isPassed = false;
        this.color = isGate ? START_FINISH_BUOY_COLOR : NEXT_BUOY_INDICATOR_COLOR;
    }

    draw(ctx, offsetX, offsetY, isNext, viewCenter) {
        const screenX = this.worldX - offsetX + viewCenter[0];
        const screenY = this.worldY - offsetY + viewCenter[1];

        let color = this.color;
        if (isNext) {
            color = 'green';
        } else if (this.isPassed) {
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


// Game Elements
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const waveCanvas = document.getElementById('waveCanvas');
const waveCtx = waveCanvas.getContext('2d');
const hud = document.getElementById('hud');
const startScreen = document.getElementById('start-screen');
const resultsScreen = document.getElementById('results-screen');
const singleRaceBtn = document.getElementById('single-race-btn');
const raceSeriesBtn = document.getElementById('race-series-btn');
const freeSailBtn = document.getElementById('free-sail-btn');
const playAgainButton = document.getElementById('play-again-btn');
const resultsList = document.getElementById('results-list');
const windArrow = document.getElementById('wind-arrow');
const optimalSailAngleElement = document.getElementById('optimal-sail-angle');
const speedReading = document.getElementById('speed-reading');
const lapsElement = document.getElementById('laps');
const miniMap = document.getElementById('mini-map');
const miniMapCtx = miniMap.getContext('2d');

let player1Boat;
let aiBoats = [];
let sandbars = [];
let buoys = [];
let waves = [];
let windParticles = [];
let windSpeed = 10.0;
let windDirection = 45.0;
let lastTime = 0;
const keys = {};
let gameState = 'start'; // 'start', 'racing', 'results'
let gameMode = 'singleRace'; // 'singleRace', 'raceSeries', 'freeSail'
let raceSeriesData = {
    races: [],
    currentRace: 0,
    totalRaces: 3
};
let animationFrameId;

function setGameState(newState) {
    gameState = newState;
    switch (gameState) {
        case 'start':
            startScreen.classList.remove('hidden');
            hud.classList.add('hidden');
            resultsScreen.classList.add('hidden');
            break;
        case 'racing':
            startScreen.classList.add('hidden');
            hud.classList.remove('hidden');
            resultsScreen.classList.add('hidden');
            break;
        case 'results':
            startScreen.classList.add('hidden');
            hud.classList.add('hidden');
            resultsScreen.classList.remove('hidden');
            break;
    }
}

function startGame(mode) {
    gameMode = mode;
    if (gameMode === 'raceSeries' && raceSeriesData.currentRace === 0) {
        raceSeriesData.races = [];
    }
    [player1Boat, ...aiBoats].forEach(boat => boat.raceStarted = true);
    setGameState('racing');
    lastTime = performance.now();
    gameLoop(lastTime);
}

function resetGame() {
    if (gameMode === 'raceSeries' && raceSeriesData.currentRace < raceSeriesData.totalRaces) {
        setup();
        startGame('raceSeries');
    } else {
        raceSeriesData.currentRace = 0;
        setup();
        setGameState('start');
    }
}

function showResults() {
    const allBoats = [player1Boat, ...aiBoats];
    allBoats.forEach(boat => boat.score = 0); // Reset scores before recalculating
    allBoats.sort((a, b) => a.finishTime - b.finishTime);

    if (gameMode === 'raceSeries') {
        raceSeriesData.currentRace++;
        const raceResults = [];
        allBoats.forEach((boat, index) => {
            raceResults.push({ name: boat.name, time: boat.finishTime, points: allBoats.length - index });
            boat.score += allBoats.length - index;
        });
        raceSeriesData.races.push(raceResults);

        if (raceSeriesData.currentRace >= raceSeriesData.totalRaces) {
            // Display final series results
            const finalScores = {};
            raceSeriesData.races.forEach(race => {
                race.forEach(result => {
                    if (!finalScores[result.name]) finalScores[result.name] = 0;
                    finalScores[result.name] += result.points;
                });
            });
            const sortedScores = Object.entries(finalScores).sort((a, b) => b[1] - a[1]);
            resultsList.innerHTML = '<h2>Race Series Results</h2>';
            sortedScores.forEach(([name, score]) => {
                const li = document.createElement('li');
                li.textContent = `${name}: ${score} points`;
                resultsList.appendChild(li);
            });
            playAgainButton.textContent = "Play Again";
        } else {
            // Display current race results and standings
            resultsList.innerHTML = `<h2>Race ${raceSeriesData.currentRace} Results</h2>`;
            allBoats.forEach(boat => {
                const li = document.createElement('li');
                li.textContent = `${boat.name}: ${boat.isFinished ? (boat.finishTime / 1000).toFixed(2) + 's' : 'DNF'}`;
                resultsList.appendChild(li);
            });
            playAgainButton.textContent = "Next Race";
        }
    } else {
        resultsList.innerHTML = '<h2>Race Results</h2>';
        allBoats.forEach(boat => {
            const li = document.createElement('li');
            li.textContent = `${boat.name}: ${boat.isFinished ? (boat.finishTime / 1000).toFixed(2) + 's' : 'DNF'}`;
            resultsList.appendChild(li);
        });
        playAgainButton.textContent = "Play Again";
    }

    setGameState('results');
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
}

function setup() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    waveCanvas.width = window.innerWidth;
    waveCanvas.height = window.innerHeight;

    if (!player1Boat) {
        player1Boat = new Boat(canvas.width / 2, canvas.height / 2, "Player 1", "#87CEEB");
    }
    player1Boat.reset();
    player1Boat.worldX = 0;
    player1Boat.worldY = 0;

    aiBoats = [];
    const numOpponents = 3;
    for (let i = 0; i < numOpponents; i++) {
        const aiBoat = new AIBoat(canvas.width / 2, canvas.height / 2, `AI ${i + 1}`, `hsl(${Math.random() * 360}, 100%, 75%)`);
        aiBoat.worldX = -50 * (i + 1);
        aiBoat.worldY = -50 * (i + 1);
        aiBoats.push(aiBoat);
    }

    sandbars = [];
    for (let i = 0; i < 10; i++) {
        sandbars.push(new Sandbar(Math.random() * 2000 - 1000, Math.random() * 2000 - 1000, 150));
    }

    buoys = [];
    if (gameMode !== 'freeSail') {
        const numBuoys = 6;
        for (let i = 0; i < numBuoys; i++) {
            const angle = (i / numBuoys) * 2 * Math.PI + Math.random() * 0.2 - 0.1;
            const distance = Math.random() * 400 + 600; // 600 to 1000 units away
            const x = Math.cos(angle) * distance;
            const y = Math.sin(angle) * distance;
            const buoy = new Buoy(x, y, i);
            buoys.push(buoy);
        }
    }

    windDirection = Math.random() * 360;

    waves = [];
    for (let i = 0; i < 20; i++) {
        waves.push(new Wave(windDirection, windSpeed));
    }

    windParticles = [];
    for (let i = 0; i < 50; i++) {
        windParticles.push(new WindParticle(windDirection, windSpeed));
    }

    // Event Listeners
    if (!window.listenersAdded) {
        singleRaceBtn.addEventListener('click', () => startGame('singleRace'));
        raceSeriesBtn.addEventListener('click', () => startGame('raceSeries'));
        freeSailBtn.addEventListener('click', () => startGame('freeSail'));
        playAgainButton.addEventListener('click', resetGame);
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
        window.listenersAdded = true;
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
    if (gameState !== 'racing') return;

    const dt = (timestamp - lastTime) / 1000.0;
    lastTime = timestamp;

    handleInput();
    update(dt);
    render();

    animationFrameId = requestAnimationFrame(gameLoop);
}

function handle_boat_collisions(allBoats) {
    for (let i = 0; i < allBoats.length; i++) {
        for (let j = i + 1; j < allBoats.length; j++) {
            const boat1 = allBoats[i];
            const boat2 = allBoats[j];

            const distSq = distance_sq([boat1.worldX, boat1.worldY], [boat2.worldX, boat2.worldY]);
            const min_dist = boat1.collisionRadius + boat2.collisionRadius;

            if (distSq < min_dist * min_dist) {
                const distance = Math.sqrt(distSq);
                const overlap = min_dist - distance;

                const dx = boat2.worldX - boat1.worldX;
                const dy = boat2.worldY - boat1.worldY;

                if (distance === 0) {
                    boat1.worldX += (Math.random() - 0.5) * 0.1;
                    boat1.worldY += (Math.random() - 0.5) * 0.1;
                    continue;
                }

                const nx = dx / distance;
                const ny = dy / distance;

                boat1.worldX -= nx * overlap / 2;
                boat1.worldY -= ny * overlap / 2;
                boat2.worldX += nx * overlap / 2;
                boat2.worldY += ny * overlap / 2;

                const impulse = 0.5;
                boat1.speed *= 0.9;
                boat2.speed *= 0.9;

                boat1.worldX -= nx * impulse;
                boat1.worldY -= ny * impulse;
                boat2.worldX += nx * impulse;
                boat2.worldY += ny * impulse;
            }
        }
    }
}

function update(dt) {
    // Cap dt to prevent physics explosions from browser tab inactivity
    dt = Math.min(dt, 0.1);

    [player1Boat, ...aiBoats].forEach(boat => {
        if (!boat.isFinished) {
            boat.update(windSpeed, windDirection, dt);
        }
    });

    if (gameMode !== 'freeSail') {
        aiBoats.forEach(aiBoat => {
            if (!aiBoat.isFinished) {
                aiBoat.updateControls(buoys[aiBoat.nextBuoyIndex], windDirection, dt);
            }
        });
    }

    waves.forEach(w => w.update());
    windParticles.forEach(p => p.update());

    // Handle boat collisions
    handle_boat_collisions([player1Boat, ...aiBoats]);

    // Buoy collision and lap counting
    if (gameMode !== 'freeSail') {
        [player1Boat, ...aiBoats].forEach(boat => {
            if (!boat || boat.isFinished) return;

            if (boat.raceStarted && boat.raceStartTime === 0.0) {
                boat.raceStartTime = performance.now();
                boat.lapStartTime = performance.now();
            }

            if (boat.nextBuoyIndex < buoys.length) {
                const nextBuoy = buoys[boat.nextBuoyIndex];
                const distSq = distance_sq([boat.worldX, boat.worldY], [nextBuoy.worldX, nextBuoy.worldY]);
                if (distSq < BUOY_ROUNDING_RADIUS * BUOY_ROUNDING_RADIUS) {
                    nextBuoy.isPassed = true;
                    boat.nextBuoyIndex++;
                    if (boat.nextBuoyIndex === buoys.length) {
                        const now = performance.now();
                        boat.lapTimes.push(now - boat.lapStartTime);
                        boat.lapStartTime = now;

                        if (boat.currentLap >= MAX_LAPS) {
                            boat.isFinished = true;
                            boat.finishTime = now - boat.raceStartTime;
                        } else {
                            boat.currentLap++;
                            boat.nextBuoyIndex = 0;
                            buoys.forEach(b => b.isPassed = false); // Reset for player, could be specific
                        }
                    }
                }
            }
        });
    }

    // Check if race is over
    if (player1Boat.isFinished) {
        showResults();
    }
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
        b.draw(ctx, worldOffsetX, worldOffsetY, isNext, viewCenter);
    });

    player1Boat.screenX = viewCenter[0];
    player1Boat.screenY = viewCenter[1];
    player1Boat.draw(ctx);

    if (gameMode !== 'freeSail' && player1Boat.nextBuoyIndex < buoys.length) {
        const nextBuoy = buoys[player1Boat.nextBuoyIndex];
        const angleToBuoy = Math.atan2(nextBuoy.worldY - player1Boat.worldY, nextBuoy.worldX - player1Boat.worldX);

        ctx.save();
        ctx.translate(player1Boat.screenX, player1Boat.screenY);
        ctx.rotate(angleToBuoy);

        // More subtle, arrow shape, and further away
        ctx.fillStyle = 'rgba(255, 215, 0, 0.5)'; // More transparent
        ctx.beginPath();
        ctx.moveTo(50, 0); // Start further away
        ctx.lineTo(70, -10);
        ctx.lineTo(65, 0);
        ctx.lineTo(70, 10);
        ctx.closePath();
        ctx.fill();

        ctx.restore();
    }

    aiBoats.forEach(aiBoat => {
        aiBoat.screenX = aiBoat.worldX - worldOffsetX + viewCenter[0];
        aiBoat.screenY = aiBoat.worldY - worldOffsetY + viewCenter[1];
        aiBoat.draw(ctx);
    });

    // Update HUD
    windArrow.style.transform = `rotate(${windDirection}deg)`;
    optimalSailAngleElement.style.transform = `rotate(${player1Boat.optimalSailTrim + player1Boat.heading}deg)`;
    speedReading.textContent = `Speed: ${player1Boat.speed.toFixed(1)}`;
    if (gameMode === 'freeSail') {
        lapsElement.classList.add('hidden');
    } else {
        lapsElement.classList.remove('hidden');
        let lapText = `Lap: ${player1Boat.currentLap}/${MAX_LAPS}`;
        if (gameMode === 'raceSeries') {
            lapText += ` | Race: ${raceSeriesData.currentRace + 1}/${raceSeriesData.totalRaces}`;
        }
        lapsElement.textContent = lapText;
    }

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

    miniMapCtx.fillStyle = 'rgba(170, 221, 222, 0.7)'; // Translucent water color
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
        } else if (b.isPassed) {
            color = 'red';
        }

        miniMapCtx.fillStyle = color;
        miniMapCtx.beginPath();
        miniMapCtx.arc(buoyX, buoyY, 3, 0, 2 * Math.PI);
        miniMapCtx.fill();
    });
}


window.onload = () => {
    setup();
    setGameState('start');
};