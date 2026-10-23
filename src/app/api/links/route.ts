import { linksErrorResponse, linksJsonResponse, loadLinks, requireLinksAccess } from "@/lib/links/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const access = await requireLinksAccess();
  if (!access.ok) return access.response;

  try {
    return linksJsonResponse(await loadLinks());
  } catch (error) {
    return linksErrorResponse(error, "Unable to read Links.");
  }
}
