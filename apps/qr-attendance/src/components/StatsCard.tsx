import { ReactNode } from 'react';

interface StatsCardProps {
  icon: ReactNode;
  label: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  iconBg?: string;
}

export function StatsCard({ icon, label, value, change, changeType = 'neutral', iconBg = 'bg-indigo-500/20' }: StatsCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-400 text-sm font-medium">{label}</p>
          <p className="text-white text-2xl font-bold mt-1">{value}</p>
          {change && (
            <p className={`text-xs mt-1 ${
              changeType === 'positive' ? 'text-green-400' :
              changeType === 'negative' ? 'text-red-400' :
              'text-gray-500'
            }`}>
              {change}
            </p>
          )}
        </div>
        <div className={`${iconBg} p-3 rounded-lg flex-shrink-0`}>
          <div className="text-white w-5 h-5">{icon}</div>
        </div>
      </div>
    </div>
  );
}
