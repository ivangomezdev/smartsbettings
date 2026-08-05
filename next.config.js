const isDevelopment = process.env.NODE_ENV === "development";

const nextConfig = {
  images: {
    unoptimized: isDevelopment,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.public.blob.vercel-storage.com",
      },
    ],
  },
  poweredByHeader: false,
};

export default nextConfig;
