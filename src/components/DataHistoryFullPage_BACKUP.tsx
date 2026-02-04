import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, ArrowUpDown, ChevronLeft, ChevronRight, RefreshCw, Loader2, Download } from 'lucide-react';
import { NavigationMenu } from './NavigationMenu';
import { useMenu } from '../context/MenuContext';
import { subscribeToPredictions, getPrediction, savePrediction } from '../firebase';
import { predictSpecies } from '../services/api';

type DataHistoryRow = {
  batId: string;
  species: string;
  date: string;
  frequency: string;
};

interface LocationState {
  data: DataHistoryRow[];
  clientName: string;
  serverName: string;
  serverId: string;
  clientId: string;
}

export function DataHistoryFullPage() {
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

  const { data, clientName, serverName, serverId, clientId } = state;

  const [globalSearch, setGlobalSearch] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: keyof DataHistoryRow | null; direction: 'asc' | 'desc'; }>({ key: null, direction: 'asc' });
  const [speciesPredictions, setSpeciesPredictions] = useState<{[key: string]: {species: string, confidence: number}}>({});
  const [repredicting, setRepredicting] = useState<{[key: string]: boolean}>({});
  const [predictedAll, setPredictedAll] = useState(false);

  // Subscribe to Firebase predictions
  useEffect(() => {
    if (!serverId || !clientId) return;
    
    const unsubscribe = subscribeToPredictions(serverId, clientId, (predictions) => {
      const speciesMap: {[key: string]: {species: string, confidence: number}} = {};
      Object.entries(predictions).forEach(([batId, pred]: [string, any]) => {
        speciesMap[batId] = { species: pred.species, confidence: pred.confidence || 0 };
      });
      setSpeciesPredictions(speciesMap);
    });

    return unsubscribe;
  }, [serverId, clientId]);

  // Auto-predict ALL missing species once
  useEffect(() => {
    if (!serverId || !clientId || predictedAll || !data.length) return;

    const predictAll = async () => {
      const serverNum = serverName.replace('Server ', '');
      const clientNum = clientName.replace('Client ', '');

      console.log(`🚀 Starting prediction for all ${data.length} BATs...`);
      
      for (const row of data) {
        if (speciesPredictions[row.batId]) {
          console.log(`⏭️ Skipping BAT${row.batId} - already have: ${speciesPredictions[row.batId]}`);
          continue;
        }

        try {
          // First, check if spectrogram exists by fetching BAT files
          console.log(`🔍 Checking files for BAT${row.batId}...`);
          const filesResponse = await fetch(
            `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/bat/${row.batId}/files?server=${serverNum}&client=${clientNum}`
          );
          
          if (!filesResponse.ok) {
            await savePrediction(serverId, clientId, row.batId, 'No spectrogram', 0, row.date, row.frequency);
            console.log(`⚠️ BAT${row.batId}: No folder found`);
            continue;
          }
          
          const filesData = await filesResponse.json();
          
          // Check if spectrogram exists
          if (!filesData.files?.spectrogram || filesData.files.spectrogram.length === 0) {
            await savePrediction(serverId, clientId, row.batId, 'No spectrogram', 0, row.date, row.frequency);
            console.log(`⚠️ BAT${row.batId}: No spectrogram file`);
            continue;
          }

          // Spectrogram exists, call ML model
          console.log(`🤖 Predicting BAT${row.batId}...`);
          const result = await predictSpecies(row.batId, serverNum, clientNum);

          if (result.success && result.species) {
            await savePrediction(serverId, clientId, row.batId, result.species, result.confidence || 0, row.date, row.frequency);
            console.log(`✅ BAT${row.batId}: ${result.species}`);
          } else {
            await savePrediction(serverId, clientId, row.batId, 'No spectrogram', 0, row.date, row.frequency);
          }
        } catch (error) {
          console.error(`❌ Error predicting BAT${row.batId}:`, error);
          await savePrediction(serverId, clientId, row.batId, 'Error', 0, row.date, row.frequency);
        }

        await new Promise(resolve => setTimeout(resolve, 100)); // Reduced delay since we're skipping non-spectrograms faster
      }
      
      setPredictedAll(true);
      console.log('✅ All predictions complete!');
    };

    predictAll();
  }, [data, serverId, clientId, serverName, clientName, speciesPredictions, predictedAll]);

  // Re-predict handler
  const handleRePredict = async (batId: string) => {
    if (!serverId || !clientId || repredicting[batId]) return;

    setRepredicting(prev => ({ ...prev, [batId]: true }));

    try {
      const serverNum = serverName.replace('Server ', '');
      const clientNum = clientName.replace('Client ', '');

      // Find the row data for date and frequency
      const rowData = data.find(row => row.batId === batId);
      const date = rowData?.date || '';
      const frequency = rowData?.frequency || '45 kHz';

      console.log(`🔄 Re-predicting BAT${batId}...`);
      const result = await predictSpecies(batId, serverNum, clientNum);

      if (result.success && result.species) {
        await savePrediction(serverId, clientId, batId, result.species, result.confidence || 0, date, frequency);
        console.log(`✅ Re-predicted: ${result.species}`);
      } else {
        await savePrediction(serverId, clientId, batId, 'No spectrogram', 0, date, frequency);
      }
    } catch (error) {
      console.error(`Error re-predicting BAT${batId}:`, error);
      const rowData = data.find(row => row.batId === batId);
      await savePrediction(serverId, clientId, batId, 'Error', 0, rowData?.date, rowData?.frequency);
    } finally {
      setRepredicting(prev => ({ ...prev, [batId]: false }));
    }
  };

  const filteredData = data.filter((row) => {
    const q = globalSearch.toLowerCase();
    const displaySpecies = speciesPredictions[row.batId]?.species || row.species;
    return (
      row.batId.toLowerCase().includes(q) ||
      displaySpecies.toLowerCase().includes(q) ||
      row.date.toLowerCase().includes(q) ||
      row.frequency.toLowerCase().includes(q)
    );
  });

  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortConfig.key) return 0;
    if (sortConfig.key === 'frequency') {
      const aNum = parseFloat(String(a.frequency).replace(/[^\d.]/g, '')) || 0;
      const bNum = parseFloat(String(b.frequency).replace(/[^\d.]/g, '')) || 0;
      return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
    }
    const av = String(a[sortConfig.key]).toLowerCase();
    const bv = String(b[sortConfig.key]).toLowerCase();
    if (av < bv) return sortConfig.direction === 'asc' ? -1 : 1;
    if (av > bv) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const displayData = sortedData; // Show all data, no pagination

  const handleSort = (key: keyof DataHistoryRow) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const handleSearchChange = (value: string) => {
    setGlobalSearch(value);
  };

  const handleBatIdClick = (batId: string) => {
    // Extract server and client numbers from serverName and clientName
    const serverNum = serverName.replace('Server ', '');
    const clientNum = clientName.replace('Client ', '');
    
    console.log('BAT ID clicked:', {
      batId,
      serverName,
      clientName,
      serverNum,
      clientNum,
      navigatingTo: `/bat/${serverNum}/${clientNum}/${batId}`
    });
    
    // Navigate using React Router - component will re-mount due to key prop
    navigate(`/bat/${serverNum}/${clientNum}/${batId}`);
  };
  const handleBack = () => navigate('/');

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
              <h1 className="text-lg font-semibold text-white">Data History - Full View</h1>
              <p className="text-sm text-emerald-100">{serverName} - {clientName}</p>
            </div>
          </div>
          {/* Removed total records from header as requested */}
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
                  placeholder="Search BAT ID, Species, Date, or Frequency..."
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
                <col className="w-[15%]" />
                <col className="w-[30%]" />
                <col className="w-[15%]" />
                <col className="w-[20%]" />
                <col className="w-[20%]" />
              </colgroup>
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('batId')}>
                    <div className="flex items-center gap-2">BAT ID<ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('species')}>
                    <div className="flex items-center gap-2">Predicted Species<ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <div className="flex items-center gap-2">Confidence</div>
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('date')}>
                    <div className="flex items-center gap-2">Date<ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => handleSort('frequency')}>
                    <div className="flex items-center gap-2">Frequency<ArrowUpDown className="w-3 h-3" /></div>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {displayData.map((row, index) => {
                  const prediction = speciesPredictions[row.batId];
                  const displaySpecies = prediction?.species || 'Predicting...';
                  const displayConfidence = prediction?.confidence || 0;
                  const isRepredicting = repredicting[row.batId];
                  const hasPrediction = !!prediction;
                  
                  return (
                    <tr key={`${row.batId}-${index}`} className="hover:bg-emerald-50/40 transition-colors duration-200">
                      <td className="px-3 py-1 whitespace-nowrap text-xs font-medium text-blue-600 cursor-pointer hover:text-blue-800 hover:underline" onClick={() => handleBatIdClick(row.batId)}>BAT{row.batId}</td>
                      <td className="px-3 py-1 text-xs text-gray-700">
                        <div className="flex items-center gap-2">
                          {isRepredicting ? (
                            <><Loader2 className="w-3 h-3 animate-spin text-emerald-600" /><span className="italic text-xs">Re-predicting...</span></>
                          ) : displaySpecies === 'Predicting...' ? (
                            <><Loader2 className="w-3 h-3 animate-spin text-emerald-600" /><span className="italic text-xs">Predicting...</span></>
                          ) : (
                            <><span className="italic text-xs">{displaySpecies}</span>
                            {hasPrediction && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRePredict(row.batId); }}
                                className="ml-2 p-0.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                                title="Re-predict species"
                              >
                                <RefreshCw className="w-3 h-3" />
                              </button>
                            )}</>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1 whitespace-nowrap text-xs text-gray-700">
                        {hasPrediction && displayConfidence > 0 ? `${displayConfidence.toFixed(1)}%` : '-'}
                      </td>
                      <td className="px-3 py-1 whitespace-nowrap text-xs text-gray-700">{row.date}</td>
                      <td className="px-3 py-1 whitespace-nowrap text-xs text-gray-700">{row.frequency}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Export Button */}
          <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end">
            <button
              onClick={() => {
                // Create CSV content with proper escaping
                const headers = ['BAT ID', 'Predicted Species', 'Confidence', 'Date', 'Frequency'];
                const csvRows = [headers.join(',')];
                
                displayData.forEach(row => {
                  const prediction = speciesPredictions[row.batId];
                  const species = (prediction?.species || 'Predicting...').replace(/"/g, '""');
                  const confidence = prediction?.confidence > 0 ? prediction.confidence.toFixed(1) : '';
                  const csvRow = [
                    `BAT${row.batId}`,
                    `"${species}"`,
                    confidence,
                    row.date,
                    row.frequency
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
                link.setAttribute('download', `data_history_${serverName.replace(/\s+/g, '_')}_${clientName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
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
}