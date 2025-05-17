import pygame
import random
import math
import time
from collections import deque # For efficient wake particle handling
from enum import Enum, auto # For game states

# --- Constants ---
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
CENTER_X = SCREEN_WIDTH // 2
CENTER_Y = SCREEN_HEIGHT // 2

# Colors
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
BLUE = (0, 105, 148) # Ocean blue
DARK_BLUE = (0, 50, 100) # Deeper blue for effect
LIGHT_BLUE = (100, 150, 200) # Lighter blue for wave crests
SAND_COLOR = (230, 210, 170) # Light sand
DARK_SAND_COLOR = (190, 170, 130) # Darker sand for border/map
RED = (255, 0, 0)
YELLOW = (255, 255, 0)
GRAY = (150, 150, 150)
OPTIMAL_SAIL_COLOR = (0, 200, 255, 150) # Cyanish, semi-transparent for optimal angle indicator
SAIL_COLOR = (230, 230, 230) # Off-white for sail
WAKE_COLOR = (200, 220, 255) # Color for wake particles
MAP_BG_COLOR = (50, 50, 50, 180) # Semi-transparent dark gray for map background
MAP_BORDER_COLOR = (200, 200, 200)
MAP_BOAT_COLOR = RED
BUTTON_COLOR = (100, 100, 100)
BUTTON_HOVER_COLOR = (150, 150, 150)
BUTTON_TEXT_COLOR = WHITE
BUOY_COLOR = (255, 100, 0) # Orange for buoys
START_FINISH_BUOY_COLOR = (200, 200, 0) # Yellowish for start/finish buoys
START_FINISH_LINE_COLOR = WHITE
NEXT_BUOY_INDICATOR_COLOR = (0, 255, 0) # Green indicator

# Boat properties
BOAT_TURN_SPEED = 2.5
BOAT_ACCEL_FACTOR = 0.35
BOAT_DRAG = 0.990
SANDBAR_DRAG_MULTIPLIER = 25.0
NO_POWER_DECEL = 0.75
MAX_BOAT_SPEED = 5.5
MIN_TURN_EFFECTIVENESS = 0.15
SAIL_TRIM_SPEED = 1.0
MAX_SAIL_ANGLE_REL = 85
SAIL_LENGTH = 35
SAIL_MAX_CURVE = 8
MIN_SAILING_ANGLE = 45
OPTIMAL_INDICATOR_LENGTH = 25

# Wind properties
MIN_WIND_SPEED = 1.0
MAX_WIND_SPEED = 4.0
WIND_SPEED_CHANGE_RATE = 0.02
WIND_DIR_CHANGE_RATE = 0.6
WIND_UPDATE_INTERVAL = 1000

# Water animation (Scrolling Layers)
NUM_WAVE_LAYERS = 3
WAVE_LAYER_ALPHA = 100 # Increased Alpha for visibility
WAVE_LINE_THICKNESS = 2 # Increased thickness
WAVE_SCROLL_SPEED_BASE = [0.4, 0.6, 0.8]
WAVE_DENSITY = 50

# Sandbar properties
NUM_SANDBARS = 15 # Increased number
MIN_SANDBAR_SIZE = 60
MAX_SANDBAR_SIZE = 200
MIN_SANDBAR_VERTICES = 7
MAX_SANDBAR_VERTICES = 12
SANDBAR_RADIUS_VARIATION = 0.4
WORLD_BOUNDS = 2000
MIN_OBJ_SEPARATION = 150

# Wake properties
MAX_WAKE_PARTICLES = 100
WAKE_SPAWN_INTERVAL = 0.05
WAKE_LIFETIME = 1.5
WAKE_START_SIZE = 4
WAKE_END_SIZE = 1

# Map properties
MAP_WIDTH = 150
MAP_HEIGHT = 150
MAP_MARGIN = 10
MAP_RECT = pygame.Rect(SCREEN_WIDTH - MAP_WIDTH - MAP_MARGIN, MAP_MARGIN, MAP_WIDTH, MAP_HEIGHT)
MAP_WORLD_SCALE_X = MAP_WIDTH / (2 * WORLD_BOUNDS)
MAP_WORLD_SCALE_Y = MAP_HEIGHT / (2 * WORLD_BOUNDS)
MAP_SANDBAR_MARKER_RADIUS = 3
MAP_BUOY_MARKER_RADIUS = 4
MAP_BOAT_MARKER_SIZE = 5

# Button Properties
WIND_BUTTON_WIDTH = 120
WIND_BUTTON_HEIGHT = 30
WIND_BUTTON_MARGIN = 10
WIND_BUTTON_RECT = pygame.Rect(WIND_BUTTON_MARGIN, 70, WIND_BUTTON_WIDTH, WIND_BUTTON_HEIGHT)
SETUP_BUTTON_WIDTH = 150
SETUP_BUTTON_HEIGHT = 40
LAP_BUTTON_SIZE = 30

# --- Course Properties ---
DEFAULT_RACE_LAPS = 3
NUM_COURSE_BUOYS = 3
START_FINISH_LINE = [(-100, -150), (-100, 150)]
START_FINISH_NORMAL = (1, 0)
START_FINISH_WIDTH = 10
BUOY_RADIUS = 15
BUOY_ROUNDING_RADIUS = 40
LINE_CROSSING_DEBOUNCE = 1.0

# --- Game States ---
class GameState(Enum):
    SETUP = auto()
    RACING = auto()
    FINISHED = auto()

# Debug Flag
DEBUG_SAIL_ANGLES = False

# --- Helper Functions ---
def deg_to_rad(degrees): return degrees * math.pi / 180.0
def rad_to_deg(radians): return radians * 180.0 / math.pi
def angle_difference(angle1, angle2): return (angle1 - angle2 + 180) % 360 - 180
def normalize_angle(degrees): return degrees % 360
def lerp(a, b, t): return a + (b - a) * t
def distance_sq(p1, p2): return (p1[0] - p2[0])**2 + (p1[1] - p2[1])**2

def check_line_crossing(p1, p2, line_p1, line_p2):
    """
    Checks if the line segment p1-p2 crosses the line segment defined by
    line_p1 and line_p2. Returns True if crossing occurred ON the segment.
    Uses vector cross products.
    """
    # Check bounding boxes first for quick rejection
    if (max(p1[0], p2[0]) < min(line_p1[0], line_p2[0]) or
        min(p1[0], p2[0]) > max(line_p1[0], line_p2[0]) or
        max(p1[1], p2[1]) < min(line_p1[1], line_p2[1]) or
        min(p1[1], p2[1]) > max(line_p1[1], line_p2[1])):
        return False

    # Check orientation using cross product
    # o1 = orientation(line_p1, line_p2, p1)
    # o2 = orientation(line_p1, line_p2, p2)
    # o3 = orientation(p1, p2, line_p1)
    # o4 = orientation(p1, p2, line_p2)
    def orientation(p, q, r):
        val = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1])
        if abs(val) < 1e-6: return 0 # Collinear
        return 1 if val > 0 else 2 # Clockwise or Counterclockwise

    o1 = orientation(line_p1, line_p2, p1)
    o2 = orientation(line_p1, line_p2, p2)
    o3 = orientation(p1, p2, line_p1)
    o4 = orientation(p1, p2, line_p2)

    # General case: segments cross if orientations differ
    if o1 != o2 and o3 != o4:
        return True

    # Special Cases (Collinear points - check if points lie on segment)
    # Not handling collinear cases perfectly here for simplicity,
    # assumes general intersection is sufficient for start/finish line.
    # A more robust implementation would check collinear overlaps.

    return False


# --- Game Classes ---

class WakeParticle:
    """Represents a single particle in the boat's wake."""
    def __init__(self, world_x, world_y):
        self.world_x = world_x; self.world_y = world_y
        self.lifetime = WAKE_LIFETIME; self.max_lifetime = WAKE_LIFETIME
    def update(self, dt): self.lifetime -= dt; return self.lifetime > 0
    def draw(self, surface, offset_x, offset_y):
        if self.lifetime <= 0: return
        screen_x = int(self.world_x - offset_x + CENTER_X); screen_y = int(self.world_y - offset_y + CENTER_Y)
        if not (0 < screen_x < SCREEN_WIDTH and 0 < screen_y < SCREEN_HEIGHT): return
        life_ratio = max(0, self.lifetime / self.max_lifetime)
        current_size = int(lerp(WAKE_END_SIZE, WAKE_START_SIZE, life_ratio))
        current_alpha = int(lerp(0, 150, life_ratio))
        if current_size >= 1:
            try: pygame.draw.circle(surface, (*WAKE_COLOR[:3], current_alpha), (screen_x, screen_y), current_size)
            except (TypeError, ValueError): pygame.draw.circle(surface, WAKE_COLOR, (screen_x, screen_y), current_size)


class Boat:
    """Represents the player's sailing dinghy with improved physics."""
    def __init__(self, x, y):
        self.screen_x = x; self.screen_y = y
        self.world_x = 0.0; self.world_y = 0.0
        self.prev_world_x = 0.0; self.prev_world_y = 0.0
        self.heading = 90.0; self.speed = 0.0; self.rudder_angle = 0
        self.sail_angle_rel = 0.0; self.visual_sail_angle_rel = 0.0
        self.wind_effectiveness = 0.0; self.optimal_sail_trim = 0.0
        self.on_sandbar = False; self.color = WHITE
        self.base_shape = [(20, 0), (-10, -7), (-15, 0), (-10, 7)]
        self.rotated_shape = self.base_shape[:]
        self.mast_pos_rel = (5, 0); self.mast_pos_abs = (0, 0)
        self.sail_curve_points = []; self.collision_radius = 15
        self.wake_particles = deque(); self.time_since_last_wake = 0.0

    def reset_position(self):
        self.world_x = 0.0; self.world_y = 0.0; self.prev_world_x = 0.0; self.prev_world_y = 0.0
        self.heading = 90.0; self.speed = 0.0; self.sail_angle_rel = 0.0; self.visual_sail_angle_rel = 0.0
        self.wake_particles.clear()

    def trim_sail(self, direction):
        self.sail_angle_rel += direction * SAIL_TRIM_SPEED
        self.sail_angle_rel = max(-MAX_SAIL_ANGLE_REL, min(MAX_SAIL_ANGLE_REL, self.sail_angle_rel))

    def turn(self, direction): self.rudder_angle = direction

    def update(self, wind_speed, wind_direction, dt):
        self.prev_world_x = self.world_x; self.prev_world_y = self.world_y

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
        if natural_sail_angle < 0: self.visual_sail_angle_rel = max(natural_sail_angle, self.sail_angle_rel)
        else: self.visual_sail_angle_rel = min(natural_sail_angle, self.sail_angle_rel)

        # Force Calculation
        force_magnitude = 0; self.wind_effectiveness = 0.0; self.optimal_sail_trim = 0.0
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
        acceleration = force_magnitude; self.speed += acceleration * dt
        drag_factor = (1.0 - BOAT_DRAG)
        if self.on_sandbar: drag_factor *= SANDBAR_DRAG_MULTIPLIER
        drag_force = (self.speed ** 1.8) * drag_factor; self.speed -= drag_force * dt
        if force_magnitude < 0.01 and self.speed > 0: self.speed -= NO_POWER_DECEL * dt
        self.speed = max(0, min(self.speed, MAX_BOAT_SPEED))

        # Position Update
        move_rad = deg_to_rad(self.heading); distance_multiplier = 40
        dx = math.cos(move_rad) * self.speed * dt * distance_multiplier
        dy = math.sin(move_rad) * self.speed * dt * distance_multiplier
        self.world_x += dx; self.world_y += dy

        # Visual Updates
        self.rotate_and_position(); self.update_sail_curve(self.visual_sail_angle_rel); self.update_wake(dt)

    def rotate_and_position(self):
        rad = deg_to_rad(self.heading); cos_a = math.cos(rad); sin_a = math.sin(rad)
        for i, (x, y) in enumerate(self.base_shape):
            rx = x * cos_a - y * sin_a; ry = x * sin_a + y * cos_a
            self.rotated_shape[i] = (rx + self.screen_x, ry + self.screen_y)
        mast_rel_x, mast_rel_y = self.mast_pos_rel
        mast_rot_x = mast_rel_x * cos_a - mast_rel_y * sin_a; mast_rot_y = mast_rel_x * sin_a + mast_rel_y * cos_a
        self.mast_pos_abs = (mast_rot_x + self.screen_x, mast_rot_y + self.screen_y)

    def update_sail_curve(self, visual_relative_angle):
        mast_x, mast_y = self.mast_pos_abs
        visual_sail_angle_abs = normalize_angle(self.heading + visual_relative_angle)
        sail_rad_abs = deg_to_rad(visual_sail_angle_abs)
        cos_s = math.cos(sail_rad_abs); sin_s = math.sin(sail_rad_abs)
        boom_end_x = mast_x + cos_s * SAIL_LENGTH; boom_end_y = mast_y + sin_s * SAIL_LENGTH
        mid_x = (mast_x + boom_end_x) / 2; mid_y = (mast_y + boom_end_y) / 2
        perp_dx = -sin_s; perp_dy = cos_s
        offset_dist = math.sqrt(max(0, self.wind_effectiveness)) * SAIL_MAX_CURVE
        control_x = mid_x + perp_dx * offset_dist; control_y = mid_y + perp_dy * offset_dist
        self.sail_curve_points = [(mast_x, mast_y), (control_x, control_y), (boom_end_x, boom_end_y)]

    def update_wake(self, dt):
        self.time_since_last_wake += dt
        if self.speed > 0.5 and self.time_since_last_wake >= WAKE_SPAWN_INTERVAL:
            if len(self.wake_particles) < MAX_WAKE_PARTICLES:
                stern_offset = -20; rad = deg_to_rad(self.heading)
                spawn_dx = math.cos(rad) * stern_offset; spawn_dy = math.sin(rad) * stern_offset
                rand_x = random.uniform(-3, 3); rand_y = random.uniform(-3, 3)
                particle_x = self.world_x + spawn_dx + rand_x; particle_y = self.world_y + spawn_dy + rand_y
                self.wake_particles.append(WakeParticle(particle_x, particle_y))
                self.time_since_last_wake = 0.0
        particles_to_keep = deque()
        while self.wake_particles:
             particle = self.wake_particles.popleft()
             if particle.update(dt): particles_to_keep.append(particle)
        self.wake_particles = particles_to_keep

    def draw(self, surface):
        pygame.draw.polygon(surface, self.color, self.rotated_shape)
        pygame.draw.lines(surface, BLACK, True, self.rotated_shape, 1)
        if self.optimal_sail_trim != 0 or self.wind_effectiveness > 0 :
            try:
                optimal_abs_angle_rad = deg_to_rad(normalize_angle(self.heading + self.optimal_sail_trim))
                mast_x, mast_y = self.mast_pos_abs
                end_x = mast_x + math.cos(optimal_abs_angle_rad) * OPTIMAL_INDICATOR_LENGTH
                end_y = mast_y + math.sin(optimal_abs_angle_rad) * OPTIMAL_INDICATOR_LENGTH
                pygame.draw.line(surface, OPTIMAL_SAIL_COLOR[:3], (int(mast_x), int(mast_y)), (int(end_x), int(end_y)), 1)
            except Exception as e: pass # Ignore drawing errors
        if len(self.sail_curve_points) >= 3:
            pygame.draw.polygon(surface, SAIL_COLOR, self.sail_curve_points)
            pygame.draw.lines(surface, GRAY, False, self.sail_curve_points, 1)

    def draw_wake(self, surface, offset_x, offset_y):
         for particle in self.wake_particles: particle.draw(surface, offset_x, offset_y)

    def get_world_collision_rect(self):
         return pygame.Rect(self.world_x - self.collision_radius, self.world_y - self.collision_radius, self.collision_radius * 2, self.collision_radius * 2)


class Sandbar:
    """Represents a static sandbar obstacle with a random polygon shape."""
    def __init__(self, world_x, world_y, size):
        self.world_x = world_x; self.world_y = world_y; self.size = size
        self.color = SAND_COLOR; self.border_color = DARK_SAND_COLOR
        self.points_rel = self._generate_random_points(size)
        self.points_world = [(x + world_x, y + world_y) for x, y in self.points_rel]
        self.rect = self._calculate_bounding_rect(self.points_world)

    def _generate_random_points(self, size):
        points = []; num_vertices = random.randint(MIN_SANDBAR_VERTICES, MAX_SANDBAR_VERTICES)
        avg_radius = size / 2.0
        for i in range(num_vertices):
            angle = (i / num_vertices) * 2 * math.pi
            radius_variation = random.uniform(1.0 - SANDBAR_RADIUS_VARIATION, 1.0 + SANDBAR_RADIUS_VARIATION)
            radius = avg_radius * radius_variation
            angle += random.uniform(-0.5 / num_vertices, 0.5 / num_vertices) * 2 * math.pi
            x = radius * math.cos(angle); y = radius * math.sin(angle)
            points.append((x, y))
        return points

    def _calculate_bounding_rect(self, points_list):
        if not points_list: return pygame.Rect(self.world_x, self.world_y, 0, 0)
        min_x = min(p[0] for p in points_list); max_x = max(p[0] for p in points_list)
        min_y = min(p[1] for p in points_list); max_y = max(p[1] for p in points_list)
        return pygame.Rect(min_x, min_y, max_x - min_x, max_y - min_y)

    def draw(self, surface, offset_x, offset_y):
        screen_points = [(int(px - offset_x + CENTER_X), int(py - offset_y + CENTER_Y)) for px, py in self.points_world]
        screen_rect = self.rect.move(-offset_x + CENTER_X, -offset_y + CENTER_Y)
        if screen_rect.colliderect(surface.get_rect()):
            if len(screen_points) > 2:
                pygame.draw.polygon(surface, self.color, screen_points)
                pygame.draw.polygon(surface, self.border_color, screen_points, 2)

class Buoy:
    """Represents a course marker buoy."""
    def __init__(self, world_x, world_y, index, is_gate=False):
        self.world_x = world_x; self.world_y = world_y
        self.index = index; self.radius = BUOY_RADIUS; self.is_gate = is_gate
        self.color = START_FINISH_BUOY_COLOR if is_gate else BUOY_COLOR

    def draw(self, surface, offset_x, offset_y, is_next):
        screen_x = int(self.world_x - offset_x + CENTER_X)
        screen_y = int(self.world_y - offset_y + CENTER_Y)
        if -self.radius < screen_x < SCREEN_WIDTH + self.radius and -self.radius < screen_y < SCREEN_HEIGHT + self.radius:
            # Color logic: Use base color (gate or regular). If it's the next course buoy (and not a gate), use highlight color.
            color_to_use = self.color
            if is_next and not self.is_gate:
                color_to_use = NEXT_BUOY_INDICATOR_COLOR
            pygame.draw.circle(surface, color_to_use, (screen_x, screen_y), self.radius)
            pygame.draw.circle(surface, BLACK, (screen_x, screen_y), self.radius, 1)


# --- Water Animation Functions ---
def create_wave_layer(width, height, density):
    layer = pygame.Surface((width, height), pygame.SRCALPHA); layer.fill((0,0,0,0))
    for _ in range(density):
        x = random.randint(0, width); y = random.randint(0, height)
        length = random.randint(5, 15); angle = random.uniform(0, 360)
        end_x = x + math.cos(deg_to_rad(angle)) * length; end_y = y + math.sin(deg_to_rad(angle)) * length
        # Use increased alpha and thickness
        pygame.draw.line(layer, (*LIGHT_BLUE, WAVE_LAYER_ALPHA), (x, y), (end_x, end_y), WAVE_LINE_THICKNESS)
    return layer

def draw_scrolling_water(surface, layers, offsets, wind_direction_rad, dt):
    base_speed_factor = 50.0; wind_influence = 0.3
    wind_dx = math.cos(wind_direction_rad); wind_dy = math.sin(wind_direction_rad)
    for i, layer in enumerate(layers):
        base_dx, base_dy = (1, 1)
        scroll_dx = lerp(base_dx, wind_dx, wind_influence); scroll_dy = lerp(base_dy, wind_dy, wind_influence)
        norm = math.sqrt(scroll_dx**2 + scroll_dy**2)
        if norm > 0: scroll_dx /= norm; scroll_dy /= norm
        speed = WAVE_SCROLL_SPEED_BASE[i] * base_speed_factor
        offsets[i][0] += scroll_dx * speed * dt; offsets[i][1] += scroll_dy * speed * dt
        w = layer.get_width(); h = layer.get_height()
        offsets[i][0] %= w; offsets[i][1] %= h
        x_offset, y_offset = offsets[i]
        start_x = -x_offset; start_y = -y_offset
        for row in range(int(start_y / h) -1 , int((surface.get_height() - start_y) / h) + 1):
             for col in range(int(start_x / w) -1, int((surface.get_width() - start_x) / w) + 1):
                 surface.blit(layer, (start_x + col * w, start_y + row * h))


# --- Map Drawing Function ---
def draw_map(surface, boat, sandbars, buoys, next_buoy_index, start_finish_line, map_rect, world_bounds):
    """Draws the minimap including the course."""
    map_surface = pygame.Surface(map_rect.size, pygame.SRCALPHA); map_surface.fill(MAP_BG_COLOR)
    surface.blit(map_surface, map_rect.topleft)
    pygame.draw.rect(surface, MAP_BORDER_COLOR, map_rect, 1)

    # Start/Finish Line
    sf_p1_map = (map_rect.centerx + start_finish_line[0][0] * MAP_WORLD_SCALE_X, map_rect.centery + start_finish_line[0][1] * MAP_WORLD_SCALE_Y)
    sf_p2_map = (map_rect.centerx + start_finish_line[1][0] * MAP_WORLD_SCALE_X, map_rect.centery + start_finish_line[1][1] * MAP_WORLD_SCALE_Y)
    pygame.draw.line(surface, START_FINISH_LINE_COLOR, sf_p1_map, sf_p2_map, 1)

    # Buoys (including start/finish gate buoys)
    for i, buoy in enumerate(buoys):
        map_x = map_rect.centerx + buoy.world_x * MAP_WORLD_SCALE_X
        map_y = map_rect.centery + buoy.world_y * MAP_WORLD_SCALE_Y
        # Determine color based on whether it's the next course buoy
        # next_buoy_index passed in refers to the index in the main buoys list for highlighting
        is_next = (i == next_buoy_index)
        # Use buoy's base color (gate or regular), override if it's the next *course* buoy
        color_to_use = buoy.color
        if is_next and not buoy.is_gate:
            color_to_use = NEXT_BUOY_INDICATOR_COLOR

        if map_rect.collidepoint(map_x, map_y):
            pygame.draw.circle(surface, color_to_use, (int(map_x), int(map_y)), MAP_BUOY_MARKER_RADIUS) # Use updated radius
            # Outline only course buoys (non-gate ones)
            if not buoy.is_gate:
                 pygame.draw.circle(surface, BLACK, (int(map_x), int(map_y)), MAP_BUOY_MARKER_RADIUS, 1)

    # Sandbars
    for sandbar in sandbars:
        map_x = map_rect.centerx + sandbar.world_x * MAP_WORLD_SCALE_X
        map_y = map_rect.centery + sandbar.world_y * MAP_WORLD_SCALE_Y
        map_radius = (sandbar.size / 2.0) * MAP_WORLD_SCALE_X
        if map_rect.collidepoint(map_x, map_y):
             pygame.draw.circle(surface, DARK_SAND_COLOR, (int(map_x), int(map_y)), max(1, int(map_radius)))

    # Boat
    boat_map_x = map_rect.centerx + boat.world_x * MAP_WORLD_SCALE_X
    boat_map_y = map_rect.centery + boat.world_y * MAP_WORLD_SCALE_Y
    if map_rect.collidepoint(boat_map_x, boat_map_y):
        boat_angle_rad = deg_to_rad(boat.heading)
        p1 = (boat_map_x + math.cos(boat_angle_rad) * MAP_BOAT_MARKER_SIZE, boat_map_y + math.sin(boat_angle_rad) * MAP_BOAT_MARKER_SIZE)
        p2 = (boat_map_x + math.cos(boat_angle_rad + 2.356) * MAP_BOAT_MARKER_SIZE * 0.6, boat_map_y + math.sin(boat_angle_rad + 2.356) * MAP_BOAT_MARKER_SIZE * 0.6)
        p3 = (boat_map_x + math.cos(boat_angle_rad - 2.356) * MAP_BOAT_MARKER_SIZE * 0.6, boat_map_y + math.sin(boat_angle_rad - 2.356) * MAP_BOAT_MARKER_SIZE * 0.6)
        try: pygame.draw.polygon(surface, MAP_BOAT_COLOR, [(int(p1[0]), int(p1[1])), (int(p2[0]), int(p2[1])), (int(p3[0]), int(p3[1]))])
        except ValueError: pygame.draw.circle(surface, MAP_BOAT_COLOR, (int(boat_map_x), int(boat_map_y)), 2)


# --- Button Drawing Function ---
def draw_button(surface, rect, text, font, button_color, text_color, hover_color):
    """Draws a simple button and returns True if hovered."""
    mouse_pos = pygame.mouse.get_pos()
    hovered = rect.collidepoint(mouse_pos)
    color = hover_color if hovered else button_color
    pygame.draw.rect(surface, color, rect, border_radius=5)
    text_surf = font.render(text, True, text_color)
    text_rect = text_surf.get_rect(center=rect.center)
    surface.blit(text_surf, text_rect)
    return hovered

# --- Time Formatting Function ---
def format_time(seconds):
    """Formats seconds into MM:SS.ss"""
    if seconds < 0: return "00:00.00"
    mins = int(seconds // 60); secs = int(seconds % 60); hunds = int((seconds * 100) % 100)
    return f"{mins:02}:{secs:02}.{hunds:02}"

# --- Course Generation Functions ---
def is_too_close(new_pos, existing_objects, min_dist_sq):
    """Checks if new_pos is too close to any existing object position."""
    for obj in existing_objects:
        obj_pos = (getattr(obj, 'world_x', 0), getattr(obj, 'world_y', 0))
        if distance_sq(new_pos, obj_pos) < min_dist_sq:
            return True
    return False

def generate_random_sandbars(count, existing_objects, start_finish_line, course_buoys_coords):
    """Generates a list of Sandbar objects with random positions."""
    sandbars = []
    min_dist_sq = MIN_OBJ_SEPARATION**2
    attempts = 0; max_attempts = count * 20
    while len(sandbars) < count and attempts < max_attempts:
        attempts += 1; size = random.randint(MIN_SANDBAR_SIZE, MAX_SANDBAR_SIZE)
        wx = random.uniform(-WORLD_BOUNDS * 0.85, WORLD_BOUNDS * 0.85)
        wy = random.uniform(-WORLD_BOUNDS * 0.85, WORLD_BOUNDS * 0.85)
        pos = (wx, wy)
        line_x = start_finish_line[0][0]; line_y1 = start_finish_line[0][1]; line_y2 = start_finish_line[1][1]
        if abs(wx - line_x) < (size/2 + 50) and min(line_y1, line_y2) - size/2 < wy < max(line_y1, line_y2) + size/2: continue
        too_close_to_buoy = False
        for bx, by in course_buoys_coords:
            if distance_sq(pos, (bx, by)) < (size/2 + BUOY_RADIUS + MIN_OBJ_SEPARATION)**2: too_close_to_buoy = True; break
        if too_close_to_buoy: continue
        if is_too_close(pos, sandbars, (size/2 + MIN_SANDBAR_SIZE/2)**2): continue
        sandbars.append(Sandbar(wx, wy, size))
    if attempts >= max_attempts: print(f"Warning: Could only generate {len(sandbars)}/{count} sandbars.")
    return sandbars

def generate_random_buoys(count, existing_objects, start_finish_line):
    """Generates a list of Buoy coordinates, avoiding existing objects."""
    buoy_coords = []; min_dist_sq = (MIN_OBJ_SEPARATION * 1.5)**2
    attempts = 0; max_attempts = count * 30
    areas = [ (0.25, 0.75, -0.75, -0.25), (-0.75, -0.25, -0.75, -0.25), (-0.5, 0.5, 0.25, 0.75) ]
    if count > 3: areas.extend([ (-0.75, -0.25, 0.25, 0.75), (0.25, 0.75, 0.25, 0.75) ])
    random.shuffle(areas); area_index = 0
    while len(buoy_coords) < count and attempts < max_attempts:
        attempts += 1
        if area_index >= len(areas): break
        min_x_factor, max_x_factor, min_y_factor, max_y_factor = areas[area_index]
        wx = random.uniform(min_x_factor * WORLD_BOUNDS, max_x_factor * WORLD_BOUNDS)
        wy = random.uniform(min_y_factor * WORLD_BOUNDS, max_y_factor * WORLD_BOUNDS)
        pos = (wx, wy)
        line_x = start_finish_line[0][0]; line_y1 = start_finish_line[0][1]; line_y2 = start_finish_line[1][1]
        if abs(wx - line_x) < 150 and min(line_y1, line_y2) - 50 < wy < max(line_y1, line_y2) + 50: continue
        all_existing = existing_objects + [Buoy(bx,by,-1) for bx,by in buoy_coords]
        if is_too_close(pos, all_existing, min_dist_sq): continue
        buoy_coords.append(pos); area_index += 1
    if attempts >= max_attempts: print(f"Warning: Could only generate {len(buoy_coords)}/{count} buoys.")
    while len(buoy_coords) < min(count, 1):
         wx = random.uniform(-WORLD_BOUNDS * 0.7, WORLD_BOUNDS * 0.7); wy = random.uniform(-WORLD_BOUNDS * 0.7, WORLD_BOUNDS * 0.7)
         buoy_coords.append((wx, wy)); print("Warning: Adding fallback buoy.")
    return buoy_coords


# --- Main Game Function ---
def main():
    pygame.init()
    screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
    pygame.display.set_caption("Dinghy Sailing Race")
    clock = pygame.time.Clock()
    font = pygame.font.Font(None, 30)
    title_font = pygame.font.Font(None, 48)
    lap_font = pygame.font.Font(None, 24)
    button_font = pygame.font.Font(None, 24)

    # Game Objects
    player_boat = Boat(CENTER_X, CENTER_Y)
    sandbars = []
    buoys = []
    course_buoys_coords = []

    # UI Elements
    start_button_rect = pygame.Rect(CENTER_X - SETUP_BUTTON_WIDTH // 2, SCREEN_HEIGHT * 0.6, SETUP_BUTTON_WIDTH, SETUP_BUTTON_HEIGHT)
    laps_minus_rect = pygame.Rect(CENTER_X - 60 - LAP_BUTTON_SIZE, SCREEN_HEIGHT * 0.45, LAP_BUTTON_SIZE, LAP_BUTTON_SIZE)
    laps_plus_rect = pygame.Rect(CENTER_X + 60, SCREEN_HEIGHT * 0.45, LAP_BUTTON_SIZE, LAP_BUTTON_SIZE)
    new_race_button_rect = pygame.Rect(CENTER_X - SETUP_BUTTON_WIDTH // 2, SCREEN_HEIGHT * 0.7, SETUP_BUTTON_WIDTH, SETUP_BUTTON_HEIGHT)

    # Game State Variables
    game_state = GameState.SETUP
    selected_laps = DEFAULT_RACE_LAPS
    total_laps = selected_laps
    current_lap = 0; next_buoy_index = -1; lap_times = []; lap_start_time = 0.0
    total_race_start_time = 0.0; race_started = False; race_finished = False
    last_line_crossing_time = -LINE_CROSSING_DEBOUNCE; final_total_time = 0.0

    # Other Variables
    wind_speed = random.uniform(MIN_WIND_SPEED, MAX_WIND_SPEED); wind_direction = random.uniform(0, 360)
    last_wind_update = pygame.time.get_ticks(); world_offset_x = 0.0; world_offset_y = 0.0
    wave_layers = [create_wave_layer(SCREEN_WIDTH + 100, SCREEN_HEIGHT + 100, WAVE_DENSITY * (i+1)) for i in range(NUM_WAVE_LAYERS)]
    wave_offsets = [[0.0, 0.0] for _ in range(NUM_WAVE_LAYERS)]
    course_generated = False

    # --- Main Loop ---
    running = True
    while running:
        current_time_s = pygame.time.get_ticks() / 1000.0
        dt = clock.tick(60) / 1000.0
        dt = min(dt, 0.1)
        mouse_pos = pygame.mouse.get_pos()

        # Event Handling
        for event in pygame.event.get():
            if event.type == pygame.QUIT: running = False
            if game_state == GameState.SETUP:
                if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    if laps_minus_rect.collidepoint(event.pos): selected_laps = max(1, selected_laps - 1)
                    elif laps_plus_rect.collidepoint(event.pos): selected_laps = min(10, selected_laps + 1)
                    elif start_button_rect.collidepoint(event.pos):
                        game_state = GameState.RACING; total_laps = selected_laps; current_lap = 0
                        next_buoy_index = -1; lap_times = []; race_started = False; race_finished = False
                        last_line_crossing_time = -LINE_CROSSING_DEBOUNCE; player_boat.reset_position()
                        world_offset_x = player_boat.world_x; world_offset_y = player_boat.world_y
                        course_generated = False; print(f"Starting Race: {total_laps} Laps")
            elif game_state == GameState.RACING:
                if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    if WIND_BUTTON_RECT.collidepoint(event.pos):
                        wind_direction = random.uniform(0, 360); last_wind_update = pygame.time.get_ticks()
                        print(f"Wind direction randomized to: {wind_direction:.1f}")
            elif game_state == GameState.FINISHED:
                 if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                     if new_race_button_rect.collidepoint(event.pos):
                         game_state = GameState.SETUP; sandbars = []; buoys = []; course_buoys_coords = []; course_generated = False

        # State Updates
        if game_state == GameState.SETUP:
            if not course_generated:
                print("Generating new course...")
                course_buoys_coords = generate_random_buoys(NUM_COURSE_BUOYS, [], START_FINISH_LINE)
                sandbars = generate_random_sandbars(NUM_SANDBARS, [Buoy(x,y,-1) for x,y in course_buoys_coords], START_FINISH_LINE, course_buoys_coords)
                buoys = []; buoys.append(Buoy(START_FINISH_LINE[0][0], START_FINISH_LINE[0][1], -1, is_gate=True))
                buoys.append(Buoy(START_FINISH_LINE[1][0], START_FINISH_LINE[1][1], -1, is_gate=True))
                for i, (bx, by) in enumerate(course_buoys_coords): buoys.append(Buoy(bx, by, i))
                course_generated = True
        elif game_state == GameState.RACING:
            keys = pygame.key.get_pressed()
            if keys[pygame.K_LEFT] or keys[pygame.K_a]: player_boat.turn(-1)
            elif keys[pygame.K_RIGHT] or keys[pygame.K_d]: player_boat.turn(1)
            if keys[pygame.K_UP] or keys[pygame.K_w]: player_boat.trim_sail(-1)
            elif keys[pygame.K_DOWN] or keys[pygame.K_s]: player_boat.trim_sail(1)
            current_ticks = pygame.time.get_ticks()
            if current_ticks - last_wind_update > WIND_UPDATE_INTERVAL:
                interval_secs = (current_ticks - last_wind_update) / 1000.0
                speed_change = random.uniform(-WIND_SPEED_CHANGE_RATE, WIND_SPEED_CHANGE_RATE) * interval_secs
                wind_speed = max(MIN_WIND_SPEED, min(MAX_WIND_SPEED, wind_speed + speed_change))
                dir_change = random.uniform(-WIND_DIR_CHANGE_RATE, WIND_DIR_CHANGE_RATE) * interval_secs
                wind_direction = normalize_angle(wind_direction + dir_change); last_wind_update = current_ticks
            player_boat.on_sandbar = False; boat_world_rect = player_boat.get_world_collision_rect()
            for sandbar in sandbars:
                if boat_world_rect.colliderect(sandbar.rect): player_boat.on_sandbar = True; break
            player_boat.update(wind_speed, wind_direction, dt)
            world_offset_x = player_boat.world_x; world_offset_y = player_boat.world_y
            if not race_finished:
                boat_pos = (player_boat.world_x, player_boat.world_y); boat_prev_pos = (player_boat.prev_world_x, player_boat.prev_world_y)
                course_buoy_list_start_index = 2; num_course_buoys = len(course_buoys_coords)
                if race_started and next_buoy_index >= 0 and next_buoy_index < num_course_buoys:
                    current_course_buoy = buoys[course_buoy_list_start_index + next_buoy_index]
                    dist_sq_to_buoy = distance_sq(boat_pos, (current_course_buoy.world_x, current_course_buoy.world_y))
                    if dist_sq_to_buoy < BUOY_ROUNDING_RADIUS**2: print(f"Rounded Buoy {next_buoy_index + 1}"); next_buoy_index += 1
                if current_time_s - last_line_crossing_time > LINE_CROSSING_DEBOUNCE:
                    # Use updated crossing check
                    crossed_line = check_line_crossing(boat_prev_pos, boat_pos, START_FINISH_LINE[0], START_FINISH_LINE[1])
                    if crossed_line:
                        print("Crossed Start/Finish Line Segment"); last_line_crossing_time = current_time_s
                        if not race_started:
                            race_started = True; current_lap = 1; next_buoy_index = 0
                            lap_start_time = current_time_s; total_race_start_time = current_time_s
                            lap_times = []; print("Race Started!")
                        elif next_buoy_index >= num_course_buoys:
                            lap_time = current_time_s - lap_start_time; lap_times.append(lap_time)
                            print(f"Lap {current_lap} finished: {format_time(lap_time)}")
                            if current_lap >= total_laps:
                                race_finished = True; final_total_time = current_time_s - total_race_start_time
                                print(f"Race Finished! Total Time: {format_time(final_total_time)}")
                                game_state = GameState.FINISHED
                            else:
                                current_lap += 1; next_buoy_index = 0; lap_start_time = current_time_s
                                print(f"Starting Lap {current_lap}")
        elif game_state == GameState.FINISHED: pass

        # Drawing
        screen.fill(BLUE)
        if game_state == GameState.SETUP:
            title_surf = title_font.render("Race Setup", True, WHITE); screen.blit(title_surf, (CENTER_X - title_surf.get_width()//2, SCREEN_HEIGHT * 0.1))
            laps_text = f"Laps: {selected_laps}"; laps_surf = font.render(laps_text, True, WHITE); screen.blit(laps_surf, (CENTER_X - laps_surf.get_width()//2, SCREEN_HEIGHT * 0.45))
            draw_button(screen, laps_minus_rect, "-", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
            draw_button(screen, laps_plus_rect, "+", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
            draw_button(screen, start_button_rect, "Start Race", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
            if sandbars or buoys: draw_map(screen, player_boat, sandbars, buoys, -1, START_FINISH_LINE, MAP_RECT, WORLD_BOUNDS)
        elif game_state == GameState.RACING:
            draw_scrolling_water(screen, wave_layers, wave_offsets, deg_to_rad(wind_direction), dt)
            player_boat.draw_wake(screen, world_offset_x, world_offset_y)
            for sandbar in sandbars: sandbar.draw(screen, world_offset_x, world_offset_y)
            sf_p1_screen = (int(START_FINISH_LINE[0][0] - world_offset_x + CENTER_X), int(START_FINISH_LINE[0][1] - world_offset_y + CENTER_Y))
            sf_p2_screen = (int(START_FINISH_LINE[1][0] - world_offset_x + CENTER_X), int(START_FINISH_LINE[1][1] - world_offset_y + CENTER_Y))
            pygame.draw.line(screen, START_FINISH_LINE_COLOR, sf_p1_screen, sf_p2_screen, START_FINISH_WIDTH)
            for i, buoy in enumerate(buoys):
                 is_next_course_buoy = race_started and not race_finished and i >= 2 and (i - 2) == next_buoy_index
                 buoy.draw(screen, world_offset_x, world_offset_y, is_next_course_buoy)
            player_boat.draw(screen)
            # Draw UI
            wind_rad = deg_to_rad(wind_direction); arrow_len = 30 + wind_speed * 5
            arrow_end_x = 50 + math.cos(wind_rad) * arrow_len; arrow_end_y = 50 + math.sin(wind_rad) * arrow_len
            pygame.draw.line(screen, RED, (50, 50), (arrow_end_x, arrow_end_y), 3); pygame.draw.circle(screen, RED, (50, 50), 5)
            draw_button(screen, WIND_BUTTON_RECT, "Random Wind", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
            speed_text = font.render(f"Speed: {player_boat.speed:.1f}", True, WHITE); screen.blit(speed_text, (10, SCREEN_HEIGHT - 60))
            sail_text = font.render(f"Sail Trim: {player_boat.sail_angle_rel:.0f} (Vis: {player_boat.visual_sail_angle_rel:.0f})", True, WHITE); screen.blit(sail_text, (10, SCREEN_HEIGHT - 35))
            wind_text = font.render(f"Wind: {wind_speed:.1f} @ {wind_direction:.0f} deg", True, WHITE); screen.blit(wind_text, (10, 10))
            eff_text = font.render(f"Effectiveness: {player_boat.wind_effectiveness:.2f}", True, WHITE); screen.blit(eff_text, (SCREEN_WIDTH - 200, SCREEN_HEIGHT - 85))
            opt_text = font.render(f"Optimal Trim: {player_boat.optimal_sail_trim:.0f}", True, WHITE); screen.blit(opt_text, (SCREEN_WIDTH - 200, SCREEN_HEIGHT - 60))
            # Draw Race UI
            lap_display = f"Lap: {current_lap}/{total_laps}" if race_started else "Cross Start Line"
            lap_text = font.render(lap_display, True, WHITE); screen.blit(lap_text, (CENTER_X - lap_text.get_width() // 2, 10))
            next_buoy_text = ""
            num_course_buoys = len(course_buoys_coords)
            if race_started and not race_finished:
                if next_buoy_index < num_course_buoys: next_buoy_text = f"Next Buoy: {next_buoy_index + 1}"
                else: next_buoy_text = "To Finish Line"
            next_buoy_surf = font.render(next_buoy_text, True, NEXT_BUOY_INDICATOR_COLOR); screen.blit(next_buoy_surf, (CENTER_X - next_buoy_surf.get_width() // 2, 40))
            total_time_str = "00:00.00"; current_lap_str = "00:00.00"
            if race_started and not race_finished:
                total_time_val = current_time_s - total_race_start_time; current_lap_val = current_time_s - lap_start_time
                total_time_str = format_time(total_time_val); current_lap_str = format_time(current_lap_val)
            total_time_text = font.render(f"Total: {total_time_str}", True, WHITE); screen.blit(total_time_text, (SCREEN_WIDTH - 200, SCREEN_HEIGHT - 35))
            cur_lap_time_text = font.render(f"Lap: {current_lap_str}", True, WHITE); screen.blit(cur_lap_time_text, (SCREEN_WIDTH - 380, SCREEN_HEIGHT - 35))
            y_lap_offset = 10
            for i, l_time in enumerate(reversed(lap_times)):
                if i >= 3: break
                lap_num = len(lap_times) - i
                lap_time_surf = lap_font.render(f"Lap {lap_num}: {format_time(l_time)}", True, GRAY)
                screen.blit(lap_time_surf, (SCREEN_WIDTH - lap_time_surf.get_width() - 10 , SCREEN_HEIGHT - 100 - y_lap_offset)); y_lap_offset += 25
            # Pass correct next buoy index for highlighting on map (offset by gate buoys)
            map_next_buoy_highlight_index = course_buoy_list_start_index + next_buoy_index if race_started and next_buoy_index < num_course_buoys else -1
            draw_map(screen, player_boat, sandbars, buoys, map_next_buoy_highlight_index, START_FINISH_LINE, MAP_RECT, WORLD_BOUNDS)
        elif game_state == GameState.FINISHED:
             title_surf = title_font.render("Race Finished!", True, WHITE); screen.blit(title_surf, (CENTER_X - title_surf.get_width()//2, SCREEN_HEIGHT * 0.1))
             total_time_surf = font.render(f"Total Time: {format_time(final_total_time)}", True, WHITE); screen.blit(total_time_surf, (CENTER_X - total_time_surf.get_width()//2, SCREEN_HEIGHT * 0.3))
             y_lap_offset = SCREEN_HEIGHT * 0.4
             for i, l_time in enumerate(lap_times):
                 lap_num = i + 1; lap_time_surf = lap_font.render(f"Lap {lap_num}: {format_time(l_time)}", True, WHITE)
                 screen.blit(lap_time_surf, (CENTER_X - lap_time_surf.get_width()//2 , y_lap_offset)); y_lap_offset += 30
             draw_button(screen, new_race_button_rect, "New Race Setup", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)

        pygame.display.flip()

    pygame.quit()

if __name__ == '__main__':
    main()
