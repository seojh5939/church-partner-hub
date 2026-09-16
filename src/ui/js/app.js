/**
 * church-partner-hub Frontend Application Logic
 * Communicates with Python backend via window.pywebview.api (JSON-RPC)
 */

// State
let currentMode = "MASTER";
let masterRecords = [];
let simpleRecords = [];
let stats = {};
let obsidianVaultPath = "C:\\Users\\20260602\\Documents\\github\\Obsidian";
let church114Filter = {
  sido: "전체",
  sigungu: "전체",
  emd: "전체",
};
let currentGridChurches = [];
let kakaoApiKey = localStorage.getItem("CHURCH_HUB_KAKAO_API_KEY") || "";
let naverApiKey = localStorage.getItem("CHURCH_HUB_NAVER_API_KEY") || "";

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
  setupChurch114Analytics();
  setupObsidianSync();
  setupSettings();

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
    if (data.obsidian_vault_path) {
      obsidianVaultPath = data.obsidian_vault_path;
      const pathInput = document.getElementById("settings-obsidian-path");
      if (pathInput) pathInput.value = obsidianVaultPath;
    }
    renderModeUI();
    renderDashboard();
    renderGroundingList();
    loadChurch114Analytics("전체", "전체", "전체");
  }
}

function loadMockInitialState() {
  masterRecords = [];
  simpleRecords = [];
  stats = {
    total_count: 0,
    verified_address_count: 0,
    missing_address_count: 0,
    verified_homepage_count: 0,
  };

  renderModeUI();
  renderDashboard();
  renderGroundingList();
  loadChurch114Analytics("전체", "전체", "전체");
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
  loadChurch114Analytics(church114Filter.sido, church114Filter.sigungu, church114Filter.emd);
  showToast(`${mode === "MASTER" ? "마스터 관리 모드" : "간편 주소록 모드"}로 전환되었습니다.`);
}

function renderModeUI() {
  const btnMaster = document.getElementById("mode-master-btn");
  const btnSimple = document.getElementById("mode-simple-btn");
  const analyticsTabBtn = document.getElementById("tab-btn-analytics");
  const obsidianTabBtn = document.getElementById("tab-btn-obsidian");

  if (currentMode === "MASTER") {
    btnMaster.classList.add("active");
    btnSimple.classList.remove("active");
    if (analyticsTabBtn) analyticsTabBtn.style.display = "flex";
    if (obsidianTabBtn) obsidianTabBtn.style.display = "flex";
  } else {
    btnSimple.classList.add("active");
    btnMaster.classList.remove("active");
    if (analyticsTabBtn) analyticsTabBtn.style.display = "none";
    if (obsidianTabBtn) obsidianTabBtn.style.display = "none";
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
        loadChurch114Analytics(church114Filter.sido, church114Filter.sigungu, church114Filter.emd);
      } else if (targetId === "tab-obsidian") {
        loadObsidianSync();
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

  // Empty State vs Table
  const emptyHero = document.getElementById("dashboard-empty-hero");
  const tableWrapper = document.getElementById("dashboard-table-wrapper");

  if (records.length === 0) {
    if (tableWrapper) tableWrapper.style.display = "none";
    if (emptyHero) {
      emptyHero.style.display = "block";
      emptyHero.innerHTML = `
        <div class="hero-empty-state">
          <div class="hero-empty-icon">📂</div>
          <div class="hero-empty-title">불러온 교회 데이터가 없습니다</div>
          <div class="hero-empty-desc">
            파트너십 사역 대상 교회 목록이 담긴 엑셀(.xlsx / .csv) 파일을 불러와 작업을 시작하세요.<br>
            파일을 열면 도로명 주소 검증, 공식 홈페이지 확인, 원클릭 주소 복사 및 지역별 교세 분석 기능을 즉시 활용할 수 있습니다.
          </div>
          <div class="hero-empty-actions">
            <button class="btn btn-primary" onclick="document.getElementById('btn-open-excel').click()">
              📂 엑셀 파일 열기 (.xlsx/.csv)
            </button>
          </div>
        </div>
      `;
    }
    return;
  }

  if (tableWrapper) tableWrapper.style.display = "block";
  if (emptyHero) {
    emptyHero.style.display = "none";
    emptyHero.innerHTML = "";
  }

  // Table rendering
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
      <th>도로명 주소 (클릭시 복사)</th>
      <th>우편번호</th>
      <th>공식 홈페이지</th>
      <th>주소상태</th>
      <th>홈페이지상태</th>
      <th>1차 제안사업</th>
      <th>다음 액션</th>
    `;

    records.forEach((r) => {
      const tr = document.createElement("tr");
      const addrText = r.address || "";
      const zipText = r.zip_code || "";
      const fullCopyStr = addrText ? (zipText ? `${addrText} (${zipText})` : addrText) : "";

      tr.innerHTML = `
        <td>${r.row_id}</td>
        <td><strong>${escapeHtml(r.region)}</strong></td>
        <td>${escapeHtml(r.classification) || "-"}</td>
        <td><strong>${escapeHtml(r.church_name)}</strong></td>
        <td>${escapeHtml(r.pastor)}</td>
        <td>${escapeHtml(r.denomination) || "-"}</td>
        <td>${r.congregation_size ? r.congregation_size.toLocaleString() : "-"}</td>
        <td><span class="badge badge-primary">${escapeHtml(r.scale_tier) || "-"}</span></td>
        <td class="copyable-cell" title="클릭하여 주소 복사" onclick="${addrText ? `copySingleAddress('${escapeJs(fullCopyStr)}')` : ''}">
          ${addrText ? `📋 ${escapeHtml(addrText)}` : '<span style="color:#94a3b8">(주소 누락)</span>'}
        </td>
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
      <th>도로명 주소 (클릭시 복사)</th>
      <th>우편번호</th>
      <th>공식 홈페이지</th>
      <th>검증 상태</th>
    `;

    records.forEach((r) => {
      const tr = document.createElement("tr");
      const addrText = r.road_address || "";
      const zipText = r.zip_code || "";
      const fullCopyStr = addrText ? (zipText ? `${addrText} (${zipText})` : addrText) : "";

      tr.innerHTML = `
        <td>${r.row_id}</td>
        <td><strong>${escapeHtml(r.church_name)}</strong></td>
        <td>${escapeHtml(r.pastor)}</td>
        <td>${escapeHtml(r.region)}</td>
        <td class="copyable-cell" title="클릭하여 주소 복사" onclick="${addrText ? `copySingleAddress('${escapeJs(fullCopyStr)}')` : ''}">
          ${addrText ? `📋 ${escapeHtml(addrText)}` : '<span style="color:#94a3b8">(주소 미검증)</span>'}
        </td>
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

let currentQuickResults = [];

function setupQuickSearch() {
  const input = document.getElementById("quick-search-input");
  if (input) {
    input.addEventListener("input", async (e) => {
      const kw = e.target.value.trim();
      let results = [];
      if (!kw) {
        currentQuickResults = [];
        renderQuickSearchResults([]);
        return;
      }
      if (window.pywebview) {
        const res = await callApi("quick_search", kw);
        if (res) results = res.results || [];
      } else {
        const source = currentMode === "MASTER" ? masterRecords : simpleRecords;
        results = source.filter(
          (r) =>
            (r.church_name && r.church_name.includes(kw)) ||
            (r.pastor && r.pastor.includes(kw)) ||
            (r.region && r.region.includes(kw))
        );
      }
      currentQuickResults = results;
      renderQuickSearchResults(results);
    });
  }

  // 일괄 선택 복사 버튼
  const btnCopySelected = document.getElementById("btn-copy-selected-dispatch");
  if (btnCopySelected) {
    btnCopySelected.addEventListener("click", () => {
      const checkedBoxes = document.querySelectorAll(".quick-select-checkbox:checked");
      if (checkedBoxes.length === 0) {
        showToast("선택된 교회가 없습니다. 체크박스를 선택해주세요.");
        return;
      }
      const selectedIds = Array.from(checkedBoxes).map((cb) => parseInt(cb.getAttribute("data-row-id"), 10));
      const selectedChurches = currentQuickResults.filter((r) => selectedIds.includes(r.row_id));

      const copyLines = selectedChurches.map((r) => {
        const addr = r.address || r.road_address || "주소 미입력";
        const zip = r.zip_code ? ` (${r.zip_code})` : "";
        return `${r.church_name} (${r.pastor || "담임목사"} 귀하)\t${addr}${zip}`;
      });

      const fullText = copyLines.join("\n");
      navigator.clipboard.writeText(fullText).then(() => {
        showToast(`선택한 ${selectedChurches.length}개 교회 주소가 클립보드에 복사되었습니다 (줄바꿈 구분).`);
      }).catch((err) => {
        console.error("Clipboard copy error:", err);
        showToast("클립보드 복사에 실패했습니다.");
      });
    });
  }

  // 발송 명단 엑셀/CSV 다운로드 버튼
  const btnExport = document.getElementById("btn-export-dispatch");
  if (btnExport) {
    btnExport.addEventListener("click", () => {
      const checkedBoxes = document.querySelectorAll(".quick-select-checkbox:checked");
      let targetList = [];
      if (checkedBoxes.length > 0) {
        const selectedIds = Array.from(checkedBoxes).map((cb) => parseInt(cb.getAttribute("data-row-id"), 10));
        targetList = currentQuickResults.filter((r) => selectedIds.includes(r.row_id));
      } else {
        targetList = currentQuickResults;
      }

      if (targetList.length === 0) {
        showToast("다운로드할 검색 결과가 없습니다.");
        return;
      }

      exportChurchesToCsv(targetList, "발송대상_교회주소록.csv");
    });
  }
}

function renderQuickSearchResults(results) {
  const container = document.getElementById("quick-search-results");
  if (!container) return;
  container.innerHTML = "";

  if (results.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)">검색 결과가 없습니다.</div>`;
    return;
  }

  // 상단 전체선택 바
  const topBar = document.createElement("div");
  topBar.style.display = "flex";
  topBar.style.alignItems = "center";
  topBar.style.justifyContent = "space-between";
  topBar.style.padding = "8px 12px";
  topBar.style.marginBottom = "10px";
  topBar.style.background = "#f8fafc";
  topBar.style.borderRadius = "6px";
  topBar.style.border = "1px solid var(--border)";
  topBar.innerHTML = `
    <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;cursor:pointer">
      <input type="checkbox" id="quick-check-all" style="cursor:pointer"> 전체 선택 (${results.length}건)
    </label>
    <div style="font-size:12px;color:var(--text-muted)">주소를 클릭하면 해당 주소만 즉시 복사됩니다.</div>
  `;
  container.appendChild(topBar);

  const checkAll = topBar.querySelector("#quick-check-all");
  checkAll.addEventListener("change", (e) => {
    const isChecked = e.target.checked;
    container.querySelectorAll(".quick-select-checkbox").forEach((cb) => {
      cb.checked = isChecked;
    });
  });

  results.forEach((r) => {
    const card = document.createElement("div");
    card.className = "card";
    card.style.marginBottom = "12px";
    const rawAddr = r.address || r.road_address || "";
    const displayAddr = rawAddr ? escapeHtml(rawAddr) : '<span style="color:#ef4444">주소 누락</span>';

    card.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:12px">
        <input type="checkbox" class="quick-select-checkbox" data-row-id="${r.row_id}" style="margin-top:6px;cursor:pointer;width:16px;height:16px" aria-label="선택">
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div style="font-size:16px;font-weight:700">${escapeHtml(r.church_name)}</div>
            <div style="display:flex;gap:6px">
              <button class="btn btn-primary btn-sm" onclick="copyDispatchText('OFFICIAL', ${r.row_id})">📄 공문용 복사</button>
              <button class="btn btn-secondary btn-sm" onclick="copyDispatchText('PACKAGE', ${r.row_id})">📦 선물용 복사</button>
            </div>
          </div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:2px">
            담임목사: <strong>${escapeHtml(r.pastor || "미지정")}</strong> | 지역: ${escapeHtml(r.region || "-")} | 우편번호: ${escapeHtml(r.zip_code) || "-"}
          </div>
          <div style="font-size:13px;margin-top:6px">
            주소: <span class="copyable-cell" onclick="copySingleAddress('${escapeJs(rawAddr)}')" title="클릭 시 주소 복사">${displayAddr}</span>
          </div>
          ${r.homepage ? `<div style="font-size:12px;color:var(--primary);margin-top:4px">홈페이지: <a href="${sanitizeUrl(r.homepage)}" target="_blank">${escapeHtml(r.homepage)}</a></div>` : ''}
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

function exportChurchesToCsv(churches, filename = "교회주소록.csv") {
  const headers = ["교회명", "담임목사", "지역", "도로명주소", "우편번호", "홈페이지"];
  const rows = churches.map((r) => [
    `"${(r.church_name || "").replace(/"/g, '""')}"`,
    `"${(r.pastor || "").replace(/"/g, '""')}"`,
    `"${(r.region || "").replace(/"/g, '""')}"`,
    `"${(r.address || r.road_address || "").replace(/"/g, '""')}"`,
    `"${(r.zip_code || "").replace(/"/g, '""')}"`,
    `"${(r.homepage || "").replace(/"/g, '""')}"`,
  ]);

  const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((row) => row.join(","))].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast(`파일이 다운로드되었습니다: ${filename}`);
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
    showToast(`클립보드에 복사되었습니다 (${type === "OFFICIAL" ? "공문용" : "선물용"}).`);
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
          loadChurch114Analytics(church114Filter.sido, church114Filter.sigungu, church114Filter.emd);
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
      indicator.innerText = "현재 파일: 열린 파일 없음 (엑셀 파일을 열어주세요)";
    }
  }
}

// --- Phase 4: Church114 Orthodox Engine & Density Vector Map (Marker-less) & Region Detail ---

const SCALE_COLORS = {
  "초대형 (3000~)": "#ef4444",
  "대형 (1000~3000)": "#f97316",
  "중대형 (500~1000)": "#3b82f6",
  "중형 (100~500)": "#06b6d4",
  "소형 (~100)": "#10b981",
  "미입력": "#94a3b8",
};

function setupChurch114Analytics() {
  const sidoSelect = document.getElementById("analytics-sido-select");
  const sigunguSelect = document.getElementById("analytics-sigungu-select");
  const emdSelect = document.getElementById("analytics-emd-select");

  // 시도 셀렉트박스 초기화
  if (sidoSelect && sidoSelect.children.length <= 1) {
    if (typeof KOREA_SIDO_LIST !== "undefined") {
      KOREA_SIDO_LIST.forEach((s) => {
        const opt = document.createElement("option");
        opt.value = s.name;
        opt.innerText = s.name;
        sidoSelect.appendChild(opt);
      });
    }
  }

  // 시도 변경 핸들러
  if (sidoSelect) {
    sidoSelect.addEventListener("change", (e) => {
      const sido = e.target.value;
      church114Filter.sido = sido;
      church114Filter.sigungu = "전체";
      church114Filter.emd = "전체";
      updateSigunguOptions(sido);
      updateEmdOptions("전체");
      loadChurch114Analytics(church114Filter.sido, church114Filter.sigungu, church114Filter.emd);
    });
  }

  // 시군구 변경 핸들러
  if (sigunguSelect) {
    sigunguSelect.addEventListener("change", (e) => {
      const sigungu = e.target.value;
      church114Filter.sigungu = sigungu;
      church114Filter.emd = "전체";
      updateEmdOptions(sigungu);
      loadChurch114Analytics(church114Filter.sido, church114Filter.sigungu, church114Filter.emd);
    });
  }

  // 읍면동 변경 핸들러
  if (emdSelect) {
    emdSelect.addEventListener("change", (e) => {
      const emd = e.target.value;
      church114Filter.emd = emd;
      loadChurch114Analytics(church114Filter.sido, church114Filter.sigungu, church114Filter.emd);
    });
  }

  // 필터 초기화 버튼
  const btnReset = document.getElementById("btn-reset-analytics-filter");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      church114Filter.sido = "전체";
      church114Filter.sigungu = "전체";
      church114Filter.emd = "전체";
      if (sidoSelect) sidoSelect.value = "전체";
      updateSigunguOptions("전체");
      updateEmdOptions("전체");
      loadChurch114Analytics("전체", "전체", "전체");
    });
  }

  // 최신 교세 재조사 버튼 (카카오/네이버 API Key 활용)
  const btnRefresh = document.getElementById("btn-refresh-portal-churches");
  if (btnRefresh) {
    btnRefresh.addEventListener("click", async () => {
      const currentApiKey = kakaoApiKey || naverApiKey;
      if (!currentApiKey) {
        showToast("환경설정 탭에서 카카오 또는 네이버 API Key를 먼저 입력해주세요.");
        const settingsTab = document.querySelector('[data-tab="tab-settings"]');
        if (settingsTab) settingsTab.click();
        return;
      }

      // 검색 대상 지역 쿼리 구성
      let regionQuery = church114Filter.sido !== "전체" ? church114Filter.sido : "서울특별시";
      if (church114Filter.sigungu !== "전체") regionQuery += " " + church114Filter.sigungu;
      if (church114Filter.emd !== "전체") regionQuery += " " + church114Filter.emd;

      btnRefresh.disabled = true;
      btnRefresh.innerText = "조사 중...";
      showToast(`'${regionQuery}' 지역 최신 교세를 포털 API로 재조사하는 중입니다...`);

      const provider = kakaoApiKey ? "KAKAO" : "NAVER";
      if (window.pywebview) {
        const res = await callApi("refresh_church114_from_portal", regionQuery, provider, currentApiKey);
        btnRefresh.disabled = false;
        btnRefresh.innerText = "🔄 최신 교세 재조사";
        if (res && res.success) {
          showToast(`'${regionQuery}' 지역 신규/갱신 교회 ${res.count}건을 정통교단 DB에 반영했습니다.`);
          await loadChurch114Analytics(church114Filter.sido, church114Filter.sigungu, church114Filter.emd);
        } else {
          showToast(`재조사 실패: ${res ? res.error : "알 수 없는 오류"}`);
        }
      } else {
        setTimeout(() => {
          btnRefresh.disabled = false;
          btnRefresh.innerText = "🔄 최신 교세 재조사";
          showToast(`'${regionQuery}' 지역 최신 교세 재조사 완료 (미리보기 모드)`);
        }, 800);
      }
    });
  }

  // 그리드 검색 및 선택 복사/내보내기 이벤트
  const gridSearch = document.getElementById("region-grid-search-input");
  if (gridSearch) {
    gridSearch.addEventListener("input", (e) => {
      filterAndRenderGrid(e.target.value.trim());
    });
  }

  const gridSelectAll = document.getElementById("grid-select-all");
  if (gridSelectAll) {
    gridSelectAll.addEventListener("change", (e) => {
      const isChecked = e.target.checked;
      document.querySelectorAll(".region-grid-checkbox").forEach((cb) => {
        cb.checked = isChecked;
      });
    });
  }

  const btnCopyGrid = document.getElementById("btn-copy-grid-selected");
  if (btnCopyGrid) {
    btnCopyGrid.addEventListener("click", () => {
      const checkedBoxes = document.querySelectorAll(".region-grid-checkbox:checked");
      if (checkedBoxes.length === 0) {
        showToast("선택된 교회가 없습니다. 체크박스를 선택해주세요.");
        return;
      }
      const selectedIds = Array.from(checkedBoxes).map((cb) => parseInt(cb.getAttribute("data-id"), 10));
      const targets = currentGridChurches.filter((c) => selectedIds.includes(c.id));
      const textLines = targets.map((c) => {
        const zip = c.zip_code ? ` (${c.zip_code})` : "";
        return `${c.church_name} (${c.pastor || "담임목사"} 귀하)\t${c.road_address}${zip}`;
      });
      navigator.clipboard.writeText(textLines.join("\n")).then(() => {
        showToast(`선택한 ${targets.length}개 교회의 주소가 복사되었습니다 (줄바꿈 구분).`);
      }).catch(() => {
        showToast("클립보드 복사에 실패했습니다.");
      });
    });
  }

  const btnExportGrid = document.getElementById("btn-export-grid-excel");
  if (btnExportGrid) {
    btnExportGrid.addEventListener("click", () => {
      if (currentGridChurches.length === 0) {
        showToast("내보낼 데이터가 없습니다.");
        return;
      }
      const checkedBoxes = document.querySelectorAll(".region-grid-checkbox:checked");
      let exportList = currentGridChurches;
      if (checkedBoxes.length > 0) {
        const selectedIds = Array.from(checkedBoxes).map((cb) => parseInt(cb.getAttribute("data-id"), 10));
        exportList = currentGridChurches.filter((c) => selectedIds.includes(c.id));
      }
      const regionLabel = church114Filter.sido !== "전체" ? church114Filter.sido : "전국";
      exportChurchesToCsv(exportList, `${regionLabel}_정통교단_교회명단.csv`);
    });
  }
}

function updateSigunguOptions(sido) {
  const select = document.getElementById("analytics-sigungu-select");
  if (!select) return;
  select.innerHTML = `<option value="전체">시군구 전체</option>`;

  if (sido === "서울특별시" && typeof SEOUL_DISTRICTS !== "undefined") {
    SEOUL_DISTRICTS.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d.name;
      opt.innerText = d.name;
      select.appendChild(opt);
    });
  } else if (sido === "경기도") {
    ["성남시 분당구", "수원시", "용인시", "고양시", "안양시", "부천시", "화성시"].forEach((g) => {
      const opt = document.createElement("option");
      opt.value = g;
      opt.innerText = g;
      select.appendChild(opt);
    });
  } else if (sido === "부산광역시") {
    ["해운대구", "수영구", "부산진구", "동래구", "강서구", "중구"].forEach((g) => {
      const opt = document.createElement("option");
      opt.value = g;
      opt.innerText = g;
      select.appendChild(opt);
    });
  } else if (sido === "광주광역시") {
    ["남구", "동구", "서구", "북구", "광산구"].forEach((g) => {
      const opt = document.createElement("option");
      opt.value = g;
      opt.innerText = g;
      select.appendChild(opt);
    });
  }
}

function updateEmdOptions(sigungu) {
  const select = document.getElementById("analytics-emd-select");
  if (!select) return;
  select.innerHTML = `<option value="전체">읍면동 전체</option>`;

  if (sigungu === "강남구" && typeof GANGNAM_DONGS !== "undefined") {
    GANGNAM_DONGS.forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d.name;
      opt.innerText = d.name;
      select.appendChild(opt);
    });
  } else if (sigungu === "서초구") {
    ["서초동", "양재동", "방배동", "반포동", "잠원동"].forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.innerText = d;
      select.appendChild(opt);
    });
  } else if (sigungu === "성남시 분당구") {
    ["이매동", "구미동", "야탑동", "서현동", "정자동", "판교동"].forEach((d) => {
      const opt = document.createElement("option");
      opt.value = d;
      opt.innerText = d;
      select.appendChild(opt);
    });
  }
}

async function loadChurch114Analytics(sido = "전체", sigungu = "전체", emd = "전체") {
  church114Filter.sido = sido;
  church114Filter.sigungu = sigungu;
  church114Filter.emd = emd;

  let analyticsData = null;
  let top10Data = null;
  let gridData = null;

  if (window.pywebview) {
    analyticsData = await callApi("get_church114_analytics", sido, sigungu, emd);
    top10Data = await callApi("get_church114_top10", sido, sigungu, emd);
    gridData = await callApi("get_church114_grid", sido, sigungu, emd);
  }

  // Fallback if null (미리보기 모드 또는 오프라인)
  if (!analyticsData) {
    analyticsData = {
      scope: sido === "전체" ? "SIDO" : sigungu === "전체" ? "SIGUNGU" : "EUPMYEONDONG",
      region_name: sido !== "전체" ? sido : "전국",
      summary: {
        total_churches: 24,
        total_members: 198000,
        avg_members: 8250,
        top_denomination: "예장합동",
        top_denomination_ratio: 41.7,
      },
      denominations: [
        { denomination: "예장합동", count: 10, ratio: 41.7 },
        { denomination: "예장통합", count: 6, ratio: 25.0 },
        { denomination: "기독교대한감리회", count: 3, ratio: 12.5 },
        { denomination: "기독교한국침례회", count: 2, ratio: 8.3 },
        { denomination: "예장백석", count: 2, ratio: 8.3 },
        { denomination: "기독교대한성결교회", count: 1, ratio: 4.2 },
      ],
      scale_tiers: [
        { scale: "초대형 (3000~)", count: 18, ratio: 75.0 },
        { scale: "대형 (1000~3000)", count: 2, ratio: 8.3 },
        { scale: "중대형 (500~1000)", count: 3, ratio: 12.5 },
        { scale: "중형 (100~500)", count: 1, ratio: 4.2 },
        { scale: "소형 (~100)", count: 0, ratio: 0.0 },
      ],
      sub_regions: [
        { name: "서울특별시", church_count: 14, total_members: 135000, top_denomination: "예장합동", top_denom_ratio: 42.8, density_score: 1.0, density_color: "#ef4444" },
        { name: "경기도", church_count: 3, total_members: 55000, top_denomination: "기독교한국침례회", top_denom_ratio: 33.3, density_score: 0.6, density_color: "#f97316" },
        { name: "부산광역시", church_count: 2, total_members: 41000, top_denomination: "예장합동", top_denom_ratio: 100.0, density_score: 0.4, density_color: "#06b6d4" },
        { name: "광주광역시", church_count: 4, total_members: 14000, top_denomination: "예장합동", top_denom_ratio: 50.0, density_score: 0.7, density_color: "#ef4444" },
        { name: "대전광역시", church_count: 2, total_members: 15000, top_denomination: "예장합동", top_denom_ratio: 50.0, density_score: 0.4, density_color: "#06b6d4" },
      ],
    };
  }

  if (!top10Data) {
    top10Data = [
      { id: 1, church_name: "사랑의교회", denomination: "예장합동", pastor: "오정현", congregation_size: 35000, scale_tier: "초대형 (3000~)", road_address: "서울특별시 서초구 반포대로 121", phone: "02-3479-7711", homepage: "http://www.sarang.org" },
      { id: 2, church_name: "수영로교회", denomination: "예장합동", pastor: "이규현", congregation_size: 30000, scale_tier: "초대형 (3000~)", road_address: "부산광역시 해운대구 해운대해변로 33", phone: "051-740-4500", homepage: "http://www.sooyoungro.org" },
      { id: 3, church_name: "온누리교회(양재)", denomination: "예장통합", pastor: "이재훈", congregation_size: 28000, scale_tier: "초대형 (3000~)", road_address: "서울특별시 서초구 바우뫼로31길 70", phone: "02-570-7000", homepage: "http://www.onnuri.org" },
      { id: 4, church_name: "오륜교회", denomination: "예장합동", pastor: "김은호", congregation_size: 25000, scale_tier: "초대형 (3000~)", road_address: "서울특별시 송파구 강동대로 235", phone: "02-485-4004", homepage: "http://www.oryun.org" },
      { id: 5, church_name: "지구촌교회", denomination: "기독교한국침례회", pastor: "최성은", congregation_size: 23000, scale_tier: "초대형 (3000~)", road_address: "경기도 성남시 분당구 미금일로 154", phone: "031-710-7600", homepage: "http://www.jiguchon.or.kr" },
    ];
  }

  if (!gridData) {
    gridData = top10Data;
  }

  // 1. 지도 렌더링 (마커 0개, 순수 단계구분도 채색)
  renderOrthodoxMap(analyticsData.sub_regions || [], analyticsData.scope || "SIDO", analyticsData);

  // 2. 지역 상세 분석 페이지 렌더링 (모든 지표 제공)
  renderRegionDetail(analyticsData, top10Data || [], gridData || []);
}

// --- Map Rendering Engine (Marker-less Interactive Choropleth Heatmap) ---

function renderOrthodoxMap(subRegions, scope, analyticsData) {
  const svg = document.getElementById("orthodox-map-svg");
  const title = document.getElementById("map-current-view-title");
  const tooltip = document.getElementById("map-hover-tooltip");
  if (!svg) return;

  svg.innerHTML = "";

  // 뷰 타이틀 갱신
  if (title) {
    if (scope === "SIDO") {
      title.innerText = "📍 전국 17개 광역시도 교회 밀집도 (클릭 시 해당 시도로 줌인)";
    } else if (scope === "SIGUNGU") {
      title.innerText = `📍 ${church114Filter.sido} 시군구별 교회 밀집도 (클릭 시 해당 구로 줌인)`;
    } else {
      title.innerText = `📍 ${church114Filter.sido} ${church114Filter.sigungu} 읍면동별 교회 밀집도`;
    }
  }

  // 밀도 색상 맵 매핑
  const regionMap = {};
  subRegions.forEach((r) => {
    regionMap[r.name] = r;
  });

  // 툴팁 헬퍼
  const showTooltip = (e, info) => {
    if (!tooltip) return;
    tooltip.innerHTML = `
      <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:#38bdf8">${escapeHtml(info.name)}</div>
      <div>총 교회: <strong>${info.church_count || 0}개</strong></div>
      <div>1위 교단: <strong>${escapeHtml(info.top_denomination || "-")}</strong> (${info.top_denom_ratio || 0}%)</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:4px">클릭하여 상세 분석으로 이동 🔍</div>
    `;
    tooltip.style.display = "block";
    const container = document.getElementById("orthodox-density-map-container");
    const rect = container ? container.getBoundingClientRect() : { left: 0, top: 0 };
    tooltip.style.left = `${e.clientX - rect.left + 14}px`;
    tooltip.style.top = `${e.clientY - rect.top + 10}px`;
  };

  const hideTooltip = () => {
    if (tooltip) tooltip.style.display = "none";
  };

  // SVG 베이스 그룹
  const g = document.createElementNS("http://www.w3.org/2000/svg", "g");

  if (scope === "SIDO") {
    // 전국 17개 시도 타일 벡터 맵
    svg.setAttribute("viewBox", "0 0 500 620");

    if (typeof KOREA_SIDO_LIST !== "undefined") {
      KOREA_SIDO_LIST.forEach((item) => {
        const info = regionMap[item.name] || { name: item.name, church_count: 0, density_color: "#3b82f6", top_denomination: "-", top_denom_ratio: 0 };
        const fillColor = info.density_color || "#3b82f6";

        const tileGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        tileGroup.style.cursor = "pointer";
        tileGroup.style.transition = "transform 0.15s ease";

        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", item.cx - item.w / 2);
        rect.setAttribute("y", item.cy - item.h / 2);
        rect.setAttribute("width", item.w);
        rect.setAttribute("height", item.h);
        rect.setAttribute("rx", "10");
        rect.setAttribute("ry", "10");
        rect.setAttribute("fill", fillColor);
        rect.setAttribute("stroke", "#ffffff");
        rect.setAttribute("stroke-width", "2");
        rect.setAttribute("opacity", "0.92");

        // 텍스트 (시도 이름)
        const textName = document.createElementNS("http://www.w3.org/2000/svg", "text");
        textName.setAttribute("x", item.cx);
        textName.setAttribute("y", item.cy - 4);
        textName.setAttribute("text-anchor", "middle");
        textName.setAttribute("fill", "#ffffff");
        textName.setAttribute("font-size", "13");
        textName.setAttribute("font-weight", "700");
        textName.setAttribute("pointer-events", "none");
        textName.textContent = item.short;

        // 텍스트 (교회 수)
        const textCount = document.createElementNS("http://www.w3.org/2000/svg", "text");
        textCount.setAttribute("x", item.cx);
        textCount.setAttribute("y", item.cy + 14);
        textCount.setAttribute("text-anchor", "middle");
        textCount.setAttribute("fill", "rgba(255,255,255,0.9)");
        textCount.setAttribute("font-size", "11");
        textCount.setAttribute("font-weight", "600");
        textCount.setAttribute("pointer-events", "none");
        textCount.textContent = `${info.church_count || 0}개`;

        // 상호작용
        tileGroup.addEventListener("mouseenter", (e) => {
          rect.setAttribute("opacity", "1");
          rect.setAttribute("stroke-width", "3");
          showTooltip(e, info);
        });
        tileGroup.addEventListener("mousemove", (e) => {
          showTooltip(e, info);
        });
        tileGroup.addEventListener("mouseleave", () => {
          rect.setAttribute("opacity", "0.92");
          rect.setAttribute("stroke-width", "2");
          hideTooltip();
        });
        tileGroup.addEventListener("click", () => {
          hideTooltip();
          const sidoSelect = document.getElementById("analytics-sido-select");
          if (sidoSelect) sidoSelect.value = item.name;
          church114Filter.sido = item.name;
          church114Filter.sigungu = "전체";
          church114Filter.emd = "전체";
          updateSigunguOptions(item.name);
          updateEmdOptions("전체");
          loadChurch114Analytics(item.name, "전체", "전체");
        });

        tileGroup.appendChild(rect);
        tileGroup.appendChild(textName);
        tileGroup.appendChild(textCount);
        g.appendChild(tileGroup);
      });
    }

  } else if (scope === "SIGUNGU") {
    // 특정 시도 자치구 그리드 맵
    svg.setAttribute("viewBox", "0 0 500 350");

    let districtList = [];
    if (church114Filter.sido === "서울특별시" && typeof SEOUL_DISTRICTS !== "undefined") {
      districtList = SEOUL_DISTRICTS.map((d) => ({ name: d.name, cx: d.cx, cy: d.cy }));
    } else {
      // 기타 시도는 subRegions 기반 격자 배치
      districtList = subRegions.map((r, idx) => {
        const col = idx % 5;
        const row = Math.floor(idx / 5);
        return { name: r.name, cx: 80 + col * 85, cy: 60 + row * 60 };
      });
    }

    districtList.forEach((d) => {
      const info = regionMap[d.name] || { name: d.name, church_count: 0, density_color: "#3b82f6", top_denomination: "-", top_denom_ratio: 0 };
      const fillColor = info.density_color || "#3b82f6";

      const tileGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      tileGroup.style.cursor = "pointer";

      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", d.cx - 36);
      rect.setAttribute("y", d.cy - 22);
      rect.setAttribute("width", "72");
      rect.setAttribute("height", "44");
      rect.setAttribute("rx", "8");
      rect.setAttribute("ry", "8");
      rect.setAttribute("fill", fillColor);
      rect.setAttribute("stroke", "#ffffff");
      rect.setAttribute("stroke-width", "2");
      rect.setAttribute("opacity", "0.92");

      const textName = document.createElementNS("http://www.w3.org/2000/svg", "text");
      textName.setAttribute("x", d.cx);
      textName.setAttribute("y", d.cy - 4);
      textName.setAttribute("text-anchor", "middle");
      textName.setAttribute("fill", "#ffffff");
      textName.setAttribute("font-size", "12");
      textName.setAttribute("font-weight", "700");
      textName.setAttribute("pointer-events", "none");
      textName.textContent = d.name;

      const textCount = document.createElementNS("http://www.w3.org/2000/svg", "text");
      textCount.setAttribute("x", d.cx);
      textCount.setAttribute("y", d.cy + 12);
      textCount.setAttribute("text-anchor", "middle");
      textCount.setAttribute("fill", "rgba(255,255,255,0.9)");
      textCount.setAttribute("font-size", "10");
      textCount.setAttribute("font-weight", "600");
      textCount.setAttribute("pointer-events", "none");
      textCount.textContent = `${info.church_count || 0}개`;

      tileGroup.addEventListener("mouseenter", (e) => showTooltip(e, info));
      tileGroup.addEventListener("mousemove", (e) => showTooltip(e, info));
      tileGroup.addEventListener("mouseleave", () => hideTooltip());
      tileGroup.addEventListener("click", () => {
        hideTooltip();
        const sigunguSelect = document.getElementById("analytics-sigungu-select");
        if (sigunguSelect) sigunguSelect.value = d.name;
        church114Filter.sigungu = d.name;
        church114Filter.emd = "전체";
        updateEmdOptions(d.name);
        loadChurch114Analytics(church114Filter.sido, d.name, "전체");
      });

      tileGroup.appendChild(rect);
      tileGroup.appendChild(textName);
      tileGroup.appendChild(textCount);
      g.appendChild(tileGroup);
    });

  } else {
    // 읍면동 상세 그리드 맵
    svg.setAttribute("viewBox", "0 0 500 320");

    let dongList = [];
    if (church114Filter.sigungu === "강남구" && typeof GANGNAM_DONGS !== "undefined") {
      dongList = GANGNAM_DONGS.map((d) => ({ name: d.name, cx: d.cx, cy: d.cy }));
    } else {
      dongList = subRegions.map((r, idx) => {
        const col = idx % 4;
        const row = Math.floor(idx / 4);
        return { name: r.name, cx: 80 + col * 105, cy: 60 + row * 65 };
      });
    }

    dongList.forEach((d) => {
      const info = regionMap[d.name] || { name: d.name, church_count: 0, density_color: "#3b82f6", top_denomination: "-", top_denom_ratio: 0 };
      const fillColor = info.density_color || "#3b82f6";

      const tileGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
      tileGroup.style.cursor = "pointer";

      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", d.cx - 42);
      rect.setAttribute("y", d.cy - 24);
      rect.setAttribute("width", "84");
      rect.setAttribute("height", "48");
      rect.setAttribute("rx", "8");
      rect.setAttribute("ry", "8");
      rect.setAttribute("fill", fillColor);
      rect.setAttribute("stroke", "#ffffff");
      rect.setAttribute("stroke-width", "2");
      rect.setAttribute("opacity", "0.92");

      const textName = document.createElementNS("http://www.w3.org/2000/svg", "text");
      textName.setAttribute("x", d.cx);
      textName.setAttribute("y", d.cy - 4);
      textName.setAttribute("text-anchor", "middle");
      textName.setAttribute("fill", "#ffffff");
      textName.setAttribute("font-size", "12");
      textName.setAttribute("font-weight", "700");
      textName.setAttribute("pointer-events", "none");
      textName.textContent = d.name;

      const textCount = document.createElementNS("http://www.w3.org/2000/svg", "text");
      textCount.setAttribute("x", d.cx);
      textCount.setAttribute("y", d.cy + 13);
      textCount.setAttribute("text-anchor", "middle");
      textCount.setAttribute("fill", "rgba(255,255,255,0.9)");
      textCount.setAttribute("font-size", "10");
      textCount.setAttribute("font-weight", "600");
      textCount.setAttribute("pointer-events", "none");
      textCount.textContent = `${info.church_count || 0}개`;

      tileGroup.addEventListener("mouseenter", (e) => showTooltip(e, info));
      tileGroup.addEventListener("mousemove", (e) => showTooltip(e, info));
      tileGroup.addEventListener("mouseleave", () => hideTooltip());
      tileGroup.addEventListener("click", () => {
        hideTooltip();
        const emdSelect = document.getElementById("analytics-emd-select");
        if (emdSelect) emdSelect.value = d.name;
        church114Filter.emd = d.name;
        loadChurch114Analytics(church114Filter.sido, church114Filter.sigungu, d.name);
      });

      tileGroup.appendChild(rect);
      tileGroup.appendChild(textName);
      tileGroup.appendChild(textCount);
      g.appendChild(tileGroup);
    });
  }

  svg.appendChild(g);
}

// --- Detailed Region Analytics Page Renderer (All Metrics Provided) ---

function renderRegionDetail(data, top10, grid) {
  currentGridChurches = grid;

  // 지역 타이틀 레이블
  let regionLabel = "전국";
  if (church114Filter.sido !== "전체") {
    regionLabel = church114Filter.sido;
    if (church114Filter.sigungu !== "전체") {
      regionLabel += ` ${church114Filter.sigungu}`;
      if (church114Filter.emd !== "전체") {
        regionLabel += ` ${church114Filter.emd}`;
      }
    }
  }

  // 1. 4대 요약 카드
  const summary = data.summary || {};
  const elTotal = document.getElementById("region-total-churches");
  const elScope = document.getElementById("region-scope-label");
  const elMembers = document.getElementById("region-total-members");
  const elAvg = document.getElementById("region-avg-members");
  const elTopDenom = document.getElementById("region-top-denomination");
  const elTopRatio = document.getElementById("region-top-denom-ratio");

  if (elTotal) elTotal.innerText = `${(summary.total_churches || 0).toLocaleString()}개`;
  if (elScope) elScope.innerText = `${regionLabel} 기준`;
  if (elMembers) elMembers.innerText = `${(summary.total_members || 0).toLocaleString()}명`;
  if (elAvg) elAvg.innerText = `${(summary.avg_members || 0).toLocaleString()}명`;
  if (elTopDenom) elTopDenom.innerText = summary.top_denomination || "-";
  if (elTopRatio) elTopRatio.innerText = `점유율 ${summary.top_denomination_ratio || 0}%`;

  // 2. 교단별 상세 점유율 현황 (표/바)
  const denomContainer = document.getElementById("region-denom-breakdown-list");
  if (denomContainer) {
    denomContainer.innerHTML = "";
    const denoms = data.denominations || [];
    if (denoms.length === 0) {
      denomContainer.innerHTML = `<div style="font-size:13px;color:var(--text-muted);padding:8px">데이터가 없습니다.</div>`;
    } else {
      denoms.forEach((d) => {
        const row = document.createElement("div");
        row.style.marginBottom = "10px";
        row.style.cursor = "pointer";
        row.title = `클릭 시 [${d.denomination}] 교회 그리드 필터링`;
        row.onclick = () => {
          const searchInput = document.getElementById("region-grid-search-input");
          if (searchInput) {
            searchInput.value = d.denomination;
            filterAndRenderGrid(d.denomination);
          }
        };
        row.innerHTML = `
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
            <span style="font-weight:600">${escapeHtml(d.denomination)}</span>
            <strong style="font-size:12px">${d.count}개 (${d.ratio}%)</strong>
          </div>
          <div style="background:#e2e8f0;height:8px;border-radius:4px;overflow:hidden">
            <div style="background:var(--primary);width:${d.ratio}%;height:100%;border-radius:4px"></div>
          </div>
        `;
        denomContainer.appendChild(row);
      });
    }
  }

  // 3. 성도 수 5단계 규모별 분포
  const scaleContainer = document.getElementById("region-scale-breakdown-list");
  if (scaleContainer) {
    scaleContainer.innerHTML = "";
    const scales = data.scale_tiers || [];
    if (scales.length === 0) {
      scaleContainer.innerHTML = `<div style="font-size:13px;color:var(--text-muted);padding:8px">데이터가 없습니다.</div>`;
    } else {
      scales.forEach((t) => {
        const color = SCALE_COLORS[t.scale] || "var(--primary)";
        const row = document.createElement("div");
        row.style.marginBottom = "10px";
        row.style.cursor = "pointer";
        row.title = `클릭 시 [${t.scale}] 교회 그리드 필터링`;
        row.onclick = () => {
          const searchInput = document.getElementById("region-grid-search-input");
          if (searchInput) {
            searchInput.value = t.scale.split(" ")[0];
            filterAndRenderGrid(searchInput.value);
          }
        };
        row.innerHTML = `
          <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
            <span style="font-weight:600">${escapeHtml(t.scale)}</span>
            <strong style="font-size:12px">${t.count}개 (${t.ratio}%)</strong>
          </div>
          <div style="background:#e2e8f0;height:8px;border-radius:4px;overflow:hidden">
            <div style="background:${color};width:${t.ratio}%;height:100%;border-radius:4px"></div>
          </div>
        `;
        scaleContainer.appendChild(row);
      });
    }
  }

  // 4. 해당 지역 [성도 수 상위 TOP 10 랭킹 카드]
  const top10Title = document.getElementById("region-top10-title");
  if (top10Title) top10Title.innerText = regionLabel;

  const top10Tbody = document.getElementById("region-top10-tbody");
  if (top10Tbody) {
    top10Tbody.innerHTML = "";
    if (!top10 || top10.length === 0) {
      top10Tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:24px">등록된 상위 거점 교회가 없습니다.</td></tr>`;
    } else {
      top10.forEach((c, idx) => {
        const rank = idx + 1;
        const rankBadgeStyle =
          rank === 1
            ? "background:#fef08a;color:#854d0e;font-weight:800"
            : rank === 2
            ? "background:#e2e8f0;color:#334155;font-weight:800"
            : rank === 3
            ? "background:#fed7aa;color:#9a3412;font-weight:800"
            : "background:#f1f5f9;color:var(--text-muted);font-weight:600";

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="text-align:center"><span class="badge" style="${rankBadgeStyle};width:24px;display:inline-block">${rank}</span></td>
          <td style="font-weight:700">${escapeHtml(c.church_name)}</td>
          <td><span class="badge" style="background:#f1f5f9">${escapeHtml(c.denomination || "정통")}</span></td>
          <td>${escapeHtml(c.pastor || "담임목사")}</td>
          <td style="font-weight:700;color:var(--primary)">${c.congregation_size ? c.congregation_size.toLocaleString() + "명" : '<span style="color:var(--text-muted)">미입력</span>'}</td>
          <td><span class="badge" style="background:#e0f2fe;color:#0369a1">${escapeHtml(c.scale_tier || "-")}</span></td>
          <td>
            <span class="copyable-cell" onclick="copySingleAddress('${escapeJs(c.road_address)}')" title="클릭 시 주소 복사">
              ${escapeHtml(c.road_address || "-")}
            </span>
          </td>
          <td style="font-size:12px">${escapeHtml(c.phone || "-")}</td>
          <td>
            ${c.homepage ? `<a href="${sanitizeUrl(c.homepage)}" target="_blank" style="color:var(--primary);font-size:12px">바로가기 🔗</a>` : '<span style="color:var(--text-muted);font-size:12px">-</span>'}
          </td>
        `;
        top10Tbody.appendChild(tr);
      });
    }
  }

  // 5. 해당 지역 전체 교회 데이터 그리드
  const gridTitle = document.getElementById("region-grid-title");
  if (gridTitle) gridTitle.innerText = regionLabel;

  renderGridTableRows(grid);
}

function filterAndRenderGrid(keyword) {
  if (!keyword) {
    renderGridTableRows(currentGridChurches);
    return;
  }
  const kw = keyword.toLowerCase();
  const filtered = currentGridChurches.filter((c) => {
    return (
      (c.church_name && c.church_name.toLowerCase().includes(kw)) ||
      (c.pastor && c.pastor.toLowerCase().includes(kw)) ||
      (c.denomination && c.denomination.toLowerCase().includes(kw)) ||
      (c.road_address && c.road_address.toLowerCase().includes(kw)) ||
      (c.scale_tier && c.scale_tier.toLowerCase().includes(kw))
    );
  });
  renderGridTableRows(filtered);
}

function renderGridTableRows(churches) {
  const tbody = document.getElementById("region-grid-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";
  if (!churches || churches.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:30px">해당 조건의 교회가 없습니다.</td></tr>`;
    return;
  }

  churches.forEach((c, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td style="text-align:center">
        <input type="checkbox" class="region-grid-checkbox" data-id="${c.id}" aria-label="선택">
      </td>
      <td style="color:var(--text-muted);font-size:12px;text-align:center">${idx + 1}</td>
      <td style="font-weight:600">${escapeHtml(c.church_name)}</td>
      <td><span class="badge" style="background:#f1f5f9">${escapeHtml(c.denomination || "-")}</span></td>
      <td>${escapeHtml(c.pastor || "-")}</td>
      <td style="font-weight:600">${c.congregation_size ? c.congregation_size.toLocaleString() + "명" : '<span style="color:var(--text-muted)">-</span>'}</td>
      <td><span class="badge" style="background:#f8fafc;border:1px solid var(--border)">${escapeHtml(c.scale_tier || "-")}</span></td>
      <td>
        <span class="copyable-cell" onclick="copySingleAddress('${escapeJs(c.road_address)}')" title="클릭 시 주소 복사">
          ${escapeHtml(c.road_address || "-")}
        </span>
      </td>
      <td style="font-size:12px;color:var(--text-muted)">${escapeHtml(c.zip_code || "-")}</td>
      <td style="font-size:12px">${escapeHtml(c.phone || "-")}</td>
    `;
    tbody.appendChild(tr);
  });
}

// --- Phase 6: System Settings Logic ---

function setupSettings() {
  const kakaoInput = document.getElementById("settings-kakao-api-key");
  const naverInput = document.getElementById("settings-naver-api-key");
  const btnSave = document.getElementById("btn-save-settings");

  if (kakaoInput && kakaoApiKey) kakaoInput.value = kakaoApiKey;
  if (naverInput && naverApiKey) naverInput.value = naverApiKey;

  if (btnSave) {
    btnSave.addEventListener("click", () => {
      if (kakaoInput) {
        kakaoApiKey = kakaoInput.value.trim();
        localStorage.setItem("CHURCH_HUB_KAKAO_API_KEY", kakaoApiKey);
      }
      if (naverInput) {
        naverApiKey = naverInput.value.trim();
        localStorage.setItem("CHURCH_HUB_NAVER_API_KEY", naverApiKey);
      }
      const vaultInput = document.getElementById("settings-obsidian-path");
      if (vaultInput) {
        obsidianVaultPath = vaultInput.value.trim();
        if (window.pywebview) {
          callApi("set_obsidian_vault_path", obsidianVaultPath);
        }
      }
      showToast("환경설정이 저장되었습니다.");
    });
  }
}

// --- Phase 5: Obsidian Smart Sync Logic ---

function setupObsidianSync() {
  const btnRecheck = document.getElementById("btn-recheck-obsidian");
  if (btnRecheck) {
    btnRecheck.addEventListener("click", () => {
      loadObsidianSync();
    });
  }

  const btnCreateAll = document.getElementById("btn-create-all-missing-notes");
  if (btnCreateAll) {
    btnCreateAll.addEventListener("click", () => {
      createAllMissingObsidianNotes();
    });
  }

  // 환경 설정 탭의 볼트 경로 저장 연동
  const settingsVaultInput = document.getElementById("settings-obsidian-path");
  if (settingsVaultInput) {
    settingsVaultInput.addEventListener("change", async (e) => {
      obsidianVaultPath = e.target.value.trim();
      if (window.pywebview) {
        await callApi("set_obsidian_vault_path", obsidianVaultPath);
      }
    });
  }
}

async function loadObsidianSync() {
  const statusBadge = document.getElementById("obsidian-status-badge");
  const pathDisplay = document.getElementById("obsidian-vault-path-display");
  if (pathDisplay) {
    pathDisplay.innerText = `볼트 경로: ${obsidianVaultPath}`;
  }

  let status = null;
  let diffData = null;

  if (window.pywebview) {
    status = await callApi("check_obsidian_status", obsidianVaultPath);
    diffData = await callApi("diff_obsidian", obsidianVaultPath);
  }

  if (!status) {
    // Mock Fallback
    status = {
      valid: true,
      vault_name: "Obsidian",
      has_churches_dir: true,
      churches_count: 3,
      has_template: true,
    };
  }

  if (!diffData) {
    // Mock Diff Fallback
    diffData = {
      success: true,
      in_sync_count: 1,
      diff_count: 1,
      missing_in_vault_count: 2,
      missing_in_excel_count: 1,
      diffs: [
        {
          row_id: 2,
          church_name: "광주동성교회",
          field: "pastor",
          label: "담임목사",
          excel_val: "안성주",
          obsidian_val: "홍길동",
          obsidian_link: "obsidian://open?vault=Obsidian&file=20.%20Churches%2F광주동성교회",
        },
      ],
      missing_in_vault: masterRecords.slice(2).map((r) => r),
      missing_in_excel: [
        {
          church_name: "서울새빛교회",
          pastor: "김바울",
          denomination: "백석",
          region: "서울",
          tier: "B",
          obsidian_link: "obsidian://open?vault=Obsidian&file=20.%20Churches%2F서울새빛교회",
        },
      ],
    };
  }

  renderObsidianSync(diffData, status);
}

function renderObsidianSync(data, status) {
  // 1. Status Badge
  const statusBadge = document.getElementById("obsidian-status-badge");
  if (statusBadge) {
    if (status && status.valid) {
      statusBadge.innerText = `🟢 볼트 연결됨 (${status.churches_count || 0}개 노트 인식)`;
      statusBadge.style.background = "var(--success-light)";
      statusBadge.style.color = "var(--success)";
    } else {
      statusBadge.innerText = `🔴 연결 실패 (${status ? status.error : "경로 확인 필요"})`;
      statusBadge.style.background = "var(--danger-light)";
      statusBadge.style.color = "var(--danger)";
    }
  }

  // 2. 4 KPIs
  const elSync = document.getElementById("obs-kpi-sync");
  const elDiff = document.getElementById("obs-kpi-diff");
  const elMissingVault = document.getElementById("obs-kpi-missing-vault");
  const elMissingExcel = document.getElementById("obs-kpi-missing-excel");

  if (elSync) elSync.innerText = `${data.in_sync_count || 0}건`;
  if (elDiff) elDiff.innerText = `${data.diff_count || 0}건`;
  if (elMissingVault) elMissingVault.innerText = `${data.missing_in_vault_count || 0}건`;
  if (elMissingExcel) elMissingExcel.innerText = `${data.missing_in_excel_count || 0}건`;

  // 3. Diff List
  const diffContainer = document.getElementById("obsidian-diff-list");
  if (diffContainer) {
    diffContainer.innerHTML = "";
    const diffs = data.diffs || [];
    if (diffs.length === 0) {
      diffContainer.innerHTML = `
        <div style="text-align:center;padding:28px;background:#f8fafc;border-radius:8px;border:1px solid var(--border)">
          <span style="font-size:20px">🎉</span>
          <div style="font-weight:700;margin-top:6px">엑셀과 옵시디언의 모든 정보가 완벽히 일치합니다!</div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:4px">해결이 필요한 정보 불일치(Conflict)가 없습니다.</div>
        </div>
      `;
    } else {
      diffs.forEach((d) => {
        const card = document.createElement("div");
        card.className = "obsidian-diff-card";
        card.innerHTML = `
          <div class="obsidian-diff-header">
            <div style="display:flex;align-items:center;gap:10px">
              <span style="font-size:15px;font-weight:700">${escapeHtml(d.church_name)}</span>
              <span class="badge" style="background:var(--warning-light);color:var(--warning);font-weight:700">
                ${escapeHtml(d.label || d.field)} 불일치
              </span>
            </div>
            ${
              d.obsidian_link
                ? `<a href="${d.obsidian_link}" class="btn btn-secondary btn-sm" style="text-decoration:none" title="옵시디언 앱에서 바로 열기">
                    🔗 옵시디언 열기
                  </a>`
                : ""
            }
          </div>
          <div class="obsidian-diff-compare-box">
            <!-- 엑셀 기준 -->
            <div class="obsidian-diff-side">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:12px;font-weight:700;color:#1d4ed8">📊 엑셀 마스터시트 값</span>
                <button class="btn btn-secondary btn-sm" onclick="resolveObsidianDiff(${d.row_id}, '${escapeHtml(d.field)}', 'USE_EXCEL')">
                  엑셀 기준 적용 ➡️
                </button>
              </div>
              <div class="obsidian-diff-val excel">${escapeHtml(d.excel_val || "(비어있음)")}</div>
              <div style="font-size:11px;color:var(--text-muted)">클릭 시 옵시디언 마크다운 Frontmatter를 엑셀 값으로 갱신합니다.</div>
            </div>
            <!-- 옵시디언 기준 -->
            <div class="obsidian-diff-side">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:12px;font-weight:700;color:#7e22ce">🔮 옵시디언 볼트 값</span>
                <button class="btn btn-secondary btn-sm" onclick="resolveObsidianDiff(${d.row_id}, '${escapeHtml(d.field)}', 'USE_OBSIDIAN')">
                  ⬅️ 옵시디언 기준 적용
                </button>
              </div>
              <div class="obsidian-diff-val obsidian">${escapeHtml(d.obsidian_val || "(비어있음)")}</div>
              <div style="font-size:11px;color:var(--text-muted)">클릭 시 엑셀 레코드의 해당 필드를 옵시디언 값으로 갱신합니다.</div>
            </div>
          </div>
        `;
        diffContainer.appendChild(card);
      });
    }
  }

  // 4. Missing in Vault Table
  const tbodyMissingVault = document.getElementById("obsidian-missing-vault-tbody");
  if (tbodyMissingVault) {
    const missingVault = data.missing_in_vault || [];
    if (missingVault.length === 0) {
      tbodyMissingVault.innerHTML = `
        <tr>
          <td colspan="8" style="text-align:center;color:var(--text-muted);padding:24px">
            모든 엑셀 등록 교회의 마크다운 노트가 옵시디언 볼트에 존재합니다.
          </td>
        </tr>
      `;
    } else {
      tbodyMissingVault.innerHTML = "";
      missingVault.forEach((r, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="color:var(--text-muted);font-size:12px">${idx + 1}</td>
          <td style="font-weight:600">${escapeHtml(r.church_name)}</td>
          <td>${escapeHtml(r.pastor || "")}</td>
          <td><span class="badge" style="background:#f1f5f9">${escapeHtml(r.denomination || "미지정")}</span></td>
          <td>${escapeHtml(r.region || "-")}</td>
          <td>${r.congregation_size ? r.congregation_size.toLocaleString() + "명" : '<span style="color:var(--text-muted)">미입력</span>'}</td>
          <td><span class="badge ${r.tier === "A" ? "badge-verified" : "badge-manual"}">${escapeHtml(r.tier || "-")}</span></td>
          <td style="text-align:center">
            <button class="btn btn-primary btn-sm" onclick="createSingleObsidianNote(${r.row_id})">
              📝 노트 생성
            </button>
          </td>
        `;
        tbodyMissingVault.appendChild(tr);
      });
    }
  }

  // 5. Missing in Excel Table
  const tbodyMissingExcel = document.getElementById("obsidian-missing-excel-tbody");
  if (tbodyMissingExcel) {
    const missingExcel = data.missing_in_excel || [];
    if (missingExcel.length === 0) {
      tbodyMissingExcel.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center;color:var(--text-muted);padding:24px">
            옵시디언 볼트의 모든 교회가 엑셀 마스터시트에 등록되어 있습니다.
          </td>
        </tr>
      `;
    } else {
      tbodyMissingExcel.innerHTML = "";
      missingExcel.forEach((item, idx) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td style="color:var(--text-muted);font-size:12px">${idx + 1}</td>
          <td style="font-weight:600">
            ${escapeHtml(item.church_name)}
            ${
              item.obsidian_link
                ? `<a href="${item.obsidian_link}" style="text-decoration:none;margin-left:4px" title="옵시디언에서 열기">🔗</a>`
                : ""
            }
          </td>
          <td>${escapeHtml(item.pastor || "")}</td>
          <td><span class="badge" style="background:#f1f5f9">${escapeHtml(item.denomination || "미지정")}</span></td>
          <td>${escapeHtml(item.region || "-")}</td>
          <td><span class="badge ${item.tier === "A" ? "badge-verified" : "badge-manual"}">${escapeHtml(item.tier || "-")}</span></td>
          <td style="text-align:center">
            <button class="btn btn-secondary btn-sm" onclick="importSingleObsidianChurch('${escapeHtml(item.church_name)}')">
              📥 엑셀로 가져오기
            </button>
          </td>
        `;
        tbodyMissingExcel.appendChild(tr);
      });
    }
  }
}

async function resolveObsidianDiff(rowId, field, choice) {
  if (window.pywebview) {
    showToast("불일치 정보를 해결하는 중...");
    const res = await callApi("resolve_obsidian_diff", rowId, field, choice, obsidianVaultPath);
    if (res) {
      const msg =
        choice === "USE_EXCEL"
          ? "옵시디언 마크다운 Frontmatter가 엑셀 값으로 갱신되었습니다."
          : "엑셀 레코드가 옵시디언 값으로 갱신되었습니다.";
      showToast(msg);
      // 레코드 동기화
      if (res.record) {
        const idx = masterRecords.findIndex((r) => r.row_id === rowId);
        if (idx !== -1) masterRecords[idx] = res.record;
      }
      await loadObsidianSync();
      renderDashboard();
    }
  } else {
    showToast(`${choice === "USE_EXCEL" ? "엑셀" : "옵시디언"} 기준으로 동기화 완료 (미리보기 모드)`);
    await loadObsidianSync();
  }
}

async function createSingleObsidianNote(rowId) {
  if (window.pywebview) {
    showToast("옵시디언 마크다운 노트를 생성하는 중...");
    const res = await callApi("create_obsidian_note", rowId, obsidianVaultPath);
    if (res) {
      showToast(`노트 생성 완료: ${res.church_name}.md`);
      await loadObsidianSync();
    }
  } else {
    showToast("노트 생성 완료 (미리보기 모드)");
    await loadObsidianSync();
  }
}

async function createAllMissingObsidianNotes() {
  if (window.pywebview) {
    showToast("누락된 모든 교회의 마크다운 노트를 일괄 생성하는 중...");
    const res = await callApi("create_all_missing_notes", obsidianVaultPath);
    if (res) {
      showToast(`총 ${res.created_count}개의 옵시디언 노트를 일괄 생성했습니다.`);
      await loadObsidianSync();
    }
  } else {
    showToast("일괄 생성 완료 (미리보기 모드)");
    await loadObsidianSync();
  }
}

async function importSingleObsidianChurch(churchName) {
  if (window.pywebview) {
    showToast("옵시디언 교회를 엑셀로 가져오는 중...");
    const res = await callApi("import_obsidian_church", churchName, obsidianVaultPath);
    if (res) {
      if (res.record) {
        masterRecords.push(res.record);
      }
      showToast(`엑셀 마스터 레코드에 [${churchName}] 추가 완료 (총 ${res.total_master_count}건)`);
      await loadObsidianSync();
      renderDashboard();
    }
  } else {
    showToast(`엑셀에 [${churchName}] 추가 완료 (미리보기 모드)`);
    await loadObsidianSync();
  }
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

// --- Clipboard & String Helpers ---

function escapeJs(str) {
  if (!str) return "";
  return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"');
}

window.copySingleAddress = function (addressStr) {
  if (!addressStr) {
    showToast("복사할 주소 정보가 없습니다.");
    return;
  }
  navigator.clipboard.writeText(addressStr).then(() => {
    showToast(`주소가 복사되었습니다: ${addressStr}`);
  }).catch((err) => {
    console.error("Clipboard copy failed:", err);
    showToast("클립보드 복사에 실패했습니다.");
  });
};
