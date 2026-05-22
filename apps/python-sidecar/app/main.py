import asyncio
import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

app = FastAPI(title="StitchToon Slicing Service")

class SliceRequest(BaseModel):
  input_path: str = Field(..., description="Absolute path to input image file, directory, or zip")
  output_path: str = Field(..., description="Absolute path to output directory")
  method: str = Field("pixel", description="Slice detection method (pixel or direct)")
  height: int = Field(2000, description="Target slice height in pixels")
  width: Optional[int] = Field(None, description="Normalize width before processing")
  sensitivity: int = Field(90, ge=1, le=100, description="Detection accuracy (1-100)")
  max_height: int = Field(-1, description="Maximum slice height (-1 for no limit)")
  min_height: int = Field(-1, description="Minimum slice height (-1 for no limit)")
  division_factor: int = Field(1, ge=1, le=5, description="Downscale factor (1-5)")
  window: int = Field(1, ge=1, description="Consecutive rows (default 1)")
  img_format: str = Field("png", description="Output format (png, jpeg, webp)")

@app.post("/slice")
async def slice_images(req: SliceRequest):
  if not os.path.exists(req.input_path):
    raise HTTPException(status_code=400, detail=f"Input path does not exist: {req.input_path}")

  # Ensure output directory exists
  os.makedirs(req.output_path, exist_ok=True)

  # Resolve path to stitchtoon executable in the virtual environment
  venv_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
  stitchtoon_exe = os.path.join(venv_dir, ".venv", "Scripts", "stitchtoon.exe")
  if not os.path.exists(stitchtoon_exe):
    # Fallback to system path if not found in virtual environment Scripts
    stitchtoon_exe = "stitchtoon"

  # Construct command arguments
  cmd = [
    stitchtoon_exe,
    "--no-progress",
    "-f", req.img_format,
    "-m", req.method,
    "-H", str(req.height),
    "--sensitivity", str(req.sensitivity),
    "--max-height", str(req.max_height),
    "--min-height", str(req.min_height),
    "--division-factor", str(req.division_factor),
    "--window", str(req.window)
  ]

  if req.width is not None:
    cmd.extend(["--width", str(req.width)])

  # Append positional args
  cmd.extend([req.input_path, req.output_path])

  print(f"Executing StitchToon command: {' '.join(cmd)}")

  # Run stitchtoon inside a thread pool to avoid SelectorEventLoop NotImplementedError on Windows
  import subprocess

  def run_cmd():
    res = subprocess.run(cmd, capture_output=True)
    return res.returncode, res.stdout, res.stderr

  loop = asyncio.get_event_loop()
  returncode, stdout, stderr = await loop.run_in_executor(None, run_cmd)

  if returncode != 0:
    error_msg = stderr.decode().strip() or stdout.decode().strip()
    print(f"StitchToon failed with exit code {returncode}. Error: {error_msg}")
    raise HTTPException(status_code=500, detail=f"StitchToon error: {error_msg}")

  print("StitchToon slicing completed successfully.")
  return {
    "status": "success",
    "message": "Slicing completed successfully",
    "output_path": req.output_path
  }

@app.get("/health")
async def health():
  return {"status": "ok"}

from PIL import Image

class CropRequest(BaseModel):
  image_path: str
  output_path: str
  x: int
  y: int
  width: int
  height: int

@app.post("/crop")
async def crop_image(req: CropRequest):
  if not os.path.exists(req.image_path):
    raise HTTPException(status_code=400, detail=f"Image path does not exist: {req.image_path}")

  try:
    os.makedirs(os.path.dirname(req.output_path), exist_ok=True)
    with Image.open(req.image_path) as img:
      # Crop box format in Pillow: (left, upper, right, lower)
      cropped = img.crop((req.x, req.y, req.x + req.width, req.y + req.height))
      cropped.save(req.output_path)

    return {
      "status": "success",
      "message": "Image cropped successfully",
      "output_path": req.output_path,
      "width": req.width,
      "height": req.height
    }
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"Failed to crop image: {str(e)}")

class SplitRequest(BaseModel):
  image_path: str
  split_y: int
  output_dir: str

@app.post("/split")
async def split_image(req: SplitRequest):
  if not os.path.exists(req.image_path):
    raise HTTPException(status_code=400, detail=f"Image path does not exist: {req.image_path}")

  try:
    os.makedirs(req.output_dir, exist_ok=True)
    base_name = os.path.basename(req.image_path)
    name_part, ext = os.path.splitext(base_name)
    if not ext:
      ext = ".png"

    import time
    suffix = int(time.time() * 1000)
    out1_name = f"{name_part}_s1_{suffix}{ext}"
    out2_name = f"{name_part}_s2_{suffix}{ext}"

    out1_path = os.path.join(req.output_dir, out1_name)
    out2_path = os.path.join(req.output_dir, out2_name)

    with Image.open(req.image_path) as img:
      w, h = img.size
      if req.split_y <= 0 or req.split_y >= h:
        raise HTTPException(status_code=400, detail=f"Split Y ({req.split_y}) must be between 0 and image height ({h})")

      upper = img.crop((0, 0, w, req.split_y))
      lower = img.crop((0, req.split_y, w, h))

      upper.save(out1_path)
      lower.save(out2_path)

      w1, h1 = upper.size
      w2, h2 = lower.size

    return {
      "status": "success",
      "parts": [
        {"filename": out1_name, "width": w1, "height": h1},
        {"filename": out2_name, "width": w2, "height": h2}
      ]
    }
  except HTTPException:
    raise
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"Failed to split image: {str(e)}")

class MergeRequest(BaseModel):
  image_paths: list[str]
  output_path: str

@app.post("/merge")
async def merge_images(req: MergeRequest):
  if not req.image_paths:
    raise HTTPException(status_code=400, detail="No image paths provided for merge")

  for path in req.image_paths:
    if not os.path.exists(path):
      raise HTTPException(status_code=400, detail=f"Image path does not exist: {path}")

  try:
    os.makedirs(os.path.dirname(req.output_path), exist_ok=True)
    images = [Image.open(path) for path in req.image_paths]

    target_width = images[0].width
    resized_images = []
    total_height = 0

    for img in images:
      if img.width != target_width:
        scale = target_width / img.width
        new_height = int(img.height * scale)
        resample_filter = getattr(Image, "Resampling", Image).LANCZOS
        resized = img.resize((target_width, new_height), resample_filter)
        resized_images.append(resized)
        total_height += new_height
      else:
        resized_images.append(img)
        total_height += img.height

    # Create merged image
    merged_img = Image.new("RGBA" if any(img.mode == "RGBA" for img in resized_images) else "RGB", (target_width, total_height))
    current_y = 0
    for img in resized_images:
      merged_img.paste(img, (0, current_y))
      current_y += img.height

    merged_img.save(req.output_path)

    for img in images:
      img.close()

    return {
      "status": "success",
      "output_path": req.output_path,
      "width": target_width,
      "height": total_height
    }
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"Failed to merge images: {str(e)}")


def detect_panel_rects(image_path: str):
    import cv2
    import numpy as np

    img = cv2.imread(image_path)
    if img is None:
        return {"panels": [], "dialogues": [], "smart_crops": []}
    
    h, w, c = img.shape
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # 1. Background color detection
    edges = np.concatenate([
        gray[0, :],
        gray[-1, :],
        gray[:, 0],
        gray[:, -1]
    ])
    bg_val = int(np.median(edges))
    
    # 2. Foreground thresholding
    if bg_val > 128:
        _, thresh = cv2.threshold(gray, bg_val - 15, 255, cv2.THRESH_BINARY_INV)
    else:
        _, thresh = cv2.threshold(gray, bg_val + 15, 255, cv2.THRESH_BINARY)
        
    # 3. Detect character contours (candidates for text)
    contours, _ = cv2.findContours(thresh, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    text_mask = np.zeros((h, w), dtype=np.uint8)
    
    for cnt in contours:
        x, y, cw, ch = cv2.boundingRect(cnt)
        if 2 <= cw <= 60 and 4 <= ch <= 60:
            ar = cw / float(ch) if ch > 0 else 0
            if 0.1 <= ar <= 4.0:
                cv2.rectangle(text_mask, (x, y), (x + cw, y + ch), 255, -1)
                
    # 4. Group text characters into blocks (dilate horizontally and vertically)
    kernel_group = cv2.getStructuringElement(cv2.MORPH_RECT, (40, 20))
    dilated_text = cv2.dilate(text_mask, kernel_group, iterations=1)
    
    text_blocks_contours, _ = cv2.findContours(dilated_text, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    dialogues = []
    for cnt in text_blocks_contours:
        x, y, cw, ch = cv2.boundingRect(cnt)
        if cw > 15 and ch > 10:
            pad_x = 10
            pad_y = 10
            bx = max(0, x - pad_x)
            by = max(0, y - pad_y)
            bw = min(w - bx, cw + 2 * pad_x)
            bh = min(h - by, ch + 2 * pad_y)
            
            dialogues.append({
                "x": bx,
                "y": by,
                "width": bw,
                "height": bh
            })
            
    # 5. Detect panel illustration boundaries using row-wise projection on thresh
    row_counts = np.sum(thresh == 255, axis=1)
    # A row is active if it has at least 1% content pixels (e.g. 5 pixels for 500px width)
    active_rows = row_counts > (w * 0.01)
    
    raw_panels = []
    in_panel = False
    start_y = 0
    gap_count = 0
    
    for y in range(h):
        if active_rows[y]:
            if not in_panel:
                in_panel = True
                start_y = y
            gap_count = 0
        else:
            if in_panel:
                gap_count += 1
                if gap_count > 60:  # gap of > 60 pixels of background signals end of panel
                    end_y = y - gap_count
                    # Compute left/right boundaries of content in this block
                    block_thresh = thresh[start_y:end_y+1, :]
                    col_counts = np.sum(block_thresh == 255, axis=0)
                    active_cols = np.where(col_counts > 0)[0]
                    
                    if len(active_cols) > 0 and (end_y - start_y) >= 60:
                        x_start = max(0, int(active_cols[0]) - 8)
                        x_end = min(w, int(active_cols[-1]) + 8)
                        raw_panels.append({
                            "x": x_start,
                            "y": start_y,
                            "width": x_end - x_start,
                            "height": end_y - start_y
                        })
                    in_panel = False
                    gap_count = 0
                    
    # Handle end of image
    if in_panel:
        end_y = h - 1 - gap_count
        block_thresh = thresh[start_y:end_y+1, :]
        col_counts = np.sum(block_thresh == 255, axis=0)
        active_cols = np.where(col_counts > 0)[0]
        if len(active_cols) > 0 and (end_y - start_y) >= 60:
            x_start = max(0, int(active_cols[0]) - 8)
            x_end = min(w, int(active_cols[-1]) + 8)
            raw_panels.append({
                "x": x_start,
                "y": start_y,
                "width": x_end - x_start,
                "height": end_y - start_y
            })

    # Fallback if no panels were detected, or if they are all filtered out
    if not raw_panels:
        active_indices = np.where(row_counts > 2)[0]
        if len(active_indices) > 0:
            start_y = max(0, int(active_indices[0]) - 10)
            end_y = min(h - 1, int(active_indices[-1]) + 10)
            if end_y - start_y < 100:
                start_y = 0
                end_y = h - 1
        else:
            start_y = 0
            end_y = h - 1
        raw_panels.append({
            "x": 0,
            "y": start_y,
            "width": w,
            "height": end_y - start_y
        })

    # Sort from top to bottom
    raw_panels.sort(key=lambda p: p["y"])
    
    # Merge overlapping or closely adjacent panels vertically
    panels = []
    for p in raw_panels:
        if not panels:
            panels.append(p)
        else:
            prev = panels[-1]
            if p["y"] <= prev["y"] + prev["height"] + 40:
                ny = prev["y"]
                nheight = max(prev["y"] + prev["height"], p["y"] + p["height"]) - ny
                nx = min(prev["x"], p["x"])
                nwidth = max(prev["x"] + prev["width"], p["x"] + p["width"]) - nx
                panels[-1] = {
                    "x": nx,
                    "y": ny,
                    "width": nwidth,
                    "height": nheight
                }
            else:
                panels.append(p)

    # Post-process panels: if a panel width is > 80% of image width, extend it to full width
    for p in panels:
        if p["width"] > w * 0.8:
            p["x"] = 0
            p["width"] = w
                
    # 6. Calculate smart crops by adjusting panels to exclude dialogue boxes
    smart_crops = []
    for p in panels:
        crop_x = p["x"]
        crop_y = p["y"]
        crop_w = p["width"]
        crop_h = p["height"]
        
        overlapping_dialogues = []
        for d in dialogues:
            if (d["x"] < p["x"] + p["width"] and d["x"] + d["width"] > p["x"] and
                d["y"] < p["y"] + p["height"] and d["y"] + d["height"] > p["y"]):
                overlapping_dialogues.append(d)
                
        for d in overlapping_dialogues:
            # Dialogue is at the top of the panel (e.g. covers top 35% of panel)
            if d["y"] < p["y"] + p["height"] * 0.35 and d["y"] + d["height"] > p["y"]:
                new_y = d["y"] + d["height"]
                if new_y > crop_y and (p["y"] + p["height"] - new_y) >= max(150, p["height"] * 0.35):
                    crop_h = (crop_y + crop_h) - new_y
                    crop_y = new_y
            # Dialogue is at the bottom of the panel (e.g. covers bottom 35% of panel)
            elif d["y"] + d["height"] > p["y"] + p["height"] * 0.65 and d["y"] < p["y"] + p["height"]:
                new_h = d["y"] - crop_y
                if new_h >= max(150, p["height"] * 0.35):
                    crop_h = new_h
                    
        # Safety fallback: if the smart crop ended up too small, fall back to the original panel box
        if crop_h < 150 or crop_w < 150:
            crop_x = p["x"]
            crop_y = p["y"]
            crop_w = p["width"]
            crop_h = p["height"]
            
        smart_crops.append({
            "x": int(crop_x),
            "y": int(crop_y),
            "width": int(crop_w),
            "height": int(crop_h)
        })
        
    return {
        "panels": panels,
        "dialogues": dialogues,
        "smart_crops": smart_crops
    }


class DetectRequest(BaseModel):
  image_path: str

@app.post("/detect-panels")
async def detect_panels(req: DetectRequest):
  if not os.path.exists(req.image_path):
    raise HTTPException(status_code=400, detail=f"Image path does not exist: {req.image_path}")
  
  try:
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, detect_panel_rects, req.image_path)
    return {
      "status": "success",
      "panels": result["panels"],
      "dialogues": result["dialogues"],
      "smart_crops": result["smart_crops"]
    }
  except Exception as e:
    raise HTTPException(status_code=500, detail=f"Failed to detect panels: {str(e)}")


