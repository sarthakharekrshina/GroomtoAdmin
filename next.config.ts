import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Service picture uploads go through a Server Action (default cap 1MB).
      // The `service-images` bucket itself rejects anything over 5MB.
      bodySizeLimit: "6mb",
    },
  },
};

export default nextConfig;
