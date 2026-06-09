import type { NextConfig } from "next";

// Derive the Supabase Storage image host from NEXT_PUBLIC_SUPABASE_URL so it
// follows the project per deployment. Falls back to teacher #1's host if the
// env var is missing or unparseable, so the build can never break on this.
function supabaseImageHost(): string {
  const fallback = "eesyjkmmyiisuaghhota.supabase.co";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return fallback;
  try {
    return new URL(url).hostname;
  } catch {
    return fallback;
  }
}

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: supabaseImageHost(),
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
