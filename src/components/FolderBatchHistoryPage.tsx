import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronDown, ChevronUp, Loader2, Folder } from 'lucide-react';
import { NavigationMenu } from './NavigationMenu';
import { useMenu } from '../context/MenuContext';
import { listBatFolders, batchProcessFolder, FolderListItem, BatchAudioResult } from '../services/api';

interface FolderWithResults extends FolderListItem {
  isExpanded: boolean;
  isLoading: boolean;
  results?: BatchAudioResult[];
}

export function FolderBatchHistoryPage() {
  const navigate = useNavigate();
  const { isExpanded } = useMenu();

  const [folders, setFolders] = useState<FolderWithResults[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalSearch, setGlobalSearch] = useState('');

  useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = async () => {
    try {
      setLoading(true);
      const response = await listBatFolders();
      
      if (response.success) {
        const foldersWithState = response.folders.map(folder => ({
          ...folder,
          isExpanded: false,
          isLoading: false
        }));
        setFolders(foldersWithState);
      }
    } catch (error) {
      console.error('Error loading folders:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleFolder = async (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    // If already expanded, just collapse
    if (folder.isExpanded) {
      setFolders(prev => prev.map(f => 
        f.id === folderId ? { ...f, isExpanded: false } : f
      ));
      return;
    }

    // If not loaded yet, fetch batch results
    if (!folder.results) {
      setFolders(prev => prev.map(f => 
        f.id === folderId ? { ...f, isLoading: true } : f
      ));

      try {
        const result = await batchProcessFolder(
          folder.server_num,
          folder.client_num,
          folder.timestamp
        );

        if (result.success) {
          setFolders(prev => prev.map(f => 
            f.id === folderId 
              ? { ...f, results: result.results, isExpanded: true, isLoading: false }
              : f
          ));
        }
      } catch (error) {
        console.error('Error processing folder:', error);
        setFolders(prev => prev.map(f => 
          f.id === folderId ? { ...f, isLoading: false } : f
        ));
      }
    } else {
      // Already loaded, just expand
      setFolders(prev => prev.map(f => 
        f.id === folderId ? { ...f, isExpanded: true } : f
      ));
    }
  };

  const handleFolderClick = (folder: FolderListItem) => {
    navigate(`/folder/${folder.server_num}/${folder.client_num}/${folder.timestamp}`);
  };

  const filteredFolders = folders.filter(folder => {
    const q = globalSearch.toLowerCase();
    return (
      folder.name.toLowerCase().includes(q) ||
      folder.server_num.includes(q) ||
      folder.client_num.includes(q)
    );
  });

  const renderSpeciesBadges = (audio: BatchAudioResult) => {
    const topFive = audio.top_species.slice(0, 5);
    const remaining = audio.species_count - 5;

    return (
      <div className="flex flex-wrap gap-2">
        {topFive.map((species, idx) => (
          <div
            key={idx}
            className="px-3 py-1 bg-cyan-600/20 border border-cyan-500/30 rounded-full text-xs"
          >
            <span className="font-semibold text-cyan-300">{species.species}</span>
            <span className="text-gray-400 ml-2">{species.confidence.toFixed(1)}%</span>
          </div>
        ))}
        {remaining > 0 && (
          <div className="w-8 h-8 bg-cyan-600 rounded-full flex items-center justify-center text-xs font-bold">
            +{remaining}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <NavigationMenu />
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <Loader2 className="w-16 h-16 animate-spin mx-auto mb-4 text-cyan-400" />
            <p className="text-xl">Loading folders...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <NavigationMenu />
      
      <main className={`transition-all duration-300 ${isExpanded ? 'ml-64' : 'ml-20'} p-8`}>
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent mb-4">
            Batch Audio Folders
          </h1>
          <p className="text-gray-400">
            {folders.length} folder{folders.length !== 1 ? 's' : ''} found
          </p>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search folders by name, server, or client..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-slate-800/50 border-2 border-slate-700 rounded-xl focus:border-cyan-500 focus:outline-none text-white placeholder-gray-400 transition"
            />
          </div>
        </div>

        {/* Folders List */}
        <div className="space-y-4">
          {filteredFolders.map((folder) => (
            <div
              key={folder.id}
              className="bg-slate-800/50 border-2 border-slate-700 rounded-xl overflow-hidden hover:border-cyan-500/50 transition"
            >
              {/* Folder Header */}
              <div className="flex items-center justify-between p-4">
                <div 
                  className="flex items-center gap-4 flex-1 cursor-pointer"
                  onClick={() => handleFolderClick(folder)}
                >
                  <Folder className="w-6 h-6 text-cyan-400" />
                  <div>
                    <h3 className="text-lg font-bold text-white">{folder.name}</h3>
                    <p className="text-sm text-gray-400">
                      Server {folder.server_num} • Client {folder.client_num} • {new Date(folder.modified_date || Date.now()).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFolder(folder.id);
                  }}
                  disabled={folder.isLoading}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg font-semibold transition flex items-center gap-2"
                >
                  {folder.isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : folder.isExpanded ? (
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
              </div>

              {/* Expanded Audio Files */}
              {folder.isExpanded && folder.results && (
                <div className="border-t border-slate-700">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-900/50">
                        <tr className="border-b border-slate-700">
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase">File Name</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Top 3 Species</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Peak Freq</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Duration</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-400 uppercase">Intensity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {folder.results.map((audio) => (
                          <tr
                            key={audio.file_id}
                            className="border-b border-slate-700 hover:bg-slate-700/30 transition cursor-pointer"
                            onClick={() => handleFolderClick(folder)}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-white">{audio.file_name}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {renderSpeciesBadges(audio)}
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-cyan-300 font-semibold">
                                {audio.call_parameters?.peak_frequency
                                  ? `${audio.call_parameters.peak_frequency.toFixed(1)} kHz`
                                  : 'N/A'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-white">
                                {audio.duration.toFixed(2)}s
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-sm text-white">
                                {audio.call_parameters?.intensity
                                  ? `${audio.call_parameters.intensity.toFixed(1)} dB`
                                  : 'N/A'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {filteredFolders.length === 0 && (
          <div className="text-center py-12 text-gray-400">
            No folders found matching your search criteria
          </div>
        )}
      </main>
    </div>
  );
}

export default FolderBatchHistoryPage;
