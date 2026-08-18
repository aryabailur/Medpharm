import { useRouter } from 'expo-router';
import DhanvantariScanInScreen from '@/components/medtrack/DhanvantariScanInScreen';

export default function ScanInRoute() {
  const router = useRouter();
  return <DhanvantariScanInScreen onBack={() => router.back()} />;
}
