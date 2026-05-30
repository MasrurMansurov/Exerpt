type DiscordFeedbackType = "positive" | "negative";

type DiscordFeedbackMetadata = Record<string, string | number | boolean | null | undefined>;

export function hasDiscordFeedbackWebhook() {
  return Boolean(process.env.EXERPT_DISCORD_WEBHOOK_URL);
}

export async function sendFeedbackToDiscord(
  type: DiscordFeedbackType,
  message: string,
  metadata: DiscordFeedbackMetadata = {}
) {
  const webhookUrl = process.env.EXERPT_DISCORD_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("Feedback channel is not configured.");
  }

  const color = type === "positive" ? 0x408a71 : 0xb0e4cc;
  const fields = Object.entries(metadata)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .slice(0, 12)
    .map(([name, value]) => ({
      name,
      value: String(value).slice(0, 1024),
      inline: true
    }));

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "Exerpt Feedback",
      embeds: [
        {
          title: type === "positive" ? "Positive feedback" : "Needs attention",
          description: message.slice(0, 4096),
          color,
          fields,
          timestamp: new Date().toISOString()
        }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Discord webhook failed with ${response.status}`);
  }

  return { sent: true };
}
