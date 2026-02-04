import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Clock, Calendar, Save } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: { timing: string; date: string }) => void;
  serverName: string;
  clientName: string;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSave,
  serverName,
  clientName
}) => {
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [recordDate, setRecordDate] = useState(() => {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    return today;
  });

  if (!isOpen) return null;

  const formatTimeWithAMPM = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour12 = parseInt(hours) % 12 || 12;
    const ampm = parseInt(hours) >= 12 ? 'PM' : 'AM';
    return `${hour12}:${minutes} ${ampm}`;
  };

  const handleSave = () => {
    const startFormatted = formatTimeWithAMPM(startTime);
    const endFormatted = formatTimeWithAMPM(endTime);
    const timing = `${startFormatted} - ${endFormatted}`;
    onSave({ timing, date: recordDate });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden border border-emerald-100">
        <div className="bg-gradient-to-r from-emerald-700 via-teal-600 to-emerald-700 px-4 py-3 text-white">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-semibold">Recording Settings</h3>
              <p className="text-emerald-100 text-xs">{serverName} → {clientName}</p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-lg p-1.5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
              <Calendar className="w-4 h-4 text-emerald-600" />
              Recording Date
            </label>
            <input
              type="date"
              value={recordDate}
              onChange={(e) => setRecordDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors text-sm"
            />
          </div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
              <Clock className="w-4 h-4 text-emerald-600" />
              Recording Time Range
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">End Time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-colors text-sm"
                />
              </div>
            </div>
            <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
              Preview: {formatTimeWithAMPM(startTime)} - {formatTimeWithAMPM(endTime)}
            </div>
          </div>

          {/* Frequency field removed as requested */}
        </div>

        <div className="bg-gray-50 px-4 py-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-gray-600 hover:bg-gray-200 rounded-lg transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center gap-1.5 text-sm"
          >
            <Save className="w-4 h-4" />
            Save Settings
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};