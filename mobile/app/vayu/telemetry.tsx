import { useRouter } from 'expo-router';
import VayuTelemetryScreen from '@/components/medtrack/VayuTelemetryScreen';

export default function TelemetryRoute() {
  const router = useRouter();
  return <VayuTelemetryScreen onBack={() => router.back()} />;
}
