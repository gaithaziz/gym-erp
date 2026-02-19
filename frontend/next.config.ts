import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  onDemandEntries: {
    // period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 60 * 1000,
    // number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 5,
  },
  reactStrictMode: false,
};

export default nextConfig;
