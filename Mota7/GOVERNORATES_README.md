# Governorates and Cities System - Implementation Guide

## Overview
This implementation provides a comprehensive, scalable Firestore structure for managing Egyptian governorates and cities in the Mota7 application.

## Firestore Structure

### Collection: `city`
Each document represents a governorate with the following structure:
```
city/
  ├── new_valley (document)
  │   ├── name: "محافظة الوادي الجديد"
  │   ├── active: true
  │   ├── order: 1
  │   └── createdAt: Timestamp
  ├── assiut (document)
  │   ├── name: "محافظة أسيوط"
  │   ├── active: true
  │   ├── order: 2
  │   └── createdAt: Timestamp
  └── ...
```

### Subcollection: `المدن` (Cities)
Each governorate has a subcollection named `المدن` containing city documents:
```
city/assiut/المدن/
  ├── assiut_city (document)
  │   ├── name: "أسيوط"
  │   ├── active: true
  │   ├── order: 1
  │   └── createdAt: Timestamp
  ├── assiut_new (document)
  │   ├── name: "أسيوط الجديدة"
  │   ├── active: true
  │   ├── order: 2
  │   └── createdAt: Timestamp
  └── ...
```

## Components Created

### 1. Models
- **Location**: `src/app/core/models/governorate.model.ts`
- **Interfaces**:
  - `Governorate`: Governorate data structure
  - `City`: City data structure
  - `GovernorateWithCities`: Governorate with its cities
  - `CitySelection`: Selected location data

### 2. Services
- **GovernorateService** (`src/app/core/services/governorate.service.ts`)
  - `getActiveGovernorates()`: Fetch all active governorates
  - `getCitiesByGovernorate(governorateId)`: Fetch cities for a specific governorate
  - `getGovernoratesWithCities()`: Fetch governorates with their cities
  - `clearCache()`: Clear cached data

- **GovernorateSeedService** (`src/app/core/services/governorate-seed.service.ts`)
  - `seedGovernorates()`: Populate Firestore with initial data
  - `hasGovernoratesData()`: Check if data exists

### 3. UI Components
- **GovernorateCitySelectorComponent** (`src/app/shared/governorate-city-selector/`)
  - Expandable accordion-style selector
  - Glassmorphism design with dark mode support
  - RTL layout
  - Animated expand/collapse
  - Selection of entire governorate or specific city

### 4. Utilities
- **Location Display Utility** (`src/app/core/utils/governorate-city-display.util.ts`)
  - `formatLocationWithGovernorate(ad)`: Format ad location with governorate
  - `formatLocationFromSelection(selection)`: Format from selection object
  - `getShortLocationDisplay(ad)`: Get city name only

## Integration Points

### 1. Home Page
- **File**: `src/app/home/home.page.ts` & `.html`
- **Integration**: Replaced hardcoded city popover with `GovernorateCitySelectorComponent`
- **Features**: 
  - City filter for ads
  - Backward compatible with existing filtering logic

### 2. Registration Page
- **File**: `src/app/my-account/register.page.ts` & `.html`
- **Integration**: Governorate/city selector for new user registration
- **Features**:
  - Stores full selection data (governorateId, cityId, names)
  - Validates selection before registration

### 3. Edit Profile Page
- **File**: `src/app/my-account/edit-profile.page.ts` & `.html`
- **Integration**: Governorate/city selector for updating user location
- **Features**:
  - Loads existing selection from user profile
  - Updates Firestore with new selection

### 4. Admin Panel
- **Location**: `mota7-admin/src/app/pages/governorates/`
- **Features**:
  - Add/Edit/Delete governorates
  - Add/Edit/Delete cities
  - Toggle active/inactive status
  - Reorder governorates and cities
  - Real-time updates from Firebase
- **Access**: Dashboard → "إدارة المحافظات والمدن"

## Initial Data Seeding

### Method 1: Programmatically (Recommended)
Add this code to a component or service to seed the data:

```typescript
import { GovernorateSeedService } from './core/services/governorate-seed.service';

constructor(private seedService: GovernorateSeedService) {}

async seedData() {
  const hasData = await this.seedService.hasGovernoratesData();
  if (!hasData) {
    await this.seedService.seedGovernorates();
    console.log('Governorates seeded successfully!');
  } else {
    console.log('Governorates already exist.');
  }
}
```

### Method 2: Manual via Admin Panel
1. Access the admin panel at `/governorates`
2. Use the "إضافة محافظة جديدة" button to add governorates
3. Expand each governorate to add cities

## Included Governorates and Cities

### محافظة الوادي الجديد (order: 1)
- الخارجة
- الداخلة
- الفرافرة
- باريس
- بلاط

### محافظة أسيوط (order: 2)
- أسيوط
- أسيوط الجديدة
- ديروط
- القوصية
- منفلوط
- أبنوب
- الفتح
- ساحل سليم
- البداري
- صدفا
- أبو تيج
- الغنايم

### محافظة القاهرة (order: 3)
- مدينة نصر
- مصر الجديدة
- المعادي
- حلوان
- شبرا
- القاهرة الجديدة

### محافظة الجيزة (order: 4)
- الجيزة
- 6 أكتوبر
- الشيخ زايد
- الدقي
- الهرم
- بولاق الدكرور

### محافظة الإسكندرية (order: 5)
- الإسكندرية
- برج العرب
- ميامي
- سيدي بشر

## User Data Storage

When a user selects a location, the following fields are stored in their profile:
```typescript
{
  city: "أسيوط",              // City name (backward compatibility)
  governorateId: "assiut",     // Governorate document ID
  governorateName: "محافظة أسيوط", // Governorate name
  cityId: "assiut_city",       // City document ID
  isWholeGovernorate: false    // Whether entire governorate is selected
}
```

## Admin Panel Features

### Governorate Management
- **Add**: Create new governorate with name, order, and active status
- **Edit**: Modify governorate details
- **Toggle Active**: Show/hide governorate and all its cities
- **Delete**: Remove governorate and all its cities (with confirmation)
- **Reorder**: Change display order using up/down buttons

### City Management
- **Add**: Create new city within a governorate
- **Edit**: Modify city details
- **Toggle Active**: Show/hide individual city
- **Delete**: Remove city (with confirmation)
- **Reorder**: Change display order within governorate

## Real-time Updates
All changes in the admin panel are immediately reflected in the app without requiring a rebuild or redeployment. The system uses Firebase real-time listeners (`onSnapshot`) for instant updates.

## Styling
- **Glassmorphism**: Modern glass-like design with backdrop blur
- **Dark Mode**: Full support for dark theme
- **RTL**: Right-to-left layout for Arabic
- **Animations**: Smooth expand/collapse transitions
- **Responsive**: Works on all screen sizes

## Important Notes

1. **English IDs Only**: All document IDs use English characters only (e.g., `assiut`, `assiut_city`)
2. **Arabic Names**: Names are stored in Arabic in the `name` field
3. **Active Filtering**: Only items with `active: true` are shown in the app
4. **Order Field**: Display order is controlled by the `order` field
5. **Dynamic System**: No hardcoded values - everything is fetched from Firebase
6. **Backward Compatibility**: Existing `city` field is maintained for compatibility

## Testing Checklist

- [ ] Verify governorates load correctly in home page selector
- [ ] Verify cities load when governorate is expanded
- [ ] Test governorate selection (all cities)
- [ ] Test specific city selection
- [ ] Verify selection persists on page navigation
- [ ] Test registration with new governorate/city selection
- [ ] Test profile update with new selection
- [ ] Verify admin panel CRUD operations
- [ ] Test real-time updates from admin to app
- [ ] Verify active/inactive toggles work correctly
- [ ] Test reordering functionality
- [ ] Verify dark mode styling
- [ ] Test on different screen sizes

## Troubleshooting

### Governorates not loading
- Check Firebase security rules
- Verify `governorate.service.ts` is imported correctly
- Check browser console for errors

### Cities not showing for governorate
- Verify subcollection name is exactly `المدن`
- Check governorate ID matches document ID
- Ensure cities have `active: true`

### Admin panel not accessible
- Verify route is added to `app.routes.ts`
- Check user has admin permissions
- Verify Firebase authentication

### Seed not working
- Check Firebase write permissions
- Verify service is properly injected
- Check browser console for errors
