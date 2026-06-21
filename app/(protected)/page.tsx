import { QrGenerator } from "@/src/components/qr-generator";
import { requireUser } from "@/src/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requireUser();

  return <QrGenerator />;
}
