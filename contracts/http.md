# 学生连接 HTTP 契约

机器可读的输入约束在 [schemas.ts](schemas.ts)。服务端写操作用这些 zod 模式校验。前端按下面的路径和字段调用，不把浏览器存储当作登录或权限。

本地没有 `DATABASE_URL` 时，服务用 PGlite 执行同一份 Postgres 迁移：`src/server/db/migrations/0001_init.sql`。设置 `postgres://` 或 `postgresql://` 的 `DATABASE_URL` 时走 Postgres。表、检查约束和触发器以迁移文件为准，Drizzle 模式只用于查询。

账号若由合成样本邀请码 `M1-SAMPLE` 注册，`isSample` 为 true。正式环境（`NODE_ENV=production`）拒绝这个邀请码。

## 会话

登录成功后设置 `lg_session`，HttpOnly、SameSite=Lax。之后的请求带上这枚 cookie。未登录访问需要登录的接口返回 `401 unauthenticated`。

## 账号、同意和画像

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 邀请码、邮箱、密码、称呼，以及年龄、隐私、测试三项同意 |
| POST | `/api/auth/login` | 邮箱和密码 |
| POST | `/api/auth/logout` | 使当前会话失效 |
| GET | `/api/me` | 当前账号。含邮箱和私人备注 |
| PUT | `/api/profile` | 保存画像，并确保学校加专业的社区存在 |
| GET | `/api/profiles/:id` | 别人可见的画像 |

公开字段：`displayName`、`school`、`major`、`stage`、`publicBio`、`willingToHelp`、`isSample`。`stage` 只能是 `行前准备`、`在读`、`校友`。

`GET /api/profiles/:id` 不返回 `privateNote`，也不返回 `email`。这两项只出现在本人的 `GET /api/me`。

同意写入 `consents`，版本号 `m1-2026-11-28`，种类为 `age_18`、`privacy`、`test_participation`。

## 同校同专业、问答

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/people` | 与 `/api/matches` 相同 |
| GET | `/api/matches` | 按当前用户的学校和专业做精确筛选 |
| GET | `/api/questions` | 只返回自己社区里的问题和回答 |
| POST | `/api/questions` | 发布问题 |
| POST | `/api/questions/:id/answers` | 回答。不在同一社区则 404 |
| POST | `/api/answers/:id/helpful` | 只有提问者可以标记有帮助 |

`/api/matches` 的查询字符串不能改学校或专业。响应里的 `source` 在未配置模型时是 `rules`，`label` 写明这不是模型推荐。

## 邀请和消息

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/invitations` | 自己发出或收到的邀请 |
| POST | `/api/invitations` | `{ toAccountId, note }` |
| POST | `/api/invitations/:id/accept` | 只有接收方可以接受 |
| POST | `/api/invitations/:id/reject` | 只有接收方可以拒绝 |
| GET | `/api/invitations/:id/messages` | 参与者读取。`canPost` 表示能否发消息 |
| POST | `/api/invitations/:id/messages` | 参与者发消息 |

约束：

- 不能邀请自己：`400 cannot_invite_self`
- 只能邀请同校同专业：`403 different_community`
- 同一方向已有等待中的邀请：`409 invitation_already_pending`
- 已拒绝的邀请再接受：`409 invitation_rejected`。数据库触发器 `invitations_freeze_decision` 同时阻止把已决定的邀请改成另一种状态
- 已接受的邀请再接受：`409 invitation_already_accepted`
- 未接受就发消息，包括已拒绝：`403 messages_require_acceptance`。触发器 `messages_require_accepted` 同时阻止插入
- 不是参与者：`404 not_found`
- 发送方不能代替对方接受或拒绝：`403 forbidden`

## 通知和规则整理

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/notifications` | 站内通知 |
| POST | `/api/notifications/read` | 全部标成已读 |
| GET | `/api/assistant/status` | `mode` 为 `rules` 或 `model` |
| POST | `/api/assistant/profile-hints` | 从「学校：」「专业：」和阶段用词整理画像 |

没有同时配置 `MODEL_BASE_URL`、`MODEL_NAME`、`MODEL_API_KEY` 时，整理结果的 `source` 是 `rules`，文案写明不是模型输出。三项都配置时才请求兼容 OpenAI 的 `/chat/completions`。请求失败则退回规则，并且仍然标明不是模型输出。测试和本地默认不配置这三项，因此不会发出模型请求。

## 留到后面的接口

`GET` 和 `POST /api/experience-cards`，以及 `/api/experience-cards/review`，现在返回 `501 reserved`。说明见 [经验卡片和匹配设计](../docs/design/m1-reserved-endpoints.md)。

## 错误

失败响应为 `{ "error": "机器可读代码", "message": "给人看的说明" }`。校验失败是 `400 invalid_input`。
