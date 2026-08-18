import { useRouter } from 'expo-router';
import DhanvantariIncomingScreen from '@/components/medtrack/DhanvantariIncomingScreen';

export default function IncomingRoute() {
  const router = useRouter();
  return (
    <DhanvantariIncomingScreen
      onBack={() => router.back()}
      onNavigateScanIn={() => router.push('/dhanvantari/scanin')}
    />
  );
}
