import { useRouter } from 'expo-router';
import VayuOrdersScreen from '@/components/medtrack/VayuOrdersScreen';

export default function OrdersRoute() {
  const router = useRouter();
  return <VayuOrdersScreen onBack={() => router.back()} />;
}
