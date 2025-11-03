
import re
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:8083/")

    # Start the race
    page.get_by_role("button", name="Start Race").click()

    # Wait for the race to start
    page.wait_for_selector('#countdown:text("3")')
    page.wait_for_selector('#countdown:text("2")')
    page.wait_for_selector('#countdown:text("1")')
    page.wait_for_selector('#countdown', state='hidden')

    # Let the race run for a bit
    page.wait_for_timeout(2000)

    # Force the player to pass a buoy
    page.evaluate("""
        const buoyToPass = buoys[player1Boat.nextBuoyIndex];
        player1Boat.worldX = buoyToPass.worldX;
        player1Boat.worldY = buoyToPass.worldY;
        update(0.1);
    """)

    # Take a screenshot
    page.screenshot(path="jules-scratch/verification/buoy_highlighting.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
