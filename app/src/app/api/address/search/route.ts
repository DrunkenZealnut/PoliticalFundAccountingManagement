import { NextRequest, NextResponse } from "next/server";
import { XMLParser } from "fast-xml-parser";

const EPOST_URL =
  "http://openapi.epost.go.kr/postal/retrieveNewAdressAreaCdService/retrieveNewAdressAreaCdService/getNewAddressListAreaCd";

export async function GET(request: NextRequest) {
  const keyword = request.nextUrl.searchParams.get("keyword");
  const currentPage = request.nextUrl.searchParams.get("currentPage") || "1";
  const countPerPage = request.nextUrl.searchParams.get("countPerPage") || "10";

  if (!keyword || keyword.length < 2) {
    return NextResponse.json(
      { error: "검색어를 2자 이상 입력하세요" },
      { status: 400 }
    );
  }

  const apiKey = process.env.EPOST_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "우편번호 API가 설정되지 않았습니다" },
      { status: 500 }
    );
  }

  const url =
    `${EPOST_URL}?serviceKey=${apiKey}` +
    `&searchSe=road` +
    `&srchwrd=${encodeURIComponent(keyword)}` +
    `&countPerPage=${countPerPage}` +
    `&currentPage=${currentPage}`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const xml = await response.text();

    const parser = new XMLParser({ numberParseOptions: { leadingZeros: false, hex: false } });
    const json = parser.parse(xml);

    const body = json?.NewAddressListResponse;
    const header = body?.cmmMsgHeader;

    if (header?.successYN === "N") {
      return NextResponse.json({
        totalCount: 0,
        currentPage: Number(currentPage),
        addresses: [],
        message: header?.errMsg || "검색 결과가 없습니다",
      });
    }

    const totalCount = header?.totalCount || 0;
    const items = body?.newAddressListAreaCd;
    const list = !items ? [] : Array.isArray(items) ? items : [items];

    return NextResponse.json({
      totalCount,
      currentPage: Number(currentPage),
      addresses: list.map((item: Record<string, string>) => ({
        zipNo: item.zipNo,
        lnmAdres: item.lnmAdres,
        rnAdres: item.rnAdres,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: `우편번호 검색 실패: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 500 }
    );
  }
}
