# utils.py

import pygame
import math
import random

from constants import *

def deg_to_rad(degrees):
    return degrees * math.pi / 180.0

def rad_to_deg(radians):
    return radians * 180.0 / math.pi

def angle_difference(angle1, angle2):
    return (angle1 - angle2 + 180) % 360 - 180

def normalize_angle(degrees):
    return degrees % 360

def lerp(a, b, t):
    return a + (b - a) * t

def distance_sq(p1, p2):
    return (p1[0] - p2[0])**2 + (p1[1] - p2[1])**2

def check_line_crossing(p1, p2, line_p1, line_p2):
    """
    Checks if the line segment p1-p2 crosses the line segment defined by
    line_p1 and line_p2. Returns True if crossing occurred ON the segment.
    """
    def orientation(p, q, r):
        val = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1])
        if abs(val) < 1e-6: return 0  # Collinear
        return 1 if val > 0 else 2  # Clockwise or Counterclockwise

    o1 = orientation(line_p1, line_p2, p1)
    o2 = orientation(line_p1, line_p2, p2)
    o3 = orientation(p1, p2, line_p1)
    o4 = orientation(p1, p2, line_p2)

    if o1 != o2 and o3 != o4:
        return True

    return False

def format_time(seconds):
    """Formats seconds into MM:SS.ss"""
    if seconds < 0 or not math.isfinite(seconds):
        return "--:--.--"
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    hunds = int((seconds * 100) % 100)
    return f"{mins:02}:{secs:02}.{hunds:02}"

def create_wave_layer(width, height, density, alpha, thickness):
    """Creates a surface with randomly drawn lines to simulate a wave pattern."""
    layer = pygame.Surface((width, height), pygame.SRCALPHA)
    layer.fill((0,0,0,0))
    for _ in range(density):
        x = random.randint(0, width)
        y = random.randint(0, height)
        length = random.randint(5, 15)
        angle = random.uniform(0, 360)
        end_x = x + math.cos(deg_to_rad(angle)) * length
        end_y = y + math.sin(deg_to_rad(angle)) * length
        pygame.draw.line(layer, (*LIGHT_BLUE, alpha), (x, y), (end_x, end_y), thickness)
    return layer

def draw_scrolling_water(surface, layers, offsets, wind_direction_rad, dt):
    """Draws and scrolls the wave layers on the given surface."""
    base_speed_factor = 50.0
    wind_influence = 0.3
    wind_dx = math.cos(wind_direction_rad)
    wind_dy = math.sin(wind_direction_rad)

    for i, layer in enumerate(layers):
        base_dx, base_dy = (1, 1)
        scroll_dx = lerp(base_dx, wind_dx, wind_influence)
        scroll_dy = lerp(base_dy, wind_dy, wind_influence)
        norm = math.sqrt(scroll_dx**2 + scroll_dy**2)
        if norm > 0:
            scroll_dx /= norm
            scroll_dy /= norm
        
        speed = WAVE_SCROLL_SPEED_BASE[i] * base_speed_factor
        offsets[i][0] += scroll_dx * speed * dt
        offsets[i][1] += scroll_dy * speed * dt
        
        w, h = layer.get_width(), layer.get_height()
        if w > 0: offsets[i][0] %= w
        if h > 0: offsets[i][1] %= h
        
        x_offset, y_offset = offsets[i]
        start_x = -x_offset
        start_y = -y_offset

        if h > 0 and w > 0:
            for row in range(int(start_y / h) - 1, int((surface.get_height() - start_y) / h) + 2):
                for col in range(int(start_x / w) - 1, int((surface.get_width() - start_x) / w) + 2):
                    surface.blit(layer, (start_x + col * w, start_y + row * h))