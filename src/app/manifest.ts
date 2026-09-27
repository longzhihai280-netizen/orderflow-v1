import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "OrderFlow Wholesale Workflow",
    short_name: "OrderFlow",
    description: "Secure wholesale order workflow management",
    start_url: "/orders",
    display: "standalone",
    background_color: "#f3f5f9",
    theme_color: "#17233f",
    lang: "en"
  };
}
