
import re
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:8081/")

    # Start the race
    page.get_by_role("button", name="Start Race").click()

    # Wait for the race to start
    page.wait_for_selector('#countdown:text("3")')
    page.wait_for_selector('#countdown:text("2")')
    page.wait_for_selector('#countdown:text("1")')
    page.wait_for_selector('#countdown', state='hidden')

    # Force the race to end by simulating the player finishing the last lap
    page.evaluate("""
        player1Boat.currentLap = 3; // MAX_LAPS
        const lastBuoyIndex = buoys.length - 1;
        player1Boat.nextBuoyIndex = lastBuoyIndex;
        const lastBuoy = buoys[lastBuoyIndex];
        player1Boat.worldX = lastBuoy.worldX;
        player1Boat.worldY = lastBuoy.worldY;
        update(0.1); // This will process the final buoy rounding and finish the race
    """)

    # Check that the race finished screen is visible and take a screenshot
    page.wait_for_selector("#race-finished", state="visible")
    page.screenshot(path="jules-scratch/verification/restart_button.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
