const GAS_URL = "https://script.google.com/macros/s/AKfycbwcUi6_L_zd7iSk4_rTOsSgDym81it80Z9v_K7XjBFu8TaD2cLUct_5C3wgQ5GU-KEA/exec";

const categories = {
    "生活": ["睡眠", "食事", "お風呂", "身支度"],
    "家事": ["料理", "掃除"],
    "外出": ["移動", "外食", "買い出し", "病院", "用事", "レジャー"],
    "デジタル": ["スマホ", "PC", "ゲーム", "TV"],
    "自己投資": ["読書", "学習", "運動"],
    "休憩": ["休憩"],
    "仕事": ["仕事"]
};

const colors = {
    "生活": "#e2efee", "家事": "#f8f3df", "外出": "#f9ece3",
    "デジタル": "#e3ecf9", "自己投資": "#ede3f9", "休憩": "#f9e3e9", "仕事": "#e8e8e8"
};

const colorsDark = {
    "生活": "#7bbcb8", "家事": "#d4b84a", "外出": "#d49070",
    "デジタル": "#6090d4", "自己投資": "#9070d4", "休憩": "#d47090", "仕事": "#999"
};

const colorsMid = {
    "生活": "#a8d5d2", "家事": "#e5d080", "外出": "#e8b090",
    "デジタル": "#88b0e8", "自己投資": "#b898e8", "休憩": "#e898b0", "仕事": "#bbb"
};

const icons = {
    "生活": "🏠", "家事": "🍳", "外出": "🚶", "デジタル": "📱", "自己投資": "📘", "休憩": "☕", "仕事": "💻",
    "睡眠": "😴", "食事": "🍽️", "お風呂": "🛁", "身支度": "🧴", "料理": "🍳", "掃除": "🧹", "買い出し": "🛒",
    "移動": "🚃", "外食": "🍔", "病院": "🏥", "用事": "📌", "レジャー": "🎡", "スマホ": "📱", "PC": "💻",
    "ゲーム": "🎮", "TV": "📺", "読書": "📚", "学習": "✏️", "運動": "🏃"
};

const NO_SUB_CATS = ["休憩", "仕事"];

let logs = [];
let currentTask = null;
let openEditIndex = -1;
let currentStatsPeriod = "day";
let statsGroupMode = "sub";
let selectedDate = getJSTDateStr();

// =========================================
// ユーティリティ
// =========================================
function getJSTDateStr(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function parseLocalDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0);
}

function fT(d, baseDateStr) {
    if (!d) return "00:00";
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    if (baseDateStr && getJSTDateStr(d) !== baseDateStr && d.getHours() === 0 && d.getMinutes() === 0) return "24:00";
    return `${h}:${m}`;
}

function getDurationMs(start, end) {
    if (!start || !end) return 0;
    const diff = end.getTime() - start.getTime();
    return diff > 0 ? diff : 0;
}

function formatDuration(ms) {
    if (ms <= 0) return "0分";
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h > 0 && m > 0) return `${h}時間${m}分`;
    if (h > 0) return `${h}時間`;
    return `${m}分`;
}

function addRipple(el, e) {
    const rect = el.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size/2}px;top:${e.clientY - rect.top - size/2}px;`;
    el.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove());
}

function getDarkColorForSub(sub) {
    for (const [cat, subs] of Object.entries(categories)) {
        if (subs.includes(sub)) return colorsDark[cat] || "#bbb";
    }
    return "#bbb";
}

function getMidColorForCat(cat) {
    return colorsMid[cat] || colors[cat] || "#ddd";
}

// =========================================
// 通信（キャッシュ付き）
// =========================================
function showLoading() { document.getElementById("full-loading").style.display = "flex"; }
function hideLoading() { document.getElementById("full-loading").style.display = "none"; }

function cacheKey(dateStr) { return `lifelog_cache_${dateStr}`; }
function saveCache(dateStr, data) {
    try { localStorage.setItem(cacheKey(dateStr), JSON.stringify(data)); } catch(e) {}
}
function loadCache(dateStr) {
    try {
        const raw = localStorage.getItem(cacheKey(dateStr));
        if (!raw) return null;
        return JSON.parse(raw).map(l => ({ ...l, start: new Date(l.start), end: new Date(l.end) }));
    } catch(e) { return null; }
}

async function fetchLogs(dateStr) {
    try {
        const res = await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ method: "load", date: dateStr }) });
        const data = await res.json();
        const parsed = (data || []).map(l => ({ ...l, start: new Date(l.start), end: new Date(l.end) }));
        saveCache(dateStr, parsed);
        return parsed;
    } catch(e) {
        return loadCache(dateStr) || [];
    }
}

async function pushLogs(dateStr, data) {
    saveCache(dateStr, data);
    try {
        await fetch(GAS_URL, { method: "POST", body: JSON.stringify({ method: "save", date: dateStr, data }) });
    } catch(e) { console.error("Save Error", e); }
}

async function saveTaskSplit(task) {
    const startStr = getJSTDateStr(task.start);
    const endStr   = getJSTDateStr(task.end);
    const boundary = parseLocalDate(endStr);
    const prevPart = { category: task.category, sub: task.sub, memo: task.memo, start: task.start, end: boundary };
    const nextPart = { category: task.category, sub: task.sub, memo: task.memo, start: boundary, end: task.end };
    const prevLogs = await fetchLogs(startStr);
    prevLogs.push(prevPart);
    await pushLogs(startStr, prevLogs);
    const nextLogs = await fetchLogs(endStr);
    nextLogs.push(nextPart);
    await pushLogs(endStr, nextLogs);
    if (endStr === selectedDate || startStr === selectedDate) {
        logs = await fetchLogs(selectedDate);
    }
}

// =========================================
// UI制御
// =========================================
function updateDateVisuals() {
    const d = parseLocalDate(selectedDate);
    const days = ["日","月","火","水","木","金","土"];
    document.getElementById("date-text").innerText = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} (${days[d.getDay()]})`;
    const isToday = (selectedDate === getJSTDateStr());
    document.getElementById("clock").style.display = isToday ? "block" : "none";
    document.getElementById("btn-go-today").style.display = isToday ? "none" : "block";
    document.getElementById("active-task-card").style.display = isToday ? "block" : "none";
    const mc = document.getElementById("main-controls");
    if (mc) mc.style.display = isToday ? "block" : "none";
}

// =========================================
// カテゴリグリッド
// =========================================
function renderCategoryGrid() {
    const gridEl = document.getElementById("category-grid");
    if (!gridEl) return;
    gridEl.innerHTML = "";
    Object.keys(categories).forEach(cat => {
        const div = document.createElement("div");
        div.className = "cat-item";
        div.style.backgroundColor = colors[cat];
        div.innerHTML = `<span style="font-size:22px;">${icons[cat]}</span><span>${cat}</span>`;
        div.addEventListener("click", (e) => {
            addRipple(div, e);
            if (NO_SUB_CATS.includes(cat)) {
                startTask(cat, categories[cat][0]);
            } else {
                showSubMenu(cat);
            }
        });
        gridEl.appendChild(div);
    });
}

function showSubMenu(cat) {
    const list = document.getElementById("sub-menu-list");
    document.getElementById("sub-menu-title").innerText = cat;
    list.innerHTML = "";
    categories[cat].forEach(sub => {
        const btn = document.createElement("div");
        btn.className = "sub-radial-item";
        btn.innerHTML = `${icons[sub] || ''} ${sub}`;
        btn.onclick = () => {
            document.getElementById("sub-menu-overlay").style.display = "none";
            startTask(cat, sub);
        };
        list.appendChild(btn);
    });
    document.getElementById("sub-menu-overlay").style.display = "flex";
}

// =========================================
// 計測中カードの描画
// =========================================
function renderActiveTask() {
    const display = document.getElementById("active-task-display");
    const statusEl = document.getElementById("active-status-label");
    const recordingArea = document.getElementById("recording-only-area");

    if (!currentTask) {
        display.innerHTML = `<span style="color:#aaa; font-size:13px;">記録は停止しています</span>`;
        statusEl.innerText = "● Stopped";
        statusEl.className = "active-status-dot stopped";
        recordingArea.style.display = "none";
        return;
    }

    statusEl.innerText = "● Recording";
    statusEl.className = "active-status-dot recording";
    recordingArea.style.display = "block";

    // 開始時刻をタイムライン表示と同じ 12px で中項目右隣に配置
    const startTimeStr = fT(new Date(currentTask.start));
    display.innerHTML = `
        <div class="active-task-main">
            <span class="task-cat-label">${icons[currentTask.category]} ${currentTask.category}</span>
            <span class="task-separator">＞</span>
            <span class="task-sub-label">${icons[currentTask.sub]} ${currentTask.sub}</span>
            <span class="task-start-badge">${startTimeStr}〜</span>
        </div>
    `;
}

// =========================================
// ログ描画
// =========================================
function renderLogs() {
    const list = document.getElementById("log-list");
    if (!list) return;
    list.innerHTML = "";

    // サマリー
    const dailyTotals = {};
    let grandMs = 0;
    logs.forEach(l => {
        const diff = getDurationMs(l.start, l.end);
        if (diff > 0) {
            dailyTotals[l.sub] = (dailyTotals[l.sub] || 0) + diff;
            grandMs += diff;
        }
    });

    const totalEl = document.getElementById("log-section-total");
    if (totalEl) totalEl.innerText = grandMs > 0 ? `合計 ${formatDuration(grandMs)}` : "";

    const detailsArea = document.getElementById("daily-summary-details");
    detailsArea.innerHTML = "";
    Object.keys(dailyTotals).sort((a,b) => dailyTotals[b] - dailyTotals[a]).forEach(sub => {
        const darkColor = getDarkColorForSub(sub);
        const div = document.createElement("div");
        div.className = "summary-detail-item";
        div.style.setProperty("--item-color", darkColor);
        div.innerHTML = `<span>${icons[sub] || ''} ${sub}</span><span style="color:#888;">${formatDuration(dailyTotals[sub])}</span>`;
        detailsArea.appendChild(div);
    });

    // ログを新しい順にソート
    const sortedLogs = [...logs].sort((a, b) => b.start - a.start);

    // =========================================
    // 計測中タスクと直近ログのギャップを履歴リスト最上部に表示
    // =========================================
    if (currentTask && sortedLogs.length > 0) {
        const latestLog = sortedLogs[0]; // 新しい順なので先頭が最新
        const gapMs = new Date(currentTask.start).getTime() - latestLog.end.getTime();

        if (gapMs >= 60000) {
            // 計測中タスクのダミー行（クリック不可・参照用）
            const currentRow = document.createElement("div");
            currentRow.style.cssText = "padding:6px 0 2px; opacity:0.55;";
            currentRow.innerHTML = `
                <span class="log-tag" style="background:${colors[currentTask.category] || '#eee'}">
                    ${icons[currentTask.sub] || ''} ${currentTask.sub}
                </span>
                <span style="font-size:12px; color:#999; margin-left:8px;">${fT(new Date(currentTask.start), selectedDate)}〜 計測中</span>
            `;
            list.appendChild(currentRow);

            // ギャップ行
            const gapRow = document.createElement("div");
            gapRow.className = "gap-add-row";
            gapRow.innerHTML = `
                <div class="gap-line"></div>
                <button class="btn-gap-add" onclick="addAtGap('${fT(latestLog.end)}','${fT(new Date(currentTask.start))}')">＋ ${formatDuration(gapMs)}の空きを埋める</button>
                <div class="gap-line"></div>
            `;
            list.appendChild(gapRow);
        }
    }

    // 通常ログ一覧
    sortedLogs.forEach((l, i) => {
        const idx = logs.indexOf(l);
        const diff = getDurationMs(l.start, l.end);
        const wrapper = document.createElement("div");
        wrapper.className = "log-item-wrapper";

        wrapper.innerHTML = `
            <div class="log-item" onclick="toggleInlineEdit(${idx})">
                <div style="flex:1;">
                    <span class="log-tag" style="background:${colors[l.category] || '#eee'}">${icons[l.sub] || ''} ${l.sub}</span>
                    <span style="font-size:12px; color:#999; margin-left:8px;">${fT(l.start, selectedDate)}〜${fT(l.end, selectedDate)} (${formatDuration(diff)})</span>
                    ${l.memo ? `<div style="font-size:11px; color:#888; margin-top:2px;">${l.memo}</div>` : ''}
                </div>
            </div>
        `;

        if (openEditIndex === idx) {
            const editPanel = document.createElement("div");
            editPanel.className = "inline-edit-panel";
            editPanel.innerHTML = `
                <div class="edit-grid">
                    <select id="edit-cat-${idx}">${Object.keys(categories).map(c => `<option value="${c}" ${c===l.category?'selected':''}>${c}</option>`).join("")}</select>
                    <select id="edit-sub-${idx}"></select>
                </div>
                <div class="edit-grid">
                    <input type="time" id="edit-start-${idx}" value="${fT(l.start)}">
                    <input type="time" id="edit-end-${idx}" value="${fT(l.end)}">
                </div>
                <textarea class="edit-memo-input" id="edit-memo-${idx}" placeholder="メモを入力...">${l.memo || ''}</textarea>
                <div class="edit-btns">
                    <button class="btn-save-inline" onclick="saveInlineEdit(${idx})">保存</button>
                    <button class="btn-delete-inline" onclick="deleteInlineEdit(${idx})">削除</button>
                    <button class="btn-close-inline" onclick="toggleInlineEdit(-1)">閉じる</button>
                </div>
            `;
            wrapper.appendChild(editPanel);
            setTimeout(() => {
                const cS = document.getElementById(`edit-cat-${idx}`);
                const sS = document.getElementById(`edit-sub-${idx}`);
                const up = () => sS.innerHTML = categories[cS.value].map(s => `<option value="${s}" ${s===l.sub?'selected':''}>${s}</option>`).join("");
                cS.onchange = up; up();
            }, 0);
        }
        list.appendChild(wrapper);

        // ログ間ギャップ
        if (i < sortedLogs.length - 1) {
            const nextL = sortedLogs[i + 1];
            const gapMs = l.start.getTime() - nextL.end.getTime();
            if (gapMs >= 60000) {
                const gapRow = document.createElement("div");
                gapRow.className = "gap-add-row";
                gapRow.innerHTML = `
                    <div class="gap-line"></div>
                    <button class="btn-gap-add" onclick="addAtGap('${fT(nextL.end)}','${fT(l.start)}')">＋ ${formatDuration(gapMs)}の空きを埋める</button>
                    <div class="gap-line"></div>
                `;
                list.appendChild(gapRow);
            }
        }
    });

    drawTimeline();
}

// =========================================
// タイムライン描画
// =========================================
function drawTimeline() {
    const bar = document.getElementById("bar");
    if (!bar) return;
    bar.querySelectorAll(".segment").forEach(s => s.remove());

    const base = parseLocalDate(selectedDate);
    logs.forEach(l => {
        const diff = getDurationMs(l.start, l.end);
        if (diff <= 0) return;
        const startMin = Math.max(0, (l.start.getTime() - base.getTime()) / 60000);
        const endMin   = Math.min(1440, (l.end.getTime() - base.getTime()) / 60000);
        if (startMin >= 1440 || endMin <= 0) return;
        const div = document.createElement("div");
        div.className = "segment";
        div.style.left  = (startMin / 14.4) + "%";
        div.style.width = Math.max((endMin - startMin) / 14.4, 0.5) + "%";
        div.style.background = getMidColorForCat(l.category);
        bar.appendChild(div);
    });
}

function addAtGap(s, e) {
    const newItem = {
        category: "休憩", sub: "休憩",
        start: new Date(selectedDate + "T" + s),
        end:   new Date(selectedDate + "T" + e),
        memo: ""
    };
    logs.push(newItem);
    openEditIndex = logs.indexOf(newItem);
    renderLogs();
}

// =========================================
// タスク操作
// =========================================
function startTask(cat, sub) {
    if (currentTask) {
        const snap = {
            category: currentTask.category,
            sub: currentTask.sub,
            memo: (document.getElementById("memo-input") || {}).value || "",
            start: new Date(currentTask.start),
            end: new Date()
        };
        _commitTask(snap);
    }
    currentTask = { category: cat, sub: sub, start: new Date(), memo: "" };
    localStorage.setItem("currentTask", JSON.stringify(currentTask));
    if (document.getElementById("memo-input")) document.getElementById("memo-input").value = "";
    renderActiveTask();
    renderLogs(); // ギャップ行を即時反映
}

async function _commitTask(task) {
    const startStr = getJSTDateStr(task.start);
    const endStr   = getJSTDateStr(task.end);
    if (startStr !== endStr) {
        await saveTaskSplit(task);
    } else {
        const dayLogs = await fetchLogs(startStr);
        dayLogs.push(task);
        await pushLogs(startStr, dayLogs);
        if (startStr === selectedDate) {
            logs = await fetchLogs(selectedDate);
        }
    }
    renderLogs();
}

async function endTask() {
    if (!currentTask) return;
    showLoading();
    const task = {
        category: currentTask.category,
        sub: currentTask.sub,
        memo: (document.getElementById("memo-input") || {}).value || "",
        start: new Date(currentTask.start),
        end: new Date()
    };
    currentTask = null;
    localStorage.removeItem("currentTask");
    if (document.getElementById("memo-input")) document.getElementById("memo-input").value = "";
    renderActiveTask();
    await _commitTask(task);
    hideLoading();
    renderLogs();
}

function renderActiveTask() {
    const display = document.getElementById("active-task-display");
    const statusEl = document.getElementById("active-status-label");
    const recordingArea = document.getElementById("recording-only-area");

    if (!currentTask) {
        display.innerHTML = `<span style="color:#aaa; font-size:13px;">記録は停止しています</span>`;
        statusEl.innerText = "● Stopped";
        statusEl.className = "active-status-dot stopped";
        recordingArea.style.display = "none";
        return;
    }

    statusEl.innerText = "● Recording";
    statusEl.className = "active-status-dot recording";
    recordingArea.style.display = "block";

    // 開始時刻をタイムライン表示（12px）と同サイズに
    const startTimeStr = fT(new Date(currentTask.start));
    display.innerHTML = `
        <div class="active-task-main">
            <span class="task-cat-label">${icons[currentTask.category]} ${currentTask.category}</span>
            <span class="task-separator">＞</span>
            <span class="task-sub-label">${icons[currentTask.sub]} ${currentTask.sub}</span>
            <span class="task-start-badge">${startTimeStr}〜</span>
        </div>
    `;
}

// =========================================
// インライン編集
// =========================================
function toggleInlineEdit(idx) { openEditIndex = (openEditIndex === idx) ? -1 : idx; renderLogs(); }

async function saveInlineEdit(idx) {
    showLoading();
    const l = logs[idx];
    const newCat  = document.getElementById(`edit-cat-${idx}`).value;
    const newSub  = document.getElementById(`edit-sub-${idx}`).value;
    const newMemo = document.getElementById(`edit-memo-${idx}`).value;
    const sVal = document.getElementById(`edit-start-${idx}`).value;
    const eVal = document.getElementById(`edit-end-${idx}`).value;
    let startObj = new Date(`${selectedDate}T${sVal}`);
    let endObj   = new Date(`${selectedDate}T${eVal}`);
    if (endObj <= startObj) endObj.setDate(endObj.getDate() + 1);
    const startStr = getJSTDateStr(startObj);
    const endStr   = getJSTDateStr(endObj);
    if (startStr !== endStr) {
        const boundary = parseLocalDate(endStr);
        logs[idx] = { category: newCat, sub: newSub, start: startObj, end: boundary, memo: newMemo };
        await pushLogs(selectedDate, logs);
        const nextLogs = await fetchLogs(endStr);
        nextLogs.push({ category: newCat, sub: newSub, start: boundary, end: endObj, memo: newMemo });
        await pushLogs(endStr, nextLogs);
    } else {
        l.category = newCat; l.sub = newSub; l.memo = newMemo;
        l.start = startObj; l.end = endObj;
        await pushLogs(selectedDate, logs);
    }
    openEditIndex = -1;
    logs = await fetchLogs(selectedDate);
    hideLoading();
    renderLogs();
}

async function deleteInlineEdit(idx) {
    if (confirm("削除しますか？")) {
        logs.splice(idx, 1);
        openEditIndex = -1;
        await pushLogs(selectedDate, logs);
        logs = await fetchLogs(selectedDate);
        renderLogs();
    }
}

// =========================================
// 統計
// =========================================
function renderStatsGroupToggle() {
    let toggle = document.getElementById("stats-group-toggle");
    if (!toggle) {
        toggle = document.createElement("div"); toggle.id = "stats-group-toggle";
        toggle.style.cssText = "display:flex;background:var(--bg-soft);border-radius:20px;padding:4px;margin-bottom:15px;";
        const pie = document.getElementById("pie-chart").parentNode;
        pie.parentNode.insertBefore(toggle, pie);
    }
    toggle.innerHTML = `
        <button onclick="setStatsGroup('sub')" style="flex:1;padding:7px 0;border:none;border-radius:16px;font-weight:700;font-size:12px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;background:${statsGroupMode==='sub'?'white':'transparent'};color:${statsGroupMode==='sub'?'var(--accent-warm)':'#999'};">中項目</button>
        <button onclick="setStatsGroup('cat')" style="flex:1;padding:7px 0;border:none;border-radius:16px;font-weight:700;font-size:12px;cursor:pointer;font-family:'Zen Maru Gothic',sans-serif;background:${statsGroupMode==='cat'?'white':'transparent'};color:${statsGroupMode==='cat'?'var(--accent-warm)':'#999'};">大項目</button>
    `;
}
function setStatsGroup(mode) { statsGroupMode = mode; updateStatsView(); }

function renderStatsChart(allLogs) {
    const totals = {}; let grandTotal = 0;
    allLogs.forEach(l => {
        const diff = getDurationMs(l.start, l.end);
        if (diff > 0) {
            const key = statsGroupMode === 'cat' ? l.category : l.sub;
            totals[key] = (totals[key] || 0) + diff;
            grandTotal += diff;
        }
    });
    renderStatsGroupToggle();
    const pie = document.getElementById("pie-chart");
    const legend = document.getElementById("stats-legend");
    pie.innerHTML = ""; legend.innerHTML = "";
    if (grandTotal === 0) {
        pie.style.background = "#f5f5f5";
        legend.innerHTML = `<div style="text-align:center;color:#aaa;font-size:12px;">データがありません</div>`;
        return;
    }
    const sortedKeys = Object.keys(totals).sort((a,b) => totals[b] - totals[a]);
    let gradient = ""; let currentDeg = 0;
    const size = 180, cx = 90, cy = 90, r = 58;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", size); svg.setAttribute("height", size);
    svg.style.cssText = "position:absolute;top:0;left:0;pointer-events:none;";
    sortedKeys.forEach(key => {
        const ratio = totals[key] / grandTotal;
        const deg = ratio * 360;
        const catKey = statsGroupMode === 'cat' ? key : (Object.keys(categories).find(c => categories[c].includes(key)) || key);
        const color     = colors[catKey]     || "#eee";
        const darkColor = colorsDark[catKey] || "#bbb";
        if (ratio > 0.05) {
            const midRad = ((currentDeg + deg / 2) - 90) * (Math.PI / 180);
            const x = cx + r * Math.cos(midRad);
            const y = cy + r * Math.sin(midRad);
            const t1 = document.createElementNS("http://www.w3.org/2000/svg", "text");
            t1.setAttribute("x", x); t1.setAttribute("y", y - 7);
            t1.setAttribute("text-anchor", "middle"); t1.setAttribute("dominant-baseline", "middle");
            t1.setAttribute("font-size", "13"); t1.textContent = icons[key] || icons[catKey] || '';
            svg.appendChild(t1);
            const t2 = document.createElementNS("http://www.w3.org/2000/svg", "text");
            t2.setAttribute("x", x); t2.setAttribute("y", y + 9);
            t2.setAttribute("text-anchor", "middle"); t2.setAttribute("dominant-baseline", "middle");
            t2.setAttribute("font-size", "9"); t2.setAttribute("font-weight", "700"); t2.setAttribute("fill", "#555");
            t2.textContent = `${Math.round(ratio*100)}%`;
            svg.appendChild(t2);
        }
        gradient += `${color} ${currentDeg}deg ${currentDeg + deg}deg, `;
        currentDeg += deg;
        const pct = Math.round(ratio * 100);
        const item = document.createElement("div");
        item.className = "legend-item";
        item.innerHTML = `
            <div class="legend-item-top">
                <div class="legend-item-label">
                    <span class="legend-color-box" style="background:${color}"></span>
                    ${icons[key] || icons[catKey] || ''} ${key}
                </div>
                <div class="legend-item-right">${pct}%・${formatDuration(totals[key])}</div>
            </div>
            <div class="legend-bar-track">
                <div class="legend-bar-fill" style="width:${pct}%; background:${darkColor};"></div>
            </div>
        `;
        legend.appendChild(item);
    });
    pie.style.cssText = "width:180px;height:180px;border-radius:50%;position:relative;box-shadow:inset 0 4px 10px rgba(0,0,0,0.1);";
    pie.style.background = `conic-gradient(${gradient.slice(0, -2)})`;
    pie.appendChild(svg);
}

async function updateStatsView() {
    const dates = getDateArray(currentStatsPeriod);
    const cachedResults = dates.map(d => loadCache(d) || []);
    renderStatsChart([].concat(...cachedResults));
    showLoading();
    const freshResults = await Promise.all(dates.map(d => fetchLogs(d)));
    renderStatsChart([].concat(...freshResults));
    hideLoading();
}

function getDateArray(p) {
    const b = parseLocalDate(selectedDate);
    let dates = [];
    if (p === "day") {
        dates.push(selectedDate);
        document.getElementById("stats-period-label").innerText = `${b.getMonth()+1}/${b.getDate()}の分析`;
    } else if (p === "week") {
        const diff = b.getDay() === 0 ? -6 : 1 - b.getDay();
        const mon = new Date(b); mon.setDate(b.getDate() + diff);
        for (let i = 0; i < 7; i++) { const d = new Date(mon); d.setDate(mon.getDate()+i); dates.push(getJSTDateStr(d)); }
        document.getElementById("stats-period-label").innerText = `${mon.getMonth()+1}/${mon.getDate()}〜の1週間`;
    } else {
        const m = b.getMonth(), y = b.getFullYear(), last = new Date(y, m+1, 0).getDate();
        for (let i = 1; i <= last; i++) dates.push(getJSTDateStr(new Date(y, m, i)));
        document.getElementById("stats-period-label").innerText = `${m+1}月の分析`;
    }
    return dates;
}

// =========================================
// クラウド読み込み
// =========================================
async function loadFromCloud() {
    const cached = loadCache(selectedDate);
    if (cached) {
        logs = cached;
        updateDateVisuals();
        renderCategoryGrid();
        renderLogs();
    } else {
        showLoading();
    }
    const fresh = await fetchLogs(selectedDate);
    logs = fresh;
    hideLoading();
    updateDateVisuals();
    renderCategoryGrid();
    renderLogs();
}

// =========================================
// 初期化
// =========================================
window.onload = () => {
    const bar = document.getElementById("bar");
    const scale = document.getElementById("timeline-scale");
    for (let h = 0; h <= 24; h++) {
        const grid = document.createElement("div");
        grid.className = "hour-grid"; grid.style.left = (h/24*100) + "%"; bar.appendChild(grid);
        if (h % 4 === 0) {
            const span = document.createElement("span");
            span.innerText = h; span.style.left = (h/24*100) + "%"; scale.appendChild(span);
        }
    }
    document.getElementById("tab-record-btn").onclick = () => {
        document.getElementById('page-record').classList.add('active');
        document.getElementById('page-stats').classList.remove('active');
        document.getElementById("tab-record-btn").classList.add('active');
        document.getElementById("tab-stats-btn").classList.remove('active');
        updateDateVisuals(); loadFromCloud();
    };
    document.getElementById("tab-stats-btn").onclick = () => {
        document.getElementById('page-stats').classList.add('active');
        document.getElementById('page-record').classList.remove('active');
        document.getElementById("tab-stats-btn").classList.add('active');
        document.getElementById("tab-record-btn").classList.remove('active');
        updateStatsView();
    };
    document.querySelectorAll(".stats-tab").forEach(t => {
        t.onclick = (e) => {
            document.querySelectorAll(".stats-tab").forEach(tab => tab.classList.remove("active"));
            e.target.classList.add("active");
            currentStatsPeriod = e.target.getAttribute("data-period");
            updateStatsView();
        };
    });
    document.getElementById("date-selector").onchange = (e) => {
        if (e.target.value) {
            selectedDate = e.target.value; updateDateVisuals();
            if (document.getElementById("page-stats").classList.contains("active")) updateStatsView();
            else loadFromCloud();
        }
    };
    document.getElementById("btn-go-today").onclick = () => {
        selectedDate = getJSTDateStr(); updateDateVisuals();
        if (document.getElementById("page-stats").classList.contains("active")) updateStatsView();
        else loadFromCloud();
    };
    document.getElementById("btn-stop-task-round").onclick = endTask;
    document.getElementById("btn-cancel-sub").onclick = () => {
        document.getElementById("sub-menu-overlay").style.display = "none";
    };
    document.getElementById("btn-refresh").onclick = () => {
        const btn = document.getElementById("btn-refresh");
        btn.classList.add("spinning");
        btn.addEventListener("animationend", () => btn.classList.remove("spinning"), { once: true });
        loadFromCloud();
    };

    loadFromCloud();

    const saved = localStorage.getItem("currentTask");
    if (saved) {
        currentTask = JSON.parse(saved);
        currentTask.start = new Date(currentTask.start);
        renderActiveTask();
    }

    setInterval(() => {
        const now = new Date();
        document.getElementById("clock").innerText = now.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' });
        if (currentTask) {
            const diff = Math.floor((now - currentTask.start) / 1000);
            const h = String(Math.floor(diff/3600)).padStart(2,"0");
            const m = String(Math.floor((diff%3600)/60)).padStart(2,"0");
            const s = String(diff%60).padStart(2,"0");
            document.getElementById("elapsed-timer").innerText = `${h}:${m}:${s}`;
        }
    }, 1000);
};