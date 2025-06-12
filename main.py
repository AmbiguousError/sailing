# main.py

import pygame
import random
from enum import Enum, auto

from constants import *
from utils import *
from entities import Boat, Buoy, AIBoat, SailingStyle
from course import generate_random_buoys, generate_random_sandbars
from graphics import draw_scrolling_water, draw_map, draw_button, create_wave_layer

class GameState(Enum):
    SETUP = auto()
    RACING = auto()
    FINISHED = auto()

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
    player_boat = Boat(CENTER_X, CENTER_Y, boat_color=WHITE)
    ai_boats = []
    sandbars = []
    buoys = []
    course_buoys_coords = []
    course_buoy_list_start_index = 2

    # UI Elements
    start_button_rect = pygame.Rect(CENTER_X - SETUP_BUTTON_WIDTH // 2, SCREEN_HEIGHT * 0.6, SETUP_BUTTON_WIDTH, SETUP_BUTTON_HEIGHT)
    laps_minus_rect = pygame.Rect(CENTER_X - 60 - LAP_BUTTON_SIZE, SCREEN_HEIGHT * 0.45, LAP_BUTTON_SIZE, LAP_BUTTON_SIZE)
    laps_plus_rect = pygame.Rect(CENTER_X + 60, SCREEN_HEIGHT * 0.45, LAP_BUTTON_SIZE, LAP_BUTTON_SIZE)
    new_race_button_rect = pygame.Rect(CENTER_X - SETUP_BUTTON_WIDTH // 2, SCREEN_HEIGHT * 0.7, SETUP_BUTTON_WIDTH, SETUP_BUTTON_HEIGHT)

    # Game State Variables
    game_state = GameState.SETUP
    selected_laps = DEFAULT_RACE_LAPS
    total_laps = selected_laps
    current_lap = 0
    next_buoy_index = -1
    lap_times = []
    lap_start_time = 0.0
    total_race_start_time = 0.0
    race_started = False
    race_finished = False
    last_line_crossing_time = -LINE_CROSSING_DEBOUNCE
    final_total_time = 0.0

    # Other Variables
    wind_speed = random.uniform(MIN_WIND_SPEED, MAX_WIND_SPEED)
    wind_direction = random.uniform(0, 360)
    last_wind_update = pygame.time.get_ticks()
    world_offset_x = 0.0
    world_offset_y = 0.0
    wave_layers = [create_wave_layer(SCREEN_WIDTH + 100, SCREEN_HEIGHT + 100, WAVE_DENSITY * (i+1)) for i in range(NUM_WAVE_LAYERS)]
    wave_offsets = [[0.0, 0.0] for _ in range(NUM_WAVE_LAYERS)]
    course_generated = False

    # --- Main Loop ---
    running = True
    while running:
        current_time_s = pygame.time.get_ticks() / 1000.0
        dt = clock.tick(60) / 1000.0
        dt = min(dt, 0.1)

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            if game_state == GameState.SETUP:
                if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    if laps_minus_rect.collidepoint(event.pos):
                        selected_laps = max(1, selected_laps - 1)
                    elif laps_plus_rect.collidepoint(event.pos):
                        selected_laps = min(10, selected_laps + 1)
                    elif start_button_rect.collidepoint(event.pos):
                        game_state = GameState.RACING
                        total_laps = selected_laps
                        current_lap = 0
                        next_buoy_index = -1
                        lap_times = []
                        race_started = False
                        race_finished = False
                        last_line_crossing_time = -LINE_CROSSING_DEBOUNCE
                        player_boat.reset_position()

                        ai_boats.clear()
                        available_colors = AI_BOAT_COLORS[:]
                        for i in range(NUM_AI_BOATS):
                            start_x = -50 - (i * 25)
                            start_y = random.uniform(-100, 100)
                            style = random.choice(list(SailingStyle))
                            color = random.choice(available_colors) if available_colors else GRAY
                            if color in available_colors: available_colors.remove(color)
                            ai_boats.append(AIBoat(start_x, start_y, style, color))
                            print(f"Created AI Boat {i+1} with style: {style.name}, Color: {color}")

                        world_offset_x = player_boat.world_x
                        world_offset_y = player_boat.world_y
                        course_generated = False
                        print(f"Starting Race: {total_laps} Laps")
            elif game_state == GameState.RACING:
                if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                    if WIND_BUTTON_RECT.collidepoint(event.pos):
                        wind_direction = random.uniform(0, 360)
                        last_wind_update = pygame.time.get_ticks()
                        print(f"Wind direction randomized to: {wind_direction:.1f}")
            elif game_state == GameState.FINISHED:
                 if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1:
                     if new_race_button_rect.collidepoint(event.pos):
                         game_state = GameState.SETUP
                         sandbars = []
                         buoys = []
                         course_buoys_coords = []
                         course_generated = False

        if game_state == GameState.SETUP:
            if not course_generated:
                print("Generating new course...")
                course_buoys_coords = generate_random_buoys(NUM_COURSE_BUOYS)
                sandbars = generate_random_sandbars(NUM_SANDBARS, course_buoys_coords)
                buoys = []
                buoys.append(Buoy(START_FINISH_LINE[0][0], START_FINISH_LINE[0][1], -1, is_gate=True))
                buoys.append(Buoy(START_FINISH_LINE[1][0], START_FINISH_LINE[1][1], -1, is_gate=True))
                for i, (bx, by) in enumerate(course_buoys_coords):
                    buoys.append(Buoy(bx, by, i))
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
                wind_direction = normalize_angle(wind_direction + dir_change)
                last_wind_update = current_ticks

            # --- AI Update Loop ---
            for ai in ai_boats:
                ai.ai_update(wind_speed, wind_direction, course_buoys_coords, START_FINISH_LINE, dt)
                ai.on_sandbar = False
                ai_world_rect = ai.get_world_collision_rect()
                for sandbar in sandbars:
                    if ai_world_rect.colliderect(sandbar.rect):
                        ai.on_sandbar = True
                        break
                
                # AI Race Progression
                if not ai.is_finished:
                    ai_pos = (ai.world_x, ai.world_y)
                    ai_prev_pos = (ai.prev_world_x, ai.prev_world_y)
                    
                    # Buoy rounding
                    if ai.race_started and ai.next_buoy_index < len(course_buoys_coords):
                        target_buoy_pos = course_buoys_coords[ai.next_buoy_index]
                        if distance_sq(ai_pos, target_buoy_pos) < BUOY_ROUNDING_RADIUS**2:
                            ai.next_buoy_index += 1

                    # Line crossing
                    if current_time_s - ai.last_line_crossing_time > LINE_CROSSING_DEBOUNCE:
                        if check_line_crossing(ai_prev_pos, ai_pos, START_FINISH_LINE[0], START_FINISH_LINE[1]):
                            ai.last_line_crossing_time = current_time_s
                            if not ai.race_started:
                                ai.race_started = True
                                ai.current_lap = 1
                                ai.next_buoy_index = 0
                            elif ai.next_buoy_index >= len(course_buoys_coords):
                                if ai.current_lap >= total_laps:
                                    ai.is_finished = True
                                else:
                                    ai.current_lap += 1
                                    ai.next_buoy_index = 0
            
            # --- Player Update ---
            player_boat.on_sandbar = False
            boat_world_rect = player_boat.get_world_collision_rect()
            for sandbar in sandbars:
                if boat_world_rect.colliderect(sandbar.rect):
                    player_boat.on_sandbar = True
                    break

            player_boat.update(wind_speed, wind_direction, dt)
            world_offset_x = player_boat.world_x
            world_offset_y = player_boat.world_y

            # --- Player Race Progression ---
            if not race_finished:
                boat_pos = (player_boat.world_x, player_boat.world_y)
                boat_prev_pos = (player_boat.prev_world_x, player_boat.prev_world_y)
                num_course_buoys = len(course_buoys_coords)

                # Buoy rounding
                if race_started and next_buoy_index >= 0 and next_buoy_index < num_course_buoys:
                    current_course_buoy = buoys[course_buoy_list_start_index + next_buoy_index]
                    if distance_sq(boat_pos, (current_course_buoy.world_x, current_course_buoy.world_y)) < BUOY_ROUNDING_RADIUS**2:
                        print(f"Player rounded Buoy {next_buoy_index + 1}")
                        next_buoy_index += 1

                # Line crossing
                if current_time_s - last_line_crossing_time > LINE_CROSSING_DEBOUNCE:
                    if check_line_crossing(boat_prev_pos, boat_pos, START_FINISH_LINE[0], START_FINISH_LINE[1]):
                        print("Player crossed Start/Finish Line")
                        last_line_crossing_time = current_time_s
                        if not race_started:
                            race_started = True
                            current_lap = 1
                            next_buoy_index = 0
                            lap_start_time = current_time_s
                            total_race_start_time = current_time_s
                            lap_times = []
                            print("Race Started!")
                        elif next_buoy_index >= num_course_buoys:
                            lap_time = current_time_s - lap_start_time
                            lap_times.append(lap_time)
                            print(f"Lap {current_lap} finished: {format_time(lap_time)}")
                            if current_lap >= total_laps:
                                race_finished = True
                                final_total_time = current_time_s - total_race_start_time
                                print(f"Race Finished! Total Time: {format_time(final_total_time)}")
                                game_state = GameState.FINISHED
                            else:
                                current_lap += 1
                                next_buoy_index = 0
                                lap_start_time = current_time_s
                                print(f"Starting Lap {current_lap}")

        screen.fill(BLUE)
        if game_state == GameState.SETUP:
            title_surf = title_font.render("Race Setup", True, WHITE)
            screen.blit(title_surf, (CENTER_X - title_surf.get_width()//2, SCREEN_HEIGHT * 0.1))
            laps_text = f"Laps: {selected_laps}"
            laps_surf = font.render(laps_text, True, WHITE)
            screen.blit(laps_surf, (CENTER_X - laps_surf.get_width()//2, SCREEN_HEIGHT * 0.45))
            draw_button(screen, laps_minus_rect, "-", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
            draw_button(screen, laps_plus_rect, "+", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
            draw_button(screen, start_button_rect, "Start Race", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)
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

            lap_display = f"Lap: {current_lap}/{total_laps}" if race_started else "Cross Start Line"
            lap_text = font.render(lap_display, True, WHITE)
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

        elif game_state == GameState.FINISHED:
             title_surf = title_font.render("Race Finished!", True, WHITE)
             screen.blit(title_surf, (CENTER_X - title_surf.get_width()//2, SCREEN_HEIGHT * 0.1))
             total_time_surf = font.render(f"Total Time: {format_time(final_total_time)}", True, WHITE)
             screen.blit(total_time_surf, (CENTER_X - total_time_surf.get_width()//2, SCREEN_HEIGHT * 0.3))
             y_lap_offset = SCREEN_HEIGHT * 0.4
             for i, l_time in enumerate(lap_times):
                 lap_num = i + 1
                 lap_time_surf = lap_font.render(f"Lap {lap_num}: {format_time(l_time)}", True, WHITE)
                 screen.blit(lap_time_surf, (CENTER_X - lap_time_surf.get_width()//2, y_lap_offset))
                 y_lap_offset += 30
             draw_button(screen, new_race_button_rect, "New Race Setup", button_font, BUTTON_COLOR, BUTTON_TEXT_COLOR, BUTTON_HOVER_COLOR)

        pygame.display.flip()

    pygame.quit()

if __name__ == '__main__':
    main()