import { GET as versionedLive } from "@/app/api/v1/health/live/route";

export const dynamic = "force-dynamic";

export async function GET() {
  return versionedLive();
}
