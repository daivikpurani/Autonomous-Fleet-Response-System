# Phase 6: Frontend UI & Operator Dashboard

## Overview

Phase 6 implements the React-based operator dashboard for monitoring vehicles, managing alerts, and viewing incident details. This phase completes the full-stack implementation of the Autonomous Fleet Response System.

## Assumptions

### Frontend Framework

**Chosen**: React 18 + TypeScript + Vite

**Rationale**:
- **Modern stack**: React 18 with hooks and functional components
- **Type safety**: TypeScript provides compile-time type checking
- **Fast development**: Vite provides fast HMR and build times
- **Ecosystem**: Rich ecosystem of React libraries
- **Industry standard**: Widely used and well-documented

### UI Architecture

**Chosen**: Component-based architecture with hooks

**Rationale**:
- **Reusability**: Components can be reused across the app
- **Separation of concerns**: Logic separated from presentation
- **Testability**: Components can be tested in isolation
- **Maintainability**: Clear component boundaries

### State Management

**Chosen**: React hooks (useState, useEffect) + WebSocket

**Rationale**:
- **Simplicity**: No need for Redux for this scale
- **Real-time updates**: WebSocket provides live updates
- **Local state**: Component-level state sufficient
- **Server state**: REST API for initial data fetch

### Map Library

**Chosen**: Mapbox GL JS (or similar)

**Rationale**:
- **2D visualization**: Suitable for vehicle position display
- **Performance**: Handles many markers efficiently
- **Customization**: Can style markers and map
- **Industry standard**: Widely used for mapping

## UI Components

### Layout Structure

**Three-Column Layout**:
- **Left Panel**: Alert list
- **Center Panel**: Map view with vehicles
- **Right Panel**: Vehicle detail + Incident panel + Action buttons

**Responsive**: Adapts to different screen sizes

### Component Hierarchy

```
App
├── Header (connection status, demo mode toggle)
├── AlertList (left panel)
│   └── AlertItem (individual alert)
├── MapView (center panel)
│   └── VehicleLayer (vehicle markers)
├── VehicleDetail (right panel, top)
├── IncidentPanel (right panel, middle)
└── ActionButtons (right panel, bottom)
```

### Core Components

#### 1. App (`App.tsx`)

**Purpose**: Main application component

**Responsibilities**:
- Manage global state (vehicles, selected vehicle, selected alert)
- Handle WebSocket connection
- Coordinate component interactions
- Fetch initial data

**State**:
- `vehicles`: List of vehicles
- `selectedVehicleId`: Currently selected vehicle
- `selectedAlert`: Currently selected alert
- `demoMode`: Demo mode enabled/disabled
- `loading`: Loading state
- `error`: Error state
- `mapCenter`: Map center coordinates

**Key Handlers**:
- `handleAlertClick(alert)`: Select alert and vehicle
- `handleVehicleClick(vehicleId)`: Select vehicle
- `handleActionComplete()`: Refresh data after action

#### 2. AlertList (`components/AlertList.tsx`)

**Purpose**: Display list of alerts

**Features**:
- Sortable by time, severity, status
- Filterable by severity, status
- Click to select alert
- Severity badges (INFO, WARNING, CRITICAL)
- Status indicators (OPEN, ACKNOWLEDGED, RESOLVED)
- Real-time updates via WebSocket

**Props**:
- `alerts`: List of alerts
- `selectedAlert`: Currently selected alert
- `onAlertClick`: Callback when alert clicked
- `vehicleIdFilter`: Optional vehicle filter

**Visual Elements**:
- Alert cards with severity color coding
- Timestamp display
- Vehicle ID display
- Rule name display
- Status badge

#### 3. MapView (`components/MapView.tsx`)

**Purpose**: Display 2D map with vehicle positions

**Features**:
- Mapbox GL map initialization
- Vehicle markers with position updates
- Click markers to select vehicle
- Center map on selected vehicle
- Zoom controls
- Real-time position updates

**Props**:
- `vehicles`: List of vehicles
- `selectedVehicleId`: Currently selected vehicle
- `onVehicleClick`: Callback when vehicle clicked
- `center`: Map center coordinates

**Visual Elements**:
- Map tiles
- Vehicle markers (color-coded by alert severity)
- Selected vehicle highlight
- Map controls (zoom, pan)

#### 4. VehicleLayer (`components/VehicleLayer.tsx`)

**Purpose**: Render vehicle markers on map

**Features**:
- Color-coded markers (green=normal, yellow=warning, red=critical)
- Marker clustering (if many vehicles)
- Click handlers
- Position updates

**Props**:
- `vehicles`: List of vehicles
- `selectedVehicleId`: Currently selected vehicle
- `onVehicleClick`: Callback when vehicle clicked

**Marker Colors**:
- **Green**: No alerts or INFO only
- **Yellow**: WARNING alerts
- **Red**: CRITICAL alerts

#### 5. VehicleDetail (`components/VehicleDetail.tsx`)

**Purpose**: Display vehicle information

**Features**:
- Vehicle ID display
- Current state (NORMAL, ALERTING, UNDER_INTERVENTION)
- Last position coordinates
- Assigned operator
- Alert count by status
- Last update timestamp

**Props**:
- `vehicle`: Vehicle object (or null)

**Visual Elements**:
- Vehicle ID header
- State badge
- Position coordinates
- Alert summary

#### 6. IncidentPanel (`components/IncidentPanel.tsx`)

**Purpose**: Display alert details and evidence

**Features**:
- Alert information (rule, severity, status)
- Feature values display
- Threshold values display
- Evidence visualization (if applicable)
- Frame indices
- Historical data (velocity, acceleration, etc.)

**Props**:
- `alert`: Alert object (or null)

**Visual Elements**:
- Alert header with severity badge
- Rule name
- Feature table
- Threshold table
- Evidence section

#### 7. ActionButtons (`components/ActionButtons.tsx`)

**Purpose**: Operator action controls

**Features**:
- Acknowledge button (enabled for OPEN alerts)
- Resolve button (enabled for ACKNOWLEDGED alerts)
- Disabled states based on alert status
- Loading states during API calls
- Success/error feedback

**Props**:
- `alert`: Alert object (or null)
- `onActionComplete`: Callback after action

**Actions**:
- **Acknowledge**: Changes status OPEN → ACKNOWLEDGED
- **Resolve**: Changes status ACKNOWLEDGED → RESOLVED

### Hooks

#### useWebSocket (`hooks/useWebSocket.ts`)

**Purpose**: Manage WebSocket connection

**Features**:
- Automatic connection/reconnection
- Connection status tracking
- Message handling
- Error handling
- Configurable reconnect delay

**API**:
```typescript
const { isConnected } = useWebSocket({
  onMessage: (message) => { ... },
  enabled: true
});
```

**Events Handled**:
- `alert_created`: Add/update alert in state
- `alert_updated`: Update alert in state
- `vehicle_updated`: Update vehicle in state
- `operator_action_created`: Log action (optional)

#### useAlerts (`hooks/useAlerts.ts`)

**Purpose**: Manage alert state and fetching

**Features**:
- Fetch alerts from API
- Filter alerts by status/severity
- Sort alerts
- Real-time updates via WebSocket

**API**:
```typescript
const { alerts, loading, error } = useAlerts({
  status: 'OPEN',
  severity: 'CRITICAL'
});
```

### Services

#### API Client (`services/api.ts`)

**Purpose**: REST API client for operator service

**Methods**:
- `getAlerts(status?, vehicleId?)`: Fetch alerts
- `getAlert(id)`: Fetch single alert
- `acknowledgeAlert(id, actor)`: Acknowledge alert
- `resolveAlert(id, actor)`: Resolve alert
- `getVehicles()`: Fetch vehicles
- `getVehicle(id)`: Fetch single vehicle
- `getActions(vehicleId?)`: Fetch actions

**Error Handling**:
- Throws `ApiError` for HTTP errors
- Includes status code and message

**Configuration**:
- Base URL from `VITE_API_BASE_URL` env var
- Default: `http://localhost:8003`

### Types

#### TypeScript Types (`types/index.ts`)

**Purpose**: Type definitions for all data structures

**Types Defined**:
- `Alert`: Alert object structure
- `Vehicle`: Vehicle object structure
- `Action`: Operator action structure
- `WebSocketMessage`: WebSocket message structure
- `AlertStatus`: Alert status enum
- `Severity`: Severity enum
- `ActionType`: Action type enum

## Real-Time Updates

### WebSocket Integration

**Connection**: `ws://localhost:8003/ws`

**Message Format**:
```typescript
{
  type: "alert_created" | "alert_updated" | "vehicle_updated" | "operator_action_created",
  data: Alert | Vehicle | Action
}
```

### Update Flow

1. **Alert Created**:
   - WebSocket receives `alert_created`
   - Add alert to state
   - Update alert list
   - Update vehicle marker color if needed

2. **Alert Updated**:
   - WebSocket receives `alert_updated`
   - Update alert in state
   - Refresh alert list
   - Update action buttons state

3. **Vehicle Updated**:
   - WebSocket receives `vehicle_updated`
   - Update vehicle position
   - Update map marker position
   - Update vehicle detail panel

## Demo Mode

### Features

**Auto-Selection**:
- Automatically selects ego vehicle when it appears
- Highlights critical alerts
- Useful for hands-free demonstration

**Toggle**:
- Checkbox in header
- Enables/disables demo mode
- State persisted in component

**Behavior**:
- When ego vehicle appears: Auto-select it
- When critical alert appears: Highlight it
- Prevents duplicate auto-selections

## Styling

### CSS Framework

**Chosen**: Custom CSS with CSS variables

**Rationale**:
- **Lightweight**: No external CSS framework
- **Customization**: Full control over styling
- **Performance**: Minimal CSS overhead

### Color Scheme

**Severity Colors**:
- **INFO**: Blue (`#3b82f6`)
- **WARNING**: Yellow (`#f59e0b`)
- **CRITICAL**: Red (`#ef4444`)

**Status Colors**:
- **OPEN**: Red badge
- **ACKNOWLEDGED**: Yellow badge
- **RESOLVED**: Green badge

**Vehicle Marker Colors**:
- **Normal**: Green
- **Warning**: Yellow
- **Critical**: Red

### Responsive Design

**Breakpoints**:
- Desktop: 3-column layout
- Tablet: 2-column layout (map + panels)
- Mobile: Stacked layout

**Adaptations**:
- Collapsible panels on mobile
- Touch-friendly buttons
- Scrollable lists

## Build & Deployment

### Development

**Start Dev Server**:
```bash
cd ui
npm install
npm run dev
```

**Port**: 5173 (Vite default)

**Hot Module Replacement**: Enabled

### Production Build

**Build**:
```bash
npm run build
```

**Output**: `dist/` directory

**Serve**:
```bash
npm run preview
```

### Environment Variables

**Variables**:
- `VITE_API_BASE_URL`: API base URL (default: `http://localhost:8003`)
- `VITE_WS_URL`: WebSocket URL (default: `ws://localhost:8003/ws`)

**Usage**:
```typescript
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const WS_URL = import.meta.env.VITE_WS_URL;
```

## What "Good" Output Looks Like

### UI Rendering

**Initial State**:
- Header shows "FleetOps Operator Dashboard"
- Connection status: Green "Connected"
- Alert list: Empty or shows existing alerts
- Map: Shows vehicles (if any)
- Vehicle detail: "No vehicle selected"

**During Replay**:
- Vehicles appear on map
- Markers move as positions update
- Alert list grows
- Real-time updates without refresh

**After Actions**:
- Alert status updates immediately
- Action buttons update state
- WebSocket broadcasts updates
- UI reflects changes

### Console Logs

**Expected**:
```
WebSocket connected
Fetching vehicles...
Vehicles loaded: 15
Alert created: sudden_deceleration for scene_0_track_42
WebSocket message received: alert_created
```

**Errors** (if any):
```
WebSocket connection failed, retrying...
API error: 404 Not Found
```

## Common Failure Modes and Fixes

### WebSocket Connection Issues

**Problem**: WebSocket not connecting
- **Fix**: Check operator service is running
- **Fix**: Verify WebSocket URL is correct
- **Fix**: Check CORS configuration
- **Fix**: Review browser console for errors

**Problem**: WebSocket disconnects frequently
- **Fix**: Check network stability
- **Fix**: Verify reconnect logic is working
- **Fix**: Check server WebSocket handler
- **Fix**: Review WebSocket timeout settings

### API Connection Issues

**Problem**: API calls fail
- **Fix**: Check operator service is running
- **Fix**: Verify API base URL is correct
- **Fix**: Check CORS configuration
- **Fix**: Review network tab in browser dev tools

**Problem**: CORS errors
- **Fix**: Verify CORS middleware is configured
- **Fix**: Check allowed origins include frontend URL
- **Fix**: Verify preflight requests are handled

### Map Rendering Issues

**Problem**: Map not displaying
- **Fix**: Check Mapbox access token (if required)
- **Fix**: Verify map container has dimensions
- **Fix**: Check map library is loaded
- **Fix**: Review map initialization code

**Problem**: Vehicle markers not appearing
- **Fix**: Check vehicles have valid positions
- **Fix**: Verify marker rendering logic
- **Fix**: Check map bounds/zoom level
- **Fix**: Review VehicleLayer component

### State Management Issues

**Problem**: State not updating
- **Fix**: Check React hooks are used correctly
- **Fix**: Verify state updates are triggered
- **Fix**: Review WebSocket message handling
- **Fix**: Check component re-renders

**Problem**: Stale data displayed
- **Fix**: Verify data fetching on mount
- **Fix**: Check WebSocket updates are applied
- **Fix**: Review state update logic
- **Fix**: Ensure proper dependency arrays in useEffect

### Build Issues

**Problem**: Build fails
- **Fix**: Check Node.js version (18+)
- **Fix**: Verify dependencies are installed
- **Fix**: Check TypeScript errors
- **Fix**: Review build configuration

**Problem**: Type errors
- **Fix**: Verify TypeScript types are correct
- **Fix**: Check type definitions match API
- **Fix**: Review type imports
- **Fix**: Ensure types are exported correctly

## Verification Checklist

After Phase 6 is complete:

- [ ] UI renders correctly in browser
- [ ] WebSocket connection established
- [ ] Real-time updates work (alerts, vehicles)
- [ ] Map displays vehicles correctly
- [ ] Alert list shows alerts
- [ ] Vehicle detail panel works
- [ ] Incident panel displays evidence
- [ ] Action buttons work (acknowledge, resolve)
- [ ] Demo mode works
- [ ] Responsive design works
- [ ] Error handling works
- [ ] Loading states display correctly
- [ ] TypeScript types are correct
- [ ] Production build succeeds

## Next Steps

After Phase 6 is complete:
1. Full-stack system is operational
2. Operator dashboard is functional
3. Real-time updates work
4. All features are implemented

**System is ready for**:
- End-to-end testing
- Demo preparation
- Performance optimization
- Production deployment considerations

