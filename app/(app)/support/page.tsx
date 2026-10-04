import { SupportInbox } from "@/components/support/SupportInbox";

export default async function SalonSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const { thread } = await searchParams;
  return <SupportInbox kind="salon" basePath="/support" selected={thread} />;
}
