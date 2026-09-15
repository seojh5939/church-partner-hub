/**
 * church-partner-hub Frontend Application Logic
 * Communicates with Python backend via window.pywebview.api (JSON-RPC)
 */

// State
let currentMode = "MASTER";
let masterRecords = [];
let simpleRecords = [];
let stats = {};
let analyticsFilter = {
  region: "전체",
  denomination: "전체",
  scale: "전체",
};

// Wait for pywebview to initialize
window.addEventListener("pywebviewready", () => {
  console.log("pywebview API ready");
  updateConnectionBadge(true);
  loadInitialState();
});

// Fallback for direct browser preview
document.addEventListener("DOMContentLoaded", () => {
  setupTabs();
  setupModeSwitch();
  setupQuickSearch();
  setupFileOperations();
  setupAnalytics();

  // If pywebview is not loaded within 500ms, use mock data
  setTimeout(() => {
    if (!window.pywebview) {
      console.warn("pywebview not detected. Running in mock/preview mode.");
      updateConnectionBadge(false);
      loadMockInitialState();
    }
  }, 500);
});

function updateConnectionBadge(connected) {
  const badge = document.getElementById("connection-badge");
  if (badge) {
    badge.innerHTML = connected
      ? `<span class="badge-dot"></span> IPC Connected`
      : `<span class="badge-dot" style="background:#f59e0b"></span> Preview Mode`;
  }
}

// --- Security Helpers (XSS & URL sanitization) ---

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeUrl(url) {
  if (!url) return "";
  const clean = String(url).trim();
  if (/^https?:\/\//i.test(clean)) {
    return clean;
  }
  return "#";
}

// --- IPC Communication Helpers ---

async function callApi(method, ...args) {
  if (window.pywebview && window.pywebview.api && typeof window.pywebview.api[method] === "function") {
    try {
      const res = await window.pywebview.api[method](...args);
      if (res && res.success) {
        return res.data;
      } else {
        showToast(res ? res.error : "오류가 발생했습니다.");
        return null;
      }
    } catch (err) {
      console.error(`IPC Call Error [${method}]:`, err);
      showToast("백엔드 통신 오류: " + err.message);
      return null;
    }
  }
  console.warn(`Mock call for: ${method}`);
  return null;
}

// --- State Management ---

async function loadInitialState() {
  const data = await callApi("get_initial_state");
  if (data) {
    currentMode = data.mode;
    masterRecords = data.master_records || [];
    simpleRecords = data.simple_records || [];
    stats = data.stats || {};
    renderModeUI();
    renderDashboard();
    renderGroundingList();
    renderAnalytics();
  }
}

function loadMockInitialState() {
  masterRecords = [
    {
      row_id: 1,
      region: "광주",
      classification: "이사교회",
      church_name: "광주겨자씨교회",
      pastor: "나학수",
      address: "광주광역시 남구 봉선로 12",
      denomination: "예장합동",
      congregation_size: 3500,
      tier: "A",
      temperature: "Hot",
      management_type: "본부집중",
      primary_campaign: "희망친구 결연",
      primary_campaign_date: "2026-03-15",
      campaign_status: "제안완료",
      followup_campaign: "국내위기가정지원",
      next_action: "추진위원회 방문 미팅",
      next_contact_date: "2026-09-25",
      remarks: "담임목사님 창립기념 선물 발송 완료",
      zip_code: "61642",
      homepage: "http://www.mustardseed.or.kr",
      verification_status: "승인완료",
      homepage_status: "확인완료",
      scale_tier: "초대형 (3000~)",
    },
    {
      row_id: 2,
      region: "광주",
      classification: "타겟교회",
      church_name: "광주동성교회",
      pastor: "안성주",
      address: "",
      denomination: "예장통합",
      congregation_size: 800,
      tier: "B",
      temperature: "Warm",
      management_type: "지역본부",
      primary_campaign: "긴급구호",
      primary_campaign_date: "2026-05-10",
      campaign_status: "검토중",
      followup_campaign: "우물파기",
      next_action: "자료 이메일 발송",
      next_contact_date: "2026-09-20",
      remarks: "주소 확인 후 공문 발송 요청",
      zip_code: "",
      homepage: "",
      verification_status: "미검증",
      homepage_status: "미검증",
      scale_tier: "중대형 (500~1000)",
    },
  ];

  simpleRecords = [
    {
      row_id: 1,
      church_name: "광주겨자씨교회",
      pastor: "나학수",
      region: "광주",
      road_address: "광주광역시 남구 봉선로 12",
      zip_code: "61642",
      homepage: "http://www.mustardseed.or.kr",
      address_status: "확인완료",
      homepage_status: "확인완료",
    },
    {
      row_id: 2,
      church_name: "광주동성교회",
      pastor: "안성주",
      region: "광주",
      road_address: "",
      zip_code: "",
      homepage: "",
      address_status: "미검증",
      homepage_status: "미검증",
    },
  ];

  stats = {
    total_count: 2,
    verified_address_count: 1,
    missing_address_count: 1,
    verified_homepage_count: 1,
  };

  renderModeUI();
  renderDashboard();
  renderGroundingList();
  renderAnalytics();
}

// --- Mode Switcher ---

function setupModeSwitch() {
  const btnMaster = document.getElementById("mode-master-btn");
  const btnSimple = document.getElementById("mode-simple-btn");

  btnMaster.addEventListener("click", async () => {
    if (currentMode !== "MASTER") {
      await switchMode("MASTER");
    }
  });

  btnSimple.addEventListener("click", async () => {
    if (currentMode !== "SIMPLE") {
      await switchMode("SIMPLE");
    }
  });
}

async function switchMode(mode) {
  currentMode = mode;
  if (window.pywebview) {
    const res = await callApi("switch_mode", mode);
    if (res) stats = res.stats;
  }
  renderModeUI();
  renderDashboard();
  renderGroundingList();
  renderAnalytics();
  showToast(`${mode === "MASTER" ? "마스터 관리 모드" : "간편 주소록 모드"}로 전환되었습니다.`);
}

function renderModeUI() {
  const btnMaster = document.getElementById("mode-master-btn");
  const btnSimple = document.getElementById("mode-simple-btn");
  const analyticsTabBtn = document.getElementById("tab-btn-analytics");

  if (currentMode === "MASTER") {
    btnMaster.classList.add("active");
    btnSimple.classList.remove("active");
    if (analyticsTabBtn) analyticsTabBtn.style.display = "flex";
  } else {
    btnSimple.classList.add("active");
    btnMaster.classList.remove("active");
    if (analyticsTabBtn) analyticsTabBtn.style.display = "none";
  }
}

// --- Tabs ---

function setupTabs() {
  const tabs = document.querySelectorAll(".tab-item");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");

      const targetId = tab.dataset.tab;
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) targetPanel.classList.add("active");

      if (targetId === "tab-quick") {
        document.getElementById("quick-search-input").focus();
      } else if (targetId === "tab-analytics") {
        renderAnalytics();
      }
    });
  });
}

// --- Dashboard Rendering ---

function renderDashboard() {
  const records = currentMode === "MASTER" ? masterRecords : simpleRecords;

  // KPIs
  document.getElementById("kpi-total").innerText = records.length;
  const verifiedCount =
    currentMode === "MASTER"
      ? records.filter((r) => r.verification_status === "승인완료").length
      : records.filter((r) => r.address_status === "확인완료").length;
  document.getElementById("kpi-verified").innerText = verifiedCount;

  const hpCount = records.filter((r) => r.homepage_status === "확인완료").length;
  document.getElementById("kpi-homepage").innerText = hpCount;
  document.getElementById("kpi-missing").innerText = records.length - verifiedCount;

  // Table
  const headerRow = document.getElementById("table-header-row");
  const tbody = document.getElementById("table-body");
  headerRow.innerHTML = "";
  tbody.innerHTML = "";

  if (currentMode === "MASTER") {
    headerRow.innerHTML = `
      <th>ID</th>
      <th>지역</th>
      <th>구분</th>
      <th>교회명</th>
      <th>담임목사</th>
      <th>교단</th>
      <th>성도수(명)</th>
      <th>규모분류</th>
      <th>도로명 주소</th>
      <th>우편번호</th>
      <th>공식 홈페이지</th>
      <th>주소상태</th>
      <th>홈페이지상태</th>
      <th>1차 제안사업</th>
      <th>다음 액션</th>
    `;

    records.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.row_id}</td>
        <td><strong>${escapeHtml(r.region)}</strong></td>
        <td>${escapeHtml(r.classification) || "-"}</td>
        <td><strong>${escapeHtml(r.church_name)}</strong></td>
        <td>${escapeHtml(r.pastor)}</td>
        <td>${escapeHtml(r.denomination) || "-"}</td>
        <td>${r.congregation_size ? r.congregation_size.toLocaleString() : "-"}</td>
        <td><span class="badge badge-primary">${escapeHtml(r.scale_tier) || "-"}</span></td>
        <td>${r.address ? escapeHtml(r.address) : '<span style="color:#94a3b8">(주소 누락)</span>'}</td>
        <td>${escapeHtml(r.zip_code) || "-"}</td>
        <td>${r.homepage ? `<a href="${sanitizeUrl(r.homepage)}" target="_blank" style="color:var(--primary)">${escapeHtml(r.homepage)}</a>` : "-"}</td>
        <td>${renderStatusBadge(r.verification_status)}</td>
        <td>${renderStatusBadge(r.homepage_status)}</td>
        <td>${escapeHtml(r.primary_campaign) || "-"}</td>
        <td>${escapeHtml(r.next_action) || "-"}</td>
      `;
      tbody.appendChild(tr);
    });
  } else {
    // Simple Mode: 7 columns
    headerRow.innerHTML = `
      <th>ID</th>
      <th>교회명</th>
      <th>담임목사</th>
      <th>지역</th>
      <th>도로명 주소</th>
      <th>우편번호</th>
      <th>공식 홈페이지</th>
      <th>검증 상태</th>
    `;

    records.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.row_id}</td>
        <td><strong>${escapeHtml(r.church_name)}</strong></td>
        <td>${escapeHtml(r.pastor)}</td>
        <td>${escapeHtml(r.region)}</td>
        <td>${r.road_address ? escapeHtml(r.road_address) : '<span style="color:#94a3b8">(주소 미검증)</span>'}</td>
        <td>${escapeHtml(r.zip_code) || "-"}</td>
        <td>${r.homepage ? `<a href="${sanitizeUrl(r.homepage)}" target="_blank" style="color:var(--primary)">${escapeHtml(r.homepage)}</a>` : "-"}</td>
        <td>${renderStatusBadge(r.address_status)}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

function renderStatusBadge(status) {
  if (status === "승인완료" || status === "확인완료") {
    return `<span class="badge badge-success">${status}</span>`;
  }
  if (status === "미검증") {
    return `<span class="badge badge-warning">${status}</span>`;
  }
  if (status === "불확실" || status === "보류") {
    return `<span class="badge badge-danger">${status}</span>`;
  }
  return `<span class="badge badge-secondary">${status || "-"}</span>`;
}

// --- Grounding Studio (Address & Homepage) ---

function renderGroundingList() {
  const records = currentMode === "MASTER" ? masterRecords : simpleRecords;
  const listContainer = document.getElementById("grounding-church-list");
  listContainer.innerHTML = "";

  records.forEach((r) => {
    const isUnverified =
      currentMode === "MASTER"
        ? r.verification_status !== "승인완료" || r.homepage_status !== "확인완료"
        : r.address_status !== "확인완료" || r.homepage_status !== "확인완료";

    const item = document.createElement("div");
    item.style.padding = "10px 14px";
    item.style.borderBottom = "1px solid var(--border)";
    item.style.cursor = "pointer";
    item.style.display = "flex";
    item.style.justifyContent = "space-between";
    item.style.alignItems = "center";
    item.setAttribute("role", "button");
    item.setAttribute("tabindex", "0");
    item.setAttribute("aria-label", `${r.church_name} ${r.pastor} 목사 주소 검증 선택`);

    const churchAddr = r.address || r.road_address || "누락";
    item.innerHTML = `
      <div>
        <div style="font-weight:600">${escapeHtml(r.church_name)} (${escapeHtml(r.pastor)})</div>
        <div style="font-size:12px;color:var(--text-muted)">${escapeHtml(r.region)} | 주소: ${escapeHtml(churchAddr)}</div>
      </div>
      <div>
        ${isUnverified ? '<span class="badge badge-warning">검증 필요</span>' : '<span class="badge badge-success">완료</span>'}
      </div>
    `;

    item.addEventListener("click", () => loadGroundingDetail(r));
    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        loadGroundingDetail(r);
      }
    });
    listContainer.appendChild(item);
  });

  // Default select first item
  if (records.length > 0) {
    loadGroundingDetail(records[1] || records[0]);
  }
}

async function loadGroundingDetail(record) {
  const detailContainer = document.getElementById("grounding-card-detail");
  detailContainer.innerHTML = `
    <div style="font-size:15px;margin-bottom:12px">
      <strong>${escapeHtml(record.church_name)}</strong> (${escapeHtml(record.pastor)} 목사 / ${escapeHtml(record.region)})
    </div>
    <div style="color:var(--text-muted);font-size:13px;margin-bottom:16px">
      포털 지도 및 웹 검색을 통해 도로명 주소와 공식 홈페이지를 2단계로 연계 추정합니다.
    </div>
    <div id="grounding-search-spinner" style="padding:20px;text-align:center;color:var(--text-muted)">
      🔍 주소 및 홈페이지 후보를 탐색하는 중...
    </div>
  `;

  // Search Address
  let addrCandidates = [];
  if (window.pywebview) {
    const res = await callApi("search_address", record.row_id, currentMode);
    if (res) addrCandidates = res.candidates || [];
  } else {
    // Mock candidate
    addrCandidates = [
      {
        road_address: "광주광역시 동구 필문대로 205",
        zip_code: "61448",
        confidence: 94,
        confidence_level: "HIGH",
        match_evidence: `네이버 지도 대표자 '${record.pastor}' 목사 일치 확인`,
        map_url: `https://map.naver.com/p/search/${record.region}%20${record.church_name}`,
      },
    ];
  }

  // Search Homepage with Cascading Uncertainty
  let hpCandidate = null;
  if (window.pywebview) {
    const res = await callApi("search_homepage", record.row_id, currentMode);
    if (res) hpCandidate = res.candidate;
  } else {
    const isAddrConfirmed = record.address || record.road_address;
    hpCandidate = {
      url: "http://www.gjdongsung.or.kr",
      title: `${record.church_name} 공식 홈페이지`,
      confidence_level: isAddrConfirmed ? "HIGH" : "LOW",
      evidence: isAddrConfirmed
        ? "푸터 주소 일치 확인"
        : "⚠️ 1차 교회 주소 불확실에 따른 홈페이지 검증 보류 (Cascading Uncertainty)",
      is_dependent_uncertain: !isAddrConfirmed,
    };
  }

  renderGroundingDetailCard(record, addrCandidates, hpCandidate);
}

function renderGroundingDetailCard(record, addrCandidates, hpCandidate) {
  const detailContainer = document.getElementById("grounding-card-detail");
  const bestAddr = addrCandidates[0] || { road_address: "검색 결과 없음", zip_code: "", confidence: 0, confidence_level: "LOW", match_evidence: "" };

  detailContainer.innerHTML = `
    <div style="font-size:16px;font-weight:700;margin-bottom:6px">
      ${escapeHtml(record.church_name)} <span style="font-size:13px;font-weight:400;color:var(--text-muted)">(${escapeHtml(record.pastor)} 목사 / ${escapeHtml(record.region)})</span>
    </div>
    
    <div class="grounding-grid" style="margin-top:16px">
      <!-- 1단계: 도로명 주소 검증 -->
      <div class="grounding-box">
        <div class="box-title">
          <span>📍 1단계: 도로명 주소 추정</span>
          <span class="badge ${bestAddr.confidence_level === 'HIGH' ? 'badge-success' : 'badge-warning'}">
            신뢰도 ${bestAddr.confidence}% (${escapeHtml(bestAddr.confidence_level)})
          </span>
        </div>
        <div style="font-size:14px;font-weight:600;margin-bottom:4px">${escapeHtml(bestAddr.road_address)}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">우편번호: ${escapeHtml(bestAddr.zip_code) || "자동부여"} | 근거: ${escapeHtml(bestAddr.match_evidence)}</div>
        ${bestAddr.map_url ? `<a href="${sanitizeUrl(bestAddr.map_url)}" target="_blank" class="btn btn-secondary btn-sm" style="margin-bottom:12px">🗺️ 포털 지도 확인</a>` : ''}
        
        <div>
          <button class="btn btn-primary btn-sm" id="btn-approve-address">주소 원클릭 확정</button>
          <button class="btn btn-secondary btn-sm" id="btn-manual-address">직접 수정</button>
        </div>
      </div>

      <!-- 2단계: 주소 종속형 홈페이지 검증 -->
      <div class="grounding-box">
        <div class="box-title">
          <span>🌐 2단계: 공식 홈페이지 대조</span>
          <span class="badge ${hpCandidate && hpCandidate.confidence_level === 'HIGH' ? 'badge-success' : 'badge-danger'}">
            ${hpCandidate ? escapeHtml(hpCandidate.confidence_level) : 'LOW'}
          </span>
        </div>
        <div style="font-size:14px;font-weight:600;margin-bottom:4px;word-break:break-all">
          ${hpCandidate && hpCandidate.url ? `<a href="${sanitizeUrl(hpCandidate.url)}" target="_blank" style="color:var(--primary)">${escapeHtml(hpCandidate.url)}</a>` : '검색된 URL 없음'}
        </div>
        
        <div style="font-size:12px;color:${hpCandidate && hpCandidate.is_dependent_uncertain ? 'var(--danger)' : 'var(--text-muted)'};margin-bottom:12px;line-height:1.4">
          ${hpCandidate ? escapeHtml(hpCandidate.evidence) : '주소 검증 후 확인 가능'}
        </div>

        <div>
          <button class="btn btn-primary btn-sm" id="btn-approve-homepage" ${hpCandidate && hpCandidate.is_dependent_uncertain ? 'disabled style="opacity:0.5"' : ''}>
            홈페이지 확정
          </button>
          <button class="btn btn-secondary btn-sm" id="btn-recheck-homepage">재검증</button>
        </div>
      </div>
    </div>
  `;

  // Event handlers
  document.getElementById("btn-approve-address").addEventListener("click", async () => {
    if (window.pywebview) {
      await callApi("confirm_address", record.row_id, bestAddr.road_address, bestAddr.zip_code, currentMode);
      await loadInitialState();
    } else {
      if (currentMode === "MASTER") {
        record.address = bestAddr.road_address;
        record.zip_code = bestAddr.zip_code;
        record.verification_status = "승인완료";
      } else {
        record.road_address = bestAddr.road_address;
        record.zip_code = bestAddr.zip_code;
        record.address_status = "확인완료";
      }
      renderDashboard();
    }
    showToast(`'${record.church_name}' 주소가 확정되었습니다. 홈페이지 검증을 진행합니다.`);
    loadGroundingDetail(record);
  });

  document.getElementById("btn-approve-homepage").addEventListener("click", async () => {
    if (hpCandidate && hpCandidate.url) {
      if (window.pywebview) {
        await callApi("confirm_homepage", record.row_id, hpCandidate.url, currentMode);
        await loadInitialState();
      } else {
        record.homepage = hpCandidate.url;
        record.homepage_status = "확인완료";
        renderDashboard();
      }
      showToast(`'${record.church_name}' 공식 홈페이지가 확정되었습니다.`);
      loadGroundingDetail(record);
    }
  });

  document.getElementById("btn-recheck-homepage").addEventListener("click", () => {
    showToast("홈페이지와 주소 일치 여부를 재검증합니다...");
    loadGroundingDetail(record);
  });
}

// --- Quick Dispatcher ---

function setupQuickSearch() {
  const input = document.getElementById("quick-search-input");
  input.addEventListener("input", async (e) => {
    const kw = e.target.value;
    let results = [];
    if (window.pywebview) {
      const res = await callApi("quick_search", kw);
      if (res) results = res.results || [];
    } else {
      const source = currentMode === "MASTER" ? masterRecords : simpleRecords;
      results = source.filter(
        (r) =>
          r.church_name.includes(kw) ||
          r.pastor.includes(kw) ||
          r.region.includes(kw)
      );
    }
    renderQuickSearchResults(results);
  });
}

function renderQuickSearchResults(results) {
  const container = document.getElementById("quick-search-results");
  container.innerHTML = "";

  if (results.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)">검색 결과가 없습니다.</div>`;
    return;
  }

  results.forEach((r) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.marginBottom = "14px";
    const churchAddr = r.address || r.road_address || '<span style="color:#ef4444">주소 누락</span>';
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:16px;font-weight:700">${escapeHtml(r.church_name)}</div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:2px">
            담임목사: <strong>${escapeHtml(r.pastor)}</strong> | 지역: ${escapeHtml(r.region)} | 우편번호: ${escapeHtml(r.zip_code) || "-"}
          </div>
          <div style="font-size:13px;margin-top:6px">주소: ${r.address || r.road_address ? escapeHtml(r.address || r.road_address) : '<span style="color:#ef4444">주소 누락</span>'}</div>
          ${r.homepage ? `<div style="font-size:12px;color:var(--primary);margin-top:4px">홈페이지: <a href="${sanitizeUrl(r.homepage)}" target="_blank">${escapeHtml(r.homepage)}</a></div>` : ''}
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="copyDispatchText('OFFICIAL', ${r.row_id})">📄 공문용 복사</button>
          <button class="btn btn-secondary btn-sm" onclick="copyDispatchText('PACKAGE', ${r.row_id})">📦 택배/선물용 복사</button>
          <button class="btn btn-secondary btn-sm" onclick="copyDispatchText('TSV', ${r.row_id})">📋 엑셀 TSV 복사</button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

window.copyDispatchText = async function (type, rowId) {
  let text = "";
  const fmtKey = type === "OFFICIAL" ? "official" : type === "PACKAGE" ? "parcel" : "tsv";

  if (window.pywebview) {
    const res = await callApi("copy_dispatch_text", rowId, fmtKey, currentMode);
    if (res && res.text) {
      text = res.text;
    }
  }

  // Fallback if IPC didn't return text
  if (!text) {
    const records = currentMode === "MASTER" ? masterRecords : simpleRecords;
    const r = records.find((item) => item.row_id === rowId);
    if (!r) return;

    const addr = r.address || r.road_address || "";
    const zip = r.zip_code || "";
    if (type === "OFFICIAL") {
      text = `[공문 발송 규격]\n수신: ${r.church_name} (${r.pastor} 목사 귀하)\n주소: ${zip ? `(${zip}) ` : ""}${addr}`;
    } else if (type === "PACKAGE") {
      text = `[택배/선물 발송 정보]\n받는분: ${r.pastor} 목사 (${r.church_name})\n우편번호: ${zip || "미입력"}\n배송주소: ${addr}`;
    } else {
      text = `${r.church_name}\t${r.pastor}\t${r.region}\t${zip}\t${addr}\t${r.homepage || ""}`;
    }
  }

  navigator.clipboard.writeText(text).then(() => {
    showToast(`클립보드에 복사되었습니다 (${type === "OFFICIAL" ? "공문용" : type === "PACKAGE" ? "택배/선물용" : "TSV"}).`);
  }).catch((err) => {
    console.error("Clipboard copy failed:", err);
    showToast("클립보드 복사에 실패했습니다.");
  });
};

function setupFileOperations() {
  const btnOpen = document.getElementById("btn-open-excel");
  if (btnOpen) {
    btnOpen.addEventListener("click", async () => {
      if (window.pywebview) {
        showToast("파일 선택 대화상자를 여는 중입니다...");
        const res = await callApi("load_excel");
        if (res) {
          currentMode = res.mode;
          masterRecords = res.master_records || [];
          simpleRecords = res.simple_records || [];
          stats = res.stats || {};
          updateLoadedFileIndicator(res.file_path);
          renderModeUI();
          renderDashboard();
          renderGroundingList();
          renderAnalytics();
          showToast(`파일 로드 완료 (${res.mode === "MASTER" ? "마스터 관리 모드" : "간편 주소록 모드"}, 총 ${res.total_count || masterRecords.length || simpleRecords.length}건)`);
        }
      } else {
        showToast("데스크톱 모드(pywebview)에서 엑셀 파일 열기가 지원됩니다.");
      }
    });
  }

  const btnSave = document.getElementById("btn-save-excel");
  if (btnSave) {
    btnSave.addEventListener("click", async () => {
      if (window.pywebview) {
        showToast("저장 중입니다...");
        const res = await callApi("save_excel");
        if (res) {
          updateLoadedFileIndicator(res.file_path);
          showToast(`파일 저장 완료: ${res.file_path}`);
        }
      } else {
        showToast("데스크톱 모드에서 저장이 지원됩니다.");
      }
    });
  }

  const btnExport = document.getElementById("btn-export-excel");
  if (btnExport) {
    btnExport.addEventListener("click", async () => {
      if (window.pywebview) {
        if (currentMode === "SIMPLE") {
          showToast("간편 주소록(7개 정제 컬럼)을 내보내는 중입니다...");
          const res = await callApi("export_simple_address_book");
          if (res) showToast(`간편 주소록 내보내기 완료: ${res.file_path}`);
        } else {
          showToast("마스터 엑셀을 내보내는 중입니다...");
          const res = await callApi("save_excel");
          if (res) showToast(`마스터 엑셀 저장 완료: ${res.file_path}`);
        }
      } else {
        showToast("데스크톱 모드에서 내보내기가 지원됩니다.");
      }
    });
  }

  const btnExportDispatch = document.getElementById("btn-export-dispatch");
  if (btnExportDispatch) {
    btnExportDispatch.addEventListener("click", async () => {
      if (window.pywebview) {
        showToast("발송 명단 엑셀을 생성하는 중입니다...");
        const res = await callApi("export_dispatch_list");
        if (res) showToast(`발송 명단 엑셀 저장 완료 (${res.count}건): ${res.file_path}`);
      } else {
        showToast("데스크톱 모드에서 발송 명단 엑셀 저장이 가능합니다.");
      }
    });
  }
}

function updateLoadedFileIndicator(filePath) {
  const indicator = document.getElementById("loaded-file-indicator");
  if (indicator) {
    if (filePath) {
      const fileName = filePath.split(/[\\/]/).pop();
      indicator.innerText = `현재 파일: ${fileName} (${filePath})`;
    } else {
      indicator.innerText = "현재 파일: 샘플 데이터";
    }
  }
}

// --- Phase 4: Analytics, Crosstab Matrix & Drill-down Logic ---

const SCALE_COLORS = {
  "소형 (~100)": "#10b981",
  "중형 (100~500)": "#06b6d4",
  "중대형 (500~1000)": "#3b82f6",
  "대형 (1000~3000)": "#f59e0b",
  "초대형 (3000~)": "#ef4444",
  "미입력": "#94a3b8",
};

const SCALE_CATEGORIES_LIST = [
  "소형 (~100)",
  "중형 (100~500)",
  "중대형 (500~1000)",
  "대형 (1000~3000)",
  "초대형 (3000~)",
  "미입력",
];

function classifyScaleFrontend(size) {
  if (size === null || size === undefined || size <= 0) return "미입력";
  if (size < 100) return "소형 (~100)";
  if (size < 500) return "중형 (100~500)";
  if (size < 1000) return "중대형 (500~1000)";
  if (size < 3000) return "대형 (1000~3000)";
  return "초대형 (3000~)";
}

function setupAnalytics() {
  const regionSelect = document.getElementById("analytics-region-select");
  if (regionSelect) {
    regionSelect.addEventListener("change", (e) => {
      analyticsFilter.region = e.target.value;
      renderAnalytics();
    });
  }

  const btnReset = document.getElementById("btn-reset-analytics-filter");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      resetAnalyticsFilter();
    });
  }
}

function resetAnalyticsFilter() {
  analyticsFilter.region = "전체";
  analyticsFilter.denomination = "전체";
  analyticsFilter.scale = "전체";
  const regionSelect = document.getElementById("analytics-region-select");
  if (regionSelect) regionSelect.value = "전체";
  renderAnalytics();
}

function setAnalyticsFilter(field, value) {
  if (analyticsFilter[field] === value) {
    analyticsFilter[field] = "전체";
  } else {
    analyticsFilter[field] = value;
  }
  renderAnalytics();
}

function setAnalyticsCellFilter(denom, scale) {
  if (analyticsFilter.denomination === denom && analyticsFilter.scale === scale) {
    analyticsFilter.denomination = "전체";
    analyticsFilter.scale = "전체";
  } else {
    analyticsFilter.denomination = denom;
    analyticsFilter.scale = scale;
  }
  renderAnalytics();
}

async function renderAnalytics() {
  let data = null;

  if (window.pywebview) {
    const reg = analyticsFilter.region === "전체" ? null : analyticsFilter.region;
    const den = analyticsFilter.denomination === "전체" ? null : analyticsFilter.denomination;
    const sca = analyticsFilter.scale === "전체" ? null : analyticsFilter.scale;
    data = await callApi("get_analytics", reg, den, sca);
  }

  if (!data) {
    // Preview / Mock Fallback
    data = calculateMockAnalytics(masterRecords, analyticsFilter);
  }

  if (!data) return;

  // 1. Update Region Select Options
  updateRegionSelectOptions(data.regional_breakdown);

  // 2. Summary Metric Cards
  const summary = data.summary || {};
  const elTotalChurches = document.getElementById("analytics-total-churches");
  const elRegionalShare = document.getElementById("analytics-regional-share");
  const elTotalMembers = document.getElementById("analytics-total-members");
  const elEnteredCount = document.getElementById("analytics-entered-count");
  const elAvgMembers = document.getElementById("analytics-avg-members");
  const elMaxMinMembers = document.getElementById("analytics-max-min-members");
  const elEnteredRatio = document.getElementById("analytics-entered-ratio");
  const elMissingCount = document.getElementById("analytics-missing-count");

  if (elTotalChurches) elTotalChurches.innerText = `${summary.total_churches || 0}개`;
  if (elRegionalShare) {
    elRegionalShare.innerText =
      analyticsFilter.region !== "전체"
        ? `선택 지역: ${analyticsFilter.region}`
        : "전체 지역 기준";
  }
  if (elTotalMembers) elTotalMembers.innerText = `${(summary.total_members || 0).toLocaleString()}명`;
  if (elEnteredCount) elEnteredCount.innerText = `${summary.entered_count || 0}개 교회 합산`;
  if (elAvgMembers) elAvgMembers.innerText = `${(summary.avg_members || 0).toLocaleString()}명`;
  if (elMaxMinMembers) {
    elMaxMinMembers.innerText = `최대 ${(summary.max_members || 0).toLocaleString()}명 / 최소 ${(summary.min_members || 0).toLocaleString()}명`;
  }
  if (elEnteredRatio) elEnteredRatio.innerText = `${summary.entered_ratio || 0}%`;
  if (elMissingCount) elMissingCount.innerText = `미입력 ${summary.missing_count || 0}개`;

  // 3. Denomination Distribution Bars
  const denomContainer = document.getElementById("analytics-denom-list");
  if (denomContainer) {
    denomContainer.innerHTML = "";
    const denoms = data.denomination_distribution || [];
    if (denoms.length === 0) {
      denomContainer.innerHTML = `<div style="font-size:13px;color:var(--text-muted);padding:8px">데이터가 없습니다.</div>`;
    } else {
      denoms.forEach((d) => {
        const isActive = analyticsFilter.denomination === d.name;
        const row = document.createElement("div");
        row.className = `analytics-bar-item ${isActive ? "active" : ""}`;
        row.title = `클릭 시 [${d.name}] 필터링`;
        row.onclick = () => setAnalyticsFilter("denomination", d.name);
        row.innerHTML = `
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
            <span style="font-weight:${isActive ? "700" : "500"};color:${isActive ? "var(--primary)" : "inherit"}">
              ${escapeHtml(d.name)}
            </span>
            <strong style="font-size:12px">${d.count}개 (${d.ratio}%)</strong>
          </div>
          <div style="background:#e2e8f0;height:8px;border-radius:4px;overflow:hidden">
            <div style="background:var(--primary);width:${d.ratio}%;height:100%"></div>
          </div>
        `;
        denomContainer.appendChild(row);
      });
    }
  }

  // 4. Scale Distribution Bars
  const scaleContainer = document.getElementById("analytics-scale-list");
  if (scaleContainer) {
    scaleContainer.innerHTML = "";
    const scales = data.scale_distribution || [];
    if (scales.length === 0) {
      scaleContainer.innerHTML = `<div style="font-size:13px;color:var(--text-muted);padding:8px">데이터가 없습니다.</div>`;
    } else {
      scales.forEach((t) => {
        const isActive = analyticsFilter.scale === t.scale;
        const color = SCALE_COLORS[t.scale] || "var(--success)";
        const row = document.createElement("div");
        row.className = `analytics-bar-item ${isActive ? "active" : ""}`;
        row.title = `클릭 시 [${t.scale}] 필터링`;
        row.onclick = () => setAnalyticsFilter("scale", t.scale);
        row.innerHTML = `
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
            <span style="font-weight:${isActive ? "700" : "500"};color:${isActive ? "var(--primary)" : "inherit"}">
              ${escapeHtml(t.scale)}
            </span>
            <strong style="font-size:12px">${t.count}개 (${t.ratio}%)</strong>
          </div>
          <div style="background:#e2e8f0;height:8px;border-radius:4px;overflow:hidden">
            <div style="background:${color};width:${t.ratio}%;height:100%"></div>
          </div>
        `;
        scaleContainer.appendChild(row);
      });
    }
  }

  // 5. Cross-tabulation Matrix Table
  const crosstabTable = document.getElementById("analytics-crosstab-table");
  if (crosstabTable && data.crosstab) {
    renderCrosstabTable(crosstabTable, data.crosstab);
  }

  // 6. Active Filter Chips
  renderActiveFilterChips();

  // 7. Drill-down Detail Table
  renderDrilldownTable(data.churches || [], data.drilldown_count || 0);
}

function updateRegionSelectOptions(regionalBreakdown) {
  const select = document.getElementById("analytics-region-select");
  if (!select) return;

  const currentVal = analyticsFilter.region;
  // Keep track of existing values to avoid unnecessary re-creation
  const regions = ["전체"];
  if (regionalBreakdown && regionalBreakdown.length > 0) {
    regionalBreakdown.forEach((r) => {
      if (r.region && !regions.includes(r.region)) {
        regions.push(r.region);
      }
    });
  }

  select.innerHTML = "";
  regions.forEach((reg) => {
    const opt = document.createElement("option");
    opt.value = reg;
    opt.innerText = reg === "전체" ? "전체 지역" : reg;
    if (reg === currentVal) opt.selected = true;
    select.appendChild(opt);
  });
}

function renderCrosstabTable(table, crosstab) {
  const columns = crosstab.columns || SCALE_CATEGORIES_LIST;
  const rows = crosstab.rows || [];
  const colTotals = crosstab.column_totals || {};
  const grandTotal = crosstab.grand_total || 0;

  let html = `<thead><tr><th style="min-width:120px">교단 \\ 규모</th>`;
  columns.forEach((col) => {
    const isColActive = analyticsFilter.scale === col;
    html += `
      <th class="crosstab-header-clickable ${isColActive ? "active" : ""}"
          onclick="setAnalyticsFilter('scale', '${escapeHtml(col)}')"
          title="클릭 시 [${escapeHtml(col)}] 규모 필터링">
        ${escapeHtml(col)}
      </th>`;
  });
  html += `<th style="min-width:70px">교단 합계</th></tr></thead><tbody>`;

  if (rows.length === 0) {
    html += `<tr><td colspan="${columns.length + 2}" style="color:var(--text-muted);padding:24px">집계 데이터가 없습니다.</td></tr>`;
  } else {
    rows.forEach((row) => {
      const isRowActive = analyticsFilter.denomination === row.denomination;
      html += `<tr>`;
      html += `
        <td class="crosstab-row-title ${isRowActive ? "active" : ""}"
            onclick="setAnalyticsFilter('denomination', '${escapeHtml(row.denomination)}')"
            title="클릭 시 [${escapeHtml(row.denomination)}] 교단 필터링">
          ${escapeHtml(row.denomination)}
        </td>`;

      columns.forEach((col) => {
        const count = (row.scales && row.scales[col]) || 0;
        const isCellActive =
          analyticsFilter.denomination === row.denomination &&
          analyticsFilter.scale === col;
        const isEmpty = count === 0;

        html += `
          <td class="crosstab-cell ${isEmpty ? "empty" : ""} ${isCellActive ? "active" : ""}"
              ${!isEmpty ? `onclick="setAnalyticsCellFilter('${escapeHtml(row.denomination)}', '${escapeHtml(col)}')"` : ""}
              title="${!isEmpty ? `클릭 시 [${escapeHtml(row.denomination)} × ${escapeHtml(col)}] (${count}건) 드릴다운` : ""}">
            ${count > 0 ? count : "-"}
          </td>`;
      });

      html += `
        <td class="crosstab-total-col ${isRowActive ? "active" : ""}"
            onclick="setAnalyticsFilter('denomination', '${escapeHtml(row.denomination)}')"
            title="클릭 시 [${escapeHtml(row.denomination)}] 교단 전체 필터링">
          ${row.total}
        </td>`;
      html += `</tr>`;
    });
  }

  html += `</tbody><tfoot><tr class="crosstab-total-row"><td>규모별 합계</td>`;
  columns.forEach((col) => {
    const isColActive = analyticsFilter.scale === col;
    const total = colTotals[col] || 0;
    html += `
      <td class="crosstab-total-col ${isColActive ? "active" : ""}"
          onclick="setAnalyticsFilter('scale', '${escapeHtml(col)}')"
          title="클릭 시 [${escapeHtml(col)}] 규모 전체 필터링">
        ${total}
      </td>`;
  });
  html += `<td>${grandTotal}</td></tr></tfoot>`;

  table.innerHTML = html;
}

function renderActiveFilterChips() {
  const container = document.getElementById("analytics-active-filter-chips");
  if (!container) return;

  container.innerHTML = "";
  const filters = [
    { key: "region", label: "지역", val: analyticsFilter.region },
    { key: "denomination", label: "교단", val: analyticsFilter.denomination },
    { key: "scale", label: "규모", val: analyticsFilter.scale },
  ];

  filters.forEach((f) => {
    if (f.val && f.val !== "전체") {
      const chip = document.createElement("span");
      chip.className = "filter-chip";
      chip.innerHTML = `
        <span>${f.label}: <strong>${escapeHtml(f.val)}</strong></span>
        <span class="chip-remove" title="필터 해제">&times;</span>
      `;
      chip.querySelector(".chip-remove").onclick = (e) => {
        e.stopPropagation();
        analyticsFilter[f.key] = "전체";
        if (f.key === "region") {
          const regionSelect = document.getElementById("analytics-region-select");
          if (regionSelect) regionSelect.value = "전체";
        }
        renderAnalytics();
      };
      container.appendChild(chip);
    }
  });
}

function renderDrilldownTable(churches, count) {
  const badge = document.getElementById("analytics-drilldown-badge");
  if (badge) badge.innerText = `${count}건 조회됨`;

  const tbody = document.getElementById("analytics-drilldown-tbody");
  if (!tbody) return;

  if (churches.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align:center;color:var(--text-muted);padding:30px">
          선택된 조건에 해당하는 교회가 없습니다.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = "";
  churches.forEach((c, idx) => {
    const scale = classifyScaleFrontend(c.congregation_size);
    const scaleColor = SCALE_COLORS[scale] || "var(--text-muted)";
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td style="color:var(--text-muted);font-size:12px">${idx + 1}</td>
      <td style="font-weight:600">${escapeHtml(c.church_name || "")}</td>
      <td>${escapeHtml(c.pastor || "")}</td>
      <td><span class="badge" style="background:#f1f5f9;color:var(--text-main)">${escapeHtml(c.denomination || "미지정")}</span></td>
      <td>${escapeHtml(c.region || "-")}</td>
      <td style="font-weight:600">${c.congregation_size ? c.congregation_size.toLocaleString() + "명" : '<span style="color:var(--text-muted)">미입력</span>'}</td>
      <td>
        <span class="badge" style="background:${scaleColor}18;color:${scaleColor};font-weight:600">
          ${escapeHtml(scale)}
        </span>
      </td>
      <td>
        <span class="badge ${c.tier === "A" ? "badge-verified" : "badge-manual"}">
          ${escapeHtml(c.tier || "-")}
        </span>
      </td>
      <td style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(c.road_address || c.address || "")}">
        ${escapeHtml(c.road_address || c.address || "-")}
      </td>
      <td style="text-align:center">
        <button class="btn btn-secondary btn-sm" onclick="copyDrilldownRecordText(${c.row_id})">
          📋 복사
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function copyDrilldownRecordText(rowId) {
  const target = masterRecords.find((r) => r.row_id === rowId);
  if (!target) {
    showToast("교회 정보를 찾을 수 없습니다.");
    return;
  }
  const text = `${target.church_name} (${target.pastor} 목사) / ${target.road_address || target.address || "주소 미등록"}`;
  navigator.clipboard.writeText(text).then(
    () => showToast(`클립보드 복사 완료: ${target.church_name}`),
    () => showToast("클립보드 복사에 실패했습니다.")
  );
}

function calculateMockAnalytics(records, filter) {
  const region = filter.region;
  const denom = filter.denomination;
  const scale = filter.scale;

  // 1. Regional records
  let regional = records;
  if (region && region !== "전체") {
    regional = records.filter((r) => r.region === region);
  }

  // 2. Summary
  const knownSizes = regional
    .map((r) => r.congregation_size)
    .filter((s) => s && s > 0);
  const totalMembers = knownSizes.reduce((acc, v) => acc + v, 0);
  const avgMembers = knownSizes.length ? Math.round(totalMembers / knownSizes.length) : 0;
  const maxMembers = knownSizes.length ? Math.max(...knownSizes) : 0;
  const minMembers = knownSizes.length ? Math.min(...knownSizes) : 0;

  const summary = {
    total_churches: regional.length,
    total_members: totalMembers,
    avg_members: avgMembers,
    max_members: maxMembers,
    min_members: minMembers,
    entered_count: knownSizes.length,
    missing_count: regional.length - knownSizes.length,
    entered_ratio: regional.length
      ? Math.round((knownSizes.length / regional.length) * 1000) / 10
      : 0,
  };

  // 3. Regional breakdown
  const regMap = {};
  records.forEach((r) => {
    const reg = r.region || "미지정";
    regMap[reg] = (regMap[reg] || 0) + 1;
  });
  const regionalBreakdown = Object.keys(regMap).map((k) => ({
    region: k,
    church_count: regMap[k],
    ratio: Math.round((regMap[k] / records.length) * 1000) / 10,
  }));

  // 4. Denominations
  const denomMap = {};
  regional.forEach((r) => {
    const d = r.denomination || "미지정";
    denomMap[d] = (denomMap[d] || 0) + 1;
  });
  const denominationDistribution = Object.keys(denomMap).map((k) => ({
    name: k,
    count: denomMap[k],
    ratio: regional.length ? Math.round((denomMap[k] / regional.length) * 1000) / 10 : 0,
  }));

  // 5. Scales
  const scaleMap = {};
  SCALE_CATEGORIES_LIST.forEach((s) => (scaleMap[s] = 0));
  regional.forEach((r) => {
    const s = classifyScaleFrontend(r.congregation_size);
    scaleMap[s] = (scaleMap[s] || 0) + 1;
  });
  const scaleDistribution = SCALE_CATEGORIES_LIST.map((s) => ({
    scale: s,
    count: scaleMap[s],
    ratio: regional.length ? Math.round((scaleMap[s] / regional.length) * 1000) / 10 : 0,
  }));

  // 6. Crosstab
  const allDenoms = Array.from(new Set(regional.map((r) => r.denomination || "미지정")));
  const matrix = {};
  const colTotals = {};
  SCALE_CATEGORIES_LIST.forEach((s) => (colTotals[s] = 0));
  allDenoms.forEach((d) => {
    matrix[d] = {};
    SCALE_CATEGORIES_LIST.forEach((s) => (matrix[d][s] = 0));
  });

  regional.forEach((r) => {
    const d = r.denomination || "미지정";
    const s = classifyScaleFrontend(r.congregation_size);
    matrix[d][s] = (matrix[d][s] || 0) + 1;
    colTotals[s] = (colTotals[s] || 0) + 1;
  });

  const rows = allDenoms.map((d) => {
    const total = SCALE_CATEGORIES_LIST.reduce((sum, s) => sum + matrix[d][s], 0);
    return { denomination: d, scales: matrix[d], total: total };
  });

  const crosstab = {
    columns: SCALE_CATEGORIES_LIST,
    rows: rows,
    column_totals: colTotals,
    grand_total: regional.length,
  };

  // 7. Drilldown churches
  let churches = records;
  if (region && region !== "전체") {
    churches = churches.filter((r) => r.region === region);
  }
  if (denom && denom !== "전체") {
    churches = churches.filter((r) => (r.denomination || "미지정") === denom);
  }
  if (scale && scale !== "전체") {
    churches = churches.filter((r) => classifyScaleFrontend(r.congregation_size) === scale);
  }

  return {
    summary: summary,
    regional_breakdown: regionalBreakdown,
    denomination_distribution: denominationDistribution,
    scale_distribution: scaleDistribution,
    crosstab: crosstab,
    churches: churches,
    drilldown_count: churches.length,
    applied_filters: { region, denomination: denom, scale },
  };
}

// --- Toast Helper ---

function showToast(msg) {
  const toast = document.getElementById("toast");
  if (toast) {
    toast.innerText = msg;
    toast.classList.add("show");
    setTimeout(() => {
      toast.classList.remove("show");
    }, 2800);
  }
}
