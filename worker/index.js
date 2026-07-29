import {
  handleImageOptimization,
  DEFAULT_DEVICE_SIZES,
  DEFAULT_IMAGE_SIZES,
} from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

const worker = {
  async fetch(request, env, context) {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      if (!env.ASSETS || !env.IMAGES) {
        const imageSource = url.searchParams.get("url");

        if (!imageSource || !imageSource.startsWith("/")) {
          return new Response("Invalid image source", { status: 400 });
        }

        return Response.redirect(new URL(imageSource, request.url), 307);
      }

      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];

      return handleImageOptimization(
        request,
        {
          fetchAsset: (path) =>
            env.ASSETS.fetch(new Request(new URL(path, request.url))),
          transformImage: async (body, { width, format, quality }) => {
            const transformations = width > 0 ? { width } : {};
            const result = await env.IMAGES.input(body)
              .transform(transformations)
              .output({ format, quality });

            return result.response();
          },
        },
        allowedWidths,
      );
    }

    return handler.fetch(request, env, context);
  },
};

export default worker;
