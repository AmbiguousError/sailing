# course.py

import random
import math

from constants import *
from utils import *
from entities import Sandbar, Buoy

def is_too_close(new_pos, existing_objects, min_dist_sq):
    """Checks if new_pos is too close to any existing object position."""
    for obj in existing_objects:
        obj_pos = (getattr(obj, 'world_x', 0), getattr(obj, 'world_y', 0))
        if distance_sq(new_pos, obj_pos) < min_dist_sq:
            return True
    return False

def generate_random_sandbars(count, course_buoys_coords):
    """Generates a list of Sandbar objects with random positions."""
    sandbars = []
    min_dist_sq = MIN_OBJ_SEPARATION**2
    attempts = 0
    max_attempts = count * 20
    while len(sandbars) < count and attempts < max_attempts:
        attempts += 1
        size = random.randint(MIN_SANDBAR_SIZE, MAX_SANDBAR_SIZE)
        wx = random.uniform(-WORLD_BOUNDS * 0.85, WORLD_BOUNDS * 0.85)
        wy = random.uniform(-WORLD_BOUNDS * 0.85, WORLD_BOUNDS * 0.85)
        pos = (wx, wy)
        line_x = START_FINISH_LINE[0][0]
        line_y1 = START_FINISH_LINE[0][1]
        line_y2 = START_FINISH_LINE[1][1]
        if abs(wx - line_x) < (size/2 + 50) and min(line_y1, line_y2) - size/2 < wy < max(line_y1, line_y2) + size/2:
            continue
        too_close_to_buoy = False
        for bx, by in course_buoys_coords:
            if distance_sq(pos, (bx, by)) < (size/2 + BUOY_RADIUS + MIN_OBJ_SEPARATION)**2:
                too_close_to_buoy = True
                break
        if too_close_to_buoy:
            continue
        if is_too_close(pos, sandbars, (size/2 + MIN_SANDBAR_SIZE/2)**2):
            continue
        sandbars.append(Sandbar(wx, wy, size))
    if attempts >= max_attempts:
        print(f"Warning: Could only generate {len(sandbars)}/{count} sandbars.")
    return sandbars

def generate_random_buoys(count):
    """Generates a list of Buoy coordinates."""
    buoy_coords = []
    min_dist_sq = (MIN_OBJ_SEPARATION * 1.5)**2
    attempts = 0
    max_attempts = count * 30
    areas = [ (0.25, 0.75, -0.75, -0.25), (-0.75, -0.25, -0.75, -0.25), (-0.5, 0.5, 0.25, 0.75) ]
    if count > 3:
        areas.extend([ (-0.75, -0.25, 0.25, 0.75), (0.25, 0.75, 0.25, 0.75) ])
    random.shuffle(areas)
    area_index = 0
    while len(buoy_coords) < count and attempts < max_attempts:
        attempts += 1
        if area_index >= len(areas):
            break
        min_x_factor, max_x_factor, min_y_factor, max_y_factor = areas[area_index]
        wx = random.uniform(min_x_factor * WORLD_BOUNDS, max_x_factor * WORLD_BOUNDS)
        wy = random.uniform(min_y_factor * WORLD_BOUNDS, max_y_factor * WORLD_BOUNDS)
        pos = (wx, wy)
        line_x = START_FINISH_LINE[0][0]
        line_y1 = START_FINISH_LINE[0][1]
        line_y2 = START_FINISH_LINE[1][1]
        if abs(wx - line_x) < 150 and min(line_y1, line_y2) - 50 < wy < max(line_y1, line_y2) + 50:
            continue
        all_existing = [Buoy(bx,by,-1) for bx,by in buoy_coords]
        if is_too_close(pos, all_existing, min_dist_sq):
            continue
        buoy_coords.append(pos)
        area_index += 1
    if attempts >= max_attempts:
        print(f"Warning: Could only generate {len(buoy_coords)}/{count} buoys.")
    while len(buoy_coords) < min(count, 1):
         wx = random.uniform(-WORLD_BOUNDS * 0.7, WORLD_BOUNDS * 0.7)
         wy = random.uniform(-WORLD_BOUNDS * 0.7, WORLD_BOUNDS * 0.7)
         buoy_coords.append((wx, wy))
         print("Warning: Adding fallback buoy.")
    return buoy_coords