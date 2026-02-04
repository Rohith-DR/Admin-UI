import React, { useState } from 'react';
import { X, ChevronUp, ChevronDown } from 'lucide-react';

interface AddServerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (serverNumber: number, location?: { lat: number; long: number; name: string }) => void;
  existingServers: string[];
}

export const AddServerModal: React.FC<AddServerModalProps> = ({
  isOpen,
  onClose,
  onAdd,
  existingServers
}) => {
  const [serverNumber, setServerNumber] = useState(1);
  const [locationName, setLocationName] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');

  if (!isOpen) return null;

  // Find available server numbers
  const getAvailableNumbers = () => {
    const numbers = [];
    for (let i = 1; i <= 10; i++) {
      if (!existingServers.includes(`Server ${i}`)) {
        numbers.push(i);
      }
    }
    return numbers;
  };

  const availableNumbers = getAvailableNumbers();
  
  // Ensure we have a valid server number
  const validServerNumber = availableNumbers.includes(serverNumber) ? serverNumber : availableNumbers[0] || 1;

  const incrementCounter = () => {
    const currentIdx = availableNumbers.indexOf(validServerNumber);
    if (currentIdx < availableNumbers.length - 1) {
      setServerNumber(availableNumbers[currentIdx + 1]);
    }
  };

  const decrementCounter = () => {
    const currentIdx = availableNumbers.indexOf(validServerNumber);
    if (currentIdx > 0) {
      setServerNumber(availableNumbers[currentIdx - 1]);
    }
  };

  const handleAdd = () => {
    const lat = parseFloat(latitude);
    const long = parseFloat(longitude);
    
    if (locationName && !isNaN(lat) && !isNaN(long)) {
      onAdd(validServerNumber, { lat, long, name: locationName });
    } else {
      onAdd(validServerNumber);
    }
    onClose();
    
    // Reset form
    setLocationName('');
    setLatitude('');
    setLongitude('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden border border-emerald-100">
        <div className="bg-gradient-to-r from-emerald-700 via-teal-600 to-emerald-700 px-4 py-3 text-white">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-semibold">Add New Server</h3>
              <p className="text-emerald-100 text-xs">Select Server Number</p>
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
            <label className="text-xs font-medium text-gray-700">Server Number</label>
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center justify-center bg-gray-50 border border-gray-200 rounded-lg px-4 py-2">
                <span className="font-semibold text-gray-900">Server {validServerNumber}</span>
              </div>
              <div className="flex flex-col">
                <button
                  onClick={incrementCounter}
                  disabled={!availableNumbers.length || availableNumbers.indexOf(validServerNumber) >= availableNumbers.length - 1}
                  className="p-1 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={decrementCounter}
                  disabled={!availableNumbers.length || availableNumbers.indexOf(validServerNumber) <= 0}
                  className="p-1 text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-gray-700">Location Name (Optional)</label>
            <input
              type="text"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="e.g., Main Office"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">Latitude (Optional)</label>
              <input
                type="number"
                step="any"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="e.g., 49.2827"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">Longitude (Optional)</label>
              <input
                type="number"
                step="any"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="e.g., -123.1207"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              ℹ️ You can edit location later using the edit button next to the location display
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={onClose}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              className="flex-1 px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium shadow-sm"
            >
              Add Server
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
