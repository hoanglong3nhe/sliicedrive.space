import { next, waitUntil } from "@vercel/functions";
import { createClient } from "redis";

let redisClient;

async function getRedis() {
  if (!redisClient) {
    redisClient = createClient({
      url: process.env.REDIS_URL
    });

    redisClient.on("error", (err) => {
      console.error("Redis error:", err);
    });
  }

  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  return redisClient;
}

async function countLink(host, path) {
  try {
    const redis = await getRedis();

    // Ví dụ:
    // cdn.sliicedrive.space/DGZKoslp1.mp4
    const link = `${host}${path}`;

    await redis.zIncrBy("traffic:links", 1, link);
  } catch (error) {
    console.error("Counter error:", error);
  }
}

export const config = {
  runtime: "nodejs"
};

export default function middleware(request) {
  const url = new URL(request.url);

  const path = url.pathname;
  const host = request.headers.get("host") || url.host;

  // Trang chủ vẫn hoạt động bình thường
  if (path === "/") {
    return next();
  }

  // Chỉ đếm request GET tới link .mp4
  if (
    request.method === "GET" &&
    path.toLowerCase().endsWith(".mp4")
  ) {
    waitUntil(countLink(host, path));
  }

  // Giữ hành vi cũ:
  // mọi đường dẫn khác / sẽ chuyển về trang chủ
  return Response.redirect(new URL("/", request.url), 307);
}
