const isDevelopment = process.env.NODE_ENV === "development";

const nextConfig = {
  images: {
    unoptimized: isDevelopment,
  },
  poweredByHeader: false,
};

export default nextConfig;
