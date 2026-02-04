import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, ChevronDown, ChevronUp, Loader2, FileAudio, Maximize2 } from 'lucide-react';
import { NavigationMenu } from './NavigationMenu';
import { useMenu } from '../context/MenuContext';
import { BatchAudioResult } from '../services/api';
import { getFolderPredictions, subscribeToPredictions } from '../firebase';

interface FolderRow {
  folder_id: string;
  name: string;
  timestamp: string;
  date: string;
  time: string;
}

interface LocationState {
  clientName: string;
  serverName: string;
  serverId: string;
  clientId: string;
}

interface ExpandedFolder {
  [folderId: string]: {
    isExpanded: boolean;
    isLoading: boolean;
    audioFiles?: BatchAudioResult[];
  };
}

export function DataHistoryFullPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isExpanded } = useMenu();
  const state = location.state as LocationState | undefined;

  console.log('🚀 DataHistoryFullPage loaded');
  console.log('📍 Location state:', state);
  console.log('📍 Full location:', location);

  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalSearch, setGlobalSearch] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<ExpandedFolder>({});

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    console.log('🔄 useEffect triggered, state:', state);
    if (!state) {
      console.warn('⚠️ No state found, redirecting to home');
      navigate('/');
      return;
    }
    
    console.log('✅ State exists, loading folders...');
    loadFolders();
    
    // Set up Firebase listener for real-time prediction updates
    if (state.serverId && state.clientId) {
      const serverNum = state.serverName.replace('Server ', '');
      const clientNum = state.clientName.replace('Client ', '');
      
      console.log('🔔 Setting up Firebase prediction listener...');
      const unsubscribe = subscribeToPredictions(
        `server${serverNum}`,
        `client${clientNum}`,
        (predictions) => {
          console.log('🔔 Received Firebase prediction update:', Object.keys(predictions).length, 'predictions');
          
          // Update expanded folders with new predictions
          setExpandedFolders(prev => {
            const updated = { ...prev };
            Object.keys(updated).forEach(folderId => {
              if (updated[folderId].audioFiles) {
                updated[folderId] = {
                  ...updated[folderId],
                  audioFiles: updated[folderId].audioFiles?.map(audio => {
                    const pred = predictions[audio.file_name];
                    if (pred) {
                      return {
                        ...audio,
                        top_species: pred.allSpecies || [],
                        species_count: pred.allSpecies?.length || 0,
                        predicted_species: pred.species,
                        confidence: pred.confidence,
                        from_cache: true
                      };
                    }
                    return audio;
                  })
                };
              }
            });
            return updated;
          });
        }
      );
      
      return () => {
        console.log('🔕 Cleaning up Firebase listener');
        unsubscribe();
      };
    }
  }, [state, navigate]);

  const loadFolders = async () => {
    if (!state) return;
    
    try {
      setLoading(true);
      const serverNum = state.serverName.replace('Server ', '');
      const clientNum = state.clientName.replace('Client ', '');
      
      const apiUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/folders/${serverNum}/${clientNum}`;
      console.log('🔍 Fetching folders from:', apiUrl);
      console.log('📋 Request params:', { serverNum, clientNum, serverName: state.serverName, clientName: state.clientName });
      
      const response = await fetch(apiUrl);
      
      console.log('📡 Response status:', response.status, response.ok);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error:', errorText);
        throw new Error('Failed to fetch folders');
      }
      
      const data = await response.json();
      console.log('📦 Received data:', data);
      
      if (data.success) {
        console.log('✅ Setting folders:', data.folders?.length || 0, 'folders');
        setFolders(data.folders || []);
      } else {
        console.warn('⚠️ API returned success=false');
      }
    } catch (error) {
      console.error('Error loading folders:', error);
      setFolders([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleFolder = async (folderId: string) => {
    const folder = folders.find(f => f.folder_id === folderId);
    if (!folder) return;

    const currentState = expandedFolders[folderId];

    // If already expanded, just collapse
    if (currentState?.isExpanded) {
      setExpandedFolders(prev => ({
        ...prev,
        [folderId]: { ...prev[folderId], isExpanded: false }
      }));
      return;
    }

    // If already loaded, just expand
    if (currentState?.audioFiles) {
      setExpandedFolders(prev => ({
        ...prev,
        [folderId]: { ...prev[folderId], isExpanded: true }
      }));
      return;
    }

    // Load audio files - show loading state immediately with expanded view
    setExpandedFolders(prev => ({
      ...prev,
      [folderId]: { isExpanded: true, isLoading: true }
    }));

    try {
      const serverNum = state!.serverName.replace('Server ', '');
      const clientNum = state!.clientName.replace('Client ', '');
      
      // Step 1: Load existing predictions from Firebase FIRST using just timestamp
      console.log(`🔍 Loading predictions from Firebase for ${folder.timestamp}...`);
      const existingPredictions = await getFolderPredictions(`server${serverNum}`, `client${clientNum}`, folder.timestamp);
      const cacheCount = Object.keys(existingPredictions).length;
      console.log(`✅ Found ${cacheCount} cached predictions in Firebase`);
      
      // Step 2: Get file list from backend (FAST - no ML processing)
      const apiUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/folder/files`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_num: serverNum,
          client_num: clientNum,
          folder_timestamp: folder.timestamp
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to list files: ${response.status}`);
      }
      
      const fileListResult = await response.json();
      
      if (fileListResult.success && fileListResult.files && fileListResult.files.length > 0) {
        // Merge Firebase predictions with file list
        // Mark files as: cached (has prediction), Processing (first in queue), Waiting (rest)
        let processingStarted = false;
        
        const mergedResults = fileListResult.files.map((file: any) => {
          const cached = existingPredictions[file.file_name];
          if (cached && cached.allSpecies && cached.allSpecies.length > 0) {
            // Use cached prediction from Firebase
            return {
              file_id: file.file_id,
              file_name: file.file_name,
              top_species: cached.allSpecies,
              species_count: cached.allSpecies.length,
              predicted_species: cached.species,
              confidence: cached.confidence,
              from_cache: true
            };
          }
          
          // No prediction yet - mark as Processing or Waiting
          if (!processingStarted) {
            processingStarted = true;
            return {
              file_id: file.file_id,
              file_name: file.file_name,
              top_species: [],
              species_count: 0,
              predicted_species: 'Processing',
              confidence: 0,
              from_cache: false
            };
          }
          return {
            file_id: file.file_id,
            file_name: file.file_name,
            top_species: [],
            species_count: 0,
            predicted_species: 'Waiting',
            confidence: 0,
            from_cache: false
          };
        });
        
        setExpandedFolders(prev => ({
          ...prev,
          [folderId]: {
            isExpanded: true,
            isLoading: false,
            audioFiles: mergedResults
          }
        }));
      } else {
        setExpandedFolders(prev => ({
          ...prev,
          [folderId]: { isExpanded: false, isLoading: false }
        }));
      }
    } catch (error) {
      console.error('Error processing folder:', error);
      setExpandedFolders(prev => ({
        ...prev,
        [folderId]: { isExpanded: false, isLoading: false }
      }));
    }
  };

  const renderSpeciesBadges = (audio: BatchAudioResult) => {
    const topFive = audio.top_species?.slice(0, 5) || [];
    const remaining = (audio.species_count || 0) - 5;

    return (
      <div className="flex flex-wrap gap-2">
        {topFive.map((species, idx) => (
          <span
            key={idx}
            className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full text-xs font-semibold"
          >
            {species.species} {species.confidence.toFixed(1)}%
          </span>
        ))}
        {remaining > 0 && (
          <span className="w-8 h-8 bg-emerald-600 text-white rounded-full flex items-center justify-center text-xs font-bold">
            +{remaining}
          </span>
        )}
      </div>
    );
  };

  const handleMaximize = () => {
    // Convert folders to maximize view format with expanded audio files
    const foldersForMaximize = folders.map(folder => {
      const folderState = expandedFolders[folder.folder_id];
      return {
        folder_id: folder.folder_id,
        name: folder.name,
        timestamp: folder.timestamp,
        date: folder.date,
        time: folder.time,
        audioFiles: folderState?.audioFiles || [],
        isLoading: folderState?.isLoading || false
      };
    });

    navigate('/data-history-maximize', {
      state: {
        folders: foldersForMaximize,
        clientName: state?.clientName,
        serverName: state?.serverName,
        serverId: state?.serverId,
        clientId: state?.clientId
      }
    });
  };

  if (!state) return null;

  const filteredFolders = folders.filter(folder => {
    const q = globalSearch.toLowerCase();
    return (
      folder.name.toLowerCase().includes(q) ||
      folder.date.includes(q) ||
      folder.time.includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/80 to-blue-50/30">
      <NavigationMenu />
      
      <main className={`transition-all duration-300 ${isExpanded ? 'ml-64' : 'ml-16'} p-8`}>
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-emerald-700 hover:text-emerald-800 mb-4 transition"
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Dashboard
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {state.serverName} - {state.clientName} - Recording Folders
              </h1>
              <p className="text-gray-600 mt-2">
                {folders.length} folder{folders.length !== 1 ? 's' : ''} found
              </p>
            </div>
            <button
              onClick={handleMaximize}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition font-semibold"
            >
              <Maximize2 className="w-5 h-5" />
              Maximize View
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search folders by name, date..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-3 bg-white border-2 border-gray-200 rounded-xl focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-emerald-600" />
            <p className="text-gray-600">Loading folders...</p>
          </div>
        )}

        {/* Folders Table */}
        {!loading && (
          <div className="bg-white rounded-xl shadow-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b-2 border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Folder Name
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Time
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-bold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredFolders.map((folder) => {
                  const folderState = expandedFolders[folder.folder_id];
                  const isExpanded = folderState?.isExpanded || false;
                  const isLoading = folderState?.isLoading || false;
                  const audioFiles = folderState?.audioFiles || [];

                  return (
                    <>
                      {/* Folder Row */}
                      <tr key={folder.folder_id} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4">
                          <span className="font-medium text-gray-900">{folder.name}</span>
                        </td>
                        <td className="px-6 py-4 text-gray-600">{folder.date}</td>
                        <td className="px-6 py-4 text-gray-600">{folder.time}</td>
                        <td className="px-6 py-4 text-center">
                          <button
                            onClick={() => toggleFolder(folder.folder_id)}
                            disabled={isLoading}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white rounded-lg font-semibold transition"
                          >
                            {isLoading ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Processing...
                              </>
                            ) : isExpanded ? (
                              <>
                                <ChevronUp className="w-4 h-4" />
                                Hide Calls
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-4 h-4" />
                                Show Calls
                              </>
                            )}
                          </button>
                        </td>
                      </tr>

                      {/* Expanded Audio Files */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={4} className="px-6 py-0 bg-gray-50">
                            <div className="py-4">
                              {isLoading ? (
                                <div className="flex items-center justify-center py-8">
                                  <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mr-3" />
                                  <span className="text-gray-600">Loading audio files...</span>
                                </div>
                              ) : audioFiles.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                  No audio files found in this folder
                                </div>
                              ) : (
                                <table className="w-full">
                                  <thead className="bg-gray-100">
                                    <tr>
                                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                                        Audio File
                                      </th>
                                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                                        Top 3 Species
                                      </th>
                                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                                        Peak Frequency
                                      </th>
                                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600">
                                        Duration
                                      </th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-gray-200">
                                    {audioFiles.map((audio) => (
                                      <tr key={audio.file_id} className="hover:bg-white transition">
                                        <td className="px-4 py-3">
                                          <div className="flex items-center gap-2">
                                            <FileAudio className="w-4 h-4 text-emerald-600" />
                                            <span className="text-sm font-medium text-gray-900">
                                              {audio.file_name}
                                            </span>
                                          </div>
                                        </td>
                                        <td className="px-4 py-3">
                                          {audio.top_species && audio.top_species.length > 0 ? (
                                            renderSpeciesBadges(audio)
                                          ) : audio.predicted_species === 'Processing' ? (
                                            <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold inline-flex items-center gap-1">
                                              <Loader2 className="w-3 h-3 animate-spin" />
                                              Processing...
                                            </span>
                                          ) : audio.predicted_species === 'Waiting' ? (
                                            <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-semibold">
                                              Waiting...
                                            </span>
                                          ) : (
                                            <span className="text-xs text-gray-400">No prediction</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-3">
                                          <span className="text-sm font-semibold text-emerald-600">
                                            {audio.call_parameters?.peak_frequency
                                              ? `${audio.call_parameters.peak_frequency.toFixed(1)} kHz`
                                              : 'N/A'}
                                          </span>
                                        </td>
                                        <td className="px-4 py-3">
                                          <span className="text-sm text-gray-700">
                                            {audio.duration ? audio.duration.toFixed(2) : '0.00'}s
                                          </span>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>

            {filteredFolders.length === 0 && !loading && (
              <div className="text-center py-12 text-gray-500">
                No folders found{globalSearch ? ' matching your search' : ''}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
