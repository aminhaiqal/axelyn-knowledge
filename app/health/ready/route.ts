import { GET as versionedReady } from "@/app/api/v1/health/ready/route";

export const dynamic = "force-dynamic";

export async function GET() {
  return versionedReady();
}
