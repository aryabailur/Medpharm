import { useRouter } from 'expo-router';
import DhanvantariPosScreen from '@/components/medtrack/DhanvantariPosScreen';

export default function PosRoute() {
  const router = useRouter();
  return <DhanvantariPosScreen onBack={() => router.back()} />;
}
