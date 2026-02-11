import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, ChevronRight, ChevronDown, RefreshCw } from 'lucide-react';
import { NavigationMenu } from './NavigationMenu';
import { useMenu } from '../context/MenuContext';
import { 
  loadStandaloneFolderAudioWithPredictions, 
  predictStandaloneSingleAudio, 
  StandaloneFolderAudioEntry,
  extractStandaloneNum
} from '../services/standalonePredictions';
import { subscribeToStandalonePredictions } from '../firebase';

interface FolderData {
  id: string;
  name: string;
  timestamp?: string;
  date: string;
  time: string;
  fileCount?: number;
  totalSize?: string;
}

interface LocationState {
  standaloneId: string;
  standaloneName: string;
  folders: FolderData[];
}

export const DataHistoryStandaloneMaximizePage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isExpanded } = useMenu();
  const state = location.state as LocationState | undefined;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (!state?.folders) {
      navigate('/');
    }
  }, [state, navigate]);

  if (!state?.folders) return null;

  const { standaloneId, standaloneName, folders } = state;
  
  // Debug: Log all folder IDs on mount
  useEffect(() => {
    console.log('🔍 DataHistoryStandaloneMaximizePage - All folders:', folders.map((f, idx) => ({ id: f.id, name: f.name, idx })));
  }, [folders]);

  // Subscribe to Firebase predictions for real-time sync across views
  useEffect(() => {
    console.log('🔔 [DataHistoryStandaloneMaximizePage] Setting up Firebase prediction listener...');
    const unsubscribe = subscribeToStandalonePredictions(standaloneId, (predictions: any) => {
      console.log('🔔 [DataHistoryStandaloneMaximizePage] Received Firebase prediction update');
      
      // Update any loaded folder's audio files with new predictions
      setFolderAudioFiles(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(folderId => {
          // Find the folder to get its timestamp
          const folder = folders.find(f => f.id === folderId);
          if (!folder) return;
          
          const timestamp = folder.name.toLowerCase().split('_').slice(1).join('_');
          const folderPredictions = predictions[timestamp];
          if (!folderPredictions) return;
          
          updated[folderId] = updated[folderId].map(audio => {
            const batMatch = audio.file_name.match(/bat[_]?(\d+)/i);
            const batNum = batMatch ? batMatch[1] : audio.file_name.replace('.wav', '');
            const filePredictions = folderPredictions[batNum];
            
            if (filePredictions) {
              const predsArray = Object.keys(filePredictions)
                .filter(key => !isNaN(parseInt(key)))
                .sort((a, b) => parseInt(a) - parseInt(b))
                .map(key => ({
                  species: filePredictions[key].s,
                  confidence: filePredictions[key].c
                }));
              return {
                ...audio,
                species: predsArray,
                predicted_species: predsArray[0]?.species || 'Unknown',
                confidence: predsArray[0]?.confidence || 0,
                from_cache: true,
                needs_prediction: false
              };
            }
            return audio;
          });
        });
        return updated;
      });
    });

    return () => {
      console.log('🔕 [DataHistoryStandaloneMaximizePage] Cleaning up Firebase listener');
      unsubscribe();
    };
  }, [standaloneId, folders]);

  // Cancel ongoing predictions when component unmounts (navigating away)
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        console.log(`🚫 [DataHistoryStandaloneMaximizePage] Component unmounting - cancelling all predictions`);
        abortControllerRef.current.abort();
      }
    };
  }, []);
  
  // State for expandable folders
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);
  const [loadingFolderAudio, setLoadingFolderAudio] = useState<string | null>(null);
  const [folderAudioFiles, setFolderAudioFiles] = useState<{[key: string]: StandaloneFolderAudioEntry[]}>({});

  // AbortController for cancelling ongoing predictions when component unmounts
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleBack = () => navigate('/');

  // Function to load audio files for a folder (shared service)
  const loadFolderAudioFiles = async (folderId: string, folderName: string, forceRepredict = false) => {
    // Check if already loaded in state
    if (!forceRepredict && folderAudioFiles[folderId] && folderAudioFiles[folderId].length > 0) {
      const isProcessing = folderAudioFiles[folderId].some(f => f.processing);
      const needsPrediction = folderAudioFiles[folderId].some(f => f.needs_prediction && !f.processing);
      
      if (isProcessing) {
        console.log(`⏸️ [DataHistoryStandaloneMaximizePage] Folder ${folderName} is being processed, skipping reload`);
        return;
      }
      
      if (!needsPrediction) {
        console.log(`✅ [DataHistoryStandaloneMaximizePage] All files predicted for ${folderName}, using cache`);
        return;
      }
    }

    try {
      console.log(`📂 [DataHistoryStandaloneMaximizePage] Loading folder: ${folderName}`);
      
      const { timestamp, entries, standaloneNum } = await loadStandaloneFolderAudioWithPredictions({
        standaloneId,
        folderName
      });

      setFolderAudioFiles(prev => ({
        ...prev,
        [folderId]: entries
      }));

      const cachedCount = entries.filter(e => e.from_cache).length;
      const waitingCount = entries.filter(e => e.needs_prediction).length;
      console.log(`✅ [DataHistoryStandaloneMaximizePage] Loaded ${entries.length} files: ${cachedCount} cached, ${waitingCount} need prediction`);

      const filesToPredict = entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.needs_prediction);

      if (filesToPredict.length > 0) {
        console.log(`🔬 [DataHistoryStandaloneMaximizePage] Starting SEQUENTIAL predictions for ${filesToPredict.length} files`);

        // Create new AbortController for this prediction batch
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        // Process predictions ONE BY ONE (sequentially)
        (async () => {
          for (const { entry, index } of filesToPredict) {
            if (signal.aborted) {
              console.log(`🚫 [DataHistoryStandaloneMaximizePage] Predictions cancelled - stopping at ${entry.file_name}`);
              break;
            }
            
            try {
              console.log(`🔬 [DataHistoryStandaloneMaximizePage] Predicting ${index + 1}/${filesToPredict.length}: ${entry.file_name}`);
              
              setFolderAudioFiles(prev => {
                const updated = [...(prev[folderId] || [])];
                if (updated[index]) {
                  updated[index] = {
                    ...updated[index],
                    processing: true,
                    predicted_species: 'Processing...'
                  };
                }
                return { ...prev, [folderId]: updated };
              });

              const updatedEntry = await predictStandaloneSingleAudio({
                standaloneId,
                standaloneNum,
                timestamp,
                audio: entry,
                signal
              });

              setFolderAudioFiles(prev => {
                const updated = [...(prev[folderId] || [])];
                if (updated[index]) {
                  updated[index] = updatedEntry;
                }
                return { ...prev, [folderId]: updated };
              });
              
              console.log(`✅ [DataHistoryStandaloneMaximizePage] Completed ${index + 1}/${filesToPredict.length}: ${entry.file_name}`);
            } catch (err) {
              if (err instanceof Error && err.name === 'AbortError') {
                console.log(`🚫 [DataHistoryStandaloneMaximizePage] Prediction cancelled for ${entry.file_name}`);
                break;
              }
              
              console.error('[DataHistoryStandaloneMaximizePage] Prediction error:', err);
              
              setFolderAudioFiles(prev => {
                const updated = [...(prev[folderId] || [])];
                if (updated[index]) {
                  updated[index] = {
                    ...updated[index],
                    processing: false,
                    predicted_species: 'Error',
                    error: err instanceof Error ? err.message : 'Unknown error'
                  };
                }
                return { ...prev, [folderId]: updated };
              });
            }
          }
          console.log(`🎉 [DataHistoryStandaloneMaximizePage] All predictions completed for ${folderName}`);
        })();
      }
    } catch (error) {
      console.error(`❌ Error loading folder:`, error);
      setFolderAudioFiles(prev => ({
        ...prev,
        [folderId]: []
      }));
    }
  };

  // Toggle folder expansion
  const toggleFolderExpansion = async (folder: FolderData) => {
    console.log('🔍 Toggle clicked:', {
      clickedId: folder.id,
      clickedName: folder.name,
      currentExpandedId: expandedFolderId,
      willExpand: expandedFolderId !== folder.id
    });
    
    if (expandedFolderId === folder.id) {
      setExpandedFolderId(null);
      console.log('✅ Collapsed folder');
    } else {
      setExpandedFolderId(folder.id);
      console.log('✅ Expanded folder:', folder.id);
      
      if (!folderAudioFiles[folder.id] || folderAudioFiles[folder.id].length === 0) {
        setLoadingFolderAudio(folder.id);
        try {
          await loadFolderAudioFiles(folder.id, folder.name);
        } finally {
          setLoadingFolderAudio(null);
        }
      }
    }
  };

  // Re-predict single file
  const repredictSingleFile = async (folder: FolderData, audioIdx: number, audio: StandaloneFolderAudioEntry) => {
    const timestamp = folder.name.toLowerCase().split('_').slice(1).join('_');
    const standaloneNum = extractStandaloneNum(standaloneId);

    setFolderAudioFiles(prev => {
      const updated = [...(prev[folder.id] || [])];
      if (updated[audioIdx]) {
        updated[audioIdx] = {
          ...updated[audioIdx],
          processing: true,
          predicted_species: 'Processing...'
        };
      }
      return { ...prev, [folder.id]: updated };
    });

    try {
      const updatedEntry = await predictStandaloneSingleAudio({
        standaloneId,
        standaloneNum,
        timestamp,
        audio
      });

      setFolderAudioFiles(prev => {
        const updated = [...(prev[folder.id] || [])];
        if (updated[audioIdx]) {
          updated[audioIdx] = updatedEntry;
        }
        return { ...prev, [folder.id]: updated };
      });
    } catch (error) {
      console.error('Error re-predicting:', error);
      setFolderAudioFiles(prev => {
        const updated = [...(prev[folder.id] || [])];
        if (updated[audioIdx]) {
          updated[audioIdx] = {
            ...updated[audioIdx],
            predicted_species: 'Error',
            processing: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
        return { ...prev, [folder.id]: updated };
      });
    }
  };

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
              <p className="text-sm text-emerald-100">{standaloneName}</p>
            </div>
          </div>
        </div>
      </div>

      <div className={`max-w-7xl mx-auto px-4 py-8 transition-all duration-300 ${isExpanded ? 'ml-64' : 'ml-16'}`}>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-lg hover:border-emerald-300 transition-all duration-300 overflow-hidden">
          
          {/* Data History Table */}
          <div className="overflow-x-auto p-4">
            {folders.length === 0 ? (
              <div className="text-center py-4 text-xs text-gray-500">
                No standalone recording folders found
              </div>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-700 w-8"></th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-700">Folder Name</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-700">Date</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-700">Time</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-700">Files</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-700">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {folders.map((folder, index) => (
                    <React.Fragment key={folder.id || `folder-${index}`}>
                      {/* Folder Row */}
                      <tr className="hover:bg-emerald-50 transition-colors">
                        {/* Expand/Collapse Button */}
                        <td className="border border-slate-300 px-1 py-1.5 text-center">
                          <button
                            onClick={() => toggleFolderExpansion(folder)}
                            className="p-0.5 hover:bg-slate-200 rounded transition-colors"
                          >
                            {loadingFolderAudio === folder.id ? (
                              <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                            ) : expandedFolderId === folder.id ? (
                              <ChevronDown className="w-3 h-3 text-slate-600" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-slate-600" />
                            )}
                          </button>
                        </td>
                        {/* Folder Name - Clickable to navigate */}
                        <td 
                          className="border border-slate-300 px-2 py-1.5 text-blue-600 font-semibold hover:underline cursor-pointer"
                          onClick={() => navigate(`/standalone/${standaloneId}/folder/${encodeURIComponent(folder.name)}`, {
                            state: { folderName: folder.name, folderId: folder.id }
                          })}
                        >
                          {folder.name}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-slate-700">
                          {folder.date || '-'}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-slate-700">
                          {folder.time || '-'}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-slate-700 text-center">
                          {folder.fileCount || 0}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-slate-700">
                          {folder.totalSize || '0 B'}
                        </td>
                      </tr>
                      
                      {/* Expanded Audio Files */}
                      {expandedFolderId === folder.id && (
                        <tr>
                          <td colSpan={6} className="border border-slate-300 p-0 bg-slate-50">
                            {loadingFolderAudio === folder.id ? (
                              <div className="text-center py-4 text-xs text-gray-500">
                                <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                                Loading bat calls...
                              </div>
                            ) : folderAudioFiles[folder.id]?.length > 0 ? (
                              <div className="p-2">
                                <table className="w-full text-xs border-collapse">
                                  <thead>
                                    <tr className="bg-emerald-100">
                                      <th className="border border-emerald-200 px-2 py-1 text-left font-semibold text-emerald-800">Audio File</th>
                                      <th className="border border-emerald-200 px-2 py-1 text-left font-semibold text-emerald-800">Top 5 Species</th>
                                      <th className="border border-emerald-200 px-2 py-1 text-center font-semibold text-emerald-800 w-16">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {folderAudioFiles[folder.id].map((audio: StandaloneFolderAudioEntry, audioIdx: number) => (
                                      <tr key={audioIdx} className="hover:bg-emerald-50">
                                        <td className="border border-emerald-200 px-2 py-1 text-slate-700">
                                          {audio.file_name}
                                          {audio.from_cache && (
                                            <span className="ml-1 text-[9px] text-gray-500">(cached)</span>
                                          )}
                                        </td>
                                        <td className="border border-emerald-200 px-2 py-1">
                                          <div className="flex flex-wrap gap-1">
                                            {audio.processing ? (
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-800">
                                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                                {audio.predicted_species || 'Processing...'}
                                              </span>
                                            ) : audio.species && audio.species.length > 0 ? (
                                              <>
                                                {audio.species.slice(0, 5).map((sp, spIdx) => (
                                                  <span 
                                                    key={spIdx}
                                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                      spIdx === 0 ? 'bg-emerald-100 text-emerald-800' :
                                                      spIdx === 1 ? 'bg-blue-100 text-blue-800' :
                                                      spIdx === 2 ? 'bg-violet-100 text-violet-800' :
                                                      spIdx === 3 ? 'bg-orange-100 text-orange-800' :
                                                      'bg-pink-100 text-pink-800'
                                                    }`}
                                                  >
                                                    {sp.species} ({sp.confidence}%)
                                                  </span>
                                                ))}
                                                {audio.species.length > 5 && (
                                                  <span className="inline-flex items-center justify-center w-5 h-5 bg-gray-200 text-gray-700 rounded-full text-[10px] font-bold">
                                                    +{audio.species.length - 5}
                                                  </span>
                                                )}
                                              </>
                                            ) : audio.predicted_species === 'Error' ? (
                                              <span className="text-red-500 italic text-[10px]" title={audio.error}>
                                                Processing failed {audio.error && '(hover for error)'}
                                              </span>
                                            ) : audio.predicted_species === 'Processing' ? (
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800">
                                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                                Processing...
                                              </span>
                                            ) : audio.predicted_species === 'Waiting' ? (
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-700">
                                                Waiting...
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                                                Waiting...
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="border border-purple-200 px-1 py-1 text-center">
                                          {!audio.processing && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                repredictSingleFile(folder, audioIdx, audio);
                                              }}
                                              className="p-1 text-purple-600 hover:text-purple-800 rounded-full hover:bg-purple-50 transition-colors"
                                              title="Re-predict species"
                                            >
                                              <RefreshCw className="w-3 h-3" />
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="text-center py-3 text-xs text-gray-500">
                                No audio files found in this folder
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
