import { next, waitUntil } from "@vercel/functions";
import { createClient } from "redis";

let redisClient: ReturnType<typeof createClient> | undefined;

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

// Ngày hiện tại theo giờ Việt Nam
function getVietnamDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values: Record<string, string> = {};

  for (const part of parts) {
    values[part.type] = part.value;
  }

  return `${values.year}-${values.month}-${values.day}`;
}

async function countLink(host: string, path: string) {
  try {
    const redis = await getRedis();

    // Ví dụ:
    // cdn.sliicedrive.space/DGZKoslp1.mp4
    const link = `${host}${path}`;

    // Ví dụ:
    // traffic:daily:2026-08-09
    const today = getVietnamDate();
    const dailyKey = `traffic:daily:${today}`;

    await redis
      .multi()

      // 1. Tổng lượt từ trước tới nay
      .zIncrBy("traffic:links", 1, link)

      // 2. Lượt riêng của hôm nay
      .zIncrBy(dailyKey, 1, link)

      // 3. Tự xóa thống kê ngày này sau 7 ngày
      .expire(dailyKey, 60 * 60 * 24 * 7, "NX")

      .exec();

  } catch (error) {
    console.error("Counter error:", error);
  }
}

export const config = {
  runtime: "nodejs"
};

export default function middleware(request: Request) {
  const url = new URL(request.url);

  const path = url.pathname;
  const host = request.headers.get("host") || url.host;

  // Trang chủ không đếm
  if (path === "/") {
    return next();
  }

  // Chỉ đếm URL .mp4
  if (
    request.method === "GET" &&
    path.toLowerCase().endsWith(".mp4")
  ) {
    waitUntil(countLink(host, path));
  }

  // Giữ cách hoạt động hiện tại:
  // URL khác "/" sẽ chuyển về trang chủ
  return Response.redirect(new URL("/", request.url), 307);
}
