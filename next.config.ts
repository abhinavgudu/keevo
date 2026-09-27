import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hides the floating dev-tools badge (the "N" in the corner). Compile and
  // runtime errors are still surfaced, they just stop overlaying the UI.
  devIndicators: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "**" },
    ],
  },
  experimental: {
    // optimize server actions & package imports
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
};

export default nextConfig;
