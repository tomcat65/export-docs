/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable ESLint during build
  eslint: {
    // Warning rather than error
    ignoreDuringBuilds: true,
  },
  // Add any other Next.js config options here
  webpack(config) {
    // Allow SVG imports
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    });

    return config;
  },
}

export default nextConfig; 