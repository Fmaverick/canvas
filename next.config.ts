import type { NextConfig } from "next";

type ImageRemotePattern = {
  protocol?: "http" | "https";
  hostname: string;
  port?: string;
  pathname?: string;
  search?: string;
};

function createRemotePattern(rawUrl: string | undefined): ImageRemotePattern | null {
  if (!rawUrl) {
    return null;
  }

  try {
    const url = new URL(rawUrl);
    const pathname = url.pathname.replace(/\/+$/g, "");

    return {
      protocol: url.protocol === "https:" ? "https" : "http",
      hostname: url.hostname,
      port: url.port,
      pathname: pathname ? `${pathname}/**` : "/**",
    };
  } catch {
    return null;
  }
}

const sealosStoragePattern: ImageRemotePattern = {
  protocol: "https",
  hostname: "objectstorageapi.bja.sealos.run",
  port: "",
  pathname: "/**",
};

const remotePatterns: ImageRemotePattern[] = [
  createRemotePattern(process.env.STORAGE_PUBLIC_URL),
  createRemotePattern(process.env.STORAGE_ENDPOINT),
  sealosStoragePattern,
].filter((pattern): pattern is ImageRemotePattern => Boolean(pattern));

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns,
  },
};

export default nextConfig;
