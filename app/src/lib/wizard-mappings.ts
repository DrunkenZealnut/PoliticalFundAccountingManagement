/* ------------------------------------------------------------------ */
/*  회계자료등록 마법사 — 거래유형 카드 정의 및 코드 매핑                    */
/* ------------------------------------------------------------------ */

export interface WizardType {
  id: string;
  icon: string;
  label: string;
  description: string;
  incmSecCd: 1 | 2;
  accSecCdName?: string;    // 계정명 매칭 키워드
  itemKeyword?: string;     // 과목명 매칭 키워드 ("선거비용" | "선거비용외")
  expGroup1?: string;       // 지출유형 대분류 자동 설정
  expGroup2?: string;       // 지출유형 중분류 자동 설정
  keywords: string[];       // 검색용 키워드
  route?: string;           // 특수 카드: 다른 페이지로 이동
}

/* ---- 지출 카드 (10종) ---- */
export const EXPENSE_WIZARD_TYPES: WizardType[] = [
  {
    id: "office",
    icon: "🏢",
    label: "사무소",
    description: "임대료, 관리비, 비품, 사무집기",
    incmSecCd: 2,
    itemKeyword: "선거비용외",
    expGroup1: "선거사무소",
    keywords: ["사무소", "임대", "임차", "관리비", "전기", "수도", "비품", "사무용품", "보증금"],
  },
  {
    id: "print",
    icon: "📄",
    label: "인쇄물",
    description: "명함, 공보물, 홍보물, 선거벽보",
    incmSecCd: 2,
    itemKeyword: "선거비용",
    expGroup1: "인쇄물",
    keywords: ["인쇄", "명함", "공보", "홍보물", "벽보", "공약서", "사진", "라벨"],
  },
  {
    id: "ad",
    icon: "📢",
    label: "광고/홍보",
    description: "신문, TV, 라디오, 인터넷 광고",
    incmSecCd: 2,
    itemKeyword: "선거비용",
    expGroup1: "광고",
    keywords: ["광고", "신문", "TV", "라디오", "인터넷", "배너", "SNS", "동영상"],
  },
  {
    id: "goods",
    icon: "🎽",
    label: "소품",
    description: "어깨띠, 윗옷, 모자, 폼보드",
    incmSecCd: 2,
    itemKeyword: "선거비용",
    expGroup1: "소품",
    keywords: ["소품", "어깨띠", "윗옷", "모자", "폼보드", "기호", "피켓"],
  },
  {
    id: "vehicle",
    icon: "🚗",
    label: "차량/이동",
    description: "차량 임차, 유류비, 기사 인건비",
    incmSecCd: 2,
    itemKeyword: "선거비용",
    expGroup1: "공개장소연설대담",
    expGroup2: "차량",
    keywords: ["차량", "유류", "기사", "주유", "택시", "렌트", "이동"],
  },
  {
    id: "telecom",
    icon: "📱",
    label: "전화/문자",
    description: "전화요금, 문자발송비, 인터넷",
    incmSecCd: 2,
    itemKeyword: "선거비용",
    expGroup1: "전화/전자우편/문자메시지",
    keywords: ["전화", "문자", "SMS", "통화", "인터넷", "이메일", "우편", "발송"],
  },
  {
    id: "labor",
    icon: "👥",
    label: "인건비",
    description: "선거사무원 수당, 활동보조인",
    incmSecCd: 2,
    itemKeyword: "선거비용",
    expGroup1: "선거사무관계자",
    keywords: ["수당", "인건비", "사무원", "사무장", "활동보조", "식대", "급여"],
  },
  {
    id: "banner",
    icon: "🏗",
    label: "현수막/설치",
    description: "현수막, 무대, 확성장치, 간판",
    incmSecCd: 2,
    itemKeyword: "선거비용",
    expGroup1: "거리게시용현수막",
    keywords: ["현수막", "무대", "연단", "확성", "간판", "현판", "설치", "철거", "래핑"],
  },
  {
    id: "burden-cost",
    icon: "♿",
    label: "부담비용",
    description: "점자형 공보, 저장매체, 활동보조인",
    incmSecCd: 2,
    itemKeyword: "선거비용외",
    expGroup1: "부담비용",
    keywords: ["부담비용", "점자", "저장매체", "활동보조인", "시각장애", "산재보험", "점역"],
  },
  {
    id: "receipt-scan",
    icon: "🧾",
    label: "영수증/계약서 첨부",
    description: "문서 업로드로 AI 자동 입력",
    incmSecCd: 2,
    keywords: ["영수증", "계약서", "견적서", "거래내역서", "주문서", "첨부"],
    route: "/dashboard/document-register",
  },
  {
    id: "other-expense",
    icon: "📦",
    label: "기타",
    description: "위 항목에 해당하지 않는 지출",
    incmSecCd: 2,
    itemKeyword: "선거비용",
    keywords: [],
  },
];

/* ---- 수입 카드 (5종) ---- */
export const INCOME_WIZARD_TYPES: WizardType[] = [
  {
    id: "donation",
    icon: "💰",
    label: "후원금",
    description: "기명후원금, 익명후원금",
    incmSecCd: 1,
    accSecCdName: "후원",
    keywords: ["후원", "기부", "후원금"],
  },
  {
    id: "subsidy",
    icon: "🏛",
    label: "보조금",
    description: "정당 보조금 지원",
    incmSecCd: 1,
    accSecCdName: "보조금",
    keywords: ["보조금", "지원금", "정당"],
  },
  {
    id: "asset",
    icon: "🏦",
    label: "자산",
    description: "후보자 개인 자산 투입",
    incmSecCd: 1,
    accSecCdName: "자산",
    keywords: ["자산", "후보자", "개인자금"],
  },
  {
    id: "receipt-scan-income",
    icon: "🧾",
    label: "영수증/계약서 첨부",
    description: "문서 업로드로 AI 자동 입력",
    incmSecCd: 1,
    keywords: ["영수증", "계약서"],
    route: "/dashboard/document-register?tab=income",
  },
  {
    id: "other-income",
    icon: "📦",
    label: "기타수입",
    description: "이자수입, 기타",
    incmSecCd: 1,
    keywords: ["이자", "기타"],
  },
];

/* ---- 유틸 함수 ---- */

interface CodeOption { cv_id: number; cv_name: string }

/** 카드 선택 → 계정/과목 자동 매칭 */
export function resolveCodeValues(
  type: WizardType,
  orgSecCd: number,
  getAccounts: (orgSecCd: number, incmSecCd: number) => CodeOption[],
  getItems: (orgSecCd: number, incmSecCd: number, accSecCd: number) => CodeOption[],
): { accSecCd: number; itemSecCd: number } {
  const accounts = getAccounts(orgSecCd, type.incmSecCd);
  let accSecCd = accounts[0]?.cv_id || 0;

  // 계정명 키워드 매칭
  if (type.accSecCdName) {
    const match = accounts.find((a) => a.cv_name.includes(type.accSecCdName!));
    if (match) accSecCd = match.cv_id;
  }

  // 과목 매칭
  const items = getItems(orgSecCd, type.incmSecCd, accSecCd);
  let itemSecCd = items[0]?.cv_id || 0;

  if (type.itemKeyword) {
    if (type.itemKeyword.includes("선거비용외")) {
      const match = items.find((i) => i.cv_name.includes("선거비용외"));
      if (match) itemSecCd = match.cv_id;
    } else if (type.itemKeyword.includes("선거비용")) {
      const match = items.find((i) => i.cv_name.includes("선거비용") && !i.cv_name.includes("선거비용외"));
      if (match) itemSecCd = match.cv_id;
    }
  }

  return { accSecCd, itemSecCd };
}

/** 키워드 검색으로 카드 필터링 */
export function searchWizardTypes(types: WizardType[], keyword: string): Set<string> {
  if (!keyword.trim()) return new Set(types.map((t) => t.id));
  const lower = keyword.toLowerCase();
  const matched = new Set<string>();
  for (const t of types) {
    if (
      t.label.toLowerCase().includes(lower) ||
      t.description.toLowerCase().includes(lower) ||
      t.keywords.some((k) => k.includes(lower))
    ) {
      matched.add(t.id);
    }
  }
  return matched;
}

/* ---- 지출유형 추론 (텍스트 키워드 → 지출유형 3단계 매핑) ---- */

import { ELECTION_EXP_TYPES, NON_ELECTION_EXP_TYPES } from "./expense-types";

export interface InferredExpenseType {
  wizardType: WizardType | null;
  expGroup1: string;
  expGroup2: string;
  expGroup3: string;
  confidence: number;           // 0.0 ~ 1.0
}

/** level2 라벨 → { group1, group2 } 인덱스 (한 번만 빌드) */
const LEVEL2_INDEX = new Map<string, { group1: string; group2: string }>();
for (const t1 of ELECTION_EXP_TYPES) {
  for (const t2 of t1.level2) {
    LEVEL2_INDEX.set(t2.label.toLowerCase(), { group1: t1.label, group2: t2.label });
  }
}
for (const t1 of NON_ELECTION_EXP_TYPES) {
  for (const t2 of t1.level2) {
    const key = t2.label.toLowerCase();
    if (!LEVEL2_INDEX.has(key)) {
      LEVEL2_INDEX.set(key, { group1: t1.label, group2: t2.label });
    }
  }
}

/** 텍스트 키워드에서 가장 적합한 WizardType + 지출유형 3단계를 추론 */
export function inferExpenseType(
  keywords: string[],
  types: WizardType[] = EXPENSE_WIZARD_TYPES,
): InferredExpenseType {
  const empty: InferredExpenseType = {
    wizardType: null, expGroup1: "", expGroup2: "", expGroup3: "", confidence: 0,
  };
  if (keywords.length === 0) return empty;

  // Step 1: level2 정확 매칭 (confidence 0.9)
  for (const kw of keywords) {
    const match = LEVEL2_INDEX.get(kw.toLowerCase());
    if (match) {
      const wt = types.find(
        (t) => t.expGroup1 === match.group1 || t.keywords.some((k) => k.includes(kw.toLowerCase()))
      ) || null;
      const level2Data = ELECTION_EXP_TYPES
        .find((t) => t.label === match.group1)
        ?.level2.find((t) => t.label === match.group2);
      return {
        wizardType: wt,
        expGroup1: match.group1,
        expGroup2: match.group2,
        expGroup3: level2Data?.level3[0] || "",
        confidence: 0.9,
      };
    }
  }

  // Step 2: WizardType keywords 매칭 (confidence 0.7)
  let bestType: WizardType | null = null;
  let bestScore = 0;
  for (const t of types) {
    if (t.route) continue; // 영수증첨부 카드 제외
    let score = 0;
    for (const kw of keywords) {
      if (t.keywords.some((tk) => tk.includes(kw.toLowerCase()))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestType = t;
    }
  }
  if (bestType && bestScore > 0) {
    const g1 = bestType.expGroup1 || "";
    const level2Data = g1
      ? ELECTION_EXP_TYPES.find((t) => t.label === g1)?.level2[0]
      : undefined;
    return {
      wizardType: bestType,
      expGroup1: g1,
      expGroup2: level2Data?.label || "",
      expGroup3: level2Data?.level3[0] || "",
      confidence: 0.7,
    };
  }

  // Step 3: 부분 문자열 매칭 (confidence 0.5)
  for (const kw of keywords) {
    for (const t of types) {
      if (t.route) continue;
      if (
        t.label.toLowerCase().includes(kw.toLowerCase()) ||
        t.description.toLowerCase().includes(kw.toLowerCase())
      ) {
        const g1 = t.expGroup1 || "";
        return {
          wizardType: t,
          expGroup1: g1,
          expGroup2: "",
          expGroup3: "",
          confidence: 0.5,
        };
      }
    }
  }

  // Step 4: 매칭 없음
  const otherType = types.find((t) => t.id === "other-expense") || null;
  return { ...empty, wizardType: otherType };
}
