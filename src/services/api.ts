// API service for backend communication
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://bcitbackend1-drcveyacfxadeffs.koreacentral-01.azurewebsites.net';
const API_URL = `${API_BASE_URL}/api`;

console.log('🔧 API Configuration:', {
  API_BASE_URL,
  API_URL,
  VITE_API_URL: import.meta.env.VITE_API_URL,
  NODE_ENV: import.meta.env.MODE
});

export interface BatFile {
  id: string;
  name: string;
  mimeType: string;
  downloadUrl: string;
  modifiedDate: string;
}

export interface BatFilesResponse {
  success: boolean;
  message?: string;
  folder_name?: string;
  folder_id?: string;
  files?: {
    spectrogram: BatFile | null;
    camera: BatFile | null;
    sensor: BatFile | null;
    audio: BatFile | null;
    other: BatFile[];
  };
}

export interface BatFolder {
  id: string;
  name: string;
  modifiedDate: string;
  serverNum: string;
  clientNum: string;
  batId: string;
}

export interface BatFoldersResponse {
  success: boolean;
  total_folders: number;
  folders: BatFolder[];
}

/**
 * Fetch all BAT folders from Google Drive
 */
export const fetchAllBatFolders = async (): Promise<BatFoldersResponse> => {
  try {
    const response = await fetch(`${API_URL}/debug/folders`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // Parse folder names to extract server, client, and BAT ID info
    const parsedFolders: BatFolder[] = data.folders.map((folder: any) => {
      const match = folder.name.match(/SERVER(\d+)_CLIENT(\d+)_(\d+)/);
      if (match) {
        return {
          id: folder.id,
          name: folder.name,
          modifiedDate: folder.modifiedDate,
          serverNum: match[1],
          clientNum: match[2],
          batId: match[3]
        };
      }
      return null;
    }).filter(Boolean);
    
    return {
      success: data.success,
      total_folders: parsedFolders.length,
      folders: parsedFolders
    };
  } catch (error) {
    console.error('Error fetching BAT folders:', error);
    return {
      success: false,
      total_folders: 0,
      folders: []
    };
  }
};

/**
 * Fetch files for a specific BAT ID
 */
export const fetchBatFiles = async (
  batId: string,
  serverNum: string,
  clientNum: string
): Promise<BatFilesResponse> => {
  try {
    const response = await fetch(
      `${API_URL}/bat/${batId}/files?server=${serverNum}&client=${clientNum}`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching bat files:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

/**
 * Get the URL for a specific file
 */
export const getFileUrl = (fileId: string, fileName: string): string => {
  return `${API_URL}/file/${fileId}?name=${encodeURIComponent(fileName)}`;
};

/**
 * Health check for backend service
 */
export const checkBackendHealth = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${API_URL}/health`);
    const data = await response.json();
    return data.success === true;
  } catch (error) {
    console.error('Backend health check failed:', error);
    return false;
  }
};

/**
 * Predict bat species from spectrogram in Google Drive
 */
export interface PredictionResponse {
  success: boolean;
  species?: string;
  confidence?: number;
  bat_id?: string;
  folder?: string;
  message?: string;
  all_species?: Array<{species: string; confidence: number; rank: number}>;
  species_count?: number;
  call_parameters?: CallParameters;
  metadata?: AudioMetadata;
  mode?: string;
}

export const predictSpecies = async (
  batId: string,
  serverNum: string,
  clientNum: string
): Promise<PredictionResponse> => {
  try {
    // Strip "BAT" prefix if present (e.g., "BAT825" -> "825")
    const cleanBatId = batId.replace(/^BAT/i, '');
    
    const url = `${API_URL}/predict/${cleanBatId}?server=${serverNum}&client=${clientNum}`;
    console.log('🔗 Calling predict endpoint:', url);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data: PredictionResponse = await response.json();
    console.log('✅ Prediction response:', data);
    return data;
  } catch (error) {
    console.error('Error predicting species:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

/**
 * Get species image URL
 */
export const getSpeciesImageUrl = (speciesName: string): string => {
  const url = `${API_URL}/species-image/${encodeURIComponent(speciesName)}`;
  console.log('🖼️ Species image URL:', url);
  return url;
};
/**
 * Batch Folder Processing Types
 */
export interface SpeciesDetection {
  species: string;
  confidence: number;
  rank: number;
}

export interface CallParameters {
  start_frequency?: number;
  end_frequency?: number;
  minimum_frequency?: number;
  maximum_frequency?: number;
  peak_frequency?: number;
  bandwidth?: number;
  call_length?: number;
  call_distance?: number;
  pulse_count?: number;
  intensity?: number;
  sonotype?: string;
  frequency_modulation_rate?: number;
  characteristic_frequency?: number;
  knee_frequency?: number;
  slope?: number;
}

export interface AudioMetadata {
  timestamp?: string;
  latitude?: string;
  longitude?: string;
  temperature?: string;
  humidity?: string;
  species?: string;
  length?: string;
  sample_rate?: string;
  filter_hp?: string;
  filter_lp?: string;
  make?: string;
  model?: string;
  firmware?: string;
  note?: string;
  raw_metadata?: Record<string, string>;
}

export interface BatchAudioResult {
  file_id: string;
  file_name: string;
  all_species: SpeciesDetection[];
  top_species: SpeciesDetection[];
  species_count: number;
  predicted_species: string;
  confidence: number;
  call_parameters?: CallParameters;
  metadata?: AudioMetadata;
  duration: number;
  sample_rate: number;
  error?: string;
  success?: boolean;
}

export interface BatchFolderResponse {
  success: boolean;
  folder_name: string;
  total_files: number;
  processed: number;
  results: BatchAudioResult[];
  message?: string;
}

export interface FolderListItem {
  id: string;
  name: string;
  server_num: string;
  client_num: string;
  timestamp: string;
  modified_date: string;
}

export interface FolderListResponse {
  success: boolean;
  total_folders: number;
  folders: FolderListItem[];
  message?: string;
}

/**
 * Batch process all audio files in a folder
 */
export const batchProcessFolder = async (
  serverNum: string,
  clientNum: string,
  folderTimestamp: string
): Promise<BatchFolderResponse> => {
  try {
    const url = `${API_URL}/batch/folder`;
    console.log('🚀 Starting batch folder processing:', { serverNum, clientNum, folderTimestamp });
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        server_num: serverNum,
        client_num: clientNum,
        folder_timestamp: folderTimestamp
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data: BatchFolderResponse = await response.json();
    console.log('✅ Batch processing complete:', data);
    return data;
  } catch (error) {
    console.error('❌ Error in batch folder processing:', error);
    return {
      success: false,
      folder_name: '',
      total_files: 0,
      processed: 0,
      results: [],
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};

/**
 * List all BAT folders matching pattern SERVER*_CLIENT*_timestamp
 */
export const listBatFolders = async (): Promise<FolderListResponse> => {
  try {
    const url = `${API_URL}/folders/list`;
    console.log('📂 Fetching BAT folders list');
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data: FolderListResponse = await response.json();
    console.log('✅ Folders list retrieved:', data.total_folders, 'folders');
    return data;
  } catch (error) {
    console.error('❌ Error listing folders:', error);
    return {
      success: false,
      total_folders: 0,
      folders: [],
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
};