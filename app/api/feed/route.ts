import { NextRequest, NextResponse } from "next/server";
import { fetchAndParseFeed } from "@/lib/rss";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "MISSING_URL", message: "url 쿼리 파라미터가 필요해요." }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return NextResponse.json({ error: "INVALID_URL", message: "올바른 URL 형식이 아니에요." }, { status: 400 });
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return NextResponse.json({ error: "INVALID_URL", message: "http/https 주소만 지원해요." }, { status: 400 });
  }

  try {
    const result = await fetchAndParseFeed(url);
    if (result.items.length === 0) {
      return NextResponse.json(
        { error: "EMPTY_FEED", message: "피드에서 기사를 찾지 못했어요." },
        { status: 422 }
      );
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "s-maxage=180, stale-while-revalidate=300" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout = /timeout|aborted/i.test(message);
    return NextResponse.json(
      {
        error: isTimeout ? "TIMEOUT" : "FETCH_FAILED",
        message: isTimeout
          ? "피드 응답이 너무 느려서 시간 초과됐어요."
          : "피드를 가져오지 못했어요. 주소가 올바른 RSS/Atom 피드인지 확인해 주세요.",
        detail: message,
      },
      { status: 502 }
    );
  }
}
