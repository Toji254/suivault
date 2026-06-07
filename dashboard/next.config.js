import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.fallback = { fs: false, path: false };
    config.resolve.modules.push(path.resolve(process.cwd(), "node_modules"));
    return config;
  },
};

export default nextConfig;
