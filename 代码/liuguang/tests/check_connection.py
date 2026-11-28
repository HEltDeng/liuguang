"""Two independent browser sessions for the server-backed connection path."""
import json
import os
import socket
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[3]
shots = root / "docs/design/screenshots/M1"
shots.mkdir(parents=True, exist_ok=True)
log_path = root / "test-results" / "connection-server.log"
log_path.parent.mkdir(parents=True, exist_ok=True)


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def browser_args():
    path = os.getenv("CHROME_BIN")
    if not path:
        for candidate in (
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/google-chrome",
        ):
            if Path(candidate).exists():
                path = candidate
                break
    launch = {}
    if path:
        launch["executable_path"] = path
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        launch["args"] = ["--no-sandbox", "--disable-dev-shm-usage"]
    return launch


def wait_until_up(base, proc, log):
    deadline = time.time() + 90
    while time.time() < deadline:
        if proc.poll() is not None:
            break
        try:
            with urllib.request.urlopen(base + "/api/health", timeout=2) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(0.4)
    log.flush()
    raise SystemExit(log_path.read_text()[-4000:])


def show(page, fragment):
    page.goto(base + "/connect/" + fragment)
    page.reload()


def register(page, email, name):
    page.get_by_role("heading", name="用邀请码进入").wait_for()
    page.get_by_label("邀请码").fill("M1-SAMPLE")
    page.get_by_label("邮箱", exact=True).fill(email)
    page.get_by_label("密码", exact=True).fill("sample-pass-1")
    page.get_by_label("怎么称呼你").fill(name)
    page.get_by_role("checkbox", name="我已满 18 周岁").check()
    page.get_by_role("checkbox", name="我同意隐私说明").check()
    page.get_by_role("checkbox", name="我同意参加这次封闭测试").check()
    page.get_by_role("button", name="注册并进入").click()
    page.get_by_role("heading", name="我的画像").wait_for()


def save_profile(page, school, major, stage, private_note, willing):
    page.get_by_label("学校", exact=True).fill(school)
    page.get_by_label("专业", exact=True).fill(major)
    page.get_by_label("阶段").select_option(stage)
    page.get_by_label("公开介绍").fill("合成样本的公开介绍")
    page.get_by_label("只有自己可见的备注").fill(private_note)
    box = page.get_by_role("checkbox", name="愿意回答同学的问题")
    if willing:
        box.check()
    else:
        box.uncheck()
    page.get_by_role("button", name="保存画像").click()
    page.get_by_role("heading", name="同校同专业").wait_for()


def readable(page):
    problems = page.evaluate("""() => {
      const l = c => c.match(/[0-9.]+/g).slice(0,3).map(Number).map(x => x / 255).map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4).reduce((v, x, i) => v + x * [.2126, .7152, .0722][i], 0);
      return [...document.querySelectorAll('body *')].filter(e => e.checkVisibility() && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())).filter(e => {
        const s = getComputedStyle(e);
        let b = e;
        while (b && getComputedStyle(b).backgroundColor === 'rgba(0, 0, 0, 0)') b = b.parentElement;
        const a = l(s.color), d = l(b ? getComputedStyle(b).backgroundColor : 'rgb(255,255,255)');
        return parseFloat(s.fontSize) < 14 || (Math.max(a, d) + .05) / (Math.min(a, d) + .05) < 4.5;
      }).map(e => e.textContent.trim().slice(0, 40) + ' ' + getComputedStyle(e).fontSize + ' ' + getComputedStyle(e).color);
    }""")
    assert not problems, problems
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")


port = free_port()
base = f"http://127.0.0.1:{port}"
env = os.environ.copy()
env["PORT"] = str(port)
env["HOST"] = "127.0.0.1"
env["PGLITE_DIR"] = tempfile.mkdtemp(prefix="liuguang-m1-")
env["NODE_ENV"] = "development"
env.pop("DATABASE_URL", None)
env.pop("MODEL_BASE_URL", None)
env.pop("MODEL_API_KEY", None)
env.pop("MODEL_NAME", None)
log = log_path.open("w")
proc = subprocess.Popen(["node", "src/server/index.ts"], cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT)
try:
    wait_until_up(base, proc, log)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(**browser_args())
        errors = []
        lin = browser.new_context(viewport={"width": 375, "height": 812})
        zhou = browser.new_context(viewport={"width": 375, "height": 812})
        pa = lin.new_page()
        pb = zhou.new_page()
        pa.on("pageerror", lambda error: errors.append(str(error)))
        pb.on("pageerror", lambda error: errors.append(str(error)))
        pa.goto(base + "/")
        pa.get_by_role("link", name="服务端双人连接").click()
        pa.get_by_role("heading", name="用邀请码进入").wait_for()
        register(pa, "linxiao@sample.liuguang.test", "林晓")
        save_profile(pa, "伦敦大学学院", "计算机科学", "行前准备", "仅林晓可见的航班备注", False)
        pb.goto(base + "/connect/")
        register(pb, "zhou@sample.liuguang.test", "周宁")
        save_profile(pb, "伦敦大学学院", "计算机科学", "在读", "仅周宁可见的私人备注", True)
        chen = browser.new_context()
        created = chen.request.post(
            base + "/api/auth/register",
            headers={"content-type": "application/json"},
            data=json.dumps({
                "inviteCode": "M1-SAMPLE",
                "email": "chen@sample.liuguang.test",
                "password": "sample-pass-1",
                "displayName": "陈可",
                "ageConfirmed": True,
                "privacyConsent": True,
                "testConsent": True,
            }),
        )
        assert created.status == 201, created.text()
        saved = chen.request.put(
            base + "/api/profile",
            headers={"content-type": "application/json"},
            data=json.dumps({
                "displayName": "陈可",
                "school": "爱丁堡大学",
                "major": "计算机科学",
                "stage": "在读",
                "publicBio": "另一所学校的合成样本",
                "privateNote": "仅陈可可见的公寓门禁",
                "willingToHelp": True,
            }),
        )
        assert saved.status == 200, saved.text()
        pa.goto(base + "/connect/#people")
        pa.reload()
        pa.get_by_role("heading", name="同校同专业").wait_for()
        pa.get_by_text("不是模型推荐").wait_for()
        body = pa.locator("main").inner_text()
        assert "周宁" in body, body
        assert "陈可" not in body
        assert "仅林晓可见" not in body
        assert "仅周宁可见" not in body
        assert "仅陈可可见" not in body
        assert "@sample.liuguang.test" not in body
        assert "合成样本" in body
        pa.goto(base + "/connect/#invites")
        pa.get_by_text("还没有邀请").wait_for()
        pa.goto(base + "/connect/#questions")
        pa.get_by_text("还没有问题").wait_for()
        pa.get_by_label("问题标题").fill("第一学期的编程作业")
        pa.get_by_label("想问的具体内容").fill("要先读作业说明，还是先装工具？")
        pa.get_by_role("button", name="发布问题").focus()
        pa.keyboard.press("Enter")
        pa.get_by_role("heading", name="第一学期的编程作业").wait_for()
        pb.goto(base + "/connect/#questions")
        pb.get_by_label("你的回答").fill("先把作业说明读完，再决定要装什么。")
        pb.get_by_role("button", name="写下回答").click()
        pb.get_by_text("先把作业说明读完，再决定要装什么。").wait_for()
        pa.goto(base + "/connect/#people")
        pa.get_by_label("给周宁的邀请说明").fill("想问第一学期的编程作业")
        pa.get_by_role("button", name="向周宁发送交流邀请").click()
        pa.get_by_role("link", name="打开和周宁的对话（等待对方回复）").click()
        pa.get_by_label("消息").fill("还没接受就想发消息")
        pa.get_by_role("button", name="发送消息").click()
        pa.get_by_role("alert").filter(has_text="接受邀请之后才能发消息").wait_for()
        pa.screenshot(path=str(shots / "message-blocked-375.png"), full_page=True)
        pb.goto(base + "/connect/#invites")
        pb.get_by_role("button", name="拒绝邀请").click()
        pb.locator("[data-status=rejected]").wait_for()
        assert pb.locator("[data-status=rejected]").get_by_role("button", name="接受邀请").count() == 0
        rejected_id = pb.locator("[data-status=rejected]").get_attribute("data-invite")
        rejected = pb.request.post(base + f"/api/invitations/{rejected_id}/accept")
        assert rejected.status == 409
        assert rejected.json()["error"] == "invitation_rejected"
        show(pa, "#people")
        pa.get_by_label("给周宁的邀请说明").fill("再约一次，想听你怎么读作业说明")
        pa.get_by_role("button", name="向周宁发送交流邀请").click()
        show(pb, "#invites")
        pb.get_by_role("button", name="接受邀请").click()
        pb.get_by_text("已接受", exact=True).wait_for()
        accepted_id = pb.locator("[data-status=accepted]").get_attribute("data-invite")
        duplicate = pb.request.post(base + f"/api/invitations/{accepted_id}/accept")
        assert duplicate.status == 409
        assert duplicate.json()["error"] == "invitation_already_accepted"
        show(pa, "#invites")
        pa.get_by_role("link", name="打开和周宁的对话（已接受）").click()
        pa.get_by_label("消息").fill("现在可以聊作业说明了")
        pa.get_by_role("button", name="发送消息").click()
        pa.get_by_text("现在可以聊作业说明了").wait_for()
        show(pb, f"#messages/{accepted_id}")
        pb.get_by_text("现在可以聊作业说明了").wait_for()
        pb.get_by_label("消息").fill("可以，我按自己的学期说。")
        pb.get_by_role("button", name="发送消息").click()
        pb.get_by_text("可以，我按自己的学期说。").wait_for()
        show(pa, "#people")
        pa.get_by_role("heading", name="同校同专业").wait_for()
        for width, name in ((375, "people-375.png"), (768, "people-768.png"), (1440, "people-1440.png")):
            pa.set_viewport_size({"width": width, "height": 900})
            readable(pa)
            pa.screenshot(path=str(shots / name), full_page=True)
        assert not errors, errors
        browser.close()
finally:
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
    log.close()
print("PASS: two sessions, discovery, Q&A, reject, duplicate accept, message permission, private fields, 375/768/1440.")
