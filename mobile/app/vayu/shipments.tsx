import { useRouter } from 'expo-router';
import VayuShipmentsScreen from '@/components/medtrack/VayuShipmentsScreen';

export default function ShipmentsRoute() {
  const router = useRouter();
  return <VayuShipmentsScreen onBack={() => router.back()} />;
}
