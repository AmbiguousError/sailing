# terrain.py

import pygame
import random
import math
from constants import *
from entities import Sandbar

def generate_random_polygon(width, height, scale_factor, num_vertices, irregularity):
    """Generates a random, irregular polygon shape for depth layers."""
    points = []
    center_x, center_y = width / 2, height / 2
    avg_radius = min(width, height) * 0.45 * scale_factor
    
    for i in range(num_vertices):
        angle = (i / num_vertices) * (2 * math.pi)
        radius_variation = random.uniform(1.0 - irregularity, 1.0 + irregularity)
        radius = avg_radius * radius_variation
        x = center_x + radius * math.cos(angle)
        y = center_y + radius * math.sin(angle)
        points.append((x, y))
    return points

def generate_depth_map(width, height, sandbars):
    """Generates a surface representing water depth with layered contour lines."""
    depth_surface = pygame.Surface((width, height))
    depth_surface.fill(BLUE)  # Base ocean color

    # Draw base depth contour layers
    for i, color in enumerate(DEPTH_COLORS):
        scale = 0.95 - (i * 0.15)
        verts = 12 - (i * 2)
        irregularity = 0.1 + (i * 0.05)
        poly = generate_random_polygon(width, height, scale, verts, irregularity)
        pygame.draw.polygon(depth_surface, color, poly)

    # For each sandbar, create a surrounding shallow area on the map
    for sandbar in sandbars:
        for i, color in enumerate(SHALLOW_COLORS):
            # Create a larger, more irregular polygon around the sandbar
            mound_points = []
            for point in sandbar.points_world:
                offset_x = (point[0] - sandbar.world_x) * (1.5 + i * 0.5) * random.uniform(0.8, 1.2)
                offset_y = (point[1] - sandbar.world_y) * (1.5 + i * 0.5) * random.uniform(0.8, 1.2)
                mound_points.append((sandbar.world_x + offset_x + WORLD_BOUNDS, sandbar.world_y + offset_y + WORLD_BOUNDS))
            
            pygame.draw.polygon(depth_surface, color, mound_points)
    
    # Stamp the sandbars themselves on the very top
    for sandbar in sandbars:
        sandbar_poly_on_surface = [(p[0] + WORLD_BOUNDS, p[1] + WORLD_BOUNDS) for p in sandbar.points_world]
        pygame.draw.polygon(depth_surface, sandbar.color, sandbar_poly_on_surface)
        pygame.draw.polygon(depth_surface, sandbar.border_color, sandbar_poly_on_surface, 2)


    return depth_surface
