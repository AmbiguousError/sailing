import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto("http://localhost:8080")

        # Start a single-lap race
        await page.select_option("#laps-select", "1")
        await page.click("#start-race")

        # Wait for the race to start
        await page.wait_for_selector("#countdown", state="hidden")
        await asyncio.sleep(1) # a little buffer

        # Directly trigger the race finished state
        await page.evaluate("() => { raceState = 'finished'; displayRaceResults(); }")

        # Wait for the results screen to appear
        await page.wait_for_selector("#race-finished", state="visible")

        # Take a screenshot of the results screen
        await page.screenshot(path="results_screen_verify.png")
        await browser.close()

asyncio.run(main())
