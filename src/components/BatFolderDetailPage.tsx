import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, MapPin, FileAudio, RefreshCw, ChevronDown, GripVertical, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import { NavigationMenu } from './NavigationMenu';
import { useMenu } from '../context/MenuContext';
import { subscribeToPredictions, savePrediction } from '../firebase';
import { loadFolderAudioWithPredictions, FolderAudioEntry } from '../services/folderPredictions';

const BatFolderDetailPage: React.FC = () => {
  const { folderTimestamp, serverNum, clientNum } = useParams<{
    folderTimestamp: string;
    serverNum: string;
    clientNum: string;
  }>();
  const navigate = useNavigate();
  const { isExpanded } = useMenu();

  const [loading, setLoading] = useState(true);
  const [audioResults, setAudioResults] = useState<FolderAudioEntry[]>([]);
  const [selectedAudio, setSelectedAudio] = useState<any | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folderName, setFolderName] = useState('');
  const [processingStatus, setProcessingStatus] = useState<string>('');
  
  // Collapsible sections state - metadata and call_params open by default now
  const [openSections, setOpenSections] = useState<{[key: string]: boolean}>({
    species: true,
    metadata: true,
    call_params: true,
    map: false
  });
  
  // Audio player state
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  // AbortController for cancelling ongoing predictions when navigating away
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Resizable columns state - default: 40% / 35% / 25%
  const [leftColumnWidth, setLeftColumnWidth] = useState(40); // Recordings column
  const [centerColumnWidth, setCenterColumnWidth] = useState(35); // Spectrogram column  
  const [rightColumnWidth, setRightColumnWidth] = useState(25); // Details column
  const [isDragging, setIsDragging] = useState<'left' | 'right' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Spectrogram zoom state
  const [spectrogramZoom, setSpectrogramZoom] = useState(1);
  
  // Spectrogram image controls
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Handle mouse events for resizable columns
  const handleMouseDown = useCallback((divider: 'left' | 'right') => {
    setIsDragging(divider);
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !containerRef.current) return;
    
    const containerRect = containerRef.current.getBoundingClientRect();
    const containerWidth = containerRect.width;
    const mouseX = e.clientX - containerRect.left;
    const percentage = (mouseX / containerWidth) * 100;
    
    if (isDragging === 'left') {
      // Dragging the left divider (between recordings and spectrogram)
      const newLeftWidth = Math.min(Math.max(percentage, 15), 60); // Min 15%, max 60%
      // Adjust center width to maintain total
      const newCenterWidth = 100 - newLeftWidth - rightColumnWidth - 1; // -1 for dividers
      if (newCenterWidth >= 20) {
        setLeftColumnWidth(newLeftWidth);
        setCenterColumnWidth(newCenterWidth);
      }
    } else if (isDragging === 'right') {
      // Dragging the right divider (between spectrogram and details)
      const rightPercentage = 100 - percentage;
      const newRightWidth = Math.min(Math.max(rightPercentage, 10), 40); // Min 10%, max 40%
      // Adjust center width to maintain total
      const newCenterWidth = 100 - leftColumnWidth - newRightWidth - 1; // -1 for dividers
      if (newCenterWidth >= 20) {
        setRightColumnWidth(newRightWidth);
        setCenterColumnWidth(newCenterWidth);
      }
    }
  }, [isDragging, leftColumnWidth, rightColumnWidth]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(null);
  }, []);

  // Add/remove event listeners for drag
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    const loadFolderData = async () => {
      if (!folderTimestamp || !serverNum || !clientNum) {
        setError('Missing required parameters');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const folderName = `server${serverNum}_client${clientNum}_${folderTimestamp}`;
        setFolderName(folderName);
        
        console.log('🚀 Loading folder data:', { serverNum, clientNum, folderTimestamp });
        setProcessingStatus('Loading predictions and files...');

        const { entries, timestamp, serverNum: sNum, clientNum: cNum } = await loadFolderAudioWithPredictions({
          serverId: serverNum,  // Will be normalized to "server1" inside the service
          clientId: clientNum,  // Will be normalized to "client1" inside the service
          folderName
        });

        setAudioResults(entries);
        
        const cachedCount = entries.filter(e => e.from_cache).length;
        const waitingCount = entries.filter(e => e.needs_prediction).length;
        console.log(`✅ [BatFolderDetailPage] Loaded ${entries.length} files: ${cachedCount} cached, ${waitingCount} need prediction`);
        
        // Auto-select first file and fetch its details
        if (entries.length > 0) {
          setSelectedAudio(entries[0]);
          // Fetch details for first file to show spectrogram/audio immediately
          fetchAudioDetails(entries[0]);
        }

        setLoading(false);
        
        // Start SEQUENTIAL predictions for remaining files (in background)
        const filesToPredict = entries
          .map((entry, index) => ({ entry, index }))
          .filter(({ entry }) => entry.needs_prediction);

        if (filesToPredict.length > 0) {
          console.log(`🔬 [BatFolderDetailPage] Starting SEQUENTIAL predictions for ${filesToPredict.length} files`);

          // Create new AbortController for this prediction batch
          abortControllerRef.current = new AbortController();
          const signal = abortControllerRef.current.signal;

          // Process predictions ONE BY ONE (sequentially) in background
          (async () => {
            for (const { entry, index } of filesToPredict) {
              // Check if cancelled
              if (signal.aborted) {
                console.log(`🚫 [BatFolderDetailPage] Predictions cancelled`);
                break;
              }
              
              try {
                console.log(`🔬 [BatFolderDetailPage] Predicting ${index + 1}/${filesToPredict.length}: ${entry.file_name}`);
                
                // Mark as processing
                setAudioResults(prev => {
                  const updated = [...prev];
                  const actualIndex = prev.findIndex(e => e.file_id === entry.file_id);
                  if (actualIndex !== -1) {
                    updated[actualIndex] = {
                      ...updated[actualIndex],
                      processing: true,
                      predicted_species: 'Processing...'
                    };
                  }
                  return updated;
                });

                // Predict using the shared service
                const { predictSingleAudio } = await import('../services/folderPredictions');
                const normalizedServerId = serverNum?.toLowerCase().startsWith('server') 
                  ? serverNum.toLowerCase() 
                  : `server${serverNum}`;
                const normalizedClientId = clientNum?.toLowerCase().startsWith('client') 
                  ? clientNum.toLowerCase() 
                  : `client${clientNum}`;
                
                const updatedEntry = await predictSingleAudio({
                  serverId: normalizedServerId,
                  clientId: normalizedClientId,
                  serverNum: sNum,
                  clientNum: cNum,
                  timestamp,
                  audio: entry,
                  signal
                });

                // Update UI immediately after each prediction
                setAudioResults(prev => {
                  const updated = [...prev];
                  const actualIndex = prev.findIndex(e => e.file_id === entry.file_id);
                  if (actualIndex !== -1) {
                    updated[actualIndex] = updatedEntry;
                  }
                  return updated;
                });
                
                console.log(`✅ [BatFolderDetailPage] Completed ${index + 1}/${filesToPredict.length}: ${entry.file_name}`);
              } catch (err) {
                // Skip abort errors (expected when cancelling)
                if (err instanceof Error && err.name === 'AbortError') {
                  console.log(`🚫 [BatFolderDetailPage] Prediction cancelled for ${entry.file_name}`);
                  break;
                }
                
                console.error(`❌ [BatFolderDetailPage] Prediction error for ${entry.file_name}:`, err);
                
                // Mark as error in UI
                setAudioResults(prev => {
                  const updated = [...prev];
                  const actualIndex = prev.findIndex(e => e.file_id === entry.file_id);
                  if (actualIndex !== -1) {
                    updated[actualIndex] = {
                      ...updated[actualIndex],
                      processing: false,
                      predicted_species: 'Error',
                      error: err instanceof Error ? err.message : 'Unknown error'
                    };
                  }
                  return updated;
                });
              }
            }
            console.log(`🎉 [BatFolderDetailPage] All predictions completed`);
          })();
        }
        
        // Set up Firebase real-time listener for prediction updates
        // Use serverNum/clientNum directly - subscribeToPredictions should handle normalization
        console.log('🔔 Setting up Firebase prediction listener...');
        const normalizedServer = serverNum.toLowerCase().startsWith('server') ? serverNum.toLowerCase() : `server${serverNum}`;
        const normalizedClient = clientNum.toLowerCase().startsWith('client') ? clientNum.toLowerCase() : `client${clientNum}`;
        const unsubscribe = subscribeToPredictions(
          normalizedServer,
          normalizedClient,
          (predictions) => {
            console.log('🔔 Received Firebase prediction update');

            setAudioResults(prev => prev.map(audio => {
              const pred = predictions[audio.file_name];
              if (pred && pred.allSpecies && pred.allSpecies.length > 0) {
                return {
                  ...audio,
                  species: pred.allSpecies,
                  predicted_species: pred.species,
                  confidence: pred.confidence,
                  from_cache: true,
                  needs_prediction: false,
                  processing: false  // Clear processing flag when prediction is complete
                };
              }
              return audio;
            }));

            if (selectedAudio) {
              const pred = predictions[selectedAudio.file_name];
              if (pred && pred.allSpecies && pred.allSpecies.length > 0) {
                setSelectedDetails(prev => prev ? {
                  ...prev,
                  species: pred.allSpecies,
                  species_count: pred.allSpecies.length
                } : null);
              }
            }
          }
        );
        
        // Clean up listener on unmount
        return () => {
          console.log('🔕 Cleaning up Firebase listener');
          unsubscribe();
        };
      } catch (err) {
        console.error('❌ Error loading folder:', err);
        setError(err instanceof Error ? err.message : 'Unknown error');
        setLoading(false);
      }
    };

    const cleanup = loadFolderData();
    return () => {
      // Cancel any ongoing predictions when navigating away
      if (abortControllerRef.current) {
        console.log('🚫 [BatFolderDetailPage] Component unmounting - cancelling predictions');
        abortControllerRef.current.abort();
      }
      
      if (cleanup instanceof Promise) {
        cleanup.then(fn => fn && fn());
      }
    };
  }, [folderTimestamp, serverNum, clientNum]);

  // Fetch detailed prediction data for selected audio
  // If from_cache is true, we just fetch media URLs without re-predicting
  const fetchAudioDetails = async (audio: FolderAudioEntry, forcePredict: boolean = false) => {
    if (!audio) return;
    
    setLoadingDetails(true);
    setSelectedDetails(null);
    setAudioUrl(null);
    
    // Create AbortController for this fetch
    if (abortControllerRef.current) {
      abortControllerRef.current.abort(); // Cancel any previous fetch
    }
    abortControllerRef.current = new AbortController();
    
    try {
      // If cached and not forcing prediction, use media-only endpoint
      const skipPrediction = audio.from_cache && !forcePredict;
      
      const predictApiUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/audio/predict`;
      const response = await fetch(predictApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: audio.file_id,
          file_name: audio.file_name,
          server_num: serverNum,
          client_num: clientNum,
          folder_timestamp: folderTimestamp,
          skip_prediction: skipPrediction // Tell backend to skip ML prediction if cached
        }),
        signal: abortControllerRef.current.signal // Add abort signal
      });
      
      if (response.ok) {
        const result = await response.json();
        
        console.log('📊 API Response for', audio.file_name, ':', {
          metadata: result.metadata,
          call_parameters: result.call_parameters,
          spectrogram_url: result.spectrogram_url,
          audio_url: result.audio_url
        });
        
        // If we skipped prediction, merge with cached species data
        if (skipPrediction && audio.species?.length > 0) {
          result.species = audio.species;
          result.species_count = audio.species.length;
        }

        setSelectedDetails(result);

        // Save to Firebase if we got a new prediction (NOT using predictSingleAudio which calls API again)
        if (!skipPrediction && result.success && result.species && result.species.length > 0) {
          // Extract bat number from filename: "bat_1014.wav" -> "1014"
          const batIdMatch = audio.file_name.match(/bat_(\d+)/i);
          const batNumber = batIdMatch ? batIdMatch[1] : audio.file_name.replace('.wav', '');
          
          // Normalize IDs
          const normalizedServerId = serverNum?.toLowerCase().startsWith('server') 
            ? serverNum.toLowerCase() 
            : `server${serverNum}`;
          const normalizedClientId = clientNum?.toLowerCase().startsWith('client') 
            ? clientNum.toLowerCase() 
            : `client${clientNum}`;
          
          console.log(`💾 [BatFolderDetailPage] Saving prediction to Firebase: ${normalizedServerId}/${normalizedClientId}/${folderTimestamp}/${batNumber}`);
          
          try {
            await savePrediction(
              normalizedServerId,
              normalizedClientId,
              batNumber,
              result.species[0].species,
              result.species[0].confidence,
              new Date().toISOString(),
              result.call_parameters?.peak_freq || '',
              result.species,
              folderTimestamp
            );
            console.log(`✅ [BatFolderDetailPage] Saved prediction for ${audio.file_name}`);
          } catch (err) {
            console.error('[BatFolderDetailPage] Firebase save error:', err);
          }
          
          // Update local state with prediction
          const updatedEntry: FolderAudioEntry = {
            ...audio,
            species: result.species,
            predicted_species: result.species[0].species,
            confidence: result.species[0].confidence,
            from_cache: true,
            needs_prediction: false,
            processing: false
          };

          setAudioResults(prev => prev.map(a =>
            a.file_id === audio.file_id ? updatedEntry : a
          ));
        }
        
        // Set audio URL for playback
        if (result.audio_url) {
          setAudioUrl(result.audio_url);
        }
      }
    } catch (err) {
      // Don't log errors if request was aborted (expected when navigating away)
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('🚫 [BatFolderDetailPage] Fetch cancelled');
        return;
      }
      console.error('Error fetching details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleAudioClick = (audio: any) => {
    setSelectedAudio(audio);
    fetchAudioDetails(audio, false); // Don't force prediction, use cache if available
  };

  const handleRepredict = () => {
    if (selectedAudio) {
      fetchAudioDetails(selectedAudio, true); // Force new prediction
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '-';
    const kb = bytes / 1024;
    if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
    return `${kb.toFixed(1)} KB`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <NavigationMenu />
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-600" />
            <p className="text-sm text-gray-600">{processingStatus || 'Loading...'}</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <NavigationMenu />
        <div className="flex items-center justify-center h-screen">
          <div className="text-center bg-white p-6 rounded-lg shadow-md">
            <p className="text-red-500 mb-3">❌ {error}</p>
            <button onClick={() => navigate(-1)} className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm">
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const metadata = selectedDetails?.metadata || {};
  const callParams = selectedDetails?.call_parameters || {};

  return (
    <div className="h-screen bg-gray-100 text-xs overflow-hidden">
      <NavigationMenu />
      
      <main className={`transition-all duration-300 ${isExpanded ? 'ml-64' : 'ml-20'} p-2 h-full overflow-hidden`}>
        {/* Compact Header */}
        <div className="mb-2 bg-white rounded px-3 py-2 border border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(-1)} className="text-blue-600 hover:text-blue-800 flex items-center gap-1">
              <ArrowLeft className="w-3 h-3" />
              <span>Back</span>
            </button>
            <span className="text-gray-400">|</span>
            <span className="font-semibold text-gray-800">{folderName}</span>
            <span className="text-gray-500">({audioResults.length} files)</span>
          </div>
        </div>

        {/* Main 3-Column Layout with Resizable Dividers */}
        <div 
          ref={containerRef}
          className="flex gap-0 h-full" 
          style={{ height: 'calc(100vh - 80px)' }}
        >
          
          {/* LEFT: Recording List - Resizable width */}
          <div 
            className="bg-white rounded border border-gray-200 overflow-hidden flex flex-col h-full"
            style={{ width: `${leftColumnWidth}%`, minWidth: '150px' }}
          >
            <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 font-semibold text-gray-700 text-sm flex items-center justify-between h-10 flex-shrink-0">
              <span>Recordings</span>
              <span className="text-gray-400 font-normal text-xs">{audioResults.length}</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {audioResults.map((audio) => (
                <div
                  key={audio.file_id}
                  onClick={() => handleAudioClick(audio)}
                  className={`px-2 py-1.5 border-b border-gray-100 cursor-pointer transition ${
                    selectedAudio?.file_id === audio.file_id
                      ? 'bg-blue-50 border-l-2 border-l-blue-500'
                      : 'hover:bg-gray-50 border-l-2 border-l-transparent'
                  }`}
                >
                  {/* File Name Row */}
                  <div className="flex items-center justify-between gap-1.5 mb-1">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <FileAudio className="w-3 h-3 text-blue-500 flex-shrink-0" />
                      <span className="font-medium text-gray-800 truncate">{audio.file_name}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        fetchAudioDetails(audio);
                      }}
                      className="p-0.5 rounded hover:bg-gray-200 text-gray-500 transition flex-shrink-0"
                      title="Re-predict"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  </div>
                  
                  {/* Compact Info Row */}
                  <div className="text-[10px] text-gray-500 flex flex-wrap gap-x-2 gap-y-0.5 ml-4 mb-1">
                    <span>Size: {formatSize(audio.size)}</span>
                    {audio.confidence > 0 && (
                      <span className={audio.confidence >= 80 ? 'text-green-600 font-medium' : audio.confidence >= 50 ? 'text-yellow-600' : 'text-red-500'}>
                        Conf: {audio.confidence.toFixed(0)}%
                      </span>
                    )}
                    {audio.from_cache && <span className="text-emerald-600">●</span>}
                  </div>
                  
                  {/* All Species Tags */}
                  {audio.species && audio.species.length > 0 ? (
                    <div className="flex flex-wrap gap-0.5 ml-4">
                      {audio.species.map((sp: any, sidx: number) => (
                        <span key={sidx} className={`px-1 py-0 rounded text-[9px] font-medium ${
                          sidx === 0 ? 'bg-green-100 text-green-700' :
                          sidx === 1 ? 'bg-blue-100 text-blue-700' :
                          sidx === 2 ? 'bg-purple-100 text-purple-700' :
                          sidx === 3 ? 'bg-orange-100 text-orange-700' :
                          'bg-pink-100 text-pink-700'
                        }`}>
                          {sp.species?.replace(/_/g, ' ')} ({sp.confidence?.toFixed(0)}%)
                        </span>
                      ))}
                    </div>
                  ) : audio.processing || audio.predicted_species === 'Processing...' ? (
                    <div className="text-[9px] text-blue-600 ml-4 flex items-center gap-1">
                      <Loader2 className="w-2 h-2 animate-spin" />
                      Processing...
                    </div>
                  ) : audio.predicted_species === 'Waiting' ? (
                    <div className="text-[9px] text-yellow-600 ml-4">Waiting...</div>
                  ) : (
                    <div className="text-[9px] text-gray-400 ml-4">No species detected</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Resizable Divider between Recordings and Spectrogram */}
          <div
            className={`w-2 flex-shrink-0 cursor-col-resize flex items-center justify-center group hover:bg-blue-100 transition-colors ${isDragging === 'left' ? 'bg-blue-200' : 'bg-gray-200'}`}
            onMouseDown={() => handleMouseDown('left')}
          >
            <div className="w-1 h-16 bg-gray-400 rounded group-hover:bg-blue-500 transition-colors flex items-center justify-center">
              <GripVertical className="w-3 h-3 text-gray-600 group-hover:text-blue-700" />
            </div>
          </div>

          {/* CENTER: Spectrogram + Audio - Fixed percentage width */}
          <div 
            className="flex flex-col gap-2 overflow-hidden h-full"
            style={{ width: `${centerColumnWidth}%`, minWidth: '200px' }}
          >
            {/* Spectrogram with Zoom - Takes most of the space */}
            <div className="bg-white rounded border border-gray-200 flex-1 flex flex-col overflow-hidden min-h-0">
              <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 font-semibold text-gray-700 text-sm flex items-center justify-between h-10 flex-shrink-0">
                <span>Spectrogram & Audio</span>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => setSpectrogramZoom(z => Math.max(0.5, z - 0.25))}
                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3 h-3 text-gray-600" />
                  </button>
                  <span className="text-[10px] text-gray-500 min-w-[40px] text-center">{Math.round(spectrogramZoom * 100)}%</span>
                  <button 
                    onClick={() => setSpectrogramZoom(z => Math.min(3, z + 0.25))}
                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3 h-3 text-gray-600" />
                  </button>
                  <button 
                    onClick={() => setSpectrogramZoom(1)}
                    className="p-1 hover:bg-gray-200 rounded transition-colors ml-1"
                    title="Reset Zoom"
                  >
                    <Maximize2 className="w-3 h-3 text-gray-600" />
                  </button>
                </div>
              </div>
              <div className="flex-1 bg-gray-900 flex items-center justify-center p-2 overflow-auto min-h-0">
                {loadingDetails ? (
                  <Loader2 className="w-6 h-6 animate-spin text-cyan-400" />
                ) : selectedDetails?.spectrogram_url ? (
                  <img 
                    src={selectedDetails.spectrogram_url} 
                    alt="Spectrogram" 
                    className="object-contain transition-all duration-200 w-full h-full"
                    style={{ 
                      transform: `scale(${spectrogramZoom})`,
                      transformOrigin: 'center center',
                      maxWidth: spectrogramZoom > 1 ? 'none' : '100%',
                      maxHeight: spectrogramZoom > 1 ? 'none' : '100%',
                      filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`
                    }}
                    onError={(e) => {
                      console.error('Spectrogram load error:', selectedDetails.spectrogram_url);
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="text-gray-500 text-center">
                    <p>No spectrogram</p>
                    <p className="text-[10px] mt-1">Select a recording to view</p>
                  </div>
                )}
              </div>
              
              {/* Brightness/Contrast/Saturation Controls - Full width stacked rows */}
              <div className="bg-gray-800 px-3 py-1.5 flex-shrink-0 space-y-1">
                <div className="flex items-center gap-2 text-[9px] text-gray-400">
                  <span className="w-14">Bright</span>
                  <input 
                    type="range" 
                    min="50" 
                    max="200" 
                    value={brightness} 
                    onChange={(e) => setBrightness(Number(e.target.value))} 
                    className="flex-1 h-1 accent-emerald-500" 
                  />
                  <span className="w-10 text-right">{brightness}%</span>
                </div>
                <div className="flex items-center gap-2 text-[9px] text-gray-400">
                  <span className="w-14">Contrast</span>
                  <input 
                    type="range" 
                    min="50" 
                    max="200" 
                    value={contrast} 
                    onChange={(e) => setContrast(Number(e.target.value))} 
                    className="flex-1 h-1 accent-emerald-500" 
                  />
                  <span className="w-10 text-right">{contrast}%</span>
                </div>
                <div className="flex items-center gap-2 text-[9px] text-gray-400">
                  <span className="w-14">Saturate</span>
                  <input 
                    type="range" 
                    min="0" 
                    max="200" 
                    value={saturation} 
                    onChange={(e) => setSaturation(Number(e.target.value))} 
                    className="flex-1 h-1 accent-emerald-500" 
                  />
                  <span className="w-10 text-right">{saturation}%</span>
                </div>
              </div>
            </div>

            {/* Audio Player - Compact fixed height */}
            <div className="bg-white rounded border border-gray-200 px-3 py-2 flex-shrink-0">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-gray-600 text-[11px]">Audio Player</span>
                <button 
                  onClick={handleRepredict}
                  disabled={loadingDetails || !selectedAudio}
                  className="p-1 rounded hover:bg-gray-200 text-gray-500 transition"
                  title="Re-predict"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingDetails ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <div className="text-[10px] text-gray-500 mb-1 truncate">{selectedAudio?.file_name || 'No file selected'}</div>
              {/* Native Audio Player */}
              {audioUrl ? (
                <audio 
                  ref={audioRef} 
                  src={audioUrl} 
                  controls
                  className="w-full h-8"
                />
              ) : (
                <div className="text-center text-gray-400 text-[10px] py-2 bg-gray-50 rounded">
                  {selectedAudio ? 'Loading audio...' : 'No audio selected'}
                </div>
              )}
            </div>
          </div>

          {/* Resizable Divider between Spectrogram and Details */}
          <div
            className={`w-2 flex-shrink-0 cursor-col-resize flex items-center justify-center group hover:bg-blue-100 transition-colors ${isDragging === 'right' ? 'bg-blue-200' : 'bg-gray-200'}`}
            onMouseDown={() => handleMouseDown('right')}
          >
            <div className="w-1 h-16 bg-gray-400 rounded group-hover:bg-blue-500 transition-colors flex items-center justify-center">
              <GripVertical className="w-3 h-3 text-gray-600 group-hover:text-blue-700" />
            </div>
          </div>

          {/* RIGHT: Details Panel - Fixed percentage width */}
          <div 
            className="bg-white rounded border border-gray-200 overflow-hidden flex flex-col h-full"
            style={{ width: `${rightColumnWidth}%`, minWidth: '180px' }}
          >
            <div className="bg-gray-50 px-3 py-2 border-b border-gray-200 font-semibold text-gray-700 text-sm h-10 flex items-center flex-shrink-0">
              Details
            </div>
            <div className="flex-1 overflow-y-auto">
              {loadingDetails ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                </div>
              ) : !selectedAudio ? (
                <div className="text-center text-gray-400 py-4 px-2">
                  <FileAudio className="w-6 h-6 mx-auto mb-1 opacity-30" />
                  <p className="text-[10px]">Select a recording to view details</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  
                  {/* Species Section - Open by default */}
                  <div>
                    <button
                      onClick={() => toggleSection('species')}
                      className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-gray-50 transition"
                    >
                      <span className="font-medium text-gray-700 text-[11px]">Species</span>
                      <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${openSections.species ? 'rotate-180' : ''}`} />
                    </button>
                    {openSections.species && (
                      <div className="px-2 pb-2 space-y-1">
                        {selectedDetails?.species && selectedDetails.species.length > 0 ? (
                          selectedDetails.species.map((sp: any, idx: number) => (
                            <div key={idx} className={`flex justify-between items-center p-1.5 rounded ${
                              idx === 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-100'
                            }`}>
                              <span className={`font-medium text-[10px] ${idx === 0 ? 'text-green-700' : 'text-gray-700'}`}>
                                {idx + 1}. {sp.species?.replace(/_/g, ' ')}
                              </span>
                              <span className={`font-bold text-[10px] ${
                                sp.confidence >= 80 ? 'text-green-600' :
                                sp.confidence >= 50 ? 'text-yellow-600' : 'text-red-500'
                              }`}>
                                {sp.confidence?.toFixed(1)}%
                              </span>
                            </div>
                          ))
                        ) : selectedAudio.species && selectedAudio.species.length > 0 ? (
                          selectedAudio.species.map((sp: any, idx: number) => (
                            <div key={idx} className={`flex justify-between items-center p-1.5 rounded ${
                              idx === 0 ? 'bg-green-50 border border-green-200' : 'bg-gray-50 border border-gray-100'
                            }`}>
                              <span className={`font-medium text-[10px] ${idx === 0 ? 'text-green-700' : 'text-gray-700'}`}>
                                {idx + 1}. {sp.species?.replace(/_/g, ' ')}
                              </span>
                              <span className={`font-bold text-[10px] ${
                                sp.confidence >= 80 ? 'text-green-600' :
                                sp.confidence >= 50 ? 'text-yellow-600' : 'text-red-500'
                              }`}>
                                {sp.confidence?.toFixed(1)}%
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-gray-400 text-center py-2 text-[10px]">No species detected</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Metadata Section */}
                  <div>
                    <button
                      onClick={() => toggleSection('metadata')}
                      className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-gray-50 transition"
                    >
                      <span className="font-medium text-gray-700 text-[11px]">Metadata</span>
                      <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${openSections.metadata ? 'rotate-180' : ''}`} />
                    </button>
                    {openSections.metadata && (
                      <div className="px-2 pb-2 space-y-0.5 text-[10px]">
                        {metadata.timestamp && <div className="flex justify-between py-0.5"><span className="text-gray-400">Time</span><span className="text-gray-700">{metadata.timestamp}</span></div>}
                        {metadata.latitude && <div className="flex justify-between py-0.5"><span className="text-gray-400">Lat</span><span className="text-gray-700">{metadata.latitude}</span></div>}
                        {metadata.longitude && <div className="flex justify-between py-0.5"><span className="text-gray-400">Long</span><span className="text-gray-700">{metadata.longitude}</span></div>}
                        {metadata.length && <div className="flex justify-between py-0.5"><span className="text-gray-400">Length</span><span className="text-gray-700">{metadata.length}</span></div>}
                        {metadata.sample_rate && <div className="flex justify-between py-0.5"><span className="text-gray-400">Sample Rate</span><span className="text-gray-700">{metadata.sample_rate}</span></div>}
                        {metadata.temperature && <div className="flex justify-between py-0.5"><span className="text-gray-400">Temp</span><span className="text-gray-700">{metadata.temperature}</span></div>}
                        {metadata.humidity && <div className="flex justify-between py-0.5"><span className="text-gray-400">Humidity</span><span className="text-gray-700">{metadata.humidity}</span></div>}
                        {metadata.make && <div className="flex justify-between py-0.5"><span className="text-gray-400">Make</span><span className="text-gray-700">{metadata.make}</span></div>}
                        {metadata.model && <div className="flex justify-between py-0.5"><span className="text-gray-400">Model</span><span className="text-gray-700">{metadata.model}</span></div>}
                        {metadata.filter_hp && <div className="flex justify-between py-0.5"><span className="text-gray-400">HP Filter</span><span className="text-gray-700">{metadata.filter_hp}</span></div>}
                        {metadata.filter_lp && <div className="flex justify-between py-0.5"><span className="text-gray-400">LP Filter</span><span className="text-gray-700">{metadata.filter_lp}</span></div>}
                        {metadata.note && <div className="flex justify-between py-0.5"><span className="text-gray-400">Note</span><span className="text-gray-700 text-right max-w-[60%]">{metadata.note}</span></div>}
                        {Object.keys(metadata).length === 0 && (
                          <div className="text-gray-400 text-center py-2">No metadata available</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Call Parameters Section */}
                  <div>
                    <button
                      onClick={() => toggleSection('call_params')}
                      className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-gray-50 transition"
                    >
                      <span className="font-medium text-gray-700 text-[11px]">Call Parameters</span>
                      <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${openSections.call_params ? 'rotate-180' : ''}`} />
                    </button>
                    {openSections.call_params && (
                      <div className="px-2 pb-2 space-y-0.5 text-[10px]">
                        {callParams.start_frequency && callParams.start_frequency > 0 && <div className="flex justify-between py-0.5"><span className="text-gray-400">Start Freq</span><span className="text-blue-600">{callParams.start_frequency.toFixed(2)} kHz</span></div>}
                        {callParams.end_frequency && callParams.end_frequency > 0 && <div className="flex justify-between py-0.5"><span className="text-gray-400">End Freq</span><span className="text-blue-600">{callParams.end_frequency.toFixed(2)} kHz</span></div>}
                        {callParams.minimum_frequency && callParams.minimum_frequency > 0 && <div className="flex justify-between py-0.5"><span className="text-gray-400">Min Freq</span><span className="text-blue-600">{callParams.minimum_frequency.toFixed(2)} kHz</span></div>}
                        {callParams.maximum_frequency && callParams.maximum_frequency > 0 && <div className="flex justify-between py-0.5"><span className="text-gray-400">Max Freq</span><span className="text-blue-600">{callParams.maximum_frequency.toFixed(2)} kHz</span></div>}
                        {callParams.peak_frequency && callParams.peak_frequency > 0 && <div className="flex justify-between py-0.5"><span className="text-gray-400">Peak Freq</span><span className="text-blue-600">{callParams.peak_frequency.toFixed(2)} kHz</span></div>}
                        {callParams.bandwidth && callParams.bandwidth > 0 && <div className="flex justify-between py-0.5"><span className="text-gray-400">Bandwidth</span><span className="text-blue-600">{callParams.bandwidth.toFixed(2)} kHz</span></div>}
                        {(callParams.call_length || callParams.pulse_duration) && (callParams.call_length > 0 || callParams.pulse_duration > 0) && <div className="flex justify-between py-0.5"><span className="text-gray-400">Call Length</span><span className="text-blue-600">{(callParams.call_length || callParams.pulse_duration).toFixed(2)} ms</span></div>}
                        {callParams.call_distance && callParams.call_distance > 0 && <div className="flex justify-between py-0.5"><span className="text-gray-400">Call Dist</span><span className="text-blue-600">{callParams.call_distance.toFixed(2)} ms</span></div>}
                        {callParams.pulse_count && callParams.pulse_count > 0 && <div className="flex justify-between py-0.5"><span className="text-gray-400">Pulses</span><span className="text-blue-600">{callParams.pulse_count}</span></div>}
                        {callParams.intensity && callParams.intensity !== 0 && <div className="flex justify-between py-0.5"><span className="text-gray-400">Intensity</span><span className="text-blue-600">{callParams.intensity.toFixed(2)} dB</span></div>}
                        {(callParams.sonotype || callParams.shape) && <div className="flex justify-between py-0.5"><span className="text-gray-400">Sonotype</span><span className="text-blue-600">{callParams.sonotype || callParams.shape}</span></div>}
                        {(callParams.frequency_modulation_rate || callParams.fm_rate) && (callParams.frequency_modulation_rate > 0 || callParams.fm_rate > 0) && <div className="flex justify-between py-0.5"><span className="text-gray-400">FM Rate</span><span className="text-blue-600">{(callParams.frequency_modulation_rate || callParams.fm_rate).toFixed(2)} kHz/ms</span></div>}
                        {callParams.characteristic_frequency && callParams.characteristic_frequency > 0 && <div className="flex justify-between py-0.5"><span className="text-gray-400">Char Freq</span><span className="text-blue-600">{callParams.characteristic_frequency.toFixed(2)} kHz</span></div>}
                        {callParams.knee_frequency && callParams.knee_frequency > 0 && <div className="flex justify-between py-0.5"><span className="text-gray-400">Knee Freq</span><span className="text-blue-600">{callParams.knee_frequency.toFixed(2)} kHz</span></div>}
                        {callParams.slope && callParams.slope !== 0 && <div className="flex justify-between py-0.5"><span className="text-gray-400">Slope</span><span className="text-blue-600">{callParams.slope.toFixed(2)}</span></div>}
                        {Object.keys(callParams).length === 0 && (
                          <div className="text-gray-400 text-center py-2">No call parameters</div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Map Section */}
                  <div>
                    <button
                      onClick={() => toggleSection('map')}
                      className="w-full flex items-center justify-between px-2 py-1.5 hover:bg-gray-50 transition"
                    >
                      <span className="font-medium text-gray-700 text-[11px]">Map</span>
                      <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform ${openSections.map ? 'rotate-180' : ''}`} />
                    </button>
                    {openSections.map && (
                      <div className="px-2 pb-2">
                        {metadata.latitude && metadata.longitude ? (
                          <div className="space-y-2">
                            <div className="aspect-square bg-gray-100 rounded overflow-hidden border border-gray-200">
                              <iframe
                                width="100%"
                                height="100%"
                                frameBorder="0"
                                style={{ border: 0 }}
                                src={`https://www.openstreetmap.org/export/embed.html?bbox=${parseFloat(metadata.longitude)-0.01},${parseFloat(metadata.latitude)-0.01},${parseFloat(metadata.longitude)+0.01},${parseFloat(metadata.latitude)+0.01}&layer=mapnik&marker=${metadata.latitude},${metadata.longitude}`}
                                allowFullScreen
                              ></iframe>
                            </div>
                            <div className="text-[10px] space-y-0.5">
                              <div className="flex justify-between"><span className="text-gray-400">Lat</span><span className="font-medium">{metadata.latitude}</span></div>
                              <div className="flex justify-between"><span className="text-gray-400">Long</span><span className="font-medium">{metadata.longitude}</span></div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center text-gray-400 py-4">
                            <MapPin className="w-6 h-6 mx-auto mb-1 opacity-30" />
                            <p className="text-[10px]">No GPS coordinates</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default BatFolderDetailPage;
