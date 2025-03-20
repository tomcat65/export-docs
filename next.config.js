/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable ESLint during build
  eslint: {
    // Warning rather than error
    ignoreDuringBuilds: true,
  },
  // Tell TypeScript to ignore type errors too
  typescript: {
    // Warning rather than error
    ignoreBuildErrors: true,
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
  // Content Security Policy removed as we're not using iframes anymore
}

export default nextConfig; 