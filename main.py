# main.py

import pygame
import random
import math
from enum import Enum, auto

from constants import *
from utils import *
from entities import Boat, Buoy, AIBoat, SailingStyle
from course import generate_random_buoys, generate_random_sandbars
from graphics import draw_map, draw_button, draw_wind_gauge
from terrain import generate_depth_map

class GameState(Enum):
    SETUP = auto()
    RACING = auto()
    PAUSED = auto()
    RACE_RESULTS = auto()
    SERIES_END = auto()

def handle_boat_collision(boat1, boat2):
    dist_sq = distance_sq((boat1.world_x, boat1.world_y), (boat2.world_x, boat2.world_y))
    min_dist = boat1.collision_radius + boat2.collision_radius
    if dist_sq < min_dist**2 and dist_sq > 0:
        dist = math.sqrt(dist_sq)
        overlap = min_dist - dist
        
        dx = boat2.world_x - boat1.world_x
        dy = boat2.world_y - boat1.world_y
        
        if dist == 0:
            dx, dy, dist = 1, 0, 1
            
        nx = dx / dist
        ny = dy / dist

        # Push boats apart based on overlap
        boat1.world_x -= nx * overlap * 0.5
        boat1.world_y -= ny * overlap * 0.5
        boat2.world_x += nx * overlap * 0.5
        boat2.world_y += ny * overlap * 0.5

        # Reduce speed of both boats
        boat1.speed *= BOAT_COLLISION_SPEED_REDUCTION
        boat2.speed *= BOAT_COLLISION_SPEED_REDUCTION

def render_view(surface, camera_boat, players, ai_boats, sandbars, buoys, start_finish_line, depth_map, wave_layers, wave_offsets, wind_direction, dt, font, lap_font, race_info):
    """Renders a single player's viewport."""
    world_offset_x = camera_boat.world_x
    world_offset_y = camera_boat.world_y
    view_center = (surface.get_width() // 2, surface.get_height() // 2)

    area_x = (world_offset_x - view_center[0]) + WORLD_BOUNDS
    area_y = (world_offset_y - view_center[1]) + WORLD_BOUNDS
    view_rect_on_depth_map = pygame.Rect(area_x, area_y, surface.get_width(), surface.get_height())
    surface.blit(depth_map, (0,0), area=view_rect_on_depth_map)

    draw_scrolling_water(surface, wave_layers, wave_offsets, deg_to_rad(wind_direction), dt)

    for boat in players + ai_boats:
        boat.draw_wake(surface, world_offset_x, world_offset_y, view_center)
    
    sf_p1_screen = (int(start_finish_line[0][0] - world_offset_x + view_center[0]), int(start_finish_line[0][1] - world_offset_y + view_center[1]))
    sf_p2_screen = (int(start_finish_line[1][0] - world_offset_x + view_center[0]), int(start_finish_line[1][1] - world_offset_y + view_center[1]))
    pygame.draw.line(surface, START_FINISH_LINE_COLOR, sf_p1_screen, sf_p2_screen, START_FINISH_WIDTH)

    num_course_buoys = (len(buoys) - 2)
    course_buoy_list_start_index = 2
    for i, buoy in enumerate(buoys):
        is_next = (camera_boat.race_started and not camera_boat.is_finished and i >= course_buoy_list_start_index and (i - course_buoy_list_start_index) == camera_boat.next_buoy_index)
        buoy.draw(surface, world_offset_x, world_offset_y, is_next, view_center)

    for boat in players + ai_boats:
        boat.screen_x = int(boat.world_x - world_offset_x + view_center[0])
        boat.screen_y = int(boat.world_y - world_offset_y + view_center[1])
        boat.draw(surface)

    draw_hud(surface, font, lap_font, camera_boat, race_info, num_course_buoys)

def draw_hud(surface, font, lap_font, boat, race_info, num_course_buoys):
    """Draws the HUD for a single boat on the given surface."""
    current_time_s = pygame.time.get_ticks() / 1000.0
    
    wind_text = font.render(f"Wind Speed: {race_info['wind_speed']:.1f}", True, WHITE)
    surface.blit(wind_text, (10, surface.get_height() - 85))
    speed_text = font.render(f"Speed: {boat.speed:.1f}", True, WHITE)
    surface.blit(speed_text, (10, surface.get_height() - 60))
    sail_text = font.render(f"Sail Trim: {boat.sail_angle_rel:.0f}", True, WHITE)
    surface.blit(sail_text, (10, surface.get_height() - 35))
    eff_text = font.render(f"Effectiveness: {boat.wind_effectiveness:.2f}", True, WHITE)
    surface.blit(eff_text, (surface.get_width() - 200, surface.get_height() - 85))
    opt_text = font.render(f"Optimal Trim: {boat.optimal_sail_trim:.0f}", True, WHITE)
    surface.blit(opt_text, (surface.get_width() - 200, surface.get_height() - 60))

    race_info_text = f"Race {race_info['current_race']}/{race_info['total_races']} - Lap: {boat.current_lap}/{race_info['total_laps']}" if boat.race_started else f"Race {race_info['current_race']}/{race_info['total_races']} - Cross Start Line"
    lap_text_surf = font.render(race_info_text, True, WHITE)
    surface.blit(lap_text_surf, (surface.get_width() // 2 - lap_text_surf.get_width() // 2, 10))

    next_buoy_text = ""
    if boat.race_started and not boat.is_finished:
        if boat.next_buoy_index < num_course_buoys:
            next_buoy_text = f"Next Buoy: {boat.next_buoy_index + 1}"
        else:
            next_buoy_text = "To Finish Line"
    next_buoy_surf = font.render(next_buoy_text, True, NEXT_BUOY_INDICATOR_COLOR)
    surface.blit(next_buoy_surf, (surface.get_width() // 2 - next_buoy_surf.get_width() // 2, 40))

    total_time_str, current_lap_str = "00:00.00", "00:00.00"
    if boat.race_started and not boat.is_finished:
        total_time_val = current_time_s - boat.race_start_time
        current_lap_val = current_time_s - boat.lap_start_time
        total_time_str = format_time(total_time_val)
        current_lap_str = format_time(current_lap_val)
    elif boat.is_finished:
         total_time_str = format_time(boat.finish_time)

    total_time_text = font.render(f"Total: {total_time_str}", True, WHITE)
    surface.blit(total_time_text, (surface.get_width() - 200, surface.get_height() - 35))
    cur_lap_time_text = font.render(f"Lap: {current_lap_str}", True, WHITE)
    surface.blit(cur_lap_time_text, (surface.get_width() - 380, surface.get_height() - 35))

    y_lap_offset = 10
    for i, l_time in enumerate(reversed(boat.lap_times[-3:])):
        lap_num = len(boat.lap_times) - i
        lap_time_surf = lap_font.render(f"Lap {lap_num}: {format_time(l_time)}", True, GRAY)
        surface.blit(lap_time_surf, (surface.get_width() - lap_time_surf.get_width() - 10, surface.get_height() - 100 - y_lap_offset))
        y_lap_offset += 25

def draw_pause_menu(surface, font):
    """Draws the pause menu overlay."""
    overlay = pygame.Surface(surface.get_size(), pygame.SRCALPHA)
    overlay.fill((0, 0, 0, 150))
    surface.blit(overlay, (0, 0))

    title_surf = font.render("Paused", True, WHITE)
    surface.blit(title_surf, (CENTER_X - title_surf.get_width() // 2, CENTER_Y - 120))

    draw_button(surface, RESUME_BUTTON_RECT, "Resume", font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
    draw_button(surface, RESTART_BUTTON_RECT, "Restart Series", font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
    draw_button(surface, FORFEIT_RACE_BUTTON_RECT, "Forfeit Race", font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
    draw_button(surface, EXIT_GAME_BUTTON_RECT, "Exit to Desktop", font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)


def main():
    pygame.init()
    screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
    pygame.display.set_caption("Dinghy Sailing Race")
    clock = pygame.time.Clock()
    font = pygame.font.Font(None, 30)
    title_font = pygame.font.Font(None, 48)
    lap_font = pygame.font.Font(None, 24)
    button_font = pygame.font.Font(None, 24)

    player1_boat = Boat(0, 0, name="Player 1", boat_color=WHITE)
    player2_boat = Boat(0, 0, name="Player 2", boat_color=PLAYER2_COLOR)
    players = []
    ai_boats = []
    sandbars = []
    buoys = []
    course_buoys_coords = []
    depth_map_surface = None
    course_buoy_list_start_index = 2
    
    start_button_rect = pygame.Rect(CENTER_X - SETUP_BUTTON_WIDTH // 2, SCREEN_HEIGHT * 0.4, SETUP_BUTTON_WIDTH, SETUP_BUTTON_HEIGHT)
    p1_button_rect = pygame.Rect(CENTER_X - 120, SCREEN_HEIGHT * 0.2, 100, 40)
    p2_button_rect = pygame.Rect(CENTER_X + 20, SCREEN_HEIGHT * 0.2, 100, 40)
    laps_minus_rect = pygame.Rect(CENTER_X - 100, SCREEN_HEIGHT * 0.3, LAP_BUTTON_SIZE, LAP_BUTTON_SIZE)
    laps_plus_rect = pygame.Rect(CENTER_X - 40, SCREEN_HEIGHT * 0.3, LAP_BUTTON_SIZE, LAP_BUTTON_SIZE)
    races_minus_rect = pygame.Rect(CENTER_X + 40, SCREEN_HEIGHT * 0.3, LAP_BUTTON_SIZE, LAP_BUTTON_SIZE)
    races_plus_rect = pygame.Rect(CENTER_X + 100, SCREEN_HEIGHT * 0.3, LAP_BUTTON_SIZE, LAP_BUTTON_SIZE)
    
    game_state = GameState.SETUP
    num_players = 1
    selected_laps = DEFAULT_RACE_LAPS
    selected_races = 1
    total_laps = selected_laps
    total_races = selected_races
    current_race = 0
    race_results = []
    
    wind_speed = random.uniform(MIN_WIND_SPEED, MAX_WIND_SPEED)
    wind_direction = random.uniform(0, 360)
    last_wind_update = pygame.time.get_ticks()
    main_wave_layers = [create_wave_layer(SCREEN_WIDTH + 100, SCREEN_HEIGHT // 2 + 100, WAVE_DENSITY, WAVE_LAYER_ALPHA, WAVE_LINE_THICKNESS) for i in range(NUM_WAVE_LAYERS)]
    wave_offsets = [[0.0, 0.0] for _ in range(NUM_WAVE_LAYERS)]
    all_boats = []
    
    def start_new_series():
        nonlocal total_races, total_laps, current_race, all_boats, players
        total_laps = selected_laps
        total_races = selected_races
        current_race = 1
        
        players.clear()
        players.append(player1_boat)
        if num_players == 2:
            players.append(player2_boat)

        ai_boats.clear()
        available_colors = AI_BOAT_COLORS[:]
        for i in range(NUM_AI_BOATS):
            color = random.choice(available_colors) if available_colors else GRAY
            if color in available_colors: available_colors.remove(color)
            ai_boats.append(AIBoat(0, 0, f"AI {i+1}", random.choice(list(SailingStyle)), color))
        
        all_boats = players + ai_boats
        for boat in all_boats:
            boat.score = 0
        start_new_race()

    def start_new_race():
        nonlocal course_buoys_coords, sandbars, buoys, wind_direction, depth_map_surface
        print(f"--- Starting Race {current_race}/{total_races} ---")
        
        wind_direction = random.uniform(0, 360)
        course_buoys_coords = generate_random_buoys(NUM_COURSE_BUOYS)
        sandbars = generate_random_sandbars(NUM_SANDBARS, course_buoys_coords)
        depth_map_surface = generate_depth_map(WORLD_BOUNDS * 2, WORLD_BOUNDS * 2, sandbars)

        buoys = []
        buoys.append(Buoy(START_FINISH_LINE[0][0], START_FINISH_LINE[0][1], -1, is_gate=True))
        buoys.append(Buoy(START_FINISH_LINE[1][0], START_FINISH_LINE[1][1], -1, is_gate=True))
        for i, (bx, by) in enumerate(course_buoys_coords):
            buoys.append(Buoy(bx, by, i))

        for i, boat in enumerate(all_boats):
            boat.reset_position()
            start_x = -150 - (i * 35)
            start_y = random.uniform(-100, 100)
            boat.world_x, boat.world_y = start_x, start_y
            boat.last_line_crossing_time = -LINE_CROSSING_DEBOUNCE
            boat.is_finished = False
            boat.race_started = False
            boat.lap_times = []
            boat.finish_time = 0
            boat.current_lap = 1
            boat.next_buoy_index = -1
    
    running = True
    while running:
        current_time_s = pygame.time.get_ticks() / 1000.0
        dt = clock.tick(60) / 1000.0
        dt = min(dt, 0.1) if game_state != GameState.PAUSED else 0

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            if event.type == pygame.KEYDOWN:
                if event.key == pygame.K_ESCAPE:
                    if game_state == GameState.RACING:
                        game_state = GameState.PAUSED
                    elif game_state == GameState.PAUSED:
                        game_state = GameState.RACING

            if game_state == GameState.SETUP:
                if not buoys: 
                    course_buoys_coords = generate_random_buoys(NUM_COURSE_BUOYS)
                    sandbars = generate_random_sandbars(NUM_SANDBARS, course_buoys_coords)
                    depth_map_surface = generate_depth_map(WORLD_BOUNDS * 2, WORLD_BOUNDS * 2, sandbars)
                    buoys = [Buoy(START_FINISH_LINE[0][0], START_FINISH_LINE[0][1], -1, is_gate=True), Buoy(START_FINISH_LINE[1][0], START_FINISH_LINE[1][1], -1, is_gate=True)]
                    for i, (bx, by) in enumerate(course_buoys_coords): buoys.append(Buoy(bx, by, i))

                if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    if p1_button_rect.collidepoint(event.pos): num_players = 1
                    elif p2_button_rect.collidepoint(event.pos): num_players = 2
                    elif laps_minus_rect.collidepoint(event.pos): selected_laps = max(1, selected_laps - 1)
                    elif laps_plus_rect.collidepoint(event.pos): selected_laps = min(10, selected_laps + 1)
                    elif races_minus_rect.collidepoint(event.pos): selected_races = max(1, selected_races - 1)
                    elif races_plus_rect.collidepoint(event.pos): selected_races = min(10, selected_races + 1)
                    elif start_button_rect.collidepoint(event.pos):
                        start_new_series()
                        game_state = GameState.RACING
            elif game_state == GameState.PAUSED:
                if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    if RESUME_BUTTON_RECT.collidepoint(event.pos):
                        game_state = GameState.RACING
                    elif RESTART_BUTTON_RECT.collidepoint(event.pos):
                        game_state = GameState.SETUP
                        buoys.clear()
                    elif FORFEIT_RACE_BUTTON_RECT.collidepoint(event.pos):
                        for p in players:
                            if not p.is_finished:
                                p.is_finished = True
                                p.finish_time = float('inf')
                        game_state = GameState.RACE_RESULTS
                    elif EXIT_GAME_BUTTON_RECT.collidepoint(event.pos):
                        running = False

            elif game_state in [GameState.RACE_RESULTS, GameState.SERIES_END]:
                 if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                     if game_state == GameState.RACE_RESULTS:
                         if MAIN_MENU_BUTTON_RECT.collidepoint(event.pos): 
                             if current_race < total_races:
                                 current_race += 1
                                 start_new_race()
                                 game_state = GameState.RACING
                             else:
                                 game_state = GameState.SERIES_END
                     elif game_state == GameState.SERIES_END:
                         if MAIN_MENU_BUTTON_RECT.collidepoint(event.pos):
                            game_state = GameState.SETUP
                            buoys.clear()
                         elif EXIT_END_SCREEN_BUTTON_RECT.collidepoint(event.pos):
                            running = False

        if game_state == GameState.RACING:
            keys = pygame.key.get_pressed()
            if keys[pygame.K_LEFT]: player1_boat.turn(-1)
            elif keys[pygame.K_RIGHT]: player1_boat.turn(1)
            if keys[pygame.K_UP]: player1_boat.trim_sail(-1)
            elif keys[pygame.K_DOWN]: player1_boat.trim_sail(1)
            
            if num_players == 2:
                if keys[pygame.K_a]: player2_boat.turn(-1)
                elif keys[pygame.K_d]: player2_boat.turn(1)
                if keys[pygame.K_w]: player2_boat.trim_sail(-1)
                elif keys[pygame.K_s]: player2_boat.trim_sail(1)

            current_ticks = pygame.time.get_ticks()
            if current_ticks - last_wind_update > WIND_UPDATE_INTERVAL:
                interval_secs = (current_ticks - last_wind_update) / 1000.0
                speed_change = random.uniform(-WIND_SPEED_CHANGE_RATE, WIND_SPEED_CHANGE_RATE) * interval_secs
                wind_speed = max(MIN_WIND_SPEED, min(MAX_WIND_SPEED, wind_speed + speed_change))
                dir_change = random.uniform(-WIND_DIR_CHANGE_RATE, WIND_DIR_CHANGE_RATE) * interval_secs
                wind_direction = normalize_angle(wind_direction + dir_change)
                last_wind_update = current_ticks

            for boat in all_boats:
                if isinstance(boat, AIBoat):
                    boat.ai_update(wind_speed, wind_direction, course_buoys_coords, START_FINISH_LINE, dt)
                
                boat.update(wind_speed, wind_direction, dt)
                
                boat.on_sandbar = False
                for sandbar in sandbars:
                    if boat.get_world_collision_rect().colliderect(sandbar.rect):
                        boat.on_sandbar = True
                        break

            for i in range(len(all_boats)):
                for j in range(i + 1, len(all_boats)):
                    handle_boat_collision(all_boats[i], all_boats[j])

            num_course_buoys = len(course_buoys_coords)
            for boat in all_boats:
                if boat.is_finished: continue
                boat_pos = (boat.world_x, boat.world_y)
                
                if boat.race_started and boat.next_buoy_index < num_course_buoys:
                    current_course_buoy = buoys[course_buoy_list_start_index + boat.next_buoy_index]
                    if distance_sq(boat_pos, (current_course_buoy.world_x, current_course_buoy.world_y)) < BUOY_ROUNDING_RADIUS**2:
                        boat.next_buoy_index += 1
                        if boat.next_buoy_index >= num_course_buoys and boat.current_lap < total_laps:
                             lap_time = current_time_s - boat.lap_start_time
                             boat.lap_times.append(lap_time)
                             boat.current_lap += 1
                             boat.next_buoy_index = 0
                             boat.lap_start_time = current_time_s
                
                if current_time_s - boat.last_line_crossing_time > LINE_CROSSING_DEBOUNCE:
                    boat_prev_pos = (boat.prev_world_x, boat.prev_world_y)
                    if check_line_crossing(boat_prev_pos, boat_pos, START_FINISH_LINE[0], START_FINISH_LINE[1]):
                        boat.last_line_crossing_time = current_time_s
                        if not boat.race_started:
                            boat.race_started = True
                            boat.race_start_time = current_time_s
                            boat.lap_start_time = current_time_s
                            boat.next_buoy_index = 0
                        elif boat.current_lap >= total_laps and boat.next_buoy_index >= num_course_buoys:
                            if not boat.is_finished:
                                boat.is_finished = True
                                boat.finish_time = current_time_s - boat.race_start_time

            all_players_finished = all(p.is_finished for p in players)
            if all_players_finished:
                game_state = GameState.RACE_RESULTS
                race_results = [{'boat': b, 'time': b.finish_time if b.is_finished else float('inf'), 'laps': b.lap_times} for b in all_boats]
                race_results.sort(key=lambda x: x['time'])
                for i, result in enumerate(race_results):
                    points = POINTS_AWARDED[i] if i < len(POINTS_AWARDED) else 0
                    result['boat'].score += points

        # =====================================================================================
        # --- DRAWING ---
        # =====================================================================================
        screen.fill(DARK_BLUE)
        if game_state == GameState.SETUP:
            title_surf = title_font.render("Game Setup", True, WHITE)
            screen.blit(title_surf, (CENTER_X - title_surf.get_width()//2, SCREEN_HEIGHT * 0.1))
            
            p_title_surf = font.render("Players:", True, WHITE)
            screen.blit(p_title_surf, (CENTER_X - p_title_surf.get_width()//2, SCREEN_HEIGHT * 0.18))
            draw_button(screen, p1_button_rect, "1 Player", button_font, BUTTON_COLOR if num_players != 1 else BUTTON_HOVER_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
            draw_button(screen, p2_button_rect, "2 Players", button_font, BUTTON_COLOR if num_players != 2 else BUTTON_HOVER_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
            
            laps_text = f"Laps: {selected_laps}"
            laps_surf = font.render(laps_text, True, WHITE)
            screen.blit(laps_surf, (CENTER_X - 70 - laps_surf.get_width()//2, SCREEN_HEIGHT * 0.28))
            draw_button(screen, laps_minus_rect, "-", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
            draw_button(screen, laps_plus_rect, "+", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)

            races_text = f"Races: {selected_races}"
            races_surf = font.render(races_text, True, WHITE)
            screen.blit(races_surf, (CENTER_X + 70 - races_surf.get_width()//2, SCREEN_HEIGHT * 0.28))
            draw_button(screen, races_minus_rect, "-", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
            draw_button(screen, races_plus_rect, "+", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
            
            draw_button(screen, start_button_rect, "Start Series", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)

        elif game_state == GameState.RACING or game_state == GameState.PAUSED:
            race_info_pack = {
                'wind_speed': wind_speed, 'wind_dir': wind_direction,
                'current_race': current_race, 'total_races': total_races,
                'total_laps': total_laps
            }

            if num_players == 1:
                render_view(screen, player1_boat, players, ai_boats, sandbars, buoys, START_FINISH_LINE, depth_map_surface, main_wave_layers, wave_offsets, wind_direction, dt, font, lap_font, race_info_pack)
                draw_map(screen, player1_boat, ai_boats, sandbars, buoys, player1_boat.next_buoy_index, START_FINISH_LINE, MAP_RECT_P1, WORLD_BOUNDS, players)
            else:
                viewport_height = SCREEN_HEIGHT // 2
                top_viewport = screen.subsurface(pygame.Rect(0, 0, SCREEN_WIDTH, viewport_height))
                bottom_viewport = screen.subsurface(pygame.Rect(0, viewport_height, SCREEN_WIDTH, viewport_height))

                render_view(top_viewport, player1_boat, players, ai_boats, sandbars, buoys, START_FINISH_LINE, depth_map_surface, main_wave_layers, wave_offsets, wind_direction, dt, font, lap_font, race_info_pack)
                render_view(bottom_viewport, player2_boat, players, ai_boats, sandbars, buoys, START_FINISH_LINE, depth_map_surface, main_wave_layers, wave_offsets, wind_direction, dt, font, lap_font, race_info_pack)

                pygame.draw.line(screen, BLACK, (0, viewport_height), (SCREEN_WIDTH, viewport_height), 3)
                
                draw_map(screen, player1_boat, ai_boats, sandbars, buoys, player1_boat.next_buoy_index, START_FINISH_LINE, MAP_RECT_P1, WORLD_BOUNDS, players)
                draw_map(screen, player2_boat, ai_boats, sandbars, buoys, player2_boat.next_buoy_index, START_FINISH_LINE, MAP_RECT_P2, WORLD_BOUNDS, players)

            draw_wind_gauge(screen, wind_direction, WIND_GAUGE_POS, WIND_GAUGE_RADIUS, lap_font)

            if game_state == GameState.PAUSED:
                draw_pause_menu(screen, title_font)


        elif game_state in [GameState.RACE_RESULTS, GameState.SERIES_END]:
            if game_state == GameState.RACE_RESULTS:
                title_surf = title_font.render(f"Race {current_race} of {total_races} Results", True, WHITE)
                screen.blit(title_surf, (CENTER_X - title_surf.get_width()//2, 20))
                col1_x, col2_x = 50, SCREEN_WIDTH // 2 + 50
                y_offset, y_offset2 = 80, 80

                results_title_surf = font.render("Race Results:", True, WHITE)
                screen.blit(results_title_surf, (col1_x, y_offset)); y_offset += 30
                for i, result in enumerate(race_results):
                    boat, time, laps = result['boat'], result['time'], result['laps']
                    points = POINTS_AWARDED[i] if i < len(POINTS_AWARDED) else 0
                    rank_surf = lap_font.render(f"{i+1}. {boat.name} - {format_time(time)} (+{points} pts)", True, boat.color)
                    screen.blit(rank_surf, (col1_x + 20, y_offset)); y_offset += 25
                    for j, l_time in enumerate(laps):
                        lap_time_surf = lap_font.render(f"    Lap {j+1}: {format_time(l_time)}", True, GRAY)
                        screen.blit(lap_time_surf, (col1_x + 30, y_offset)); y_offset += 20
                    y_offset += 5

                standings_title_surf = font.render("Series Standings:", True, WHITE)
                screen.blit(standings_title_surf, (col2_x, y_offset2)); y_offset2 += 30
                sorted_standings = sorted(all_boats, key=lambda b: b.score, reverse=True)
                for i, boat in enumerate(sorted_standings):
                    rank_surf = lap_font.render(f"{i+1}. {boat.name} - {boat.score} points", True, boat.color)
                    screen.blit(rank_surf, (col2_x + 20, y_offset2)); y_offset2 += 25
                
                button_text = "Next Race" if current_race < total_races else "Final Results"
                draw_button(screen, MAIN_MENU_BUTTON_RECT, button_text, button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
            else: # SERIES_END
                title_surf = title_font.render("Final Series Standings", True, WHITE)
                screen.blit(title_surf, (CENTER_X - title_surf.get_width()//2, 50))
                y_offset = 150
                sorted_standings = sorted(all_boats, key=lambda b: b.score, reverse=True)
                for i, boat in enumerate(sorted_standings):
                    rank_surf = font.render(f"{i+1}. {boat.name} - {boat.score} points", True, boat.color)
                    screen.blit(rank_surf, (CENTER_X - rank_surf.get_width() // 2, y_offset))
                    y_offset += 40
                draw_button(screen, MAIN_MENU_BUTTON_RECT, "Main Menu", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
                draw_button(screen, EXIT_END_SCREEN_BUTTON_RECT, "Exit to Desktop", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)

        pygame.display.flip()

    pygame.quit()

if __name__ == '__main__':
    main()
