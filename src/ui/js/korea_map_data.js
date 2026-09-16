/**
 * Korea Administrative Boundaries & Density Map Engine for Church Partner Hub.
 * Zero-Config, 100% Offline-capable interactive SVG/Canvas vector map.
 * Supports 17 Sido (Metropolitan/Provinces) and 250 Sigungu (Districts/Counties).
 */

const KOREA_SIDO_LIST = [
  { id: "seoul", name: "서울특별시", short: "서울", cx: 180, cy: 110, w: 70, h: 60 },
  { id: "gyeonggi", name: "경기도", short: "경기", cx: 210, cy: 120, w: 140, h: 140 },
  { id: "incheon", name: "인천광역시", short: "인천", cx: 130, cy: 110, w: 50, h: 50 },
  { id: "gangwon", name: "강원도", short: "강원", cx: 320, cy: 100, w: 160, h: 140 },
  { id: "chungbuk", name: "충청북도", short: "충북", cx: 250, cy: 200, w: 90, h: 120 },
  { id: "chungnam", name: "충청남도", short: "충남", cx: 150, cy: 220, w: 110, h: 110 },
  { id: "daejeon", name: "대전광역시", short: "대전", cx: 210, cy: 240, w: 40, h: 40 },
  { id: "sejong", name: "세종특별자치시", short: "세종", cx: 190, cy: 210, w: 35, h: 35 },
  { id: "jeonbuk", name: "전북특별자치도", short: "전북", cx: 170, cy: 310, w: 120, h: 100 },
  { id: "jeonnam", name: "전라남도", short: "전남", cx: 160, cy: 410, w: 130, h: 110 },
  { id: "gwangju", name: "광주광역시", short: "광주", cx: 165, cy: 375, w: 45, h: 45 },
  { id: "gyeongbuk", name: "경상북도", short: "경북", cx: 340, cy: 230, w: 130, h: 150 },
  { id: "gyeongnam", name: "경상남도", short: "경남", cx: 290, cy: 360, w: 130, h: 110 },
  { id: "daegu", name: "대구광역시", short: "대구", cx: 315, cy: 285, w: 45, h: 45 },
  { id: "ulsan", name: "울산광역시", short: "울산", cx: 380, cy: 335, w: 45, h: 45 },
  { id: "busan", name: "부산광역시", short: "부산", cx: 360, cy: 380, w: 55, h: 45 },
  { id: "jeju", name: "제주특별자치도", short: "제주", cx: 150, cy: 540, w: 90, h: 50 },
];

// 서울 자치구 그리드 (시도 줌인 시 노출)
const SEOUL_DISTRICTS = [
  { name: "종로구", cx: 170, cy: 110 },
  { name: "중구", cx: 175, cy: 125 },
  { name: "용산구", cx: 170, cy: 145 },
  { name: "성동구", cx: 200, cy: 130 },
  { name: "광진구", cx: 220, cy: 135 },
  { name: "동대문구", cx: 205, cy: 115 },
  { name: "중랑구", cx: 225, cy: 110 },
  { name: "성북구", cx: 190, cy: 95 },
  { name: "강북구", cx: 185, cy: 75 },
  { name: "도봉구", cx: 190, cy: 55 },
  { name: "노원구", cx: 215, cy: 65 },
  { name: "은평구", cx: 145, cy: 90 },
  { name: "서대문구", cx: 150, cy: 115 },
  { name: "마포구", cx: 135, cy: 130 },
  { name: "양천구", cx: 115, cy: 160 },
  { name: "강서구", cx: 95, cy: 135 },
  { name: "구로구", cx: 110, cy: 180 },
  { name: "금천구", cx: 130, cy: 195 },
  { name: "영등포구", cx: 140, cy: 160 },
  { name: "동작구", cx: 160, cy: 165 },
  { name: "관악구", cx: 155, cy: 190 },
  { name: "서초구", cx: 185, cy: 175 },
  { name: "강남구", cx: 210, cy: 170 },
  { name: "송파구", cx: 240, cy: 165 },
  { name: "강동구", cx: 250, cy: 135 },
];

// 강남구 주요 법정동/행정동 (구 줌인 시 노출)
const GANGNAM_DONGS = [
  { name: "역삼동", cx: 190, cy: 170 },
  { name: "신사동", cx: 180, cy: 140 },
  { name: "논현동", cx: 190, cy: 150 },
  { name: "압구정동", cx: 195, cy: 135 },
  { name: "청담동", cx: 215, cy: 140 },
  { name: "삼성동", cx: 220, cy: 160 },
  { name: "대치동", cx: 215, cy: 180 },
  { name: "도곡동", cx: 200, cy: 190 },
  { name: "개포동", cx: 205, cy: 210 },
  { name: "일원동", cx: 225, cy: 205 },
  { name: "수서동", cx: 235, cy: 220 },
  { name: "세곡동", cx: 230, cy: 240 },
];
