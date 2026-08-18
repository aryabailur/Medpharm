import { useRouter } from 'expo-router';
import DhanvantariAssistantScreen from '@/components/medtrack/DhanvantariAssistantScreen';

export default function AssistantRoute() {
  const router = useRouter();
  return <DhanvantariAssistantScreen onBack={() => router.back()} />;
}
