import React from 'react';
import { CheckCircle, AlertCircle, Clock, Upload } from 'lucide-react';

interface StatusIndicatorProps {
  status: 'idle' | 'active' | 'completed' | 'error' | 'transmitting';
  label: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, label }) => {
  const getIcon = () => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-emerald-600" />;
      case 'active':
        return <Clock className="w-4 h-4 text-amber-600 animate-pulse" />;
      case 'transmitting':
        return <Upload className="w-4 h-4 text-blue-600 animate-bounce" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400 animate-pulse" />;
    }
  };

  const getBgColor = () => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-100 border-emerald-300 shadow-sm ring-1 ring-emerald-200';
      case 'active':
        return 'bg-amber-100 border-amber-300 shadow-sm ring-1 ring-amber-200';
      case 'transmitting':
        return 'bg-blue-100 border-blue-300 shadow-sm ring-1 ring-blue-200';
      case 'error':
        return 'bg-red-100 border-red-300 shadow-sm ring-1 ring-red-200';
      default:
        return 'bg-gray-100 border-gray-300 ring-1 ring-gray-200';
    }
  };

  const getTextColor = () => {
    switch (status) {
      case 'completed':
        return 'text-emerald-800';
      case 'active':
        return 'text-amber-800';
      case 'transmitting':
        return 'text-blue-800';
      case 'error':
        return 'text-red-800';
      default:
        return 'text-gray-700';
    }
  };

  return (
    <div className={`flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-lg border ${getBgColor()} transition-all duration-300 hover:scale-102`}>
      <div className="flex items-center justify-center">
        {getIcon()}
      </div>
      <span className={`text-xs font-medium ${getTextColor()} text-center leading-tight max-w-full truncate`}>{label}</span>
    </div>
  );
};