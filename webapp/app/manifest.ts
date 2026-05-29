import type { MetadataRoute } from "next";
import { siteDescription, siteName } from "./config/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Exerpt Workspace",
    short_name: siteName,
    description: siteDescription,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#091413",
    theme_color: "#285a48",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable"
      }
    ]
  };
}
