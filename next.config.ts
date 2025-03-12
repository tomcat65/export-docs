import type { NextConfig } from "next";

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
  // Explicitly tell Next.js to handle specific static routes
  // This can help with the "Static route" warning
  async rewrites() {
    return [
      // Handle react-country-flag routes
      {
        source: '/static/:path*',
        destination: '/:path*',
      },
    ];
  },
};

export default nextConfig;
