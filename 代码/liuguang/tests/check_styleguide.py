"""Check both candidate editions against the same question without network or user data."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[3]
page_file = root / "代码/liuguang/styleguide/index.html"
shots = root / "docs/design/screenshots/M0"
shots.mkdir(parents=True, exist_ok=True)
chrome = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.getenv("CHROME_BIN") or (str(chrome) if chrome.exists() else None))
    for width in (375, 768, 1440):
        page = browser.new_page(viewport={"width": width, "height": 900}, device_scale_factor=1)
        page.goto(page_file.as_uri())
        for theme in ("a", "b"):
            page.locator(f'input[value={theme}]').check()
            reason = page.locator(".reason")
            if not reason.get_attribute("open") == "":
                reason.locator("summary").focus()
                page.keyboard.press("Enter")
            assert reason.get_by_text("修过你问的课程").is_visible()
            assert page.evaluate("document.documentElement.scrollWidth === innerWidth")
            assert page.locator("main").get_attribute("data-is-sample") == "true"
            # Resolve actual foreground and ancestor background after switching the edition.
            problems = page.evaluate("""() => {
              const l=c=>c.match(/[0-9.]+/g).slice(0,3).map(Number).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((v,x,i)=>v+x*[.2126,.7152,.0722][i],0);
              return [...document.querySelectorAll('body *')].filter(e=>e.checkVisibility() && [...e.childNodes].some(n=>n.nodeType===3 && n.textContent.trim())).filter(e=>{
                const s=getComputedStyle(e);let b=e;while(b && getComputedStyle(b).backgroundColor==='rgba(0, 0, 0, 0)') b=b.parentElement;
                const a=l(s.color),d=l(b?getComputedStyle(b).backgroundColor:'rgb(255,255,255)');
                return parseFloat(s.fontSize)<14 || (Math.max(a,d)+.05)/(Math.min(a,d)+.05)<4.5;
              }).map(e=>e.textContent.trim().slice(0,30));
            }""")
            assert not problems, (theme, width, problems)
            page.locator("h1").click()
            page.screenshot(path=str(shots / f"{theme.upper()}-{width}.png"), full_page=True)
        page.close()
    browser.close()
print("PASS: both editions, three widths, sample identity, keyboard disclosure, no overflow, font sizes and contrast.")
