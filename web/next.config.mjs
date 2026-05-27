/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  // 透传到 FastAPI 后端：让 dev 期直连不写 CORS。
  // 生产环境建议在反向代理层做 /api/* -> backend 转发。
  async rewrites() {
    const backend = process.env.NEXT_PUBLIC_AIFORGE_API ?? 'http://127.0.0.1:8765';
    return [
      { source: '/api/:path*', destination: `${backend}/:path*` },
    ];
  },
};

export default nextConfig;
