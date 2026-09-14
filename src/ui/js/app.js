/**
 * church-partner-hub Frontend Application Logic
 * Communicates with Python backend via window.pywebview.api (JSON-RPC)
 */

// State
let currentMode = "MASTER";
let masterRecords = [];
let simpleRecords = [];
let stats = {};

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
        <td><strong>${r.region}</strong></td>
        <td>${r.classification || "-"}</td>
        <td><strong>${r.church_name}</strong></td>
        <td>${r.pastor}</td>
        <td>${r.denomination || "-"}</td>
        <td>${r.congregation_size ? r.congregation_size.toLocaleString() : "-"}</td>
        <td><span class="badge badge-primary">${r.scale_tier || "-"}</span></td>
        <td>${r.address || '<span style="color:#94a3b8">(주소 누락)</span>'}</td>
        <td>${r.zip_code || "-"}</td>
        <td>${r.homepage ? `<a href="${r.homepage}" target="_blank" style="color:var(--primary)">${r.homepage}</a>` : "-"}</td>
        <td>${renderStatusBadge(r.verification_status)}</td>
        <td>${renderStatusBadge(r.homepage_status)}</td>
        <td>${r.primary_campaign || "-"}</td>
        <td>${r.next_action || "-"}</td>
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
        <td><strong>${r.church_name}</strong></td>
        <td>${r.pastor}</td>
        <td>${r.region}</td>
        <td>${r.road_address || '<span style="color:#94a3b8">(주소 미검증)</span>'}</td>
        <td>${r.zip_code || "-"}</td>
        <td>${r.homepage ? `<a href="${r.homepage}" target="_blank" style="color:var(--primary)">${r.homepage}</a>` : "-"}</td>
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
    item.innerHTML = `
      <div>
        <div style="font-weight:600">${r.church_name} (${r.pastor})</div>
        <div style="font-size:12px;color:var(--text-muted)">${r.region} | 주소: ${r.address || r.road_address || "누락"}</div>
      </div>
      <div>
        ${isUnverified ? '<span class="badge badge-warning">검증 필요</span>' : '<span class="badge badge-success">완료</span>'}
      </div>
    `;

    item.addEventListener("click", () => loadGroundingDetail(r));
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
      <strong>${record.church_name}</strong> (${record.pastor} 목사 / ${record.region})
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
      ${record.church_name} <span style="font-size:13px;font-weight:400;color:var(--text-muted)">(${record.pastor} 목사 / ${record.region})</span>
    </div>
    
    <div class="grounding-grid" style="margin-top:16px">
      <!-- 1단계: 도로명 주소 검증 -->
      <div class="grounding-box">
        <div class="box-title">
          <span>📍 1단계: 도로명 주소 추정</span>
          <span class="badge ${bestAddr.confidence_level === 'HIGH' ? 'badge-success' : 'badge-warning'}">
            신뢰도 ${bestAddr.confidence}% (${bestAddr.confidence_level})
          </span>
        </div>
        <div style="font-size:14px;font-weight:600;margin-bottom:4px">${bestAddr.road_address}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">우편번호: ${bestAddr.zip_code || "자동부여"} | 근거: ${bestAddr.match_evidence}</div>
        ${bestAddr.map_url ? `<a href="${bestAddr.map_url}" target="_blank" class="btn btn-secondary btn-sm" style="margin-bottom:12px">🗺️ 포털 지도 확인</a>` : ''}
        
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
            ${hpCandidate ? hpCandidate.confidence_level : 'LOW'}
          </span>
        </div>
        <div style="font-size:14px;font-weight:600;margin-bottom:4px;word-break:break-all">
          ${hpCandidate ? hpCandidate.url : '검색된 URL 없음'}
        </div>
        
        <div style="font-size:12px;color:${hpCandidate && hpCandidate.is_dependent_uncertain ? 'var(--danger)' : 'var(--text-muted)'};margin-bottom:12px;line-height:1.4">
          ${hpCandidate ? hpCandidate.evidence : '주소 검증 후 확인 가능'}
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
    card.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:16px;font-weight:700">${r.church_name}</div>
          <div style="font-size:13px;color:var(--text-muted);margin-top:2px">
            담임목사: <strong>${r.pastor}</strong> | 지역: ${r.region} | 우편번호: ${r.zip_code || "-"}
          </div>
          <div style="font-size:13px;margin-top:6px">주소: ${r.address || r.road_address || '<span style="color:#ef4444">주소 누락</span>'}</div>
          ${r.homepage ? `<div style="font-size:12px;color:var(--primary);margin-top:4px">홈페이지: ${r.homepage}</div>` : ''}
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

// --- Analytics View ---

function renderAnalytics() {
  const denomContainer = document.getElementById("analytics-denom-list");
  const scaleContainer = document.getElementById("analytics-scale-list");
  if (!denomContainer || !scaleContainer) return;

  denomContainer.innerHTML = "";
  scaleContainer.innerHTML = "";

  // Denominations
  const denoms = [
    { name: "예장합동", count: 1, ratio: 50.0 },
    { name: "예장통합", count: 1, ratio: 50.0 },
  ];
  denoms.forEach((d) => {
    const row = document.createElement("div");
    row.style.marginBottom = "10px";
    row.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
        <span>${d.name}</span>
        <strong>${d.count}개 (${d.ratio}%)</strong>
      </div>
      <div style="background:#e2e8f0;height:8px;border-radius:4px;overflow:hidden">
        <div style="background:var(--primary);width:${d.ratio}%;height:100%"></div>
      </div>
    `;
    denomContainer.appendChild(row);
  });

  // 5 Tiers
  const tiers = [
    { scale: "소형 (~100)", count: 0, ratio: 0 },
    { scale: "중형 (100~500)", count: 0, ratio: 0 },
    { scale: "중대형 (500~1000)", count: 1, ratio: 50.0 },
    { scale: "대형 (1000~3000)", count: 0, ratio: 0 },
    { scale: "초대형 (3000~)", count: 1, ratio: 50.0 },
  ];
  tiers.forEach((t) => {
    const row = document.createElement("div");
    row.style.marginBottom = "10px";
    row.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
        <span>${t.scale}</span>
        <strong>${t.count}개 (${t.ratio}%)</strong>
      </div>
      <div style="background:#e2e8f0;height:8px;border-radius:4px;overflow:hidden">
        <div style="background:var(--success);width:${t.ratio}%;height:100%"></div>
      </div>
    `;
    scaleContainer.appendChild(row);
  });
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
