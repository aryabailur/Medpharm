import { useRouter } from 'expo-router';
import VayuScanScreen from '@/components/medtrack/VayuScanScreen';

export default function ScanRoute() {
  const router = useRouter();
  return <VayuScanScreen onBack={() => router.back()} />;
}
