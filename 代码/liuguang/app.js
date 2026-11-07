const $ = (s) => document.querySelector(s),
  app = $("#app"),
  dlg = $("#dlg"),
  esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const key = "landing-club.demo.v1",
  blank = () => ({ profile: null, links: [], requests: [] });
let state = blank();
try {
  state = JSON.parse(localStorage.getItem(key)) || blank();
} catch {}
let query = "",
  filter = "all",
  term = "",
  role = "student",
  timer;
function save() {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    notice("当前浏览器无法保存，内容仅在本次打开期间保留。");
  }
}
function notice(t) {
  $("#toast").textContent = t;
  clearTimeout(timer);
  timer = setTimeout(() => ($("#toast").textContent = ""), 3200);
}
function modal(html) {
  $("#modal").innerHTML = html;
  dlg.showModal();
  dlg.querySelector("input,textarea,button")?.focus();
}
$("#close").onclick = () => dlg.close();
const fields = () =>
  Object.keys(topics)
    .map((id) => '<option value="' + id + '">' + topics[id].name + "</option>")
    .join("");
const now = () => new Date().toLocaleDateString("zh-CN");
const all = () => [
  ...sources,
  ...state.links.filter((x) => x.status === "published"),
];
const urlOk = (s) => {
  try {
    let u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
};
const iconMap =
  '<svg class="map" viewBox="0 0 390 170" role="img" aria-label="伦敦站插画：由三条路线连接的学习、通勤、社团站点"><defs><pattern id="dots" width="15" height="15" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#80a997" opacity=".38"/></pattern></defs><rect width="390" height="170" fill="url(#dots)"/><path d="M-5 140 Q40 91 88 126 T178 115 T266 94 T400 54" fill="none" stroke="#417a72" stroke-width="19"/><g fill="none" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 93h67l38-38h84l40 40h159" stroke="#dceaab"/><path d="M65 156l60-60h66l52-52h94" stroke="#f5ab79"/><path d="M167 0v34l24 21v70l34 34h90" stroke="#94c3ac"/></g><g fill="#174e48" stroke="#fffbdc" stroke-width="4"><circle cx="107" cy="55" r="6"/><circle cx="191" cy="55" r="8"/><circle cx="191" cy="96" r="8"/><circle cx="243" cy="44" r="6"/><circle cx="312" cy="95" r="6"/></g><g fill="#e4efcd" font-family="monospace" font-size="14px" letter-spacing="2"><text x="82" y="39">STUDY</text><text x="255" y="33">SOCIETY</text><text x="232" y="120">TRANSIT</text><text x="18" y="19">51°30′ N</text></g></svg>';
const pagehead = (n, title, info) =>
  '<div class="pagehead"><p class="over">' +
  n +
  "</p><h1>" +
  title +
  '</h1><p class="muted">' +
  info +
  "</p></div>";
function card(x) {
  return (
    '<article class="card"><div class="tag">' +
    esc(x.org) +
    " · " +
    esc(x.tag || "社区贡献") +
    "</div><h3>" +
    esc(x.name) +
    '</h3><p class="desc">' +
    esc(x.info) +
    "</p>" +
    (urlOk(x.url)
      ? '<a class="out" target="_blank" rel="noopener noreferrer" href="' +
        esc(x.url) +
        '">打开来源 ↗</a>'
      : "") +
    "</article>"
  );
}
function person(m) {
  return (
    '<article class="card"><div class="row"><span class="avatar">' +
    m.name.slice(-1) +
    '</span><span class="pill">演示校友</span></div><h3>' +
    m.name +
    " · " +
    topics[m.topic].name +
    '</h3><p class="desc">' +
    m.bio +
    '</p><button class="secondary" data-ask="' +
    m.id +
    '">向这位校友提问 →</button></article>'
  );
}
function discover() {
  app.innerHTML =
    '<section class="hero"><div><p class="over">FIELD GUIDE　/　LONDON 01</p><h1>连接同行的人，<br>照亮自己的路。</h1><p>在伦敦新生体验站提问，找到相关资料与校友。</p></div>' +
    iconMap +
    '</section><section class="panel ask"><div class="top"><h2><label for="q">你现在想解决什么？</label></h2><span class="pill">本地智能匹配</span></div><form id="search" class="search"><input maxlength="220" required id="q" placeholder="例如：开学第一周，在哪里可以安静自习？" value="' +
    esc(query) +
    '"><button class="primary">寻找资源与校友 ↗</button></form><div class="chips">' +
    ["上学怎么坐地铁", "找自习空间", "认识新朋友"]
      .map(
        (s, i) =>
          '<button class="chip" data-prompt="' + i + '">' + s + "</button>",
      )
      .join("") +
    '</div></section><section id="results" class="res" tabindex="-1" aria-live="polite"></section><div class="row section"><h2>新生资源精选</h2><a class="link" href="#library">全部资源 →</a></div><div class="grid">' +
    [sources[0], sources[2], sources[4]].map(card).join("") +
    "</div>";
  $("#search").onsubmit = (e) => {
    e.preventDefault();
    runQuery($("#q").value);
  };
  showResults();
}
function runQuery(v) {
  query = v.trim();
  $("#q").value = query;
  showResults();
  $("#results").focus();
  $("#results").scrollIntoView({ block: "nearest" });
}
function showResults() {
  if (!query) return;
  const m = predict(query),
    el = $("#results");
  if (!m) {
    el.innerHTML =
      '<div class="empty"><h3>暂时没有可靠匹配</h3><p>伦敦站目前收录通勤、学习空间和社团经验。可以换一个具体问题，或<a href="#library">直接查看资源库</a>。</p></div>';
    return;
  }
  const rows = all().filter((x) => x.topic === m.id);
  el.innerHTML =
    '<div class="result-head"><p class="over">MATCH RESULT</p><h2>' +
    topics[m.id].name +
    ' · 推荐结果</h2><p class="note">问题中的「' +
    esc(m.shared.sort((a, b) => b.length - a.length)[0]) +
    '」与此主题示例相近。以下资料和校友经历都关联这个主题。</p></div><div class="grid">' +
    person(mentors.find((x) => x.topic === m.id)) +
    rows.map(card).join("") +
    "</div>";
}
function library() {
  app.innerHTML =
    pagehead(
      "RESOURCE INDEX　/　02",
      "资源库",
      "每份资料都保留来源，方便你自己核对。",
    ) +
    '<div class="panel"><div class="row"><h2>伦敦站目录</h2><button class="primary" data-add>＋ 贡献资源</button></div><label class="field">检索资料<input id="term" type="search" maxlength="100" placeholder="搜索标题、来源或关键词" value="' +
    esc(term) +
    '"></label><div class="chips filters">' +
    Object.entries({ all: { name: "全部" }, ...topics })
      .map(
        ([id, t]) =>
          '<button class="chip ' +
          (filter === id ? "on" : "") +
          '" data-filter="' +
          id +
          '">' +
          t.name +
          "</button>",
      )
      .join("") +
    '</div></div><div class="row section"><h2 id="count"></h2></div><div class="grid" id="items"></div><div id="submissions"></div>';
  $("#term").oninput = (e) => {
    term = e.target.value;
    listItems();
  };
  listItems();
  if (state.links.length)
    $("#submissions").innerHTML =
      '<h2 class="section">我的投稿</h2><div class="stack">' +
      state.links
        .map(
          (l) =>
            '<article class="record"><div class="row"><strong>' +
            esc(l.name) +
            '</strong><span class="pill">' +
            (l.status === "published" ? "已发布" : "待确认") +
            '</span></div><p class="desc">' +
            esc(l.org) +
            " · " +
            topics[l.topic].name +
            " · " +
            esc(l.date) +
            '</p><div class="btns">' +
            (l.status === "pending"
              ? '<button class="secondary" data-review="' +
                l.id +
                '">核对并发布</button>'
              : "") +
            '<button class="link" data-remove="' +
            l.id +
            '">撤回</button></div></article>',
        )
        .join("") +
      "</div>";
}
function listItems() {
  let t = term.trim().toLowerCase(),
    rows = all().filter(
      (l) =>
        (filter === "all" || l.topic === filter) &&
        [l.name, l.info, l.org, l.tag, topics[l.topic].name]
          .join(" ")
          .toLowerCase()
          .includes(t),
    );
  $("#count").textContent = rows.length + " 份资源";
  $("#items").innerHTML =
    rows.map(card).join("") ||
    '<div class="empty">没有符合条件的资料，请调整关键词或分类。</div>';
}
function profile(next) {
  return (
    '<p class="over">COMMUNITY PASS</p><h2>建立你的新生名片</h2><form id="profileForm"><label class="field">昵称<input name="nick" required maxlength="24" value="' +
    esc(state.profile?.nick || "") +
    '" placeholder="起一个昵称即可"></label><label class="field">当前阶段<select name="stage">' +
    ["行前准备", "抵达首周", "已适应校园"]
      .map(
        (x) =>
          "<option " +
          (x === state.profile?.stage ? "selected" : "") +
          ">" +
          x +
          "</option>",
      )
      .join("") +
    '</select></label><p class="muted">本站：伦敦 · 名片保存在本机浏览器</p><button class="primary">' +
    (next ? "保存并继续" : "保存名片") +
    "</button></form>"
  );
}
function editProfile(next) {
  modal(profile(next));
  $("#profileForm").onsubmit = (e) => {
    e.preventDefault();
    let f = new FormData(e.target),
      nick = f.get("nick").trim();
    if (!nick) return notice("请填写昵称");
    state.profile = { nick, stage: f.get("stage") };
    save();
    dlg.close();
    draw();
    if (next) next();
    else notice("名片已保存");
  };
}
function profpage() {
  app.innerHTML =
    pagehead(
      "COMMUNITY PASS　/　04",
      "我的名片",
      "用一张名片开始你的伦敦互助记录。",
    ) +
    '<article class="panel"><span class="pill">伦敦站 · 新生</span><h2>' +
    esc(state.profile?.nick || "尚未入驻") +
    '</h2><p class="desc">' +
    esc(state.profile?.stage || "用昵称和留学阶段创建名片") +
    '</p><button class="secondary" data-profile>' +
    (state.profile ? "编辑名片" : "创建名片") +
    "</button></article>";
}
function ask(id) {
  if (!state.profile) return editProfile(() => ask(id));
  let m = mentors.find((x) => x.id === id);
  modal(
    '<p class="over">ASK AN ALUM</p><h2>向' +
      m.name +
      '提问</h2><p class="muted">演示校友 · ' +
      topics[m.topic].name +
      '</p><form id="askForm"><label class="field">想请教的问题<textarea required maxlength="300" name="body">' +
      esc(query) +
      '</textarea></label><button class="primary">保存求助记录</button></form>',
  );
  $("#askForm").onsubmit = (e) => {
    e.preventDefault();
    let body = new FormData(e.target).get("body").trim();
    if (!body) return notice("请填写问题");
    state.requests.unshift({
      id: uid(),
      mentor: id,
      body,
      nick: state.profile.nick,
      date: now(),
      reply: "",
      feedback: "",
    });
    save();
    dlg.close();
    role = "student";
    location.hash = "inbox";
    notice("已创建演示求助，可切换校友视角回复");
  };
}
const uid = () =>
  crypto.randomUUID?.() ||
  Date.now().toString(36) + Math.random().toString(36).slice(2);
function inbox() {
  app.innerHTML =
    pagehead(
      "CONNECTION LOG　/　03",
      "互助记录",
      "同一台设备切换新生和演示校友视角，体验一次完整问答。",
    ) +
    '<div class="chips filters">' +
    ["student", "alum"]
      .map(
        (r, i) =>
          '<button class="chip ' +
          (role === r ? "on" : "") +
          '" data-role="' +
          r +
          '">' +
          ["新生视角", "演示校友视角"][i] +
          "</button>",
      )
      .join("") +
    '</div><section class="stack">' +
    (state.requests
      .map((r) => {
        let m = mentors.find((x) => x.id === r.mentor);
        return (
          '<article class="record"><div class="row"><span class="tag">' +
          esc(r.date) +
          " · " +
          esc(r.nick) +
          " → " +
          m.name +
          '（演示校友）</span><span class="pill">' +
          (r.feedback ? "已反馈" : r.reply ? "已回复" : "待回复") +
          "</span></div><h3>" +
          esc(r.body) +
          "</h3>" +
          (r.reply
            ? '<p class="note">校友回复：' + esc(r.reply) + "</p>"
            : "") +
          (r.feedback
            ? '<p class="desc">新生反馈：' + esc(r.feedback) + "</p>"
            : role === "student" && r.reply
              ? '<div class="btns"><button class="secondary" data-feedback="' +
                r.id +
                '" value="有帮助">有帮助</button><button class="link" data-feedback="' +
                r.id +
                '" value="未解决">未解决</button></div>'
              : role === "alum" && !r.reply
                ? '<button class="secondary" data-reply="' +
                  r.id +
                  '">回复这个问题</button>'
                : "") +
          "</article>"
        );
      })
      .join("") ||
      '<div class="empty"><h3>还没有互助记录</h3><p>先在<a href="#discover">探索页</a>问一个问题，再向匹配到的校友发起求助。</p></div>') +
    "</section>";
}
function add() {
  if (!state.profile) return editProfile(add);
  modal(
    '<p class="over">CONTRIBUTE　/　01</p><h2>贡献一份资源</h2><form id="addForm"><label class="field">资料标题<input required name="name" maxlength="70"></label><label class="field">公开来源链接<input required type="url" name="url" placeholder="https://…"></label><label class="field">适合解决什么问题？<textarea required name="info" maxlength="240"></textarea></label><button class="primary">生成分类草稿</button></form>',
  );
  $("#addForm").onsubmit = (e) => {
    e.preventDefault();
    let f = new FormData(e.target),
      url = f.get("url").trim(),
      name = f.get("name").trim(),
      info = f.get("info").trim();
    if (!urlOk(url) || !name || !info)
      return notice("请填写完整信息，来源需为 HTTPS 链接");
    let predicted = predict(name + " " + info);
    let l = {
      id: uid(),
      name,
      info,
      url,
      org: new URL(url).hostname,
      topic: predicted?.id || "study",
      inferred: !!predicted,
      date: now(),
      status: "pending",
    };
    state.links.unshift(l);
    save();
    dlg.close();
    draw();
    review(l.id);
  };
}
function review(id) {
  let l = state.links.find((x) => x.id === id);
  modal(
    '<p class="over">HUMAN REVIEW　/　02</p><h2>核对资源后发布</h2><h3>' +
      esc(l.name) +
      "</h3><p>" +
      esc(l.info) +
      '</p><a class="out" href="' +
      esc(l.url) +
      '" rel="noopener noreferrer" target="_blank">核对来源：' +
      esc(l.org) +
      ' ↗</a><form id="publish"><label class="field">' +
      (l.inferred
        ? "本地模型建议分类，可修改"
        : "模型未找到可靠分类，请手动选择") +
      '<select name="topic" required>' +
      (!l.inferred ? '<option value="">请选择分类</option>' : "") +
      fields() +
      '</select></label><button class="primary">确认并发布到本机资源库</button></form>',
  );
  let f = $("#publish");
  f.elements.topic.value = l.inferred ? l.topic : "";
  f.onsubmit = (e) => {
    e.preventDefault();
    l.topic = f.elements.topic.value;
    l.status = "published";
    l.tag = "社区贡献";
    save();
    dlg.close();
    filter = "all";
    term = "";
    draw();
    notice("资源已发布，可在目录中检索");
  };
}
function draw() {
  let route = location.hash.slice(1);
  if (!["library", "inbox", "profile"].includes(route)) route = "discover";
  document.querySelectorAll("nav a").forEach((a) => {
    const on = a.hash === "#" + route;
    a.classList.toggle("active", on);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  ({ discover, library, inbox, profile: profpage })[route]();
}
app.addEventListener("click", (e) => {
  let b = e.target.closest("button");
  if (!b) return;
  let d = b.dataset;
  if ("prompt" in d) runQuery(prompts[Number(d.prompt)]);
  if ("filter" in d) {
    filter = d.filter;
    library();
  }
  if ("add" in d) add();
  if ("review" in d) review(d.review);
  if ("profile" in d) editProfile();
  if ("ask" in d) ask(d.ask);
  if ("role" in d) {
    role = d.role;
    inbox();
  }
  if (
    "remove" in d &&
    confirm("撤回这份资源？撤回后将从本机目录和投稿记录移除。")
  ) {
    state.links = state.links.filter((x) => x.id !== d.remove);
    save();
    draw();
  }
  if ("reply" in d) {
    let r = state.requests.find((x) => x.id === d.reply);
    modal(
      '<p class="over">ALUM REPLY</p><h2>回复新生</h2><p>' +
        esc(r.body) +
        '</p><form id="replyForm"><label class="field">你的演示回复<textarea required name="body" maxlength="400"></textarea></label><button class="primary">保存回复</button></form>',
    );
    $("#replyForm").onsubmit = (e) => {
      e.preventDefault();
      let t = new FormData(e.target).get("body").trim();
      if (!t) return notice("请填写回复");
      r.reply = t;
      save();
      dlg.close();
      inbox();
    };
  }
  if ("feedback" in d) {
    state.requests.find((x) => x.id === d.feedback).feedback = b.value;
    save();
    inbox();
  }
});
window.addEventListener("hashchange", () => {
  draw();
  window.scrollTo(0, 0);
});
draw();
