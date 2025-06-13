# Dinghy Sailing Race

Welcome to Dinghy Sailing Race! This is a 2D sailing simulation game built with Pygame where you navigate a dinghy around a randomly generated course. Compete against a fleet of AI opponents to get the best race time by managing your sail trim, using the wind to your advantage, avoiding sandbars, and rounding the buoys to complete laps.

## Features

### Core Sailing Mechanics
* **Realistic Physics:**
    * Control boat heading with the rudder.
    * Trim your sail to catch the wind effectively.
    * Experience boat acceleration based on wind power and sail trim.
    * Boat drag and momentum are simulated.
    * Inability to sail directly into the wind (no-go zone).
* **Dynamic Environment:**
    * Variable wind speed and direction that changes over time.
    * Randomly generated sandbar obstacles that significantly slow you down.
* **Visuals:**
    * Scrolling water effect with animated wave layers.
    * Animated boat with a curving sail that responds to wind and trim.
    * Wake particles trailing the boat.

### AI & Gameplay
* **AI Opponents:** Race against a fleet of AI-controlled boats in every race.
* **Varied AI Sailing Styles:** Each AI is randomly assigned a personality (`PERFECTIONIST`, `AGGRESSIVE`, `CAUTIOUS`, or `ERRATIC`), affecting their skill, decision-making, and sailing lines.
* **Individual Boat Colors:** AI boats are given unique colors to make them easily distinguishable from the player and each other.
* **Proper Race Rules:** All boats, including AI, must cross the start/finish line to begin the race and to complete each lap.

### Race Course & Progression
* **Randomly Generated Courses:** Every race features a new, randomly generated course with a specified number of buoys.
* **Multi-Lap Races:** Configure races from 1 to 10 laps.
* **Lap & Race Timing:** The game tracks and displays individual lap times and the total race time.
* **Clear Progression:** The next buoy is clearly indicated on both the main screen and the minimap.

### User Interface
* **Setup Screen:** Configure the number of laps and players before starting.
* **Racing HUD:**
    * Boat speed and sail trim info.
    * Wind speed and a shared direction gauge.
    * Sail wind effectiveness and optimal trim suggestion.
    * Current lap, total laps, and next buoy information.
    * Lap timers and total race time.
* **Split-Screen & Minimaps:** In two-player mode, the screen splits horizontally, and each player gets their own dedicated minimap.
* **Finished Screen:** Displays total race time and a summary of all lap times for all competitors.

## How to Play

### Goal
The goal is to complete the set number of laps around the buoy-marked course faster than your opponents.

### Controls

**Player 1:**
* **Turn Left/Right:** `LEFT` / `RIGHT` ARROW keys
* **Trim Sail In/Out:** `UP` / `DOWN` ARROW keys

**Player 2:**
* **Turn Left/Right:** `A` / `D` keys
* **Trim Sail In/Out:** `W` / `S` keys

**UI Interaction:**
* **Mouse:** Used for interacting with buttons on menus.

### Game Flow
1.  **Setup:**
    * When the game starts, you'll be on the "Game Setup" screen.
    * Choose between 1 or 2 players.
    * Set the number of laps and races for the series.
    * Click "Start Series" to begin.
2.  **Racing:**
    * Your boat(s) and the AI boats will start near the start/finish line. You must cross the line to officially start the first lap.
    * Sail your boat by controlling the rudder and sail trim.
    * Navigate towards the currently indicated "Next Buoy". Buoys must be rounded in sequential order.
    * After rounding all course buoys, head back to and cross the start/finish line to complete the lap.
    * If you hit a sandbar, your boat will slow down considerably. The sandbars are rendered as submerged, so watch out!
3.  **Finished:**
    * Once all human players have completed their laps, the "Race Results" screen will appear.
    * It displays the final times and points awarded for the race, along with current series standings.
    * Click the button to proceed to the next race or to the final results screen.

## Running the Game

### From an Executable
If you have created an executable (e.g., `main.exe`):
* Simply run this file to play the game.

### From Source Code
If you wish to run the game from the Python source code:
1.  Ensure you have Python installed on your system.
2.  Install the Pygame library:
    ```bash
    pip install pygame
    ```
3.  Navigate to the directory containing all the project files (`main.py`, `entities.py`, etc.).
4.  Run the main script:
    ```bash
    python main.py
    ```

Enjoy the race!
