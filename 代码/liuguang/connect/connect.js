const app = document.querySelector("#app");
const nav = document.querySelector("#nav");
const who = document.querySelector("#who");
const state = { me: null, token: 0 };
const stages = ["行前准备", "在读", "校友"];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function button(label, className, type) {
  const node = el("button", className, label);
  node.type = type || "button";
  return node;
}
function alertBox(message) {
  const node = el("p", "banner error", message);
  node.setAttribute("role", "alert");
  node.tabIndex = -1;
  return node;
}
function field(label, control) {
  const wrap = el("label", "field");
  wrap.append(document.createTextNode(label), control);
  return wrap;
}
function input(id, type, value, max) {
  const node = document.createElement("input");
  node.id = id;
  node.type = type;
  node.value = value || "";
  if (max) node.maxLength = max;
  node.required = type !== "checkbox";
  return node;
}
function area(id, value, max) {
  const node = document.createElement("textarea");
  node.id = id;
  node.value = value || "";
  node.maxLength = max;
  node.required = true;
  return node;
}
function route() {
  const raw = location.hash.replace(/^#/, "");
  const [name, id] = raw.split("/");
  return { name: name || (state.me ? "people" : "enter"), id: id || "" };
}
async function api(path, options) {
  const opts = options || {};
  let response;
  try {
    response = await fetch(path, {
      method: opts.method || "GET",
      headers: opts.body ? { "content-type": "application/json" } : undefined,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    const error = new Error("网络没有连上，请再试一次。");
    error.code = "network";
    throw error;
  }
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    const error = new Error(data.message || "没有完成这次操作");
    error.code = data.error || "";
    throw error;
  }
  return data;
}
function shell() {
  who.textContent = state.me
    ? state.me.account.displayName +
      (state.me.account.isSample ? " · 合成样本" : "")
    : "未登录";
  nav.replaceChildren();
  if (!state.me) return;
  const current = route().name;
  for (const [href, label] of [
    ["#profile", "我的画像"],
    ["#people", "同校同专业"],
    ["#questions", "问答"],
    ["#invites", "邀请"],
    ["#messages", "消息"],
  ]) {
    const link = el("a", href.slice(1) === current ? "active" : "", label);
    link.href = href;
    if (href.slice(1) === current) link.setAttribute("aria-current", "page");
    nav.append(link);
  }
  const out = button("退出登录", "link");
  out.addEventListener("click", () => {
    void api("/api/auth/logout", { method: "POST", body: {} }).then(() => {
      state.me = null;
      location.hash = "#enter";
    });
  });
  nav.append(out);
}
async function render() {
  const token = ++state.token;
  shell();
  app.replaceChildren(el("p", "muted", "正在读取"));
  try {
    const node = await build(route());
    if (token !== state.token) return;
    app.replaceChildren(node);
  } catch (error) {
    if (token !== state.token) return;
    const box = el("div", "stack");
    box.append(alertBox(error.message || "没有读到内容"));
    const retry = button("再试一次", "secondary");
    retry.addEventListener("click", () => void render());
    box.append(retry);
    app.replaceChildren(box);
  }
}
async function build(current) {
  if (!state.me) return enterPage();
  if (current.name === "enter") {
    location.hash = state.me.profile ? "#people" : "#profile";
    return el("p", "muted", "正在打开下一页");
  }
  if (current.name === "profile") return profilePage();
  if (current.name === "people") return peoplePage();
  if (current.name === "questions") return questionsPage();
  if (current.name === "invites") return invitesPage();
  if (current.name === "messages") return messagesPage(current.id);
  location.hash = "#people";
  return el("p", "muted", "正在打开同校同专业");
}
function needProfile() {
  const box = el("div", "empty");
  box.append(
    el("h2", "", "先写好画像"),
    el("p", "", "保存学校和专业之后，才能看到同校同学、提问和发送邀请。"),
  );
  const link = el("a", "", "去填写学校和专业");
  link.href = "#profile";
  box.append(link);
  return box;
}
function enterPage() {
  const head = el("div", "pagehead");
  head.append(
    el("h1", "", "用邀请码进入"),
    el("p", "muted", "测试期只接受年满 18 周岁的同学。合成样本会标明。"),
  );
  const form = document.createElement("form");
  form.className = "panel";
  const code = input("invite", "text", "M1-SAMPLE", 32);
  const email = input("email", "email", "", 120);
  email.autocomplete = "username";
  const password = input("password", "password", "", 72);
  password.autocomplete = "new-password";
  password.required = true;
  const name = input("name", "text", "", 24);
  const age = check("我已满 18 周岁");
  const privacy = check("我同意隐私说明，知道私人备注只有自己可见");
  const test = check("我同意参加这次封闭测试");
  const submit = button("注册并进入", "primary", "submit");
  form.append(
    field("邀请码", code),
    field("邮箱", email),
    field("密码", password),
    field("怎么称呼你", name),
    age.wrap,
    privacy.wrap,
    test.wrap,
    el(
      "p",
      "muted",
      "私人备注和邮箱只有自己可见。学校、专业、阶段和公开介绍会给同校同专业的同学看到。",
    ),
    submit,
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitForm(submit, form, async () => {
      state.me = await api("/api/auth/register", {
        method: "POST",
        body: {
          inviteCode: code.value,
          email: email.value,
          password: password.value,
          displayName: name.value,
          ageConfirmed: age.input.checked,
          privacyConsent: privacy.input.checked,
          testConsent: test.input.checked,
        },
      });
      location.hash = "#profile";
    });
  });
  const login = document.createElement("form");
  login.className = "panel";
  const loginEmail = input("login-email", "email", "", 120);
  const loginPassword = input("login-password", "password", "", 72);
  const loginButton = button("登录", "secondary", "submit");
  login.append(
    el("h2", "", "已经有账号"),
    field("登录邮箱", loginEmail),
    field("登录密码", loginPassword),
    loginButton,
  );
  login.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitForm(loginButton, login, async () => {
      state.me = await api("/api/auth/login", {
        method: "POST",
        body: { email: loginEmail.value, password: loginPassword.value },
      });
      location.hash = state.me.profile ? "#people" : "#profile";
    });
  });
  const wrap = el("div", "stack");
  wrap.append(head, form, login);
  return wrap;
}
function check(label) {
  const wrap = el("label", "field check");
  const box = document.createElement("input");
  box.type = "checkbox";
  wrap.append(box, document.createTextNode(label));
  return { wrap, input: box };
}
function profilePage() {
  const profile = (state.me && state.me.profile) || {};
  const wrap = el("div", "stack");
  const head = el("div", "pagehead");
  head.append(
    el("h1", "", "我的画像"),
    el(
      "p",
      "muted",
      "学校和专业用来找同校同学。私人备注不会出现在别人的页面上。",
    ),
  );
  const hintText = area("hint-text", "", 500);
  hintText.required = false;
  const hintButton = button("按规则整理这句话", "secondary");
  const hintNote = el("p", "note");
  hintNote.hidden = true;
  const form = document.createElement("form");
  form.className = "panel";
  const name = input(
    "display-name",
    "text",
    profile.displayName || state.me.account.displayName,
    24,
  );
  const school = input("school", "text", profile.school || "", 80);
  const major = input("major", "text", profile.major || "", 80);
  const stage = document.createElement("select");
  stage.id = "stage";
  for (const item of stages) {
    const option = el("option", "", item);
    option.value = item;
    if (item === (profile.stage || "行前准备")) option.selected = true;
    stage.append(option);
  }
  const bio = area("bio", profile.publicBio || "", 280);
  bio.required = false;
  const note = area("private-note", profile.privateNote || "", 280);
  note.required = false;
  const help = check("愿意回答同学的问题");
  help.input.checked = Boolean(profile.willingToHelp);
  const save = button("保存画像", "primary", "submit");
  hintButton.addEventListener("click", () => {
    void submitForm(hintButton, wrap, async () => {
      const result = await api("/api/assistant/profile-hints", {
        method: "POST",
        body: { text: hintText.value },
      });
      if (result.fields.school) school.value = result.fields.school;
      if (result.fields.major) major.value = result.fields.major;
      if (result.fields.stage) stage.value = result.fields.stage;
      hintNote.hidden = false;
      hintNote.textContent = result.label;
    });
  });
  form.append(
    field("用一句话写学校和专业", hintText),
    hintButton,
    hintNote,
    field("怎么称呼你", name),
    field("学校", school),
    field("专业", major),
    field("阶段", stage),
    field("公开介绍", bio),
    field("只有自己可见的备注", note),
    help.wrap,
    save,
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitForm(save, form, async () => {
      const saved = await api("/api/profile", {
        method: "PUT",
        body: {
          displayName: name.value,
          school: school.value,
          major: major.value,
          stage: stage.value,
          publicBio: bio.value,
          privateNote: note.value,
          willingToHelp: help.input.checked,
        },
      });
      state.me.profile = saved.profile;
      state.me.account.displayName = saved.profile.displayName;
      location.hash = "#people";
    });
  });
  wrap.append(head, form);
  return wrap;
}
async function peoplePage() {
  let data;
  try {
    data = await api("/api/matches");
  } catch (error) {
    if (error.code === "profile_required") return needProfile();
    throw error;
  }
  const wrap = el("div", "stack");
  const head = el("div", "pagehead");
  head.append(el("h1", "", "同校同专业"), el("p", "note", data.label));
  wrap.append(head);
  if (!data.people.length) {
    wrap.append(
      el(
        "div",
        "empty",
        "还没有同校同专业的同学。把邀请码发给另一位同学，等对方保存画像。",
      ),
    );
    return wrap;
  }
  for (const person of data.people) wrap.append(personCard(person));
  return wrap;
}
function personCard(person) {
  const card = el("article", "card");
  const row = el("div", "person");
  row.append(
    el("span", "avatar", person.displayName.slice(0, 1)),
    el("h3", "", person.displayName),
  );
  card.append(
    row,
    el("p", "", person.stage + (person.willingToHelp ? " · 愿意回答问题" : "")),
  );
  if (person.publicBio) card.append(el("p", "desc", person.publicBio));
  if (person.isSample) card.append(el("span", "pill", "合成样本"));
  const form = document.createElement("form");
  const note = area("invite-" + person.id, "", 200);
  const send = button(
    "向" + person.displayName + "发送交流邀请",
    "primary",
    "submit",
  );
  form.append(field("给" + person.displayName + "的邀请说明", note), send);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitForm(send, card, async () => {
      await api("/api/invitations", {
        method: "POST",
        body: { toAccountId: person.id, note: note.value },
      });
      location.hash = "#invites";
    });
  });
  card.append(form);
  return card;
}
async function questionsPage() {
  let data;
  try {
    data = await api("/api/questions");
  } catch (error) {
    if (error.code === "profile_required") return needProfile();
    throw error;
  }
  const wrap = el("div", "stack");
  const head = el("div", "pagehead");
  head.append(
    el("h1", "", "问答"),
    el(
      "p",
      "muted",
      "问题只出现在同校同专业的社区里。把问答整理成经验卡片还没有开放。",
    ),
  );
  const form = document.createElement("form");
  form.className = "panel";
  const title = input("question-title", "text", "", 80);
  const body = area("question-body", "", 2000);
  const publish = button("发布问题", "primary", "submit");
  form.append(field("问题标题", title), field("想问的具体内容", body), publish);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitForm(publish, form, async () => {
      await api("/api/questions", {
        method: "POST",
        body: { title: title.value, body: body.value },
      });
      location.hash = "#questions";
      await render();
    });
  });
  wrap.append(head, form);
  if (!data.questions.length)
    wrap.append(
      el("div", "empty", "还没有问题。写下一个你现在想问同专业同学的问题。"),
    );
  for (const question of data.questions) wrap.append(questionCard(question));
  return wrap;
}
function questionCard(question) {
  const card = el("article", "record");
  card.append(el("h2", "", question.title), el("p", "", question.body));
  card.append(
    el(
      "p",
      "muted",
      question.author.displayName + (question.isSample ? " · 合成样本" : ""),
    ),
  );
  if (!question.answers.length) card.append(el("p", "muted", "还没有回答。"));
  for (const answer of question.answers) {
    const block = el("div", "note");
    block.append(
      el("p", "", answer.body),
      el("p", "muted", answer.author.displayName),
    );
    if (state.me.account.id === question.author.id && answer.helpful !== true) {
      const helpful = button("标记有帮助", "secondary");
      helpful.addEventListener("click", () => {
        void api("/api/answers/" + answer.id + "/helpful", {
          method: "POST",
          body: { helpful: true },
        }).then(() => render());
      });
      block.append(helpful);
    }
    if (answer.helpful === true) block.append(el("p", "", "已标记有帮助"));
    card.append(block);
  }
  const form = document.createElement("form");
  const reply = area("answer-" + question.id, "", 2000);
  const send = button("写下回答", "secondary", "submit");
  form.append(field("你的回答", reply), send);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitForm(send, card, async () => {
      await api("/api/questions/" + question.id + "/answers", {
        method: "POST",
        body: { body: reply.value },
      });
      await render();
    });
  });
  card.append(form);
  return card;
}
async function invitesPage() {
  let data;
  try {
    data = await api("/api/invitations");
  } catch (error) {
    if (error.code === "profile_required") return needProfile();
    throw error;
  }
  const notes = await api("/api/notifications");
  const wrap = el("div", "stack");
  const head = el("div", "pagehead");
  head.append(
    el("h1", "", "邀请"),
    el("p", "muted", "对方接受之后，你们才能互相发消息。"),
  );
  wrap.append(head);
  if (notes.unread)
    wrap.append(el("p", "note", "你有 " + notes.unread + " 条新通知。"));
  if (!data.invitations.length) {
    wrap.append(
      el("div", "empty", "还没有邀请。到同校同专业里，给一位同学写下来意。"),
    );
    return wrap;
  }
  for (const item of data.invitations) wrap.append(inviteCard(item));
  const read = button("通知标成已读", "link");
  read.addEventListener("click", () => {
    void api("/api/notifications/read", { method: "POST", body: {} }).then(() =>
      render(),
    );
  });
  wrap.append(read);
  return wrap;
}
function inviteCard(item) {
  const card = el("article", "record");
  card.dataset.invite = item.id;
  card.dataset.status = item.status;
  const name = item.peer ? item.peer.displayName : "同学";
  card.append(
    el("h2", "", name),
    el("p", "", item.note),
    el("p", "muted", statusText(item)),
  );
  if (item.peer && item.peer.isSample)
    card.append(el("span", "pill", "合成样本"));
  if (item.direction === "incoming" && item.status === "pending") {
    const row = el("div", "btns");
    const accept = button("接受邀请", "primary");
    const reject = button("拒绝邀请", "secondary");
    accept.addEventListener("click", () => {
      void submitForm(accept, card, async () => {
        await api("/api/invitations/" + item.id + "/accept", {
          method: "POST",
          body: {},
        });
        await render();
      });
    });
    reject.addEventListener("click", () => {
      void submitForm(reject, card, async () => {
        await api("/api/invitations/" + item.id + "/reject", {
          method: "POST",
          body: {},
        });
        await render();
      });
    });
    row.append(accept, reject);
    card.append(row);
  }
  const open = el(
    "a",
    "",
    "打开和" + name + "的对话（" + statusText(item) + "）",
  );
  open.href = "#messages/" + item.id;
  card.append(open);
  return card;
}
function statusText(item) {
  if (item.status === "accepted") return "已接受";
  if (item.status === "rejected") return "已拒绝";
  return item.direction === "incoming" ? "等待你回复" : "等待对方回复";
}
async function messagesPage(id) {
  if (!id) {
    let data;
    try {
      data = await api("/api/invitations");
    } catch (error) {
      if (error.code === "profile_required") return needProfile();
      throw error;
    }
    const wrap = el("div", "stack");
    const head = el("div", "pagehead");
    head.append(
      el("h1", "", "消息"),
      el("p", "muted", "接受邀请之后才能发消息。"),
    );
    wrap.append(head);
    const threads = data.invitations.filter(
      (item) => item.status !== "rejected",
    );
    if (!threads.length)
      wrap.append(
        el("div", "empty", "还没有可以打开的对话。先发送或接受一条邀请。"),
      );
    for (const item of threads) {
      const name = item.peer ? item.peer.displayName : "同学";
      const link = el(
        "a",
        "record",
        "打开和" + name + "的对话（" + statusText(item) + "）",
      );
      link.href = "#messages/" + item.id;
      wrap.append(link);
    }
    return wrap;
  }
  const data = await api("/api/invitations/" + id + "/messages");
  const wrap = el("div", "stack");
  const name = data.invitation.peer ? data.invitation.peer.displayName : "同学";
  const head = el("div", "pagehead");
  head.append(
    el("h1", "", "和" + name + "的对话"),
    el("p", "muted", data.invitation.note),
  );
  wrap.append(head);
  if (!data.canPost)
    wrap.append(el("p", "note", "对方接受邀请之后，这里的消息才会发出去。"));
  if (!data.messages.length) wrap.append(el("div", "empty", "还没有消息。"));
  for (const message of data.messages) {
    const block = el("article", "record");
    block.append(
      el("p", "", message.body),
      el("p", "muted", message.mine ? "我" : name),
    );
    wrap.append(block);
  }
  const form = document.createElement("form");
  form.className = "panel";
  const body = area("message-body", "", 2000);
  const send = button("发送消息", "primary", "submit");
  form.append(field("消息", body), send);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitForm(send, form, async () => {
      await api("/api/invitations/" + id + "/messages", {
        method: "POST",
        body: { body: body.value },
      });
      await render();
    });
  });
  wrap.append(form);
  return wrap;
}
async function submitForm(control, host, action) {
  const old = host.querySelector('[role="alert"]');
  if (old) old.remove();
  control.disabled = true;
  try {
    await action();
  } catch (error) {
    const box = alertBox(error.message || "没有完成这次操作");
    host.prepend(box);
    box.focus();
  } finally {
    control.disabled = false;
  }
}

window.addEventListener("hashchange", () => void render());
void boot();

async function boot() {
  try {
    state.me = await api("/api/me");
  } catch (error) {
    state.me = null;
    if (error.code !== "unauthenticated") {
      app.replaceChildren(alertBox(error.message));
      return;
    }
  }
  if (!location.hash)
    location.hash = state.me
      ? state.me.profile
        ? "#people"
        : "#profile"
      : "#enter";
  else await render();
}
