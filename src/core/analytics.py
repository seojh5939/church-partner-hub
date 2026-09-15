"""Analytics Engine for Church Partnership Hub.

Computes regional church statistics, denomination distributions,
5-tier scale segmentation, and cross-tabulation matrix.
Adheres to SOLID, YAGNI, and Pragmatic Extensibility.
"""

from typing import Any, Dict, List, Optional
from src.core.models import ChurchRecord, classify_church_scale

SCALE_CATEGORIES = [
    "소형 (~100)",
    "중형 (100~500)",
    "중대형 (500~1000)",
    "대형 (1000~3000)",
    "초대형 (3000~)",
    "미입력",
]


class AnalyticsEngine:
    """교세·교단·5단계 규모 통계 및 드릴다운 분석 엔진."""

    def calculate_analytics(
        self,
        records: List[ChurchRecord],
        region_filter: Optional[str] = None,
        denomination_filter: Optional[str] = None,
        scale_filter: Optional[str] = None,
    ) -> Dict[str, Any]:
        """지역, 교단, 규모 필터를 반영한 교세 분석 결과와 교차 집계표를 산출합니다."""
        # 1. 1차 필터링: 지역 기준 (통계 모집합 산출용)
        regional_records = self._filter_by_region(records, region_filter)
        total_regional_churches = len(regional_records)

        # 2. 요약 통계 산출
        summary = self._calculate_summary(regional_records)

        # 3. 전 지역별 요약 통계 (전체 뷰일 때 유용)
        regional_breakdown = self._calculate_regional_breakdown(records)

        # 4. 교단 분포 산출
        denom_dist = self._calculate_denomination_distribution(
            regional_records, total_regional_churches
        )

        # 5. 5단계 규모 분포 산출
        scale_dist = self._calculate_scale_distribution(
            regional_records, total_regional_churches
        )

        # 6. 교단 × 규모 교차 집계표 (Cross-tabulation Matrix)
        crosstab = self._calculate_cross_tabulation(regional_records)

        # 7. 드릴다운 필터링 적용된 교회 목록 (UI 즉각 표시용)
        drilldown_churches = self.filter_churches(
            records=records,
            region=region_filter,
            denomination=denomination_filter,
            scale=scale_filter,
        )

        return {
            "summary": summary,
            "regional_breakdown": regional_breakdown,
            "denomination_distribution": denom_dist,
            "scale_distribution": scale_dist,
            "crosstab": crosstab,
            "churches": [r.to_dict() for r in drilldown_churches],
            "drilldown_count": len(drilldown_churches),
            "applied_filters": {
                "region": region_filter or "전체",
                "denomination": denomination_filter or "전체",
                "scale": scale_filter or "전체",
            },
        }

    def filter_churches(
        self,
        records: List[ChurchRecord],
        region: Optional[str] = None,
        denomination: Optional[str] = None,
        scale: Optional[str] = None,
    ) -> List[ChurchRecord]:
        """지역, 교단, 규모 조건을 결합하여 교회를 정밀 필터링합니다 (Drill-down)."""
        filtered = records

        if region and region != "전체":
            filtered = [r for r in filtered if r.region == region]

        if denomination and denomination != "전체":
            filtered = [
                r for r in filtered
                if (r.denomination or "미지정") == denomination
            ]

        if scale and scale != "전체":
            filtered = [
                r for r in filtered
                if classify_church_scale(r.congregation_size) == scale
            ]

        return filtered

    # --- Internal Calculation Helpers ---

    def _filter_by_region(
        self, records: List[ChurchRecord], region_filter: Optional[str]
    ) -> List[ChurchRecord]:
        if not region_filter or region_filter == "전체":
            return list(records)
        return [r for r in records if r.region == region_filter]

    def _calculate_summary(self, records: List[ChurchRecord]) -> Dict[str, Any]:
        total_churches = len(records)
        known_sizes = [
            r.congregation_size
            for r in records
            if r.congregation_size is not None and r.congregation_size > 0
        ]
        total_members = sum(known_sizes)
        avg_members = int(total_members / len(known_sizes)) if known_sizes else 0
        max_members = max(known_sizes) if known_sizes else 0
        min_members = min(known_sizes) if known_sizes else 0
        entered_count = len(known_sizes)
        entered_ratio = (
            round(entered_count / total_churches * 100, 1) if total_churches else 0.0
        )

        return {
            "total_churches": total_churches,
            "total_members": total_members,
            "avg_members": avg_members,
            "max_members": max_members,
            "min_members": min_members,
            "entered_count": entered_count,
            "missing_count": total_churches - entered_count,
            "entered_ratio": entered_ratio,
        }

    def _calculate_regional_breakdown(
        self, records: List[ChurchRecord]
    ) -> List[Dict[str, Any]]:
        region_map: Dict[str, List[ChurchRecord]] = {}
        for r in records:
            reg = r.region or "미지정"
            region_map.setdefault(reg, []).append(r)

        result: List[Dict[str, Any]] = []
        total_all = len(records)

        for reg, r_list in region_map.items():
            sizes = [
                r.congregation_size
                for r in r_list
                if r.congregation_size is not None and r.congregation_size > 0
            ]
            members = sum(sizes)
            avg = int(members / len(sizes)) if sizes else 0
            result.append(
                {
                    "region": reg,
                    "church_count": len(r_list),
                    "total_members": members,
                    "avg_members": avg,
                    "ratio": round(len(r_list) / total_all * 100, 1) if total_all else 0.0,
                }
            )

        result.sort(key=lambda x: x["church_count"], reverse=True)
        return result

    def _calculate_denomination_distribution(
        self, records: List[ChurchRecord], total_churches: int
    ) -> List[Dict[str, Any]]:
        denom_map: Dict[str, Dict[str, Any]] = {}

        for r in records:
            d = r.denomination or "미지정"
            if d not in denom_map:
                denom_map[d] = {"name": d, "count": 0, "total_members": 0}
            denom_map[d]["count"] += 1
            if r.congregation_size and r.congregation_size > 0:
                denom_map[d]["total_members"] += r.congregation_size

        dist = list(denom_map.values())
        for item in dist:
            item["ratio"] = (
                round(item["count"] / total_churches * 100, 1) if total_churches else 0.0
            )

        dist.sort(key=lambda x: x["count"], reverse=True)
        return dist

    def _calculate_scale_distribution(
        self, records: List[ChurchRecord], total_churches: int
    ) -> List[Dict[str, Any]]:
        scale_map = {cat: {"scale": cat, "count": 0, "total_members": 0} for cat in SCALE_CATEGORIES}

        for r in records:
            cat = classify_church_scale(r.congregation_size)
            scale_map[cat]["count"] += 1
            if r.congregation_size and r.congregation_size > 0:
                scale_map[cat]["total_members"] += r.congregation_size

        dist: List[Dict[str, Any]] = []
        for cat in SCALE_CATEGORIES:
            item = scale_map[cat]
            item["ratio"] = (
                round(item["count"] / total_churches * 100, 1) if total_churches else 0.0
            )
            dist.append(item)

        return dist

    def _calculate_cross_tabulation(
        self, records: List[ChurchRecord]
    ) -> Dict[str, Any]:
        """교단(행) × 5단계 규모(열) 교차 집계 매트릭스."""
        # 교단 목록 수집
        denominations = sorted(list({r.denomination or "미지정" for r in records}))

        # matrix 구조 초기화
        matrix: Dict[str, Dict[str, int]] = {
            denom: {scale: 0 for scale in SCALE_CATEGORIES}
            for denom in denominations
        }
        column_totals = {scale: 0 for scale in SCALE_CATEGORIES}

        for r in records:
            d = r.denomination or "미지정"
            s = classify_church_scale(r.congregation_size)
            matrix[d][s] += 1
            column_totals[s] += 1

        # 행 목록 변환
        rows = []
        for d in denominations:
            row_total = sum(matrix[d].values())
            rows.append(
                {
                    "denomination": d,
                    "scales": matrix[d],
                    "total": row_total,
                }
            )

        rows.sort(key=lambda x: x["total"], reverse=True)

        return {
            "columns": SCALE_CATEGORIES,
            "rows": rows,
            "column_totals": column_totals,
            "grand_total": len(records),
        }
