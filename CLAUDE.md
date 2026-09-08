# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Vite + React + TypeScript** application for **D3.js-based chart visualization and editing**. It serves as a DSL (Domain Specific Language) editor for visual chart specifications with a backend server for saving edited DSL files.

## Development Commands

### Core Commands
- `npm run dev` - Start Vite development server (port 5173)
- `npm run build` - Build for production (`tsc && vite build`)
- `npm run lint` - Run ESLint
- `npm run preview` - Preview production build

### DSL Editor Workflow
- `npm run server` - Start the loopback API server (port 3000)
- `npm run dev:full` - **Recommended**: Start both dev server and save server concurrently

### Server Configuration
- Frontend dev server: `localhost:5173`
- Local DSL and AI API: `127.0.0.1:3000`
- Backend API server: `localhost:3000` (configured in `server.cjs`)

## Architecture Overview

### Core Technologies
- **React 19** with TypeScript
- **Vite** as build tool with Tailwind CSS v4
- **D3.js 7** for chart rendering
- **Zustand + Immer** for state management
- **RJSF (React JSON Schema Form)** for form generation
- **Shadcn UI** components built on Radix UI primitives
- **Express.js** backend for file saving

### Key Directories

#### Application Structure
- `src/pages/` - Main application pages/routes
  - `ChartV2/` - **Primary chart editor** (most active development)
  - `D3Chart/` - D3 chart wrapper components
  - `Parsing/`, `Interface/`, `Layout/`, `Form/`, `SchemaForm/` - Specialized pages
- `src/components/` - Reusable UI components
  - `ui/` - Shadcn UI components (button, card, input, etc.)
- `src/model/` - Core data models and business logic
- `src/utils/` - Utility functions (mark, link, draw, coordinate parsing)

#### Data Organization
- `src/datav3/` - **Current DSL JSON files** (version 3)
- `src/data/`, `src/datav2/` - Legacy DSL files
- `src/imagev3/` - Chart reference images
- `src/generated/` - Auto-generated files (json-files.ts)

#### Backend
- `server.cjs` - Loopback-only Express entry point for DSL saving and AI proxying
- `server/` - Atomic persistence, configuration, provider client, and API modules

## Key Architectural Patterns

### State Management
- Uses **Zustand** with **Immer** middleware for immutable state updates
- Central store in `src/pages/ChartV2/model/editor.tsx`
- Pattern: Stateful containers with Zustand, presentational components

### Chart Architecture
- **VisualChart** class (`Chart.ts`) handles DSL parsing and rendering
- **Container-based hierarchy** for chart composition
- Support for both **Cartesian** and **Polar** coordinate systems
- **Template system** for reusable chart components

### DSL Structure
- JSON-based Domain Specific Language for chart specifications
- Hierarchical container system with `container_id` and `template_id`
- Data specifications for marks, layouts, and non-layout properties
- Support for link marks (node-link diagrams)

### Build-Time Code Generation
- Vite plugin generates `json-files.ts` listing all available DSL files
- Dynamic imports for data and image loading

## Development Workflow

### DSL Editor Usage
1. Run `npm run dev:full` to start both frontend and save server
2. Access editor at `localhost:5173/editor`
3. Select DSL file from gallery or load from `datav3/` directory
4. Edit properties in the form panel
5. Click "Save" to save directly to project directory via save server

### File Saving Behavior
- Connects to the loopback API (`127.0.0.1:3000`) and atomically saves
  `src/datav3/{basic_charts|composite}/{filename}.json`
- Uses SHA-256 optimistic concurrency and offers reload or explicit force
  overwrite on conflicts
- Save server validates category, filename, JSON, symlinks, and path traversal

### API Endpoints
- `GET/PUT /api/dsl/:category/:file` - Read or atomically save a DSL file
- `GET/PUT /api/ai/config` - Read public AI config or save project-local config
- `POST /api/ai/config/test` - Test an AI provider configuration
- `POST /api/ai/chat` - Request a validated RFC 6902 Patch
- `GET /api/health` - Health check
- `POST /api/save-json` - Restricted compatibility endpoint for `datav3`

## Important Notes

### Data Locations
- **Active development**: Use files in `src/datav3/`
- **Reference images**: Stored in `src/imagev3/` with matching filenames
- **Generated code**: `src/generated/json-files.ts` is auto-generated - do not edit manually

### Component Conventions
- TypeScript interfaces in dedicated `type.ts` files
- Constants in `constant.ts` files
- Utility functions in `utils.ts` files
- CSS modules use `.module.less` extension

### State Management Conventions
- Zustand stores follow pattern: `useEditorStore` with `set` and `get` methods
- Use Immer's `produce` for immutable updates
- Selectors for derived state

### Chart Development
- Extend `VisualChart` class for new chart types
- Follow container hierarchy pattern
- Use template system for reusable components
- Coordinate systems: Cartesian (`x`, `y`) and Polar (`theta`, `radius`)

## Troubleshooting

### Save Server Issues
- Ensure `npm run save-server` is running or use `npm run dev:full`
- Check port 3000 availability
- Verify file permissions for `src/data/` directory

### Build Issues
- Generated files (`json-files.ts`) may need regeneration if data files change
- TypeScript errors often relate to missing type definitions in `src/types/`

### Chart Rendering Issues
- Check DSL JSON structure against `VisualChart` expectations
- Verify coordinate system consistency
- Ensure template references exist
