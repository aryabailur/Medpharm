import { useRouter } from 'expo-router';
import DhanvantariInventoryScreen from '@/components/medtrack/DhanvantariInventoryScreen';

export default function InventoryRoute() {
  const router = useRouter();
  return <DhanvantariInventoryScreen onBack={() => router.back()} />;
}
