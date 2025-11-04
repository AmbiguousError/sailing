
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto("http://localhost:8080")
        await page.click("#start-series")
        await page.wait_for_function("() => raceState === 'running'")

        # Simulate finishing the first race
        await page.evaluate("""() => {
            player1Boat.finishTime = performance.now();
            player1Boat.isFinished = true;
            aiBoats[0].finishTime = performance.now() + 1000;
            aiBoats[0].isFinished = true;
            aiBoats[1].finishTime = performance.now() + 2000;
            aiBoats[1].isFinished = true;
            aiBoats[2].isFinished = false; // DNF
            displayRaceResults();
        }""")
        await page.wait_for_selector("#race-finished", state="visible", timeout=5000)
        await page.screenshot(path="series_race_1.png")

        await page.click("#restart-race")
        await page.wait_for_function("() => raceState === 'running'")

        # Simulate finishing the second race
        await page.evaluate("""() => {
            player1Boat.finishTime = performance.now() + 2000;
            player1Boat.isFinished = true;
            aiBoats[0].finishTime = performance.now() + 1000;
            aiBoats[0].isFinished = true;
            aiBoats[1].finishTime = performance.now();
            aiBoats[1].isFinished = true;
            aiBoats[2].finishTime = performance.now() + 3000;
            aiBoats[2].isFinished = true;
            displayRaceResults();
        }""")
        await page.wait_for_selector("#race-finished", state="visible", timeout=5000)
        await page.screenshot(path="series_race_2.png")

        await browser.close()

asyncio.run(main())
