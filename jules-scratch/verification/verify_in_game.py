from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto('http://localhost:8000')
        page.click('#single-race-btn')
        page.wait_for_timeout(1000) # Wait for the game to start
        page.screenshot(path='jules-scratch/verification/in_game.png')
        browser.close()

run()
