"""uv run --with playwright python 代码/liuguang/tests/check_demo.py"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

root=Path(__file__).resolve().parents[3]
demo=root/'交付成品'/'留光-伦敦站-Demo.html'
shots=root/'图片素材'/'演示截图'
shots.mkdir(parents=True, exist_ok=True)
chrome=Path('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.getenv('CHROME_BIN') or (str(chrome) if chrome.exists() else None))
    page=browser.new_page(viewport={'width':1200,'height':900},device_scale_factor=1)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(demo.as_uri())
    page.screenshot(path=str(shots/'01-探索页.png'),full_page=True)
    cases=[
        ('想先看一下伦敦地铁怎么换乘','transit'),
        ('公交车可以到校园吗','transit'),
        ('我在找图书馆的借阅入口','study'),
        ('校园里哪里能安静自习呢','study'),
        ('怎样加入大学的学生社团','clubs'),
        ('怎么找兴趣小组和新朋友','clubs'),
        ('巴黎的地铁线路',None),
        ('今晚去哪里吃火锅',None),
        ('办理签证需要什么',None),
        ('火星基地施工手册',None),
    ]
    for question,expected in cases:
        got=page.evaluate('q=>predict(q)?.id || null',question)
        assert got==expected,(question,got,expected)
    for i,r in enumerate(['transit','study','clubs']):
        page.locator(f'[data-prompt="{i}"]').click()
        assert page.locator('#results [data-ask]').count()==1
        assert page.locator('#results .out').count()>=1
    page.locator('[data-ask]').click()
    page.get_by_label('昵称').fill('演示同学')
    page.get_by_text('保存并继续').click()
    page.get_by_text('保存求助记录').click()
    page.get_by_text('演示校友视角',exact=True).click()
    page.get_by_text('回复这个问题').click()
    page.locator('#replyForm textarea').fill('可以先在学生会的社团目录里选一个感兴趣的组织。')
    page.get_by_text('保存回复',exact=True).click()
    page.get_by_text('新生视角',exact=True).click()
    page.get_by_text('有帮助',exact=True).click()
    page.reload()
    assert page.get_by_text('已反馈',exact=True).count()==1
    page.get_by_role('link',name='资源库',exact=True).click()
    page.get_by_text('＋ 贡献资源').click()
    page.get_by_label('资料标题').fill('新生自习资料')
    page.get_by_label('公开来源链接').fill('https://example.org/demo')
    page.get_by_label('适合解决什么问题').fill('测试投稿：图书馆预约学习空间')
    page.get_by_text('生成分类草稿').click()
    page.get_by_text('关闭窗口').click()
    assert page.locator('#items').get_by_text('新生自习资料').count()==0
    page.get_by_text('核对并发布').click()
    page.locator('#publish select').select_option('study')
    page.get_by_text('确认并发布到本机资源库').click()
    page.get_by_label('检索资料').fill('新生自习资料')
    assert page.locator('#items .out').get_attribute('href')=='https://example.org/demo'
    page.once('dialog',lambda d:d.accept())
    page.get_by_text('撤回',exact=True).click()
    assert page.locator('#items').get_by_text('新生自习资料').count()==0
    page.get_by_role('link',name='探索',exact=True).click()
    page.set_viewport_size({'width':390,'height':844})
    page.get_by_label('你现在想解决什么？').fill('火星基地施工手册')
    page.get_by_text('寻找资源与校友').click()
    assert page.get_by_text('暂时没有可靠匹配').is_visible()
    page.locator('[data-prompt="1"]').click()
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
    page.screenshot(path=str(shots/'02-手机匹配.png'),full_page=True)
    assert not errors,errors
    browser.close()
print('PASS: 10 classification/rejection cases; 3 suggested questions; onboarding, request, reply, feedback, persistence, contribution, moderation, search, withdrawal and mobile layout.')
