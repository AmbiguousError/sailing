const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const minimap = document.getElementById('minimapCanvas');
const minimapCtx = minimap.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

minimap.width = 200;
minimap.height = 150;

// Game state
let player1Boat;
let aiBoats = [];
let buoys = [];
let wind = { speed: 5, direction: Math.PI / 4 }; // Wind from North-East
let raceState = 'pre-race'; // 'pre-race', 'racing', 'finished'
let countdown = 3;

const speedHud = document.getElementById('speed');
const windHud = document.getElementById('wind');
const lapHud = document.getElementById('lap');
const nextBuoyHud = document.getElementById('nextBuoy');

const COURSE_WIDTH = 3000;
const COURSE_HEIGHT = 2000;
const NUM_BUOYS = 5;
const NUM_AI = 4;
const LAPS = 3;

class Boat {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.angle = 0; // Boat's heading
        this.sailAngle = 0;
        this.rudderAngle = 0;
        this.speed = 0;
        this.history = []; // For drawing the wake
        this.lap = 1;
        this.nextBuoyIndex = 0;
        this.passedBuoys = new Set();
    }

    update(wind) {
        // Rudder and sail physics
        this.angle += this.rudderAngle * this.speed * 0.01;
        let relativeWindAngle = wind.direction - this.angle;
        let optimalSailAngle = Math.atan2(Math.sin(relativeWindAngle), Math.cos(relativeWindAngle));
        this.sailAngle = optimalSailAngle;

        // Calculate speed based on sail angle to wind
        let sailEffectiveness = Math.abs(Math.sin(this.sailAngle - relativeWindAngle));
        let targetSpeed = wind.speed * sailEffectiveness;
        this.speed += (targetSpeed - this.speed) * 0.05;

        this.x += Math.cos(this.angle) * this.speed * 0.1;
        this.y += Math.sin(this.angle) * this.speed * 0.1;

        // Add to wake history
        this.history.push({x: this.x, y: this.y});
        if (this.history.length > 50) {
            this.history.shift();
        }

        // AI Logic
        if (this.ai) {
            this.ai.update(this, buoys, wind);
        }
    }

    draw(ctx, isPlayer) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        // Hull
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.moveTo(-15, -5);
        ctx.lineTo(15, 0);
        ctx.lineTo(-15, 5);
        ctx.closePath();
        ctx.fill();

        // Sail
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.moveTo(-10, 0);
        ctx.lineTo(-10 + Math.cos(this.sailAngle) * 20, Math.sin(this.sailAngle) * 20);
        ctx.lineTo(-5, 0);
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        // Draw wake
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        for (let i = 0; i < this.history.length; i++) {
            ctx.lineTo(this.history[i].x, this.history[i].y);
        }
        ctx.stroke();
    }
}

class AI {
    constructor() {
        this.state = 'sailing'; // 'sailing', 'tacking'
        this.tackTimer = 0;
    }

    update(boat, buoys, wind) {
        if (this.tackTimer > 0) {
            this.tackTimer--;
            return;
        }

        const nextBuoy = buoys[boat.nextBuoyIndex];
        const dx = nextBuoy.x - boat.x;
        const dy = nextBuoy.y - boat.y;
        const targetAngle = Math.atan2(dy, dx);

        const relativeWindAngle = wind.direction - boat.angle;
        const inNoSailZone = Math.abs(relativeWindAngle) < Math.PI / 4 || Math.abs(relativeWindAngle) > 3 * Math.PI / 4;

        if (this.state === 'tacking') {
            if (Math.abs(boat.angle - this.tackTargetAngle) < 0.1) {
                this.state = 'sailing';
                boat.rudderAngle = 0;
            }
            return; // Continue tacking
        }

        if (inNoSailZone && boat.speed < 2) {
            this.state = 'tacking';
            const tackDirection = Math.sign(Math.cos(relativeWindAngle));
            this.tackTargetAngle = boat.angle + tackDirection * Math.PI / 2;
            boat.rudderAngle = tackDirection * 0.1;
            this.tackTimer = 60; // 1 second
            return;
        }

        // Simple navigation: point towards the next buoy
        let angleDifference = targetAngle - boat.angle;
        while (angleDifference > Math.PI) angleDifference -= 2 * Math.PI;
        while (angleDifference < -Math.PI) angleDifference += 2 * Math.PI;

        boat.rudderAngle = Math.max(-0.1, Math.min(0.1, angleDifference));
    }
}

function setup() {
    // Player boat - Fuchsia
    player1Boat = new Boat(100, 100, '#FF00FF');

    // AI boats - Medium Blue
    const aiColor = '#0000CD';
    for (let i = 0; i < NUM_AI; i++) {
        let aiBoat = new Boat(80 - i * 20, 120, aiColor);
        aiBoat.ai = new AI();
        aiBoats.push(aiBoat);
    }

    // Buoys
    for (let i = 0; i < NUM_BUOYS; i++) {
        buoys.push({
            x: Math.random() * (COURSE_WIDTH - 200) + 100,
            y: Math.random() * (COURSE_HEIGHT - 200) + 100,
            radius: 10
        });
    }

    // Sort buoys to create a reasonable course
    buoys.sort((a, b) => a.x - b.x);

    startRace();
}

function startRace() {
    raceState = 'pre-race';
    countdown = 3;
    let countdownInterval = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            raceState = 'racing';
        }
    }, 1000);
}

function update() {
    if (raceState !== 'racing') return;

    player1Boat.update(wind);
    aiBoats.forEach(boat => boat.update(wind));

    checkBuoys(player1Boat);
    aiBoats.forEach(checkBuoys);
}

function checkBuoys(boat) {
    const nextBuoy = buoys[boat.nextBuoyIndex];
    const dx = nextBuoy.x - boat.x;
    const dy = nextBuoy.y - boat.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < nextBuoy.radius + 20) {
        boat.passedBuoys.add(boat.nextBuoyIndex);
        boat.nextBuoyIndex = (boat.nextBuoyIndex + 1);
        if (boat.nextBuoyIndex >= buoys.length) {
            boat.lap++;
            boat.nextBuoyIndex = 0;
            if (boat.lap > LAPS) {
                raceState = 'finished';
                // Display finish screen
                showFinishScreen(boat === player1Boat);
            }
        }
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Center camera on player
    ctx.translate(canvas.width / 2 - player1Boat.x, canvas.height / 2 - player1Boat.y);

    // Draw ocean
    ctx.fillStyle = '#0077be';
    ctx.fillRect(0, 0, COURSE_WIDTH, COURSE_HEIGHT);

    // Draw buoys
    buoys.forEach((buoy, index) => {
        ctx.fillStyle = player1Boat.passedBuoys.has(index) ? 'green' : 'red';
        if (index === player1Boat.nextBuoyIndex) ctx.fillStyle = 'yellow';
        ctx.beginPath();
        ctx.arc(buoy.x, buoy.y, buoy.radius, 0, Math.PI * 2);
        ctx.fill();
    });

    player1Boat.draw(ctx, true);
    aiBoats.forEach(boat => boat.draw(ctx, false));

    ctx.restore();

    drawMinimap();
    updateHUD();

    if (raceState === 'pre-race') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white';
        ctx.font = '80px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(countdown > 0 ? countdown : 'GO!', canvas.width / 2, canvas.height / 2);
    }

    requestAnimationFrame(draw);
}


function drawMinimap() {
    minimapCtx.clearRect(0, 0, minimap.width, minimap.height);

    // Background
    minimapCtx.fillStyle = '#0077be';
    minimapCtx.fillRect(0, 0, minimap.width, minimap.height);

    const scaleX = minimap.width / COURSE_WIDTH;
    const scaleY = minimap.height / COURSE_HEIGHT;

    // Buoys
    buoys.forEach(buoy => {
        minimapCtx.fillStyle = 'red';
        minimapCtx.beginPath();
        minimapCtx.arc(buoy.x * scaleX, buoy.y * scaleY, 2, 0, Math.PI * 2);
        minimapCtx.fill();
    });

    // Player boat
    minimapCtx.fillStyle = player1Boat.color;
    minimapCtx.fillRect(player1Boat.x * scaleX - 2, player1Boat.y * scaleY - 2, 4, 4);

    // AI boats
    aiBoats.forEach(boat => {
        minimapCtx.fillStyle = boat.color;
        minimapCtx.fillRect(boat.x * scaleX - 2, boat.y * scaleY - 2, 4, 4);
    });
}

function updateHUD() {
    speedHud.textContent = `Speed: ${player1Boat.speed.toFixed(1)} knots`;
    windHud.textContent = `Wind: ${wind.speed.toFixed(1)} knots at ${(wind.direction * 180 / Math.PI).toFixed(0)}°`;
    lapHud.textContent = `Lap: ${player1Boat.lap}/${LAPS}`;
    nextBuoyHud.textContent = `Next Buoy: ${player1Boat.nextBuoyIndex + 1}`;
}

function showFinishScreen(playerWon) {
    const finishDiv = document.createElement('div');
    finishDiv.style.position = 'absolute';
    finishDiv.style.top = '50%';
    finishDiv.style.left = '50%';
    finishDiv.style.transform = 'translate(-50%, -50%)';
    finishDiv.style.backgroundColor = 'rgba(0,0,0,0.7)';
    finishDiv.style.color = 'white';
    finishDiv.style.padding = '40px';
    finishDiv.style.textAlign = 'center';
    finishDiv.style.fontFamily = 'sans-serif';

    const message = document.createElement('h1');
    message.textContent = playerWon ? 'You Finished!' : 'Race Over';
    finishDiv.appendChild(message);

    const restartButton = document.createElement('button');
    restartButton.textContent = 'Restart Race';
    restartButton.style.padding = '15px 30px';
    restartButton.style.fontSize = '1.2em';
    restartButton.style.marginTop = '20px';
    restartButton.onclick = () => {
        document.body.removeChild(finishDiv);
        resetGame();
    };
    finishDiv.appendChild(restartButton);

    document.body.appendChild(finishDiv);
}

function resetGame() {
    player1Boat = null;
    aiBoats = [];
    buoys = [];
    setup();
}


// Controls
document.getElementById('left').addEventListener('pointerdown', () => player1Boat.rudderAngle = -0.1);
document.getElementById('left').addEventListener('pointerup', () => player1Boat.rudderAngle = 0);
document.getElementById('right').addEventListener('pointerdown', () => player1Boat.rudderAngle = 0.1);
document.getElementById('right').addEventListener('pointerup', () => player1Boat.rudderAngle = 0);


setInterval(() => {
    // Wind shifts
    wind.direction += (Math.random() - 0.5) * 0.1;
    wind.speed += (Math.random() - 0.5) * 0.5;
    if (wind.speed < 2) wind.speed = 2;
    if (wind.speed > 10) wind.speed = 10;
}, 5000);

setup();
setInterval(update, 1000/60);
draw();
