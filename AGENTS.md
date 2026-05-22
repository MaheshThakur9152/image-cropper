# Webtoon Studio

## Purpose

Desktop/Web application for processing webtoon/manhwa chapters into correctly cropped panels.

## Core Workflow

Import Chapter
↓
Run StitchToon
↓
Review Detected Panels
↓
Crop / Split / Merge
↓
Save Corrections
↓
Export Panels

## Features

- Project management
- Image folder import
- ZIP import
- StitchToon integration
- Panel review workspace
- Crop tool
- Split tool
- Merge tool
- Undo / redo
- Export corrected panels

## Excluded Features

- Video rendering
- FFmpeg
- Motion effects
- CapCut export
- Character recognition
- AI scene analysis
- TTS
- Narration generation
- Script writing

## Development Rules

- Read this file first.
- Continue unfinished work.
- Do not redesign architecture.
- Keep edits non-destructive.
- Preserve original images.
- Update progress section.

## Success Criteria

User imports a chapter.

Panels are detected.

User can fix incorrect panels.

Corrected panels can be exported.

Project is successful.

## Progress Section

- **Full-Screen Premium Crop Modal (Completed)**: Replaced the inline crop interaction with a large, full-screen overlay modal editor window.
  - Clicking the "Crop" button or double-clicking any panel image card opens a high-end glassmorphic modal with a large canvas.
  - Drag-to-crop works directly with mouse gestures on the canvas to draw coordinates.
  - Side control panel allows precise slider adjustments and manual coordinate inputs (X, Y, Width, Height).
  - Modal header includes dedicated buttons and keyboard hotkeys (Ctrl+Z, Ctrl+Y, Ctrl+D, Delete, Esc) for instant Undo, Redo, Duplicate, Delete, and Close.
- **Inline Split & Merge Interactions (Completed)**: 
  - Split mode works directly on the panel card using a modeless horizontal row-resize cursor, dividing strips instantly with a single mouse click.
  - Multiple panels can be selected via checkboxes and merged into a single vertical strip from the toolbar or sidebar.
- **Undo / Redo / Duplicate Stack (Completed)**: Fully integrated transaction-safe operations with multi-level history stack for all crop, split, merge, duplicate, and delete actions.
- **Dialogue-Free Smart Auto-Crop (Completed)**: Developed a layout analysis pipeline to identify and isolate panels from text elements.
  - Subtracted dialogue boxes from foreground mask during contour panel matching to avoid merging images and text.
  - Auto-applied largest dialogue-free crop suggestions on import.
  - Added "Auto Crop All" utility in workspace subheader for bulk panel calculations.
  - Integrated click-to-snap selection in the Crop Modal canvas to quickly choose recommendation zones.

