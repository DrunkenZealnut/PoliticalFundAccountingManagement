import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // HWPX 생성 라우트가 fs로 읽는 템플릿을 서버리스 번들에 포함 (Vercel)
  outputFileTracingIncludes: {
    "/api/hwpx/generate": ["./public/hwpx-templates/**"],
  },
};

export default nextConfig;
