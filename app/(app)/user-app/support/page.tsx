import { SupportInbox } from "@/components/support/SupportInbox";

export default async function CustomerSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ thread?: string }>;
}) {
  const { thread } = await searchParams;
  return <SupportInbox kind="customer" basePath="/user-app/support" selected={thread} />;
}
