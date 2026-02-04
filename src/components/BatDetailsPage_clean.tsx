import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Loader2, Volume2, AlertCircle, SlidersHorizontal } from 'lucide-react';
import { NavigationMenu } from './NavigationMenu';
import { useMenu } from '../context/MenuContext';
import { fetchBatFiles, getFileUrl, predictSpecies, getSpeciesImageUrl } from '../services/api';

interface EnvironmentalData {
  temperature: number;
  humidity: number;
  pressure: number;
  lightLevel: number;
}

const BatDetailsPage: React.FC = () => {
  console.log('🚀 BatDetailsPage COMPONENT MOUNTED/RENDERED');
  const { batId, serverNum, clientNum } = useParams<{ batId: string; serverNum: string; clientNum: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { isExpanded } = useMenu();

  console.log('BatDetailsPage mounted with params:', { batId, serverNum, clientNum, pathname: location.pathname });

  // Get navigation state (server and client info) - fallback if not in params
  const navigationState = location.state as {
    serverName?: string;
    clientName?: string;
    serverNum?: string;
    clientNum?: string;
    batId?: string;
  } | null;

  // States for Google Drive file fetching
  const [loading, setLoading] = useState(true);
  
  // Sensor data states
  const [sensorData, setSensorData] = useState<EnvironmentalData | null>(null);
  const [sensorLoading, setSensorLoading] = useState(false);
  const [sensorError, setSensorError] = useState<string | null>(null);

  // Species prediction states
  const [predictedSpecies, setPredictedSpecies] = useState<string | null>(null);
  const [speciesConfidence, setSpeciesConfidence] = useState<number>(0);
  const [speciesImageUrl, setSpeciesImageUrl] = useState<string | null>(null);
  const [speciesPredicting, setSpeciesPredicting] = useState(false);
  const [speciesPredictionError, setSpeciesPredictionError] = useState<string | null>(null);

  // Image and Audio URLs
  const [spectrogramUrl, setSpectrogramUrl] = useState<string | null>(null);
  const [cameraUrl, setCameraUrl] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // Call parameters state
  const [callParameters, setCallParameters] = useState<any | null>(null);
  
  // Multi-species state
  const [allSpecies, setAllSpecies] = useState<any[]>([]);

  // Spectrogram image controls
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);

  // Guano metadata state
  const [guanoMetadata, setGuanoMetadata] = useState<any | null>(null);

  useEffect(() => {
    console.log('BatDetailsPage useEffect running on mount');
    const loadBatFiles = async () => {
      console.log('BatDetailsPage: Starting loadBatFiles');
      console.log('batId:', batId);
      console.log('serverNum:', serverNum);
      console.log('clientNum:', clientNum);
      console.log('Current location:', location.pathname);
      
      // Reset all states when loading new data
      setLoading(true);
      setSensorData(null);
      setSensorError(null);
      setSpectrogramUrl(null);
      setCameraUrl(null);
      setAudioUrl(null);
      
      // Use params first, then fallback to navigationState
      const effectiveServerNum = serverNum || navigationState?.serverNum || '1';
      const effectiveClientNum = clientNum || navigationState?.clientNum || '1';
      
      if (!batId) {
        console.log('Missing batId');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        console.log('Calling fetchBatFiles with:', {
          batId,
          serverNum: effectiveServerNum,
          clientNum: effectiveClientNum
        });
        
        const files = await fetchBatFiles(
          batId,
          effectiveServerNum,
          effectiveClientNum
        );
        
        console.log('fetchBatFiles response:', files);
        
        if (!files.success) {
          console.error('fetchBatFiles failed:', files.message);
          setSensorError('Failed to load BAT files: ' + (files.message || 'Unknown error'));
          setLoading(false);
          return;
        }
        
        // Set file URLs if files exist
        if (files.files?.spectrogram) {
          setSpectrogramUrl(getFileUrl(files.files.spectrogram.id, files.files.spectrogram.name));
        }
        if (files.files?.camera) {
          setCameraUrl(getFileUrl(files.files.camera.id, files.files.camera.name));
        }
        if (files.files?.audio) {
          setAudioUrl(getFileUrl(files.files.audio.id, files.files.audio.name));
        }
        
        // Parse sensor data if available
        if (files.files?.sensor) {
          setSensorLoading(true);
          try {
            const response = await fetch(getFileUrl(files.files.sensor.id, files.files.sensor.name));
            const text = await response.text();
            console.log('Raw sensor.txt content:', text);
            
            // Parse sensor.txt format
            const lines = text.split('\n');
            const data: any = {};
            
            lines.forEach(line => {
              console.log('Parsing line:', line);
              // Handle temperature - look for "Temp:" pattern (covers "Client1 Temp:", "Temperature:", etc.)
              if (line.includes('Temp:') || line.includes('temperature:')) {
                const temp = line.split(/.*[Tt]emp:/)[1]?.trim().replace(/°?C|celsius/gi, '').trim();
                data.temperature = parseFloat(temp || '0');
                console.log('Parsed temperature:', data.temperature);
              } 
              // Handle humidity
              else if (line.includes('Humidity:') || line.includes('humidity:')) {
                const hum = line.split(/[Hh]umidity:/)[1]?.trim().replace(/%/g, '').trim();
                data.humidity = parseFloat(hum || '0');
                console.log('Parsed humidity:', data.humidity);
              } 
              // Handle pressure
              else if (line.includes('Pressure:') || line.includes('pressure:')) {
                const press = line.split(/[Pp]ressure:/)[1]?.trim().replace(/hPa|Pa|pascal/gi, '').trim();
                data.pressure = parseFloat(press || '0');
                console.log('Parsed pressure:', data.pressure);
              } 
              // Handle light - look for "Light:" pattern
              else if (line.includes('Light:') || line.includes('light:')) {
                const light = line.split(/[Ll]ight:/)[1]?.trim().replace(/lux|lx/gi, '').trim();
                data.lightLevel = parseFloat(light || '0');
                console.log('Parsed light level:', data.lightLevel);
              }
            });
            
            console.log('Final parsed sensor data:', data);
            setSensorData(data as EnvironmentalData);
          } catch (err) {
            setSensorError('Failed to parse sensor data');
            console.error('Sensor parsing error:', err);
          } finally {
            setSensorLoading(false);
          }
        }
        
      } catch (err) {
        console.error('Error loading BAT files:', err);
      } finally {
        console.log('Setting loading to false');
        setLoading(false);
      }
    };

    loadBatFiles();
  }, []); // Empty dependency array - runs only on mount

  // Predict species from spectrogram after component mounts
  useEffect(() => {
    if (!batId || !serverNum || !clientNum || loading) return;
    
    const performPrediction = async () => {
      // Clear localStorage cache - using Firebase only now
      const cacheKey = `bat_prediction_${serverNum}_${clientNum}_${batId}`;
      localStorage.removeItem(cacheKey);
      
      setSpeciesPredicting(true);
      setSpeciesPredictionError(null);
      
      try {
        // Check Firebase first
        const serverId = `server${serverNum}`;
        const clientId = `client${clientNum}`;
        const { getPrediction } = await import('../firebase');
        
        console.log('🔍 Checking Firebase for existing prediction...');
        const firebasePrediction = await getPrediction(serverId, clientId, batId);
        
        if (firebasePrediction && firebasePrediction.species) {
          console.log('📦 Found in Firebase:', firebasePrediction.species);
          setPredictedSpecies(firebasePrediction.species);
          setSpeciesConfidence(firebasePrediction.confidence || 0);
          setSpeciesImageUrl(getSpeciesImageUrl(firebasePrediction.species));
          setSpeciesPredicting(false);
          return;
        }
        
        // Not in Firebase, predict using ML model
        console.log('🤖 Starting species prediction for BAT', batId);
        const result = await predictSpecies(batId, serverNum, clientNum);
        
        if (result.success && result.species) {
          console.log('✅ Prediction successful:', result.species, `(${result.confidence}%)`);
          console.log('📊 Full prediction result:', result);
          setPredictedSpecies(result.species);
          setSpeciesConfidence(result.confidence || 0);
          
          // Store all detected species
          if (result.all_species && result.all_species.length > 0) {
            console.log('🦇 Multiple species detected:', result.all_species);
            setAllSpecies(result.all_species);
          }
          
          // Store call parameters if available
          if (result.call_parameters) {
            console.log('📊 Call parameters received:', result.call_parameters);
            setCallParameters(result.call_parameters);
          } else {
            console.log('⚠️ No call parameters in response');
          }
          
          // Store metadata if available
          if (result.metadata) {
            console.log('📋 Metadata received:', result.metadata);
            setGuanoMetadata(result.metadata);
          } else {
            console.log('⚠️ No metadata in response');
          }
          
          // Set species image URL
          const imageUrl = getSpeciesImageUrl(result.species);
          setSpeciesImageUrl(imageUrl);
          console.log('📸 Species image URL set:', imageUrl);
          
          // Save to Firebase with date and frequency
          const { savePrediction } = await import('../firebase');
          const date = '15/08/2024'; // Default date (can be improved with actual data)
          const frequency = '45 kHz'; // Default frequency
          await savePrediction(serverId, clientId, batId, result.species, result.confidence || 0, date, frequency, result.all_species);
        } else {
          console.warn('⚠️ Prediction failed:', result.message);
          setSpeciesPredictionError(result.message || 'Failed to predict species');
          setPredictedSpecies('Unknown species');
          setSpeciesImageUrl(getSpeciesImageUrl('Unknown_species'));
        }
      } catch (err) {
        console.error('❌ Error during prediction:', err);
        setSpeciesPredictionError(err instanceof Error ? err.message : 'Prediction error occurred');
        setPredictedSpecies('Unknown species');
        setSpeciesImageUrl(getSpeciesImageUrl('Unknown_species'));
      } finally {
        setSpeciesPredicting(false);
      }
    };
    
    performPrediction();
  }, [batId, serverNum, clientNum, loading]);

  // Re-predict handler (clears cache and fetches fresh)
  const handleRePredict = async () => {
    if (!batId || !serverNum || !clientNum) return;
    
    // Clear cache
    const cacheKey = `bat_prediction_${serverNum}_${clientNum}_${batId}`;
    try {
      localStorage.removeItem(cacheKey);
      console.log('🗑️ Cache cleared for re-prediction');
    } catch (error) {
      console.error('Cache clear error:', error);
    }
    
    setSpeciesPredicting(true);
    setSpeciesPredictionError(null);
    
    try {
      console.log('🔄 Re-predicting species for BAT', batId);
      const result = await predictSpecies(batId, serverNum, clientNum);
      
      if (result.success && result.species) {
        console.log('✅ Re-prediction successful:', result.species, `(${result.confidence}%)`);
        console.log('📊 Full re-prediction result:', result);
        setPredictedSpecies(result.species);
        setSpeciesConfidence(result.confidence || 0);
        setSpeciesImageUrl(getSpeciesImageUrl(result.species));
        
        // Store all detected species
        if (result.all_species && result.all_species.length > 0) {
          console.log('🦇 Multiple species detected:', result.all_species);
          setAllSpecies(result.all_species);
        }
        
        // Store call parameters if available
        if (result.call_parameters) {
          console.log('📊 Call parameters received:', result.call_parameters);
          setCallParameters(result.call_parameters);
        } else {
          console.log('⚠️ No call parameters in re-prediction response');
        }
        
        // Store metadata if available
        if (result.metadata) {
          console.log('📋 Metadata received:', result.metadata);
          setGuanoMetadata(result.metadata);
        }
        
        // Save to Firebase with date and frequency
        const serverId = `server${serverNum}`;
        const clientId = `client${clientNum}`;
        const { savePrediction } = await import('../firebase');
        const date = '15/08/2024'; // Default date (can be improved with actual data)
        const frequency = '45 kHz'; // Default frequency
        await savePrediction(serverId, clientId, batId, result.species, result.confidence || 0, date, frequency, result.all_species);
        console.log('💾 Saved to Firebase');
      } else {
        setSpeciesPredictionError(result.message || 'Failed to predict species');
        setPredictedSpecies('Unknown species');
        setSpeciesImageUrl(getSpeciesImageUrl('Unknown_species'));
      }
    } catch (err) {
      console.error('❌ Error during re-prediction:', err);
      setSpeciesPredictionError(err instanceof Error ? err.message : 'Prediction error occurred');
      setPredictedSpecies('Unknown species');
      setSpeciesImageUrl(getSpeciesImageUrl('Unknown_species'));
    } finally {
      setSpeciesPredicting(false);
    }
  };

  console.log('BatDetailsPage - Rendering with:', {
    batId,
    loading,
    navigationState,
    isExpanded,
    sensorData,
    spectrogramUrl,
    cameraUrl,
    predictedSpecies,
    speciesImageUrl
  });

  // Sample bat data
  const batData = {
    id: batId ? `BAT${batId}` : 'BAT001',
    species: predictedSpecies || 'Pipistrellus pipistrellus',
    location: 'Kolar',
    date: '15/08/2024',
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50/80 to-blue-50/30 relative">
        <NavigationMenu />
        <div className={`bg-gradient-to-r from-emerald-700 via-teal-600 to-emerald-700 shadow-lg transition-all duration-300 ${isExpanded ? 'ml-64' : 'ml-16'}`}>
          <div className="max-w-7xl mx-auto px-4 py-4 h-16 flex items-center">
            <button
              onClick={() => navigate(-1)}
              className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors mr-4"
            >
              <ArrowLeft className="w-6 h-6 text-white" />
            </button>
            <h1 className="text-lg font-semibold text-white">BAT ID: {batData.id}</h1>
          </div>
        </div>
        <div className={`max-w-7xl mx-auto px-4 py-8 transition-all duration-300 ${isExpanded ? 'ml-64' : 'ml-16'}`}>
          <div className="flex items-center justify-center h-64">
            <div className="flex items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
              <span className="text-lg text-gray-600">Loading BAT data...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/80 to-blue-50/30 relative">
      <NavigationMenu />
      
      {/* Header with back button */}
      <div className={`bg-gradient-to-r from-emerald-700 via-teal-600 to-emerald-700 shadow-lg transition-all duration-300 ${isExpanded ? 'ml-64' : 'ml-16'}`}>
        <div className="max-w-7xl mx-auto px-4 py-4 h-16 flex items-center">
          <button
            onClick={() => navigate(-1)}
            className="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors mr-4"
          >
            <ArrowLeft className="w-6 h-6 text-white" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-white">BAT ID: {batData.id}</h1>
            {navigationState && (
              <p className="text-sm text-emerald-100">
                {navigationState.serverName} → {navigationState.clientName}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={`max-w-7xl mx-auto px-4 py-8 transition-all duration-300 ${isExpanded ? 'ml-64' : 'ml-16'}`}>
        
        {/* Basic Information and Species Photo */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Basic Information Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 min-h-64 hover:shadow-lg hover:border-emerald-300 transition-all duration-300 hover:scale-[1.02]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-emerald-600">Basic Information</h3>
              {speciesPredicting && (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                  <span className="text-xs text-emerald-600">Predicting...</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Species:</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-900 font-medium">{predictedSpecies || 'Loading...'}</span>
                  {predictedSpecies && speciesConfidence > 0 && (
                    <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded">
                      {speciesConfidence.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
              {speciesPredictionError && (
                <div className="flex items-start gap-2 text-xs text-orange-600 bg-orange-50 p-2 rounded">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>{speciesPredictionError}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Scientific Name:</span>
                <span className="text-sm text-gray-900 italic">{predictedSpecies || 'Unknown'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">BAT ID:</span>
                <span className="text-sm text-blue-600 font-mono">{batData.id}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Location:</span>
                <span className="text-sm text-gray-900">
                  {guanoMetadata?.latitude && guanoMetadata?.longitude 
                    ? `${guanoMetadata.latitude}, ${guanoMetadata.longitude}`
                    : batData.location}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Date:</span>
                <span className="text-sm text-gray-900">{guanoMetadata?.timestamp || batData.date}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Frequency:</span>
                <span className="text-sm text-gray-900">{callParameters?.peak_frequency ? `${callParameters.peak_frequency} kHz` : 'N/A'}</span>
              </div>
              
              {/* Call Parameters Section */}
              {callParameters && Object.keys(callParameters).length > 0 ? (
                <>
                  <div className="border-t pt-2 mt-2">
                    <h4 className="text-xs font-semibold text-emerald-600 mb-2">Call Parameters</h4>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Start Frequency:</span>
                    <span className="text-xs text-gray-900">{callParameters.start_frequency} kHz</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">End Frequency:</span>
                    <span className="text-xs text-gray-900">{callParameters.end_frequency} kHz</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Peak Frequency:</span>
                    <span className="text-xs text-gray-900">{callParameters.peak_frequency} kHz</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Bandwidth:</span>
                    <span className="text-xs text-gray-900">{callParameters.bandwidth} kHz</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Call Duration:</span>
                    <span className="text-xs text-gray-900">{callParameters.pulse_duration} ms</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Pulse Count:</span>
                    <span className="text-xs text-gray-900">{callParameters.pulse_count}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Sonotype:</span>
                    <span className="text-xs text-gray-900 uppercase">{callParameters.shape}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Intensity:</span>
                    <span className="text-xs text-gray-900">{callParameters.intensity?.toFixed(1) || 0} dB</span>
                  </div>
                </>
              ) : (
                <div className="border-t pt-2 mt-2">
                  <p className="text-xs text-gray-500 italic">Call parameters not available</p>
                </div>
              )}
            </div>
          </div>

          {/* Species Photo Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 min-h-96 hover:shadow-lg hover:border-emerald-300 transition-all duration-300 hover:scale-[1.02]">
            <h3 className="text-base font-semibold mb-3 text-emerald-600">Species Photo</h3>
            <div className="h-80 bg-gray-100 rounded-lg flex flex-col items-center justify-center overflow-hidden">
              {speciesImageUrl ? (
                <img 
                  src={speciesImageUrl} 
                  alt={predictedSpecies || 'Species'} 
                  className="w-full h-full object-contain rounded-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const fallback = (e.target as HTMLImageElement).nextElementSibling;
                    if (fallback) fallback.classList.remove('hidden');
                  }}
                />
              ) : (
                <div className="flex flex-col items-center">
                  <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mb-2" />
                  <span className="text-sm text-gray-600">Loading species image...</span>
                </div>
              )}
              <div className="hidden flex-col items-center">
                <span className="text-4xl mb-1">🦇</span>
                <p className="text-sm text-center text-gray-600">{predictedSpecies || 'Unknown species'}</p>
                <p className="text-xs text-center text-gray-500 mt-1">Species photo not available</p>
              </div>
            </div>
          </div>
        </div>

        {/* Multi-Species Detection Section */}
        {allSpecies && allSpecies.length > 0 && (
          <div className="mb-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-lg hover:border-emerald-300 transition-all duration-300">
              <h3 className="text-base font-semibold mb-3 text-emerald-600">
                Detected Species ({allSpecies.length})
              </h3>
              <div className="space-y-4">
                {allSpecies.map((species, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 hover:border-emerald-300 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center justify-center w-8 h-8 bg-emerald-100 text-emerald-700 rounded-full text-sm font-bold">
                          {index + 1}
                        </span>
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">{species.species}</h4>
                          <p className="text-xs text-gray-500">Rank {species.rank}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-lg font-bold text-emerald-600">{species.confidence.toFixed(1)}%</span>
                        <p className="text-xs text-gray-500">Confidence</p>
                      </div>
                    </div>
                    
                    {/* Call Parameters for this species */}
                    {callParameters && index === 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-200">
                        <h5 className="text-xs font-semibold text-gray-700 mb-2">Call Parameters</h5>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                          <div>
                            <span className="text-gray-600">Start Freq:</span>
                            <span className="ml-1 font-medium">{callParameters.start_frequency} kHz</span>
                          </div>
                          <div>
                            <span className="text-gray-600">End Freq:</span>
                            <span className="ml-1 font-medium">{callParameters.end_frequency} kHz</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Peak Freq:</span>
                            <span className="ml-1 font-medium">{callParameters.peak_frequency} kHz</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Bandwidth:</span>
                            <span className="ml-1 font-medium">{callParameters.bandwidth} kHz</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Duration:</span>
                            <span className="ml-1 font-medium">{callParameters.pulse_duration} ms</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Pulses:</span>
                            <span className="ml-1 font-medium">{callParameters.pulse_count}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Sonotype:</span>
                            <span className="ml-1 font-medium uppercase">{callParameters.shape}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Intensity:</span>
                            <span className="ml-1 font-medium">{callParameters.intensity?.toFixed(1) || 0} dB</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Three Column Layout: Camera | Spectrogram+Audio | Environmental */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Left Column - Camera Image Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-lg hover:border-emerald-300 transition-all duration-300 hover:scale-[1.02] flex flex-col h-[480px]">
            <h3 className="text-base font-semibold mb-3 text-emerald-600">Camera Image</h3>
            <div className="flex-1 bg-gray-100 rounded-lg flex flex-col items-center justify-center overflow-hidden">
              {cameraUrl ? (
                <img 
                  src={cameraUrl} 
                  alt="Camera Image" 
                  className="w-full h-full object-contain rounded-lg"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    (e.target as HTMLImageElement).nextElementSibling!.classList.remove('hidden');
                  }}
                />
              ) : (
                <div className="flex flex-col items-center">
                  <span className="text-4xl mb-1">📷</span>
                  <p className="text-sm text-center text-gray-600">No camera image available</p>
                </div>
              )}
              <div className="hidden flex-col items-center">
                <span className="text-4xl mb-1">❌</span>
                <p className="text-sm text-center text-gray-600">Failed to load camera image</p>
              </div>
            </div>
          </div>

          {/* Middle Column - Spectrogram (75%) + Audio (25%) */}
          <div className="flex flex-col gap-3 h-[480px]">
            {/* Spectrogram - Takes majority of space */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-lg hover:border-emerald-300 transition-all duration-300 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-emerald-600">Spectrogram</h3>
                <div className="flex items-center gap-1">
                  <SlidersHorizontal className="w-3 h-3 text-gray-500" />
                </div>
              </div>
              
              {/* Spectrogram Image - Fills available space */}
              <div className="flex-1 bg-gray-900 rounded-lg flex items-center justify-center overflow-hidden mb-2 min-h-0">
                {spectrogramUrl ? (
                  <img 
                    src={spectrogramUrl} 
                    alt="Spectrogram" 
                    className="w-full h-full object-contain rounded-lg"
                    style={{
                      filter: `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`,
                      transition: 'filter 0.2s ease'
                    }}
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      (e.target as HTMLImageElement).nextElementSibling!.classList.remove('hidden');
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center">
                    <span className="text-3xl mb-1">📊</span>
                    <p className="text-xs text-center text-gray-400">Spectrogram not available</p>
                  </div>
                )}
                <div className="hidden flex-col items-center">
                  <span className="text-3xl mb-1">❌</span>
                  <p className="text-xs text-center text-gray-400">Not available</p>
                </div>
              </div>
              
              {/* Minimal Controls */}
              {spectrogramUrl && (
                <div className="space-y-1 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 w-12">Bright</span>
                    <input type="range" min="50" max="200" value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} className="flex-1 h-1" />
                    <span className="text-[10px] text-gray-500 w-6">{brightness}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 w-12">Contrast</span>
                    <input type="range" min="50" max="200" value={contrast} onChange={(e) => setContrast(Number(e.target.value))} className="flex-1 h-1" />
                    <span className="text-[10px] text-gray-500 w-6">{contrast}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500 w-12">Saturate</span>
                    <input type="range" min="0" max="200" value={saturation} onChange={(e) => setSaturation(Number(e.target.value))} className="flex-1 h-1" />
                    <span className="text-[10px] text-gray-500 w-6">{saturation}%</span>
                  </div>
                  <button onClick={() => { setBrightness(100); setContrast(100); setSaturation(100); }} className="text-[10px] text-emerald-600 hover:text-emerald-700">Reset</button>
                </div>
              )}
            </div>

            {/* Audio - Compact fixed height */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 hover:shadow-lg hover:border-emerald-300 transition-all duration-300 flex-shrink-0 h-[100px]">
              <h3 className="text-sm font-semibold mb-2 text-emerald-600">Audio</h3>
              {audioUrl ? (
                <div className="space-y-2">
                  <audio controls className="w-full h-8" preload="metadata">
                    <source src={audioUrl} type="audio/wav" />
                  </audio>
                  <div className="flex gap-2">
                    <a href={audioUrl} download="audio.wav" className="flex-1 bg-emerald-600 text-white px-2 py-1.5 rounded text-[10px] font-medium hover:bg-emerald-700 flex items-center justify-center gap-1">
                      <Volume2 className="w-3 h-3" /> Download
                    </a>
                    <div className="text-[10px] text-gray-500 flex items-center gap-2">
                      <span>384kHz</span>
                      <span>WAV</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-12">
                  <p className="text-xs text-gray-500">No audio available</p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Environmental Data */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 hover:shadow-lg hover:border-emerald-300 transition-all duration-300 hover:scale-[1.02] flex flex-col h-[480px]">
            <h3 className="text-base font-semibold mb-4 text-emerald-600">Environmental Data</h3>
            {sensorLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                  <span className="text-sm text-gray-600">Loading...</span>
                </div>
              </div>
            ) : sensorError ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-gray-600">{sensorError}</span>
                </div>
              </div>
            ) : sensorData ? (
              <div className="flex-1 flex flex-col justify-center space-y-4">
                {/* Temperature */}
                <div className="bg-gradient-to-r from-red-50 to-orange-50 p-3 rounded-lg border border-red-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🌡️</span>
                      <span className="text-sm font-medium text-gray-700">Temperature</span>
                    </div>
                    <span className="text-lg font-bold text-red-600">
                      {sensorData.temperature > 0 ? `${sensorData.temperature}°C` : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Humidity */}
                <div className="bg-gradient-to-r from-blue-50 to-cyan-50 p-3 rounded-lg border border-blue-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">💧</span>
                      <span className="text-sm font-medium text-gray-700">Humidity</span>
                    </div>
                    <span className="text-lg font-bold text-blue-600">
                      {sensorData.humidity > 0 ? `${sensorData.humidity}%` : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Pressure */}
                <div className="bg-gradient-to-r from-purple-50 to-indigo-50 p-3 rounded-lg border border-purple-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🌬️</span>
                      <span className="text-sm font-medium text-gray-700">Pressure</span>
                    </div>
                    <span className="text-lg font-bold text-purple-600">
                      {sensorData.pressure > 0 ? `${sensorData.pressure} hPa` : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Light Level */}
                <div className="bg-gradient-to-r from-yellow-50 to-amber-50 p-3 rounded-lg border border-yellow-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">☀️</span>
                      <span className="text-sm font-medium text-gray-700">Light Level</span>
                    </div>
                    <span className="text-lg font-bold text-amber-600">
                      {sensorData.lightLevel > 0 ? `${sensorData.lightLevel} lux` : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center">
                  <AlertCircle className="w-8 h-8 text-gray-400 mb-2" />
                  <span className="text-sm text-gray-600">No environmental data available</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Guano Metadata and Spectrogram Analysis */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Guano Metadata Card */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-lg hover:border-emerald-300 transition-all duration-300 hover:scale-[1.02]">
            <h3 className="text-lg font-semibold mb-6 text-emerald-600 flex items-center gap-2">
              <span className="text-xl">📋</span>
              Guano Metadata
            </h3>
            {guanoMetadata && Object.keys(guanoMetadata).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Left Column */}
                <div className="space-y-3">
                  <div className="border-l-4 border-blue-400 pl-4">
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-500 uppercase tracking-wide">GUANO Version</span>
                      <span className="text-sm text-gray-900 font-mono font-semibold">{guanoMetadata.guano_version || guanoMetadata['GUANO|Version'] || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="border-l-4 border-green-400 pl-4">
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Species</span>
                      <span className="text-sm text-gray-900 font-semibold">{guanoMetadata.species || predictedSpecies || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="border-l-4 border-purple-400 pl-4">
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Location</span>
                      <span className="text-sm text-gray-900 font-semibold">
                        {guanoMetadata.latitude && guanoMetadata.longitude 
                          ? `${guanoMetadata.latitude}, ${guanoMetadata.longitude}`
                          : batData.location}
                      </span>
                    </div>
                  </div>
                  <div className="border-l-4 border-teal-400 pl-4">
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Temperature</span>
                      <span className="text-sm text-gray-900 font-semibold">{guanoMetadata.temperature || sensorData?.temperature ? `${sensorData?.temperature || guanoMetadata.temperature}°C` : 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Right Column */}
                <div className="space-y-3">
                  <div className="border-l-4 border-orange-400 pl-4">
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Timestamp</span>
                      <span className="text-sm text-gray-900 font-semibold">{guanoMetadata.timestamp || batData.date}</span>
                    </div>
                  </div>
                  <div className="border-l-4 border-red-400 pl-4">
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Filter HP</span>
                      <span className="text-sm text-gray-900 font-semibold">{guanoMetadata.filter_hp || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="border-l-4 border-indigo-400 pl-4">
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Sample Rate</span>
                      <span className="text-sm text-gray-900 font-semibold">{guanoMetadata.sample_rate || '384kHz'}</span>
                    </div>
                  </div>
                  <div className="border-l-4 border-pink-400 pl-4">
                    <div className="flex flex-col">
                      <span className="text-xs text-gray-500 uppercase tracking-wide">Make/Model</span>
                      <span className="text-sm text-gray-900 font-semibold">
                        {guanoMetadata.make || guanoMetadata.model 
                          ? `${guanoMetadata.make || ''} ${guanoMetadata.model || ''}`.trim()
                          : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-40 text-gray-500">
                <AlertCircle className="w-8 h-8 mb-2 text-gray-400" />
                <p className="text-sm">No metadata available</p>
                <p className="text-xs mt-1">GUANO metadata not found in audio file</p>
              </div>
            )}
          </div>

          {/* Spectrogram Analysis Card - Now uses real call parameters */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-lg hover:border-emerald-300 transition-all duration-300 hover:scale-[1.02]">
            <h3 className="text-base font-semibold mb-4 text-emerald-600">Spectrogram Analysis</h3>
            {callParameters && Object.keys(callParameters).length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Species Identification */}
                <div className="text-center">
                  <div className="relative mb-2">
                    <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-1">
                      <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">✓</span>
                      </div>
                    </div>
                    <div className="text-lg font-bold text-blue-600">{speciesConfidence > 0 ? `${speciesConfidence.toFixed(0)}%` : 'N/A'}</div>
                  </div>
                  <div className="text-xs text-gray-600">Species Confidence</div>
                </div>

                {/* Peak Frequency */}
                <div className="text-center">
                  <div className="relative mb-2">
                    <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-1">
                      <div className="w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">♪</span>
                      </div>
                    </div>
                    <div className="text-lg font-bold text-purple-600">{callParameters.peak_frequency ? `${callParameters.peak_frequency}kHz` : 'N/A'}</div>
                  </div>
                  <div className="text-xs text-gray-600">Peak Frequency</div>
                </div>

                {/* Call Duration */}
                <div className="text-center">
                  <div className="relative mb-2">
                    <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-1">
                      <div className="w-5 h-5 bg-orange-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">⏱</span>
                      </div>
                    </div>
                    <div className="text-lg font-bold text-orange-600">{callParameters.pulse_duration ? `${callParameters.pulse_duration}ms` : 'N/A'}</div>
                  </div>
                  <div className="text-xs text-gray-600">Call Duration</div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-32 text-gray-500">
                <AlertCircle className="w-8 h-8 mb-2 text-gray-400" />
                <p className="text-sm">No call parameters</p>
                <p className="text-xs mt-1">Audio analysis data not available</p>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-end space-y-3 sm:space-y-0 sm:space-x-3">
          <button className="w-full sm:w-auto px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors">
            Export Data
          </button>
          <button className="w-full sm:w-auto px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors">
            Generate Report
          </button>
        </div>

      </div>
    </div>
  );
};

export default BatDetailsPage;