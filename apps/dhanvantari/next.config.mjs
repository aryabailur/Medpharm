/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages are shipped as TypeScript source, not built output.
  transpilePackages: ['@medtrack/contracts', '@medtrack/crypto', '@medtrack/ui'],
};

export default nextConfig;
