export type Role = 'vayu' | 'dhanvantari';

export type RoleConfig = {
  id: Role;
  title: string;
  subtitle: string;
  accent: string;
  accentSoft: string;
  accentDeep: string;
  description: string;
  stats: Array<{ label: string; value: string; detail: string }>;
};

export type QueueItem = {
  id: string;
  title: string;
  meta: string;
  value: string;
  status: string;
  color: string;
};

export const roleConfig: Record<Role, RoleConfig> = {
  vayu: {
    id: 'vayu',
    title: 'Vayu',
    subtitle: 'Manufacturer / Supplier',
    accent: '#1F6FEB',
    accentSoft: '#EAF2FF',
    accentDeep: '#0E4AA8',
    description: 'Catalog, batch QC, dispatch and shipment intelligence for supplier operations.',
    stats: [
      { label: 'Pending approval', value: '28', detail: 'oldest 5h' },
      { label: 'Shipments in flight', value: '14', detail: '3 on-time risk' },
      { label: 'Open complaints', value: '06', detail: '2 escalated' },
    ],
  },
  dhanvantari: {
    id: 'dhanvantari',
    title: 'Dhanvantari',
    subtitle: 'Institution / Hospital',
    accent: '#D97706',
    accentSoft: '#FFF4E5',
    accentDeep: '#A35B00',
    description: 'Inventory, dispensing, expiry monitoring, and receipt workflows for institution stores.',
    stats: [
      { label: 'Inventory value', value: '₹18.2L', detail: '415 SKUs' },
      { label: 'Expiring soon', value: '42', detail: '7 critical' },
      { label: 'Open complaints', value: '04', detail: '2 pending' },
    ],
  },
};

export const quickActions: Record<Role, Array<{ label: string; route: string }>> = {
  vayu: [
    { label: 'Orders', route: 'orders' },
    { label: 'Batches', route: 'batches' },
    { label: 'Shipments', route: 'shipments' },
    { label: 'Telemetry', route: 'telemetry' },
    { label: 'Scan', route: 'scan' },
  ],
  dhanvantari: [
    { label: 'Inventory', route: 'inventory' },
    { label: 'Incoming', route: 'incoming' },
    { label: 'Scan-in', route: 'scanin' },
    { label: 'Expiry', route: 'expiry' },
    { label: 'Dispensing', route: 'pos' },
    { label: 'Complaints', route: 'complaints' },
    { label: 'Nidana', route: 'assistant' },
  ],
};

export const statusItems: Record<Role, QueueItem[]> = {
  vayu: [
    { id: 'V-204', title: 'Jaipur Institute', meta: '12 SKUs • 4h queued', value: '₹2.8L', status: 'Pending', color: '#EAB308' },
    { id: 'V-198', title: 'Bhopal Referral', meta: '9 SKUs • 2h queued', value: '₹1.9L', status: 'Approved', color: '#22C55E' },
    { id: 'V-153', title: 'Nagpur Supply', meta: '5 SKUs • temperature alert', value: '₹1.1L', status: 'Review', color: '#F97316' },
  ],
  dhanvantari: [
    { id: 'D-902', title: 'Syringe packs', meta: 'Immediate reorder', value: '12 left', status: 'Critical', color: '#EF4444' },
    { id: 'D-860', title: 'Paracetamol 500', meta: '12 days to expiry', value: '84 packs', status: 'Expiry', color: '#F59E0B' },
    { id: 'D-772', title: 'IV Fluids', meta: 'Received this morning', value: '67 packs', status: 'In stock', color: '#22C55E' },
  ],
};

export const activityFeed: Record<Role, string[]> = {
  vayu: [
    'Batch L-408 approved for dispatch',
    'Cold-chain alert cleared for Truck 11',
    'New complaint logged from Jaipur depot',
  ],
  dhanvantari: [
    'Receipt batch F-204 scanned at intake',
    'Three stock-out risks flagged in ICU',
    'Expiry review scheduled for 17 packs',
  ],
};
