# entities.py

import pygame
import random
import math
from collections import deque
from enum import Enum, auto

from constants import *
from utils import *

class SailingStyle(Enum):
    PERFECTIONIST = auto()
    AGGRESSIVE = auto()
    CAUTIOUS = auto()
    ERRATIC = auto()

class WakeParticle:
    """Represents a single particle in the boat's wake."""
    def __init__(self, world_x, world_y):
        self.world_x = world_x
        self.world_y = world_y
        self.lifetime = WAKE_LIFETIME
        self.max_lifetime = WAKE_LIFETIME
    def update(self, dt):
        self.lifetime -= dt
        return self.lifetime > 0
    def draw(self, surface, offset_x, offset_y, view_center):
        if self.lifetime <= 0: return
        screen_x = int(self.world_x - offset_x + view_center[0])
        screen_y = int(self.world_y - offset_y + view_center[1])
        
        if not (0 < screen_x < surface.get_width() and 0 < screen_y < surface.get_height()): return

        life_ratio = max(0, self.lifetime / self.max_lifetime)
        current_size = int(lerp(WAKE_END_SIZE, WAKE_START_SIZE, life_ratio))
        current_alpha = int(lerp(0, 150, life_ratio))
        if current_size >= 1:
            try:
                pygame.draw.circle(surface, (*WAKE_COLOR[:3], current_alpha), (screen_x, screen_y), current_size)
            except (TypeError, ValueError):
                pygame.draw.circle(surface, WAKE_COLOR, (screen_x, screen_y), current_size)

class Boat:
    """Represents the player's sailing dinghy with improved physics."""
    def __init__(self, x, y, name="Player", boat_color=WHITE):
        self.screen_x = x
        self.screen_y = y
        self.world_x = 0.0
        self.world_y = 0.0
        self.prev_world_x = 0.0
        self.prev_world_y = 0.0
        self.heading = 90.0
        self.speed = 0.0
        self.rudder_angle = 0
        self.sail_angle_rel = 0.0
        self.visual_sail_angle_rel = 0.0
        self.wind_effectiveness = 0.0
        self.optimal_sail_trim = 0.0
        self.on_sandbar = False
        self.name = name
        self.score = 0
        self.color = boat_color
        # --- New, more detailed hull shape ---
        self.base_shape = [
            (25, 0), (20, -4), (5, -8), (-15, -8),
            (-20, -5), (-20, 5), (-15, 8), (5, 8), (20, 4)
        ]
        # --- Shape for the deck/cockpit ---
        self.deck_shape = [
            (18, 0), (15, -2.5), (5, -5), (-13, -5),
            (-17, -3), (-17, 3), (-13, 5), (5, 5), (15, 2.5)
        ]
        self.rotated_shape = self.base_shape[:]
        self.rotated_deck_shape = self.deck_shape[:]
        self.mast_pos_rel = (8, 0) # Moved mast slightly forward
        self.mast_pos_abs = (0, 0)
        self.sail_curve_points = []
        self.collision_radius = 18 # Slightly increased collision radius
        self.wake_particles = deque()
        self.time_since_last_wake = 0.0
        self.last_line_crossing_time = 0.0

        # Race progress attributes
        self.race_started = False
        self.is_finished = False
        self.current_lap = 1
        self.next_buoy_index = -1
        self.lap_start_time = 0.0
        self.race_start_time = 0.0
        self.finish_time = 0.0
        self.lap_times = []


    def reset_position(self):
        self.world_x = 0.0
        self.world_y = 0.0
        self.prev_world_x = 0.0
        self.prev_world_y = 0.0
        self.heading = 90.0
        self.speed = 0.0
        self.sail_angle_rel = 0.0
        self.visual_sail_angle_rel = 0.0
        self.wake_particles.clear()

    def trim_sail(self, direction):
        self.sail_angle_rel += direction * SAIL_TRIM_SPEED
        self.sail_angle_rel = max(-MAX_SAIL_ANGLE_REL, min(MAX_SAIL_ANGLE_REL, self.sail_angle_rel))

    def turn(self, direction):
        self.rudder_angle = direction

    def update(self, wind_speed, wind_direction, dt):
        self.prev_world_x = self.world_x
        self.prev_world_y = self.world_y

        # Rudder
        speed_turn_component = (1.0 - MIN_TURN_EFFECTIVENESS) * min(1.0, self.speed / (MAX_BOAT_SPEED * 0.7))
        total_turn_effectiveness = MIN_TURN_EFFECTIVENESS + speed_turn_component
        turn_amount = self.rudder_angle * BOAT_TURN_SPEED * total_turn_effectiveness * dt * 60
        self.heading = normalize_angle(self.heading + turn_amount)
        self.rudder_angle = 0

        # Visual Sail Angle
        wind_angle_rel_boat = angle_difference(wind_direction, self.heading)
        abs_wind_angle_rel_boat = abs(wind_angle_rel_boat)
        natural_sail_angle = angle_difference(180, wind_angle_rel_boat)
        natural_sail_angle = max(-MAX_SAIL_ANGLE_REL, min(MAX_SAIL_ANGLE_REL, natural_sail_angle))
        if natural_sail_angle < 0:
            self.visual_sail_angle_rel = max(natural_sail_angle, self.sail_angle_rel)
        else:
            self.visual_sail_angle_rel = min(natural_sail_angle, self.sail_angle_rel)

        # Force Calculation
        force_magnitude = 0
        self.wind_effectiveness = 0.0
        self.optimal_sail_trim = 0.0
        if abs_wind_angle_rel_boat > MIN_SAILING_ANGLE:
            optimal_trim = angle_difference(wind_angle_rel_boat + 180, 90)
            optimal_trim = max(-MAX_SAIL_ANGLE_REL, min(MAX_SAIL_ANGLE_REL, optimal_trim))
            self.optimal_sail_trim = optimal_trim
            trim_diff = angle_difference(self.sail_angle_rel, optimal_trim)
            trim_effectiveness = ((math.cos(deg_to_rad(trim_diff)) + 1) / 2.0)**2
            reach_angle_diff = abs(abs_wind_angle_rel_boat - 90)
            point_of_sail_effectiveness = max(0.1, math.cos(deg_to_rad(reach_angle_diff)))
            self.wind_effectiveness = max(0, trim_effectiveness * point_of_sail_effectiveness)
            base_accel = wind_speed * BOAT_ACCEL_FACTOR
            force_magnitude = max(0, base_accel * self.wind_effectiveness)

        # Force and Drag Application
        acceleration = force_magnitude
        self.speed += acceleration * dt
        drag_factor = (1.0 - BOAT_DRAG)
        if self.on_sandbar:
            drag_factor *= SANDBAR_DRAG_MULTIPLIER
        drag_force = (self.speed ** 1.8) * drag_factor
        self.speed -= drag_force * dt
        if force_magnitude < 0.01 and self.speed > 0:
            self.speed -= NO_POWER_DECEL * dt
        self.speed = max(0, min(self.speed, MAX_BOAT_SPEED))

        # Position Update
        move_rad = deg_to_rad(self.heading)
        distance_multiplier = 40
        dx = math.cos(move_rad) * self.speed * dt * distance_multiplier
        dy = math.sin(move_rad) * self.speed * dt * distance_multiplier
        self.world_x += dx
        self.world_y += dy

        # Visual Updates (will be called from main render loop)
        self.update_wake(dt)

    def draw(self, surface):
        self.rotate_and_position()

        # --- Enhanced Drawing ---
        # 1. Darker color for shading
        darker_color = (max(0, self.color[0] - 40), max(0, self.color[1] - 40), max(0, self.color[2] - 40))

        # 2. Draw main hull
        pygame.draw.polygon(surface, self.color, self.rotated_shape)
        pygame.draw.polygon(surface, BLACK, self.rotated_shape, 2) # Thicker border

        # 3. Draw deck/cockpit area
        pygame.draw.polygon(surface, darker_color, self.rotated_deck_shape)
        pygame.draw.polygon(surface, BLACK, self.rotated_deck_shape, 1)

        # 4. Draw Mast
        pygame.draw.circle(surface, BLACK, (int(self.mast_pos_abs[0]), int(self.mast_pos_abs[1])), 3)
        # --- End Enhanced Drawing ---

        self.update_sail_curve(self.visual_sail_angle_rel)
        if self.optimal_sail_trim != 0 or self.wind_effectiveness > 0:
            try:
                optimal_abs_angle_rad = deg_to_rad(normalize_angle(self.heading + self.optimal_sail_trim))
                mast_x, mast_y = self.mast_pos_abs
                end_x = mast_x + math.cos(optimal_abs_angle_rad) * OPTIMAL_INDICATOR_LENGTH
                end_y = mast_y + math.sin(optimal_abs_angle_rad) * OPTIMAL_INDICATOR_LENGTH
                pygame.draw.line(surface, OPTIMAL_SAIL_COLOR[:3], (int(mast_x), int(mast_y)), (int(end_x), int(end_y)), 1)
            except Exception:
                pass # Ignore drawing errors
        if len(self.sail_curve_points) >= 3:
            pygame.draw.polygon(surface, SAIL_COLOR, self.sail_curve_points)
            pygame.draw.lines(surface, GRAY, False, self.sail_curve_points, 1)

    def rotate_and_position(self):
        rad = deg_to_rad(self.heading)
        cos_a = math.cos(rad)
        sin_a = math.sin(rad)
        # Rotate hull
        for i, (x, y) in enumerate(self.base_shape):
            rx = x * cos_a - y * sin_a
            ry = x * sin_a + y * cos_a
            self.rotated_shape[i] = (rx + self.screen_x, ry + self.screen_y)
        # Rotate deck
        for i, (x, y) in enumerate(self.deck_shape):
            rx = x * cos_a - y * sin_a
            ry = x * sin_a + y * cos_a
            self.rotated_deck_shape[i] = (rx + self.screen_x, ry + self.screen_y)

        mast_rel_x, mast_rel_y = self.mast_pos_rel
        mast_rot_x = mast_rel_x * cos_a - mast_rel_y * sin_a
        mast_rot_y = mast_rel_x * sin_a + mast_rel_y * cos_a
        self.mast_pos_abs = (mast_rot_x + self.screen_x, mast_rot_y + self.screen_y)

    def update_sail_curve(self, visual_relative_angle):
        mast_x, mast_y = self.mast_pos_abs
        visual_sail_angle_abs = normalize_angle(self.heading + visual_relative_angle)
        sail_rad_abs = deg_to_rad(visual_sail_angle_abs)
        cos_s = math.cos(sail_rad_abs)
        sin_s = math.sin(sail_rad_abs)
        boom_end_x = mast_x + cos_s * SAIL_LENGTH
        boom_end_y = mast_y + sin_s * SAIL_LENGTH
        mid_x = (mast_x + boom_end_x) / 2
        mid_y = (mast_y + boom_end_y) / 2
        perp_dx = -sin_s
        perp_dy = cos_s
        offset_dist = math.sqrt(max(0, self.wind_effectiveness)) * SAIL_MAX_CURVE
        control_x = mid_x + perp_dx * offset_dist
        control_y = mid_y + perp_dy * offset_dist
        self.sail_curve_points = [(mast_x, mast_y), (control_x, control_y), (boom_end_x, boom_end_y)]

    def update_wake(self, dt):
        self.time_since_last_wake += dt
        if self.speed > 0.5 and self.time_since_last_wake >= WAKE_SPAWN_INTERVAL:
            if len(self.wake_particles) < MAX_WAKE_PARTICLES:
                stern_offset = -20
                rad = deg_to_rad(self.heading)
                spawn_dx = math.cos(rad) * stern_offset
                spawn_dy = math.sin(rad) * stern_offset
                rand_x = random.uniform(-3, 3)
                rand_y = random.uniform(-3, 3)
                particle_x = self.world_x + spawn_dx + rand_x
                particle_y = self.world_y + spawn_dy + rand_y
                self.wake_particles.append(WakeParticle(particle_x, particle_y))
                self.time_since_last_wake = 0.0

        particles_to_keep = deque()
        while self.wake_particles:
             particle = self.wake_particles.popleft()
             if particle.update(dt):
                 particles_to_keep.append(particle)
        self.wake_particles = particles_to_keep

    def draw_wake(self, surface, offset_x, offset_y, view_center):
         for particle in self.wake_particles:
             particle.draw(surface, offset_x, offset_y, view_center)

    def get_world_collision_rect(self):
         return pygame.Rect(self.world_x - self.collision_radius, self.world_y - self.collision_radius, self.collision_radius * 2, self.collision_radius * 2)

class Sandbar:
    """Represents a static sandbar obstacle. Visuals are handled by the terrain map."""
    def __init__(self, world_x, world_y, size):
        self.world_x = world_x
        self.world_y = world_y
        self.size = size
        self.color = SAND_COLOR
        self.border_color = DARK_SAND_COLOR
        self.points_rel = self._generate_random_points(size)
        self.points_world = [(x + world_x, y + world_y) for x, y in self.points_rel]
        self.rect = self._calculate_bounding_rect(self.points_world)

    def _generate_random_points(self, size):
        points = []
        num_vertices = random.randint(MIN_SANDBAR_VERTICES, MAX_SANDBAR_VERTICES)
        avg_radius = size / 2.0
        for i in range(num_vertices):
            angle = (i / num_vertices) * 2 * math.pi
            radius_variation = random.uniform(1.0 - SANDBAR_RADIUS_VARIATION, 1.0 + SANDBAR_RADIUS_VARIATION)
            radius = avg_radius * radius_variation
            angle += random.uniform(-0.5 / num_vertices, 0.5 / num_vertices) * 2 * math.pi
            x = radius * math.cos(angle)
            y = radius * math.sin(angle)
            points.append((x, y))
        return points

    def _calculate_bounding_rect(self, points_list):
        if not points_list:
            return pygame.Rect(self.world_x, self.world_y, 0, 0)
        min_x = min(p[0] for p in points_list)
        max_x = max(p[0] for p in points_list)
        min_y = min(p[1] for p in points_list)
        max_y = max(p[1] for p in points_list)
        return pygame.Rect(min_x, min_y, max_x - min_x, max_y - min_y)


class Buoy:
    """Represents a course marker buoy."""
    def __init__(self, world_x, world_y, index, is_gate=False):
        self.world_x = world_x
        self.world_y = world_y
        self.index = index
        self.radius = BUOY_RADIUS
        self.is_gate = is_gate
        self.color = START_FINISH_BUOY_COLOR if is_gate else BUOY_COLOR

    def draw(self, surface, offset_x, offset_y, is_next, view_center):
        screen_x = int(self.world_x - offset_x + view_center[0])
        screen_y = int(self.world_y - offset_y + view_center[1])
        if -self.radius < screen_x < surface.get_width() + self.radius and -self.radius < screen_y < surface.get_height() + self.radius:
            color_to_use = self.color
            if is_next and not self.is_gate:
                color_to_use = NEXT_BUOY_INDICATOR_COLOR
            pygame.draw.circle(surface, color_to_use, (screen_x, screen_y), self.radius)
            pygame.draw.circle(surface, BLACK, (screen_x, screen_y), self.radius, 1)

class AIBoat(Boat):
    """An AI-controlled boat that races against the player."""
    def __init__(self, world_x, world_y, name, sailing_style, color):
        super().__init__(0, 0, name=name, boat_color=color)
        self.world_x = world_x
        self.world_y = world_y
        self.style = sailing_style
        self.tack_decision_time = 0
        self.time_at_current_buoy = 0.0
        self.last_buoy_index = -1
        self.staging_point = None

        if self.style == SailingStyle.PERFECTIONIST:
            self.turn_rate_modifier = random.uniform(1.0, 1.1)
            self.sail_trim_error = random.uniform(-2, 2)
            self.heading_error = random.uniform(-1, 1)
            self.tack_anticipation = random.uniform(10, 15)
        elif self.style == SailingStyle.AGGRESSIVE:
            self.turn_rate_modifier = random.uniform(0.9, 1.15)
            self.sail_trim_error = random.uniform(-5, 5)
            self.heading_error = random.uniform(-3, 3)
            self.tack_anticipation = random.uniform(5, 10)
        elif self.style == SailingStyle.CAUTIOUS:
            self.turn_rate_modifier = random.uniform(0.85, 1.0)
            self.sail_trim_error = random.uniform(-8, 8)
            self.heading_error = random.uniform(-5, 5)
            self.tack_anticipation = random.uniform(12, 18)
        elif self.style == SailingStyle.ERRATIC:
            self.turn_rate_modifier = random.uniform(0.8, 1.2)
            self.sail_trim_error = random.uniform(-10, 10)
            self.heading_error = random.uniform(-7, 7)
            self.tack_anticipation = random.uniform(5, 15)
        else:
            self.turn_rate_modifier = 1.0
            self.sail_trim_error = 0
            self.heading_error = 0
            self.tack_anticipation = 0

    def ai_update(self, wind_speed, wind_direction, course_buoys, start_finish_line, dt, pre_race_timer):
        """The brain of the AI boat. Sets rudder and sail intentions."""
        if self.is_finished:
            self.speed *= 0.98
            return
            
        # --- IMPROVED "IN IRONS" RECOVERY ---
        # If stuck in irons (low speed, head to wind), attempt a recovery maneuver.
        is_in_irons = self.speed < 1.5 and self.wind_effectiveness < 0.1 and abs(angle_difference(wind_direction, self.heading)) < MIN_SAILING_ANGLE + 5
        if is_in_irons:
            # Force the sail out to catch any bit of wind to help turn the boat
            self.sail_angle_rel = MAX_SAIL_ANGLE_REL
            # Turn hard to one side to get out of the no-go zone
            wind_angle_rel_boat = angle_difference(wind_direction, self.heading)
            if wind_angle_rel_boat > 0:
                self.turn(-1.5) 
            else:
                self.turn(1.5)
            # Unlike before, we DON'T return here. We allow the AI to continue
            # its logic to pick a proper tacking angle away from the wind.

        # Pre-race starting strategy
        if pre_race_timer > 0:
            if self.staging_point is None:
                self.staging_point = (self.world_x - 100, self.world_y + random.uniform(-50, 50))

            if pre_race_timer > 5:
                target = self.staging_point
            else:
                 target = ((start_finish_line[0][0] + start_finish_line[1][0]) / 2,
                           (start_finish_line[0][1] + start_finish_line[1][1]) / 2)
        else: # Normal race logic
            if self.next_buoy_index != self.last_buoy_index:
                self.time_at_current_buoy = 0.0
                self.last_buoy_index = self.next_buoy_index
            else:
                self.time_at_current_buoy += dt
            
            # Last-resort unstuck mechanism if circling a buoy
            if self.time_at_current_buoy > 15.0:
                wind_angle_rel_boat = angle_difference(wind_direction, self.heading)
                if wind_angle_rel_boat > 0: self.turn(-1.5)
                else: self.turn(1.5)
                self.time_at_current_buoy = 0
                return 

            dist_from_center_sq = self.world_x**2 + self.world_y**2
            if dist_from_center_sq > (WORLD_BOUNDS * 1.5)**2:
                target = (0, 0)
            else:
                target = self.get_current_target(course_buoys, start_finish_line)

        if not target:
            return

        perceived_wind_direction = normalize_angle(wind_direction + random.uniform(-5, 5))
        desired_heading = self.calculate_desired_heading(target, perceived_wind_direction)
        desired_heading = normalize_angle(desired_heading + self.heading_error)

        heading_diff = angle_difference(desired_heading, self.heading)
        turn_direction = 0
        if abs(heading_diff) > 3.0:
            turn_direction = 1 if heading_diff > 0 else -1
        self.turn(turn_direction * self.turn_rate_modifier)

        self.ai_trim_sails(perceived_wind_direction, dt)


    def get_current_target(self, course_buoys, start_finish_line):
        """Determines the AI's current navigation target."""
        base_target = None
        if not self.race_started:
            line_center_x = (start_finish_line[0][0] + start_finish_line[1][0]) / 2
            line_center_y = (start_finish_line[0][1] + start_finish_line[1][1]) / 2
            base_target = (line_center_x + 60, line_center_y + random.uniform(-20, 20))
        elif self.next_buoy_index < len(course_buoys):
            base_target = course_buoys[self.next_buoy_index]
        else:
            base_target = ((start_finish_line[0][0] + start_finish_line[1][0]) / 2,
                           (start_finish_line[0][1] + start_finish_line[1][1]) / 2)

        offset_factor = 1.0
        if self.style == SailingStyle.CAUTIOUS: offset_factor = 1.5
        elif self.style == SailingStyle.ERRATIC: offset_factor = 2.0
        offset_x = random.uniform(-10 * offset_factor, 10 * offset_factor)
        offset_y = random.uniform(-10 * offset_factor, 10 * offset_factor)
        return (base_target[0] + offset_x, base_target[1] + offset_y)

    def calculate_desired_heading(self, target_pos, wind_direction):
        target_dx = target_pos[0] - self.world_x
        target_dy = target_pos[1] - self.world_y
        direct_heading_to_target = normalize_angle(rad_to_deg(math.atan2(target_dy, target_dx)))
        wind_angle_diff = abs(angle_difference(direct_heading_to_target, wind_direction))

        if wind_angle_diff < MIN_SAILING_ANGLE + self.tack_anticipation:
            tack_angle = MIN_SAILING_ANGLE + random.uniform(5, 20)
            port_tack_heading = normalize_angle(wind_direction + tack_angle)
            starboard_tack_heading = normalize_angle(wind_direction - tack_angle)
            port_diff = abs(angle_difference(port_tack_heading, direct_heading_to_target))
            starboard_diff = abs(angle_difference(starboard_tack_heading, direct_heading_to_target))
            return normalize_angle((port_tack_heading if port_diff < starboard_diff else starboard_tack_heading) + random.uniform(-3, 3))
        else:
            overshoot = 0
            if self.style == SailingStyle.AGGRESSIVE: overshoot = random.uniform(-2, 5)
            elif self.style == SailingStyle.ERRATIC: overshoot = random.uniform(-10, 10)
            return normalize_angle(direct_heading_to_target + overshoot)

    def ai_trim_sails(self, wind_direction, dt):
        wind_angle_rel_boat = angle_difference(wind_direction, self.heading)
        optimal_trim = angle_difference(wind_angle_rel_boat + 180, 90)
        optimal_trim = max(-MAX_SAIL_ANGLE_REL, min(MAX_SAIL_ANGLE_REL, optimal_trim))
        target_trim = optimal_trim + self.sail_trim_error

        trim_speed_factor = 0.1 if self.style == SailingStyle.CAUTIOUS else 0.3
        diff = angle_difference(target_trim, self.sail_angle_rel)
        if abs(diff) > 2:
            trim_direction = 1 if diff > 0 else -1
            self.sail_angle_rel += trim_direction * trim_speed_factor * SAIL_TRIM_SPEED * 60 * dt
            self.sail_angle_rel = max(-MAX_SAIL_ANGLE_REL, min(MAX_SAIL_ANGLE_REL, self.sail_angle_rel))