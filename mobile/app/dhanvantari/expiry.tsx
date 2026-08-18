import { useRouter } from 'expo-router';
import DhanvantariExpiryScreen from '@/components/medtrack/DhanvantariExpiryScreen';

export default function ExpiryRoute() {
  const router = useRouter();
  return <DhanvantariExpiryScreen onBack={() => router.back()} />;
}
