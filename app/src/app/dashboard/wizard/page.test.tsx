import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WizardPage from "./page";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/stores/auth", () => ({
  useAuth: () => ({ orgId: 1, orgSecCd: 4, orgType: "candidate" }),
}));

const mockGetName = vi.fn((id: number) => id === 10 ? "선거비용" : id === 20 ? "선거비용외" : "");
const mockGetAccounts = vi.fn(() => [
  { cv_id: 100, cv_name: "후보자등자산" },
]);
const mockGetItems = vi.fn(() => [
  { cv_id: 10, cv_name: "선거비용" },
  { cv_id: 20, cv_name: "선거비용외" },
]);

vi.mock("@/hooks/use-code-values", () => ({
  useCodeValues: () => ({
    loading: false,
    getName: mockGetName,
    getAccounts: mockGetAccounts,
    getItems: mockGetItems,
  }),
}));

vi.mock("@/components/code-select", () => ({
  CodeSelect: ({ label, value, onChange, options }: {
    label: string; value: number;
    onChange: (v: number) => void;
    options: { cv_id: number; cv_name: string }[];
  }) => (
    <select data-testid={`code-select-${label}`} value={value}
      onChange={(e) => onChange(Number(e.target.value))}>
      <option value={0}>{label}</option>
      {options.map((o) => <option key={o.cv_id} value={o.cv_id}>{o.cv_name}</option>)}
    </select>
  ),
}));

vi.mock("@/components/customer-search-dialog", () => ({
  CustomerSearchDialog: () => null,
}));

vi.mock("@/lib/expense-types", () => ({
  ELECTION_EXP_TYPES: [
    { label: "선거사무소", level2: [{ label: "기타", level3: [] }] },
    { label: "인쇄물", level2: [{ label: "명함", level3: ["인쇄비"] }] },
  ],
  NON_ELECTION_EXP_TYPES: [],
  getExpTypeData: () => [
    { label: "선거사무소", level2: [{ label: "기타", level3: [] }] },
    { label: "인쇄물", level2: [{ label: "명함", level3: ["인쇄비"] }] },
  ],
  detectItemCategory: (name: string) => name === "선거사무소" ? "선거비용외" : "선거비용",
  getReimbursementStatus: () => ({ status: "보전", reason: "테스트" }),
  PAY_METHODS: [
    { value: "118", label: "계좌입금" },
    { value: "583", label: "카드" },
  ],
}));

describe("WizardPage", () => {
  beforeEach(() => {
    mockPush.mockClear();
    localStorage.clear();
  });

  it("renders Step 1 with card grid", () => {
    render(<WizardPage />);
    expect(screen.getByText("간편등록 마법사")).toBeTruthy();
    expect(screen.getAllByText("사무소").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("인쇄물").length).toBeGreaterThanOrEqual(1);
  });

  it("shows first-visit guide when localStorage is empty", () => {
    render(<WizardPage />);
    const guides = screen.queryAllByText(/거래 종류를 선택하면/);
    expect(guides.length).toBeGreaterThanOrEqual(1);
  });

  it("hides guide after dismissal", () => {
    render(<WizardPage />);
    const closeBtns = screen.getAllByText("✕");
    fireEvent.click(closeBtns[0]);
    expect(localStorage.getItem("wizard-guide-dismissed")).toBe("true");
  });

  it("switches to income mode", () => {
    render(<WizardPage />);
    const incomeButtons = screen.getAllByText("수입");
    fireEvent.click(incomeButtons[0]);
    expect(screen.getAllByText("후원금").length).toBeGreaterThanOrEqual(1);
  });

  it("filters cards by keyword search", () => {
    render(<WizardPage />);
    const searchInputs = screen.getAllByPlaceholderText(/키워드로 검색/);
    fireEvent.change(searchInputs[0], { target: { value: "현수막" } });
    expect(screen.getAllByText("현수막/설치").length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty search message", () => {
    render(<WizardPage />);
    const searchInputs = screen.getAllByPlaceholderText(/키워드로 검색/);
    fireEvent.change(searchInputs[0], { target: { value: "존재하지않는키워드" } });
    expect(screen.getAllByText(/맞는 항목이 없습니다/).length).toBeGreaterThanOrEqual(1);
  });

  it("navigates to document-register on receipt card click", () => {
    render(<WizardPage />);
    const receiptCards = screen.getAllByText("영수증/계약서 첨부");
    fireEvent.click(receiptCards[0]);
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining("/dashboard/document-register"));
  });

  it("advances to Step 2 on regular card click", () => {
    render(<WizardPage />);
    const printCards = screen.getAllByText("인쇄물");
    fireEvent.click(printCards[0]);
    expect(screen.getByPlaceholderText("거래처명")).toBeTruthy();
    expect(screen.getByPlaceholderText("금액 입력")).toBeTruthy();
  });

  it("shows Step 1.5 when 기타 card is selected", () => {
    render(<WizardPage />);
    const otherCards = screen.getAllByText("기타");
    fireEvent.click(otherCards[0]);
    expect(screen.getByText("어떤 종류의 지출인지 선택해주세요")).toBeTruthy();
  });

  /* ---- Quick Register Tab Tests ---- */

  it("shows quick register tab", () => {
    render(<WizardPage />);
    expect(screen.getAllByText("빠른 등록").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("카드 선택").length).toBeGreaterThanOrEqual(1);
  });

  it("switches to quick register tab on click", () => {
    render(<WizardPage />);
    const quickTabs = screen.getAllByText("빠른 등록");
    fireEvent.click(quickTabs[0]);
    expect(screen.getByPlaceholderText(/현수막 제작/)).toBeTruthy();
  });

  it("shows analyze button disabled when text is empty", () => {
    render(<WizardPage />);
    const quickTabs = screen.getAllByText("빠른 등록");
    fireEvent.click(quickTabs[0]);
    const analyzeBtn = screen.getByText("자동 분석하기").closest("button");
    expect(analyzeBtn?.disabled).toBe(true);
  });

  it("enables analyze button when text is entered", () => {
    render(<WizardPage />);
    const quickTabs = screen.getAllByText("빠른 등록");
    fireEvent.click(quickTabs[0]);
    const textarea = screen.getByPlaceholderText(/현수막 제작/);
    fireEvent.change(textarea, { target: { value: "명함 인쇄 50만원" } });
    const analyzeBtn = screen.getByText("자동 분석하기").closest("button");
    expect(analyzeBtn?.disabled).toBe(false);
  });

  it("switches back to card tab preserving state", () => {
    render(<WizardPage />);
    const quickTabs = screen.getAllByText("빠른 등록");
    fireEvent.click(quickTabs[0]);
    const cardTabs = screen.getAllByText("카드 선택");
    fireEvent.click(cardTabs[0]);
    expect(screen.getAllByText("사무소").length).toBeGreaterThanOrEqual(1);
  });

  it("shows file attachment input in quick register", () => {
    render(<WizardPage />);
    const quickTabs = screen.getAllByText("빠른 등록");
    fireEvent.click(quickTabs[0]);
    expect(screen.getAllByText("첨부파일 (선택)").length).toBeGreaterThanOrEqual(1);
  });

  /* ---- Card Mode Tests ---- */

  it("disables 다음 button when form is incomplete", () => {
    render(<WizardPage />);
    const officeCards = screen.getAllByText("사무소");
    fireEvent.click(officeCards[0]);
    const nextBtns = screen.getAllByText("다음 →");
    expect(nextBtns[0].closest("button")?.disabled).toBe(true);
  });

  it("advances to Step 3 when form is valid", () => {
    render(<WizardPage />);
    const officeCards = screen.getAllByText("사무소");
    fireEvent.click(officeCards[0]);

    const amountInputs = screen.getAllByPlaceholderText("금액 입력");
    fireEvent.change(amountInputs[0], { target: { value: "100000" } });
    const contentInputs = screen.getAllByPlaceholderText(/지출 내역을 입력하세요/);
    fireEvent.change(contentInputs[0], { target: { value: "사무실 임대료" } });

    const nextBtns = screen.getAllByText("다음 →");
    fireEvent.click(nextBtns[0]);
    expect(screen.getByText("등록 내용을 확인하세요")).toBeTruthy();
  });
});
