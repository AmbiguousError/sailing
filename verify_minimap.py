import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto("http://localhost:8080")
        await page.click("#start-race")
        await asyncio.sleep(4)  # Wait for the race to start
        await page.screenshot(path="minimap_fix_verify.png")
        await browser.close()

asyncio.run(main())
