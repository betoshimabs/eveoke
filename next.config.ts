/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for SharedArrayBuffer used by WASM SIMD (Transformers.js / ONNX)
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ]
  },

  // Allow loading images from HuggingFace
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'huggingface.co' },
    ],
  },

  // Exclude WASM-heavy packages from server bundling.
  // These are browser-only and must never be processed by Node.js/SSR.
  serverExternalPackages: [
    '@huggingface/transformers',
    'onnxruntime-web',
    'onnxruntime-node',
  ],
}

export default nextConfig
