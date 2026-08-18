import { useLocalSearchParams } from 'expo-router';
import RoleDashboard from '@/components/medtrack/RoleDashboard';
import { Role } from '@/components/medtrack/roleConfig';

export default function RoleDashboardRoute() {
  const { role } = useLocalSearchParams<{ role: Role }>();
  return <RoleDashboard role={role} />;
}
