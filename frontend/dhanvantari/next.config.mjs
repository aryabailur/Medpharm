/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages are shipped as TypeScript source, not built output.
  transpilePackages: ['@medtrack/contracts', '@medtrack/ui'],

  // Opt-in build directory override.
  //
  // A `next build` that shares .next/ with a running `next dev` overwrites the
  // chunks the dev server is serving, and every route then throws
  // "Cannot find module './673.js'" until it's restarted. Set NEXT_DIST_DIR to
  // send a verification build somewhere else:
  //
  //   NEXT_DIST_DIR=.next-build npx next build
  //
  // Left unset in normal use, so deploys and `next start` behave exactly as
  // they did before. Keying this off NODE_ENV instead would apply it to every
  // build, and Next rewrites next-env.d.ts + tsconfig.json to point at
  // whatever distDir is set to — not something the committed config should
  // track.
  //
  // Caveat: because Next rewrites those two files, `git checkout --
  // next-env.d.ts tsconfig.json` after an isolated build. Nothing else in the
  // tree is affected.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
