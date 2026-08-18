import { useRouter } from 'expo-router';
import DhanvantariComplaintsScreen from '@/components/medtrack/DhanvantariComplaintsScreen';

export default function ComplaintsRoute() {
  const router = useRouter();
  return <DhanvantariComplaintsScreen onBack={() => router.back()} />;
}
