/**
 * STANDALONE FOLDER PREDICTIONS SERVICE
 * 
 * This is the source of truth for standalone devices:
 * 1. Loading folder audio files with cached predictions from Firebase
 * 2. Running predictions on audio files and saving to Firebase
 * 3. Ensuring all views (StandaloneCard, DataHistoryStandaloneMaximizePage, BatFolderDetailPage)
 *    use the exact same logic and Firebase paths
 * 
 * Firebase Structure:
 *   standalones/{standaloneId}/predictions/{timestamp}/{batNumber}/0,1,2...
 *   Example: standalones/standalone1/predictions/15082026_1430/1014/0/{s,c}
 * 
 * Drive Folder Format: standalone1_15082026_1430
 */

import { getStandaloneFolderPredictions, saveStandalonePrediction } from '../firebase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://bcitbackend1-drcveyacfxadeffs.koreacentral-01.azurewebsites.net';

// ============================================================================
// TYPES
// ============================================================================

export interface StandaloneFolderAudioEntry {
  file_id: string;
  file_name: string;
  size: number;
  species: Array<{ species: string; confidence: number }>;
  predicted_species: string;
  confidence: number;
  processing: boolean;
  from_cache: boolean;
  needs_prediction: boolean;
  error?: string;
}

export interface LoadStandaloneFolderArgs {
  standaloneId: string;   // Format: "standalone1" or "Standalone 1" or "1" - will be normalized
  folderName: string;     // Full folder name: "standalone1_15082026_1430"
}

export interface LoadedStandaloneFolderData {
  timestamp: string;          // Just the timestamp part: "15082026_1430"
  entries: StandaloneFolderAudioEntry[];
  standaloneNum: string;      // Just the number: "1"
}

export interface PredictStandaloneFileArgs {
  standaloneId: string;       // Format: "standalone1" or any - will be normalized
  standaloneNum: string;      // Just the number: "1"
  timestamp: string;          // Folder timestamp: "15082026_1430"
  audio: StandaloneFolderAudioEntry;
  signal?: AbortSignal;       // For cancelling requests when navigating away
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract standalone number from various formats
 * "standalone1" -> "1"
 * "Standalone 1" -> "1"
 * "1" -> "1"
 */
export const extractStandaloneNum = (input: string): string => {
  if (!input) return '1';
  const match = input.match(/(\d+)/);
  return match ? match[1] : '1';
};

/**
 * Normalize standaloneId to consistent format: "standalone1"
 */
export const normalizeStandaloneId = (input: string): string => {
  const num = extractStandaloneNum(input);
  return `standalone${num}`;
};

/**
 * Extract timestamp from standalone folder name
 * "standalone1_15082026_1430" -> "15082026_1430"
 */
export const extractStandaloneTimestamp = (folderName: string): string => {
  const parts = folderName.toLowerCase().split('_');
  // Skip "standaloneX" part
  return parts.slice(1).join('_');
};

// ============================================================================
// MAIN API FUNCTIONS
// ============================================================================

/**
 * Load folder audio files with cached predictions from Firebase.
 * 
 * This function:
 * 1. Loads existing predictions from Firebase
 * 2. Lists audio files from Google Drive
 * 3. Merges them: cached files show species immediately, new files are marked "Waiting"
 * 
 * @param args - standaloneId, folderName
 * @returns LoadedStandaloneFolderData with entries array
 */
export const loadStandaloneFolderAudioWithPredictions = async (
  args: LoadStandaloneFolderArgs
): Promise<LoadedStandaloneFolderData> => {
  const { standaloneId, folderName } = args;

  // Normalize IDs to consistent format
  const normalizedStandaloneId = normalizeStandaloneId(standaloneId);
  const standaloneNum = extractStandaloneNum(standaloneId);
  const timestamp = extractStandaloneTimestamp(folderName);

  console.log(`📂 [standalonePredictions] Loading folder: ${folderName}`);
  console.log(`   standaloneId: ${normalizedStandaloneId}, timestamp: ${timestamp}`);

  // Step 1: Load existing predictions from Firebase
  let existingPredictions: any = {};
  try {
    console.log(`🔍 [standalonePredictions] Step 1: Checking Firebase for cached predictions...`);
    existingPredictions = await getStandaloneFolderPredictions(normalizedStandaloneId, timestamp);
    const cacheCount = Object.keys(existingPredictions).length;
    console.log(`🔍 [standalonePredictions] Found ${cacheCount} cached predictions for ${timestamp}`);
    if (cacheCount > 0) {
      console.log(`🔍 [standalonePredictions] Cached files:`, Object.keys(existingPredictions));
    }
  } catch (err) {
    console.warn('[standalonePredictions] Could not load existing predictions:', err);
  }

  // Step 2: List audio files from Google Drive using standalone endpoint
  const apiUrl = `${API_BASE_URL}/api/standalone/folder/files`;
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      standalone_num: standaloneNum,
      folder_timestamp: timestamp
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to list files: ${response.status}`);
  }

  const data = await response.json();
  console.log(`📋 [standalonePredictions] Found ${data.total_files || 0} audio files in Drive`);

  // Step 3: Merge predictions with file list
  const entries: StandaloneFolderAudioEntry[] = (data.files || []).map((file: any) => {
    const existing = existingPredictions[file.file_name];
    if (existing && existing.allSpecies && existing.allSpecies.length > 0) {
      // File has cached prediction
      return {
        file_id: file.file_id,
        file_name: file.file_name,
        size: file.size || 0,
        species: existing.allSpecies,
        predicted_species: existing.species || existing.allSpecies[0]?.species || 'Unknown',
        confidence: existing.confidence || existing.allSpecies[0]?.confidence || 0,
        processing: false,
        from_cache: true,
        needs_prediction: false
      };
    }
    // File needs prediction
    return {
      file_id: file.file_id,
      file_name: file.file_name,
      size: file.size || 0,
      species: [],
      predicted_species: 'Waiting',
      confidence: 0,
      processing: false,
      from_cache: false,
      needs_prediction: true
    };
  });

  const cachedCount = entries.filter(e => e.from_cache).length;
  const waitingCount = entries.filter(e => e.needs_prediction).length;
  console.log(`✅ [standalonePredictions] Loaded ${entries.length} files (${cachedCount} cached, ${waitingCount} waiting)`);

  return {
    timestamp,
    entries,
    standaloneNum
  };
};

/**
 * Predict species for a single audio file and save to Firebase.
 * 
 * This function:
 * 1. Calls the backend /api/standalone/audio/predict endpoint
 * 2. On success, saves the prediction to Firebase
 * 3. Returns the updated StandaloneFolderAudioEntry
 * 
 * @param args - standaloneId, standaloneNum, timestamp, audio
 * @returns Updated StandaloneFolderAudioEntry with prediction results
 */
export const predictStandaloneSingleAudio = async (
  args: PredictStandaloneFileArgs
): Promise<StandaloneFolderAudioEntry> => {
  const { standaloneId, standaloneNum, timestamp, audio, signal } = args;

  // Normalize IDs
  const normalizedStandaloneId = normalizeStandaloneId(standaloneId);

  console.log(`🔬 [standalonePredictions] Predicting: ${audio.file_name}`);
  console.log(`   standaloneId: ${normalizedStandaloneId}, timestamp: ${timestamp}`);

  const predictApiUrl = `${API_BASE_URL}/api/standalone/audio/predict`;

  const response = await fetch(predictApiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_id: audio.file_id,
      file_name: audio.file_name,
      standalone_num: standaloneNum,
      folder_timestamp: timestamp
    }),
    signal // Pass abort signal for cancellation
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ [standalonePredictions] Prediction failed: ${response.status}`, errorText);
    throw new Error(`Prediction failed: ${response.status}`);
  }

  const result = await response.json();
  console.log(`📊 [standalonePredictions] Result for ${audio.file_name}:`, {
    success: result.success,
    species_count: result.species?.length || 0,
    species: result.species,
    from_cache: result.from_cache
  });

  // Save to Firebase if prediction was successful
  if (result.success && result.species && result.species.length > 0) {
    // Extract bat number from filename: "bat_1014.wav" -> "1014"
    const batIdMatch = audio.file_name.match(/bat_(\d+)/i);
    const batNumber = batIdMatch ? batIdMatch[1] : audio.file_name.replace('.wav', '');

    console.log(`💾 [standalonePredictions] Saving to Firebase: ${normalizedStandaloneId}/${timestamp}/${batNumber}`);

    try {
      await saveStandalonePrediction(
        normalizedStandaloneId,
        batNumber,
        result.species[0].species,
        result.species[0].confidence,
        new Date().toISOString(),
        result.call_parameters?.peak_freq || '',
        result.species,
        timestamp
      );
      console.log(`✅ [standalonePredictions] Saved prediction for ${audio.file_name}`);
    } catch (err) {
      console.error('[standalonePredictions] Firebase save error:', err);
    }
  }

  // Return updated entry
  const updatedEntry = {
    file_id: audio.file_id,
    file_name: audio.file_name,
    size: audio.size,
    species: result.species || [],
    predicted_species:
      result.success && result.species && result.species.length > 0
        ? result.species[0].species
        : result.success
        ? 'No species detected'
        : 'Error',
    confidence:
      result.success && result.species && result.species.length > 0
        ? result.species[0].confidence
        : 0,
    processing: false,
    from_cache: result.from_cache || false,
    needs_prediction: false,
    error: result.success ? undefined : result.message || 'Prediction failed'
  };
  
  console.log(`✅ [standalonePredictions] Returning entry:`, {
    file_name: updatedEntry.file_name,
    predicted_species: updatedEntry.predicted_species,
    species_count: updatedEntry.species.length,
    from_cache: updatedEntry.from_cache
  });
  
  return updatedEntry;
};
