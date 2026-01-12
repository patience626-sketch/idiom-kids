// app.js
const STORE = {
  settings: 'idiom_settings_v1',
  wrong: 'idiom_wrongbook_v1',
  history: 'idiom_history_v1',
  ytOverrides: 'idiom_ytoverrides_v1'
};

const CHILDREN = ["西瓜","柚子","小樂","阿噗","安安"];

const CATEGORIES = [
  "生活行為","情緒表情","品格態度","學習成長","人際互動","故事典故","狀態感覺","時間流程"
];

const MODES = [
  {key:"mc_meaning", name:"選擇題：看解釋選成語"},
  {key:"fill_drag",  name:"填空：拖拉挖空字"},
  {key:"scene",      name:"情境題：看情境選成語"},
  {key:"tf",         name:"判斷題：這個意思對不對"}
];

function $(sel){ return document.querySelector(sel); }
function $all(sel){ return Array.from(document.querySelectorAll(sel)); }

function loadJSON(url){
  return fetch(url).then(r=>{
    if(!r.ok) throw new Error("讀取失敗："+url);
    return r.json();
  });
}

function loadLS(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch(e){ return fallback; }
}
function saveLS(key, val){
  localStorage.setItem(key, JSON.stringify(val));
}

function todayYMD(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function shuffle(arr){
  const a = arr.slice();
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

function pickN(arr, n){
  return shuffle(arr).slice(0, Math.min(n, arr.length));
}

function uniqueBy(arr, keyFn){
  const seen = new Set();
  const out = [];
  for(const x of arr){
    const k = keyFn(x);
    if(seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function getSettings(){
  return loadLS(STORE.settings, {
    child: CHILDREN[0],
    categories: ["全部"],
    count: 10,
    avoidDays: 3,
    modes: ["mc_meaning","fill_drag","scene","tf"]
  });
}
function setSettings(s){ saveLS(STORE.settings, s); }

function mergeYouTubeOverrides(items){
  const ov = loadLS(STORE.ytOverrides, {});
  return items.map(it=>{
    const o = ov[it.id];
    if(o && typeof o.youtube_id === 'string') return {...it, youtube_id:o.youtube_id};
    return it;
  });
}

function getHistory(){
  // history: { child: { "YYYY-MM-DD": [id,id,...] } }
  return loadLS(STORE.history, {});
}
function addHistory(child, ids){
  const h = getHistory();
  const day = todayYMD();
  h[child] = h[child] || {};
  h[child][day] = (h[child][day] || []).concat(ids);
  // keep last 14 days
  const days = Object.keys(h[child]).sort().slice(-14);
  const kept = {};
  for(const d of days) kept[d]=h[child][d];
  h[child]=kept;
  saveLS(STORE.history, h);
}
function getRecentIds(child, avoidDays){
  const h = getHistory();
  const map = (h[child]||{});
  const days = Object.keys(map).sort().slice(-avoidDays);
  const ids = new Set();
  for(const d of days){
    for(const id of (map[d]||[])) ids.add(id);
  }
  return ids;
}

function getWrongbook(){
  // wrong: { child: { idiomId: {count,last,types:[]} } }
  return loadLS(STORE.wrong, {});
}
function addWrong(child, idiomId, qtype){
  const wb = getWrongbook();
  wb[child] = wb[child] || {};
  const cur = wb[child][idiomId] || {count:0,last:"",types:[]};
  cur.count += 1;
  cur.last = new Date().toISOString();
  if(!cur.types.includes(qtype)) cur.types.push(qtype);
  wb[child][idiomId]=cur;
  saveLS(STORE.wrong, wb);
}
function clearWrong(child, idiomId){
  const wb = getWrongbook();
  if(wb[child] && wb[child][idiomId]) delete wb[child][idiomId];
  saveLS(STORE.wrong, wb);
}

function buildPool(items, settings){
  let pool = items.slice();

  // categories
  if(!(settings.categories||[]).includes("全部")){
    const set = new Set(settings.categories||[]);
    pool = pool.filter(it=> set.has(it.category));
  }

  // avoid recent
  const avoid = Number(settings.avoidDays||0);
  if(avoid>0){
    const recent = getRecentIds(settings.child, avoid);
    const filtered = pool.filter(it=>!recent.has(it.id));
    // if too few, allow fallback
    if(filtered.length >= Math.min(settings.count, 6)) pool = filtered;
  }

  // unique by idiom
  pool = uniqueBy(pool, x=>x.id);

  return pool;
}

function makeQuiz(items, settings, opts={}){
  const pool = buildPool(items, settings);
  let target = pickN(pool, Number(settings.count||10));

  // wrongbook only mode
  if(opts.onlyWrong){
    const wb = getWrongbook()[settings.child] || {};
    const wrongIds = Object.keys(wb);
    const wrongPool = items.filter(it=>wrongIds.includes(it.id));
    const wfiltered = buildPool(wrongPool, {...settings, avoidDays:0}); // wrongbook 不避開
    target = pickN(wfiltered, Number(settings.count||10));
  }

  addHistory(settings.child, target.map(t=>t.id));
  return target;
}

function randInt(n){ return Math.floor(Math.random()*n); }

function sampleOtherIdioms(all, excludeId, n){
  const pool = all.filter(x=>x.id!==excludeId);
  return pickN(pool, n);
}

function zhuyinToggleHTML(zhuyin){
  return `
    <button class="btn secondary" id="btnZhuyin">顯示注音</button>
    <div id="zhuyinBox" class="muted hidden" style="margin-top:8px;font-weight:900;font-size:18px;">
      ${escapeHTML(zhuyin)}
    </div>
  `;
}
function escapeHTML(s){
  return String(s).replace(/[&<>"']/g, m=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

/* ------------------ Page: index ------------------ */
async function initIndex(){
  const s = getSettings();

  // children
  const childSel = $("#child");
  CHILDREN.forEach(n=>{
    const op = document.createElement("option");
    op.value=n; op.textContent=n;
    childSel.appendChild(op);
  });
  childSel.value = s.child;

  // categories checkboxes
  const catBox = $("#cats");
  const catAll = ["全部", ...CATEGORIES];
  catBox.innerHTML = catAll.map(c=>{
    const checked = (s.categories||["全部"]).includes(c);
    return `
      <label class="badge" style="cursor:pointer;">
        <input type="checkbox" class="cat" value="${c}" ${checked?"checked":""} />
        ${c}
      </label>
    `;
  }).join(" ");

  // modes
  const modeBox = $("#modes");
  modeBox.innerHTML = MODES.map(m=>{
    const checked = (s.modes||[]).includes(m.key);
    return `
      <label class="badge" style="cursor:pointer;">
        <input type="checkbox" class="mode" value="${m.key}" ${checked?"checked":""}/>
        ${m.name}
      </label>
    `;
  }).join(" ");

  $("#count").value = s.count;
  $("#avoidDays").value = s.avoidDays;

  function normalizeCats(vals){
    // if 全部 checked => only 全部
    if(vals.includes("全部")) return ["全部"];
    return vals.length? vals : ["全部"];
  }

  $("#save").addEventListener("click", ()=>{
    const categories = normalizeCats($all(".cat:checked").map(x=>x.value));
    const modes = $all(".mode:checked").map(x=>x.value);
    const ns = {
      child: childSel.value,
      categories,
      count: Number($("#count").value||10),
      avoidDays: Number($("#avoidDays").value||0),
      modes: modes.length? modes : ["mc_meaning"]
    };
    setSettings(ns);
    alert("已儲存設定！");
  });

  $("#start").addEventListener("click", ()=>{
    location.href = "quiz.html";
  });
  $("#wrongbookBtn").addEventListener("click", ()=>{
    location.href = "wrongbook.html";
  });
  $("#adminBtn").addEventListener("click", ()=>{
    location.href = "admin.html";
  });

  // enforce 全部行為
  catBox.addEventListener("change", (e)=>{
    const t = e.target;
    if(!t.classList.contains("cat")) return;
    if(t.value==="全部" && t.checked){
      $all(".cat").forEach(x=>{ if(x.value!=="全部") x.checked=false; });
    }else if(t.value!=="全部" && t.checked){
      const all = $all(".cat").find(x=>x.value==="全部");
      if(all) all.checked=false;
    }
  });

  $("#reset").addEventListener("click", ()=>{
    if(!confirm("要重置本機設定與錯題本嗎？")) return;
    localStorage.removeItem(STORE.settings);
    localStorage.removeItem(STORE.wrong);
    localStorage.removeItem(STORE.history);
    localStorage.removeItem(STORE.ytOverrides);
    location.reload();
  });

  $("#curChild").textContent = s.child;
}

/* ------------------ Page: quiz ------------------ */
let QUIZ = {items:[], all:[], idx:0, score:0, settings:null, onlyWrong:false};

function pickMode(settings){
  const ms = settings.modes || ["mc_meaning"];
  return ms[randInt(ms.length)];
}

function renderProgress(){
  $("#prog").textContent = `${QUIZ.idx+1} / ${QUIZ.items.length}`;
  $("#score").textContent = `得分：${QUIZ.score}`;
  $("#who").textContent = `小孩：${QUIZ.settings.child}`;
  $("#meta").innerHTML = `
    <span class="badge">分類：${(QUIZ.settings.categories||["全部"]).join("、")}</span>
    <span class="badge">避開：${QUIZ.settings.avoidDays} 天</span>
    <span class="badge">模式池：${(QUIZ.settings.modes||[]).length} 種</span>
    ${QUIZ.onlyWrong? `<span class="badge" style="border-color:var(--danger);">錯題本</span>`:""}
  `;
}

function showFeedback(ok, msg){
  const box = $("#feedback");
  box.classList.remove("hidden");
  box.innerHTML = ok
    ? `<div class="badge" style="border-color:var(--ok);color:var(--ok);font-weight:900;">答對 ✅</div> <span class="muted">${msg||""}</span>`
    : `<div class="badge" style="border-color:var(--danger);color:var(--danger);font-weight:900;">答錯 ❌</div> <span class="muted">${msg||""}</span>`;
}

function renderYouTube(it){
  const wrap = $("#video");
  const yid = (it.youtube_id||"").trim();
  if(yid){
    wrap.innerHTML = `<div class="videoWrap"><iframe src="https://www.youtube.com/embed/${encodeURIComponent(yid)}?rel=0&modestbranding=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>`;
  }else{
    const q = encodeURIComponent(`${it.idiom} 成語故事`);
    wrap.innerHTML = `
      <div class="card">
        <div class="row" style="justify-content:space-between;">
          <div>
            <div style="font-weight:900;">尚未設定故事影片</div>
            <div class="muted small">你可以到「後台」為這個成語指定 YouTube 影片 ID。</div>
          </div>
          <button class="btn warn" id="ytSearch">去 YouTube 找</button>
        </div>
      </div>
    `;
    $("#ytSearch").addEventListener("click", ()=> window.open(`https://www.youtube.com/results?search_query=${q}`, "_blank"));
  }
}

function renderQuestion(){
  const it = QUIZ.items[QUIZ.idx];
  $("#idiomTitle").textContent = it.idiom;
  $("#meaning").textContent = it.meaning;
  $("#story").textContent = it.story;
  $("#cat").textContent = it.category;
  $("#feedback").classList.add("hidden");
  $("#next").classList.add("hidden");
  $("#actions").classList.remove("hidden");

  renderYouTube(it);

  // question type
  const mode = pickMode(QUIZ.settings);
  $("#qtype").textContent = MODES.find(m=>m.key===mode)?.name || mode;

  const q = $("#q");
  q.innerHTML = "";

  // inject zhuyin toggle
  q.insertAdjacentHTML("beforeend", zhuyinToggleHTML(it.zhuyin));
  $("#btnZhuyin").addEventListener("click", ()=>{
    $("#zhuyinBox").classList.toggle("hidden");
  });

  q.insertAdjacentHTML("beforeend", `<hr/>`);

  if(mode==="mc_meaning"){
    q.insertAdjacentHTML("beforeend", `<div class="muted">看解釋，選正確成語：</div><div class="card"><div style="font-size:18px;font-weight:900;">${escapeHTML(it.meaning)}</div></div>`);
    const options = shuffle([it, ...sampleOtherIdioms(QUIZ.all, it.id, 3)]).map(x=>x.idiom);
    q.insertAdjacentHTML("beforeend", `<div class="grid" style="margin-top:10px;">${options.map(o=>`<button class="choice" data-a="${escapeHTML(o)}">${escapeHTML(o)}</button>`).join("")}</div>`);
    $all(".choice").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const ans = btn.dataset.a;
        const ok = ans===it.idiom;
        if(ok){ QUIZ.score += 1; btn.classList.add("correct"); showFeedback(true, "很棒！"); }
        else { btn.classList.add("wrong"); showFeedback(false, `正確答案：${it.idiom}`); addWrong(QUIZ.settings.child, it.id, "選擇題"); }
        endQuestion();
      }, {once:true});
    });
  }

  if(mode==="scene"){
    q.insertAdjacentHTML("beforeend", `<div class="muted">看情境，選最適合的成語：</div><div class="card"><div style="font-size:18px;font-weight:900;">${escapeHTML(it.story)}</div></div>`);
    const options = shuffle([it, ...sampleOtherIdioms(QUIZ.all, it.id, 3)]).map(x=>x.idiom);
    q.insertAdjacentHTML("beforeend", `<div class="grid" style="margin-top:10px;">${options.map(o=>`<button class="choice" data-a="${escapeHTML(o)}">${escapeHTML(o)}</button>`).join("")}</div>`);
    $all(".choice").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const ans = btn.dataset.a;
        const ok = ans===it.idiom;
        if(ok){ QUIZ.score += 1; btn.classList.add("correct"); showFeedback(true, "對！這個情境最貼切"); }
        else { btn.classList.add("wrong"); showFeedback(false, `正確答案：${it.idiom}`); addWrong(QUIZ.settings.child, it.id, "情境題"); }
        endQuestion();
      }, {once:true});
    });
  }

  if(mode==="tf"){
    // Make a statement that is either correct or incorrect
    const other = sampleOtherIdioms(QUIZ.all, it.id, 1)[0];
    const isTrue = Math.random() < 0.5;
    const stmt = isTrue ? it.meaning : other.meaning;
    q.insertAdjacentHTML("beforeend", `
      <div class="muted">判斷：以下解釋是不是「${escapeHTML(it.idiom)}」的意思？</div>
      <div class="card"><div style="font-size:18px;font-weight:900;">${escapeHTML(stmt)}</div></div>
      <div class="row" style="margin-top:10px;">
        <button class="btn primary" id="btnT">是</button>
        <button class="btn secondary" id="btnF">不是</button>
      </div>
    `);
    $("#btnT").addEventListener("click", ()=>handleTF(true,isTrue,it));
    $("#btnF").addEventListener("click", ()=>handleTF(false,isTrue,it));
  }

  if(mode==="fill_drag"){
    // only for 4-char idioms
    if(it.idiom.length !== 4){
      // fallback to mc
      QUIZ.settings.modes = QUIZ.settings.modes.filter(m=>m!=="fill_drag");
      return renderQuestion();
    }
    const chars = it.idiom.split("");
    const blankIdx = randInt(4);
    const blanks = chars.map((ch, idx)=> idx===blankIdx ? "" : ch);
    const correct = chars[blankIdx];

    const distract = sampleOtherIdioms(QUIZ.all, it.id, 6)
      .map(x=>x.idiom.split(""))
      .flat()
      .filter(ch=>ch && ch !== correct);
    const bank = shuffle([correct, ...pickN(uniqueBy(distract, x=>x), 3)]);

    q.insertAdjacentHTML("beforeend", `
      <div class="muted">拖拉字到空格，完成成語：</div>
      <div class="card" style="display:flex;gap:10px;justify-content:center;align-items:center;">
        ${blanks.map((ch,idx)=>{
          if(idx===blankIdx) return `<div class="blank" id="blank" data-correct="${escapeHTML(correct)}" aria-label="blank"></div>`;
          return `<div class="tile" style="cursor:default;">${escapeHTML(ch)}</div>`;
        }).join("")}
      </div>
      <div class="muted small">字庫（拖拉）</div>
      <div class="dragbank">
        ${bank.map(ch=>`<div class="tile" draggable="true" data-ch="${escapeHTML(ch)}">${escapeHTML(ch)}</div>`).join("")}
      </div>
    `);

    const blank = $("#blank");
    $all(".tile[draggable='true']").forEach(tile=>{
      tile.addEventListener("dragstart",(e)=>{
        e.dataTransfer.setData("text/plain", tile.dataset.ch);
      });
    });

    blank.addEventListener("dragover",(e)=> e.preventDefault());
    blank.addEventListener("drop",(e)=>{
      e.preventDefault();
      const ch = e.dataTransfer.getData("text/plain");
      blank.textContent = ch;
      const ok = ch === blank.dataset.correct;
      if(ok){ QUIZ.score += 1; blank.style.borderColor = "var(--ok)"; showFeedback(true, "完成！"); }
      else { blank.style.borderColor = "var(--danger)"; showFeedback(false, `正確字：${correct}`); addWrong(QUIZ.settings.child, it.id, "填空題"); }
      endQuestion();
    }, {once:true});
  }

  renderProgress();
}

function handleTF(userSaysTrue, isTrue, it){
  const ok = (userSaysTrue===isTrue);
  if(ok){ QUIZ.score += 1; showFeedback(true, "判斷正確！"); }
  else { showFeedback(false, `正確答案：${isTrue?"是":"不是"}`); addWrong(QUIZ.settings.child, it.id, "判斷題"); }
  endQuestion();
}

function endQuestion(){
  $("#actions").classList.add("hidden");
  $("#next").classList.remove("hidden");
}

async function initQuiz(){
  QUIZ.settings = getSettings();
  const all = await loadJSON("data/idioms.json");
  QUIZ.all = mergeYouTubeOverrides(all);

  const params = new URLSearchParams(location.search);
  QUIZ.onlyWrong = params.get("onlyWrong")==="1";

  QUIZ.items = makeQuiz(QUIZ.all, QUIZ.settings, {onlyWrong:QUIZ.onlyWrong});
  QUIZ.idx = 0;
  QUIZ.score = 0;

  if(QUIZ.items.length===0){
    $("#main").innerHTML = `
      <div class="card">
        <div style="font-weight:900;">沒有題目可以出</div>
        <div class="muted">可能是分類太少、又設定避開近期重複，或錯題本目前是空的。</div>
        <div style="margin-top:10px;">
          <button class="btn primary" onclick="location.href='index.html'">回首頁調整</button>
        </div>
      </div>
    `;
    return;
  }

  $("#home").addEventListener("click", ()=> location.href="index.html");
  $("#next").addEventListener("click", ()=>{
    if(QUIZ.idx < QUIZ.items.length-1){
      QUIZ.idx += 1;
      renderQuestion();
    }else{
      renderResult();
    }
  });

  renderQuestion();
}

function renderResult(){
  const total = QUIZ.items.length;
  const score = QUIZ.score;
  const pct = Math.round(score/total*100);
  $("#main").innerHTML = `
    <div class="card">
      <div class="big">完成！</div>
      <div style="margin-top:8px;font-size:18px;font-weight:900;">得分：${score} / ${total}（${pct}%）</div>
      <div class="muted" style="margin-top:6px;">可到「錯題本」重練錯的成語。</div>
      <div class="row" style="margin-top:12px;">
        <button class="btn primary" onclick="location.href='quiz.html'">再考一次</button>
        <button class="btn secondary" onclick="location.href='wrongbook.html'">去錯題本</button>
        <button class="btn secondary" onclick="location.href='index.html'">回首頁</button>
      </div>
    </div>
  `;
}

/* ------------------ Page: wrongbook ------------------ */
async function initWrongbook(){
  const s = getSettings();
  const all = mergeYouTubeOverrides(await loadJSON("data/idioms.json"));
  const wbAll = getWrongbook();
  const wb = wbAll[s.child] || {};

  $("#who").textContent = `小孩：${s.child}`;
  $("#toHome").addEventListener("click", ()=>location.href="index.html");
  $("#toQuizWrong").addEventListener("click", ()=>location.href="quiz.html?onlyWrong=1");

  const rows = Object.entries(wb)
    .map(([id,info])=>{
      const it = all.find(x=>x.id===id);
      if(!it) return null;
      return {it,info};
    })
    .filter(Boolean)
    .sort((a,b)=> (b.info.count||0)-(a.info.count||0));

  const box = $("#list");
  if(rows.length===0){
    box.innerHTML = `
      <div class="card">
        <div style="font-weight:900;">目前沒有錯題 🎉</div>
        <div class="muted">去測驗做題，答錯的會自動進來。</div>
      </div>
    `;
    return;
  }

  box.innerHTML = rows.map(({it,info})=>`
    <div class="card">
      <div class="row" style="justify-content:space-between;">
        <div>
          <div style="font-size:20px;font-weight:900;">${escapeHTML(it.idiom)} <span class="badge">${escapeHTML(it.category)}</span></div>
          <div class="muted small">注音：${escapeHTML(it.zhuyin)}</div>
          <div class="muted small">錯誤次數：<b>${info.count}</b>｜題型：${(info.types||[]).join("、")}</div>
        </div>
        <div class="row">
          <button class="btn secondary" data-clear="${it.id}">移除</button>
        </div>
      </div>
      <div class="muted" style="margin-top:6px;">${escapeHTML(it.meaning)}</div>
    </div>
  `).join("");

  $all("button[data-clear]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.clear;
      if(!confirm("要從錯題本移除這個成語嗎？")) return;
      clearWrong(s.child, id);
      location.reload();
    });
  });
}

/* ------------------ Page: admin ------------------ */
async function initAdmin(){
  const all = await loadJSON("data/idioms.json");
  const ov = loadLS(STORE.ytOverrides, {});
  $("#toHome").addEventListener("click", ()=>location.href="index.html");

  function render(){
    const q = ($("#q").value||"").trim();
    const cat = $("#cat").value;
    const filtered = all.filter(it=>{
      const okQ = !q || it.idiom.includes(q) || it.meaning.includes(q) || it.story.includes(q);
      const okC = (cat==="全部") || it.category===cat;
      return okQ && okC;
    });

    $("#count").textContent = `共 ${filtered.length} 筆`;

    $("#list").innerHTML = filtered.map(it=>{
      const cur = (ov[it.id] && ov[it.id].youtube_id) ? ov[it.id].youtube_id : it.youtube_id;
      return `
        <div class="card">
          <div class="row" style="justify-content:space-between;align-items:flex-start;">
            <div>
              <div style="font-size:20px;font-weight:900;">${escapeHTML(it.idiom)} <span class="badge">${escapeHTML(it.category)}</span></div>
              <div class="muted small">注音：${escapeHTML(it.zhuyin)}</div>
              <div class="muted small">解釋：${escapeHTML(it.meaning)}</div>
            </div>
            <div style="min-width:320px;">
              <label class="small">YouTube 影片 ID（只填 ID，不填整段網址）</label>
              <div class="row" style="margin-top:6px;">
                <input style="flex:1;padding:10px 12px;border:1px solid var(--border);border-radius:12px;font-size:16px;"
                  value="${escapeHTML(cur||"")}" placeholder="例如：dQw4w9WgXcQ" data-y="${it.id}" />
                <button class="btn secondary" data-s="${it.id}">儲存</button>
              </div>
              <div class="row" style="margin-top:6px;justify-content:flex-end;">
                <button class="btn warn" data-find="${it.id}">去 YouTube 找</button>
                <button class="btn danger" data-del="${it.id}">清除</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");

    // bind
    $all("button[data-s]").forEach(b=>{
      b.addEventListener("click", ()=>{
        const id = b.dataset.s;
        const inp = $(`input[data-y="${id}"]`);
        const yid = (inp.value||"").trim();
        ov[id] = {youtube_id:yid};
        saveLS(STORE.ytOverrides, ov);
        alert("已儲存（本機）！");
      });
    });
    $all("button[data-del]").forEach(b=>{
      b.addEventListener("click", ()=>{
        const id = b.dataset.del;
        if(ov[id]) delete ov[id];
        saveLS(STORE.ytOverrides, ov);
        render();
      });
    });
    $all("button[data-find]").forEach(b=>{
      b.addEventListener("click", ()=>{
        const id = b.dataset.find;
        const it = all.find(x=>x.id===id);
        const qq = encodeURIComponent(`${it.idiom} 成語故事`);
        window.open(`https://www.youtube.com/results?search_query=${qq}`, "_blank");
      });
    });
  }

  // init category options
  $("#cat").innerHTML = ["全部", ...CATEGORIES].map(c=>`<option value="${c}">${c}</option>`).join("");
  $("#q").addEventListener("input", render);
  $("#cat").addEventListener("change", render);
  $("#export").addEventListener("click", ()=>{
    const data = loadLS(STORE.ytOverrides, {});
    const txt = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(txt).then(()=>alert("已複製覆寫 JSON（貼到別台電腦也可匯入）"));
  });
  $("#import").addEventListener("click", ()=>{
    const txt = prompt("貼上覆寫 JSON：");
    if(!txt) return;
    try{
      const obj = JSON.parse(txt);
      saveLS(STORE.ytOverrides, obj);
      alert("已匯入！");
      location.reload();
    }catch(e){
      alert("JSON 格式錯誤");
    }
  });

  render();
}

/* ------------------ bootstrap ------------------ */
window.App = { initIndex, initQuiz, initWrongbook, initAdmin };

