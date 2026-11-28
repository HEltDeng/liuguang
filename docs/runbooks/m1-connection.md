# M1 双人连接

本地没有 Docker 和 Postgres。服务默认用 PGlite 执行 `src/server/db/migrations/0001_init.sql`，数据在 `.data/pglite`。这是 Postgres 迁移，不是另一套表结构。要换成 Postgres，在环境里设置 `DATABASE_URL=postgres://...` 后再执行下面的命令。

不要配置 `MODEL_BASE_URL`、`MODEL_NAME`、`MODEL_API_KEY`，除非明确要调用兼容 OpenAI 的接口。未配置时，画像整理和同校筛选走规则，页面会写明不是模型输出。

## 启动

在仓库根目录：

```sh
pnpm install --frozen-lockfile
pnpm start
```

浏览器打开 http://127.0.0.1:8765/ 。探索页有「服务端双人连接」。样张仍在 http://127.0.0.1:8765/styleguide/ 。

`pnpm start` 会在非生产环境放入合成邀请码 `M1-SAMPLE`。它不会自动创建账号。

## 两个合成账号

```sh
pnpm seed
```

| 邮箱 | 密码 | 画像 |
|---|---|---|
| linxiao@sample.liuguang.test | sample-pass-lin | 林晓，伦敦大学学院，计算机科学，行前准备 |
| zhou@sample.liuguang.test | sample-pass-zhou | 周宁，伦敦大学学院，计算机科学，在读，愿意回答 |

两个账号都标着 `isSample`。私人备注分别是「合成样本：林晓的私人备注」和「合成样本：周宁的私人备注」，只有本人的「我的画像」能看到。

也可以不用种子账号，在两个浏览器里用邀请码 `M1-SAMPLE` 各自注册。测试期要勾选已满 18 周岁。

## 走一遍

1. 林晓登录，确认画像。
2. 周宁登录，确认画像。
3. 林晓打开「同校同专业」，应看到周宁，看不到周宁的私人备注。
4. 林晓发布一个问题，周宁写下回答。
5. 林晓发送交流邀请。在对方接受前发送消息，页面应显示「接受邀请之后才能发消息」。
6. 周宁拒绝后，这条邀请不能再接受。可以再发一条新邀请。
7. 周宁接受新邀请。同一条不能接受第二次。之后双方可以发消息。

## 测试

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm check:ui
pnpm build
pnpm test:e2e
```

`pnpm test` 包含服务端权限测试。`pnpm test:e2e` 会先构建离线演示，再跑原来的演示和样张，然后用两个独立浏览器会话跑 `代码/liuguang/tests/check_connection.py`。

只跑双人浏览器回归：

```sh
python3 代码/liuguang/tests/check_connection.py
```

需要已安装的 Playwright，以及 Chrome 或 Playwright 自带的 Chromium。根目录可用 `CHROME_BIN` 指向浏览器。
