import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 한글 경로에서 Turbopack 버그 회피를 위해 webpack 사용
  // https://github.com/vercel/next.js/issues - Korean path causes byte boundary panic
};

export default nextConfig;
