import { NextResponse } from "next/server";
import { sendFeedbackToDiscord } from "../../lib/discord";

type FeedbackBody = {
  type?: "positive" | "negative";
  message?: string;
  metadata?: Record<string, string | number | boolean | null | undefined>;
};

export async function POST(request: Request) {
  let body: FeedbackBody;
  try {
    body = (await request.json()) as FeedbackBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.type !== "positive" && body.type !== "negative") {
    return NextResponse.json({ error: "Invalid feedback type" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Feedback message is required" }, { status: 400 });
  }

  try {
    const result = await sendFeedbackToDiscord(body.type, message, body.metadata ?? {});
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send feedback" },
      { status: 502 }
    );
  }
}
