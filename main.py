# main.py

import pygame
import random
import math
from enum import Enum, auto

from constants import *
from utils import *
from entities import Boat, Buoy, AIBoat, SailingStyle
from course import generate_random_buoys, generate_random_sandbars
from graphics import draw_scrolling_water, draw_map, draw_button, create_wave_layer

class GameState(Enum):
    SERIES_SETUP = auto()
    RACING = auto()
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
        
        # Normalize collision vector
        nx = dx / dist
        ny = dy / dist

        # Push boats apart
        boat1.world_x -= nx * overlap * 0.5
        boat1.world_y -= ny * overlap * 0.5
        boat2.world_x += nx * overlap * 0.5
        boat2.world_y += ny * overlap * 0.5

        # Reduce speed
        boat1.speed *= BOAT_COLLISION_SPEED_REDUCTION
        boat2.speed *= BOAT_COLLISION_SPEED_REDUCTION

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
    player_boat = Boat(CENTER_X, CENTER_Y, name="Player", boat_color=WHITE)
    ai_boats = []
    sandbars = []
    buoys = []
    course_buoys_coords = []
    course_buoy_list_start_index = 2

    # UI Elements
    start_button_rect = pygame.Rect(CENTER_X - SETUP_BUTTON_WIDTH // 2, SCREEN_HEIGHT * 0.7, SETUP_BUTTON_WIDTH, SETUP_BUTTON_HEIGHT)
    laps_minus_rect = pygame.Rect(CENTER_X - 100 - LAP_BUTTON_SIZE, SCREEN_HEIGHT * 0.45, LAP_BUTTON_SIZE, LAP_BUTTON_SIZE)
    laps_plus_rect = pygame.Rect(CENTER_X - 40, SCREEN_HEIGHT * 0.45, LAP_BUTTON_SIZE, LAP_BUTTON_SIZE)
    races_minus_rect = pygame.Rect(CENTER_X + 40, SCREEN_HEIGHT * 0.45, LAP_BUTTON_SIZE, LAP_BUTTON_SIZE)
    races_plus_rect = pygame.Rect(CENTER_X + 100, SCREEN_HEIGHT * 0.45, LAP_BUTTON_SIZE, LAP_BUTTON_SIZE)
    next_race_button_rect = pygame.Rect(CENTER_X - SETUP_BUTTON_WIDTH // 2, SCREEN_HEIGHT * 0.85, SETUP_BUTTON_WIDTH, SETUP_BUTTON_HEIGHT)

    # Game State Variables
    game_state = GameState.SERIES_SETUP
    selected_laps = DEFAULT_RACE_LAPS
    selected_races = 1
    total_laps = selected_laps
    total_races = selected_races
    current_race = 0
    current_lap = 0
    next_buoy_index = -1
    lap_times = []
    lap_start_time = 0.0
    total_race_start_time = 0.0
    race_started = False
    race_finished = False
    final_total_time = 0.0
    race_results = []
    player_finish_time_s = None
    race_end_timer_started = False


    # Other Variables
    wind_speed = random.uniform(MIN_WIND_SPEED, MAX_WIND_SPEED)
    wind_direction = random.uniform(0, 360)
    last_wind_update = pygame.time.get_ticks()
    world_offset_x = 0.0
    world_offset_y = 0.0
    wave_layers = [create_wave_layer(SCREEN_WIDTH + 100, SCREEN_HEIGHT + 100, WAVE_DENSITY * (i+1)) for i in range(NUM_WAVE_LAYERS)]
    wave_offsets = [[0.0, 0.0] for _ in range(NUM_WAVE_LAYERS)]
    
    all_boats = [player_boat]
    
    def start_new_series():
        nonlocal total_races, total_laps, current_race, all_boats
        total_laps = selected_laps
        total_races = selected_races
        current_race = 1
        
        player_boat.score = 0
        ai_boats.clear()
        available_colors = AI_BOAT_COLORS[:]
        for i in range(NUM_AI_BOATS):
            color = random.choice(available_colors) if available_colors else GRAY
            if color in available_colors: available_colors.remove(color)
            ai_boats.append(AIBoat(0, 0, f"AI {i+1}", random.choice(list(SailingStyle)), color))
        all_boats = [player_boat] + ai_boats
        for boat in all_boats:
            boat.score = 0
        start_new_race()

    def start_new_race():
        nonlocal race_started, race_finished, next_buoy_index
        nonlocal lap_times, final_total_time, wind_direction
        nonlocal player_finish_time_s, race_end_timer_started, current_lap
        nonlocal course_buoys_coords, sandbars, buoys

        print(f"--- Starting Race {current_race}/{total_races} ---")
        
        # Generate new course for the race
        wind_direction = random.uniform(0, 360)
        course_buoys_coords = generate_random_buoys(NUM_COURSE_BUOYS)
        sandbars = generate_random_sandbars(NUM_SANDBARS, course_buoys_coords)
        buoys = []
        buoys.append(Buoy(START_FINISH_LINE[0][0], START_FINISH_LINE[0][1], -1, is_gate=True))
        buoys.append(Buoy(START_FINISH_LINE[1][0], START_FINISH_LINE[1][1], -1, is_gate=True))
        for i, (bx, by) in enumerate(course_buoys_coords):
            buoys.append(Buoy(bx, by, i))

        # Reset race state for all boats
        for i, boat in enumerate(all_boats):
            boat.reset_position()
            start_x = -150 - (i * 25)
            start_y = random.uniform(-100, 100)
            boat.world_x, boat.world_y = start_x, start_y
            boat.last_line_crossing_time = -LINE_CROSSING_DEBOUNCE
            if isinstance(boat, AIBoat):
                boat.is_finished = False
                boat.race_started = False
                boat.lap_times = []
                boat.finish_time = 0
                boat.current_lap = 1
                boat.next_buoy_index = -1

        # Reset player-specific race vars
        race_started = False
        race_finished = False
        current_lap = 1
        next_buoy_index = -1
        lap_times = []
        final_total_time = 0.0
        player_finish_time_s = None
        race_end_timer_started = False


    # --- Main Loop ---
    running = True
    while running:
        current_time_s = pygame.time.get_ticks() / 1000.0
        dt = clock.tick(60) / 1000.0
        dt = min(dt, 0.1)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            if game_state == GameState.SERIES_SETUP:
                if not buoys: # Generate a preview course if one doesn't exist
                    wind_direction = random.uniform(0, 360)
                    course_buoys_coords = generate_random_buoys(NUM_COURSE_BUOYS)
                    sandbars = generate_random_sandbars(NUM_SANDBARS, course_buoys_coords)
                    buoys.append(Buoy(START_FINISH_LINE[0][0], START_FINISH_LINE[0][1], -1, is_gate=True))
                    buoys.append(Buoy(START_FINISH_LINE[1][0], START_FINISH_LINE[1][1], -1, is_gate=True))
                    for i, (bx, by) in enumerate(course_buoys_coords):
                        buoys.append(Buoy(bx, by, i))

                if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    if laps_minus_rect.collidepoint(event.pos): selected_laps = max(1, selected_laps - 1)
                    elif laps_plus_rect.collidepoint(event.pos): selected_laps = min(10, selected_laps + 1)
                    elif races_minus_rect.collidepoint(event.pos): selected_races = max(1, selected_races - 1)
                    elif races_plus_rect.collidepoint(event.pos): selected_races = min(10, selected_races + 1)
                    elif start_button_rect.collidepoint(event.pos):
                        start_new_series()
                        game_state = GameState.RACING
            elif game_state == GameState.RACING:
                if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    if WIND_BUTTON_RECT.collidepoint(event.pos):
                        wind_direction = random.uniform(0, 360)
                        last_wind_update = pygame.time.get_ticks()
            elif game_state in [GameState.RACE_RESULTS, GameState.SERIES_END]:
                 if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                     if next_race_button_rect.collidepoint(event.pos):
                         if game_state == GameState.RACE_RESULTS:
                             if current_race < total_races:
                                 current_race += 1
                                 start_new_race()
                                 game_state = GameState.RACING
                             else:
                                 game_state = GameState.SERIES_END
                         elif game_state == GameState.SERIES_END:
                             game_state = GameState.SERIES_SETUP
                             buoys.clear() # Clear course for new setup


        if game_state == GameState.SERIES_SETUP:
            pass # Logic is now event-driven or handled in the drawing section

        elif game_state == GameState.RACING:
            keys = pygame.key.get_pressed()
            if keys[pygame.K_LEFT]: player_boat.turn(-1)
            elif keys[pygame.K_RIGHT]: player_boat.turn(1)
            if keys[pygame.K_UP]: player_boat.trim_sail(-1)
            elif keys[pygame.K_DOWN]: player_boat.trim_sail(1)

            current_ticks = pygame.time.get_ticks()
            if current_ticks - last_wind_update > WIND_UPDATE_INTERVAL:
                interval_secs = (current_ticks - last_wind_update) / 1000.0
                speed_change = random.uniform(-WIND_SPEED_CHANGE_RATE, WIND_SPEED_CHANGE_RATE) * interval_secs
                wind_speed = max(MIN_WIND_SPEED, min(MAX_WIND_SPEED, wind_speed + speed_change))
                dir_change = random.uniform(-WIND_DIR_CHANGE_RATE, WIND_DIR_CHANGE_RATE) * interval_secs
                wind_direction = normalize_angle(wind_direction + dir_change)
                last_wind_update = current_ticks

            # --- Update all boats ---
            for boat in all_boats:
                if isinstance(boat, AIBoat):
                     boat.ai_update(wind_speed, wind_direction, course_buoys_coords, START_FINISH_LINE, dt)
                else:
                    boat.update(wind_speed, wind_direction, dt)
                
                boat.on_sandbar = False
                boat_world_rect = boat.get_world_collision_rect()
                for sandbar in sandbars:
                    if boat_world_rect.colliderect(sandbar.rect):
                        boat.on_sandbar = True
                        break

            # --- Boat Collisions ---
            for i in range(len(all_boats)):
                for j in range(i + 1, len(all_boats)):
                    handle_boat_collision(all_boats[i], all_boats[j])
            
            world_offset_x = player_boat.world_x
            world_offset_y = player_boat.world_y

            # --- AI Race Progression ---
            for ai in ai_boats:
                if ai.is_finished: continue
                ai_pos = (ai.world_x, ai.world_y)
                ai_prev_pos = (ai.prev_world_x, ai.prev_world_y)
                num_course_buoys = len(course_buoys_coords)

                if ai.race_started and ai.next_buoy_index < num_course_buoys:
                    current_course_buoy = buoys[course_buoy_list_start_index + ai.next_buoy_index]
                    if distance_sq(ai_pos, (current_course_buoy.world_x, current_course_buoy.world_y)) < BUOY_ROUNDING_RADIUS**2:
                        ai.next_buoy_index += 1
                        if ai.next_buoy_index >= num_course_buoys:
                            lap_time = current_time_s - ai.lap_start_time
                            ai.lap_times.append(lap_time)
                            if ai.current_lap < total_laps:
                                ai.current_lap += 1
                                ai.next_buoy_index = 0
                                ai.lap_start_time = current_time_s

                if current_time_s - ai.last_line_crossing_time > LINE_CROSSING_DEBOUNCE:
                    if check_line_crossing(ai_prev_pos, ai_pos, START_FINISH_LINE[0], START_FINISH_LINE[1]):
                        ai.last_line_crossing_time = current_time_s
                        if not ai.race_started:
                            ai.race_started = True
                            ai.race_start_time = current_time_s
                            ai.lap_start_time = current_time_s
                            ai.next_buoy_index = 0
                        elif ai.current_lap >= total_laps and ai.next_buoy_index >= num_course_buoys:
                            if not ai.is_finished:
                                ai.is_finished = True
                                ai.finish_time = current_time_s - ai.race_start_time

            # --- Player Race Progression ---
            if not race_finished:
                boat_pos = (player_boat.world_x, player_boat.world_y)
                boat_prev_pos = (player_boat.prev_world_x, player_boat.prev_world_y)
                num_course_buoys = len(course_buoys_coords)

                if race_started and next_buoy_index >= 0 and next_buoy_index < num_course_buoys:
                    current_course_buoy = buoys[course_buoy_list_start_index + next_buoy_index]
                    if distance_sq(boat_pos, (current_course_buoy.world_x, current_course_buoy.world_y)) < BUOY_ROUNDING_RADIUS**2:
                        next_buoy_index += 1
                        if next_buoy_index >= num_course_buoys:
                            lap_time = current_time_s - lap_start_time
                            lap_times.append(lap_time)
                            if current_lap < total_laps:
                                current_lap += 1
                                next_buoy_index = 0
                                lap_start_time = current_time_s

                if current_time_s - player_boat.last_line_crossing_time > LINE_CROSSING_DEBOUNCE:
                    if check_line_crossing(boat_prev_pos, boat_pos, START_FINISH_LINE[0], START_FINISH_LINE[1]):
                        player_boat.last_line_crossing_time = current_time_s
                        if not race_started:
                            race_started = True
                            lap_times = []
                            current_lap = 1
                            next_buoy_index = 0
                            total_race_start_time = current_time_s
                            lap_start_time = current_time_s
                        elif race_started and current_lap >= total_laps and next_buoy_index >= num_course_buoys:
                            if not race_finished:
                                race_finished = True
                                final_total_time = current_time_s - total_race_start_time
                                player_finish_time_s = current_time_s
                                race_end_timer_started = True
            
            # --- End of Race Transition Logic ---
            all_ai_finished = all(b.is_finished for b in ai_boats)
            timer_expired = race_end_timer_started and (current_time_s - player_finish_time_s >= 20)

            if race_finished and (all_ai_finished or timer_expired):
                if timer_expired:
                    num_course_buoys = len(course_buoys_coords)
                    for ai in ai_boats:
                        if not ai.is_finished:
                            buoys_remaining = (total_laps * num_course_buoys) - ((ai.current_lap - 1) * num_course_buoys + ai.next_buoy_index)
                            penalty = buoys_remaining * 10 
                            ai.finish_time = final_total_time + 20 + penalty
                            ai.is_finished = True
                
                game_state = GameState.RACE_RESULTS
                race_results = [{'boat': player_boat, 'time': final_total_time, 'laps': lap_times}]
                for ai in ai_boats:
                    race_results.append({'boat': ai, 'time': ai.finish_time, 'laps': ai.lap_times})
                
                race_results.sort(key=lambda x: x['time'])

                for i, result in enumerate(race_results):
                    points = POINTS_AWARDED[i] if i < len(POINTS_AWARDED) else 0
                    result['boat'].score += points


        # =====================================================================================
        # --- DRAWING ---
        # =====================================================================================
        screen.fill(BLUE)
        if game_state == GameState.SERIES_SETUP:
            title_surf = title_font.render("Race Series Setup", True, WHITE)
            screen.blit(title_surf, (CENTER_X - title_surf.get_width()//2, SCREEN_HEIGHT * 0.1))
            
            laps_text = f"Laps: {selected_laps}"
            laps_surf = font.render(laps_text, True, WHITE)
            screen.blit(laps_surf, (CENTER_X - 70 - laps_surf.get_width()//2, SCREEN_HEIGHT * 0.35))
            draw_button(screen, laps_minus_rect, "-", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
            draw_button(screen, laps_plus_rect, "+", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)

            races_text = f"Races: {selected_races}"
            races_surf = font.render(races_text, True, WHITE)
            screen.blit(races_surf, (CENTER_X + 70 - races_surf.get_width()//2, SCREEN_HEIGHT * 0.35))
            draw_button(screen, races_minus_rect, "-", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
            draw_button(screen, races_plus_rect, "+", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
            
            draw_button(screen, start_button_rect, "Start Series", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
            if sandbars or buoys:
                draw_map(screen, player_boat, ai_boats, sandbars, buoys, -1, START_FINISH_LINE, MAP_RECT, WORLD_BOUNDS)

        elif game_state == GameState.RACING:
            draw_scrolling_water(screen, wave_layers, wave_offsets, deg_to_rad(wind_direction), dt)
            player_boat.draw_wake(screen, world_offset_x, world_offset_y)

            for ai in ai_boats:
                ai_screen_x = int(ai.world_x - world_offset_x + CENTER_X)
                ai_screen_y = int(ai.world_y - world_offset_y + CENTER_Y)
                ai.screen_x = ai_screen_x
                ai.screen_y = ai_screen_y
                ai.rotate_and_position()
                ai.draw(screen)
                ai.draw_wake(screen, world_offset_x, world_offset_y)
            
            for sandbar in sandbars:
                sandbar.draw(screen, world_offset_x, world_offset_y)

            sf_p1_screen = (int(START_FINISH_LINE[0][0] - world_offset_x + CENTER_X), int(START_FINISH_LINE[0][1] - world_offset_y + CENTER_Y))
            sf_p2_screen = (int(START_FINISH_LINE[1][0] - world_offset_x + CENTER_X), int(START_FINISH_LINE[1][1] - world_offset_y + CENTER_Y))
            pygame.draw.line(screen, START_FINISH_LINE_COLOR, sf_p1_screen, sf_p2_screen, START_FINISH_WIDTH)

            for i, buoy in enumerate(buoys):
                 is_next_course_buoy = race_started and not race_finished and i >= course_buoy_list_start_index and (i - course_buoy_list_start_index) == next_buoy_index
                 buoy.draw(screen, world_offset_x, world_offset_y, is_next_course_buoy)

            player_boat.draw(screen)

            wind_rad = deg_to_rad(wind_direction)
            arrow_len = 30 + wind_speed * 5
            arrow_end_x = 50 + math.cos(wind_rad) * arrow_len
            arrow_end_y = 50 + math.sin(wind_rad) * arrow_len
            pygame.draw.line(screen, RED, (50, 50), (arrow_end_x, arrow_end_y), 3)
            pygame.draw.circle(screen, RED, (50, 50), 5)
            draw_button(screen, WIND_BUTTON_RECT, "Random Wind", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
            speed_text = font.render(f"Speed: {player_boat.speed:.1f}", True, WHITE)
            screen.blit(speed_text, (10, SCREEN_HEIGHT - 60))
            sail_text = font.render(f"Sail Trim: {player_boat.sail_angle_rel:.0f} (Vis: {player_boat.visual_sail_angle_rel:.0f})", True, WHITE)
            screen.blit(sail_text, (10, SCREEN_HEIGHT - 35))
            wind_text = font.render(f"Wind: {wind_speed:.1f} @ {wind_direction:.0f} deg", True, WHITE)
            screen.blit(wind_text, (10, 10))
            eff_text = font.render(f"Effectiveness: {player_boat.wind_effectiveness:.2f}", True, WHITE)
            screen.blit(eff_text, (SCREEN_WIDTH - 200, SCREEN_HEIGHT - 85))
            opt_text = font.render(f"Optimal Trim: {player_boat.optimal_sail_trim:.0f}", True, WHITE)
            screen.blit(opt_text, (SCREEN_WIDTH - 200, SCREEN_HEIGHT - 60))

            race_info_text = f"Race {current_race}/{total_races} - Lap: {current_lap}/{total_laps}" if race_started else f"Race {current_race}/{total_races} - Cross Start Line"
            lap_text = font.render(race_info_text, True, WHITE)
            screen.blit(lap_text, (CENTER_X - lap_text.get_width() // 2, 10))
            next_buoy_text = ""
            num_course_buoys = len(course_buoys_coords)
            if race_started and not race_finished:
                if next_buoy_index < num_course_buoys:
                    next_buoy_text = f"Next Buoy: {next_buoy_index + 1}"
                else:
                    next_buoy_text = "To Finish Line"
            next_buoy_surf = font.render(next_buoy_text, True, NEXT_BUOY_INDICATOR_COLOR)
            screen.blit(next_buoy_surf, (CENTER_X - next_buoy_surf.get_width() // 2, 40))

            total_time_str = "00:00.00"
            current_lap_str = "00:00.00"
            if race_started and not race_finished:
                total_time_val = current_time_s - total_race_start_time
                current_lap_val = current_time_s - lap_start_time
                total_time_str = format_time(total_time_val)
                current_lap_str = format_time(current_lap_val)

            total_time_text = font.render(f"Total: {total_time_str}", True, WHITE)
            screen.blit(total_time_text, (SCREEN_WIDTH - 200, SCREEN_HEIGHT - 35))
            cur_lap_time_text = font.render(f"Lap: {current_lap_str}", True, WHITE)
            screen.blit(cur_lap_time_text, (SCREEN_WIDTH - 380, SCREEN_HEIGHT - 35))

            y_lap_offset = 10
            for i, l_time in enumerate(reversed(lap_times)):
                if i >= 3: break
                lap_num = len(lap_times) - i
                lap_time_surf = lap_font.render(f"Lap {lap_num}: {format_time(l_time)}", True, GRAY)
                screen.blit(lap_time_surf, (SCREEN_WIDTH - lap_time_surf.get_width() - 10, SCREEN_HEIGHT - 100 - y_lap_offset))
                y_lap_offset += 25

            num_course_buoys = len(course_buoys_coords)
            map_next_buoy_highlight_index = course_buoy_list_start_index + next_buoy_index if race_started and next_buoy_index < num_course_buoys else -1
            draw_map(screen, player_boat, ai_boats, sandbars, buoys, map_next_buoy_highlight_index, START_FINISH_LINE, MAP_RECT, WORLD_BOUNDS)

        elif game_state == GameState.RACE_RESULTS:
            title_surf = title_font.render(f"Race {current_race} of {total_races} Results", True, WHITE)
            screen.blit(title_surf, (CENTER_X - title_surf.get_width()//2, 20))

            # Display Race Results and Series Standings side-by-side
            col1_x = 50
            col2_x = SCREEN_WIDTH // 2 + 50
            y_offset = 80
            y_offset2 = y_offset

            # Column 1: Race Results
            results_title_surf = font.render("Race Results:", True, WHITE)
            screen.blit(results_title_surf, (col1_x, y_offset)); y_offset += 30
            for i, result in enumerate(race_results):
                boat = result['boat']
                points = POINTS_AWARDED[i] if i < len(POINTS_AWARDED) else 0
                rank_surf = lap_font.render(f"{i+1}. {boat.name} - {format_time(result['time'])} (+{points} pts)", True, boat.color)
                screen.blit(rank_surf, (col1_x + 20, y_offset)); y_offset += 25
                for j, l_time in enumerate(result['laps']):
                    lap_time_surf = lap_font.render(f"    Lap {j+1}: {format_time(l_time)}", True, GRAY)
                    screen.blit(lap_time_surf, (col1_x + 30, y_offset)); y_offset += 20
                y_offset += 5


            # Column 2: Series Standings
            standings_title_surf = font.render("Series Standings:", True, WHITE)
            screen.blit(standings_title_surf, (col2_x, y_offset2)); y_offset2 += 30
            
            sorted_standings = sorted(all_boats, key=lambda b: b.score, reverse=True)
            for i, boat in enumerate(sorted_standings):
                rank_surf = lap_font.render(f"{i+1}. {boat.name} - {boat.score} points", True, boat.color)
                screen.blit(rank_surf, (col2_x + 20, y_offset2)); y_offset2 += 25
            
            button_text = "Next Race" if current_race < total_races else "Final Results"
            draw_button(screen, next_race_button_rect, button_text, button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)

        elif game_state == GameState.SERIES_END:
            title_surf = title_font.render("Final Series Standings", True, WHITE)
            screen.blit(title_surf, (CENTER_X - title_surf.get_width()//2, 50))
            
            y_offset = 150
            sorted_standings = sorted(all_boats, key=lambda b: b.score, reverse=True)
            for i, boat in enumerate(sorted_standings):
                rank_surf = font.render(f"{i+1}. {boat.name} - {boat.score} points", True, boat.color)
                screen.blit(rank_surf, (CENTER_X - rank_surf.get_width() // 2, y_offset))
                y_offset += 40

            draw_button(screen, next_race_button_rect, "Start New Series", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)


        pygame.display.flip()

    pygame.quit()

if __name__ == '__main__':
    main()