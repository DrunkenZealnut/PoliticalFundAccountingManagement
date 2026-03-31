export interface FaqItem {
  q: string;
  a: string;
}

export interface FaqSubsection {
  label: string;
  items: FaqItem[];
}

export interface FaqChapter {
  label: string;
  shortLabel: string;
  subsections?: FaqSubsection[];
  items?: FaqItem[];
}

export function getChapterItemCount(ch: FaqChapter): number {
  if (ch.items) return ch.items.length;
  if (ch.subsections) {
    return ch.subsections.reduce((sum, sub) => sum + sub.items.length, 0);
  }
  return 0;
}

export const FAQ_DATA: FaqChapter[] = [
  {
    label: "정치자금 수입 관련",
    shortLabel: "수입",
    items: [
      {
        q: "익명 후원금의 한도는 얼마인가요?",
        a: "1회 10만원을 초과할 수 없으며, 연간 총액이 후원회 연간 모금한도액의 100분의 20을 초과할 수 없습니다.",
      },
      {
        q: "기명 후원금 공개 기준은?",
        a: "연간 300만원(대통령후보자등 후원회는 500만원)을 초과하여 후원한 경우 후원인의 인적사항이 공개됩니다.",
      },
      {
        q: "후원금 연간 한도는?",
        a: "1인당 동일 후원회에 연간 500만원까지 후원 가능하며, 모든 후원회 합산 연간 2,000만원(대통령후보자등 후원회 포함 시 3,000만원)을 초과할 수 없습니다.",
      },
    ],
  },
  {
    label: "정치자금 지출 관련",
    shortLabel: "지출",
    items: [
      {
        q: "선거비용 지출 시 유의사항은?",
        a: "모든 지출은 회계책임자 명의의 예금계좌에서 이체하거나 카드로 결제해야 합니다. 1건당 50만원 이상은 반드시 수표·카드·계좌이체로 지출해야 합니다.",
      },
      {
        q: "영수증 첨부 기준은?",
        a: "모든 지출에 대해 영수증 등 증빙서류를 첨부해야 합니다. 다만, 우편료·전기료 등 관행적으로 영수증이 발급되지 않는 경우 그 사유를 기재합니다.",
      },
    ],
  },
  {
    label: "회계보고 관련",
    shortLabel: "회계보고",
    items: [
      {
        q: "회계보고서 제출 기한은?",
        a: "선거일 후 30일 이내에 관할 선거관리위원회에 제출해야 합니다.",
      },
      {
        q: "회계보고서에 첨부할 서류는?",
        a: "재산명세서, 과목별 수입·지출부, 예금통장 사본, 증빙서류 사본, 감사의견서 또는 심사의결서 등을 첨부해야 합니다.",
      },
    ],
  },
];
