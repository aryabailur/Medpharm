import { useRouter } from 'expo-router';
import VayuBatchesScreen from '@/components/medtrack/VayuBatchesScreen';

export default function BatchesRoute() {
  const router = useRouter();
  return <VayuBatchesScreen onBack={() => router.back()} />;
}
