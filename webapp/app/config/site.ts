export const siteUrl = (
  process.env.NEXT_PUBLIC_EXERPT_SITE_URL ?? "https://exerpt.dev"
).replace(/\/$/, "");

export const siteName = "Exerpt";
export const siteDescription = "Precision Context Engineering for LLMs.";
export const aboutDescription =
  "Exerpt sifts through your codebase to extract the architectural essence, fitting massive repos into tight token limits.";
