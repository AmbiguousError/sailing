// game.js

// Constants adapted from constants.py
const MAX_LAPS = 3;
const SCREEN_WIDTH = 800;
const SCREEN_HEIGHT = 600;
const WORLD_BOUNDS = 2000;
const BOAT_ACCEL_FACTOR = 0.1;
const BOAT_TURN_SPEED = 1.5;
const MAX_BOAT_SPEED = 5.0;
const SAIL_TRIM_SPEED = 6.0;
const MAX_SAIL_ANGLE_REL = 90;
const MIN_SAILING_ANGLE = 45;
const WAKE_LIFETIME = 2.0;
const MAX_WAKE_PARTICLES = 100;
const WAKE_SPAWN_INTERVAL = 0.1;
const BOAT_DRAG = 0.95;
const MIN_TURN_EFFECTIVENESS = 0.8;
const SANDBAR_DRAG_FACTOR = 2.5;
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

function handle_boat_collision(boat1, boat2) {
    const dist_sq = distance_sq([boat1.worldX, boat1.worldY], [boat2.worldX, boat2.worldY]);
    const min_dist = boat1.collisionRadius + boat2.collisionRadius;

    if (dist_sq < min_dist * min_dist && dist_sq > 0) {
        const dist = Math.sqrt(dist_sq);
        const overlap = min_dist - dist;

        const nx = (boat2.worldX - boat1.worldX) / dist;
        const ny = (boat2.worldY - boat1.worldY) / dist;

        // Separate the boats
        boat1.worldX -= nx * overlap * 0.5;
        boat1.worldY -= ny * overlap * 0.5;
        boat2.worldX += nx * overlap * 0.5;
        boat2.worldY += ny * overlap * 0.5;

        // Calculate relative velocity
        const rel_vx = Math.cos(deg_to_rad(boat2.heading)) * boat2.speed - Math.cos(deg_to_rad(boat1.heading)) * boat1.speed;
        const rel_vy = Math.sin(deg_to_rad(boat2.heading)) * boat2.speed - Math.sin(deg_to_rad(boat1.heading)) * boat1.speed;

        // Calculate velocity along the normal
        const vel_along_normal = rel_vx * nx + rel_vy * ny;

        // Do not resolve if velocities are separating
        if (vel_along_normal > 0) return;

        const restitution = 0.5; // Bounciness
        let impulse = -(1 + restitution) * vel_along_normal;

        // Simple mass assumption (equal mass for all boats)
        impulse /= 2;

        const impulse_x = impulse * nx;
        const impulse_y = impulse * ny;

        // Apply impulse to boat speeds
        const new_speed1 = Math.sqrt(Math.pow(Math.cos(deg_to_rad(boat1.heading)) * boat1.speed + impulse_x, 2) + Math.pow(Math.sin(deg_to_rad(boat1.heading)) * boat1.speed + impulse_y, 2));
        const new_speed2 = Math.sqrt(Math.pow(Math.cos(deg_to_rad(boat2.heading)) * boat2.speed - impulse_x, 2) + Math.pow(Math.sin(deg_to_rad(boat2.heading)) * boat2.speed - impulse_y, 2));

        boat1.speed = Math.max(0, new_speed1 * 0.9); // Lose some energy
        boat2.speed = Math.max(0, new_speed2 * 0.9);
    }
}

function is_on_collision_course(boat, obstacle, lookahead_time = 2.0) {
    const boat_vx = Math.cos(deg_to_rad(boat.heading)) * boat.speed;
    const boat_vy = Math.sin(deg_to_rad(boat.heading)) * boat.speed;
    const future_boat_x = boat.worldX + boat_vx * lookahead_time;
    const future_boat_y = boat.worldY + boat_vy * lookahead_time;

    const dist_sq = distance_sq([future_boat_x, future_boat_y], [obstacle.worldX, obstacle.worldY]);
    const min_dist = boat.collisionRadius + obstacle.collisionRadius;

    return dist_sq < min_dist * min_dist;
}

function handle_boat_island_collision(boat, island) {
    const dist_sq = distance_sq([boat.worldX, boat.worldY], [island.worldX, island.worldY]);
    const min_dist = boat.collisionRadius + island.collisionRadius;
    if (dist_sq < min_dist * min_dist) {
        const dist = Math.sqrt(dist_sq);
        const overlap = min_dist - dist;

        const dx = boat.worldX - island.worldX;
        const dy = boat.worldY - island.worldY;

        const nx = dx / dist;
        const ny = dy / dist;

        boat.worldX += nx * overlap;
        boat.worldY += ny * overlap;

        boat.speed *= 0.8;
    }
}

function handle_boat_sandbar_collision(boat, sandbar) {
    const dist_sq = distance_sq([boat.worldX, boat.worldY], [sandbar.worldX, sandbar.worldY]);
    const min_dist = boat.collisionRadius + sandbar.collisionRadius;
    if (dist_sq < min_dist * min_dist) {
        return true;
    }
    return false;
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
    constructor(y, speed, length, amplitude, color) {
        this.y = y;
        this.x = Math.random() * SCREEN_WIDTH;
        this.speed = speed;
        this.length = length;
        this.amplitude = amplitude;
        this.color = color;
        this.time = Math.random() * 100;
    }

    update(dt) {
        this.x += this.speed * dt;
        this.time += dt;
        if (this.x > SCREEN_WIDTH + this.length) {
            this.x = -this.length;
        }
    }

    draw(ctx) {
        const segmentLength = 5;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.strokeStyle = this.color;
        ctx.lineWidth = 2;

        for (let i = 0; i < this.length; i += segmentLength) {
            const currentX = this.x + i;
            const currentY = this.y + Math.sin(this.time + i / (this.length / 4)) * this.amplitude;
            ctx.lineTo(currentX, currentY);
        }
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
        this.heeling = 0.0; // Angle of the boat tilt
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
        this.cabinShape = [
            [-5, -4], [-15, -3], [-15, 3], [-5, 4]
        ];
        this.rotatedShape = this.baseShape.slice();
        this.rotatedDeckShape = this.deckShape.slice();
        this.rotatedCabinShape = this.cabinShape.slice();
        this.mastPosRel = [8, 0];
        this.mastPosAbs = [0, 0];
        this.sailCurvePoints = [];
        this.collisionRadius = 18;
        this.wakeParticles = [];
        this.timeSinceLastWake = 0.0;
        this.lastLineCrossingTime = 0.0;

        // Race progress attributes
        this.raceStarted = false;
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
            dragFactor *= SANDBAR_DRAG_FACTOR;
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

        // --- Heeling Calculation ---
        const windAngleRelSail = Math.abs(angle_difference(windDirection, this.heading + this.sailAngleRel));
        const heelForce = Math.sin(deg_to_rad(windAngleRelSail)) * this.windEffectiveness;
        const targetHeeling = -heelForce * 30; // Max heel angle of 30 degrees

        // Smoothly transition to the target heeling angle
        this.heeling += (targetHeeling - this.heeling) * 0.1;

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

        ctx.save();
        ctx.translate(this.screenX, this.screenY);
        ctx.rotate(deg_to_rad(this.heeling)); // Apply heeling rotation
        ctx.translate(-this.screenX, -this.screenY);

        const darkerColor = "gray";
        const cabinColor = "#D2B48C"; // Tan color for cabin

        this.drawPolygon(ctx, this.rotatedShape, this.color, BLACK, 2);
        this.drawPolygon(ctx, this.rotatedDeckShape, darkerColor, BLACK, 1);
        this.drawPolygon(ctx, this.rotatedCabinShape, cabinColor, BLACK, 1);

        // Draw Mast
        ctx.fillStyle = BLACK;
        ctx.beginPath();
        ctx.arc(this.mastPosAbs[0], this.mastPosAbs[1], 3, 0, Math.PI * 2);
        ctx.fill();

        this.updateSailCurve(this.visualSailAngleRel);
        if (this.sailCurvePoints.length >= 3) {
            this.drawPolygon(ctx, this.sailCurvePoints, SAIL_COLOR, "gray", 1);
        }
        ctx.restore();
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

        this.rotatedCabinShape = this.cabinShape.map(([x, y]) => [
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
        // Vary AI abilities
        this.aggressiveness = Math.random(); // 0 (cautious) to 1 (aggressive)
        this.tackingSkill = Math.random(); // 0 (bad) to 1 (perfect)
        this.sailTrimSkill = Math.random(); // 0 (bad) to 1 (perfect)
        this.headingError = (1 - Math.random()) * 10 - 5; // Persistent heading error +/- 5 deg

        this.tackDecisionTime = 0;
        this.avoidanceManeuver = null; // To handle sustained obstacle avoidance
        this.stuckInIrons = false;
        this.recoveryTurnDirection = 0;
    }

    updateControls(target_buoy, wind_direction, islands, dt) {
        if (!target_buoy) return;

        // --- Obstacle Avoidance ---
        if (this.avoidanceManeuver && this.avoidanceManeuver.timeLeft > 0) {
            this.avoidanceManeuver.timeLeft -= dt;
            this.turn(this.avoidanceManeuver.turnDirection);
            this.sailAngleRel = this.calculateOptimalSailTrim(wind_direction);
            // If we are still on a collision course, extend the maneuver
            if (is_on_collision_course(this, this.avoidanceManeuver.obstacle, 3)) {
                this.avoidanceManeuver.timeLeft = 1.0;
            }
            return;
        } else {
            this.avoidanceManeuver = null;
        }

        for (const island of islands) {
            const lookahead_time = 5 / (this.speed + 1) + 1; // More cautious lookahead
            if (is_on_collision_course(this, island, lookahead_time)) {
                const angle_to_obstacle = normalize_angle(rad_to_deg(Math.atan2(island.worldY - this.worldY, island.worldX - this.worldX)));
                const angle_diff = angle_difference(angle_to_obstacle, this.heading);
                const turnDirection = angle_diff > 0 ? -1 : 1;
                this.avoidanceManeuver = {
                    obstacle: island,
                    turnDirection: turnDirection,
                    timeLeft: 1.5
                };
                this.turn(turnDirection);
                return;
            }
        }

        // --- Tacking and Navigation Logic ---
        const headingToTarget = normalize_angle(rad_to_deg(Math.atan2(target_buoy.worldY - this.worldY, target_buoy.worldX - this.worldX)));
        const windAngleToTarget = Math.abs(angle_difference(headingToTarget, wind_direction));

        const portTackHeading = normalize_angle(wind_direction + MIN_SAILING_ANGLE * (0.8 + this.tackingSkill * 0.2));
        const starboardTackHeading = normalize_angle(wind_direction - MIN_SAILING_ANGLE * (0.8 + this.tackingSkill * 0.2));

        let desiredHeading;

        if (windAngleToTarget < MIN_SAILING_ANGLE) { // Target is upwind
            const onPortTack = angle_difference(this.heading, wind_direction) > 0;
            const currentTackLayline = onPortTack ? portTackHeading : starboardTackHeading;
            const angleToTargetFromLayline = angle_difference(headingToTarget, currentTackLayline);

            const tackThreshold = 15 * (1 + (1 - this.aggressiveness));

            let shouldTack = false;
            if (onPortTack && angleToTargetFromLayline < -tackThreshold) {
                shouldTack = true; // Target is too far to starboard, tack to starboard
            } else if (!onPortTack && angleToTargetFromLayline > tackThreshold) {
                shouldTack = true; // Target is too far to port, tack to port
            }

            // Cooldown to prevent rapid tacking
            if (this.tackDecisionTime > 0) {
                this.tackDecisionTime -= dt;
                shouldTack = false;
            }

            if (shouldTack) {
                desiredHeading = onPortTack ? starboardTackHeading : portTackHeading;
                this.tackDecisionTime = 5.0; // 5 second cooldown
            } else {
                desiredHeading = currentTackLayline;
            }
        } else { // Target is downwind or reachable
            desiredHeading = headingToTarget;
        }

        // --- In Irons Recovery ---
        const currentAngleFromWind = Math.abs(angle_difference(this.heading, wind_direction));
        if (currentAngleFromWind < MIN_SAILING_ANGLE - 5 && this.speed < 1.0) {
            if (!this.stuckInIrons) {
                this.stuckInIrons = true;
                // Decide which way to turn for recovery. Turn away from the wind.
                this.recoveryTurnDirection = angle_difference(this.heading, wind_direction) > 0 ? -1 : 1;
            }
        } else if (this.stuckInIrons && currentAngleFromWind > MIN_SAILING_ANGLE) {
            // We have successfully recovered
            this.stuckInIrons = false;
            this.recoveryTurnDirection = 0;
        }

        if (this.stuckInIrons) {
            this.turn(this.recoveryTurnDirection);
            this.sailAngleRel = this.calculateOptimalSailTrim(wind_direction);
            return; // Override all other navigation while stuck
        }

        const finalHeading = normalize_angle(desiredHeading + this.headingError);
        const headingDiff = angle_difference(finalHeading, this.heading);

        // Apply steering
        if (Math.abs(headingDiff) > 2) {
            this.turn(Math.sign(headingDiff));
        } else {
            // The buoy is upwind, so we need to tack.

            const currentAngleFromWind = angle_difference(this.heading, wind_direction);
            // Check if we are on a valid tack (not in irons). A 10 degree buffer is used.
            const onValidTack = Math.abs(currentAngleFromWind) > (MIN_SAILING_ANGLE - 10);

            const portTackHeading = normalize_angle(wind_direction + MIN_SAILING_ANGLE);
            const starboardTackHeading = normalize_angle(wind_direction - MIN_SAILING_ANGLE);

            if (!onValidTack) {
                // We are stuck in irons or on a poor tack. Choose the best tack to get started.
                const portDiff = Math.abs(angle_difference(portTackHeading, headingToTarget));
                const starboardDiff = Math.abs(angle_difference(starboardTackHeading, headingToTarget));
                desiredHeading = (portDiff < starboardDiff) ? portTackHeading : starboardTackHeading;
            } else {
                // We are already on a valid tack. Decide whether to switch tacks.
                const onPortTack = currentAngleFromWind > 0;
                const targetIsToStarboard = angle_difference(headingToTarget, this.heading) < 0;
                const targetIsToPort = angle_difference(headingToTarget, this.heading) > 0;

                // Tack when the target buoy has crossed over the boat's bow.
                if (onPortTack && targetIsToStarboard) {
                    desiredHeading = starboardTackHeading;
                } else if (!onPortTack && targetIsToPort) {
                    desiredHeading = portTackHeading;
                } else {
                    // Continue on the current tack.
                    desiredHeading = onPortTack ? portTackHeading : starboardTackHeading;
                }
            }
        }

        // Apply sail trim
        this.sailAngleRel = this.calculateOptimalSailTrim(wind_direction);
    }

    calculateOptimalSailTrim(wind_direction) {
        const wind_angle_rel_boat = angle_difference(wind_direction, this.heading);
        let optimal_trim = angle_difference(wind_angle_rel_boat + 180, 90);
        optimal_trim = Math.max(-MAX_SAIL_ANGLE_REL, Math.min(MAX_SAIL_ANGLE_REL, optimal_trim));

        const errorRange = (1.0 - this.sailTrimSkill) * 15;
        const trimError = (Math.random() * errorRange) - (errorRange / 2);

        return Math.max(-MAX_SAIL_ANGLE_REL, Math.min(MAX_SAIL_ANGLE_REL, optimal_trim + trimError));
    }
}

class Island {
    constructor(worldX, worldY, size) {
        this.worldX = worldX;
        this.worldY = worldY;
        this.size = size;
        this.pointsRel = this._generateRandomPoints(size);
        this.pointsWorld = this.pointsRel.map(p => [p[0] + worldX, p[1] + worldY]);
        this.collisionRadius = size / 2;
    }

    _generateRandomPoints(size) {
        const points = [];
        const numVertices = Math.floor(Math.random() * 5) + 8; // 8-12 vertices
        const avgRadius = size / 2.0;
        for (let i = 0; i < numVertices; i++) {
            let angle = (i / numVertices) * 2 * Math.PI;
            const radiusVariation = Math.random() * 0.3 + 0.85; // 0.85 to 1.15
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
            ctx.save();
            ctx.beginPath();
            ctx.moveTo(screenPoints[0][0], screenPoints[0][1]);
            for (let i = 1; i < screenPoints.length; i++) {
                ctx.lineTo(screenPoints[i][0], screenPoints[i][1]);
            }
            ctx.closePath();

            // Create a simple two-tone effect for the island
            const gradient = ctx.createLinearGradient(
                this.worldX - this.size / 2 - offsetX + viewCenter[0],
                this.worldY - this.size / 2 - offsetY + viewCenter[1],
                this.worldX + this.size / 2 - offsetX + viewCenter[0],
                this.worldY + this.size / 2 - offsetY + viewCenter[1]
            );
            gradient.addColorStop(0, '#6B8E23'); // OliveDrab (grassy top)
            gradient.addColorStop(1, '#8B4513'); // SaddleBrown (earthy bottom)

            ctx.fillStyle = gradient;
            ctx.fill();
            ctx.strokeStyle = BLACK;
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
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
        this.collisionRadius = size / 2;
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

        let baseColor = this.isGate ? START_FINISH_BUOY_COLOR : BUOY_COLOR;
        if (this.isPassed) baseColor = '#A9A9A9'; // DarkGray

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        ctx.beginPath();
        ctx.arc(screenX + 3, screenY + 3, this.radius, 0, 2 * Math.PI);
        ctx.fill();

        // Base
        ctx.fillStyle = baseColor;
        ctx.beginPath();
        ctx.arc(screenX, screenY, this.radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.strokeStyle = BLACK;
        ctx.lineWidth = 1;
        ctx.stroke();

        // Stripe
        ctx.fillStyle = isNext ? NEXT_BUOY_INDICATOR_COLOR : WHITE;
        ctx.beginPath();
        ctx.rect(screenX - this.radius, screenY - this.radius / 4, this.radius * 2, this.radius / 2);
        ctx.fill();

        // Buoy Number (for non-gate buoys)
        if (!this.isGate) {
            ctx.fillStyle = BLACK;
            ctx.font = 'bold 12px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.index + 1, screenX, screenY);
        }
    }
}


// Game Loop
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const waveCanvas = document.getElementById('waveCanvas');
const waveCtx = waveCanvas.getContext('2d');
const windArrow = document.getElementById('wind-arrow');
const optimalSailAngleElement = document.getElementById('optimal-sail-angle');
const speedReading = document.getElementById('speed-reading');
const lapsElement = document.getElementById('laps');
const nextBuoyElement = document.getElementById('next-buoy');
const miniMap = document.getElementById('mini-map');
const miniMapCtx = miniMap.getContext('2d');

let player1Boat;
let aiBoats = [];
let sandbars = [];
let islands = [];
let buoys = [];
let waves = [];
let windParticles = [];
let windSpeed = 10.0;
let windDirection = 45.0;
let lastTime = 0;
const keys = {};
let gameState = 'start'; // 'start', 'countdown', 'racing', 'race-over'

function setup() {
    document.getElementById('start-screen').style.display = 'block';
    document.getElementById('race-over-screen').style.display = 'none';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    waveCanvas.width = window.innerWidth;
    waveCanvas.height = window.innerHeight;

    gameState = 'start';
    aiBoats = [];
    sandbars = [];
    buoys = [];
    waves = [];
    windParticles = [];

    windDirection = Math.random() * 360;

    player1Boat = new Boat(canvas.width / 2, canvas.height / 2, "Player 1", "#87CEEB");
    player1Boat.worldX = 0;
    player1Boat.worldY = 0;

    const numOpponents = 3;
    for (let i = 0; i < numOpponents; i++) {
        const aiBoat = new AIBoat(canvas.width / 2, canvas.height / 2, `AI ${i + 1}`, `hsl(${Math.random() * 360}, 100%, 75%)`);
        // Spread them out even more at the start to prevent immediate collisions
        aiBoat.worldX = -120 * (i + 1);
        aiBoat.worldY = 100 * (i % 2 === 0 ? 1 : -1) * (Math.random() * 0.5 + 0.8);
        aiBoats.push(aiBoat);
    }

    const numIslands = 5;
    for (let i = 0; i < numIslands; i++) {
        islands.push(new Island(Math.random() * 2000 - 1000, Math.random() * 2000 - 1000, Math.random() * 100 + 150));
    }

    // Connect nearby islands with sandbars to form atolls
    for (let i = 0; i < islands.length; i++) {
        for (let j = i + 1; j < islands.length; j++) {
            const island1 = islands[i];
            const island2 = islands[j];
            const dist_sq = distance_sq([island1.worldX, island1.worldY], [island2.worldX, island2.worldY]);
            const max_dist_for_atoll = 800;

            if (dist_sq < max_dist_for_atoll * max_dist_for_atoll) {
                const num_segments = Math.floor(Math.sqrt(dist_sq) / 80);
                for (let k = 1; k < num_segments; k++) {
                    const t = k / num_segments;
                    const x = island1.worldX + (island2.worldX - island1.worldX) * t + (Math.random() - 0.5) * 100;
                    const y = island1.worldY + (island2.worldY - island1.worldY) * t + (Math.random() - 0.5) * 100;
                    sandbars.push(new Sandbar(x, y, Math.random() * 60 + 40));
                }
            }
        }
    }

    const numBuoys = 8;
    const center_x = 0;
    const center_y = 0;
    const min_dist = 600;
    const max_dist = 1400;
    const min_sep = 300;

    for (let i = 0; i < numBuoys; i++) {
        let x, y, valid_position;
        let attempts = 0;
        do {
            const angle = Math.random() * 2 * Math.PI;
            const distance = min_dist + Math.random() * (max_dist - min_dist);
            x = center_x + Math.cos(angle) * distance;
            y = center_y + Math.sin(angle) * distance;

            valid_position = true;
            // Check against other buoys
            for (const buoy of buoys) {
                if (distance_sq([x, y], [buoy.worldX, buoy.worldY]) < min_sep * min_sep) {
                    valid_position = false;
                    break;
                }
            }

            // Check against islands if the position is still valid
            if (valid_position) {
                for (const island of islands) {
                    const padding = 120; // Extra safe distance from island edge
                    const min_dist_from_island_sq = (island.collisionRadius + padding) * (island.collisionRadius + padding);
                    if (distance_sq([x, y], [island.worldX, island.worldY]) < min_dist_from_island_sq) {
                        valid_position = false;
                        break;
                    }
                }
            }

            attempts++;
        } while (!valid_position && attempts < 50);

        if (attempts >= 50) {
            console.warn("Could not place a buoy with enough separation.");
        }

        buoys.push(new Buoy(x, y, i));
    }

    for (let i = 0; i < 15; i++) {
        const y = (i / 15) * SCREEN_HEIGHT;
        const speed = Math.random() * 20 + 10;
        const length = Math.random() * 100 + 50;
        const amplitude = Math.random() * 5 + 2;
        waves.push(new Wave(y, speed, length, amplitude, 'rgba(255, 255, 255, 0.4)'));
        waves.push(new Wave(y, speed * 0.8, length * 1.2, amplitude * 0.7, 'rgba(255, 255, 255, 0.2)'));
    }

    const waveConfigs = [
        { count: 30, speed: 20, color: [255, 255, 255], lineWidth: 2 },
        { count: 25, speed: 30, color: [255, 255, 255], lineWidth: 1.5 },
        { count: 20, speed: 40, color: [220, 240, 255], lineWidth: 1 }
    ];
    waveConfigs.forEach(config => {
        for (let i = 0; i < config.count; i++) {
            waves.push(new Wave(config));
        }
    });

    for (let i = 0; i < 50; i++) {
        windParticles.push(new WindParticle(windDirection, windSpeed));
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
    // Prevent physics glitches from large time deltas (e.g., tab backgrounding)
    const dt = Math.min((timestamp - lastTime) / 1000.0, 0.1);
    lastTime = timestamp;

    if (gameState === 'racing') {
        handleInput();
        update(dt);
    } else {
        // Update wave and wind visuals even when not racing
        waves.forEach(w => w.update());
        windParticles.forEach(p => p.update());
    }

    render();
    requestAnimationFrame(gameLoop);
}

function update(dt) {
    if (gameState !== 'racing') return;

    player1Boat.update(windSpeed, windDirection, dt);
    aiBoats.forEach(aiBoat => {
        if (!aiBoat.isFinished) {
            aiBoat.updateControls(buoys[aiBoat.nextBuoyIndex], windDirection, islands, dt);
        }
        aiBoat.update(windSpeed, windDirection, dt);
    });
    waves.forEach(w => w.update(dt));
    windParticles.forEach(p => p.update());

    const allBoats = [player1Boat, ...aiBoats];
    for (let i = 0; i < allBoats.length; i++) {
        for (let j = i + 1; j < allBoats.length; j++) {
            handle_boat_collision(allBoats[i], allBoats[j]);
        }
    }

    // Island and Sandbar collision
    allBoats.forEach(boat => {
        boat.onSandbar = false; // Reset at the beginning of the check
        sandbars.forEach(sandbar => {
            if (handle_boat_sandbar_collision(boat, sandbar)) {
                boat.onSandbar = true;
            }
        });

        islands.forEach(island => {
            handle_boat_island_collision(boat, island);
        });
    });

    // Buoy collision
    allBoats.forEach(boat => {
        if (!boat || boat.isFinished) return;
        if (boat.nextBuoyIndex < buoys.length) {
            const nextBuoy = buoys[boat.nextBuoyIndex];
            const distSq = distance_sq([boat.worldX, boat.worldY], [nextBuoy.worldX, nextBuoy.worldY]);
            if (distSq < BUOY_ROUNDING_RADIUS * BUOY_ROUNDING_RADIUS) {
                nextBuoy.isPassed = true;
                boat.nextBuoyIndex++;
                if (boat.nextBuoyIndex === buoys.length) {
                    boat.currentLap++;
                    if (boat.currentLap > MAX_LAPS) {
                        if (!boat.isFinished) {
                            boat.isFinished = true;
                            boat.finishTime = performance.now() - boat.raceStartTime;
                        }
                        if ([player1Boat, ...aiBoats].every(b => b.isFinished)) {
                            gameState = 'race-over';
                        }
                    } else {
                        boat.nextBuoyIndex = 0;
                        buoys.forEach(b => b.isPassed = false);
                    }
                }
            }
        }
    });
}

function render() {
    if (gameState === 'race-over') {
        const resultsList = document.getElementById('results-list');
        resultsList.innerHTML = ''; // Clear previous results
        const allBoats = [player1Boat, ...aiBoats];

        allBoats.sort((a, b) => {
            if (a.isFinished && !b.isFinished) return -1;
            if (!a.isFinished && b.isFinished) return 1;
            if (a.isFinished && b.isFinished) return a.finishTime - b.finishTime;
            // If neither finished, sort by progress (lap, then buoy)
            if (a.currentLap !== b.currentLap) return b.currentLap - a.currentLap;
            return b.nextBuoyIndex - a.nextBuoyIndex;
        });

        allBoats.forEach((boat, index) => {
            const li = document.createElement('li');
            const time = boat.isFinished ? (boat.finishTime / 1000).toFixed(2) + 's' : 'DNF';
            li.textContent = `${index + 1}. ${boat.name} - ${time}`;
            resultsList.appendChild(li);
        });
        document.getElementById('race-over-screen').style.display = 'block';
        return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const worldOffsetX = player1Boat.worldX;
    const worldOffsetY = player1Boat.worldY;
    const viewCenter = [canvas.width / 2, canvas.height / 2];

    renderWaves(worldOffsetX, worldOffsetY, viewCenter);

    sandbars.forEach(s => s.draw(ctx, worldOffsetX, worldOffsetY, viewCenter));
    islands.forEach(i => i.draw(ctx, worldOffsetX, worldOffsetY, viewCenter));

    [player1Boat, ...aiBoats].forEach(boat => {
        boat.wakeParticles.forEach(p => p.draw(ctx, worldOffsetX, worldOffsetY, viewCenter));
    });

    buoys.forEach((b, i) => {
        const isNext = i === player1Boat.nextBuoyIndex;
        b.draw(ctx, worldOffsetX, worldOffsetY, isNext, viewCenter);
    });

    player1Boat.screenX = viewCenter[0];
    player1Boat.screenY = viewCenter[1];
    player1Boat.draw(ctx);

    aiBoats.forEach(aiBoat => {
        aiBoat.screenX = aiBoat.worldX - worldOffsetX + viewCenter[0];
        aiBoat.screenY = aiBoat.worldY - worldOffsetY + viewCenter[1];
        aiBoat.draw(ctx);
    });

    // Update HUD
    windArrow.style.transform = `rotate(${windDirection}deg)`;
    optimalSailAngleElement.style.transform = `rotate(${player1Boat.optimalSailTrim + player1Boat.heading}deg)`;
    speedReading.textContent = `Speed: ${player1Boat.speed.toFixed(1)}`;
    lapsElement.textContent = `Lap: ${player1Boat.isFinished ? 'Finished' : player1Boat.currentLap}`;
    nextBuoyElement.textContent = `Next Buoy: ${player1Boat.isFinished ? '-' : player1Boat.nextBuoyIndex + 1}`;

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

    drawWindIndicator(waveCtx);
    waves.forEach(w => w.draw(waveCtx, waveCanvas.width, waveCanvas.height, offsetX, offsetY));
    windParticles.forEach(p => p.draw(waveCtx));
}

function drawMiniMap() {
    const mapSize = 200;

    // Determine the bounds of all important objects
    let minX = player1Boat.worldX;
    let maxX = player1Boat.worldX;
    let minY = player1Boat.worldY;
    let maxY = player1Boat.worldY;

    const allObjects = [...buoys, ...islands, player1Boat, ...aiBoats];
    allObjects.forEach(obj => {
        const radius = obj.collisionRadius || 0;
        minX = Math.min(minX, obj.worldX - radius);
        maxX = Math.max(maxX, obj.worldX + radius);
        minY = Math.min(minY, obj.worldY - radius);
        maxY = Math.max(maxY, obj.worldY + radius);
    });

    const worldWidth = maxX - minX;
    const worldHeight = maxY - minY;
    const worldCenterX = (minX + maxX) / 2;
    const worldCenterY = (minY + maxY) / 2;

    // Add a padding to the bounds
    const padding = 200;
    const effectiveWorldSize = Math.max(worldWidth, worldHeight) + padding * 2;

    const worldScale = mapSize / effectiveWorldSize;

    miniMapCtx.fillStyle = 'rgba(173, 216, 230, 0.6)';
    miniMapCtx.clearRect(0, 0, mapSize, mapSize);
    miniMapCtx.fillRect(0, 0, mapSize, mapSize);
    miniMapCtx.strokeRect(0, 0, mapSize, mapSize);


    const transformX = (worldX) => (worldX - worldCenterX) * worldScale + mapSize / 2;
    const transformY = (worldY) => (worldY - worldCenterY) * worldScale + mapSize / 2;

    // Draw Islands
    islands.forEach(island => {
        const screenPoints = island.pointsWorld.map(([worldX, worldY]) => [
            transformX(worldX),
            transformY(worldY)
        ]);

        if (screenPoints.length > 2) {
            miniMapCtx.fillStyle = 'rgba(139, 69, 19, 0.8)'; // SaddleBrown
            miniMapCtx.beginPath();
            miniMapCtx.moveTo(screenPoints[0][0], screenPoints[0][1]);
            for (let i = 1; i < screenPoints.length; i++) {
                miniMapCtx.lineTo(screenPoints[i][0], screenPoints[i][1]);
            }
            miniMapCtx.closePath();
            miniMapCtx.fill();
        }
    });

    const transformX = (worldX) => (worldX - worldCenterX) * worldScale + mapSize / 2;
    const transformY = (worldY) => (worldY - worldCenterY) * worldScale + mapSize / 2;

    // Draw Islands
    islands.forEach(island => {
        const screenPoints = island.pointsWorld.map(([worldX, worldY]) => [
            transformX(worldX),
            transformY(worldY)
        ]);

        if (screenPoints.length > 2) {
            miniMapCtx.fillStyle = 'rgba(139, 69, 19, 0.8)'; // SaddleBrown
            miniMapCtx.beginPath();
            miniMapCtx.moveTo(screenPoints[0][0], screenPoints[0][1]);
            for (let i = 1; i < screenPoints.length; i++) {
                miniMapCtx.lineTo(screenPoints[i][0], screenPoints[i][1]);
            }
            miniMapCtx.closePath();
            miniMapCtx.fill();
        }
    });

    const playerX = transformX(player1Boat.worldX);
    const playerY = transformY(player1Boat.worldY);

    const playerRad = deg_to_rad(player1Boat.heading);
    miniMapCtx.save();
    miniMapCtx.translate(playerX, playerY);
    miniMapCtx.rotate(playerRad);
    miniMapCtx.fillStyle = 'white'; // High-contrast color for the player
    miniMapCtx.beginPath();
    miniMapCtx.moveTo(5, 0);
    miniMapCtx.lineTo(-5, -4);
    miniMapCtx.lineTo(-5, 4);
    miniMapCtx.closePath();
    miniMapCtx.fill();
    miniMapCtx.restore();

    aiBoats.forEach(aiBoat => {
        const aiX = transformX(aiBoat.worldX);
        const aiY = transformY(aiBoat.worldY);
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
        const buoyX = transformX(b.worldX);
        const buoyY = transformY(b.worldY);

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
    lastTime = performance.now();

    document.getElementById('start-button').addEventListener('click', () => {
        document.getElementById('start-screen').style.display = 'none';
        gameState = 'countdown';
        let count = 3;
        const countdownElement = document.getElementById('countdown');
        countdownElement.style.display = 'block';
        countdownElement.textContent = count;
        const countdownInterval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownElement.textContent = count;
            } else if (count === 0) {
                countdownElement.textContent = 'Sail!';
            } else {
                clearInterval(countdownInterval);
                countdownElement.style.display = 'none';
                gameState = 'racing';
                lastTime = performance.now();
                player1Boat.raceStartTime = lastTime;
                aiBoats.forEach(b => b.raceStartTime = lastTime);
            }
        }, 1000);
    });

    document.getElementById('restart-button').addEventListener('click', () => {
        document.getElementById('race-over-screen').style.display = 'none';
        setup();
    });

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

    requestAnimationFrame(gameLoop);
};