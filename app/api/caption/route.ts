import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "NOT_CONFIGURED",
        message: "서버에 ANTHROPIC_API_KEY 환경변수가 설정되어 있지 않아요.",
      },
      { status: 501 }
    );
  }

  let body: { title?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY", message: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  const title = (body.title || "").slice(0, 300);
  const description = (body.description || "").slice(0, 600);
  if (!title) {
    return NextResponse.json({ error: "MISSING_TITLE", message: "title이 필요해요." }, { status: 400 });
  }

  const prompt = `너는 한국 인스타그램 계정 운영자야. 아래 뉴스 기사를 인스타그램 게시물 캡션으로 바꿔줘.
조건: 2~3문장, 존댓말, 이모지 2~4개 자연스럽게 섞기, 마지막 줄에 관련 해시태그 6~8개.
캡션 텍스트만 출력하고 다른 설명은 붙이지 마.

기사 제목: ${title}
기사 요약: ${description || "(요약 없음)"}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
        max_tokens: 500,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: "ANTHROPIC_ERROR", message: "캡션 생성 API 호출에 실패했어요.", detail: errText },
        { status: 502 }
      );
    }

    const data = await res.json();
    const caption = (data.content || [])
      .filter((block: { type: string }) => block.type === "text")
      .map((block: { text: string }) => block.text)
      .join("\n")
      .trim();

    if (!caption) {
      return NextResponse.json(
        { error: "EMPTY_RESPONSE", message: "캡션을 생성하지 못했어요." },
        { status: 502 }
      );
    }

    return NextResponse.json({ caption });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "REQUEST_FAILED", message: "캡션 생성 중 오류가 발생했어요.", detail: message },
      { status: 502 }
    );
  }
}
