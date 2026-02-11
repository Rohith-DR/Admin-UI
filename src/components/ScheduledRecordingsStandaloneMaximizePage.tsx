import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, ArrowUpDown, Download } from 'lucide-react';
import { NavigationMenu } from './NavigationMenu';
import { useMenu } from '../context/MenuContext';

interface ScheduledRecording {
  scheduleKey: string;
  date: string;
  time: string;
  duration: number;
  status: string;
}

type SortKey = keyof ScheduledRecording;

interface LocationState {
  data: ScheduledRecording[];
  standaloneName: string;
  standaloneId: string;
}

export const ScheduledRecordingsStandaloneMaximizePage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isExpanded } = useMenu();
  const state = location.state as LocationState | undefined;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!state?.data) {
      navigate('/');
    }
  }, [state, navigate]);

  if (!state?.data) return null;

  const { data, standaloneName } = state;
  
  const [globalSearch, setGlobalSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: SortKey | null; direction: 'asc' | 'desc' }>({ 
    key: null, 
    direction: 'asc' 
  });

  const handleBack = () => navigate('/');

  const handleSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const handleSearchChange = (value: string) => {
    setGlobalSearch(value);
  };

  const filteredData = data.filter((row: ScheduledRecording) => {
    const q = globalSearch.toLowerCase();
    return (
      row.scheduleKey.toLowerCase().includes(q) ||
      row.date.toLowerCase().includes(q) ||
      row.time.toLowerCase().includes(q) ||
      row.duration.toString().includes(q) ||
      row.status.toLowerCase().includes(q)
    );
  });

  const sortedData = [...filteredData].sort((a: ScheduledRecording, b: ScheduledRecording) => {
    if (!sortConfig.key) return 0;

    const aVal = a[sortConfig.key];
    const bVal = b[sortConfig.key];

    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortConfig.direction === 'asc' 
        ? aVal.localeCompare(bVal) 
        : bVal.localeCompare(aVal);
    }

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    }

    return 0;
  });

  const displayData = sortedData;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/80 to-blue-50/30 relative">
      <NavigationMenu />

      <div className={`bg-gradient-to-r from-emerald-700 via-teal-600 to-emerald-700 shadow-lg transition-all duration-300 ${isExpanded ? 'ml-64' : 'ml-16'}`}>
        <div className="max-w-7xl mx-auto px-4 py-4 border-b border-emerald-600/20 h-16 flex items-center">
          <div className="flex items-center gap-4">
            <button onClick={handleBack} className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors">
              <ArrowLeft className="w-6 h-6 text-white" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white">Scheduled Recordings - Full View</h1>
              <p className="text-sm text-emerald-100">{standaloneName}</p>
            </div>
          </div>
          <div className="ml-auto"></div>
        </div>
      </div>

      <div className={`max-w-7xl mx-auto px-4 py-8 transition-all duration-300 ${isExpanded ? 'ml-64' : 'ml-16'}`}>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-lg hover:border-emerald-300 transition-all duration-300 overflow-hidden">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Search Schedule ID, Date, Time, Status..."
                  value={globalSearch}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 pl-9"
                />
                <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              </div>
              <div className="text-sm text-gray-600 whitespace-nowrap">{sortedData.length} of {data.length} records</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full table-fixed divide-y divide-gray-200">
              <colgroup>
                <col className="w-[30%]" />
                <col className="w-[25%]" />
                <col className="w-[20%]" />
                <col className="w-[15%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('scheduleKey')}>
                    <div className="flex items-center gap-2">Schedule ID<ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('date')}>
                    <div className="flex items-center gap-2">Date<ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('time')}>
                    <div className="flex items-center gap-2">Time<ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('duration')}>
                    <div className="flex items-center gap-2">Duration<ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('status')}>
                    <div className="flex items-center gap-2">Status<ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {displayData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-sm text-gray-500">
                      No scheduled recordings found
                    </td>
                  </tr>
                ) : (
                  displayData.map((row: ScheduledRecording, index: number) => (
                    <tr key={`${row.scheduleKey}-${index}`} className="hover:bg-emerald-50/40 transition-colors duration-200">
                      <td className="px-3 py-1 whitespace-nowrap text-xs font-medium text-blue-600">{row.scheduleKey}</td>
                      <td className="px-3 py-1 whitespace-nowrap text-xs text-gray-700">{row.date}</td>
                      <td className="px-3 py-1 whitespace-nowrap text-xs text-gray-700">{row.time}</td>
                      <td className="px-3 py-1 whitespace-nowrap text-xs text-gray-700">{row.duration}min</td>
                      <td className="px-3 py-1 whitespace-nowrap text-xs">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          row.status === 'scheduled' ? 'bg-yellow-100 text-yellow-700' :
                          row.status === 'recording' ? 'bg-blue-100 text-blue-700' :
                          row.status === 'ready_to_upload' ? 'bg-green-100 text-green-700' :
                          row.status === 'uploading' ? 'bg-orange-100 text-orange-700' :
                          row.status === 'completed' ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Export Button */}
          <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end">
            <button
              onClick={() => {
                // Create CSV content with proper escaping
                const headers = ['Schedule ID', 'Date', 'Time', 'Duration (min)', 'Status'];
                const csvRows = [headers.join(',')];
                
                displayData.forEach(row => {
                  const scheduleKey = row.scheduleKey.replace(/"/g, '""');
                  const csvRow = [
                    `"${scheduleKey}"`,
                    row.date,
                    row.time,
                    row.duration,
                    row.status
                  ];
                  csvRows.push(csvRow.join(','));
                });
                
                // Add UTF-8 BOM for Excel compatibility
                const BOM = '\uFEFF';
                const csvContent = BOM + csvRows.join('\n');
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                const url = URL.createObjectURL(blob);
                link.setAttribute('href', url);
                link.setAttribute('download', `scheduled_recordings_${standaloneName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Export to Excel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
