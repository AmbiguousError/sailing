# Dinghy Sailing Race

Welcome to Dinghy Sailing Race! This is a 2D sailing simulation game built with Pygame where you navigate a dinghy around a randomly generated course, competing to get the best race time. Manage your sail trim, use the wind to your advantage, avoid sandbars, and round the buoys to complete laps.

## Features

* **Realistic Sailing Mechanics:**
    * Control boat heading with the rudder.
    * Trim your sail to catch the wind effectively.
    * Experience boat acceleration based on wind power and sail trim.
    * Boat drag and momentum are simulated.
    * Optimal sail trim indicator to help maximize speed.
    * Inability to sail directly into the wind (no-go zone).
* **Dynamic Environment:**
    * Variable wind speed and direction that changes over time.
    * Manually trigger a random wind change during a race.
    * Randomly generated sandbar obstacles that significantly slow you down.
    * Scrolling water effect with animated wave layers.
* **Race Course & Progression:**
    * Randomly generated courses with a specified number of buoys.
    * Clear start/finish line.
    * Multi-lap races (configurable from 1 to 10 laps).
    * Next buoy indication on screen and map.
    * Lap timing and total race time tracking.
* **User Interface:**
    * **Setup Screen:** Configure the number of laps and preview the generated course on a minimap.
    * **Racing HUD:**
        * Boat speed.
        * Sail trim angle (actual and visual).
        * Wind speed and direction indicator.
        * Sail wind effectiveness percentage.
        * Optimal sail trim angle suggestion.
        * Current lap, total laps, next buoy information.
        * Current lap time and total race time.
        * Display of previous lap times.
    * **Minimap:** Shows boat position, sandbars, all buoys (with the next one highlighted), and the start/finish line within the world.
    * **Finished Screen:** Displays total race time and a summary of all lap times.
* **Visuals:**
    * Animated boat with a curving sail that responds to wind and trim.
    * Wake particles trailing the boat.

## How to Play

### Goal
The goal is to complete the set number of laps around the buoy-marked course as quickly as possible.

### Controls
* **Turn Left:** `LEFT ARROW` or `A` key
* **Turn Right:** `RIGHT ARROW` or `D` key
* **Trim Sail In (sheet in):** `UP ARROW` or `W` key
* **Trim Sail Out (ease sheet):** `DOWN ARROW` or `S` key
* **Mouse:** Used for interacting with buttons in the Setup, Racing (Random Wind), and Finished screens.

### Game Flow
1.  **Setup:**
    * When the game starts, you'll be on the "Race Setup" screen.
    * Choose the number of laps for the race using the `+` and `-` buttons.
    * A random course with sandbars and buoys will be generated and shown on the minimap.
    * Click "Start Race" to begin.
2.  **Racing:**
    * Your boat starts near the start/finish line. You must cross the line to officially start the first lap.
    * Sail your boat by controlling the rudder (turning) and sail trim.
    * Navigate towards the currently indicated "Next Buoy". Buoys must be rounded in sequential order. The next buoy will be highlighted on the main screen and the minimap.
    * After rounding all course buoys, head back to the start/finish line to complete the lap.
    * If you hit a sandbar, your boat will slow down considerably.
    * You can click the "Random Wind" button to change the wind conditions immediately.
3.  **Finished:**
    * Once all laps are completed, the "Race Finished!" screen will appear.
    * It displays your total race time and a list of all your lap times.
    * Click "New Race Setup" to return to the setup screen and start a new race.

### Key Sailing Concepts
* **Wind Direction:** Indicated by an arrow on the screen. You cannot sail directly into the wind.
* **Sail Trim:**
    * Adjust your sail angle relative to the wind to generate power.
    * The "Optimal Trim" value on the HUD suggests the best sail angle for your current heading relative to the wind. Try to match your "Sail Trim" to this value.
    * "Effectiveness" shows how well your current sail trim is capturing the wind. 1.00 is optimal.
* **Points of Sail:** How your boat behaves depends on its angle to the wind. Sailing across the wind (reaching) or slightly away from it (running) is generally fastest. Sailing towards the wind (beating) requires tacking (turning through the wind).
* **Buoys:** These mark the course. Round them in the correct order. The game will tell you which buoy is next.
* **Start/Finish Line:** This line, marked by two gate buoys, must be crossed to start the race, complete each lap, and finish the race.

## Running the Game

### Executable (Recommended)
An executable version of the game, `sail.exe`, is available in the `dist` folder. Simply run this file to play the game.

### From Source
If you wish to run the game from the Python source code:
1.  Ensure you have Python installed on your system.
2.  Install the Pygame library:
    ```bash
    pip install pygame
    ```
3.  Navigate to the directory containing `sail.py` and run the script:
    ```bash
    python sail.py
    ```

Enjoy the race!