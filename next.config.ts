import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Server Actions receive report filter payloads; keep the default small
    // limit but allow a little headroom for large section configs.
    serverActions: { bodySizeLimit: '2mb' },
  },
  // @react-pdf/renderer and pdf-lib are server-only and must not be bundled
  // into the client or the edge runtime.
  serverExternalPackages: ['@react-pdf/renderer', 'pdf-lib'],
}

export default nextConfig
