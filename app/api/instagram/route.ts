import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const GRAPH_VERSION = process.env.GRAPH_API_VERSION || "v21.0";

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: NextRequest) {
  let body: { imageUrl?: string; caption?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY", message: "요청 형식이 올바르지 않아요." }, { status: 400 });
  }

  const { imageUrl, caption } = body;
  if (!imageUrl) {
    return NextResponse.json({ error: "MISSING_IMAGE", message: "imageUrl이 필요해요." }, { status: 400 });
  }

  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igUserId = process.env.INSTAGRAM_BUSINESS_ID;

  if (!accessToken || !igUserId) {
    return NextResponse.json({
      mode: "preview",
      message:
        "INSTAGRAM_ACCESS_TOKEN / INSTAGRAM_BUSINESS_ID 환경변수가 설정되지 않아 미리보기만 가능해요. 실제 게시를 원하면 Meta for Developers에서 Instagram Graph API 연동을 먼저 완료해 주세요.",
    });
  }

  try {
    const base = `https://graph.facebook.com/${GRAPH_VERSION}/${igUserId}`;

    const createRes = await fetch(`${base}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: imageUrl,
        caption: caption || "",
        access_token: accessToken,
      }),
    });
    const createData = await createRes.json();
    if (!createRes.ok || !createData.id) {
      return NextResponse.json(
        {
          error: "MEDIA_CREATE_FAILED",
          message: "게시물 컨테이너 생성에 실패했어요.",
          detail: createData,
        },
        { status: 502 }
      );
    }
    const creationId = createData.id as string;

    // Poll container status until it's ready to publish (images are usually near-instant).
    let ready = false;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const statusRes = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${creationId}?fields=status_code&access_token=${accessToken}`
      );
      const statusData = await statusRes.json();
      if (statusData.status_code === "FINISHED") {
        ready = true;
        break;
      }
      if (statusData.status_code === "ERROR") {
        return NextResponse.json(
          { error: "MEDIA_PROCESSING_FAILED", message: "이미지 처리에 실패했어요.", detail: statusData },
          { status: 502 }
        );
      }
      await sleep(1500);
    }
    if (!ready) {
      return NextResponse.json(
        { error: "MEDIA_TIMEOUT", message: "이미지 처리 시간이 너무 오래 걸려요. 잠시 후 다시 시도해 주세요." },
        { status: 504 }
      );
    }

    const publishRes = await fetch(`${base}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
    });
    const publishData = await publishRes.json();
    if (!publishRes.ok || !publishData.id) {
      return NextResponse.json(
        { error: "PUBLISH_FAILED", message: "게시에 실패했어요.", detail: publishData },
        { status: 502 }
      );
    }

    let permalink: string | null = null;
    try {
      const permaRes = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${publishData.id}?fields=permalink&access_token=${accessToken}`
      );
      const permaData = await permaRes.json();
      permalink = permaData.permalink || null;
    } catch {
      permalink = null;
    }

    return NextResponse.json({ mode: "posted", permalink });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "REQUEST_FAILED", message: "게시 중 오류가 발생했어요.", detail: message },
      { status: 502 }
    );
  }
}
