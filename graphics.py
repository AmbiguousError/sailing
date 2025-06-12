# graphics.py

import pygame
import random
import math

from constants import *
from utils import *

def create_wave_layer(width, height, density):
    layer = pygame.Surface((width, height), pygame.SRCALPHA)
    layer.fill((0,0,0,0))
    for _ in range(density):
        x = random.randint(0, width)
        y = random.randint(0, height)
        length = random.randint(5, 15)
        angle = random.uniform(0, 360)
        end_x = x + math.cos(deg_to_rad(angle)) * length
        end_y = y + math.sin(deg_to_rad(angle)) * length
        pygame.draw.line(layer, (*LIGHT_BLUE, WAVE_LAYER_ALPHA), (x, y), (end_x, end_y), WAVE_LINE_THICKNESS)
    return layer

def draw_scrolling_water(surface, layers, offsets, wind_direction_rad, dt):
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
        w = layer.get_width()
        h = layer.get_height()
        offsets[i][0] %= w
        offsets[i][1] %= h
        x_offset, y_offset = offsets[i]
        start_x = -x_offset
        start_y = -y_offset
        for row in range(int(start_y / h) -1 , int((surface.get_height() - start_y) / h) + 1):
             for col in range(int(start_x / w) -1, int((surface.get_width() - start_x) / w) + 1):
                 surface.blit(layer, (start_x + col * w, start_y + row * h))

def draw_map(surface, boat, ai_boats, sandbars, buoys, next_buoy_index, start_finish_line, map_rect, world_bounds):
    """Draws the minimap including the course."""
    map_surface = pygame.Surface(map_rect.size, pygame.SRCALPHA)
    map_surface.fill(MAP_BG_COLOR)
    surface.blit(map_surface, map_rect.topleft)
    pygame.draw.rect(surface, MAP_BORDER_COLOR, map_rect, 1)

    # Start/Finish Line
    sf_p1_map = (map_rect.centerx + start_finish_line[0][0] * MAP_WORLD_SCALE_X, map_rect.centery + start_finish_line[0][1] * MAP_WORLD_SCALE_Y)
    sf_p2_map = (map_rect.centerx + start_finish_line[1][0] * MAP_WORLD_SCALE_X, map_rect.centery + start_finish_line[1][1] * MAP_WORLD_SCALE_Y)
    pygame.draw.line(surface, START_FINISH_LINE_COLOR, sf_p1_map, sf_p2_map, 1)

    # Buoys
    for i, buoy in enumerate(buoys):
        map_x = map_rect.centerx + buoy.world_x * MAP_WORLD_SCALE_X
        map_y = map_rect.centery + buoy.world_y * MAP_WORLD_SCALE_Y
        is_next = (i == next_buoy_index)
        color_to_use = buoy.color
        if is_next and not buoy.is_gate:
            color_to_use = NEXT_BUOY_INDICATOR_COLOR

        if map_rect.collidepoint(map_x, map_y):
            pygame.draw.circle(surface, color_to_use, (int(map_x), int(map_y)), MAP_BUOY_MARKER_RADIUS)
            if not buoy.is_gate:
                 pygame.draw.circle(surface, BLACK, (int(map_x), int(map_y)), MAP_BUOY_MARKER_RADIUS, 1)

    # Sandbars
    for sandbar in sandbars:
        map_x = map_rect.centerx + sandbar.world_x * MAP_WORLD_SCALE_X
        map_y = map_rect.centery + sandbar.world_y * MAP_WORLD_SCALE_Y
        map_radius = (sandbar.size / 2.0) * MAP_WORLD_SCALE_X
        if map_rect.collidepoint(map_x, map_y):
             pygame.draw.circle(surface, DARK_SAND_COLOR, (int(map_x), int(map_y)), max(1, int(map_radius)))

    # AI Boats
    for ai_boat in ai_boats:
        ai_map_x = map_rect.centerx + ai_boat.world_x * MAP_WORLD_SCALE_X
        ai_map_y = map_rect.centery + ai_boat.world_y * MAP_WORLD_SCALE_Y
        if map_rect.collidepoint(ai_map_x, ai_map_y):
            pygame.draw.circle(surface, MAP_AI_BOAT_COLOR, (int(ai_map_x), int(ai_map_y)), 2)

    # Player Boat
    boat_map_x = map_rect.centerx + boat.world_x * MAP_WORLD_SCALE_X
    boat_map_y = map_rect.centery + boat.world_y * MAP_WORLD_SCALE_Y
    if map_rect.collidepoint(boat_map_x, boat_map_y):
        boat_angle_rad = deg_to_rad(boat.heading)
        p1 = (boat_map_x + math.cos(boat_angle_rad) * MAP_BOAT_MARKER_SIZE, boat_map_y + math.sin(boat_angle_rad) * MAP_BOAT_MARKER_SIZE)
        p2 = (boat_map_x + math.cos(boat_angle_rad + 2.356) * MAP_BOAT_MARKER_SIZE * 0.6, boat_map_y + math.sin(boat_angle_rad + 2.356) * MAP_BOAT_MARKER_SIZE * 0.6)
        p3 = (boat_map_x + math.cos(boat_angle_rad - 2.356) * MAP_BOAT_MARKER_SIZE * 0.6, boat_map_y + math.sin(boat_angle_rad - 2.356) * MAP_BOAT_MARKER_SIZE * 0.6)
        try:
            pygame.draw.polygon(surface, MAP_BOAT_COLOR, [(int(p1[0]), int(p1[1])), (int(p2[0]), int(p2[1])), (int(p3[0]), int(p3[1]))])
        except ValueError:
            pygame.draw.circle(surface, MAP_BOAT_COLOR, (int(boat_map_x), int(boat_map_y)), 2)

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