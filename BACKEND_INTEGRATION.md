# Frontend-Backend Integration Guide

## ✅ Backend Deployed on Azure

**Backend URL:** `https://bcitbackend1-drcveyacfxadeffs.koreacentral-01.azurewebsites.net`

**API Base URL:** `https://bcitbackend1-drcveyacfxadeffs.koreacentral-01.azurewebsites.net/api`

## 📝 Updated Files

### Environment Configuration:
- **`.env`** - Default config (Azure backend)
- **`.env.production`** - Production config (Azure backend)
- **`.env.local`** - Local development (localhost)

### Service Files Updated:
1. **`src/services/api.ts`** - Main API service
2. **`src/services/folderPredictions.ts`** - Folder predictions
3. **`src/services/standalonePredictions.ts`** - Standalone predictions

## 🔗 API Endpoints Available

### Core Endpoints:
- **GET** `/` - API information and status
- **GET** `/api/health` - Health check
- **GET** `/api/folders/list` - List all bat folders

### Bat Operations:
- **GET** `/api/bat/{bat_id}/files` - Get files for a bat
- **GET/POST** `/api/predict/{bat_id}` - Get/run prediction for bat
- **GET** `/api/file/{file_id}` - Download file
- **GET** `/api/species-image/{species_name}` - Get species image

### Folder Operations:
- **POST** `/api/folder/files` - Get folder files with details
- **POST** `/api/folder/audio-with-predictions` - Get audio files with predictions
- **POST** `/api/batch/folder` - Batch predict folder

### Audio Prediction:
- **POST** `/api/audio/predict` - Predict uploaded audio file

### Standalone:
- **GET** `/api/standalone/folders/{standalone_num}` - Get standalone folders
- **POST** `/api/standalone/folder/files` - Get standalone folder files
- **POST** `/api/standalone/audio/predict` - Predict standalone audio

## 🚀 Deployment

### Development (Local Backend):
```bash
# Use local backend
npm run dev
# or
VITE_API_URL=http://localhost:5000/api npm run dev
```

### Production (Azure Backend):
```bash
# Build with production config
npm run build

# The built files will use Azure backend automatically
```

### Testing:
```bash
# Test API connection
curl https://bcitbackend1-drcveyacfxadeffs.koreacentral-01.azurewebsites.net/api/health
```

## 🔧 CORS Configuration

Backend accepts requests from:
- `http://localhost:5173`
- `http://localhost:5174`
- `http://localhost:5175`
- `http://localhost:3000`
- `https://frontend-ten-eta-28.vercel.app`
- `https://*.vercel.app`
- `https://frontend-3scf.vercel.app`
- `https://*.azurestaticapps.net`

If deploying frontend to a new domain, update backend CORS settings in `app.py`.

## ✨ Features Available

### ML Model: ✅ Available
- Bat species classification using EfficientNet
- Audio analysis and spectrogram generation
- Call parameter extraction

### Google Drive: ✅ Configured
- Initialize on first use (lazy loading)
- Requires environment variables:
  - `CLIENT_SECRETS_JSON`
  - `CREDENTIALS_JSON`

## 📦 Environment Variables

### Frontend (.env.production):
```env
VITE_API_URL=https://bcitbackend1-drcveyacfxadeffs.koreacentral-01.azurewebsites.net/api
```

### Frontend (.env.local):
```env
VITE_API_URL=http://localhost:5000
```

## 🎯 Next Steps

1. ✅ Backend configured and deployed
2. ✅ Frontend updated to use Azure backend
3. ⏭️ Test frontend build with production backend
4. ⏭️ Deploy frontend to hosting (Vercel/Azure Static Web Apps)
5. ⏭️ Add frontend URL to backend CORS if needed

## 🔐 Security Notes

- Google Drive credentials are set via Azure App Settings (not in code)
- Firebase credentials should be configured in frontend
- API does not require authentication currently (add if needed)

## 📞 Support

Backend Repository: https://github.com/NikhilBakale/wifibackend
Backend Logs: Azure Portal → bcitbackend1 → Log Stream
