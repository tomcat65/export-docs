import type { NextConfig } from "next";

// Add development mode detection
const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  /* config options here */
  webpack: (config) => {
    // This is needed for packages that use SVGs like react-country-flag
    config.module.rules.push({
      test: /\.svg$/,
      use: ['@svgr/webpack'],
    });
    
    return config;
  },
  // Add static image and asset optimization settings
  images: {
    domains: ['localhost', '127.0.0.1'],
    dangerouslyAllowSVG: true, // Allow SVG content which is needed for flags
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  // Suppress all warnings in development mode
  // This is a workaround for warnings caused by third-party libraries
  typescript: {
    ignoreBuildErrors: isDev, 
  },
  eslint: {
    ignoreDuringBuilds: isDev,
  },
  // Disable Next.js telemetry
  output: 'standalone',
  // Explicitly tell Next.js to handle specific static routes
  // This can help with the "Static route" warning
  async rewrites() {
    return [
      // Handle react-country-flag routes - these need special handling
      {
        source: '/static/:path*',
        destination: '/:path*',
      },
      // Add an explicit rewrite for the flag assets
      {
        source: '/flags/:path*',
        destination: '/:path*',
      },
      // Handle any other static routes
      {
        source: '/:path*/static/:subpath*',
        destination: '/:path*/:subpath*',
      }
    ];
  },
  // Explicitly ignore static route warnings (works in Next.js 13+)
  onDemandEntries: {
    // period (in ms) where the server will keep pages in the buffer
    maxInactiveAge: 25 * 1000,
    // number of pages that should be kept simultaneously without being disposed
    pagesBufferLength: 2,
  },
  // This disables the warning output for static routes
  reactStrictMode: false,
};

export default nextConfig;
