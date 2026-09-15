import GuestApp from '@/components/guest/GuestApp';

export const dynamic = 'force-dynamic';

export default async function TablePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <GuestApp token={token} />;
}
